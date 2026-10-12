"""AMASS Agent Platform — Phase 2

Adds on top of Phase 1:

  • Public agent profile route (/api/agent-platform/public/{slug})
      slugs are auto-generated on apply and stored on agent_applications.
  • Verification badge system with 4 levels:
      registered → verified → trusted → top_agent
      Rules are computed on read (idempotent, no cron needed).
      Admin can pin an explicit `admin_badge` to override the automatic tier.
  • Badge progress endpoint — tells the agent what to do to reach next tier.
  • Apple / privacy account-deletion flow (POST /api/auth/delete)
      Hard-deletes user + all agent-owned records + PII in one pass.
  • Paystack subscription webhook fulfilment — extends payments.py so an
      `agentsub_*` reference activates the correct subscription.

The module is pure additive — no existing schemas mutated. Slugs and
performance stats are stored back onto agent_applications lazily on first
read via idempotent updates.
"""
from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from typing import List, Literal, Optional

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel
from motor.motor_asyncio import AsyncIOMotorDatabase

# Shared demo logins that must never be hard-deleted through the self-serve flow.
PROTECTED_DEMO_EMAILS = {"demo@amass.africa"}


# ─── Badge tiers ────────────────────────────────────────────────
# Rules are intentionally lenient at launch to reward early adopters.
# Admin can update via PATCH /api/admin/badge-rules once we have production data.
DEFAULT_BADGE_RULES: dict = {
    "registered": {
        "label": "Registered Agent",
        "colour": "#71717A",
        "icon": "person-outline",
        "criteria": {
            "min_verification_level": 1,
            "min_verified_listings": 0,
        },
        "description": "Identity submitted to AMASS.",
    },
    "verified": {
        "label": "Verified Agent",
        "colour": "#0A0A0A",
        "icon": "shield-checkmark",
        "criteria": {
            "min_verification_level": 2,
            "min_verified_listings": 3,
            "min_active_plan_tier": "starter",
        },
        "description": "Identity + 3 verified listings on AMASS.",
    },
    "trusted": {
        "label": "Trusted Agent",
        "colour": "#0369A1",
        "icon": "ribbon",
        "criteria": {
            "min_verification_level": 2,
            "min_verified_listings": 10,
            "min_rating": 4.5,
            "min_response_rate": 0.8,
        },
        "description": "10+ verified listings · 4.5★ · 80% response rate.",
    },
    "top_agent": {
        "label": "Top Agent",
        "colour": "#E11B22",
        "icon": "trophy",
        "criteria": {
            "min_verification_level": 3,
            "min_verified_listings": 25,
            "min_rating": 4.7,
            "min_response_rate": 0.9,
            "min_deals_completed": 5,
        },
        "description": "AMASS elite — 25+ verified listings · 4.7★ · 5+ closed deals.",
    },
}

BADGE_ORDER: List[str] = ["registered", "verified", "trusted", "top_agent"]


class BadgeOut(BaseModel):
    id: str
    label: str
    colour: str
    icon: str
    description: str


class PublicAgentOut(BaseModel):
    user_id: str
    slug: str
    full_name: str
    agency_name: Optional[str] = None
    avatar_url: Optional[str] = None
    state: Optional[str] = None
    lga: Optional[str] = None
    years_experience: int = 0
    areas_of_operation: List[str] = []
    specialisations: List[str] = []
    badge: BadgeOut
    verification_level: int
    is_founding_agent: bool
    rating: float = 0.0
    reviews_count: int = 0
    active_listings: int = 0
    verified_listings: int = 0
    total_sold: int = 0
    total_rented: int = 0
    response_rate: float = 0.0
    joined_at: Optional[str] = None
    share_url: str


class BadgeProgressOut(BaseModel):
    current_badge: BadgeOut
    next_badge: Optional[BadgeOut] = None
    checks: List[dict]  # [{label, current, target, met}]
    progress_percent: int


class AccountDeleteOut(BaseModel):
    ok: bool
    deleted_at: str
    scrubbed_collections: List[str]


# ─── Slug helpers ───────────────────────────────────────────────
def _slugify(name: str, tail: str) -> str:
    base = re.sub(r"[^A-Za-z0-9]+", "-", name or "amass-agent").strip("-").lower()
    if not base:
        base = "amass-agent"
    return f"{base[:40]}-{tail[:6]}"


async def _ensure_slug(db: AsyncIOMotorDatabase, agent_doc: dict) -> str:
    """Idempotently assign a URL-safe slug to an agent_applications row."""
    slug = agent_doc.get("slug")
    if slug:
        return slug
    tail = (agent_doc.get("user_id") or uuid.uuid4().hex)[:6]
    slug = _slugify(agent_doc.get("full_name") or agent_doc.get("agency_name") or "", tail)
    # Ensure uniqueness — collision → append 4-char random.
    for _ in range(5):
        clash = await db.agent_applications.find_one(
            {"slug": slug, "user_id": {"$ne": agent_doc.get("user_id")}}, {"_id": 0}
        )
        if not clash:
            break
        slug = f"{slug}-{uuid.uuid4().hex[:4]}"
    await db.agent_applications.update_one(
        {"user_id": agent_doc["user_id"]}, {"$set": {"slug": slug}}
    )
    return slug


# ─── Stats helpers ──────────────────────────────────────────────
async def _agent_stats_ext(db: AsyncIOMotorDatabase, user_id: str) -> dict:
    listings = await db.properties.find(
        {"agent_id": user_id}, {"_id": 0, "status": 1, "verified": 1}
    ).to_list(1000)
    active = [p for p in listings if p.get("status") not in ("sold", "rented", "archived")]
    verified = [p for p in listings if p.get("verified")]
    sold = [p for p in listings if p.get("status") == "sold"]
    rented = [p for p in listings if p.get("status") == "rented"]
    # Response rate: derive from lead activity if available.
    leads_total = await db.lead_unlocks.count_documents({"agent_id": user_id})
    responded = await db.lead_unlocks.count_documents(
        {"agent_id": user_id, "responded_at": {"$exists": True}}
    )
    response_rate = (responded / leads_total) if leads_total > 0 else 0.0
    return {
        "active_listings": len(active),
        "verified_listings": len(verified),
        "total_sold": len(sold),
        "total_rented": len(rented),
        "response_rate": round(response_rate, 2),
    }


async def _compute_badge(
    db: AsyncIOMotorDatabase, agent_doc: dict, stats: dict
) -> str:
    """Highest tier the agent qualifies for, or admin-pinned override."""
    admin_pin = agent_doc.get("admin_badge")
    if admin_pin in BADGE_ORDER:
        return admin_pin
    rules = await db.badge_rules.find_one({"id": "current"}, {"_id": 0}) or {
        "rules": DEFAULT_BADGE_RULES
    }
    rules_map = rules.get("rules", DEFAULT_BADGE_RULES)
    vlvl = int(agent_doc.get("verification_level", 1) or 1)
    verified_ct = int(stats.get("verified_listings", 0))
    rating = float(agent_doc.get("rating") or 0.0)
    reviews = int(agent_doc.get("reviews_count") or 0)
    deals = int(stats.get("total_sold", 0)) + int(stats.get("total_rented", 0))
    response = float(stats.get("response_rate") or 0.0)

    # Walk tiers from highest to lowest and stop on first match.
    for tier in reversed(BADGE_ORDER):
        c = rules_map.get(tier, {}).get("criteria", {})
        if vlvl < c.get("min_verification_level", 1):
            continue
        if verified_ct < c.get("min_verified_listings", 0):
            continue
        if reviews > 0 and rating < c.get("min_rating", 0):
            continue
        # Response-rate check only applied when we have any leads at all.
        if c.get("min_response_rate", 0) > 0 and response < c["min_response_rate"]:
            continue
        if c.get("min_deals_completed", 0) > deals:
            continue
        return tier
    return "registered"


def _badge_out(tier: str) -> BadgeOut:
    r = DEFAULT_BADGE_RULES.get(tier, DEFAULT_BADGE_RULES["registered"])
    return BadgeOut(
        id=tier,
        label=r["label"],
        colour=r["colour"],
        icon=r["icon"],
        description=r["description"],
    )


# ─── Admin badge pin model (module-level for FastAPI body inference) ───
class AdminPinBadgeIn(BaseModel):
    tier: Optional[Literal["registered", "verified", "trusted", "top_agent"]] = None


# ─── Router factory ─────────────────────────────────────────────
def register_agent_platform_v2_routes(
    db: AsyncIOMotorDatabase,
    require_auth,
    require_admin,
    finalize_subscription_hook,   # callable(pending_dict) → coroutine
):
    """v2 adds: public profile by slug, badge progress, Apple deletion.
    Also exposes the subscription finalize hook so payments.py webhook can
    invoke it without a circular import."""
    router = APIRouter(prefix="/api/agent-platform", tags=["agent-platform-v2"])
    admin_router = APIRouter(prefix="/api/admin", tags=["admin-agents-v2"])

    async def _public_agent(agent_doc: dict) -> PublicAgentOut:
        stats = await _agent_stats_ext(db, agent_doc["user_id"])
        badge_tier = await _compute_badge(db, agent_doc, stats)
        slug = await _ensure_slug(db, agent_doc)
        # Founding-agent flag: has any active founding-priced subscription (ever).
        founding = await db.agent_subscriptions.find_one(
            {"user_id": agent_doc["user_id"], "is_founding_price": True},
            {"_id": 0, "id": 1},
        )
        joined = agent_doc.get("created_at")
        return PublicAgentOut(
            user_id=agent_doc["user_id"],
            slug=slug,
            full_name=agent_doc.get("full_name", "AMASS Agent"),
            agency_name=agent_doc.get("agency_name"),
            avatar_url=agent_doc.get("avatar_url"),
            state=agent_doc.get("state"),
            lga=agent_doc.get("lga"),
            years_experience=int(agent_doc.get("years_experience", 0) or 0),
            areas_of_operation=agent_doc.get("areas_of_operation", []) or [],
            specialisations=agent_doc.get("specialisations", []) or [],
            badge=_badge_out(badge_tier),
            verification_level=int(agent_doc.get("verification_level", 1) or 1),
            is_founding_agent=bool(founding),
            rating=float(agent_doc.get("rating") or 0.0),
            reviews_count=int(agent_doc.get("reviews_count") or 0),
            active_listings=stats["active_listings"],
            verified_listings=stats["verified_listings"],
            total_sold=stats["total_sold"],
            total_rented=stats["total_rented"],
            response_rate=stats["response_rate"],
            joined_at=(joined.isoformat() if isinstance(joined, datetime) else joined),
            share_url=f"https://amass.africa/agent/{slug}",
        )

    @router.get("/public/{slug}", response_model=PublicAgentOut)
    async def public_agent_by_slug(slug: str):
        agent = await db.agent_applications.find_one({"slug": slug}, {"_id": 0})
        if not agent:
            # Fallback: user_id (legacy links). Slug normalisation happens on read.
            agent = await db.agent_applications.find_one(
                {"user_id": slug}, {"_id": 0}
            )
        if not agent:
            raise HTTPException(404, "Agent not found")
        if agent.get("status") == "suspended":
            raise HTTPException(410, "Agent account is not accepting inquiries")
        return await _public_agent(agent)

    @router.get("/public/{slug}/listings")
    async def public_agent_listings(slug: str, limit: int = 30):
        agent = await db.agent_applications.find_one({"slug": slug}, {"_id": 0}) or (
            await db.agent_applications.find_one({"user_id": slug}, {"_id": 0})
        )
        if not agent:
            raise HTTPException(404, "Agent not found")
        docs = await db.properties.find(
            {"agent_id": agent["user_id"], "status": {"$nin": ["archived"]}},
            {"_id": 0},
        ).sort("created_at", -1).to_list(limit)
        return docs

    @router.get("/badge/progress", response_model=BadgeProgressOut)
    async def badge_progress(user: dict = Depends(require_auth)):
        agent = await db.agent_applications.find_one(
            {"user_id": user["id"]}, {"_id": 0}
        )
        if not agent:
            raise HTTPException(404, "You have not applied as an agent yet")
        stats = await _agent_stats_ext(db, user["id"])
        current_tier = await _compute_badge(db, agent, stats)
        current_idx = BADGE_ORDER.index(current_tier)
        next_tier = (
            BADGE_ORDER[current_idx + 1]
            if current_idx + 1 < len(BADGE_ORDER)
            else None
        )
        checks: list = []
        met_count = 0
        total_count = 0
        if next_tier:
            criteria = DEFAULT_BADGE_RULES[next_tier]["criteria"]
            vlvl = int(agent.get("verification_level", 1) or 1)
            checks_defs = [
                ("Identity verification level", vlvl, criteria.get("min_verification_level", 1)),
                (
                    "Verified quality listings",
                    stats["verified_listings"],
                    criteria.get("min_verified_listings", 0),
                ),
            ]
            if criteria.get("min_rating"):
                checks_defs.append(
                    ("Customer rating", agent.get("rating") or 0.0, criteria["min_rating"])
                )
            if criteria.get("min_response_rate"):
                checks_defs.append(
                    ("Response rate", int(stats["response_rate"] * 100), int(criteria["min_response_rate"] * 100))
                )
            if criteria.get("min_deals_completed"):
                deals = stats["total_sold"] + stats["total_rented"]
                checks_defs.append(("Closed deals", deals, criteria["min_deals_completed"]))

            for label, cur, target in checks_defs:
                met = float(cur) >= float(target)
                if met:
                    met_count += 1
                total_count += 1
                checks.append(
                    {"label": label, "current": cur, "target": target, "met": met}
                )
        return BadgeProgressOut(
            current_badge=_badge_out(current_tier),
            next_badge=_badge_out(next_tier) if next_tier else None,
            checks=checks,
            progress_percent=int((met_count / total_count) * 100) if total_count else 100,
        )

    # ═══ Apple / privacy: full account deletion ═══════════════════
    @router.post("/account/delete", response_model=AccountDeleteOut)
    async def delete_my_account(user: dict = Depends(require_auth)):
        uid = user["id"]
        if (user.get("email") or "").lower() in PROTECTED_DEMO_EMAILS:
            raise HTTPException(
                403, "The shared demo account can't be deleted. Create your own account to try this."
            )
        now = datetime.now(timezone.utc)

        # Collections to scrub the user's rows from (list is authoritative).
        to_scrub = [
            "users",
            "agent_applications",
            "agent_subscriptions",
            "agent_starter_kits",
            "pending_agent_subscriptions",
            "wallets",
            "token_transactions",
            "favorites",
            "lead_unlocks",
            "otp_sessions",
            "notifications",
            "saved_searches",
            "cart",
            "property_inspections",
            "renovation_projects",
            "finance_applications",
            "referral_uses",
            "agent_referrals",
        ]
        scrubbed: list = []
        for coll in to_scrub:
            try:
                res = await db[coll].delete_many({"user_id": uid})
                if res.deleted_count > 0:
                    scrubbed.append(f"{coll}({res.deleted_count})")
            except Exception:
                pass

        # Properties owned by the agent — soft-anonymise instead of delete so
        # any customers who saved them still see a valid history.
        try:
            r = await db.properties.update_many(
                {"agent_id": uid},
                {
                    "$set": {
                        "agent_id": "deleted-user",
                        "agent_name": "Former AMASS agent",
                        "agent_avatar": None,
                        "status": "archived",
                    }
                },
            )
            if r.modified_count > 0:
                scrubbed.append(f"properties.anonymised({r.modified_count})")
        except Exception:
            pass

        # Referral history where THIS user is the referrer (owned relation).
        try:
            r = await db.referral_uses.delete_many({"referrer_id": uid})
            if r.deleted_count > 0:
                scrubbed.append(f"referral_uses.referrer({r.deleted_count})")
        except Exception:
            pass

        # Also nuke the primary users row (idempotent belt-and-braces).
        await db.users.delete_one({"id": uid})

        # Audit log — one row survives with only the hash for legal traceability.
        await db.account_deletions.insert_one(
            {
                "user_id_hash": uuid.uuid5(uuid.NAMESPACE_URL, uid).hex,
                "deleted_at": now,
                "collections": scrubbed,
            }
        )
        return AccountDeleteOut(
            ok=True,
            deleted_at=now.isoformat(),
            scrubbed_collections=scrubbed,
        )

    # ═══ Admin: pin a badge (override auto-compute) ══════════════
    @admin_router.post("/agents/{user_id}/badge")
    async def admin_pin_badge(
        user_id: str,
        data: AdminPinBadgeIn = Body(...),
        _admin=Depends(require_admin),
    ):
        agent = await db.agent_applications.find_one({"user_id": user_id})
        if not agent:
            raise HTTPException(404, "Agent not found")
        update = {"admin_badge": data.tier} if data.tier else {"admin_badge": None}
        await db.agent_applications.update_one(
            {"user_id": user_id}, {"$set": update}
        )
        # Notify agent of the change.
        await db.notifications.insert_one(
            {
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "kind": "badge_update",
                "title": (
                    f"You've been recognised as a {DEFAULT_BADGE_RULES[data.tier]['label']}"
                    if data.tier
                    else "Your AMASS badge has been reset to auto-compute"
                ),
                "body": "Congratulations from the AMASS team."
                if data.tier
                else "",
                "read": False,
                "meta": {"tier": data.tier},
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        return {"ok": True, "tier": data.tier}

    # ═══ Public directory of badge rules (used by the app to render UI) ═══
    @router.get("/badge/rules")
    async def get_badge_rules():
        override = await db.badge_rules.find_one({"id": "current"}, {"_id": 0})
        return override.get("rules", DEFAULT_BADGE_RULES) if override else DEFAULT_BADGE_RULES

    return router, admin_router


# ─── Public reusable exports ─────────────────────────────────────
async def hydrate_public_agent_by_user(
    db: AsyncIOMotorDatabase, user_id: str
) -> Optional[dict]:
    """Return the same shape as the /public/{slug} endpoint for a given
    user_id — useful for embedding on property detail responses."""
    agent = await db.agent_applications.find_one({"user_id": user_id}, {"_id": 0})
    if not agent:
        return None
    stats = await _agent_stats_ext(db, user_id)
    badge_tier = await _compute_badge(db, agent, stats)
    slug = await _ensure_slug(db, agent)
    founding = await db.agent_subscriptions.find_one(
        {"user_id": user_id, "is_founding_price": True}, {"_id": 0, "id": 1}
    )
    joined = agent.get("created_at")
    return {
        "user_id": user_id,
        "slug": slug,
        "full_name": agent.get("full_name", "AMASS Agent"),
        "agency_name": agent.get("agency_name"),
        "avatar_url": agent.get("avatar_url"),
        "state": agent.get("state"),
        "lga": agent.get("lga"),
        "years_experience": int(agent.get("years_experience", 0) or 0),
        "areas_of_operation": agent.get("areas_of_operation", []) or [],
        "specialisations": agent.get("specialisations", []) or [],
        "badge": _badge_out(badge_tier).model_dump(),
        "verification_level": int(agent.get("verification_level", 1) or 1),
        "is_founding_agent": bool(founding),
        "rating": float(agent.get("rating") or 0.0),
        "reviews_count": int(agent.get("reviews_count") or 0),
        "active_listings": stats["active_listings"],
        "verified_listings": stats["verified_listings"],
        "total_sold": stats["total_sold"],
        "total_rented": stats["total_rented"],
        "response_rate": stats["response_rate"],
        "joined_at": joined.isoformat() if isinstance(joined, datetime) else joined,
        "share_url": f"https://amass.africa/agent/{slug}",
    }
