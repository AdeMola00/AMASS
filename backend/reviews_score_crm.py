"""AMASS Agent Ecosystem — Phase 4: Reviews · Agent Score · Analytics · Lead CRM

Adds the trust, performance and CRM primitives that turn AMASS from a
listings marketplace into a full operating platform for agents.

REVIEWS
  • Customers rate agents 1-5 with an optional written review.
  • Anti-spam guardrails: no self-review, one review per reviewer per agent
    (updates existing review), review only allowed after a "meaningful
    interaction" (property unlocked OR share event OR admin override).
  • Admin moderation: pending → approved | rejected | flagged.
  • On approval the agent's rolling `rating` + `reviews_count` are recomputed
    (used by the Phase 2 badge engine and the Agent Score below).

AGENT SCORE
  • Transparent 0-100 score with a factor breakdown the agent can act on.
  • Six weighted factors, all computed on read from actual platform data.

ANALYTICS
  • Aggregate dashboard: property views, profile views, leads, WhatsApp
    clicks, contact clicks, inspection requests, share breakdown,
    top-performing listings, response rate, and 30-day trend.
  • Reuses share_events, lead_unlocks, property_inspections, properties.

LEAD CRM
  • Real lead pipeline built on top of the existing `lead_unlocks` table
    (created on POST /api/agent/leads/unlock). Adds status, notes, next
    follow-up and last-contact fields.
  • Statuses: new · contacted · inspection_scheduled · negotiating · won · lost.
  • Agency lead assignment (assign to a team member — Phase 5 will build the
    team invite flow, this ships the endpoint so it's ready).
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone, timedelta
from typing import List, Literal, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from motor.motor_asyncio import AsyncIOMotorDatabase

from agency_teams import hydrate_leads, lead_access, my_leads_query


# ─── Score weighting (admin-configurable in a later phase) ──────
SCORE_WEIGHTS = {
    "profile_completeness": 15,   # KYC + photo + bio + coverage areas
    "listing_quality": 25,        # verified listings + avg photos
    "response_rate": 20,          # lead_unlocks responded_at / total
    "customer_rating": 20,        # rolling rating scaled 0-20
    "activity": 10,               # listings updated in last 30 days
    "deals_closed": 10,           # sold + rented totals
}
LEAD_STATUSES = [
    "new",
    "contacted",
    "inspection_scheduled",
    "negotiating",
    "won",
    "lost",
]


# ─── Pydantic models ────────────────────────────────────────────
class ReviewCreateIn(BaseModel):
    rating: int = Field(..., ge=1, le=5)
    review_text: Optional[str] = Field(None, max_length=1000)
    transaction_context: Optional[
        Literal["inspection", "purchase", "rental", "consultation", "general"]
    ] = "general"


class ReviewOut(BaseModel):
    id: str
    agent_id: str
    reviewer_id: str
    reviewer_name: Optional[str] = None
    reviewer_avatar: Optional[str] = None
    rating: int
    review_text: Optional[str] = None
    transaction_context: str
    status: Literal["pending", "approved", "rejected", "flagged"]
    created_at: datetime
    moderated_at: Optional[datetime] = None
    admin_note: Optional[str] = None


class ReviewModerationIn(BaseModel):
    action: Literal["approve", "reject", "flag"]
    admin_note: Optional[str] = None


class ReviewReportIn(BaseModel):
    reason: str = Field(..., max_length=280)


class ScoreFactorOut(BaseModel):
    id: str
    label: str
    value: int   # 0-100 per-factor score
    weight: int  # its contribution weight
    weighted: int  # value * weight / 100
    hint: str    # actionable advice


class AgentScoreOut(BaseModel):
    score: int  # 0-100
    tier: str   # informational label mirroring badge tiers
    factors: List[ScoreFactorOut]
    updated_at: datetime


class LeadUpdateIn(BaseModel):
    status: Optional[str] = None  # LEAD_STATUSES
    next_follow_up_at: Optional[datetime] = None
    last_contact_at: Optional[datetime] = None


class LeadNoteIn(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000)


class AnalyticsOut(BaseModel):
    period_days: int
    property_views: int
    profile_views: int
    leads: int
    inspection_requests: int
    shares_total: int
    shares_by_channel: dict
    response_rate: float
    top_property: Optional[dict] = None
    lead_pipeline: dict  # counts by status
    updated_at: datetime


# ─── Router factory ─────────────────────────────────────────────
def register_phase4_routes(
    db: AsyncIOMotorDatabase, require_auth, require_admin
):
    router = APIRouter(prefix="/api", tags=["reviews-crm-analytics"])
    admin_router = APIRouter(prefix="/api/admin", tags=["admin-reviews"])

    # ─────────────────────────────────────────────────────────
    # REVIEWS
    # ─────────────────────────────────────────────────────────
    async def _has_meaningful_interaction(reviewer_id: str, agent_user_id: str) -> bool:
        """Guardrail: only reviewers who have interacted with an agent's
        listings (unlocked or shared or inspected) can leave a review."""
        # 1) Unlocked one of the agent's properties
        n = await db.lead_unlocks.count_documents(
            {"user_id": reviewer_id, "agent_id": agent_user_id}
        )
        if n:
            return True
        # 2) Requested an inspection on one of the agent's properties
        agent_props = await db.properties.find(
            {"agent_id": agent_user_id}, {"_id": 0, "id": 1}
        ).to_list(200)
        agent_prop_ids = [p["id"] for p in agent_props]
        if agent_prop_ids:
            n2 = await db.property_inspections.count_documents(
                {"user_id": reviewer_id, "property_id": {"$in": agent_prop_ids}}
            )
            if n2:
                return True
            # 3) Shared one of the agent's listings
            n3 = await db.share_events.count_documents(
                {"user_id": reviewer_id, "target_id": {"$in": agent_prop_ids}}
            )
            if n3:
                return True
        return False

    async def _recompute_agent_rating(agent_user_id: str) -> None:
        pipeline = [
            {"$match": {"agent_id": agent_user_id, "status": "approved"}},
            {"$group": {"_id": None, "avg": {"$avg": "$rating"}, "n": {"$sum": 1}}},
        ]
        agg = await db.agent_reviews.aggregate(pipeline).to_list(1)
        avg = round(agg[0]["avg"], 2) if agg else 0.0
        n = agg[0]["n"] if agg else 0
        await db.agent_applications.update_one(
            {"user_id": agent_user_id},
            {"$set": {"rating": avg, "reviews_count": n}},
        )

    @router.post("/reviews/agent/{agent_user_id}", response_model=ReviewOut)
    async def create_review(
        agent_user_id: str,
        data: ReviewCreateIn,
        user: dict = Depends(require_auth),
    ):
        if agent_user_id == user["id"]:
            raise HTTPException(400, "You can't review yourself.")
        agent = await db.agent_applications.find_one({"user_id": agent_user_id}, {"_id": 0})
        if not agent:
            raise HTTPException(404, "Agent not found")

        # Anti-spam: require a real interaction (admins & test users exempt)
        if not user.get("is_admin"):
            ok = await _has_meaningful_interaction(user["id"], agent_user_id)
            if not ok:
                raise HTTPException(
                    403,
                    "Reviews are open only after you've unlocked, inspected or shared "
                    "one of this agent's listings.",
                )

        now = datetime.now(timezone.utc)
        # Upsert per (reviewer, agent) — one review per pair. Pending status
        # is intentional so admins moderate before public display.
        existing = await db.agent_reviews.find_one(
            {"reviewer_id": user["id"], "agent_id": agent_user_id},
            {"_id": 0},
        )
        review_id = existing["id"] if existing else str(uuid.uuid4())
        set_doc = {
            "id": review_id,
            "agent_id": agent_user_id,
            "reviewer_id": user["id"],
            "reviewer_name": user.get("full_name"),
            "reviewer_avatar": user.get("avatar_url"),
            "rating": data.rating,
            "review_text": (data.review_text or "").strip() or None,
            "transaction_context": data.transaction_context or "general",
            "status": "pending",
            "created_at": existing["created_at"] if existing else now,
            "updated_at": now,
            "admin_note": None,
            "moderated_at": None,
        }
        await db.agent_reviews.update_one(
            {"reviewer_id": user["id"], "agent_id": agent_user_id},
            {"$set": set_doc},
            upsert=True,
        )
        # Notify the agent
        from notification_center import emit
        await emit(
            db, agent_user_id, "review_received",
            "New review pending approval",
            f"{data.rating}★ — awaiting moderation before it goes live.",
            {"review_id": review_id},
            action_url="/agent-score",
        )
        return ReviewOut(**set_doc)

    @router.get("/reviews/agent/{agent_slug}", response_model=List[ReviewOut])
    async def list_agent_reviews(agent_slug: str, limit: int = 20):
        agent = await db.agent_applications.find_one(
            {"slug": agent_slug}, {"_id": 0}
        ) or await db.agent_applications.find_one(
            {"user_id": agent_slug}, {"_id": 0}
        )
        if not agent:
            raise HTTPException(404, "Agent not found")
        docs = await db.agent_reviews.find(
            {"agent_id": agent["user_id"], "status": "approved"}, {"_id": 0}
        ).sort("created_at", -1).to_list(limit)
        return [ReviewOut(**d) for d in docs]

    @router.get("/reviews/mine", response_model=List[ReviewOut])
    async def my_reviews(user: dict = Depends(require_auth)):
        docs = await db.agent_reviews.find(
            {"reviewer_id": user["id"]}, {"_id": 0}
        ).sort("created_at", -1).to_list(50)
        return [ReviewOut(**d) for d in docs]

    @router.post("/reviews/{review_id}/report")
    async def report_review(
        review_id: str, data: ReviewReportIn, user: dict = Depends(require_auth)
    ):
        r = await db.agent_reviews.find_one({"id": review_id}, {"_id": 0})
        if not r:
            raise HTTPException(404, "Review not found")
        now = datetime.now(timezone.utc)
        await db.agent_review_reports.insert_one(
            {
                "id": str(uuid.uuid4()),
                "review_id": review_id,
                "reporter_id": user["id"],
                "reason": data.reason,
                "created_at": now,
            }
        )
        # Auto-flag on 2+ reports
        rc = await db.agent_review_reports.count_documents({"review_id": review_id})
        if rc >= 2 and r.get("status") != "flagged":
            await db.agent_reviews.update_one(
                {"id": review_id}, {"$set": {"status": "flagged"}}
            )
        return {"ok": True, "reports": rc}

    # Admin moderation
    @admin_router.get("/reviews")
    async def admin_list_reviews(
        status: Optional[str] = Query(None),
        _admin=Depends(require_admin),
    ):
        filt: dict = {}
        if status:
            filt["status"] = status
        return await db.agent_reviews.find(filt, {"_id": 0}).sort(
            "created_at", -1
        ).to_list(200)

    @admin_router.post("/reviews/{review_id}/moderate")
    async def admin_moderate_review(
        review_id: str,
        data: ReviewModerationIn = Body(...),
        _admin=Depends(require_admin),
    ):
        r = await db.agent_reviews.find_one({"id": review_id})
        if not r:
            raise HTTPException(404, "Review not found")
        status_map = {"approve": "approved", "reject": "rejected", "flag": "flagged"}
        new_status = status_map[data.action]
        now = datetime.now(timezone.utc)
        await db.agent_reviews.update_one(
            {"id": review_id},
            {
                "$set": {
                    "status": new_status,
                    "moderated_at": now,
                    "admin_note": data.admin_note,
                }
            },
        )
        if new_status == "approved" or r.get("status") == "approved":
            await _recompute_agent_rating(r["agent_id"])
        # Notify reviewer
        title = {
            "approved": "Your AMASS review is now live",
            "rejected": "Your AMASS review couldn't be approved",
            "flagged": "Your AMASS review needs more info",
        }[new_status]
        from notification_center import emit
        await emit(
            db, r["reviewer_id"], "review_moderation",
            title,
            data.admin_note or "",
            {"review_id": review_id, "status": new_status},
        )
        return {"ok": True, "status": new_status}

    # ─────────────────────────────────────────────────────────
    # AGENT SCORE (transparent 0-100)
    # ─────────────────────────────────────────────────────────
    async def _compute_score(agent_doc: dict) -> AgentScoreOut:
        uid = agent_doc["user_id"]
        # Fetch dependent data in parallel-ish (motor is async).
        listings = await db.properties.find(
            {"agent_id": uid}, {"_id": 0, "verified": 1, "images": 1, "status": 1, "updated_at": 1}
        ).to_list(500)
        total = len(listings)
        verified = sum(1 for p in listings if p.get("verified"))
        avg_photos = (
            sum(len(p.get("images") or []) for p in listings) / total if total else 0
        )
        sold = sum(1 for p in listings if p.get("status") == "sold")
        rented = sum(1 for p in listings if p.get("status") == "rented")

        # Response metrics from lead_unlocks (fallback: 0 if no leads yet)
        leads_total = await db.lead_unlocks.count_documents({"agent_id": uid})
        responded = await db.lead_unlocks.count_documents(
            {"agent_id": uid, "responded_at": {"$exists": True}}
        )
        response_rate = responded / leads_total if leads_total else 0.0

        # Activity: listings updated in the last 30 days
        cutoff = datetime.now(timezone.utc) - timedelta(days=30)
        recent = 0
        for p in listings:
            u = p.get("updated_at")
            if u and isinstance(u, datetime):
                if u.tzinfo is None:
                    u = u.replace(tzinfo=timezone.utc)
                if u >= cutoff:
                    recent += 1

        vlvl = int(agent_doc.get("verification_level", 1) or 1)
        has_photo = bool(agent_doc.get("avatar_url"))
        has_bio = bool(agent_doc.get("bio") or agent_doc.get("about"))
        coverage = len(agent_doc.get("areas_of_operation") or [])
        rating = float(agent_doc.get("rating") or 0.0)
        reviews_count = int(agent_doc.get("reviews_count") or 0)

        # Factor computation — each factor scored 0..100.
        f_profile = min(
            100,
            (vlvl - 1) * 40  # 0/40/80 for level 1/2/3
            + (20 if has_photo else 0)
            + (20 if has_bio else 0)
            + min(20, coverage * 5),
        )
        f_listing = 0 if total == 0 else min(
            100, int((verified / max(1, total)) * 70 + min(30, avg_photos * 3))
        )
        f_response = int(response_rate * 100)
        # Rating factor: scale rating (0..5) to 0..100, dampen when few reviews.
        rating_component = int((rating / 5) * 100) if reviews_count else 0
        confidence = min(1.0, reviews_count / 10)  # 10+ reviews = full confidence
        f_rating = int(rating_component * confidence)
        f_activity = min(100, recent * 25)  # 4+ recent updates = 100
        f_deals = min(100, (sold + rented) * 20)  # 5+ deals = 100

        factors = [
            ScoreFactorOut(
                id="profile_completeness",
                label="Profile completeness",
                value=f_profile,
                weight=SCORE_WEIGHTS["profile_completeness"],
                weighted=int(f_profile * SCORE_WEIGHTS["profile_completeness"] / 100),
                hint=(
                    "Add a profile photo, bio and your coverage areas."
                    if f_profile < 80
                    else "Great — your profile is complete."
                ),
            ),
            ScoreFactorOut(
                id="listing_quality",
                label="Listing quality",
                value=f_listing,
                weight=SCORE_WEIGHTS["listing_quality"],
                weighted=int(f_listing * SCORE_WEIGHTS["listing_quality"] / 100),
                hint=(
                    "Add 5+ verified listings with 8+ photos each."
                    if f_listing < 70
                    else "Your listings are high-quality."
                ),
            ),
            ScoreFactorOut(
                id="response_rate",
                label="Response rate",
                value=f_response,
                weight=SCORE_WEIGHTS["response_rate"],
                weighted=int(f_response * SCORE_WEIGHTS["response_rate"] / 100),
                hint=(
                    "Reply to leads faster to improve this."
                    if f_response < 80
                    else "You reply to almost every lead."
                ),
            ),
            ScoreFactorOut(
                id="customer_rating",
                label="Customer rating",
                value=f_rating,
                weight=SCORE_WEIGHTS["customer_rating"],
                weighted=int(f_rating * SCORE_WEIGHTS["customer_rating"] / 100),
                hint=(
                    "Encourage reviews from happy customers."
                    if reviews_count < 5
                    else "Your customer rating is strong."
                ),
            ),
            ScoreFactorOut(
                id="activity",
                label="Recent activity",
                value=f_activity,
                weight=SCORE_WEIGHTS["activity"],
                weighted=int(f_activity * SCORE_WEIGHTS["activity"] / 100),
                hint=(
                    "Update or add listings this month."
                    if f_activity < 50
                    else "You're active on AMASS."
                ),
            ),
            ScoreFactorOut(
                id="deals_closed",
                label="Deals closed",
                value=f_deals,
                weight=SCORE_WEIGHTS["deals_closed"],
                weighted=int(f_deals * SCORE_WEIGHTS["deals_closed"] / 100),
                hint=(
                    "Mark listings as Sold/Rented when they complete."
                    if f_deals < 50
                    else "You've closed multiple deals on AMASS."
                ),
            ),
        ]
        score = sum(f.weighted for f in factors)
        tier = (
            "Top Agent"
            if score >= 85
            else "Trusted Agent"
            if score >= 70
            else "Verified Agent"
            if score >= 50
            else "Registered Agent"
        )
        return AgentScoreOut(
            score=score, tier=tier, factors=factors, updated_at=datetime.now(timezone.utc)
        )

    @router.get("/agent/score", response_model=AgentScoreOut)
    async def my_agent_score(user: dict = Depends(require_auth)):
        agent = await db.agent_applications.find_one({"user_id": user["id"]}, {"_id": 0})
        if not agent:
            raise HTTPException(404, "You have not applied as an agent yet")
        return await _compute_score(agent)

    @router.get("/agent/{agent_slug}/score", response_model=AgentScoreOut)
    async def agent_score_by_slug(agent_slug: str):
        agent = await db.agent_applications.find_one({"slug": agent_slug}, {"_id": 0}) or (
            await db.agent_applications.find_one({"user_id": agent_slug}, {"_id": 0})
        )
        if not agent:
            raise HTTPException(404, "Agent not found")
        return await _compute_score(agent)

    # ─────────────────────────────────────────────────────────
    # ANALYTICS
    # ─────────────────────────────────────────────────────────
    @router.get("/agent/analytics", response_model=AnalyticsOut)
    async def my_analytics(
        period_days: int = Query(30, ge=1, le=365),
        user: dict = Depends(require_auth),
    ):
        cutoff = datetime.now(timezone.utc) - timedelta(days=period_days)
        agent_id = user["id"]
        # Total property views (denormalised on properties.views_count).
        pipeline = [
            {"$match": {"agent_id": agent_id}},
            {"$group": {"_id": None, "views": {"$sum": {"$ifNull": ["$views_count", 0]}}}},
        ]
        agg = await db.properties.aggregate(pipeline).to_list(1)
        property_views = int(agg[0]["views"]) if agg else 0

        # Profile views (denormalised on agent_applications).
        agent = await db.agent_applications.find_one(
            {"user_id": agent_id}, {"_id": 0, "profile_views": 1}
        ) or {}
        profile_views = int(agent.get("profile_views") or 0)

        # Leads received within the period.
        leads = await db.lead_unlocks.count_documents(
            {"agent_id": agent_id, "created_at": {"$gte": cutoff}}
        )
        # Inspection requests within the period.
        agent_props = await db.properties.find(
            {"agent_id": agent_id}, {"_id": 0, "id": 1, "title": 1, "views_count": 1, "images": 1}
        ).to_list(500)
        agent_prop_ids = [p["id"] for p in agent_props]
        inspection_requests = (
            await db.property_inspections.count_documents(
                {"property_id": {"$in": agent_prop_ids}, "created_at": {"$gte": cutoff}}
            )
            if agent_prop_ids
            else 0
        )

        # Shares in period + per-channel breakdown.
        shares_pipeline = [
            {
                "$match": {
                    "target_id": {"$in": agent_prop_ids},
                    "created_at": {"$gte": cutoff},
                }
            },
            {"$group": {"_id": "$channel", "n": {"$sum": 1}}},
        ] if agent_prop_ids else []
        shares_by_channel: dict = {}
        if agent_prop_ids:
            async for row in db.share_events.aggregate(shares_pipeline):
                shares_by_channel[row["_id"]] = row["n"]
        shares_total = sum(shares_by_channel.values())

        # Response rate — lifetime (not period), because lead volume is small.
        leads_total = await db.lead_unlocks.count_documents({"agent_id": agent_id})
        responded = await db.lead_unlocks.count_documents(
            {"agent_id": agent_id, "responded_at": {"$exists": True}}
        )
        response_rate = round((responded / leads_total), 2) if leads_total else 0.0

        # Top-performing property in the period.
        top_property = None
        if agent_props:
            top = max(agent_props, key=lambda p: int(p.get("views_count") or 0))
            if int(top.get("views_count") or 0) > 0:
                top_property = {
                    "id": top["id"],
                    "title": top.get("title"),
                    "views": int(top.get("views_count") or 0),
                    "image": (top.get("images") or [None])[0],
                }

        # Lead pipeline breakdown (all-time, so agents see funnel).
        pipeline_counts: dict = {s: 0 for s in LEAD_STATUSES}
        async for row in db.lead_unlocks.aggregate(
            [
                {"$match": {"agent_id": agent_id}},
                {
                    "$group": {
                        "_id": {"$ifNull": ["$crm_status", "new"]},
                        "n": {"$sum": 1},
                    }
                },
            ]
        ):
            s = row["_id"] if row["_id"] in LEAD_STATUSES else "new"
            pipeline_counts[s] = row["n"]

        return AnalyticsOut(
            period_days=period_days,
            property_views=property_views,
            profile_views=profile_views,
            leads=leads,
            inspection_requests=inspection_requests,
            shares_total=shares_total,
            shares_by_channel=shares_by_channel,
            response_rate=response_rate,
            top_property=top_property,
            lead_pipeline=pipeline_counts,
            updated_at=datetime.now(timezone.utc),
        )

    # ─────────────────────────────────────────────────────────
    # LEAD CRM (extends lead_unlocks)
    # ─────────────────────────────────────────────────────────
    @router.get("/crm/leads")
    async def crm_list_leads(
        status: Optional[str] = Query(None),
        user: dict = Depends(require_auth),
    ):
        # Own unlocks nobody re-assigned + team leads assigned to me (agency_teams.my_leads_query).
        parts: list[dict] = [my_leads_query(user["id"])]
        if status == "new":
            # Fresh unlocks are written without crm_status; hydrate_leads maps that to "new".
            parts.append({"$or": [{"crm_status": "new"}, {"crm_status": {"$exists": False}}, {"crm_status": None}]})
        elif status and status in LEAD_STATUSES:
            parts.append({"crm_status": status})
        elif status == "open":
            parts.append({"crm_status": {"$nin": ["won", "lost"]}})
        leads = await db.lead_unlocks.find({"$and": parts}, {"_id": 0}).sort(
            "created_at", -1
        ).to_list(500)
        return await hydrate_leads(db, leads)

    @router.patch("/crm/leads/{lead_id}")
    async def crm_update_lead(
        lead_id: str,
        data: LeadUpdateIn = Body(...),
        user: dict = Depends(require_auth),
    ):
        lead = await db.lead_unlocks.find_one({"id": lead_id}, {"_id": 0})
        if not lead:
            raise HTTPException(404, "Lead not found")
        if not await lead_access(db, user, lead):
            raise HTTPException(403, "Not your lead")
        updates: dict = {}
        if data.status:
            if data.status not in LEAD_STATUSES:
                raise HTTPException(400, f"status must be one of {LEAD_STATUSES}")
            updates["crm_status"] = data.status
            # Also stamp responded_at the first time an agent moves off "new"
            if data.status != "new" and "responded_at" not in lead:
                updates["responded_at"] = datetime.now(timezone.utc)
        if data.next_follow_up_at is not None:
            updates["next_follow_up_at"] = data.next_follow_up_at
        if data.last_contact_at is not None:
            updates["last_contact_at"] = data.last_contact_at
        if not updates:
            raise HTTPException(400, "Nothing to update")
        updates["updated_at"] = datetime.now(timezone.utc)
        await db.lead_unlocks.update_one({"id": lead_id}, {"$set": updates})
        return {"ok": True, "updated": list(updates.keys())}

    @router.post("/crm/leads/{lead_id}/note")
    async def crm_add_note(
        lead_id: str,
        data: LeadNoteIn = Body(...),
        user: dict = Depends(require_auth),
    ):
        lead = await db.lead_unlocks.find_one({"id": lead_id}, {"_id": 0, "agent_id": 1, "assigned_to": 1, "agency_id": 1})
        if not lead:
            raise HTTPException(404, "Lead not found")
        if not await lead_access(db, user, lead):
            raise HTTPException(403, "Not your lead")
        note = {
            "id": str(uuid.uuid4()),
            "text": data.text,
            "author_id": user["id"],
            "author_name": user.get("full_name"),
            "created_at": datetime.now(timezone.utc),
        }
        await db.lead_unlocks.update_one(
            {"id": lead_id},
            {
                "$push": {"crm_notes": note},
                "$set": {"last_contact_at": note["created_at"]},
            },
        )
        return {"ok": True, "note": note}

    return router, admin_router
