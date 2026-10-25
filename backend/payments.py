"""AMASS Real Payment Integration — Paystack + Flutterwave.

Design principles (playbook‑aligned):
  • Server owns the bundle catalog (client only sends bundle_id + provider)
  • MOCK_PAYMENT=true short-circuits with an instant success and credits tokens
    so the flow works end-to-end even without live API keys
  • Real path: server calls provider `initialize` / `payments`, returns
    a hosted-checkout URL; webhook verifies signature → API verify → credit
    via WalletService (idempotent via unique reference in `payment_ledger`)
  • Callback deep-link uses `amass://payment/callback?ref=…&status=…`
"""
from __future__ import annotations

import hashlib
import hmac
import os
import uuid
from datetime import datetime, timezone
from typing import Literal, Optional

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel
from motor.motor_asyncio import AsyncIOMotorDatabase

from tokens import WalletService, TOKEN_BUNDLES, Currency, tier_bonus_for


PROVIDER = Literal["paystack", "flutterwave"]


def _mock_mode() -> bool:
    return os.getenv("MOCK_PAYMENT", "true").lower() == "true"


def _paystack_secret() -> str:
    return os.getenv("PAYSTACK_SECRET_KEY", "").strip()


def _flutterwave_secret() -> str:
    return os.getenv("FLUTTERWAVE_SECRET_KEY", "").strip()


def _flutterwave_hash() -> str:
    return os.getenv("FLUTTERWAVE_SECRET_HASH", "").strip()


def _api_base(request: Optional[Request] = None) -> str:
    """The public HTTPS base at which THIS FastAPI is reachable (for webhook URLs
    and the HTTPS→deep-link relay).

    Order: PUBLIC_API_BASE / EXPO_BACKEND_URL env → the public origin of the current request
    (ingress forwards X-Forwarded-Proto/Host, so preview and production forks both resolve
    without any hard-coded URL) → http://localhost only when explicitly mocking payments."""
    base = (os.getenv("PUBLIC_API_BASE") or os.getenv("EXPO_BACKEND_URL") or "").strip()
    if not base and request is not None:
        proto = (request.headers.get("x-forwarded-proto") or request.url.scheme or "https").split(",")[0].strip()
        host = (request.headers.get("x-forwarded-host") or request.headers.get("host") or "").split(",")[0].strip()
        if host and not host.startswith(("localhost", "127.0.0.1", "0.0.0.0")):
            base = f"{proto}://{host}"
    if not base:
        # Only accept an http fallback when explicitly mocking payments locally.
        if os.getenv("MOCK_PAYMENT", "false").lower() == "true":
            base = "http://localhost:8001"
        else:
            raise RuntimeError(
                "PUBLIC_API_BASE or EXPO_BACKEND_URL must be set for live "
                "payments (webhook + callback rely on it)."
            )
    return base.rstrip("/")


def _lookup_bundle(currency: Currency, bundle_id: str) -> Optional[dict]:
    if currency != "MASS":
        raise HTTPException(422, "Only MASS can be purchased — FIXA is free")
    src = TOKEN_BUNDLES
    return next((b for b in src if b["id"] == bundle_id), None)


def paystack_signature_ok(secret: str, raw_body: bytes, signature: Optional[str]) -> bool:
    """Paystack signs the raw body with HMAC-SHA512 of the secret key (x-paystack-signature)."""
    if not secret or not signature:
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha512).hexdigest()
    return hmac.compare_digest(expected, signature.strip())


def payload_matches_intent(provider: str, verified: dict, intent: dict) -> bool:
    """A payment only counts if the provider-confirmed amount/currency equal what we asked for."""
    status = str(verified.get("status", "")).lower()
    if status not in ("success", "successful"):
        return False
    if verified.get("mock"):
        return True
    currency = str(verified.get("currency") or "NGN").upper()
    if currency != "NGN":
        return False
    try:
        amount = float(verified.get("amount", 0))
    except (TypeError, ValueError):
        return False
    expected_ngn = int(intent["amount_ngn"])
    if provider == "paystack":
        return int(round(amount)) == expected_ngn * 100  # kobo
    return int(round(amount)) == expected_ngn


async def verify_with_provider(provider: str, reference: str) -> dict:
    """Server-to-server confirmation — the only thing we trust besides a signed webhook."""
    async with httpx.AsyncClient(timeout=20) as x:
        if provider == "paystack":
            r = await x.get(f"https://api.paystack.co/transaction/verify/{reference}", headers={"Authorization": f"Bearer {_paystack_secret()}"})
            body = r.json()
            if r.status_code >= 400 or not body.get("status"):
                raise HTTPException(502, f"Paystack verify failed: {body.get('message', r.status_code)}")
            return body.get("data") or {}
        r = await x.get(
            "https://api.flutterwave.com/v3/transactions/verify_by_reference",
            params={"tx_ref": reference},
            headers={"Authorization": f"Bearer {_flutterwave_secret()}"},
        )
        body = r.json()
        if r.status_code >= 400 or body.get("status") != "success":
            raise HTTPException(502, f"Flutterwave verify failed: {body.get('message', r.status_code)}")
        return body.get("data") or {}


class InitPaymentIn(BaseModel):
    provider: PROVIDER
    currency: Currency = "MASS"
    bundle_id: str
    platform: Literal["native", "web"] = "native"  # web gets an HTML "you can close this tab" return page


class InitPaymentOut(BaseModel):
    reference: str
    checkout_url: str
    mock: bool


def register_payment_routes(
    db: AsyncIOMotorDatabase,
    require_auth,  # dependency callable returning current user dict
) -> APIRouter:
    router = APIRouter(prefix="/api/payments", tags=["payments"])
    svc = WalletService(db)

    # ─── Startup: unique index guarantees idempotent crediting ───
    async def _ensure_indexes():
        try:
            await db.payment_intents.create_index("reference", unique=True)
            await db.payment_ledger.create_index("reference", unique=True)
        except Exception:
            pass

    # Fire-and-forget on module load: schedule at first request instead.
    _indexes_ready = {"done": False}

    async def _lazy_indexes():
        if not _indexes_ready["done"]:
            await _ensure_indexes()
            _indexes_ready["done"] = True

    async def _fulfill(reference: str, provider: str, verified: dict) -> dict:
        """Idempotently credit the user for the referenced payment intent.

        Only a provider-confirmed payment whose amount/currency match the intent is
        fulfilled; the ledger row is written first (unique reference) so a webhook retry,
        a callback poll and a mock reload can never credit twice."""
        intent = await db.payment_intents.find_one({"reference": reference}, {"_id": 0})
        if not intent:
            raise HTTPException(400, "Unknown payment reference")
        if intent.get("status") == "paid":
            return {"already_fulfilled": True, "credits": intent.get("credits"), "receipt_no": intent.get("receipt_no")}
        if not payload_matches_intent(provider, verified, intent):
            await db.payment_intents.update_one(
                {"reference": reference, "status": {"$ne": "paid"}},
                {"$set": {"status": "verification_failed", "verified": verified, "verified_at": datetime.now(timezone.utc).isoformat()}},
            )
            import logging
            logging.getLogger("amass.payments").warning("payment %s rejected: provider payload does not match intent", reference)
            raise HTTPException(409, "Payment could not be verified against the original amount")

        # Insert ledger row first — unique index prevents dupes on webhook retry.
        try:
            await db.payment_ledger.insert_one(
                {
                    "reference": reference,
                    "user_id": intent["user_id"],
                    "provider": provider,
                    "currency": intent["currency"],
                    "credits": intent["credits"],
                    "bonus": intent.get("bonus", 0),
                    "amount_ngn": intent["amount_ngn"],
                    "verified": verified,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }
            )
        except Exception as e:
            # Duplicate = webhook retry after already-paid ⇒ safe no-op.
            if "duplicate" in str(e).lower() or "E11000" in str(e):
                return {"already_fulfilled": True}
            raise

        # Credit tokens via WalletService
        w = await svc.credit(
            intent["user_id"],
            intent["credits"],
            "purchase",
            f"Purchased {intent['bundle_name']} — {intent['credits']} {intent['currency']}",
            currency=intent["currency"],
            meta={
                "bundle_id": intent["bundle_id"],
                "provider": provider,
                "reference": reference,
            },
            extra={"amount_ngn": intent["amount_ngn"], "reference": reference},
        )
        if intent.get("bonus", 0) > 0:
            w = await svc.credit(
                intent["user_id"],
                intent["bonus"],
                "bonus",
                f"Bonus for {intent['bundle_name']}",
                currency=intent["currency"],
                is_bonus=True,
                meta={"bundle_id": intent["bundle_id"], "reference": reference},
            )
        total = int(intent["credits"]) + int(intent.get("bonus", 0) or 0)
        balance_after = int(w["balance"] + w["bonus_balance"]) if w else None
        # Receipt — after ledger + credit are committed; one per reference.
        receipt_no = None
        try:
            from receipts import issue_receipt
            rate = max(1, int(round(int(intent["amount_ngn"]) / max(1, int(intent["credits"])))))
            rec = await issue_receipt(
                db, user_id=intent["user_id"], kind="topup", reference=reference,
                amount_ngn=int(intent["amount_ngn"]), tokens=total, currency=intent["currency"], rate_ngn=rate,
                description=f"{intent['bundle_name']} · {total} {intent['currency']}",
                items=[
                    {"label": "Bundle", "value": intent["bundle_name"]},
                    {"label": "Tokens", "value": f"{int(intent['credits']):,} {intent['currency']}" + (f" + {int(intent.get('bonus', 0)):,} bonus" if int(intent.get("bonus", 0) or 0) else "")},
                    {"label": "Paid", "value": f"₦{int(intent['amount_ngn']):,}"},
                ],
                provider=provider, balance_after=balance_after,
                meta={"bundle_id": intent["bundle_id"], "mock": bool(verified.get("mock"))},
            )
            receipt_no = rec.get("receipt_no")
            if receipt_no:
                await db.token_transactions.update_many({"user_id": intent["user_id"], "meta.reference": reference}, {"$set": {"receipt_no": receipt_no}})
        except Exception as e:  # never block fulfilment
            import logging
            logging.getLogger("amass.payments").warning("top-up receipt failed: %s", e)
        await db.payment_intents.update_one(
            {"reference": reference},
            {"$set": {"status": "paid", "receipt_no": receipt_no, "verified_at": datetime.now(timezone.utc).isoformat()}},
        )
        # Receipt in the Notification Center (webhook path — the user may be off-screen, so push is allowed).
        try:
            from notification_center import emit
            await emit(
                db, intent["user_id"], "TOPUP_RECEIPT",
                f"Receipt · {total} {intent['currency']} added",
                f"₦{int(intent['amount_ngn']):,} top-up confirmed ({intent['bundle_name']}).",
                {"reference": reference, "receipt_no": receipt_no, "amount_ngn": intent["amount_ngn"], "credits": total, "currency": intent["currency"], "provider": provider},
                action_url="/wallet",
            )
        except Exception as e:  # never block fulfilment
            import logging
            logging.getLogger("amass.payments").warning("top-up receipt notification failed: %s", e)
        return {"credited": intent["credits"], "bonus": intent.get("bonus", 0), "receipt_no": receipt_no}

    # ─── INITIALIZE ─────────────────────────────────────────────
    @router.post("/initialize", response_model=InitPaymentOut)
    async def initialize(data: InitPaymentIn, request: Request, user: dict = Depends(require_auth)):
        await _lazy_indexes()
        api_base = _api_base(request)
        bundle = _lookup_bundle(data.currency, data.bundle_id)
        if not bundle:
            raise HTTPException(404, "Bundle not found for currency")
        reference = f"amass_{uuid.uuid4().hex}"
        bundle_name = bundle["name"]
        amount_ngn = int(bundle["price_ngn"])

        # Monetization config: top-up minimum + optional bonus tiers (admin-editable).
        mcfg = ((await db.app_settings.find_one({"key": "monetization"}, {"_id": 0, "value": 1})) or {}).get("value") or {}
        min_ngn = int(mcfg.get("topup_min_ngn", 1000) or 1000)
        if amount_ngn < min_ngn:
            raise HTTPException(422, f"Minimum top-up is ₦{min_ngn:,}")
        tier_bonus = tier_bonus_for(bundle, mcfg)  # same rule the catalog disclosed

        # Persist intent BEFORE calling provider (so webhooks can find it)
        intent = {
            "reference": reference,
            "provider": data.provider,
            "platform": data.platform,
            "user_id": user["id"],
            "email": user.get("email"),
            "bundle_id": bundle["id"],
            "bundle_name": bundle_name,
            "currency": data.currency,
            "credits": bundle["tokens"],
            "bonus": int(bundle.get("bonus", 0)) + tier_bonus,
            "bonus_tier": tier_bonus,
            "amount_ngn": amount_ngn,
            "status": "initialized",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.payment_intents.insert_one(dict(intent))

        # ─ MOCK MODE ────────────────────────────────────────────
        if _mock_mode() or not (
            _paystack_secret() if data.provider == "paystack" else _flutterwave_secret()
        ):
            checkout_url = f"{api_base}/api/payments/mock/{reference}"
            return InitPaymentOut(reference=reference, checkout_url=checkout_url, mock=True)

        # ─ REAL PROVIDER CALLS ─────────────────────────────────
        callback_url = f"{api_base}/api/payments/redirect?ref={reference}"
        try:
            async with httpx.AsyncClient(timeout=20) as x:
                if data.provider == "paystack":
                    r = await x.post(
                        "https://api.paystack.co/transaction/initialize",
                        headers={"Authorization": f"Bearer {_paystack_secret()}"},
                        json={
                            "email": user.get("email") or f"{user['id']}@amass.africa",
                            "amount": amount_ngn * 100,  # kobo
                            "currency": "NGN",
                            "reference": reference,
                            "callback_url": callback_url,
                            "metadata": {"bundle_id": bundle["id"], "currency": data.currency},
                        },
                    )
                    body = r.json()
                    if r.status_code >= 400 or not body.get("status"):
                        raise HTTPException(502, f"Paystack error: {body.get('message', 'init failed')}")
                    checkout_url = body["data"]["authorization_url"]
                else:  # flutterwave
                    r = await x.post(
                        "https://api.flutterwave.com/v3/payments",
                        headers={"Authorization": f"Bearer {_flutterwave_secret()}"},
                        json={
                            "tx_ref": reference,
                            "amount": amount_ngn,
                            "currency": "NGN",
                            "redirect_url": callback_url,
                            "customer": {
                                "email": user.get("email") or f"{user['id']}@amass.africa",
                                "name": user.get("full_name", "AMASS User"),
                            },
                            "meta": {"bundle_id": bundle["id"], "currency": data.currency},
                        },
                    )
                    body = r.json()
                    if r.status_code >= 400 or body.get("status") != "success":
                        raise HTTPException(502, f"Flutterwave error: {body.get('message', 'init failed')}")
                    checkout_url = body["data"]["link"]
        except httpx.HTTPError as e:
            raise HTTPException(502, f"Payment gateway unreachable: {e}")
        return InitPaymentOut(reference=reference, checkout_url=checkout_url, mock=False)

    # ─── STATUS (mobile polls after callback) ────────────────
    @router.get("/status/{reference}")
    async def payment_status(reference: str, user: dict = Depends(require_auth)):
        intent = await db.payment_intents.find_one(
            {"reference": reference, "user_id": user["id"]}, {"_id": 0}
        )
        if not intent:
            raise HTTPException(404, "Payment not found")
        # Live providers: if the webhook hasn't landed yet, confirm server-to-server before
        # telling the client anything. The client's say-so never credits a wallet.
        if intent.get("status") == "initialized" and not _mock_mode():
            try:
                verified = await verify_with_provider(intent["provider"], reference)
                if str(verified.get("status", "")).lower() in ("success", "successful"):
                    await _fulfill(reference, intent["provider"], verified)
                    intent = await db.payment_intents.find_one({"reference": reference}, {"_id": 0}) or intent
            except HTTPException:
                pass  # still pending / provider unreachable → report current state
        return {
            "reference": reference,
            "status": intent.get("status"),
            "bundle_id": intent.get("bundle_id"),
            "bundle_name": intent.get("bundle_name"),
            "currency": intent.get("currency"),
            "credits": intent.get("credits"),
            "bonus": intent.get("bonus"),
            "amount_ngn": intent.get("amount_ngn"),
            "receipt_no": intent.get("receipt_no"),
        }

    # ─── MOCK CHECKOUT (used when MOCK_PAYMENT=true or keys missing) ───
    @router.get("/mock/{reference}")
    async def mock_checkout(reference: str, request: Request):
        """A tiny HTML page pretending to be a hosted-checkout so QA works end-to-end."""
        if not _mock_mode() and (_paystack_secret() or _flutterwave_secret()):
            raise HTTPException(404, "Mock checkout is disabled when live payments are configured")
        intent = await db.payment_intents.find_one({"reference": reference}, {"_id": 0})
        if not intent:
            raise HTTPException(404, "Unknown reference")
        # Auto-fulfill on load — behaves like a successful mock checkout
        await _fulfill(reference, intent["provider"], {"status": "success", "mock": True})
        return RedirectResponse(
            f"{_api_base(request)}/api/payments/redirect?ref={reference}&status=success"
        )

    # ─── HTTPS → deep-link relay (providers can't redirect to amass://) ─
    @router.get("/redirect")
    async def payment_redirect(ref: str, status: str = "success"):
        deep_link = f"amass://payment/callback?ref={ref}&status={status}"
        intent = await db.payment_intents.find_one({"reference": ref}, {"_id": 0, "platform": 1})
        if (intent or {}).get("platform") != "web":
            return RedirectResponse(deep_link)
        # Web checkout runs in a popup/tab: there is no app scheme to return to. The app is
        # already polling the server for the verified status, so this page just closes itself.
        ok = status == "success"
        html = f"""<!doctype html><html><head><meta charset="utf-8"><title>AMASS payment</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#FAF7F2;color:#111}}
.card{{text-align:center;padding:32px;max-width:360px}}h1{{font-size:22px;margin:0 0 8px}}p{{color:#555;margin:0}}</style></head>
<body><div class="card"><h1>{'Payment received' if ok else 'Payment not completed'}</h1>
<p>{'You can close this tab and return to AMASS — your wallet updates automatically.' if ok else 'Nothing was charged. Close this tab to return to AMASS.'}</p></div>
<script>setTimeout(function(){{ try {{ window.close(); }} catch (e) {{}} }}, 1200);</script></body></html>"""
        return HTMLResponse(html)

    async def _fulfill_agent_subscription(reference: str, provider: str) -> dict:
        """Activate an agent subscription when the payment provider webhook
        confirms `agentsub_*` references. Idempotent — safe on webhook retry.
        The heavy lifting lives in agent_platform._finalize_subscription; we
        just look up the pending record and hand it over."""
        pending = await db.pending_agent_subscriptions.find_one(
            {"reference": reference}, {"_id": 0}
        )
        if not pending:
            return {"ok": False, "reason": "unknown_reference"}
        # Late import to avoid circular; the hook is stashed on module load.
        import agent_platform as _ap
        finalize = getattr(_ap, "_FINALIZE_SUBSCRIPTION", None)
        if finalize is None:
            return {"ok": False, "reason": "finalize_hook_missing"}
        try:
            return await finalize(pending)
        except Exception as e:
            return {"ok": False, "error": str(e)}

    # ─── PAYSTACK webhook ───────────────────────────────────
    @router.post("/paystack/webhook")
    async def paystack_webhook(
        request: Request, x_paystack_signature: Optional[str] = Header(None)
    ):
        """Signed events only. Every event is re-verified server-to-server (live mode) and
        matched against the stored intent before a single token moves; references are
        processed once (ledger unique index) so retries are harmless."""
        raw = await request.body()
        secret = _paystack_secret()
        if not secret:
            # Without the secret the event cannot be authenticated — never process it.
            raise HTTPException(503, "Paystack webhook secret not configured")
        if not paystack_signature_ok(secret, raw, x_paystack_signature):
            raise HTTPException(401, "Invalid signature")
        try:
            payload = await request.json()
        except Exception:
            # Empty / malformed body — ack so the provider doesn't retry endlessly.
            return {"ok": True, "ignored": "empty_body"}
        if not isinstance(payload, dict):
            return {"ok": True, "ignored": "invalid_shape"}
        if payload.get("event") != "charge.success":
            return {"ok": True, "ignored": "event"}
        data = payload.get("data") or {}
        ref = data.get("reference")
        if not ref:
            return {"ok": True, "ignored": "no_reference"}
        # Route agent-subscription references to the finalize hook.
        if ref.startswith("agentsub_"):
            await _fulfill_agent_subscription(ref, "paystack")
            return {"ok": True}
        intent = await db.payment_intents.find_one({"reference": ref}, {"_id": 0, "status": 1, "provider": 1})
        if not intent:
            return {"ok": True, "ignored": "unknown_reference"}
        if intent.get("status") == "paid":
            return {"ok": True, "already_fulfilled": True}
        verified = data
        if not _mock_mode():
            try:
                verified = await verify_with_provider("paystack", ref)
            except HTTPException:
                # Provider unreachable → do not credit; Paystack retries the webhook.
                raise HTTPException(503, "Could not verify transaction with Paystack")
        try:
            await _fulfill(ref, "paystack", verified)
        except HTTPException as e:
            if e.status_code == 409:
                return {"ok": True, "rejected": "amount_mismatch"}
            raise
        return {"ok": True}

    # ─── FLUTTERWAVE webhook ────────────────────────────────
    @router.post("/flutterwave/webhook")
    async def flutterwave_webhook(
        request: Request, verif_hash: Optional[str] = Header(None, alias="verif-hash")
    ):
        expected = _flutterwave_hash()
        if not expected:
            raise HTTPException(503, "Flutterwave webhook hash not configured")
        if not verif_hash or not hmac.compare_digest(verif_hash.strip(), expected):
            raise HTTPException(401, "Invalid signature")
        try:
            payload = await request.json()
        except Exception:
            return {"ok": True, "ignored": "empty_body"}
        if not isinstance(payload, dict):
            return {"ok": True, "ignored": "invalid_shape"}
        data = payload.get("data", payload)
        ref = data.get("tx_ref") or payload.get("tx_ref")
        if not ref or data.get("status") not in ("successful", "success"):
            return {"ok": True, "ignored": "status"}
        if ref.startswith("agentsub_"):
            await _fulfill_agent_subscription(ref, "flutterwave")
            return {"ok": True}
        intent = await db.payment_intents.find_one({"reference": ref}, {"_id": 0, "status": 1})
        if not intent:
            return {"ok": True, "ignored": "unknown_reference"}
        if intent.get("status") == "paid":
            return {"ok": True, "already_fulfilled": True}
        verified = data
        if not _mock_mode():
            try:
                verified = await verify_with_provider("flutterwave", ref)
            except HTTPException:
                raise HTTPException(503, "Could not verify transaction with Flutterwave")
        try:
            await _fulfill(ref, "flutterwave", verified)
        except HTTPException as e:
            if e.status_code == 409:
                return {"ok": True, "rejected": "amount_mismatch"}
            raise
        return {"ok": True}

    return router
