"""
AMASS token economy — MASS only.

  • MASS — spent by users to unlock property details, browse the map (1 MASS / hour) and buy subscriptions.
    Purchasable via Paystack/Flutterwave. ₦100 = 1 MASS.
  • FIX was retired in Jun 2026: FIXA (home-service providers) is free to browse, contact and book. The
    `currency` field stays on wallets/transactions so the historical ledger still reads correctly.

MOCKED payment gateway: purchases succeed instantly. Real Paystack/Flutterwave
wiring will plug into the /confirm handlers when API keys are available.
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import List, Literal, Optional

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field

from motor.motor_asyncio import AsyncIOMotorDatabase

router = APIRouter(prefix="/api", tags=["tokens"])
bearer = HTTPBearer(auto_error=False)

JWT_SECRET = os.environ.get("JWT_SECRET")
if not JWT_SECRET or len(JWT_SECRET) < 24:
    raise RuntimeError("JWT_SECRET is missing or too weak (see backend/.env)")
JWT_ALG = "HS256"

# ─── Currency ──────────────────────────────────────────────────
Currency = Literal["MASS", "FIX"]
MASS: Currency = "MASS"
FIX: Currency = "FIX"


# ─── Static configuration (admin-configurable later) ────────────
# Property token cost defaults by category & tier (MASS)
DEFAULT_TOKEN_COSTS = {
    "basic": 5,
    "premium": 10,
    "luxury": 20,
    "land": 15,
    "commercial": 25,
}


def is_free_amass_sale(prop: dict) -> bool:
    """AMASS refined rule: FREE only if listed BY AMASS AND for sale.
    Everything else (rent, shortlet, lease, land, commercial, agent/owner/developer
    listings) requires tokens — regardless of whether it's flagged 'exclusive'.
    """
    listed_by_amass = (
        bool(prop.get("is_amass_exclusive"))
        or prop.get("listing_source") == "amass"
        or prop.get("listed_by") == "amass"
    )
    listing_type = (prop.get("listing_type") or "").lower()
    return listed_by_amass and listing_type == "buy"


def compute_token_cost(prop: dict) -> int:
    """Determine token cost for a property based on its type and status.

    New AMASS rule: only AMASS-listed SALE properties are free. All rentals,
    short-lets, leases, land, commercial and non-AMASS listings cost tokens.
    """
    if is_free_amass_sale(prop):
        return 0
    if prop.get("token_cost"):
        return int(prop["token_cost"])
    ptype = prop.get("property_type", "")
    status = prop.get("status", "")
    listing_type = (prop.get("listing_type") or "").lower()
    # Short-let and lease should sit between rent and premium.
    if listing_type in ("shortlet", "lease"):
        return DEFAULT_TOKEN_COSTS["premium"]
    if ptype == "land":
        return DEFAULT_TOKEN_COSTS["land"]
    if ptype == "commercial":
        return DEFAULT_TOKEN_COSTS["commercial"]
    if status == "premium" or prop.get("price", 0) >= 300_000_000:
        return DEFAULT_TOKEN_COSTS["luxury"]
    if prop.get("verified") or prop.get("price", 0) >= 100_000_000:
        return DEFAULT_TOKEN_COSTS["premium"]
    return DEFAULT_TOKEN_COSTS["basic"]


# ─── MASS bundles — ₦100 = 1 MASS (the sole property-access currency) ───
# Naira price points are fixed; MASS = price ÷ 100. Bonus MASS is a small loyalty extra.
TOKEN_BUNDLES = [
    {"id": "starter", "name": "Starter Pack", "tokens": 5, "bonus": 0, "price_ngn": 500},
    {"id": "explorer", "name": "Explorer", "tokens": 10, "bonus": 0, "price_ngn": 1_000},
    {"id": "hunter", "name": "Property Hunter", "tokens": 25, "bonus": 1, "price_ngn": 2_500},
    {"id": "investor", "name": "Investor", "tokens": 50, "bonus": 5, "price_ngn": 5_000},
    {"id": "professional", "name": "Professional", "tokens": 100, "bonus": 15, "price_ngn": 10_000},
]

SUBSCRIPTION_PLANS = [
    {
        "id": "starter",
        "name": "Starter",
        "price_ngn": 2_500,
        "monthly_tokens": 100,
        "perks": ["100 tokens each month", "Rollover unused tokens for 90 days", "Save unlimited properties"],
    },
    {
        "id": "professional",
        "name": "Professional",
        "price_ngn": 7_500,
        "monthly_tokens": 500,
        "perks": ["500 tokens each month", "Priority customer support", "Early access to new listings", "Rollover 90 days"],
    },
    {
        "id": "business",
        "name": "Business",
        "price_ngn": 15_000,
        "monthly_tokens": 1_200,
        "perks": ["1,200 tokens each month", "Advanced analytics", "Bulk unlock discount", "Rollover 90 days"],
    },
    {
        "id": "enterprise",
        "name": "Enterprise",
        "price_ngn": 0,
        "monthly_tokens": 0,
        "perks": ["Unlimited team members", "Custom token allocation", "Dedicated account manager", "SLA support"],
    },
]

WELCOME_TOKENS = 30   # Default welcome MASS = ₦3,000 at ₦100/MASS (admin-editable: app_settings.monetization.welcome_bonus)
WELCOME_FIX = 0       # FIX retired (Jun 2026) — legacy wallets only
DEFAULT_UNLOCK_PERMANENCE_DAYS = 0  # 0 = forever


def tier_bonus_for(bundle: dict, mcfg: dict) -> int:
    """Admin top-up tier bonus (monetization.topup_bonus_tiers) for a bundle — the single
    place this is computed so the catalog shown before payment and the credit after payment agree."""
    amount_ngn = int(bundle["price_ngn"])
    tier_bonus = 0
    for tier in sorted(mcfg.get("topup_bonus_tiers") or [], key=lambda t: int(t.get("min_ngn", 0))):
        if amount_ngn >= int(tier.get("min_ngn", 0)):
            tier_bonus = int(round(int(bundle["tokens"]) * float(tier.get("bonus_pct", 0)) / 100.0))
    return tier_bonus


async def effective_bundles(db: AsyncIOMotorDatabase, include_hidden: bool = False) -> list[dict]:
    """Built-in catalogue + admin-added bundles (`token_bundles`), minus built-ins hidden from the admin portal."""
    hidden = set((((await db.runtime_state.find_one({"key": "hidden_token_bundles"}, {"_id": 0, "value": 1})) or {}).get("value")) or [])
    out = [{**b, "builtin": True, "hidden": b["id"] in hidden} for b in TOKEN_BUNDLES if include_hidden or b["id"] not in hidden]
    async for b in db.token_bundles.find({"active": {"$ne": False}}, {"_id": 0}):
        out.append({"id": b["id"], "name": b["name"], "tokens": int(b["tokens"]), "bonus": int(b.get("bonus", 0)), "price_ngn": int(b["price_ngn"]), "builtin": False, "hidden": False})
    return out


async def bundles_with_bonus(db: AsyncIOMotorDatabase, currency: str) -> list[dict]:
    """Catalog rows + `tier_bonus` and `total` (tokens + bundle bonus + tier bonus).
    Bundles under the admin top-up minimum are omitted — /payments/initialize would reject them,
    so the app must never offer them."""
    mcfg = ((await db.app_settings.find_one({"key": "monetization"}, {"_id": 0, "value": 1})) or {}).get("value") or {}
    min_ngn = int(mcfg.get("topup_min_ngn", 1000) or 1000)
    if currency.upper() != "MASS":
        return []
    src = await effective_bundles(db)
    out = []
    for b in src:
        if int(b["price_ngn"]) < min_ngn:
            continue
        tb = tier_bonus_for(b, mcfg)
        out.append({**b, "tier_bonus": tb, "total": int(b["tokens"]) + int(b.get("bonus", 0)) + tb})
    return out


# ─── Pydantic ───────────────────────────────────────────────────
TransactionKind = Literal[
    "purchase",           # bought a bundle
    "spend_unlock",       # spent to unlock a property
    "spend_feature",      # spent on a premium feature (FIX profile boost, etc.)
    "subscription_grant", # monthly grant from subscription
    "earn_reward",        # earned via task/referral/job completion
    "bonus",              # bundle bonus / promotion
    "welcome",            # signup gift
    "refund",             # admin refund
    "adjustment",         # admin manual credit/debit adjustment
    "expire",             # rollover expiry
    "transfer",           # currency transfer (future)
]


class Wallet(BaseModel):
    user_id: str
    currency: Currency = "MASS"
    balance: int = 0            # spendable tokens (excl. bonus)
    bonus_balance: int = 0      # bonus tokens (spent first)
    locked: int = 0             # reserved (e.g., pending unlock)
    lifetime_earned: int = 0
    lifetime_used: int = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    @property
    def spendable(self) -> int:
        return self.balance + self.bonus_balance


class WalletOut(BaseModel):
    currency: Currency = "MASS"
    balance: int
    bonus_balance: int
    spendable: int
    locked: int
    lifetime_earned: int
    lifetime_used: int
    subscription: Optional[dict] = None


class DualWalletOut(BaseModel):
    mass: WalletOut
    fix: WalletOut


class Transaction(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    currency: Currency = "MASS"
    kind: TransactionKind
    amount: int  # positive for credit, negative for debit
    balance_after: int
    description: str
    meta: dict = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class UnlockRecord(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    property_id: str
    tokens_paid: int
    expires_at: Optional[datetime] = None  # None = forever
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Subscription(BaseModel):
    user_id: str
    plan_id: str
    status: Literal["active", "cancelled", "expired"] = "active"
    started_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    next_renewal: datetime
    cancelled_at: Optional[datetime] = None
    provider: Optional[str] = None
    provider_ref: Optional[str] = None


class PurchaseIn(BaseModel):
    bundle_id: str
    provider: Literal["paystack", "flutterwave", "bank_transfer", "card", "mock"] = "mock"


class SubscribeIn(BaseModel):
    plan_id: str
    provider: Literal["paystack", "flutterwave", "bank_transfer", "card", "mock"] = "mock"


class UnlockIn(BaseModel):
    property_id: str


# ─── Auth guard (dup to avoid circular imports) ─────────────────
async def _current_user_id(
    creds: Optional[HTTPAuthorizationCredentials],
) -> str:
    if not creds:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALG])
        return payload["sub"]
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid token")


# ─── Wallet core operations (currency-aware) ────────────────
class WalletService:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db

    async def _welcome_amount(self, currency: Currency) -> int:
        """Admin-editable welcome bonus (app_settings.monetization.welcome_bonus)."""
        try:
            cfg = await self.db.app_settings.find_one({"key": "monetization"}, {"_id": 0, "value": 1})
            wb = ((cfg or {}).get("value") or {}).get("welcome_bonus") or {}
            if currency in wb and int(wb[currency]) >= 0:
                return int(wb[currency])
        except Exception:
            pass
        return WELCOME_TOKENS if currency == "MASS" else WELCOME_FIX

    async def get_or_create(self, user_id: str, currency: Currency = "MASS") -> dict:
        # Backward-compat: legacy MASS wallets may have no `currency` field.
        query: dict = {"user_id": user_id, "currency": currency}
        if currency == "MASS":
            query = {"user_id": user_id, "$or": [{"currency": "MASS"}, {"currency": {"$exists": False}}]}
        wallet = await self.db.wallets.find_one(query, {"_id": 0})
        if wallet:
            # Auto-migrate legacy doc: stamp currency field for future queries.
            if not wallet.get("currency"):
                wallet["currency"] = currency
                await self.db.wallets.update_one(
                    {"user_id": user_id, "currency": {"$exists": False}},
                    {"$set": {"currency": currency}},
                )
            return wallet
        # Create new wallet with welcome amount
        welcome = await self._welcome_amount(currency)
        doc = Wallet(user_id=user_id, currency=currency).model_dump()
        doc["bonus_balance"] = welcome
        doc["lifetime_earned"] = welcome
        await self.db.wallets.insert_one({**doc})
        label = "AMASS" if currency == "MASS" else "FIXA"
        await self._log(
            user_id,
            "welcome",
            welcome,
            welcome,
            f"Welcome to {label}! Enjoy your starter {currency} tokens.",
            currency=currency,
            extra={"balance_before": 0, "status": "completed"},
        )
        return {**doc}

    async def _log(
        self,
        user_id: str,
        kind: TransactionKind,
        amount: int,
        balance_after: int,
        description: str,
        currency: Currency = "MASS",
        meta: Optional[dict] = None,
        extra: Optional[dict] = None,
    ) -> None:
        """Append-only ledger row. `extra` carries monetization fields
        (balance_before, status, feature_key, target_id, category, zone_tier,
        price_snapshot, idempotency_key, …). Completed rows are never edited."""
        tx = Transaction(
            user_id=user_id,
            currency=currency,
            kind=kind,
            amount=amount,
            balance_after=balance_after,
            description=description,
            meta=meta or {},
        ).model_dump()
        tx.setdefault("status", "completed")
        tx.setdefault("balance_before", balance_after - amount)
        if extra:
            tx.update(extra)
        await self.db.token_transactions.insert_one({**tx})

    async def credit(
        self,
        user_id: str,
        amount: int,
        kind: TransactionKind,
        description: str,
        *,
        currency: Currency = "MASS",
        is_bonus: bool = False,
        meta: Optional[dict] = None,
        extra: Optional[dict] = None,
    ) -> dict:
        # Ensure wallet exists (creates on first touch with welcome bonus).
        before = await self.get_or_create(user_id, currency)
        field = "bonus_balance" if is_bonus else "balance"
        # Atomic increment — safe under concurrent credits/debits.
        w = await self.db.wallets.find_one_and_update(
            {"user_id": user_id, "currency": currency},
            {"$inc": {field: amount, "lifetime_earned": amount}},
            projection={"_id": 0},
            return_document=True,  # ReturnDocument.AFTER
        )
        if not w:
            # Should never happen because get_or_create ran first.
            raise HTTPException(500, "Wallet not found for credit")
        await self._log(
            user_id, kind, amount, w["balance"] + w["bonus_balance"], description,
            currency=currency, meta=meta,
            extra={"balance_before": before["balance"] + before["bonus_balance"], **(extra or {})},
        )
        return w

    async def debit(
        self,
        user_id: str,
        amount: int,
        kind: TransactionKind,
        description: str,
        *,
        currency: Currency = "MASS",
        meta: Optional[dict] = None,
        extra: Optional[dict] = None,
    ) -> dict:
        """Spend bonus tokens first, then primary balance — atomically."""
        w = await self.get_or_create(user_id, currency)
        spendable = w["balance"] + w["bonus_balance"]
        if spendable < amount:
            raise HTTPException(402, f"Insufficient {currency} tokens")
        # Compute allocations optimistically, then apply with a conditional
        # atomic update that fails if the state drifted underneath us.
        use_bonus = min(w["bonus_balance"], amount)
        use_balance = amount - use_bonus
        # Use $inc with a filter guarding the exact state we just read.
        # Retry once if optimistic lock fails.
        for _attempt in range(3):
            updated = await self.db.wallets.find_one_and_update(
                {
                    "user_id": user_id,
                    "currency": currency,
                    "balance": {"$gte": use_balance},
                    "bonus_balance": {"$gte": use_bonus},
                },
                {
                    "$inc": {
                        "balance": -use_balance,
                        "bonus_balance": -use_bonus,
                        "lifetime_used": amount,
                    }
                },
                projection={"_id": 0},
                return_document=True,
            )
            if updated:
                await self._log(
                    user_id, kind, -amount,
                    updated["balance"] + updated["bonus_balance"],
                    description, currency=currency, meta=meta,
                    extra={"balance_before": spendable, **(extra or {})},
                )
                return updated
            # Re-read wallet & recompute allocations
            w = await self.get_or_create(user_id, currency)
            spendable = w["balance"] + w["bonus_balance"]
            if spendable < amount:
                raise HTTPException(402, f"Insufficient {currency} tokens")
            use_bonus = min(w["bonus_balance"], amount)
            use_balance = amount - use_bonus
        raise HTTPException(409, "Wallet contention — please retry")


# ─── Router factory ────────────────────────────────────────────
def register_token_routes(db: AsyncIOMotorDatabase) -> APIRouter:
    svc = WalletService(db)

    async def _current_sub(user_id: str) -> Optional[dict]:
        sub = await db.subscriptions.find_one(
            {"user_id": user_id, "status": "active"}, {"_id": 0}
        )
        return sub

    @router.get("/wallet/me", response_model=WalletOut)
    async def wallet_me(
        creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    ):
        """Legacy MASS wallet endpoint (kept for backward compatibility)."""
        user_id = await _current_user_id(creds)
        w = await svc.get_or_create(user_id, "MASS")
        sub = await _current_sub(user_id)
        return WalletOut(
            currency="MASS",
            balance=w["balance"],
            bonus_balance=w["bonus_balance"],
            spendable=w["balance"] + w["bonus_balance"],
            locked=w.get("locked", 0),
            lifetime_earned=w.get("lifetime_earned", 0),
            lifetime_used=w.get("lifetime_used", 0),
            subscription=sub,
        )

    def _wallet_out(w: dict, currency: Currency, subscription: Optional[dict] = None) -> WalletOut:
        return WalletOut(
            currency=currency,
            balance=w["balance"],
            bonus_balance=w["bonus_balance"],
            spendable=w["balance"] + w["bonus_balance"],
            locked=w.get("locked", 0),
            lifetime_earned=w.get("lifetime_earned", 0),
            lifetime_used=w.get("lifetime_used", 0),
            subscription=subscription,
        )

    # ─── MASS aliased endpoint (mirror of /wallet/me, explicit for FE clarity)
    @router.get("/wallet/mass", response_model=WalletOut)
    async def wallet_mass(
        creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    ):
        user_id = await _current_user_id(creds)
        w = await svc.get_or_create(user_id, "MASS")
        sub = await _current_sub(user_id)
        return _wallet_out(w, "MASS", sub)

    @router.get("/wallet/transactions")
    async def wallet_transactions(
        limit: int = 40,
        currency: Optional[str] = None,  # "MASS" | "FIX" | None (all)
        creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    ):
        user_id = await _current_user_id(creds)
        query: dict = {"user_id": user_id}
        if currency == "MASS":
            query["$or"] = [{"currency": "MASS"}, {"currency": {"$exists": False}}]
        elif currency == "FIX":
            query["currency"] = "FIX"
        docs = (
            await db.token_transactions.find(query, {"_id": 0})
            .sort("created_at", -1)
            .limit(limit)
            .to_list(limit)
        )
        # Ensure legacy docs surface a currency label
        for d in docs:
            d.setdefault("currency", "MASS")
        return docs

    @router.get("/tokens/bundles")
    async def list_bundles(currency: str = "MASS"):
        """Bundle catalog with the FULL credit the buyer will receive (incl. the admin top-up tier
        bonus) so the app can disclose the exact total before any payment. MASS only."""
        return await bundles_with_bonus(db, "MASS")

    @router.post("/tokens/purchase")
    async def purchase_tokens(
        data: PurchaseIn,
        creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    ):
        """DEPRECATED: This mock endpoint has been removed. All real MASS
        purchases must go through /api/payments/init and be credited via the
        provider webhook (/api/payments/webhook/paystack|flutterwave).
        Kept as 410 GONE to surface any legacy client integrations.
        """
        raise HTTPException(
            410,
            {
                "error": "endpoint_removed",
                "message": "Use POST /api/payments/initialize to purchase MASS tokens.",
                "redirect": "/api/payments/initialize",
            },
        )

    @router.get("/subscriptions/plans")
    async def list_plans():
        return SUBSCRIPTION_PLANS

    @router.get("/subscriptions/me")
    async def my_subscription(
        creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    ):
        user_id = await _current_user_id(creds)
        return await _current_sub(user_id) or {}

    @router.post("/subscriptions/subscribe")
    async def subscribe(
        data: SubscribeIn,
        creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    ):
        user_id = await _current_user_id(creds)
        plan = next((p for p in SUBSCRIPTION_PLANS if p["id"] == data.plan_id), None)
        if not plan:
            raise HTTPException(404, "Plan not found")
        # Cancel any existing active subscription first
        await db.subscriptions.update_many(
            {"user_id": user_id, "status": "active"},
            {"$set": {"status": "cancelled", "cancelled_at": datetime.now(timezone.utc)}},
        )
        sub = Subscription(
            user_id=user_id,
            plan_id=plan["id"],
            next_renewal=datetime.now(timezone.utc) + timedelta(days=30),
            provider=data.provider,
            provider_ref=f"mock_{uuid.uuid4().hex[:12]}",
        ).model_dump()
        await db.subscriptions.insert_one({**sub})
        # Grant first month's tokens immediately (MOCK payment success)
        if plan["monthly_tokens"] > 0:
            await svc.credit(
                user_id,
                plan["monthly_tokens"],
                "subscription_grant",
                f"{plan['name']} plan — monthly token grant",
                meta={"plan_id": plan["id"]},
            )
        w = await svc.get_or_create(user_id)
        return {
            "ok": True,
            "subscription": sub,
            "credited": plan["monthly_tokens"],
            "balance": w["balance"] + w["bonus_balance"],
        }

    @router.post("/subscriptions/cancel")
    async def cancel_subscription(
        creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    ):
        user_id = await _current_user_id(creds)
        result = await db.subscriptions.update_many(
            {"user_id": user_id, "status": "active"},
            {"$set": {"status": "cancelled", "cancelled_at": datetime.now(timezone.utc)}},
        )
        return {"ok": True, "cancelled": result.modified_count}

    @router.post("/properties/unlock")
    async def unlock_property(
        data: UnlockIn,
        request: Request,
        creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    ):
        """Legacy alias of POST /api/unlocks {featureKey:"property"}. Fee, balance and the
        entitlement are resolved by the shared monetization service — one charge per property."""
        from monetization import UnlockService  # local import avoids a cycle

        user_id = await _current_user_id(creds)
        user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
        if not user:
            raise HTTPException(401, "User not found")
        usvc = UnlockService(db)
        key = request.headers.get("Idempotency-Key") or f"legacy:{user_id}:{data.property_id}:{uuid.uuid4().hex}"
        try:
            res = await usvc.unlock(user, "property", data.property_id, key)
        except HTTPException as e:
            if e.status_code == 402:
                q = await usvc.quote(user, "property", data.property_id, log_attempt=False)
                raise HTTPException(402, {"error": "insufficient_tokens", "required": q["fee"], "balance": q["balance"], "shortfall": max(0, q["fee"] - q["balance"])})
            raise
        charged = int(res.get("charged", 0))
        return {
            "ok": True,
            "already_unlocked": res.get("free_reason") == "already_unlocked",
            "free": charged == 0,
            "unlock": res.get("entitlement"),
            "tokens_paid": charged,
            "balance": res.get("balance_after"),
        }

    @router.get("/wallet/unlocks")
    async def list_unlocks(
        creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    ):
        user_id = await _current_user_id(creds)
        # Entitlements are the source of truth (legacy property_unlocks were migrated at startup).
        ents = (
            await db.entitlements.find({"user_id": user_id, "feature_key": "property", "status": {"$in": ["active", "refunded"]}}, {"_id": 0})
            .sort("created_at", -1)
            .to_list(200)
        )
        docs = [
            {
                "id": e["id"],
                "user_id": user_id,
                "property_id": e["target_id"],
                "tokens_paid": int(e.get("amount_paid") or 0),
                "currency": e.get("currency", "MASS"),
                "status": e.get("status"),
                "expires_at": None,
                "created_at": e.get("created_at"),
                "transaction_id": e.get("transaction_id"),
                "category": e.get("category"),
                "zone_tier": e.get("zone_tier"),
            }
            for e in ents
        ]
        # Fetch property titles for display
        ids = [d["property_id"] for d in docs]
        if ids:
            props = await db.properties.find(
                {"id": {"$in": ids}}, {"_id": 0, "id": 1, "title": 1, "images": 1, "location": 1, "price": 1}
            ).to_list(len(ids))
            index = {p["id"]: p for p in props}
            for d in docs:
                d["property"] = index.get(d["property_id"])
        return docs

    @router.post("/wallet/earn")
    async def earn_tokens(
        task_id: str,
        creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    ):
        """Placeholder — real tasks will be validated server-side (phone verify,
        upload property, refer friend, etc.). MVP: only allows a daily-login claim."""
        user_id = await _current_user_id(creds)
        if task_id != "daily_login":
            raise HTTPException(400, "Unknown task")
        today = datetime.now(timezone.utc).date().isoformat()
        already = await db.token_transactions.find_one(
            {
                "user_id": user_id,
                "kind": "earn_reward",
                "meta.task_id": "daily_login",
                "meta.date": today,
            }
        )
        if already:
            return {"ok": False, "reason": "already_claimed_today"}
        await svc.credit(
            user_id,
            2,
            "earn_reward",
            "Daily login bonus",
            meta={"task_id": "daily_login", "date": today},
        )
        return {"ok": True, "credited": 2}

    return router


async def has_unlocked(db: AsyncIOMotorDatabase, user_id: str, property_id: str) -> bool:
    """Check whether a user has an active unlock on a property."""
    now = datetime.now(timezone.utc)
    rec = await db.property_unlocks.find_one(
        {
            "user_id": user_id,
            "property_id": property_id,
            "$or": [{"expires_at": None}, {"expires_at": {"$gt": now}}],
        }
    )
    return rec is not None
