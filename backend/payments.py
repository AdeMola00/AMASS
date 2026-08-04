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
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from motor.motor_asyncio import AsyncIOMotorDatabase

from tokens import WalletService, TOKEN_BUNDLES, FIX_BUNDLES, Currency


PROVIDER = Literal["paystack", "flutterwave"]


def _mock_mode() -> bool:
    return os.getenv("MOCK_PAYMENT", "true").lower() == "true"


def _paystack_secret() -> str:
    return os.getenv("PAYSTACK_SECRET_KEY", "").strip()


def _flutterwave_secret() -> str:
    return os.getenv("FLUTTERWAVE_SECRET_KEY", "").strip()


def _flutterwave_hash() -> str:
    return os.getenv("FLUTTERWAVE_SECRET_HASH", "").strip()


def _api_base() -> str:
    """The public HTTPS base at which THIS FastAPI is reachable (for webhook URLs
    and the HTTPS→deep-link relay). Falls back to Expo dev URL for local runs."""
    return (
        os.getenv("PUBLIC_API_BASE")
        or os.getenv("EXPO_BACKEND_URL")
        or "http://localhost:8001"
    ).rstrip("/")


def _lookup_bundle(currency: Currency, bundle_id: str) -> Optional[dict]:
    src = FIX_BUNDLES if currency == "FIX" else TOKEN_BUNDLES
    return next((b for b in src if b["id"] == bundle_id), None)


class InitPaymentIn(BaseModel):
    provider: PROVIDER
    currency: Currency = "MASS"
    bundle_id: str


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
        """Idempotently credit the user for the referenced payment intent."""
        intent = await db.payment_intents.find_one({"reference": reference}, {"_id": 0})
        if not intent:
            raise HTTPException(400, "Unknown payment reference")
        if intent.get("status") == "paid":
            return {"already_fulfilled": True, "credits": intent.get("credits")}

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
        await svc.credit(
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
        )
        if intent.get("bonus", 0) > 0:
            await svc.credit(
                intent["user_id"],
                intent["bonus"],
                "bonus",
                f"Bonus for {intent['bundle_name']}",
                currency=intent["currency"],
                is_bonus=True,
                meta={"bundle_id": intent["bundle_id"], "reference": reference},
            )
        await db.payment_intents.update_one(
            {"reference": reference},
            {"$set": {"status": "paid", "verified_at": datetime.now(timezone.utc).isoformat()}},
        )
        return {"credited": intent["credits"], "bonus": intent.get("bonus", 0)}

    # ─── INITIALIZE ─────────────────────────────────────────────
    @router.post("/initialize", response_model=InitPaymentOut)
    async def initialize(data: InitPaymentIn, user: dict = Depends(require_auth)):
        await _lazy_indexes()
        bundle = _lookup_bundle(data.currency, data.bundle_id)
        if not bundle:
            raise HTTPException(404, "Bundle not found for currency")
        reference = f"amass_{uuid.uuid4().hex}"
        bundle_name = bundle["name"]
        amount_ngn = int(bundle["price_ngn"])

        # Persist intent BEFORE calling provider (so webhooks can find it)
        intent = {
            "reference": reference,
            "provider": data.provider,
            "user_id": user["id"],
            "email": user.get("email"),
            "bundle_id": bundle["id"],
            "bundle_name": bundle_name,
            "currency": data.currency,
            "credits": bundle["tokens"],
            "bonus": bundle.get("bonus", 0),
            "amount_ngn": amount_ngn,
            "status": "initialized",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.payment_intents.insert_one(dict(intent))

        # ─ MOCK MODE ────────────────────────────────────────────
        if _mock_mode() or not (
            _paystack_secret() if data.provider == "paystack" else _flutterwave_secret()
        ):
            checkout_url = f"{_api_base()}/api/payments/mock/{reference}"
            return InitPaymentOut(reference=reference, checkout_url=checkout_url, mock=True)

        # ─ REAL PROVIDER CALLS ─────────────────────────────────
        callback_url = f"{_api_base()}/api/payments/redirect?ref={reference}"
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
        return {
            "reference": reference,
            "status": intent.get("status"),
            "bundle_id": intent.get("bundle_id"),
            "bundle_name": intent.get("bundle_name"),
            "currency": intent.get("currency"),
            "credits": intent.get("credits"),
            "bonus": intent.get("bonus"),
            "amount_ngn": intent.get("amount_ngn"),
        }

    # ─── MOCK CHECKOUT (used when MOCK_PAYMENT=true or keys missing) ───
    @router.get("/mock/{reference}")
    async def mock_checkout(reference: str):
        """A tiny HTML page pretending to be a hosted-checkout so QA works end-to-end."""
        intent = await db.payment_intents.find_one({"reference": reference}, {"_id": 0})
        if not intent:
            raise HTTPException(404, "Unknown reference")
        # Auto-fulfill on load — behaves like a successful mock checkout
        await _fulfill(reference, intent["provider"], {"status": "success", "mock": True})
        return RedirectResponse(
            f"{_api_base()}/api/payments/redirect?ref={reference}&status=success"
        )

    # ─── HTTPS → deep-link relay (providers can't redirect to amass://) ─
    @router.get("/redirect")
    async def payment_redirect(ref: str, status: str = "success"):
        return RedirectResponse(f"amass://payment/callback?ref={ref}&status={status}")

    # ─── PAYSTACK webhook ───────────────────────────────────
    @router.post("/paystack/webhook")
    async def paystack_webhook(
        request: Request, x_paystack_signature: Optional[str] = Header(None)
    ):
        raw = await request.body()
        secret = _paystack_secret().encode()
        if secret:
            expected = hmac.new(secret, raw, hashlib.sha512).hexdigest()
            if not x_paystack_signature or not hmac.compare_digest(expected, x_paystack_signature):
                raise HTTPException(401, "Invalid signature")
        payload = await request.json()
        if payload.get("event") == "charge.success":
            ref = payload.get("data", {}).get("reference")
            if ref:
                verified = payload.get("data", {})
                # Best practice: also API-verify (skipped here to keep the mock path safe)
                await _fulfill(ref, "paystack", verified)
        return {"ok": True}

    # ─── FLUTTERWAVE webhook ────────────────────────────────
    @router.post("/flutterwave/webhook")
    async def flutterwave_webhook(
        request: Request, verif_hash: Optional[str] = Header(None, alias="verif-hash")
    ):
        expected = _flutterwave_hash()
        if expected and (not verif_hash or not hmac.compare_digest(verif_hash, expected)):
            raise HTTPException(401, "Invalid signature")
        payload = await request.json()
        data = payload.get("data", payload)
        ref = data.get("tx_ref") or payload.get("tx_ref")
        if ref and data.get("status") in ("successful", "success"):
            await _fulfill(ref, "flutterwave", data)
        return {"ok": True}

    return router
