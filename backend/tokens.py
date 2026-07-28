"""
AMASS Token Economy — Wallet, Subscriptions, Bundles, Unlocks.

MOCKED payment gateway: purchases and subscriptions succeed instantly and
credit tokens to the user's wallet. Real Paystack + Flutterwave wiring will
plug into the /confirm handlers when API keys are available.
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

JWT_SECRET = os.environ.get("JWT_SECRET", "amass-dev-secret-change-in-production")
JWT_ALG = "HS256"


# ─── Static configuration (admin-configurable later) ────────────
# Property token cost defaults by category & tier
DEFAULT_TOKEN_COSTS = {
    "basic": 5,
    "premium": 10,
    "luxury": 20,
    "land": 15,
    "commercial": 25,
}


def compute_token_cost(prop: dict) -> int:
    """Determine token cost for a property based on its type and status."""
    if prop.get("is_amass_exclusive"):
        return 0
    if prop.get("token_cost"):
        return int(prop["token_cost"])
    ptype = prop.get("property_type", "")
    status = prop.get("status", "")
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

WELCOME_TOKENS = 15  # Free tokens on first wallet touch
DEFAULT_UNLOCK_PERMANENCE_DAYS = 0  # 0 = forever


# ─── Pydantic ───────────────────────────────────────────────────
TransactionKind = Literal[
    "purchase",           # bought a bundle
    "spend_unlock",       # spent to unlock a property
    "subscription_grant", # monthly grant from subscription
    "earn_reward",        # earned via task/referral
    "bonus",              # bundle bonus / promotion
    "welcome",            # signup gift
    "refund",             # admin refund
    "expire",             # rollover expiry
]


class Wallet(BaseModel):
    user_id: str
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
    balance: int
    bonus_balance: int
    spendable: int
    locked: int
    lifetime_earned: int
    lifetime_used: int
    subscription: Optional[dict] = None


class Transaction(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
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
    provider: Literal["paystack", "flutterwave", "mock"] = "mock"


class SubscribeIn(BaseModel):
    plan_id: str
    provider: Literal["paystack", "flutterwave", "mock"] = "mock"


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


# ─── Wallet core operations ────────────────────────────────────
class WalletService:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db

    async def get_or_create(self, user_id: str) -> dict:
        wallet = await self.db.wallets.find_one({"user_id": user_id}, {"_id": 0})
        if wallet:
            return wallet
        doc = Wallet(user_id=user_id).model_dump()
        # Give welcome tokens (once)
        doc["bonus_balance"] = WELCOME_TOKENS
        doc["lifetime_earned"] = WELCOME_TOKENS
        await self.db.wallets.insert_one({**doc})
        await self._log(
            user_id,
            "welcome",
            WELCOME_TOKENS,
            WELCOME_TOKENS,
            "Welcome to AMASS! Enjoy your starter tokens.",
        )
        return {**doc}

    async def _log(
        self,
        user_id: str,
        kind: TransactionKind,
        amount: int,
        balance_after: int,
        description: str,
        meta: Optional[dict] = None,
    ) -> None:
        tx = Transaction(
            user_id=user_id,
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
        is_bonus: bool = False,
        meta: Optional[dict] = None,
    ) -> dict:
        w = await self.get_or_create(user_id)
        field = "bonus_balance" if is_bonus else "balance"
        new_val = w.get(field, 0) + amount
        lifetime = w.get("lifetime_earned", 0) + amount
        await self.db.wallets.update_one(
            {"user_id": user_id},
            {"$set": {field: new_val, "lifetime_earned": lifetime}},
        )
        w[field] = new_val
        w["lifetime_earned"] = lifetime
        await self._log(user_id, kind, amount, w["balance"] + w["bonus_balance"], description, meta)
        return w

    async def debit(
        self,
        user_id: str,
        amount: int,
        kind: TransactionKind,
        description: str,
        meta: Optional[dict] = None,
    ) -> dict:
        """Spend bonus tokens first, then primary balance."""
        w = await self.get_or_create(user_id)
        spendable = w["balance"] + w["bonus_balance"]
        if spendable < amount:
            raise HTTPException(402, "Insufficient tokens")
        remaining = amount
        use_bonus = min(w["bonus_balance"], remaining)
        remaining -= use_bonus
        use_balance = remaining
        new_bonus = w["bonus_balance"] - use_bonus
        new_balance = w["balance"] - use_balance
        new_lifetime_used = w.get("lifetime_used", 0) + amount
        await self.db.wallets.update_one(
            {"user_id": user_id},
            {
                "$set": {
                    "balance": new_balance,
                    "bonus_balance": new_bonus,
                    "lifetime_used": new_lifetime_used,
                }
            },
        )
        w["balance"] = new_balance
        w["bonus_balance"] = new_bonus
        w["lifetime_used"] = new_lifetime_used
        await self._log(
            user_id, kind, -amount, new_balance + new_bonus, description, meta
        )
        return w


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
        user_id = await _current_user_id(creds)
        w = await svc.get_or_create(user_id)
        sub = await _current_sub(user_id)
        return WalletOut(
            balance=w["balance"],
            bonus_balance=w["bonus_balance"],
            spendable=w["balance"] + w["bonus_balance"],
            locked=w.get("locked", 0),
            lifetime_earned=w.get("lifetime_earned", 0),
            lifetime_used=w.get("lifetime_used", 0),
            subscription=sub,
        )

    @router.get("/wallet/transactions")
    async def wallet_transactions(
        limit: int = 40,
        creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    ):
        user_id = await _current_user_id(creds)
        docs = (
            await db.token_transactions.find({"user_id": user_id}, {"_id": 0})
            .sort("created_at", -1)
            .limit(limit)
            .to_list(limit)
        )
        return docs

    @router.get("/tokens/bundles")
    async def list_bundles():
        return TOKEN_BUNDLES

    @router.post("/tokens/purchase")
    async def purchase_tokens(
        data: PurchaseIn,
        creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    ):
        user_id = await _current_user_id(creds)
        bundle = next((b for b in TOKEN_BUNDLES if b["id"] == data.bundle_id), None)
        if not bundle:
            raise HTTPException(404, "Bundle not found")
        # MOCK: assume payment succeeded. Real Paystack/Flutterwave flow:
        # 1) POST /transaction/initialize to gateway → returns auth URL
        # 2) User completes payment
        # 3) Webhook triggers this same credit call
        # For now, credit immediately.
        await svc.credit(
            user_id,
            bundle["tokens"],
            "purchase",
            f"Purchased {bundle['name']} — {bundle['tokens']} tokens",
            meta={"bundle_id": bundle["id"], "provider": data.provider, "mock": True},
        )
        if bundle["bonus"] > 0:
            await svc.credit(
                user_id,
                bundle["bonus"],
                "bonus",
                f"Bonus tokens for {bundle['name']}",
                is_bonus=True,
                meta={"bundle_id": bundle["id"]},
            )
        w = await svc.get_or_create(user_id)
        return {
            "ok": True,
            "credited": bundle["tokens"] + bundle["bonus"],
            "balance": w["balance"] + w["bonus_balance"],
        }

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
