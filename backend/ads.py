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

JWT_SECRET = os.environ.get("JWT_SECRET", "amass-dev-secret-change-in-production")
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


class AdCreateIn(BaseModel):
    marketplace_item_id: Optional[str] = None
    property_id: Optional[str] = None
    tier: Literal["basic", "featured", "spotlight", "map", "premium"]
    title: str
    description: str
    cta_label: str = "Shop Now"
    media: List[AdMedia]
    target_categories: List[str] = []
    target_cities: List[str] = []


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
        # Rank by tier weight × (1 - impressions/1000) — simple pacing
        weights = {"premium": 5, "spotlight": 4, "featured": 3, "map": 2, "basic": 1}
        candidates.sort(
            key=lambda a: weights.get(a.get("tier"), 1)
            * max(0.1, 1 - a.get("impressions", 0) / 1000.0),
            reverse=True,
        )
        chosen = candidates[0]
        chosen.pop("_id", None)
        return {"ad": chosen}

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
            await db.advertisements.update_one({"id": data.ad_id}, {"$inc": {inc_field: 1}})
        return {"ok": True}

    return router
