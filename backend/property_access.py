"""AMASS — Two-tier property access charging.

A signed-in user pays TWO separately-disclosed fees to progressively reveal a
property. Fees, the free-AMASS rule and the repeat-access window are all
admin-configurable via the `wallet_pricing` app setting (no hard-coded
business values live here beyond safe fallbacks).

  Tier 1 — property access   → reveals BASIC property info (exact address,
                               all photos, specs, amenities, AI insights) and
                               the agent's public professional identity.
  Tier 2 — agent contact      → reveals the agent's PRIVATE direct contact
                               (phone + email). Charged separately, only after
                               the user has access and explicitly confirms.

Safeguards
  • Fee + what it unlocks is always disclosed before the charge (see the
    /access-info endpoint the UI reads for its confirm sheet).
  • No duplicate charge for the same (property, tier) inside the configured
    access window — enforced with a unique partial index + pre-check.
  • Insufficient balance → NO charge, structured 402 with the shortfall.
  • If a charge succeeds but the gated info cannot be delivered, the charge is
    automatically reversed (refund transaction) — the user is never charged
    for something we failed to hand over.
  • Every top-up / charge / refund already lands in the auditable
    `token_transactions` ledger via WalletService.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from pymongo.errors import DuplicateKeyError
from motor.motor_asyncio import AsyncIOMotorDatabase

from tokens import (
    WalletService,
    compute_token_cost,
    is_free_amass_sale,
    _current_user_id,
)
from app_settings import get_setting, DEFAULT_WALLET_PRICING

bearer = HTTPBearer(auto_error=False)

ACCESS_TIER = "access"
AGENT_TIER = "agent_contact"


# ─── Pricing helpers (admin-configurable) ──────────────────────
async def get_wallet_pricing(db: AsyncIOMotorDatabase) -> dict:
    cfg = await get_setting(db, "wallet_pricing", DEFAULT_WALLET_PRICING)
    # Merge over defaults so a partially-patched doc never misses a key.
    merged = {**DEFAULT_WALLET_PRICING, **(cfg or {})}
    return merged


def access_fee_for(pricing: dict, prop: dict) -> int:
    """MASS cost to unlock BASIC details for this property."""
    if pricing.get("free_amass_sale", True) and is_free_amass_sale(prop):
        return 0
    base = int(pricing.get("property_access_fee", 5))
    if pricing.get("use_per_property_cost", True):
        base = max(base, compute_token_cost(prop))
    return max(0, base)


def agent_contact_fee_for(pricing: dict) -> int:
    return max(0, int(pricing.get("agent_contact_fee", 10)))


async def unlock_flags(
    db: AsyncIOMotorDatabase, user_id: Optional[str], property_id: str
) -> dict:
    """Return which tiers the user currently has active for this property.

    A legacy unlock row (no `tier` field, written by the old single-unlock
    endpoint) grants BOTH tiers for backward compatibility.
    """
    if not user_id:
        return {"access": False, "agent": False, "legacy": False}
    now = datetime.now(timezone.utc)
    rows = await db.property_unlocks.find(
        {
            "user_id": user_id,
            "property_id": property_id,
            "status": {"$ne": "pending"},
            "$or": [{"expires_at": None}, {"expires_at": {"$gt": now}}],
        },
        {"_id": 0, "tier": 1},
    ).to_list(20)
    access = agent = legacy = False
    for r in rows:
        t = r.get("tier")
        if t is None:
            legacy = True
        elif t == ACCESS_TIER:
            access = True
        elif t == AGENT_TIER:
            agent = True
    return {
        "access": access or legacy,
        "agent": agent or legacy,
        "legacy": legacy,
    }


async def agent_contact_for(db: AsyncIOMotorDatabase, prop: dict) -> Optional[dict]:
    """Resolve the agent's deliverable private contact, or None if we hold none."""
    agent_id = prop.get("agent_id")
    if not agent_id:
        return None
    u = await db.users.find_one({"id": agent_id}, {"_id": 0})
    if not u:
        return None
    phone = u.get("phone")
    email = u.get("email")
    if not phone and not email:
        return None
    return {"name": u.get("full_name"), "phone": phone, "email": email}


# ─── Request models ─────────────────────────────────────────────
class AdminAdjustIn(BaseModel):
    amount: int  # positive = credit, negative = debit
    currency: str = "MASS"
    reason: str


def register_property_access_routes(
    db: AsyncIOMotorDatabase,
    get_current_user,
    require_admin,
) -> APIRouter:
    router = APIRouter(prefix="/api", tags=["property-access"])
    svc = WalletService(db)

    async def _spendable(user_id: str, currency: str = "MASS") -> int:
        w = await svc.get_or_create(user_id, currency)
        return w["balance"] + w["bonus_balance"]

    def _expiry(pricing: dict) -> Optional[datetime]:
        days = int(pricing.get("access_period_days", 0) or 0)
        if days > 0:
            return datetime.now(timezone.utc) + timedelta(days=days)
        return None

    # ─── Public: pricing + policy (non-sensitive, read-only) ────
    @router.get("/settings/pricing")
    async def public_pricing():
        pricing = await get_wallet_pricing(db)
        return {
            "property_access_fee": int(pricing.get("property_access_fee", 5)),
            "agent_contact_fee": int(pricing.get("agent_contact_fee", 10)),
            "access_period_days": int(pricing.get("access_period_days", 0) or 0),
            "currency": pricing.get("currency", "MASS"),
            "privacy_policy_url": pricing.get("privacy_policy_url", ""),
            "free_amass_sale": bool(pricing.get("free_amass_sale", True)),
        }

    # ─── Access info for the confirm sheet ──────────────────────
    @router.get("/properties/{property_id}/access-info")
    async def access_info(
        property_id: str,
        creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    ):
        prop = await db.properties.find_one({"id": property_id}, {"_id": 0})
        if not prop:
            raise HTTPException(404, "Property not found")
        user_id: Optional[str] = None
        if creds:
            try:
                user_id = await _current_user_id(creds)
            except HTTPException:
                user_id = None
        pricing = await get_wallet_pricing(db)
        is_free = pricing.get("free_amass_sale", True) and is_free_amass_sale(prop)
        flags = await unlock_flags(db, user_id, property_id)
        contact = await agent_contact_for(db, prop)
        balance = await _spendable(user_id) if user_id else 0
        return {
            "property_id": property_id,
            "is_free": is_free,
            "currency": pricing.get("currency", "MASS"),
            "access_period_days": int(pricing.get("access_period_days", 0) or 0),
            "balance": balance,
            "access": {
                "unlocked": is_free or flags["access"],
                "fee": access_fee_for(pricing, prop),
            },
            "agent_contact": {
                "unlocked": flags["agent"],
                "fee": agent_contact_fee_for(pricing),
                "available": contact is not None,
            },
        }

    # ─── Tier 1: pay to reveal BASIC property details ───────────
    @router.post("/properties/{property_id}/access")
    async def unlock_access(
        property_id: str,
        user: dict = Depends(get_current_user),
    ):
        prop = await db.properties.find_one({"id": property_id}, {"_id": 0})
        if not prop:
            raise HTTPException(404, "Property not found")
        user_id = user["id"]
        pricing = await get_wallet_pricing(db)

        # Already have it (or legacy full unlock)?
        flags = await unlock_flags(db, user_id, property_id)
        if flags["access"]:
            return {"ok": True, "already_unlocked": True, "tier": ACCESS_TIER, "tokens_paid": 0}

        is_free = pricing.get("free_amass_sale", True) and is_free_amass_sale(prop)
        cost = 0 if is_free else access_fee_for(pricing, prop)

        # Reserve the unlock row first (unique index blocks a double-tap race).
        now = datetime.now(timezone.utc)
        try:
            await db.property_unlocks.insert_one(
                {
                    "user_id": user_id,
                    "property_id": property_id,
                    "tier": ACCESS_TIER,
                    "status": "pending",
                    "tokens_paid": 0,
                    "expires_at": None,
                    "created_at": now,
                }
            )
        except DuplicateKeyError:
            return {"ok": True, "already_unlocked": True, "tier": ACCESS_TIER, "tokens_paid": 0}

        if cost > 0:
            try:
                w = await svc.debit(
                    user_id, cost, "spend_unlock",
                    f"Property access — {prop.get('title', '')}",
                    meta={"property_id": property_id, "tier": ACCESS_TIER, "cost": cost},
                )
            except HTTPException as e:
                # Roll back the reservation so the user can retry after topping up.
                await db.property_unlocks.delete_one(
                    {"user_id": user_id, "property_id": property_id, "tier": ACCESS_TIER, "status": "pending"}
                )
                if e.status_code == 402:
                    bal = await _spendable(user_id)
                    raise HTTPException(402, {
                        "error": "insufficient_tokens",
                        "required": cost,
                        "balance": bal,
                        "shortfall": cost - bal,
                    })
                raise
            balance_after = w["balance"] + w["bonus_balance"]
        else:
            balance_after = await _spendable(user_id)

        await db.property_unlocks.update_one(
            {"user_id": user_id, "property_id": property_id, "tier": ACCESS_TIER},
            {"$set": {"status": "paid", "tokens_paid": cost, "expires_at": _expiry(pricing), "paid_at": now}},
        )
        return {
            "ok": True,
            "tier": ACCESS_TIER,
            "free": is_free,
            "tokens_paid": cost,
            "balance": balance_after,
        }

    # ─── Tier 2: pay to reveal agent PRIVATE contact ────────────
    @router.post("/properties/{property_id}/reveal-agent")
    async def reveal_agent(
        property_id: str,
        user: dict = Depends(get_current_user),
    ):
        prop = await db.properties.find_one({"id": property_id}, {"_id": 0})
        if not prop:
            raise HTTPException(404, "Property not found")
        user_id = user["id"]
        pricing = await get_wallet_pricing(db)
        flags = await unlock_flags(db, user_id, property_id)
        is_free = pricing.get("free_amass_sale", True) and is_free_amass_sale(prop)

        # Must have basic access first.
        if not (is_free or flags["access"]):
            raise HTTPException(403, {
                "error": "access_required",
                "message": "Unlock the property details first before revealing agent contact.",
            })

        # Already revealed?
        if flags["agent"]:
            contact = await agent_contact_for(db, prop)
            return {"ok": True, "already_unlocked": True, "tier": AGENT_TIER, "tokens_paid": 0, "contact": contact}

        # Pre-check deliverability — never charge for contact we don't hold.
        contact = await agent_contact_for(db, prop)
        if not contact:
            raise HTTPException(422, {
                "error": "contact_unavailable",
                "message": "This listing has no direct contact on file. Use in-app chat to reach the agent.",
            })

        cost = agent_contact_fee_for(pricing)
        now = datetime.now(timezone.utc)
        try:
            await db.property_unlocks.insert_one(
                {
                    "user_id": user_id,
                    "property_id": property_id,
                    "tier": AGENT_TIER,
                    "status": "pending",
                    "tokens_paid": 0,
                    "expires_at": None,
                    "created_at": now,
                }
            )
        except DuplicateKeyError:
            return {"ok": True, "already_unlocked": True, "tier": AGENT_TIER, "tokens_paid": 0, "contact": contact}

        balance_after = await _spendable(user_id)
        if cost > 0:
            try:
                w = await svc.debit(
                    user_id, cost, "spend_unlock",
                    f"Agent contact — {prop.get('title', '')}",
                    meta={"property_id": property_id, "tier": AGENT_TIER, "cost": cost},
                )
            except HTTPException as e:
                await db.property_unlocks.delete_one(
                    {"user_id": user_id, "property_id": property_id, "tier": AGENT_TIER, "status": "pending"}
                )
                if e.status_code == 402:
                    bal = await _spendable(user_id)
                    raise HTTPException(402, {
                        "error": "insufficient_tokens",
                        "required": cost,
                        "balance": bal,
                        "shortfall": cost - bal,
                    })
                raise
            balance_after = w["balance"] + w["bonus_balance"]

        # Post-charge delivery check — if the contact vanished, reverse the charge.
        contact = await agent_contact_for(db, prop)
        if not contact:
            if cost > 0:
                await svc.credit(
                    user_id, cost, "refund",
                    f"Refund — agent contact unavailable ({prop.get('title', '')})",
                    meta={"property_id": property_id, "tier": AGENT_TIER, "auto_reversal": True},
                )
            await db.property_unlocks.delete_one(
                {"user_id": user_id, "property_id": property_id, "tier": AGENT_TIER}
            )
            raise HTTPException(422, {
                "error": "contact_unavailable",
                "refunded": cost,
                "message": "Agent contact could not be delivered. Your tokens were refunded.",
            })

        await db.property_unlocks.update_one(
            {"user_id": user_id, "property_id": property_id, "tier": AGENT_TIER},
            {"$set": {"status": "paid", "tokens_paid": cost, "expires_at": _expiry(pricing), "paid_at": now}},
        )
        return {
            "ok": True,
            "tier": AGENT_TIER,
            "tokens_paid": cost,
            "balance": balance_after,
            "contact": contact,
        }

    # ─── Admin: wallet ledger review ────────────────────────────
    @router.get("/admin/wallet/transactions")
    async def admin_wallet_transactions(
        user_id: Optional[str] = None,
        kind: Optional[str] = None,
        currency: Optional[str] = None,
        limit: int = 100,
        _admin: dict = Depends(require_admin),
    ):
        query: dict = {}
        if user_id:
            query["user_id"] = user_id
        if kind:
            query["kind"] = kind
        if currency:
            query["currency"] = currency
        limit = max(1, min(limit, 500))
        docs = (
            await db.token_transactions.find(query, {"_id": 0})
            .sort("created_at", -1)
            .limit(limit)
            .to_list(limit)
        )
        # Join user email/name for display.
        uids = list({d["user_id"] for d in docs})
        users = await db.users.find(
            {"id": {"$in": uids}}, {"_id": 0, "id": 1, "email": 1, "full_name": 1}
        ).to_list(len(uids) or 1)
        umap = {u["id"]: u for u in users}
        for d in docs:
            d.setdefault("currency", "MASS")
            u = umap.get(d["user_id"]) or {}
            d["user_email"] = u.get("email")
            d["user_name"] = u.get("full_name")
        return {"items": docs, "count": len(docs)}

    @router.post("/admin/wallet/{user_id}/adjust")
    async def admin_wallet_adjust(
        user_id: str,
        data: AdminAdjustIn,
        admin: dict = Depends(require_admin),
    ):
        if data.amount == 0:
            raise HTTPException(400, "amount must be non-zero")
        target = await db.users.find_one({"id": user_id}, {"_id": 0, "id": 1})
        if not target:
            raise HTTPException(404, "User not found")
        currency = "FIX" if (data.currency or "MASS").upper() == "FIX" else "MASS"
        reason = (data.reason or "Admin adjustment").strip()[:200]
        meta = {"admin_id": admin["id"], "reason": reason, "manual": True}
        if data.amount > 0:
            w = await svc.credit(user_id, data.amount, "adjustment", f"Admin credit — {reason}",
                                  currency=currency, meta=meta)
        else:
            try:
                w = await svc.debit(user_id, abs(data.amount), "adjustment", f"Admin debit — {reason}",
                                    currency=currency, meta=meta)
            except HTTPException as e:
                if e.status_code == 402:
                    raise HTTPException(402, "User balance too low for this debit")
                raise
        return {
            "ok": True,
            "user_id": user_id,
            "currency": currency,
            "amount": data.amount,
            "balance": w["balance"] + w["bonus_balance"],
        }

    return router
