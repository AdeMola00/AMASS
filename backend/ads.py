"""
AMASS Marketplace Advertisements — Phase A + B MVP.

Sellers pay **AMASS Tokens** to run ads (reusing the token economy — no new
payment gateway needed for MVP). Ads are auto-approved and delivered via a
smart `/ads/next` endpoint that supports:

  - Frequency capping (≤1 per 5 min per user, ≤3 per session)
  - Location/category targeting
  - CTR-weighted ordering
  - Impression + click tracking

Media hosting: BASE64 (matches property images) — swap to Cloudinary/S3 later
for video.
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

from tokens import WalletService

JWT_SECRET = os.environ.get("JWT_SECRET")
if not JWT_SECRET or len(JWT_SECRET) < 24:
    raise RuntimeError("JWT_SECRET is missing or too weak (see backend/.env)")
JWT_ALG = "HS256"

bearer = HTTPBearer(auto_error=False)

# ─── Config: campaign tiers (token cost) ───────────────────────
AD_TIERS: dict = {
    "basic": {"tokens": 30, "days": 7, "label": "Basic Promotion", "perk": "Higher in search results"},
    "featured": {"tokens": 80, "days": 14, "label": "Featured Listing", "perk": "Featured on category pages"},
    "spotlight": {"tokens": 150, "days": 14, "label": "Home Feed Spotlight", "perk": "Appears on Marketplace home"},
    "map": {"tokens": 100, "days": 14, "label": "Map Promotion", "perk": "Highlighted map marker"},
    "premium": {"tokens": 300, "days": 30, "label": "Premium Ad", "perk": "Full-screen image/video ads shown to targeted users"},
}

# Frequency-capping guardrails
MIN_MINUTES_BETWEEN_ADS = 5
MAX_ADS_PER_SESSION = 3


# ─── Pydantic ──────────────────────────────────────────────────
AdMediaType = Literal["image", "carousel", "video"]
AdStatus = Literal["draft", "pending", "active", "paused", "expired", "rejected"]


class AdMedia(BaseModel):
    kind: Literal["image", "video"]
    url: str  # base64 data URI OR https URL
    aspect_ratio: Optional[float] = None
    duration_s: Optional[float] = None  # for video


# ─── Phase C: Targeting ──────────────────────────────────────
class AdSchedule(BaseModel):
    """Optional day-of-week + hour-of-day windows for delivery."""
    days_of_week: Optional[List[int]] = None  # 0=Mon..6=Sun (UTC)
    hours_of_day: Optional[List[int]] = None  # 0..23 (UTC)


class AdTargeting(BaseModel):
    target_categories: List[str] = []
    target_cities: List[str] = []
    target_states: List[str] = []
    target_age_range: Optional[List[int]] = None  # [min, max]
    target_gender: Optional[Literal["male", "female", "any"]] = "any"
    target_device: Optional[Literal["ios", "android", "any"]] = "any"
    target_price_band: Optional[List[int]] = None  # [min_ngn, max_ngn]
    target_radius_km: Optional[float] = None
    target_center: Optional[List[float]] = None  # [lng, lat]
    interest_tags: List[str] = []  # e.g. ["duplex", "lekki", "solar"]
    schedule: Optional[AdSchedule] = None


class AdCreateIn(BaseModel):
    marketplace_item_id: Optional[str] = None
    property_id: Optional[str] = None
    tier: Literal["basic", "featured", "spotlight", "map", "premium"]
    title: str
    description: str
    cta_label: str = "Shop Now"
    media: List[AdMedia]
    # Legacy targeting kept for backwards compatibility
    target_categories: List[str] = []
    target_cities: List[str] = []
    # Phase C rich targeting (optional)
    targeting: Optional[AdTargeting] = None
    # Phase D budget/bidding (all optional — legacy ads still work)
    daily_budget_tokens: Optional[int] = None
    total_budget_tokens: Optional[int] = None
    bid_type: Optional[Literal["cpm", "cpc"]] = None
    bid_tokens: Optional[int] = None  # per 1000 impressions (cpm) or per click (cpc)


class Ad(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    seller_id: str
    marketplace_item_id: Optional[str] = None
    property_id: Optional[str] = None
    tier: str
    title: str
    description: str
    cta_label: str
    media: List[AdMedia]
    target_categories: List[str] = []
    target_cities: List[str] = []
    # Phase C
    targeting: Optional[dict] = None
    # Phase D — budget/bidding
    daily_budget_tokens: Optional[int] = None
    total_budget_tokens: Optional[int] = None
    bid_type: Optional[str] = None
    bid_tokens: Optional[int] = None
    total_spent_tokens: int = 0
    daily_spent_tokens: int = 0
    daily_spent_reset_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    paused_reason: Optional[str] = None  # 'daily_budget' | 'total_budget' | 'manual'
    status: AdStatus = "active"
    tokens_paid: int = 0
    starts_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    expires_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    impressions: int = 0
    clicks: int = 0
    saves: int = 0
    chats: int = 0
    calls: int = 0


class TrackIn(BaseModel):
    ad_id: str
    event: Literal["impression", "click", "save", "chat", "call", "dismiss", "not_interested", "hide_similar", "report"]
    context: Optional[str] = None  # e.g. 'marketplace_home', 'property_detail'


async def _uid(creds: Optional[HTTPAuthorizationCredentials]) -> Optional[str]:
    """Return user id if authed, else None (ads endpoint is public but
    personalized when we have a user)."""
    if not creds:
        return None
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALG])
        return payload.get("sub")
    except jwt.PyJWTError:
        return None


async def _require_uid(creds: Optional[HTTPAuthorizationCredentials]) -> str:
    uid = await _uid(creds)
    if not uid:
        raise HTTPException(401, "Not authenticated")
    return uid


# ═══ Phase C — interest inference + targeting match ══════════════════
async def _infer_interest_tags(db: AsyncIOMotorDatabase, user_id: Optional[str], limit: int = 10) -> List[str]:
    """Infer up to `limit` interest tags from a user's public actions:
    marketplace views, favorites, unlocked properties. Non-PII."""
    if not user_id:
        return []
    tags: dict = {}
    def _bump(t: str, w: float = 1.0):
        if not t:
            return
        k = t.strip().lower()
        if not k:
            return
        tags[k] = tags.get(k, 0) + w
    # Marketplace views
    views = await db.marketplace_recently_viewed.find(
        {"user_id": user_id}, {"_id": 0, "category": 1, "tags": 1}
    ).limit(50).to_list(50) if "marketplace_recently_viewed" in await db.list_collection_names() else []
    for v in views:
        _bump(v.get("category"), 0.8)
        for t in (v.get("tags") or []):
            _bump(t, 0.5)
    # Favorites → property.category/city
    fav = await db.favorites.find({"user_id": user_id}, {"_id": 0, "property_id": 1}).to_list(100)
    if fav:
        pids = [f["property_id"] for f in fav]
        props = await db.properties.find(
            {"id": {"$in": pids}}, {"_id": 0, "property_type": 1, "city": 1, "state": 1}
        ).to_list(200)
        for p in props:
            _bump(p.get("property_type"), 1.2)
            _bump(p.get("city"), 0.7)
    return [t for t, _ in sorted(tags.items(), key=lambda kv: kv[1], reverse=True)[:limit]]


def _in_schedule(schedule: Optional[dict]) -> bool:
    if not schedule:
        return True
    now = datetime.now(timezone.utc)
    dow = schedule.get("days_of_week")
    hod = schedule.get("hours_of_day")
    if dow and now.weekday() not in dow:
        return False
    if hod and now.hour not in hod:
        return False
    return True


def _targeting_match(ad: dict, user_ctx: dict) -> float:
    """Return a relevance boost in [0, 1] based on how well the ad's targeting
    matches the user's context. Ads with no targeting always return 0.5
    (neutral)."""
    t = ad.get("targeting") or {}
    if not t:
        return 0.5
    if not _in_schedule(t.get("schedule")):
        return 0.0
    score = 0.5
    # Category match
    cats = t.get("target_categories") or ad.get("target_categories") or []
    if cats and user_ctx.get("last_categories"):
        overlap = set(map(str.lower, cats)) & set(map(str.lower, user_ctx["last_categories"]))
        if overlap:
            score += 0.15
    # City / state match
    cities = t.get("target_cities") or ad.get("target_cities") or []
    if cities and user_ctx.get("city") in cities:
        score += 0.15
    states = t.get("target_states") or []
    if states and user_ctx.get("state") in states:
        score += 0.1
    # Interest tags
    itags = set(map(str.lower, t.get("interest_tags") or []))
    utags = set(user_ctx.get("interest_tags") or [])
    if itags:
        hit_ratio = len(itags & utags) / max(1, len(itags))
        score += 0.2 * hit_ratio
    # Device
    dev = t.get("target_device") or "any"
    if dev != "any" and user_ctx.get("device") and dev != user_ctx["device"]:
        return 0.0
    # Radius
    if t.get("target_center") and t.get("target_radius_km") and user_ctx.get("lat") and user_ctx.get("lng"):
        import math
        clng, clat = t["target_center"][0], t["target_center"][1]
        R = 6371.0
        dLat = math.radians(user_ctx["lat"] - clat)
        dLng = math.radians(user_ctx["lng"] - clng)
        a = math.sin(dLat/2)**2 + math.cos(math.radians(clat)) * math.cos(math.radians(user_ctx["lat"])) * math.sin(dLng/2)**2
        dist = 2 * R * math.asin(math.sqrt(a))
        if dist > t["target_radius_km"]:
            return 0.0
        score += 0.1 * max(0.0, 1 - dist / t["target_radius_km"])
    return min(1.0, score)


# ═══ Phase D — Budget/pacing helpers ═════════════════════════════════
def _cost_of_event(ad: dict, event: str) -> int:
    """How many tokens does this event cost the ad? For bid_type=cpm, an
    impression costs bid/1000 tokens (rounded up). For cpc, a click costs
    bid_tokens."""
    bt = ad.get("bid_type")
    b = ad.get("bid_tokens") or 0
    if bt == "cpm" and event == "impression":
        return max(1, (b + 999) // 1000) if b else 0
    if bt == "cpc" and event == "click":
        return b
    return 0


async def _maybe_pause_over_budget(db: AsyncIOMotorDatabase, ad: dict) -> None:
    """Auto-pause when a budget is exhausted."""
    reason = None
    if ad.get("total_budget_tokens") and ad["total_spent_tokens"] >= ad["total_budget_tokens"]:
        reason = "total_budget"
    elif ad.get("daily_budget_tokens") and ad["daily_spent_tokens"] >= ad["daily_budget_tokens"]:
        reason = "daily_budget"
    if reason and ad.get("status") == "active":
        await db.advertisements.update_one(
            {"id": ad["id"]},
            {"$set": {"status": "paused", "paused_reason": reason,
                      "paused_at": datetime.now(timezone.utc)}},
        )


async def _reset_daily_spend_if_stale(db: AsyncIOMotorDatabase, ad: dict) -> dict:
    """Reset daily counters at UTC midnight boundary + auto-resume budget-paused ads."""
    last = ad.get("daily_spent_reset_at")
    now = datetime.now(timezone.utc)
    if not last or last.date() < now.date():
        updates = {"daily_spent_tokens": 0, "daily_spent_reset_at": now}
        # Auto-resume if it was paused for daily budget only
        if ad.get("status") == "paused" and ad.get("paused_reason") == "daily_budget":
            updates["status"] = "active"
            updates["paused_reason"] = None
        await db.advertisements.update_one({"id": ad["id"]}, {"$set": updates})
        ad = {**ad, **updates}
    return ad


def register_ads_routes(db: AsyncIOMotorDatabase) -> APIRouter:
    router = APIRouter(prefix="/api", tags=["ads"])
    svc = WalletService(db)

    # ─── Ad catalog / tier config ─────────────────────────
    @router.get("/ads/tiers")
    async def ads_tiers():
        return AD_TIERS

    # ─── Seller: create ad (debits tokens immediately) ─────
    @router.post("/ads")
    async def create_ad(
        data: AdCreateIn,
        creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    ):
        user_id = await _require_uid(creds)
        cfg = AD_TIERS[data.tier]
        # Debit
        try:
            await svc.debit(
                user_id,
                cfg["tokens"],
                "spend_unlock",
                f"Ad campaign: {cfg['label']}",
                meta={"ad_tier": data.tier, "title": data.title},
            )
        except HTTPException as e:
            if e.status_code == 402:
                wallet = await svc.get_or_create(user_id)
                raise HTTPException(
                    402,
                    {
                        "error": "insufficient_tokens",
                        "required": cfg["tokens"],
                        "balance": wallet["balance"] + wallet["bonus_balance"],
                        "shortfall": cfg["tokens"] - (wallet["balance"] + wallet["bonus_balance"]),
                    },
                )
            raise
        expires = datetime.now(timezone.utc) + timedelta(days=cfg["days"])
        ad = Ad(
            seller_id=user_id,
            marketplace_item_id=data.marketplace_item_id,
            property_id=data.property_id,
            tier=data.tier,
            title=data.title,
            description=data.description,
            cta_label=data.cta_label,
            media=data.media,
            target_categories=data.target_categories,
            target_cities=data.target_cities,
            targeting=data.targeting.model_dump() if data.targeting else None,
            daily_budget_tokens=data.daily_budget_tokens,
            total_budget_tokens=data.total_budget_tokens,
            bid_type=data.bid_type,
            bid_tokens=data.bid_tokens,
            tokens_paid=cfg["tokens"],
            expires_at=expires,
            status="active",
        )
        doc = ad.model_dump()
        await db.advertisements.insert_one(doc)
        # Strip Mongo _id if present in the doc for return
        doc.pop("_id", None)
        return doc

    # ─── Seller: list own ads + basic analytics ────────────
    @router.get("/ads/mine")
    async def my_ads(
        creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    ):
        user_id = await _require_uid(creds)
        docs = await db.advertisements.find(
            {"seller_id": user_id}, {"_id": 0}
        ).sort("starts_at", -1).to_list(200)
        for a in docs:
            imps = a.get("impressions", 0)
            a["ctr"] = round((a.get("clicks", 0) / imps) * 100, 2) if imps else 0.0
        return docs

    # ─── Delivery: next ad to show ─────────────────────────
    @router.get("/ads/next")
    async def next_ad(
        context: str = "marketplace_home",
        exclude: Optional[str] = None,
        device: Optional[str] = None,
        lat: Optional[float] = None,
        lng: Optional[float] = None,
        creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    ):
        """Returns a single ad to display, respecting frequency capping.
        exclude: comma-separated list of already-seen ad ids in this session."""
        user_id = await _uid(creds)
        # Frequency capping (server-side): check last impression <5 min old
        if user_id:
            recent = await db.ad_impressions.find_one(
                {
                    "user_id": user_id,
                    "created_at": {
                        "$gte": datetime.now(timezone.utc) - timedelta(minutes=MIN_MINUTES_BETWEEN_ADS)
                    },
                },
                {"_id": 0},
                sort=[("created_at", -1)],
            )
            if recent:
                return {"ad": None, "reason": "cooldown"}
            # Daily session-cap: >3 impressions in last hour → no more full-screen
            last_hour_count = await db.ad_impressions.count_documents(
                {
                    "user_id": user_id,
                    "created_at": {"$gte": datetime.now(timezone.utc) - timedelta(hours=1)},
                }
            )
            if last_hour_count >= MAX_ADS_PER_SESSION:
                return {"ad": None, "reason": "session_cap"}
        # Query active ads, exclude seen ones
        query: dict = {"status": "active", "expires_at": {"$gt": datetime.now(timezone.utc)}}
        exclude_ids = [x for x in (exclude or "").split(",") if x]
        if exclude_ids:
            query["id"] = {"$nin": exclude_ids}
        # Also skip ads user has clicked "not interested" on
        if user_id:
            hidden = [
                r["ad_id"]
                async for r in db.ad_feedback.find(
                    {"user_id": user_id, "event": {"$in": ["not_interested", "hide_similar"]}},
                    {"_id": 0, "ad_id": 1},
                )
            ]
            if hidden:
                query.setdefault("id", {}).setdefault("$nin", []).extend(hidden)
        candidates = await db.advertisements.find(query, {"_id": 0}).to_list(50)
        if not candidates:
            return {"ad": None, "reason": "no_candidates"}

        # ─── Phase C/D: reset daily spend + targeting + auction ranking ──
        user_ctx: dict = {"device": device, "lat": lat, "lng": lng}
        if user_id:
            u = await db.users.find_one({"id": user_id}, {"_id": 0, "city": 1, "state": 1})
            if u:
                user_ctx["city"] = u.get("city")
                user_ctx["state"] = u.get("state")
            user_ctx["interest_tags"] = await _infer_interest_tags(db, user_id, 10)
            # last 3 categories viewed
            recent_views = await db.marketplace_recently_viewed.find(
                {"user_id": user_id}, {"_id": 0, "category": 1}
            ).sort("viewed_at", -1).limit(3).to_list(3) if "marketplace_recently_viewed" in await db.list_collection_names() else []
            user_ctx["last_categories"] = [v.get("category") for v in recent_views if v.get("category")]

        # Roll daily counters + filter out zero-match after targeting
        fresh: list = []
        for ad in candidates:
            ad = await _reset_daily_spend_if_stale(db, ad)
            match = _targeting_match(ad, user_ctx)
            if match <= 0:
                continue
            ad["_match"] = match
            fresh.append(ad)
        if not fresh:
            return {"ad": None, "reason": "no_targeted_candidates"}

        # Auction score = tier_weight × pacing × relevance × bid
        weights = {"premium": 5, "spotlight": 4, "featured": 3, "map": 2, "basic": 1}
        def _score(ad: dict) -> float:
            tier_w = weights.get(ad.get("tier"), 1)
            pacing = max(0.1, 1 - ad.get("impressions", 0) / 1000.0)
            bid = max(1, ad.get("bid_tokens") or 1)
            return tier_w * pacing * ad.get("_match", 0.5) * bid
        fresh.sort(key=_score, reverse=True)
        chosen = fresh[0]
        chosen.pop("_match", None)
        chosen.pop("_id", None)
        return {"ad": chosen, "match_score": chosen.get("_match")}

    # ─── Phase D: seller pause / resume / cancel + refund ───
    @router.post("/ads/{ad_id}/pause")
    async def pause_ad(
        ad_id: str,
        creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    ):
        user_id = await _require_uid(creds)
        r = await db.advertisements.update_one(
            {"id": ad_id, "seller_id": user_id, "status": "active"},
            {"$set": {"status": "paused", "paused_reason": "manual",
                      "paused_at": datetime.now(timezone.utc)}},
        )
        if not r.matched_count:
            raise HTTPException(404, "Active ad not found")
        return {"ok": True, "status": "paused"}

    @router.post("/ads/{ad_id}/resume")
    async def resume_ad(
        ad_id: str,
        creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    ):
        user_id = await _require_uid(creds)
        r = await db.advertisements.update_one(
            {"id": ad_id, "seller_id": user_id, "status": "paused"},
            {"$set": {"status": "active", "paused_reason": None,
                      "resumed_at": datetime.now(timezone.utc)}},
        )
        if not r.matched_count:
            raise HTTPException(404, "Paused ad not found")
        return {"ok": True, "status": "active"}

    @router.post("/ads/{ad_id}/cancel")
    async def cancel_ad(
        ad_id: str,
        creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    ):
        """Cancels an ad and refunds unspent tokens to the seller's wallet."""
        user_id = await _require_uid(creds)
        ad = await db.advertisements.find_one({"id": ad_id, "seller_id": user_id}, {"_id": 0})
        if not ad:
            raise HTTPException(404, "Ad not found")
        if ad["status"] in ("expired", "rejected"):
            raise HTTPException(400, "Ad already closed")
        # Refund = tokens_paid - total_spent_tokens (or 0 if never bidded)
        unspent = max(0, (ad.get("tokens_paid") or 0) - (ad.get("total_spent_tokens") or 0))
        if unspent > 0:
            await svc.credit(user_id, unspent, "refund",
                             f"Refund: cancelled ad {ad['title']}",
                             meta={"ad_id": ad_id})
        await db.advertisements.update_one(
            {"id": ad_id},
            {"$set": {"status": "expired", "cancelled_at": datetime.now(timezone.utc),
                      "refund_tokens": unspent}},
        )
        return {"ok": True, "refund_tokens": unspent}

    # ─── Phase E: analytics ────────────────────────────────
    @router.get("/ads/{ad_id}/analytics")
    async def ad_analytics(
        ad_id: str,
        period_days: int = 7,
        creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    ):
        user_id = await _require_uid(creds)
        ad = await db.advertisements.find_one({"id": ad_id, "seller_id": user_id}, {"_id": 0})
        if not ad:
            raise HTTPException(404, "Ad not found")
        since = datetime.now(timezone.utc) - timedelta(days=period_days)
        # Per-hour + per-day breakdowns via aggregate
        def _pipeline(match_extra: dict = {}):
            return [
                {"$match": {"ad_id": ad_id, "created_at": {"$gte": since}, **match_extra}},
                {"$group": {
                    "_id": {
                        "day": {"$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}},
                        "hour": {"$hour": "$created_at"},
                    },
                    "count": {"$sum": 1},
                }},
                {"$sort": {"_id.day": 1, "_id.hour": 1}},
            ]

        impressions = await db.ad_impressions.aggregate(_pipeline()).to_list(1000)
        clicks = await db.ad_clicks.aggregate(_pipeline()).to_list(1000)

        # Funnel counts
        funnel = {
            "impressions": ad.get("impressions", 0),
            "clicks": ad.get("clicks", 0),
            "saves": ad.get("saves", 0),
            "chats": ad.get("chats", 0),
            "calls": ad.get("calls", 0),
        }
        ctr = round(funnel["clicks"] / funnel["impressions"] * 100, 2) if funnel["impressions"] else 0
        # Cost per action
        spent = ad.get("total_spent_tokens") or ad.get("tokens_paid", 0)
        cpa = {
            "cpm_tokens": round(spent / funnel["impressions"] * 1000, 2) if funnel["impressions"] else 0,
            "cpc_tokens": round(spent / funnel["clicks"], 2) if funnel["clicks"] else 0,
            "cost_per_chat_tokens": round(spent / funnel["chats"], 2) if funnel["chats"] else 0,
        }
        return {
            "ad_id": ad_id,
            "title": ad.get("title"),
            "status": ad.get("status"),
            "tier": ad.get("tier"),
            "period_days": period_days,
            "funnel": funnel,
            "ctr_percent": ctr,
            "spent_tokens": spent,
            "cost_per_action": cpa,
            "budget": {
                "daily_budget_tokens": ad.get("daily_budget_tokens"),
                "daily_spent_tokens": ad.get("daily_spent_tokens", 0),
                "total_budget_tokens": ad.get("total_budget_tokens"),
                "total_spent_tokens": ad.get("total_spent_tokens", 0),
            },
            "impressions_over_time": [
                {"day": d["_id"]["day"], "hour": d["_id"]["hour"], "count": d["count"]}
                for d in impressions
            ],
            "clicks_over_time": [
                {"day": d["_id"]["day"], "hour": d["_id"]["hour"], "count": d["count"]}
                for d in clicks
            ],
        }

    @router.get("/ads/{ad_id}/suggestions")
    async def ad_suggestions(
        ad_id: str,
        creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    ):
        """AI-generated performance suggestions using Claude via Emergent LLM Key.
        Reads recent performance and proposes concrete improvements to title,
        description, targeting, or budget. Gracefully degrades if the LLM
        is unavailable."""
        user_id = await _require_uid(creds)
        ad = await db.advertisements.find_one({"id": ad_id, "seller_id": user_id}, {"_id": 0})
        if not ad:
            raise HTTPException(404, "Ad not found")
        # Charge 5 tokens (best-effort — if insufficient we fall back to a
        # heuristic suggestion set so the button never appears broken).
        cost = 5
        wallet = await svc.get_or_create(user_id)
        can_pay = (wallet["balance"] + wallet["bonus_balance"]) >= cost

        # Build a compact perf digest for the model
        imps = ad.get("impressions", 0)
        clicks_ = ad.get("clicks", 0)
        ctr = clicks_ / imps if imps else 0
        digest = (
            f"Ad tier: {ad.get('tier')}  Status: {ad.get('status')}\n"
            f"Title: {ad.get('title')}\nDescription: {ad.get('description')}\n"
            f"Impressions: {imps}  Clicks: {clicks_}  CTR: {ctr:.1%}  "
            f"Saves: {ad.get('saves',0)}  Chats: {ad.get('chats',0)}  Calls: {ad.get('calls',0)}\n"
            f"Targeting: {ad.get('targeting') or {'target_categories': ad.get('target_categories'), 'target_cities': ad.get('target_cities')}}\n"
            f"Budget: daily={ad.get('daily_budget_tokens')} total={ad.get('total_budget_tokens')} spent={ad.get('total_spent_tokens',0)}"
        )

        # Heuristic fallback (always available)
        def _heuristic() -> list:
            out = []
            if imps > 50 and ctr < 0.01:
                out.append({"kind": "creative", "priority": "high",
                            "text": "CTR is under 1%. Try a tighter, benefit-first title (≤6 words) and swap the cover image for a higher-contrast photo."})
            if imps < 50 and ad.get("targeting"):
                out.append({"kind": "targeting", "priority": "medium",
                            "text": "Low reach — your targeting may be too narrow. Try widening cities/interest tags."})
            if ad.get("daily_budget_tokens") and ad.get("daily_spent_tokens", 0) >= ad["daily_budget_tokens"]:
                out.append({"kind": "budget", "priority": "high",
                            "text": "Daily budget is exhausting. Raise it or move to a higher tier to keep ads live."})
            if ctr > 0.05 and ad.get("saves", 0) < clicks_ / 4:
                out.append({"kind": "landing", "priority": "medium",
                            "text": "Great CTR but few saves — the landing content may not deliver on the ad's promise."})
            if not out:
                out.append({"kind": "general", "priority": "low",
                            "text": "Performance looks healthy. Consider testing a variant with a stronger CTA verb (e.g. 'Book viewing') to lift conversions."})
            return out

        suggestions = _heuristic()
        used_ai = False
        if can_pay:
            try:
                from emergentintegrations.llm.chat import LlmChat, UserMessage  # type: ignore
                emergent_key = os.environ.get("EMERGENT_LLM_KEY")
                if emergent_key:
                    prompt = (
                        "You are AMASS's ad performance coach. Given the campaign digest below, "
                        "produce 3 concrete, actionable suggestions. Return a JSON array of "
                        "objects with keys: kind (creative|targeting|budget|landing|general), "
                        "priority (high|medium|low), text (≤160 chars). No prose outside the JSON.\n\n"
                        + digest
                    )
                    chat = LlmChat(api_key=emergent_key, session_id=f"ads-{ad_id}",
                                   system_message="You are a mobile ads performance coach for AMASS Africa."
                                   ).with_model("anthropic", "claude-sonnet-4-5")
                    resp = await chat.send_message(UserMessage(text=prompt))
                    import json, re
                    raw = str(resp)
                    m = re.search(r"\[.*\]", raw, re.S)
                    if m:
                        parsed = json.loads(m.group(0))
                        if isinstance(parsed, list) and parsed:
                            suggestions = parsed[:5]
                            used_ai = True
                    if used_ai:
                        await svc.debit(user_id, cost, "spend_unlock",
                                        f"AI suggestions for ad {ad_id[:8]}",
                                        meta={"ad_id": ad_id})
            except Exception:
                pass  # heuristic already populated

        return {
            "ad_id": ad_id,
            "used_ai": used_ai,
            "cost_charged_tokens": cost if used_ai else 0,
            "suggestions": suggestions,
        }

    @router.get("/ads/interest-tags/mine")
    async def my_interest_tags(
        creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    ):
        """Expose the inferred interest tags so users know what personalization
        AMASS uses. Transparency by design."""
        user_id = await _require_uid(creds)
        tags = await _infer_interest_tags(db, user_id, 20)
        return {"tags": tags}

    # ─── Track events ──────────────────────────────────────
    @router.post("/ads/track")
    async def track(
        data: TrackIn,
        creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    ):
        user_id = await _uid(creds)
        collection_map = {
            "impression": "ad_impressions",
            "click": "ad_clicks",
        }
        col_name = collection_map.get(data.event, "ad_feedback")
        await db[col_name].insert_one(
            {
                "ad_id": data.ad_id,
                "user_id": user_id,
                "event": data.event,
                "context": data.context,
                "created_at": datetime.now(timezone.utc),
            }
        )
        # Update aggregate counters on ad doc
        inc_field = {
            "impression": "impressions",
            "click": "clicks",
            "save": "saves",
            "chat": "chats",
            "call": "calls",
        }.get(data.event)
        if inc_field:
            # Phase D: charge tokens (from tokens_paid pool) for cpm/cpc events
            ad_after = await db.advertisements.find_one_and_update(
                {"id": data.ad_id},
                {"$inc": {inc_field: 1}},
                return_document=True,
            )
            if ad_after:
                cost = _cost_of_event(ad_after, data.event)
                if cost:
                    ad_after = await db.advertisements.find_one_and_update(
                        {"id": data.ad_id},
                        {"$inc": {"total_spent_tokens": cost, "daily_spent_tokens": cost}},
                        return_document=True,
                    )
                    if ad_after:
                        await _maybe_pause_over_budget(db, ad_after)
        return {"ok": True}

    return router
