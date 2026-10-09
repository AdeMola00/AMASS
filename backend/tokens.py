"""
AMASS Dual-Token Economy — MASS (property utility) + FIX (FIXA service utility/reward).

  • MASS — spent by users to unlock premium property details, view premium
    listings, buy subscriptions, etc. Purchasable via Paystack/Flutterwave/etc.
  • FIX  — earned by verified FIXA service providers (job completions, ratings,
    referrals, milestones) and also purchasable by customers for premium FIXA
    features (provider profile boost, priority listing, etc.).

Wallets, transactions and subscriptions all carry a `currency` field so a
single WalletService supports both tokens without duplicated code.

MOCKED payment gateway: purchases succeed instantly. Real Paystack/Flutterwave
wiring will plug into the /confirm handlers when API keys are available.
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import List, Literal, Optional

import jwt
from fastapi import APIRouter, Depends, HTTPException
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


TOKEN_BUNDLES = [
    {"id": "starter", "name": "Starter Pack", "tokens": 20, "bonus": 0, "price_ngn": 500},
    {"id": "explorer", "name": "Explorer", "tokens": 50, "bonus": 0, "price_ngn": 1_000},
    {"id": "hunter", "name": "Property Hunter", "tokens": 150, "bonus": 10, "price_ngn": 2_500},
    {"id": "investor", "name": "Investor", "tokens": 350, "bonus": 50, "price_ngn": 5_000},
    {"id": "professional", "name": "Professional", "tokens": 800, "bonus": 150, "price_ngn": 10_000},
]

# ─── FIX bundles (customers can also purchase FIX for premium FIXA features) ─
FIX_BUNDLES = [
    {"id": "fix_starter", "name": "FIX Starter", "tokens": 50, "bonus": 0, "price_ngn": 500},
    {"id": "fix_pro", "name": "FIX Pro", "tokens": 200, "bonus": 20, "price_ngn": 2_000},
    {"id": "fix_team", "name": "FIX Team", "tokens": 500, "bonus": 100, "price_ngn": 5_000},
    {"id": "fix_enterprise", "name": "FIX Enterprise", "tokens": 1_500, "bonus": 300, "price_ngn": 12_500},
]

# ─── FIX earning rules ────────────────────────────────────────
# Server-side events award FIX to verified FIXA service providers.
FIX_EARN_RULES: dict = {
    "job_completed":         {"amount": 10,  "description": "Completed a verified job"},
    "positive_rating":       {"amount": 5,   "description": "Received a 5-star customer rating"},
    "referral_signup":       {"amount": 20,  "description": "Referral signup bonus"},
    "active_profile_weekly": {"amount": 3,   "description": "Weekly active profile bonus"},
    "milestone_50":          {"amount": 50,  "description": "50 jobs milestone"},
    "milestone_100":         {"amount": 100, "description": "100 jobs milestone"},
    "milestone_500":         {"amount": 500, "description": "500 jobs milestone"},
    "promotion":             {"amount": 25,  "description": "AMASS/FIXA promotion reward"},
    "onboarding_bonus":      {"amount": 15,  "description": "FIXA provider onboarding bonus"},
}

# ─── FIX spend rules ─────────────────────────────────────────
# What customers or providers can do with FIX.
FIX_SPEND_RULES: dict = {
    "profile_boost_7d":  {"amount": 40,  "description": "Provider profile boost for 7 days"},
    "priority_listing":  {"amount": 80,  "description": "Priority listing in FIXA search (30 days)"},
    "featured_pro_30d":  {"amount": 150, "description": "Featured Pro badge for 30 days"},
    "customer_discount": {"amount": 20,  "description": "10% off next FIXA booking"},
}

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

WELCOME_TOKENS = 15  # Free MASS tokens on first wallet touch
WELCOME_FIX = 10     # Free FIX tokens on first FIX-wallet touch
DEFAULT_UNLOCK_PERMANENCE_DAYS = 0  # 0 = forever


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


class FixEarnIn(BaseModel):
    event: str  # key from FIX_EARN_RULES
    provider_user_id: Optional[str] = None  # if None → current user
    meta: dict = Field(default_factory=dict)


class FixSpendIn(BaseModel):
    action: str  # key from FIX_SPEND_RULES
    meta: dict = Field(default_factory=dict)


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

    @staticmethod
    def _welcome_amount(currency: Currency) -> int:
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
        welcome = self._welcome_amount(currency)
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
    ) -> None:
        tx = Transaction(
            user_id=user_id,
            currency=currency,
            kind=kind,
            amount=amount,
            balance_after=balance_after,
            description=description,
            meta=meta or {},
        ).model_dump()
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
    ) -> dict:
        # Ensure wallet exists (creates on first touch with welcome bonus).
        await self.get_or_create(user_id, currency)
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
                )
                return updated
            # Re-read wallet & recompute allocations
            w = await self.get_or_create(user_id, currency)
            if w["balance"] + w["bonus_balance"] < amount:
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

    # ─── FIX wallet endpoint
    @router.get("/wallet/fix", response_model=WalletOut)
    async def wallet_fix(
        creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    ):
        user_id = await _current_user_id(creds)
        w = await svc.get_or_create(user_id, "FIX")
        return _wallet_out(w, "FIX")

    # ─── Unified dual-wallet endpoint (single roundtrip for FE Wallet screen)
    @router.get("/wallet/dual", response_model=DualWalletOut)
    async def wallet_dual(
        creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    ):
        user_id = await _current_user_id(creds)
        mass = await svc.get_or_create(user_id, "MASS")
        fix = await svc.get_or_create(user_id, "FIX")
        sub = await _current_sub(user_id)
        return DualWalletOut(
            mass=_wallet_out(mass, "MASS", sub),
            fix=_wallet_out(fix, "FIX"),
        )

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
        return FIX_BUNDLES if currency.upper() == "FIX" else TOKEN_BUNDLES

    @router.get("/wallet/fix/bundles")
    async def list_fix_bundles():
        return FIX_BUNDLES

    @router.get("/wallet/fix/earn-rules")
    async def list_fix_earn_rules():
        """Public catalog of how FIX is earned (for provider dashboard)."""
        return [
            {"event": k, "amount": v["amount"], "description": v["description"]}
            for k, v in FIX_EARN_RULES.items()
        ]

    @router.get("/wallet/fix/spend-rules")
    async def list_fix_spend_rules():
        return [
            {"action": k, "amount": v["amount"], "description": v["description"]}
            for k, v in FIX_SPEND_RULES.items()
        ]

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
        creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    ):
        user_id = await _current_user_id(creds)
        prop = await db.properties.find_one({"id": data.property_id}, {"_id": 0})
        if not prop:
            raise HTTPException(404, "Property not found")
        # Already unlocked?
        existing = await db.property_unlocks.find_one(
            {
                "user_id": user_id,
                "property_id": data.property_id,
                "$or": [
                    {"expires_at": None},
                    {"expires_at": {"$gt": datetime.now(timezone.utc)}},
                ],
            },
            {"_id": 0},
        )
        if existing:
            return {"ok": True, "already_unlocked": True, "unlock": existing}
        cost = compute_token_cost(prop)
        if cost == 0:
            # Free / AMASS Exclusive — record unlock but no cost
            rec = UnlockRecord(
                user_id=user_id, property_id=data.property_id, tokens_paid=0
            ).model_dump()
            await db.property_unlocks.insert_one({**rec})
            return {"ok": True, "free": True, "unlock": rec, "tokens_paid": 0}

        # Debit tokens
        try:
            w = await svc.debit(
                user_id,
                cost,
                "spend_unlock",
                f"Unlocked property {prop.get('title', '')}",
                meta={"property_id": data.property_id, "cost": cost},
            )
        except HTTPException as e:
            if e.status_code == 402:
                wallet = await svc.get_or_create(user_id)
                raise HTTPException(
                    402,
                    {
                        "error": "insufficient_tokens",
                        "required": cost,
                        "balance": wallet["balance"] + wallet["bonus_balance"],
                        "shortfall": cost - (wallet["balance"] + wallet["bonus_balance"]),
                    },
                )
            raise
        expires = None
        if DEFAULT_UNLOCK_PERMANENCE_DAYS > 0:
            expires = datetime.now(timezone.utc) + timedelta(days=DEFAULT_UNLOCK_PERMANENCE_DAYS)
        rec = UnlockRecord(
            user_id=user_id,
            property_id=data.property_id,
            tokens_paid=cost,
            expires_at=expires,
        ).model_dump()
        await db.property_unlocks.insert_one({**rec})
        return {
            "ok": True,
            "unlock": rec,
            "tokens_paid": cost,
            "balance": w["balance"] + w["bonus_balance"],
        }

    @router.get("/wallet/unlocks")
    async def list_unlocks(
        creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    ):
        user_id = await _current_user_id(creds)
        docs = (
            await db.property_unlocks.find({"user_id": user_id}, {"_id": 0})
            .sort("created_at", -1)
            .to_list(200)
        )
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

    # ─── FIX purchase (customer buys FIX for premium FIXA features) ─────
    @router.post("/wallet/fix/purchase")
    async def purchase_fix(
        data: PurchaseIn,
        creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    ):
        """DEPRECATED: This mock endpoint has been removed. FIX purchases now
        go through /api/payments/init (currency='FIX') and are credited via
        the provider webhook, ensuring no wallet credit occurs without a
        real (or explicitly mocked via MOCK_PAYMENT env) transaction.
        """
        raise HTTPException(
            410,
            {
                "error": "endpoint_removed",
                "message": "Use POST /api/payments/initialize with currency='FIX' to purchase FIX tokens.",
                "redirect": "/api/payments/initialize",
            },
        )

    # ─── FIX earn (server-triggered event: job_completed, positive_rating…) ─
    @router.post("/wallet/fix/earn")
    async def earn_fix(
        data: FixEarnIn,
        creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    ):
        """Awards FIX to a service provider based on a whitelisted event.

        For MVP the caller is authenticated as either the provider (self-report
        via a booking flow) or an admin/system. Idempotency keys can be added
        via meta (e.g., booking_id) to prevent double-credits.
        """
        rule = FIX_EARN_RULES.get(data.event)
        if not rule:
            raise HTTPException(400, f"Unknown FIX earn event '{data.event}'")
        target_user = data.provider_user_id or await _current_user_id(creds)
        # Idempotency: if meta carries an idempotency_key, skip on duplicate.
        idem = data.meta.get("idempotency_key") if data.meta else None
        if idem:
            dup = await db.token_transactions.find_one(
                {"user_id": target_user, "currency": "FIX", "meta.idempotency_key": idem}
            )
            if dup:
                return {"ok": True, "duplicate": True, "credited": 0}
        await svc.credit(
            target_user,
            rule["amount"],
            "earn_reward",
            rule["description"],
            currency="FIX",
            meta={"event": data.event, **(data.meta or {})},
        )
        w = await svc.get_or_create(target_user, "FIX")
        return {
            "ok": True,
            "credited": rule["amount"],
            "event": data.event,
            "balance": w["balance"] + w["bonus_balance"],
        }

    # ─── FIX spend (premium FIXA feature: profile boost, priority listing…) ─
    @router.post("/wallet/fix/spend")
    async def spend_fix(
        data: FixSpendIn,
        creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    ):
        rule = FIX_SPEND_RULES.get(data.action)
        if not rule:
            raise HTTPException(400, f"Unknown FIX spend action '{data.action}'")
        user_id = await _current_user_id(creds)
        try:
            w = await svc.debit(
                user_id,
                rule["amount"],
                "spend_feature",
                rule["description"],
                currency="FIX",
                meta={"action": data.action, **(data.meta or {})},
            )
        except HTTPException as e:
            if e.status_code == 402:
                wallet = await svc.get_or_create(user_id, "FIX")
                raise HTTPException(
                    402,
                    {
                        "error": "insufficient_fix",
                        "required": rule["amount"],
                        "balance": wallet["balance"] + wallet["bonus_balance"],
                        "shortfall": rule["amount"] - (wallet["balance"] + wallet["bonus_balance"]),
                    },
                )
            raise
        return {
            "ok": True,
            "action": data.action,
            "spent": rule["amount"],
            "balance": w["balance"] + w["bonus_balance"],
        }

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
