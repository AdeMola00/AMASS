"""AMASS — Payment receipts.

One receipt is issued for every *successful* payment:
  • `topup`           — a verified Paystack / Flutterwave (or mock) card payment that
                        credited MASS or FIX to the wallet.
  • `property_access` — a MASS charge that unlocked a property.

Rules
  • Receipts are issued server-side only, after the money/token movement has
    completed and been written to the auditable ledgers (`payment_ledger`,
    `token_transactions`). Never before.
  • Exactly one receipt per (kind, reference) — enforced with a unique index, so a
    webhook retry or a double-tap can never produce two receipts.
  • Every receipt states the amount in naira AND in tokens plus the rate used
    (₦100 = 1 MASS), so the user can reconcile what they were shown before confirming.
  • A copy is emailed (Emergent managed Resend) when the user has an email; email
    failure never blocks the payment — it is recorded on the receipt and can be retried.
"""
from __future__ import annotations

import asyncio
import logging
import secrets
from datetime import datetime, timezone
from html import escape
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ASCENDING, DESCENDING
from pymongo.errors import DuplicateKeyError

logger = logging.getLogger("amass.receipts")

ReceiptKind = Literal["topup", "property_access"]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _receipt_no() -> str:
    return f"AMS-{_now():%Y%m%d}-{secrets.token_hex(3).upper()}"


async def ensure_receipt_indexes(db: AsyncIOMotorDatabase) -> None:
    await db.receipts.create_index([("receipt_no", ASCENDING)], unique=True, name="receipt_no_uniq")
    await db.receipts.create_index([("kind", ASCENDING), ("reference", ASCENDING)], unique=True, name="receipt_kind_ref_uniq")
    await db.receipts.create_index([("user_id", ASCENDING), ("created_at", DESCENDING)], name="receipt_user_created")


async def issue_receipt(
    db: AsyncIOMotorDatabase,
    *,
    user_id: str,
    kind: ReceiptKind,
    reference: str,
    amount_ngn: int,
    tokens: int,
    currency: str,
    rate_ngn: int,
    description: str,
    items: list[dict],
    provider: Optional[str] = None,
    balance_after: Optional[int] = None,
    meta: Optional[dict] = None,
) -> dict:
    """Idempotently issue (and email) a receipt. Returns the stored receipt."""
    existing = await db.receipts.find_one({"kind": kind, "reference": reference}, {"_id": 0})
    if existing:
        return existing
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "email": 1, "full_name": 1}) or {}
    doc = {
        "receipt_no": _receipt_no(),
        "kind": kind,
        "reference": reference,
        "user_id": user_id,
        "user_email": user.get("email"),
        "user_name": user.get("full_name"),
        "description": description,
        "amount_ngn": int(amount_ngn),
        "tokens": int(tokens),
        "currency": currency,
        "rate_ngn": int(rate_ngn),
        "items": items,
        "provider": provider,
        "balance_after": balance_after,
        "meta": meta or {},
        "email_status": "pending" if user.get("email") else "no_email",
        "email_id": None,
        "created_at": _now(),
    }
    try:
        await db.receipts.insert_one(dict(doc))
    except DuplicateKeyError:
        # Lost a race with a concurrent issuer for the same payment — one receipt only.
        return await db.receipts.find_one({"kind": kind, "reference": reference}, {"_id": 0}) or doc
    if user.get("email"):
        # Email copy runs in the background — the payment response never waits on the mail provider.
        asyncio.create_task(_email_receipt(db, dict(doc)))
    return doc


async def _email_receipt(db: AsyncIOMotorDatabase, doc: dict) -> Optional[str]:
    """Best-effort email copy; status recorded on the receipt, never raises."""
    from auth_security import send_email  # local import: auth_security pulls httpx/env at import time

    try:
        email_id = await send_email(
            to=doc["user_email"],
            subject=f"Your AMASS receipt {doc['receipt_no']} · ₦{int(doc['amount_ngn']):,}",
            html=receipt_html(doc),
        )
        await db.receipts.update_one({"receipt_no": doc["receipt_no"]}, {"$set": {"email_status": "sent", "email_id": email_id, "emailed_at": _now()}})
        return email_id
    except Exception as e:  # noqa: BLE001 — email must never block a payment
        logger.warning("receipt email failed for %s: %s", doc.get("receipt_no"), e)
        await db.receipts.update_one({"receipt_no": doc["receipt_no"]}, {"$set": {"email_status": "failed", "email_error": str(e)[:200]}})
        return None


def receipt_html(doc: dict) -> str:
    """Plain, link-free HTML (passes the email guardrails: no forms, no URLs)."""
    rows = "".join(
        f"<tr><td style='padding:6px 0;color:#555'>{escape(str(i.get('label', '')))}</td>"
        f"<td style='padding:6px 0;text-align:right;font-weight:600'>{escape(str(i.get('value', '')))}</td></tr>"
        for i in doc.get("items", [])
    )
    created = doc.get("created_at")
    when = created.strftime("%d %b %Y, %H:%M UTC") if isinstance(created, datetime) else str(created or "")
    kind_label = "Property access" if doc.get("kind") == "property_access" else "Wallet top-up"
    return f"""
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#111">
  <h2 style="margin:0 0 4px">AMASS receipt</h2>
  <p style="margin:0 0 16px;color:#555">{escape(kind_label)} · {escape(when)}</p>
  <p style="margin:0 0 16px;font-size:28px;font-weight:800">₦{int(doc.get('amount_ngn', 0)):,}
     <span style="font-size:15px;font-weight:600;color:#555">= {int(doc.get('tokens', 0)):,} {escape(str(doc.get('currency', 'MASS')))}</span></p>
  <table style="width:100%;border-collapse:collapse;font-size:14px">
    <tr><td style="padding:6px 0;color:#555">Receipt no.</td><td style="padding:6px 0;text-align:right;font-weight:600">{escape(str(doc.get('receipt_no', '')))}</td></tr>
    <tr><td style="padding:6px 0;color:#555">Reference</td><td style="padding:6px 0;text-align:right;font-weight:600">{escape(str(doc.get('reference', '')))}</td></tr>
    <tr><td style="padding:6px 0;color:#555">Description</td><td style="padding:6px 0;text-align:right;font-weight:600">{escape(str(doc.get('description', '')))}</td></tr>
    {rows}
    <tr><td style="padding:6px 0;color:#555">Rate</td><td style="padding:6px 0;text-align:right;font-weight:600">₦{int(doc.get('rate_ngn', 100)):,} = 1 {escape(str(doc.get('currency', 'MASS')))}</td></tr>
    {f"<tr><td style='padding:6px 0;color:#555'>Paid via</td><td style='padding:6px 0;text-align:right;font-weight:600'>{escape(str(doc.get('provider')).title())}</td></tr>" if doc.get('provider') else ''}
    {f"<tr><td style='padding:6px 0;color:#555'>Balance after</td><td style='padding:6px 0;text-align:right;font-weight:600'>{int(doc['balance_after']):,} {escape(str(doc.get('currency', 'MASS')))}</td></tr>" if doc.get('balance_after') is not None else ''}
  </table>
  <p style="margin:20px 0 0;font-size:12px;color:#888">This receipt was generated by AMASS after the payment was verified. Keep it for your records. If you did not make this payment, contact support from the Help screen in the app.</p>
</div>
"""


def register_receipt_routes(db: AsyncIOMotorDatabase, get_current_user) -> APIRouter:
    router = APIRouter(prefix="/api/receipts", tags=["receipts"])

    @router.get("")
    async def list_receipts(limit: int = 50, user: dict = Depends(get_current_user)):
        limit = max(1, min(int(limit), 200))
        items = await db.receipts.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", DESCENDING).to_list(limit)
        return {"items": items, "count": len(items)}

    @router.get("/{receipt_no}")
    async def get_receipt(receipt_no: str, user: dict = Depends(get_current_user)):
        doc = await db.receipts.find_one({"receipt_no": receipt_no}, {"_id": 0})
        if not doc or (doc["user_id"] != user["id"] and not user.get("is_admin")):
            raise HTTPException(404, "Receipt not found")
        return doc

    @router.post("/{receipt_no}/email")
    async def email_receipt(receipt_no: str, user: dict = Depends(get_current_user)):
        """Re-send the receipt copy to the account email (owner only)."""
        doc = await db.receipts.find_one({"receipt_no": receipt_no, "user_id": user["id"]}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Receipt not found")
        email = user.get("email")
        if not email:
            raise HTTPException(400, "Add an email address to your profile to receive receipts")
        doc["user_email"] = email
        email_id = await _email_receipt(db, doc)
        if not email_id:
            raise HTTPException(503, "Couldn't send the email right now — try again shortly")
        return {"ok": True, "email_id": email_id}

    return router
