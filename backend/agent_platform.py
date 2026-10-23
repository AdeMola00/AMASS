"""AMASS Agent Platform — Phase 1

Adds the professional Agent Ecosystem on top of the existing
agent_applications flow:

  • Plans catalog (Starter Free / Pro ₦15k / Agency ₦50k) — admin-configurable.
  • Founding Agent Program counter (first 500).
  • Agent subscriptions (separate concept from token-bundle subscriptions in
    tokens.py — this one is FIAT / NGN via Paystack/Flutterwave).
  • Server-side listing-limit enforcement (hooked into POST /api/properties
    via the check_listing_quota dep).
  • Starter Kit status workflow (admin manual updates).
  • Onboarding progress tracker across 5 steps.
  • Admin management endpoints (list/search/verify/suspend + plan editor).

Reuses existing collections:
  users, agent_applications, properties, notifications, wallets

New collections:
  agent_plans, agent_subscriptions, agent_starter_kits, founding_program

Design goals:
  • Preserve everything already in server.py — never mutate agent_applications
    schema, only read/augment.
  • All prices/limits configurable at runtime; nothing hard-coded in UI.
  • Idempotent seeds — safe to run on every startup.
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from motor.motor_asyncio import AsyncIOMotorDatabase


# ─── Static defaults (admin can override in DB) ────────────────
DEFAULT_PLANS: List[dict] = [
    {
        "id": "starter",
        "name": "Starter",
        "tier": "starter",
        "monthly_price_ngn": 0,
        "founding_price_ngn": 0,
        "listing_limit": 5,
        "premium_credits_per_month": 0,
        "team_seats": 0,
        "extra_seat_price_ngn": 0,
        "starter_kit_eligible": True,
        "features": [
            "Professional AMASS agent profile",
            "5 active property listings",
            "Property QR codes",
            "WhatsApp sharing",
            "Basic listing analytics",
            "Lead notifications",
            "Agent dashboard",
            "Customer reviews",
            "Map/satellite property positioning",
            "AMASS Registered Agent status",
            "Basic Agent Academy access",
        ],
        "cta": "Get started free",
        "highlight": False,
    },
    {
        "id": "pro",
        "name": "Pro Agent",
        "tier": "pro",
        "monthly_price_ngn": 15000,
        "founding_price_ngn": 10000,
        "listing_limit": 30,
        "premium_credits_per_month": 5,
        "team_seats": 1,
        "extra_seat_price_ngn": 0,
        "starter_kit_eligible": True,
        "features": [
            "Everything in Starter",
            "30 active property listings",
            "AMASS Verified Agent badge",
            "Unlimited property QR codes",
            "Advanced analytics",
            "Lead CRM + notes + follow-ups",
            "5 premium placements/month",
            "Featured agent placement",
            "Digital property flyers",
            "Listing optimisation",
            "Agent performance score",
            "AMASS Agent Academy",
            "Priority support",
            "Physical Pro Marketing Kit",
            "1 additional team member",
        ],
        "cta": "Upgrade to Pro",
        "highlight": True,
    },
    {
        "id": "agency",
        "name": "Agency",
        "tier": "agency",
        "monthly_price_ngn": 50000,
        "founding_price_ngn": 35000,
        "listing_limit": 150,
        "premium_credits_per_month": 20,
        "team_seats": 5,
        "extra_seat_price_ngn": 5000,
        "starter_kit_eligible": True,
        "features": [
            "150 active property listings",
            "5 agent accounts",
            "Add extra agents at ₦5,000/month",
            "Verified Agency profile",
            "Verified agency agents",
            "Unlimited property QR codes",
            "Advanced analytics + team dashboard",
            "Lead CRM + assignment",
            "Agent performance tracking",
            "20 premium placements/month",
            "Featured agency placement",
            "Unlimited digital property flyers",
            "Bulk property upload (CSV/Excel)",
            "Agency landing page + custom URL",
            "Priority support",
            "Agency marketing kit",
            "AMASS Agent Academy",
        ],
        "cta": "Choose Agency",
        "highlight": False,
    },
]

FOUNDING_TARGET = 500  # First N verified agents get founding pricing.

STARTER_KIT_STATUS = Literal[
    "not_eligible", "eligible", "processing", "dispatched", "delivered"
]


# ─── Pydantic models ────────────────────────────────────────────
class AgentPlanOut(BaseModel):
    id: str
    name: str
    tier: str
    monthly_price_ngn: int
    founding_price_ngn: int
    effective_price_ngn: int
    is_founding_price: bool
    listing_limit: int
    premium_credits_per_month: int
    team_seats: int
    extra_seat_price_ngn: int
    starter_kit_eligible: bool
    features: List[str]
    cta: str
    highlight: bool


class FoundingCounterOut(BaseModel):
    target: int
    claimed: int
    remaining: int
    is_open: bool


class SubscribeIn(BaseModel):
    plan_id: str
    provider: Literal["paystack", "flutterwave"] = "paystack"


class AgentSubscriptionOut(BaseModel):
    id: str
    user_id: str
    plan_id: str
    plan_name: str
    status: Literal["active", "trial", "past_due", "cancelled", "expired"]
    is_founding_price: bool
    monthly_price_ngn: int
    listing_limit: int
    started_at: datetime
    expires_at: Optional[datetime] = None
    cancelled_at: Optional[datetime] = None
    next_billing_at: Optional[datetime] = None


class OnboardingStepOut(BaseModel):
    id: str
    label: str
    completed: bool
    optional: bool = False


class OnboardingOut(BaseModel):
    steps: List[OnboardingStepOut]
    completed_count: int
    total_steps: int
    percent: int
    can_go_live: bool
    starter_kit_status: str


class QuotaOut(BaseModel):
    plan_id: str
    plan_name: str
    listing_limit: int
    active_listings: int
    remaining: int
    at_limit: bool


class StarterKitOut(BaseModel):
    user_id: str
    status: str
    kit_type: str
    eligible_at: Optional[datetime] = None
    processing_at: Optional[datetime] = None
    dispatched_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    tracking_reference: Optional[str] = None
    delivery_address: Optional[str] = None
    notes: Optional[str] = None


class AdminPlanUpdateIn(BaseModel):
    monthly_price_ngn: Optional[int] = None
    founding_price_ngn: Optional[int] = None
    listing_limit: Optional[int] = None
    premium_credits_per_month: Optional[int] = None
    team_seats: Optional[int] = None
    extra_seat_price_ngn: Optional[int] = None
    features: Optional[List[str]] = None
    highlight: Optional[bool] = None


class AdminVerifyIn(BaseModel):
    approve: bool
    verification_level: Optional[int] = None  # 1/2/3
    reason: Optional[str] = None


class AdminKitStatusIn(BaseModel):
    status: Literal["not_eligible", "eligible", "processing", "dispatched", "delivered"]
    tracking_reference: Optional[str] = None
    delivery_address: Optional[str] = None
    notes: Optional[str] = None


class AdminSuspendIn(BaseModel):
    suspend: bool
    reason: Optional[str] = None


# ─── Helpers ─────────────────────────────────────────────────────
async def _ensure_plans_seeded(db: AsyncIOMotorDatabase) -> None:
    for p in DEFAULT_PLANS:
        existing = await db.agent_plans.find_one({"id": p["id"]})
        if not existing:
            doc = {**p, "created_at": datetime.now(timezone.utc)}
            await db.agent_plans.insert_one(doc)
    # Founding program singleton
    fp = await db.founding_program.find_one({"id": "founding"})
    if not fp:
        await db.founding_program.insert_one(
            {
                "id": "founding",
                "target": FOUNDING_TARGET,
                "claimed": 0,
                "opened_at": datetime.now(timezone.utc),
            }
        )


async def _plan_by_id(db, plan_id: str) -> Optional[dict]:
    return await db.agent_plans.find_one({"id": plan_id}, {"_id": 0})


async def _active_subscription(db, user_id: str) -> Optional[dict]:
    return await db.agent_subscriptions.find_one(
        {"user_id": user_id, "status": {"$in": ["active", "trial"]}}, {"_id": 0}
    )


async def _founding_counter(db) -> dict:
    fp = await db.founding_program.find_one({"id": "founding"}, {"_id": 0}) or {
        "target": FOUNDING_TARGET,
        "claimed": 0,
    }
    target = fp.get("target", FOUNDING_TARGET)
    claimed = fp.get("claimed", 0)
    return {
        "target": target,
        "claimed": claimed,
        "remaining": max(0, target - claimed),
        "is_open": claimed < target,
    }


def _plan_to_public(plan: dict, founding_open: bool) -> AgentPlanOut:
    monthly = plan.get("monthly_price_ngn", 0)
    founding = plan.get("founding_price_ngn", monthly)
    use_founding = founding_open and founding < monthly
    return AgentPlanOut(
        id=plan["id"],
        name=plan["name"],
        tier=plan.get("tier", plan["id"]),
        monthly_price_ngn=monthly,
        founding_price_ngn=founding,
        effective_price_ngn=founding if use_founding else monthly,
        is_founding_price=use_founding,
        listing_limit=plan.get("listing_limit", 0),
        premium_credits_per_month=plan.get("premium_credits_per_month", 0),
        team_seats=plan.get("team_seats", 0),
        extra_seat_price_ngn=plan.get("extra_seat_price_ngn", 0),
        starter_kit_eligible=plan.get("starter_kit_eligible", False),
        features=plan.get("features", []) or [],
        cta=plan.get("cta", "Choose plan"),
        highlight=plan.get("highlight", False),
    )


async def get_effective_plan_for(db: AsyncIOMotorDatabase, user_id: str) -> dict:
    """Return the plan the user currently sits on (defaults to Starter)."""
    sub = await _active_subscription(db, user_id)
    if sub:
        plan = await _plan_by_id(db, sub["plan_id"])
        if plan:
            return plan
    starter = await _plan_by_id(db, "starter")
    return starter or DEFAULT_PLANS[0]


async def check_listing_quota(db: AsyncIOMotorDatabase, user_id: str) -> None:
    """Raise HTTPException(402) if the user has reached their plan's listing
    limit. Used by POST /api/properties."""
    plan = await get_effective_plan_for(db, user_id)
    limit = int(plan.get("listing_limit", 0) or 0)
    if limit <= 0:
        raise HTTPException(
            403,
            {
                "error": "no_active_plan",
                "message": "You need an active AMASS plan to publish listings.",
            },
        )
    active_count = await db.properties.count_documents(
        {
            "agent_id": user_id,
            "status": {"$nin": ["archived", "sold", "rented"]},
        }
    )
    if active_count >= limit:
        raise HTTPException(
            402,
            {
                "error": "plan_limit_reached",
                "message": f"You've reached your {limit}-property limit on the "
                f"{plan['name']} plan. Upgrade to add more listings.",
                "plan_id": plan["id"],
                "plan_name": plan["name"],
                "limit": limit,
                "active": active_count,
            },
        )


async def maybe_mark_starter_kit_eligible(
    db: AsyncIOMotorDatabase, user_id: str
) -> None:
    """After a property is approved, check if this brings the agent to
    5+ quality (approved/verified) listings — then flip Starter Kit eligible."""
    approved = await db.properties.count_documents(
        {"agent_id": user_id, "status": {"$ne": "archived"}, "verified": True}
    )
    if approved < 5:
        return
    kit = await db.agent_starter_kits.find_one({"user_id": user_id})
    if kit and kit.get("status") not in (None, "not_eligible"):
        return  # already progressed further
    now = datetime.now(timezone.utc)
    if kit:
        await db.agent_starter_kits.update_one(
            {"user_id": user_id},
            {"$set": {"status": "eligible", "eligible_at": now}},
        )
    else:
        # Determine kit type from active plan (defaults to Starter kit).
        plan = await get_effective_plan_for(db, user_id)
        await db.agent_starter_kits.insert_one(
            {
                "user_id": user_id,
                "status": "eligible",
                "kit_type": f"{plan.get('tier', 'starter')}_marketing_kit",
                "eligible_at": now,
                "created_at": now,
            }
        )
    # Notify user
    from notification_center import emit
    await emit(
        db, user_id, "starter_kit_eligible",
        "You've unlocked the AMASS Starter Kit",
        "5+ quality listings verified. Our team will process your kit soon.",
        {"starter_kit": True},
        action_url="/agent-dashboard",
    )


# ─── Router factory ───────────────────────────────────────────────
def register_agent_platform_routes(
    db: AsyncIOMotorDatabase,
    require_auth,   # callable → dict (current user)
    require_admin,  # callable → dict (admin user)
):
    router = APIRouter(prefix="/api/agent-platform", tags=["agent-platform"])
    admin_router = APIRouter(prefix="/api/admin", tags=["admin-agents"])

    # ═══ Public plan catalog ══════════════════════════════════════
    @router.get("/plans", response_model=List[AgentPlanOut])
    async def list_plans():
        await _ensure_plans_seeded(db)
        counter = await _founding_counter(db)
        plans = await db.agent_plans.find({}, {"_id": 0}).to_list(20)
        # Preserve DEFAULT_PLANS ordering (starter → pro → agency).
        order = {p["id"]: i for i, p in enumerate(DEFAULT_PLANS)}
        plans.sort(key=lambda p: order.get(p["id"], 99))
        return [_plan_to_public(p, counter["is_open"]) for p in plans]

    @router.get("/founding", response_model=FoundingCounterOut)
    async def founding_counter():
        return await _founding_counter(db)

    # ═══ Agent's current subscription ═════════════════════════════
    @router.get("/subscription/me")
    async def my_subscription(user: dict = Depends(require_auth)):
        sub = await _active_subscription(db, user["id"])
        if not sub:
            # Auto-default: Starter (free) — never require a paid record for
            # the Free plan since new agents land here after apply.
            plan = await _plan_by_id(db, "starter") or DEFAULT_PLANS[0]
            return {
                "plan_id": plan["id"],
                "plan_name": plan["name"],
                "status": "active",
                "listing_limit": plan.get("listing_limit", 0),
                "monthly_price_ngn": 0,
                "is_founding_price": False,
                "started_at": user.get("created_at"),
                "next_billing_at": None,
                "auto_default": True,
            }
        plan = await _plan_by_id(db, sub["plan_id"]) or {}
        return {**sub, "plan_name": plan.get("name", sub["plan_id"])}

    @router.post("/subscription/subscribe")
    async def subscribe(
        data: SubscribeIn, user: dict = Depends(require_auth)
    ):
        """Initiate a paid subscription. For Starter (free), immediately
        activates a subscription record. For paid plans returns a payment
        intent — the caller is expected to complete /api/payments/initialize.
        Actual crediting/activation happens in the paystack/flutterwave
        webhook (payments.py) so we never activate without payment.
        """
        plan = await _plan_by_id(db, data.plan_id)
        if not plan:
            raise HTTPException(404, "Plan not found")
        counter = await _founding_counter(db)
        use_founding = (
            counter["is_open"]
            and int(plan.get("founding_price_ngn", 0))
            < int(plan.get("monthly_price_ngn", 0))
        )
        price = int(
            plan.get("founding_price_ngn") if use_founding else plan.get("monthly_price_ngn", 0)
        )
        now = datetime.now(timezone.utc)

        if price == 0 or plan["id"] == "starter":
            # Free tier — activate immediately.
            await db.agent_subscriptions.update_many(
                {"user_id": user["id"], "status": {"$in": ["active", "trial"]}},
                {"$set": {"status": "cancelled", "cancelled_at": now}},
            )
            sub_doc = {
                "id": str(uuid.uuid4()),
                "user_id": user["id"],
                "plan_id": plan["id"],
                "status": "active",
                "is_founding_price": use_founding,
                "monthly_price_ngn": 0,
                "listing_limit": plan.get("listing_limit", 0),
                "started_at": now,
                "expires_at": None,
                "next_billing_at": None,
                "cancelled_at": None,
                "created_at": now,
            }
            await db.agent_subscriptions.insert_one(sub_doc)
            sub_doc.pop("_id", None)
            return {"ok": True, "activated": True, "plan_id": plan["id"], "price_ngn": 0}

        # Paid tier — return a payment intent handle. The caller should now
        # POST /api/payments/initialize with the returned bundle_ref which
        # the webhook wires to /subscription/activate below.
        pending_ref = f"agentsub_{uuid.uuid4().hex[:12]}"
        await db.pending_agent_subscriptions.insert_one(
            {
                "reference": pending_ref,
                "user_id": user["id"],
                "plan_id": plan["id"],
                "is_founding_price": use_founding,
                "amount_ngn": price,
                "provider": data.provider,
                "created_at": now,
            }
        )
        return {
            "ok": True,
            "activated": False,
            "requires_payment": True,
            "pending_reference": pending_ref,
            "plan_id": plan["id"],
            "amount_ngn": price,
            "is_founding_price": use_founding,
            "provider": data.provider,
            "note": (
                "POST this pending_reference to /api/payments/initialize with "
                "currency='NGN_SUB' to complete checkout."
            ),
        }

    @router.post("/subscription/activate")
    async def activate_subscription(
        pending_reference: str,
        user: dict = Depends(require_auth),
    ):
        """MVP hook — activate a paid subscription. In production this is
        triggered by the payment provider webhook; exposed as an authenticated
        endpoint for MOCK_PAYMENT=true dev environments."""
        if os.getenv("MOCK_PAYMENT", "false").lower() != "true":
            raise HTTPException(
                403,
                "Manual activation disabled — payments must complete via provider webhook.",
            )
        pending = await db.pending_agent_subscriptions.find_one(
            {"reference": pending_reference, "user_id": user["id"]}, {"_id": 0}
        )
        if not pending:
            raise HTTPException(404, "Pending subscription not found")
        return await _finalize_subscription(pending)

    async def _finalize_subscription(pending: dict) -> dict:
        """Idempotent finalize hook called either by the webhook or by the
        MOCK_PAYMENT dev bypass. Idempotent on pending.reference."""
        already = await db.agent_subscriptions.find_one(
            {"payment_reference": pending["reference"]}, {"_id": 0}
        )
        if already:
            return {"ok": True, "already": True, "subscription": already}

        plan = await _plan_by_id(db, pending["plan_id"])
        if not plan:
            raise HTTPException(404, "Plan not found for pending sub")
        now = datetime.now(timezone.utc)
        # Cancel any current active sub for the user
        await db.agent_subscriptions.update_many(
            {"user_id": pending["user_id"], "status": {"$in": ["active", "trial"]}},
            {"$set": {"status": "cancelled", "cancelled_at": now}},
        )
        # Monthly recurring — 30-day next_billing_at.
        sub_doc = {
            "id": str(uuid.uuid4()),
            "user_id": pending["user_id"],
            "plan_id": plan["id"],
            "status": "active",
            "is_founding_price": pending.get("is_founding_price", False),
            "monthly_price_ngn": pending["amount_ngn"],
            "listing_limit": plan.get("listing_limit", 0),
            "payment_reference": pending["reference"],
            "provider": pending.get("provider"),
            "started_at": now,
            "next_billing_at": now.replace(microsecond=0),  # UI-facing; renewer job later
            "expires_at": None,
            "cancelled_at": None,
            "created_at": now,
        }
        await db.agent_subscriptions.insert_one(sub_doc)
        sub_doc.pop("_id", None)  # strip ObjectId injected by motor to keep response JSON-serialisable
        # Founding-agent counter: increment for the first N paying agents on
        # a founding-priced plan.
        if pending.get("is_founding_price"):
            await db.founding_program.update_one(
                {"id": "founding"}, {"$inc": {"claimed": 1}}
            )
        # Notify
        from notification_center import emit
        await emit(
            db, pending["user_id"], "subscription_activated",
            f"{plan['name']} plan activated",
            f"Welcome to the {plan['name']} plan. Your ₦{pending['amount_ngn']:,} subscription is now active.",
            {"plan_id": plan["id"], "reference": pending["reference"]},
            action_url="/agent-plans",
        )
        # Clean pending
        await db.pending_agent_subscriptions.delete_many(
            {"reference": pending["reference"]}
        )
        return {"ok": True, "subscription": sub_doc}

    # Exposed under module for external callers (webhook wiring later).
    router._finalize_subscription = _finalize_subscription  # type: ignore
    # Also stash at module level so payments.py can look it up without
    # circular imports.
    globals()["_FINALIZE_SUBSCRIPTION"] = _finalize_subscription

    @router.post("/subscription/cancel")
    async def cancel_subscription(user: dict = Depends(require_auth)):
        sub = await _active_subscription(db, user["id"])
        if not sub or sub["plan_id"] == "starter":
            raise HTTPException(400, "No cancellable subscription")
        now = datetime.now(timezone.utc)
        # Cancel ALL currently-active subs for this user (belt-and-braces).
        await db.agent_subscriptions.update_many(
            {"user_id": user["id"], "status": {"$in": ["active", "trial"]}},
            {"$set": {"status": "cancelled", "cancelled_at": now}},
        )
        # Drop them back to Starter immediately (no data loss — existing
        # listings remain, only quota rules change).
        starter_plan = await _plan_by_id(db, "starter") or {}
        starter_doc = {
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "plan_id": "starter",
            "status": "active",
            "is_founding_price": False,
            "monthly_price_ngn": 0,
            "listing_limit": starter_plan.get("listing_limit", 5),
            "started_at": now,
            "next_billing_at": None,
            "created_at": now,
        }
        await db.agent_subscriptions.insert_one(starter_doc)
        starter_doc.pop("_id", None)
        return {"ok": True}

    # ═══ Quota (used by the client to render the meter) ═══════════
    @router.get("/quota", response_model=QuotaOut)
    async def my_quota(user: dict = Depends(require_auth)):
        plan = await get_effective_plan_for(db, user["id"])
        limit = int(plan.get("listing_limit", 0) or 0)
        active = await db.properties.count_documents(
            {"agent_id": user["id"], "status": {"$ne": "archived"}}
        )
        return QuotaOut(
            plan_id=plan["id"],
            plan_name=plan["name"],
            listing_limit=limit,
            active_listings=active,
            remaining=max(0, limit - active),
            at_limit=active >= limit,
        )

    # ═══ Onboarding progress ═════════════════════════════════════
    @router.get("/onboarding", response_model=OnboardingOut)
    async def onboarding(user: dict = Depends(require_auth)):
        app = await db.agent_applications.find_one(
            {"user_id": user["id"]}, {"_id": 0}
        )
        active_sub = await _active_subscription(db, user["id"])
        listings_count = await db.properties.count_documents(
            {"agent_id": user["id"], "status": {"$ne": "archived"}}
        )
        verified_count = await db.properties.count_documents(
            {"agent_id": user["id"], "verified": True}
        )
        kit = await db.agent_starter_kits.find_one({"user_id": user["id"]}, {"_id": 0})

        steps = [
            OnboardingStepOut(
                id="account",
                label="Create your AMASS account",
                completed=bool(user.get("email")),
            ),
            OnboardingStepOut(
                id="professional",
                label="Add professional information",
                completed=bool(app and app.get("agency_name") and app.get("areas_of_operation")),
            ),
            OnboardingStepOut(
                id="kyc",
                label="Submit identity verification",
                completed=bool(app and app.get("id_document_url") and app.get("selfie_url")),
            ),
            OnboardingStepOut(
                id="plan",
                label="Choose your plan",
                completed=bool(active_sub),
            ),
            OnboardingStepOut(
                id="listings",
                label="Upload your first properties (0/5)"
                if listings_count == 0
                else f"Upload your first properties ({min(listings_count, 5)}/5)",
                completed=verified_count >= 5,
                optional=False,
            ),
        ]
        completed = sum(1 for s in steps if s.completed)
        return OnboardingOut(
            steps=steps,
            completed_count=completed,
            total_steps=len(steps),
            percent=int((completed / len(steps)) * 100),
            can_go_live=completed >= 4,  # KYC + plan gate go-live
            starter_kit_status=(kit or {}).get("status", "not_eligible"),
        )

    # ═══ Starter kit visibility for the agent ═════════════════════
    @router.get("/starter-kit/me", response_model=StarterKitOut)
    async def my_starter_kit(user: dict = Depends(require_auth)):
        kit = await db.agent_starter_kits.find_one(
            {"user_id": user["id"]}, {"_id": 0}
        )
        if not kit:
            return StarterKitOut(
                user_id=user["id"], status="not_eligible", kit_type="none"
            )
        return StarterKitOut(**kit)

    # ═══════════════════════════════════════════════════════════════
    # ADMIN ROUTES
    # ═══════════════════════════════════════════════════════════════
    @admin_router.get("/agents")
    async def admin_list_agents(
        status: Optional[str] = Query(None, description="pending|approved|rejected|suspended"),
        plan: Optional[str] = Query(None),
        q: Optional[str] = Query(None, description="search full_name/email/phone/agency"),
        limit: int = Query(50, le=200),
        _admin=Depends(require_admin),
    ):
        filt: dict = {}
        if status:
            filt["status"] = status
        if q:
            filt["$or"] = [
                {"full_name": {"$regex": q, "$options": "i"}},
                {"email": {"$regex": q, "$options": "i"}},
                {"phone": {"$regex": q, "$options": "i"}},
                {"agency_name": {"$regex": q, "$options": "i"}},
            ]
        agents = await db.agent_applications.find(filt, {"_id": 0}).sort(
            "created_at", -1
        ).to_list(limit)
        # Attach current plan
        out: list = []
        for a in agents:
            sub = await _active_subscription(db, a["user_id"])
            plan_id = sub["plan_id"] if sub else "starter"
            if plan and plan_id != plan:
                continue
            active_listings = await db.properties.count_documents(
                {"agent_id": a["user_id"], "status": {"$ne": "archived"}}
            )
            out.append(
                {
                    **a,
                    "current_plan_id": plan_id,
                    "active_listings": active_listings,
                }
            )
        return out

    @admin_router.post("/agents/{user_id}/verify")
    async def admin_verify_agent(
        user_id: str,
        data: AdminVerifyIn,
        _admin=Depends(require_admin),
    ):
        app = await db.agent_applications.find_one({"user_id": user_id})
        if not app:
            raise HTTPException(404, "Agent application not found")
        now = datetime.now(timezone.utc)
        updates: dict = {"reviewed_at": now}
        if data.approve:
            updates["status"] = "approved"
            if data.verification_level is not None:
                updates["verification_level"] = int(data.verification_level)
            elif app.get("verification_level", 1) < 2:
                updates["verification_level"] = 2  # bump to Identity Verified
        else:
            updates["status"] = "rejected"
            updates["rejection_reason"] = data.reason or "Verification declined"
        await db.agent_applications.update_one(
            {"user_id": user_id}, {"$set": updates}
        )
        # Notify
        from notification_center import emit
        await emit(
            db, user_id, "verification_result",
            "AMASS verification approved" if data.approve else "AMASS verification declined",
            (
                "Congratulations — your AMASS Agent verification is approved."
                if data.approve
                else (data.reason or "Please review and resubmit your details.")
            ),
            {"level": updates.get("verification_level"), "decision": "approved" if data.approve else "rejected"},
            action_url="/become-agent",
        )
        return {"ok": True, "status": updates["status"]}

    @admin_router.post("/agents/{user_id}/suspend")
    async def admin_suspend(
        user_id: str,
        data: AdminSuspendIn,
        _admin=Depends(require_admin),
    ):
        new_status = "suspended" if data.suspend else "approved"
        await db.agent_applications.update_one(
            {"user_id": user_id},
            {
                "$set": {
                    "status": new_status,
                    "suspend_reason": data.reason if data.suspend else None,
                    "reviewed_at": datetime.now(timezone.utc),
                }
            },
        )
        from notification_center import emit
        await emit(
            db, user_id, "account_status",
            "Account suspended" if data.suspend else "Account reinstated",
            (data.reason if data.suspend else "Your AMASS account is active again.") or "",
            {"suspended": bool(data.suspend)},
            action_url="/become-agent",
        )
        return {"ok": True, "status": new_status}

    @admin_router.patch("/plans/{plan_id}")
    async def admin_update_plan(
        plan_id: str,
        data: AdminPlanUpdateIn,
        _admin=Depends(require_admin),
    ):
        plan = await db.agent_plans.find_one({"id": plan_id})
        if not plan:
            raise HTTPException(404, "Plan not found")
        updates = {k: v for k, v in data.model_dump().items() if v is not None}
        if not updates:
            raise HTTPException(400, "Nothing to update")
        updates["updated_at"] = datetime.now(timezone.utc)
        await db.agent_plans.update_one({"id": plan_id}, {"$set": updates})
        return {"ok": True, "updated": list(updates.keys())}

    @admin_router.post("/starter-kits/{user_id}/status")
    async def admin_kit_status(
        user_id: str,
        data: AdminKitStatusIn,
        _admin=Depends(require_admin),
    ):
        now = datetime.now(timezone.utc)
        set_doc = {"status": data.status, "updated_at": now}
        if data.tracking_reference is not None:
            set_doc["tracking_reference"] = data.tracking_reference
        if data.delivery_address is not None:
            set_doc["delivery_address"] = data.delivery_address
        if data.notes is not None:
            set_doc["notes"] = data.notes
        # Stamp status-specific timestamps
        if data.status == "eligible":
            set_doc["eligible_at"] = now
        elif data.status == "processing":
            set_doc["processing_at"] = now
        elif data.status == "dispatched":
            set_doc["dispatched_at"] = now
        elif data.status == "delivered":
            set_doc["delivered_at"] = now
        await db.agent_starter_kits.update_one(
            {"user_id": user_id},
            {
                "$set": set_doc,
                "$setOnInsert": {"created_at": now, "kit_type": "starter_marketing_kit"},
            },
            upsert=True,
        )
        # Notify user
        titles = {
            "eligible": "Your AMASS Starter Kit is unlocked",
            "processing": "Your AMASS Starter Kit is being prepared",
            "dispatched": "Your AMASS Starter Kit is on its way",
            "delivered": "Your AMASS Starter Kit has been delivered",
            "not_eligible": "AMASS Starter Kit update",
        }
        from notification_center import emit
        await emit(
            db, user_id, "starter_kit_status",
            titles.get(data.status, "Starter Kit update"),
            data.notes or "",
            {"status": data.status, "tracking": data.tracking_reference},
            action_url="/agent-dashboard",
        )
        return {"ok": True, "status": data.status}

    @admin_router.get("/agents/kpis")
    async def admin_kpis(_admin=Depends(require_admin)):
        total_agents = await db.agent_applications.count_documents({})
        verified = await db.agent_applications.count_documents(
            {"status": "approved", "verification_level": {"$gte": 2}}
        )
        pending = await db.agent_applications.count_documents({"status": "pending"})
        suspended = await db.agent_applications.count_documents({"status": "suspended"})
        # Plan distribution
        plan_counts: dict = {"starter": 0, "pro": 0, "agency": 0}
        subs = db.agent_subscriptions.find(
            {"status": "active"}, {"_id": 0, "plan_id": 1}
        )
        async for s in subs:
            pid = s.get("plan_id", "starter")
            plan_counts[pid] = plan_counts.get(pid, 0) + 1
        # Revenue
        pipeline = [
            {"$match": {"status": "active"}},
            {
                "$group": {
                    "_id": None,
                    "mrr": {"$sum": "$monthly_price_ngn"},
                    "n": {"$sum": 1},
                }
            },
        ]
        agg = await db.agent_subscriptions.aggregate(pipeline).to_list(1)
        mrr = agg[0]["mrr"] if agg else 0
        # Quality inventory
        agents_with_5plus = 0
        # count agents with >=5 verified listings using aggregation
        pipe2 = [
            {"$match": {"verified": True}},
            {"$group": {"_id": "$agent_id", "n": {"$sum": 1}}},
            {"$match": {"n": {"$gte": 5}}},
            {"$count": "c"},
        ]
        agg2 = await db.properties.aggregate(pipe2).to_list(1)
        agents_with_5plus = agg2[0]["c"] if agg2 else 0
        founding = await _founding_counter(db)
        return {
            "agents": {
                "total": total_agents,
                "verified": verified,
                "pending": pending,
                "suspended": suspended,
                "with_5plus_verified_listings": agents_with_5plus,
            },
            "plans": plan_counts,
            "revenue": {"mrr_ngn": mrr, "arr_ngn": mrr * 12},
            "founding": founding,
            "targets": {
                "agents": 500,
                "verified": 350,
                "with_5plus_listings": 200,
                "properties": 2000,
                "free_to_pro_conversion_pct": 12,
            },
        }

    return router, admin_router
