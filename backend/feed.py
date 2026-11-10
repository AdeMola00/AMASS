"""AMASS Feed — one continuous social-commerce stream (replaces Activity + Nearby + Market › Declutter).

Built on the existing `social_posts` collection (every old give/sell post is still a post here) and
the existing Market / FIXA / Shop / chat / notification services — nothing is duplicated:
  • Post types: general · sale · free · service · property · promo. Sale posts are mirrored into the
    Declutter `marketplace` collection (offers, saves, checkout keep working); property posts link an
    AMASS listing; promo posts carry a brand + offer; service posts carry a trade + starting price.
  • Interaction: emoji reactions (like/love/fire/wow/laugh/sad), threaded comments, share/repost,
    save, follow (users · brands · FIXA providers), @mentions, stories (expire after N hours).
  • Ranking (`rank_posts`): recency half-life, followed authors, nearby (estate › area › city),
    interests learned from your own reactions/saves, engagement quality (log-capped so numbers
    alone never dominate), freshness, sponsored cap, and an author-diversity penalty against spam.
  • Discovery columns: after every N posts (admin `feed_settings.discovery_every`, default 8) a FIXA pros column
    and a Brands & Products column alternate, plus an occasional "Homes near you" column from live listings.
  • Moderation: every new post is screened by AI in the background (feed_moderation.py); flagged
    posts drop out of the stream until an admin decides; authors can appeal.

Routes: /api/feed/* (consumer + creator). Admin/portal routes live in feed_moderation.py.
"""
from __future__ import annotations

import asyncio
import math
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from social_common import award, blocked_ids_for, ensure, muted_ids_for, new_id, notify, now, public_users
from social_feed import CATEGORIES, CATEGORY_LABEL, CONDITION_LABEL, CONDITIONS, MARKET_CATEGORY, QUICK_MESSAGES, _iso, _location_label

PostType = Literal["general", "sale", "free", "service", "property", "promo"]
POST_TYPES: list[dict[str, Any]] = [
    {"key": "general", "label": "Post", "hint": "Share a moment, a tip or what's happening around you", "icon": "chatbubbles", "color": "#6366F1"},
    {"key": "sale", "label": "For sale", "hint": "Sell something you no longer need — buyers message you here", "icon": "pricetag", "color": "#E11D48"},
    {"key": "free", "label": "Free", "hint": "Give it away to a neighbour", "icon": "gift", "color": "#10B981"},
    {"key": "service", "label": "Service", "hint": "Offer what you do — plumbing, cleaning, tutoring…", "icon": "construct", "color": "#F59E0B"},
    {"key": "property", "label": "Property", "hint": "Showcase a home for sale or rent", "icon": "home", "color": "#0EA5E9"},
    {"key": "promo", "label": "Promotion", "hint": "Promote your business, products or an offer", "icon": "megaphone", "color": "#8B5CF6"},
]
TYPE_LABEL = {t["key"]: t["label"] for t in POST_TYPES}
REACTIONS: list[dict[str, str]] = [
    {"key": "like", "emoji": "👍", "label": "Like"},
    {"key": "love", "emoji": "❤️", "label": "Love"},
    {"key": "fire", "emoji": "🔥", "label": "Fire"},
    {"key": "wow", "emoji": "😮", "label": "Wow"},
    {"key": "laugh", "emoji": "😂", "label": "Haha"},
    {"key": "sad", "emoji": "😢", "label": "Sad"},
]
REACTION_KEYS = [r["key"] for r in REACTIONS]
FILTERS = [
    {"key": "all", "label": "For you", "icon": "sparkles"},
    {"key": "following", "label": "Following", "icon": "people"},
    {"key": "nearby", "label": "Nearby", "icon": "location"},
    {"key": "properties", "label": "Properties", "icon": "home"},
    {"key": "services", "label": "Services", "icon": "construct"},
    {"key": "products", "label": "Products", "icon": "pricetag"},
    {"key": "videos", "label": "Videos", "icon": "videocam"},
]
FILTER_KEYS = {f["key"] for f in FILTERS}
SERVICE_CATEGORIES = ["Plumbing", "Electrical", "Cleaning", "Painting", "Carpentry", "AC & appliance repair", "Moving", "Interior décor", "Generator & solar", "Tutoring", "Beauty & wellness", "Catering", "Other"]
DELIVERY = [{"key": "pickup", "label": "Pickup only"}, {"key": "delivery", "label": "Delivery available"}, {"key": "both", "label": "Pickup or delivery"}]
LIVE = ["active", "reserved"]
STORY_LIMIT = 10
MENTION_RX = re.compile(r"@([A-Za-z0-9_.]{2,30})")
HASHTAG_RX = re.compile(r"#([A-Za-z0-9_]{2,40})")

DEFAULT_SETTINGS: dict[str, Any] = {
    "key": "feed",
    "discovery_every": 8,     # after every 8 posts: a FIXA pros column, then 8 posts, then Brands & Products, and so on
    "homes_every": 20,        # a "Homes near you" column after every N posts (offset so it never collides with the above)
    "story_expiry_hours": 24,
    "ai_moderation": True,
    "review_score": 0.5,      # unflagged posts scoring at/above this still get a human glance (post stays visible)
    "max_posts_per_day": 20,  # per author (spam guard)
    "max_comments_per_hour": 60,
    "sponsored_per_page": 2,
}


# ─── Models ───────────────────────────────────────────────────────────────────
class VideoIn(BaseModel):
    url: str
    thumb: Optional[str] = None
    duration: Optional[float] = Field(None, ge=0, le=600)


class PropertyTagIn(BaseModel):
    id: str


class FeedPostIn(BaseModel):
    type: PostType = "general"
    title: Optional[str] = Field(None, max_length=90)
    body: str = Field("", max_length=2200)
    photos: List[str] = Field(default_factory=list, max_length=10)
    videos: List[VideoIn] = Field(default_factory=list, max_length=2)
    # sale / free
    price: Optional[int] = Field(None, ge=0, le=5_000_000_000)
    negotiable: bool = True
    category: Optional[str] = None
    condition: Optional[str] = None
    delivery: Optional[Literal["pickup", "delivery", "both"]] = None
    # service
    service_category: Optional[str] = Field(None, max_length=60)
    starting_price: Optional[int] = Field(None, ge=0, le=5_000_000_000)
    coverage: Optional[str] = Field(None, max_length=120)
    # property
    property_id: Optional[str] = None
    # promo
    business_name: Optional[str] = Field(None, max_length=80)
    offer: Optional[str] = Field(None, max_length=140)
    link_url: Optional[str] = Field(None, max_length=400)
    ends_at: Optional[str] = None
    # where / who
    visibility: Literal["estate", "area", "city", "everyone"] = "city"
    estate_id: Optional[str] = None
    location_label: Optional[str] = Field(None, max_length=80)
    contact_chat: bool = True
    contact_whatsapp: bool = False
    contact_phone: bool = False
    tagged_products: List[str] = Field(default_factory=list, max_length=6)
    tagged_brands: List[str] = Field(default_factory=list, max_length=3)
    sponsored: bool = False


class FeedPostPatch(BaseModel):
    title: Optional[str] = Field(None, max_length=90)
    body: Optional[str] = Field(None, max_length=2200)
    photos: Optional[List[str]] = Field(None, max_length=10)
    videos: Optional[List[VideoIn]] = Field(None, max_length=2)
    price: Optional[int] = Field(None, ge=0, le=5_000_000_000)
    negotiable: Optional[bool] = None
    category: Optional[str] = None
    condition: Optional[str] = None
    delivery: Optional[Literal["pickup", "delivery", "both"]] = None
    service_category: Optional[str] = None
    starting_price: Optional[int] = None
    coverage: Optional[str] = None
    business_name: Optional[str] = None
    offer: Optional[str] = None
    link_url: Optional[str] = None
    location_label: Optional[str] = None
    contact_chat: Optional[bool] = None
    contact_whatsapp: Optional[bool] = None
    contact_phone: Optional[bool] = None
    status: Optional[Literal["active", "reserved", "gone", "paused"]] = None


class ReactIn(BaseModel):
    emoji: Optional[str] = None  # None → remove my reaction


class CommentIn(BaseModel):
    body: str = Field(..., min_length=1, max_length=600)
    parent_id: Optional[str] = None


class ShareIn(BaseModel):
    channel: Literal["copy", "whatsapp", "native", "repost"] = "native"
    comment: Optional[str] = Field(None, max_length=400)


class FollowIn(BaseModel):
    target_type: Literal["user", "brand", "provider"] = "user"


class StoryIn(BaseModel):
    media_url: str
    media_type: Literal["image", "video"] = "image"
    caption: Optional[str] = Field(None, max_length=140)
    link_post_id: Optional[str] = None


class ViewsIn(BaseModel):
    post_ids: List[str] = Field(default_factory=list, max_length=50)
    video_ids: List[str] = Field(default_factory=list, max_length=50)


class ReportIn(BaseModel):
    reason: Literal["scam", "prohibited", "spam", "offensive", "wrong_info", "harassment", "other"]
    details: Optional[str] = Field(None, max_length=600)


class ContactIn(BaseModel):
    channel: Literal["chat", "whatsapp", "phone"] = "chat"
    message: Optional[str] = Field(None, max_length=500)


class PrefsIn(BaseModel):
    interests: Optional[List[str]] = Field(None, max_length=20)
    show_sponsored: Optional[bool] = None
    autoplay_videos: Optional[bool] = None
    default_filter: Optional[str] = None


class ProfileIn(BaseModel):
    display_name: Optional[str] = Field(None, min_length=2, max_length=40)
    handle: Optional[str] = Field(None, min_length=2, max_length=30, pattern=r"^[A-Za-z0-9_.]+$")
    bio: Optional[str] = Field(None, max_length=200)
    business_name: Optional[str] = Field(None, max_length=80)
    creator_category: Optional[str] = Field(None, max_length=40)
    website: Optional[str] = Field(None, max_length=200)
    is_business: Optional[bool] = None


# ─── Helpers ──────────────────────────────────────────────────────────────────
async def get_settings(db) -> dict:
    doc = await db.feed_settings.find_one({"key": "feed"}, {"_id": 0})
    if not doc:
        doc = dict(DEFAULT_SETTINGS)
        await db.feed_settings.update_one({"key": "feed"}, {"$setOnInsert": doc}, upsert=True)
    return {**DEFAULT_SETTINGS, **doc}


def _aware(d: Any) -> Optional[datetime]:
    """Mongo hands back naive UTC datetimes; make them comparable with `now()`."""
    if not isinstance(d, datetime):
        return None
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def post_type_of(p: dict) -> str:
    t = p.get("type")
    if t in TYPE_LABEL:
        return t
    return "free" if p.get("kind") == "give" else "sale" if p.get("kind") == "sell" else "general"


def _video_list(p: dict) -> list[dict]:
    return [v for v in (p.get("videos") or []) if isinstance(v, dict) and v.get("url")]


def _reaction_total(p: dict) -> int:
    r = p.get("reactions") or {}
    return int(sum(int(v or 0) for v in r.values())) if r else int(p.get("like_count") or 0)


def shape_post(p: dict, viewer_id: str, my_reaction: Optional[str], saved: bool, following: bool, author: Optional[dict], ctx: dict) -> dict:
    t = post_type_of(p)
    a = author or {"id": p["author_id"], "full_name": p.get("author_name") or "AMASS member", "avatar_url": p.get("author_avatar"), "verified": False}
    reactions = {k: int((p.get("reactions") or {}).get(k, 0) or 0) for k in REACTION_KEYS}
    if not any(reactions.values()) and p.get("like_count"):
        reactions["like"] = int(p["like_count"])
    out = {
        "id": p["id"], "type": t, "type_label": TYPE_LABEL[t], "kind": p.get("kind"),
        "title": p.get("title") or "", "body": p.get("body") or "",
        "photos": p.get("photos") or [], "videos": _video_list(p), "cover": (p.get("photos") or [None])[0] or ((_video_list(p) or [{}])[0].get("thumb")),
        "price": p.get("price"), "negotiable": bool(p.get("negotiable", True)), "category": p.get("category"), "category_label": CATEGORY_LABEL.get(p.get("category") or "", None),
        "condition": p.get("condition"), "condition_label": CONDITION_LABEL.get(p.get("condition") or "", None), "delivery": p.get("delivery"),
        "service": p.get("service"), "property": p.get("property"), "promo": p.get("promo"),
        "visibility": p.get("visibility", "city"), "location_label": p.get("location_label") or _location_label(p), "city": p.get("city"), "area": p.get("area"), "estate_name": p.get("estate_name"),
        "contact": {"chat": bool(p.get("contact_chat", True)), "whatsapp": bool(p.get("contact_whatsapp")), "phone": bool(p.get("contact_phone"))},
        "status": p.get("status", "active"), "sponsored": bool(p.get("sponsored")), "label": "Sponsored" if p.get("sponsored") else ("Promotion" if t == "promo" else None),
        "reactions": reactions, "reaction_count": sum(reactions.values()), "comment_count": int(p.get("comment_count", 0)), "share_count": int(p.get("share_count", 0)), "repost_count": int(p.get("repost_count", 0)), "save_count": int(p.get("save_count", 0)), "view_count": int(p.get("view_count", 0)), "video_views": int(p.get("video_views", 0)),
        "my_reaction": my_reaction, "saved": saved, "following_author": following, "is_mine": p["author_id"] == viewer_id,
        "mentions": p.get("mention_handles") or [], "hashtags": p.get("hashtags") or [], "tags": p.get("tags") or {},
        "repost_of": p.get("repost_of"), "repost_comment": p.get("repost_comment"),
        "market_item_id": p.get("market_item_id"), "moderation": {"status": (p.get("moderation") or {}).get("status", "clear")} if p["author_id"] == viewer_id else None,
        "created_at": _iso(p.get("created_at")), "updated_at": _iso(p.get("updated_at")), "edited": bool(p.get("edited")),
        "author": {**a, "same_estate": bool(p.get("estate_id") and p.get("estate_id") in ctx.get("estate_ids", [])), "is_business": bool(a.get("is_business"))},
    }
    return out


async def market_sync(db, post: dict, user: dict) -> Optional[str]:
    """Keep the Declutter `marketplace` mirror in step with a sale post (same infrastructure, no duplicate market)."""
    mid = post.get("market_item_id")
    want = post_type_of(post) == "sale" and (post.get("price") or 0) > 0 and post.get("status") != "removed"
    status_map = {"active": "active", "reserved": "active", "paused": "paused", "gone": "sold", "removed": "removed", "hidden_review": "paused"}
    title = post.get("title") or (post.get("body") or "Item")[:60]
    if mid:
        if not want:
            await db.marketplace.update_one({"id": mid}, {"$set": {"status": "removed", "updated_at": now().isoformat()}})
            return None if post.get("status") == "removed" else mid
        await db.marketplace.update_one({"id": mid}, {"$set": {
            "name": title, "description": post.get("body") or title, "price": post.get("price"), "negotiable": bool(post.get("negotiable", True)),
            "image": (post.get("photos") or [None])[0], "images": post.get("photos") or [], "status": status_map.get(post.get("status", "active"), "active"),
            "delivery": post.get("delivery") in ("delivery", "both"), "updated_at": now().isoformat(),
        }})
        return mid
    if not want:
        return None
    cat, sub = MARKET_CATEGORY.get(post.get("category") or "other", ("business", "Other"))
    n = now()
    item = {
        "id": str(uuid.uuid4()), "name": title, "description": post.get("body") or title, "price": post.get("price"), "currency": "NGN",
        "category": cat, "subcategory": sub, "condition": {"new": "new", "like_new": "like_new", "good": "used", "fair": "used", "spares": "for_parts"}.get(post.get("condition") or "good", "used"),
        "brand": None, "image": (post.get("photos") or [None])[0], "images": post.get("photos") or [], "city": post.get("city"), "location": post.get("location_label") or _location_label(post),
        "latitude": None, "longitude": None, "negotiable": bool(post.get("negotiable", True)), "contact_prefs": ["chat"] + (["whatsapp"] if post.get("contact_whatsapp") else []) + (["call"] if post.get("contact_phone") else []),
        "specs": {}, "tags": ["social", "feed"], "status": status_map.get(post.get("status", "active"), "active"), "rating": 4.8, "reviews": 0, "verified": False,
        "delivery": post.get("delivery") in ("delivery", "both"), "delivery_days": 0, "stock": 1, "popular": False, "on_sale": False, "posted_at": n.isoformat(), "views": 0, "saves": 0, "is_boosted": False, "is_featured": False,
        "vendor": user.get("full_name", "Neighbour"), "vendor_id": None, "seller_id": user["id"], "seller_name": user.get("full_name"), "seller_avatar": user.get("avatar_url"),
        "seller_phone": user.get("phone") if post.get("contact_phone") else None, "seller_whatsapp": user.get("phone") if post.get("contact_whatsapp") else None,
        "seller_type": "individual", "seller_verified": bool(user.get("phone_verified") or user.get("verified")), "seller_rating": 4.8, "seller_reviews": 0, "seller_joined_year": n.year,
        "seller_response_time_hours": 2, "seller_response_rate": 100, "seller_bio": user.get("bio"), "source": "social", "social_post_id": post["id"],
    }
    await db.marketplace.insert_one(item)
    return item["id"]


def rank_posts(posts: list[dict], *, ctx: dict, following: set[str], followed_brands: set[str], interests: dict[str, float], viewer_id: str, show_sponsored: bool, sponsored_cap: int, at: datetime) -> list[dict]:
    """Score + order candidates. Pure function so it's unit-testable."""
    scored: list[tuple[float, dict]] = []
    top_interest = max(interests.values()) if interests else 0.0
    for p in posts:
        created = _aware(p.get("created_at"))
        age_h = max(0.0, (at - created).total_seconds() / 3600.0) if created else 240.0
        s = 0.5 ** (age_h / 24.0)  # recency half-life of a day
        if age_h < 3:
            s += 0.2
        if p["author_id"] in following:
            s += 0.6
        brand_id = ((p.get("promo") or {}).get("brand_id"))
        if brand_id and brand_id in followed_brands:
            s += 0.6
        if p.get("estate_id") and p["estate_id"] in ctx.get("estate_ids", []):
            s += 0.5
        elif p.get("area") and p["area"] in ctx.get("areas", []):
            s += 0.35
        elif p.get("city") and p["city"] == ctx.get("city"):
            s += 0.15
        cat = p.get("category") or (p.get("service") or {}).get("category") or post_type_of(p)
        if top_interest and interests.get(cat):
            s += 0.3 * (interests[cat] / top_interest)
        eng = _reaction_total(p) + 2 * int(p.get("comment_count", 0)) + 3 * int(p.get("save_count", 0))
        s += min(0.4, math.log1p(eng) / 8.0)
        if p.get("sponsored"):
            s += 0.15
        if not (p.get("photos") or _video_list(p)) and len((p.get("body") or "") + (p.get("title") or "")) < 12:
            s -= 0.2
        if p["author_id"] == viewer_id:
            s += 1.0 if age_h < 1 else 0.1  # your own fresh post sits at the top, as on every social app
        scored.append((s, p))
    scored.sort(key=lambda x: (-x[0], -((_aware(x[1].get("created_at")) or at).timestamp())))
    # Diversity: push repeated authors / too many sponsored posts down the page.
    out: list[dict] = []
    deferred: list[dict] = []
    per_author: dict[str, int] = {}
    sponsored_seen = 0
    for _s, p in scored:
        n = per_author.get(p["author_id"], 0)
        if p.get("sponsored") and (not show_sponsored or sponsored_seen >= sponsored_cap):
            if show_sponsored:
                deferred.append(p)
            continue
        if n >= 2:
            deferred.append(p)
            continue
        per_author[p["author_id"]] = n + 1
        if p.get("sponsored"):
            sponsored_seen += 1
        out.append(p)
    return out + deferred


def _extract_mentions(text: str) -> list[str]:
    return list(dict.fromkeys(m.lower() for m in MENTION_RX.findall(text or "")))[:20]


def _extract_hashtags(text: str) -> list[str]:
    return list(dict.fromkeys(h.lower() for h in HASHTAG_RX.findall(text or "")))[:20]


# ─── Routes ───────────────────────────────────────────────────────────────────
def register_feed_routes(db, get_current_user, require_admin) -> APIRouter:
    router = APIRouter(prefix="/api/feed", tags=["feed"])
    _bg: set = set()

    def _spawn(coro) -> None:
        task = asyncio.create_task(coro)
        _bg.add(task)
        task.add_done_callback(_bg.discard)

    # ── viewer context (estates → areas → city), shared with the old social feed ──
    async def _ctx(user: dict, city_override: Optional[str] = None) -> dict:
        mems = await db.estate_members.find({"user_id": user["id"], "status": "approved"}, {"_id": 0, "estate_id": 1}).to_list(20)
        ests = await db.estates.find({"id": {"$in": [m["estate_id"] for m in mems]}, "status": {"$ne": "rejected"}}, {"_id": 0, "id": 1, "name": 1, "area": 1, "city": 1}).to_list(20) if mems else []
        city = city_override or user.get("city") or (ests[0]["city"] if ests else None) or "Lagos"
        return {"estates": ests, "estate_ids": [e["id"] for e in ests], "areas": sorted({e["area"] for e in ests if e.get("area")}), "city": city, "home_city": user.get("city") or (ests[0]["city"] if ests else None) or "Lagos"}

    async def _following_ids(uid: str, target_type: str = "user") -> set[str]:
        rows = await db.social_follows.find({"follower_id": uid, "target_type": target_type}, {"_id": 0, "target_id": 1}).to_list(5000)
        return {r["target_id"] for r in rows}

    async def _interests(uid: str) -> dict[str, float]:
        prof = await db.social_profiles.find_one({"user_id": uid}, {"_id": 0, "interests": 1, "feed_prefs": 1})
        got = dict((prof or {}).get("interests") or {})
        for k in ((prof or {}).get("feed_prefs") or {}).get("interests") or []:
            got[k] = got.get(k, 0) + 5.0
        return got

    async def _bump_interest(uid: str, p: dict, weight: float) -> None:
        cat = p.get("category") or (p.get("service") or {}).get("category") or post_type_of(p)
        await db.social_profiles.update_one({"user_id": uid}, {"$inc": {f"interests.{cat}": weight}, "$setOnInsert": {"user_id": uid, "created_at": now()}}, upsert=True)

    async def _decorate(posts: list[dict], user: dict, ctx: dict) -> list[dict]:
        ids = [p["id"] for p in posts]
        if not ids:
            return []
        mine = {r["post_id"]: r["emoji"] for r in await db.social_post_reactions.find({"user_id": user["id"], "post_id": {"$in": ids}}, {"_id": 0, "post_id": 1, "emoji": 1}).to_list(len(ids))}
        saved = {r["post_id"] for r in await db.social_saves.find({"user_id": user["id"], "post_id": {"$in": ids}}, {"_id": 0, "post_id": 1}).to_list(len(ids))}
        following = await _following_ids(user["id"])
        authors = await public_users(db, [p["author_id"] for p in posts])
        profs = {x["user_id"]: x for x in await db.social_profiles.find({"user_id": {"$in": list({p["author_id"] for p in posts})}}, {"_id": 0, "user_id": 1, "is_business": 1, "business_name": 1, "creator_verified": 1, "follower_count": 1}).to_list(500)}
        out = []
        for p in posts:
            a = authors.get(p["author_id"])
            pr = profs.get(p["author_id"]) or {}
            if a:
                a = {**a, "is_business": bool(pr.get("is_business")), "business_name": pr.get("business_name"), "verified": bool(a.get("verified") or pr.get("creator_verified")), "followers": int(pr.get("follower_count") or 0)}
            out.append(shape_post(p, user["id"], mine.get(p["id"]), p["id"] in saved, p["author_id"] in following, a, ctx))
        return out

    async def _get_post(post_id: str, viewer: Optional[dict] = None) -> dict:
        p = await db.social_posts.find_one({"id": post_id}, {"_id": 0})
        ensure(p is not None and p.get("status") != "removed", 404, "This post is no longer available")
        if p.get("status") == "hidden_review" and not (viewer and (viewer["id"] == p["author_id"] or viewer.get("is_admin"))):
            raise HTTPException(404, "This post is being reviewed")
        return p

    def _visible(ctx: dict, uid: str) -> dict:
        ors: list[dict] = [{"visibility": "everyone"}, {"visibility": {"$exists": False}}, {"visibility": "city", "city": ctx["city"]}, {"author_id": uid}]
        if ctx["areas"]:
            ors += [{"visibility": "area", "area": {"$in": ctx["areas"]}}, {"visibility": "city", "area": {"$in": ctx["areas"]}}]
        if ctx["estate_ids"]:
            ors.append({"estate_id": {"$in": ctx["estate_ids"]}})
        return {"$or": ors}

    async def _exclusions(uid: str) -> tuple[list[str], list[str]]:
        hidden = [h["post_id"] for h in await db.social_post_hidden.find({"user_id": uid}, {"_id": 0, "post_id": 1}).to_list(3000)]
        authors = list(await blocked_ids_for(db, uid) | await muted_ids_for(db, uid))
        return hidden, authors

    # ── discovery columns ──
    async def _fixa_column(ctx: dict, page: int) -> Optional[dict]:
        from fixa import provider_card, visible_query

        q = visible_query()
        docs = await db.marketplace.find(q, {"_id": 0}).sort([("is_fixa_verified", -1), ("is_boosted", -1), ("rating", -1)]).limit(24).to_list(24)
        if not docs:
            return None
        local = [d for d in docs if (d.get("city") or "").lower() == (ctx["city"] or "").lower()] or docs
        start = (page * 4) % max(1, len(local))
        pick = (local[start:] + local[:start])[:6]
        items = []
        for d in pick:
            c = {k: v for k, v in provider_card(d).items() if k not in ("phone", "whatsapp", "email")}  # contact stays behind the FIXA gate
            items.append({**c, "description": (d.get("description") or "")[:120], "starting_price": d.get("price") or d.get("provider_starting_price"), "service_areas": d.get("provider_service_areas") or []})
        return {"kind": "fixa", "id": f"fixa-{page}", "title": "FIXA Pros near you", "subtitle": "Verified professionals you can book today", "items": items, "see_all": "/fixa"}

    async def _brands_column(ctx: dict, page: int, uid: str) -> Optional[dict]:
        retailers = {r["id"]: r for r in await db.shop_retailers.find({"published": True}, {"_id": 0, "id": 1, "name": 1, "short_name": 1, "logo": 1, "slug": 1, "verification": 1, "tagline": 1, "accent": 1}).to_list(50)}
        if not retailers:
            return None
        products = await db.shop_products.find({"published": True, "retailer_id": {"$in": list(retailers)}}, {"_id": 0, "id": 1, "name": 1, "price": 1, "promo": 1, "images": 1, "retailer_id": 1, "brand": 1, "popularity_score": 1}).sort([("promo.active", -1), ("popularity_score", -1)]).limit(40).to_list(40)
        if not products:
            return None
        # one product per retailer first, rotating with the page
        by_ret: dict[str, list[dict]] = {}
        for p in products:
            by_ret.setdefault(p["retailer_id"], []).append(p)
        ret_ids = list(by_ret)
        start = page % len(ret_ids)
        order = ret_ids[start:] + ret_ids[:start]
        followed = await _following_ids(uid, "brand")
        items = []
        for rid in order[:6]:
            r = retailers[rid]
            p = by_ret[rid][page % len(by_ret[rid])]
            promo = p.get("promo") or {}
            price = p.get("price")
            if isinstance(price, dict):
                price = price.get("amount")
            items.append({
                "product_id": p["id"], "name": p["name"], "price": price, "image": (p.get("images") or [None])[0],
                "promo": {"label": promo.get("label") or (f"{promo.get('percent_off')}% off" if promo.get("percent_off") else None), "previous_price": promo.get("previous_price")} if promo else None,
                "brand": {"id": rid, "name": r.get("short_name") or r.get("name"), "logo": r.get("logo"), "slug": r.get("slug"), "verified": bool((r.get("verification") or {}).get("status") == "verified" or r.get("verification") is True), "accent": r.get("accent"), "following": rid in followed},
            })
        return {"kind": "brands", "id": f"brands-{page}", "title": "Brands & Products", "subtitle": "From stores selling on AMASS", "items": items, "see_all": "/shop/stores"}

    async def _homes_column(ctx: dict, page: int) -> Optional[dict]:
        q = {"status": {"$nin": ["archived", "sold", "rented", "draft"]}, "images.0": {"$exists": True}, "title": {"$not": {"$regex": r"^TEST_", "$options": "i"}}}
        docs = await db.properties.find({**q, "city": {"$regex": re.escape(ctx["city"]), "$options": "i"}}, {"_id": 0, "id": 1, "title": 1, "price": 1, "listing_type": 1, "city": 1, "images": 1, "bedrooms": 1, "property_type": 1, "verified": 1, "promotion": 1, "agent_name": 1}).sort([("promotion.active", -1), ("views_count", -1)]).limit(12).to_list(12)
        if len(docs) < 3:
            docs = await db.properties.find(q, {"_id": 0, "id": 1, "title": 1, "price": 1, "listing_type": 1, "city": 1, "images": 1, "bedrooms": 1, "property_type": 1, "verified": 1, "promotion": 1, "agent_name": 1}).sort("views_count", -1).limit(12).to_list(12)
        if not docs:
            return None
        start = (page * 3) % len(docs)
        pick = (docs[start:] + docs[:start])[:6]
        return {"kind": "homes", "id": f"homes-{page}", "title": f"Homes in {ctx['city']}", "subtitle": "Fresh listings from verified agents", "items": [{"id": d["id"], "title": d.get("title"), "price": d.get("price"), "listing_type": d.get("listing_type"), "city": d.get("city"), "image": (d.get("images") or [None])[0], "bedrooms": d.get("bedrooms"), "property_type": d.get("property_type"), "verified": bool(d.get("verified")), "promoted": bool((d.get("promotion") or {}).get("active")), "agent_name": d.get("agent_name")} for d in pick], "see_all": "/(tabs)"}

    # ── meta ──
    @router.get("/meta")
    async def meta(user: dict = Depends(get_current_user)):
        ctx = await _ctx(user)
        settings = await get_settings(db)
        prof = await db.social_profiles.find_one({"user_id": user["id"]}, {"_id": 0, "feed_prefs": 1, "handle": 1, "display_name": 1}) or {}
        cities = await db.social_posts.distinct("city", {"status": {"$in": LIVE}})
        return {
            "post_types": POST_TYPES, "reactions": REACTIONS, "filters": FILTERS, "categories": CATEGORIES, "conditions": CONDITIONS, "delivery": DELIVERY, "service_categories": SERVICE_CATEGORIES,
            "scopes": {"estates": ctx["estates"], "areas": ctx["areas"], "city": ctx["home_city"]}, "cities": sorted(c for c in cities if c),
            "defaults": {"visibility": "city", "estate_id": ctx["estate_ids"][0] if ctx["estate_ids"] else None, "has_phone": bool(user.get("phone")), "filter": (prof.get("feed_prefs") or {}).get("default_filter") or "all"},
            "prefs": {"show_sponsored": (prof.get("feed_prefs") or {}).get("show_sponsored", True), "autoplay_videos": (prof.get("feed_prefs") or {}).get("autoplay_videos", True), "interests": (prof.get("feed_prefs") or {}).get("interests") or []},
            "story_expiry_hours": settings["story_expiry_hours"], "quick_messages": QUICK_MESSAGES, "me": {"handle": prof.get("handle"), "display_name": prof.get("display_name") or user.get("full_name"), "is_admin": bool(user.get("is_admin"))},
        }

    # ── the feed ──
    @router.get("")
    async def feed(
        filter: str = "all", city: Optional[str] = None, category: Optional[str] = None, type: Optional[str] = None, q: Optional[str] = None,
        sort: Literal["ranked", "latest"] = "ranked", cursor: Optional[str] = None, limit: int = Query(12, ge=4, le=30), user: dict = Depends(get_current_user),
    ):
        ensure(filter in FILTER_KEYS, 422, "Unknown filter")
        ctx = await _ctx(user, city)
        settings = await get_settings(db)
        hidden, excluded_authors = await _exclusions(user["id"])
        following = await _following_ids(user["id"])
        followed_brands = await _following_ids(user["id"], "brand")
        query: dict[str, Any] = {"status": {"$in": LIVE}, "moderation.status": {"$nin": ["flagged", "removed"]}}
        ands: list[dict] = []
        if filter == "following":
            ensure(True, 200, "")
            ands.append({"$or": [{"author_id": {"$in": list(following)}}, {"promo.brand_id": {"$in": list(followed_brands)}}]})
        elif filter == "nearby":
            sub: list[dict] = [{"city": ctx["city"]}]
            if ctx["areas"]:
                sub.append({"area": {"$in": ctx["areas"]}})
            if ctx["estate_ids"]:
                sub.append({"estate_id": {"$in": ctx["estate_ids"]}})
            ands.append({"$or": sub})
            ands.append(_visible(ctx, user["id"]))
        elif filter == "properties":
            query["type"] = "property"
        elif filter == "services":
            query["type"] = "service"
        elif filter == "products":
            ands.append({"$or": [{"type": {"$in": ["sale", "free", "promo"]}}, {"kind": {"$in": ["give", "sell"]}}]})
        elif filter == "videos":
            query["videos.0"] = {"$exists": True}
        if filter not in ("nearby",):
            # Location relevance without fragmentation: everything visible to the viewer + city-wide posts from the chosen city.
            ands.append({"$or": [_visible(ctx, user["id"]), {"visibility": {"$in": ["city", "everyone"]}, "city": ctx["city"]}]})
        if type and type in TYPE_LABEL:
            query["type"] = type
        if category and category != "all":
            query["category"] = category
        if q and q.strip():
            rx = {"$regex": re.escape(q.strip()), "$options": "i"}
            ands.append({"$or": [{"title": rx}, {"body": rx}, {"hashtags": q.strip().lstrip("#").lower()}, {"author_name": rx}, {"location_label": rx}]})
        if hidden:
            query["id"] = {"$nin": hidden}
        if excluded_authors:
            query["author_id"] = {"$nin": excluded_authors}
        if ands:
            query["$and"] = ands
        prof = await db.social_profiles.find_one({"user_id": user["id"]}, {"_id": 0, "feed_prefs": 1, "interests": 1}) or {}
        show_sponsored = (prof.get("feed_prefs") or {}).get("show_sponsored", True)

        if sort == "latest":
            if cursor:
                try:
                    query["created_at"] = {"$lt": datetime.fromisoformat(cursor)}
                except ValueError:
                    pass
            rows = await db.social_posts.find(query, {"_id": 0}).sort("created_at", -1).limit(limit + 1).to_list(limit + 1)
            more = len(rows) > limit
            rows = rows[:limit]
            next_cursor = _iso(rows[-1]["created_at"]) if more and rows else None
            offset = 0
        else:
            offset = int(cursor) if cursor and cursor.isdigit() else 0
            window = await db.social_posts.find(query, {"_id": 0}).sort("created_at", -1).limit(300).to_list(300)
            ranked = rank_posts(window, ctx=ctx, following=following, followed_brands=followed_brands, interests={**(prof.get("interests") or {}), **{k: 5.0 for k in ((prof.get("feed_prefs") or {}).get("interests") or [])}}, viewer_id=user["id"], show_sponsored=show_sponsored, sponsored_cap=int(settings["sponsored_per_page"]), at=now())
            rows = ranked[offset : offset + limit]
            next_cursor = str(offset + limit) if offset + limit < len(ranked) else None
        posts = await _decorate(rows, user, ctx)

        # Weave discovery columns in: after every `discovery_every` posts a FIXA column, then Brands, alternating
        # (global position, so they land correctly between pages too). Homes slots in at its own offset interval.
        rows_out: list[dict] = []
        every, homes_every = int(settings["discovery_every"]), int(settings["homes_every"])
        for i, p in enumerate(posts):
            rows_out.append({"kind": "post", "id": p["id"], "post": p})
            pos = offset + i + 1
            if every and pos % every == 0:
                slot = pos // every  # 1 → fixa, 2 → brands, 3 → fixa …
                want = "fixa" if slot % 2 == 1 else "brands"
                col = None
                if want == "fixa" and filter in ("all", "nearby", "services"):
                    col = await _fixa_column(ctx, slot // 2)
                elif want == "brands" and filter in ("all", "nearby", "products"):
                    col = await _brands_column(ctx, slot // 2, user["id"])
                if col:
                    rows_out.append({**col, "id": f"{col['kind']}-{slot}"})
            if homes_every and pos % homes_every == homes_every // 2 and filter in ("all", "nearby", "properties"):
                col = await _homes_column(ctx, pos // homes_every)
                if col:
                    rows_out.append({**col, "id": f"homes-{pos}"})
        if not posts and not cursor and filter in ("all", "nearby"):
            col = await _fixa_column(ctx, 0)
            if col:
                rows_out.append(col)
        return {"rows": rows_out, "next_cursor": next_cursor, "filter": filter, "city": ctx["city"], "home_city": ctx["home_city"], "scopes": {"estates": ctx["estates"], "areas": ctx["areas"], "city": ctx["home_city"]}, "count": len(posts)}

    # ── stories ──
    async def _stories_payload(user: dict) -> dict:
        settings = await get_settings(db)
        cutoff = now()
        _hidden, excluded = await _exclusions(user["id"])
        following = await _following_ids(user["id"])
        q: dict[str, Any] = {"expires_at": {"$gt": cutoff}, "status": {"$ne": "removed"}}
        if excluded:
            q["author_id"] = {"$nin": excluded}
        rows = await db.social_stories.find(q, {"_id": 0}).sort("created_at", -1).to_list(400)
        seen = {v["story_id"] for v in await db.social_story_views.find({"user_id": user["id"], "story_id": {"$in": [r["id"] for r in rows]}}, {"_id": 0, "story_id": 1}).to_list(400)} if rows else set()
        groups: dict[str, dict] = {}
        for r in rows:
            g = groups.setdefault(r["author_id"], {"author_id": r["author_id"], "stories": [], "unseen": 0, "latest": r["created_at"]})
            g["stories"].append({"id": r["id"], "media_url": r["media_url"], "media_type": r.get("media_type", "image"), "caption": r.get("caption"), "link_post_id": r.get("link_post_id"), "created_at": _iso(r["created_at"]), "expires_at": _iso(r["expires_at"]), "view_count": int(r.get("view_count", 0)), "seen": r["id"] in seen, "is_mine": r["author_id"] == user["id"]})
            g["unseen"] += 0 if r["id"] in seen else 1
        authors = await public_users(db, list(groups))
        out = []
        for aid, g in groups.items():
            g["stories"].sort(key=lambda s: s["created_at"])
            out.append({**g, "latest": _iso(g["latest"]), "author": authors.get(aid) or {"id": aid, "full_name": "AMASS member"}, "is_mine": aid == user["id"], "following": aid in following})
        out.sort(key=lambda g: (not g["is_mine"], not g["following"], -g["unseen"], g["latest"]), reverse=False)
        # mine first, then followed, then unseen-first
        out.sort(key=lambda g: (0 if g["is_mine"] else 1, 0 if g["following"] else 1, 0 if g["unseen"] else 1))
        return {"groups": out, "expiry_hours": settings["story_expiry_hours"], "can_post": sum(1 for r in rows if r["author_id"] == user["id"]) < STORY_LIMIT}

    @router.get("/stories")
    async def stories(user: dict = Depends(get_current_user)):
        return await _stories_payload(user)

    @router.post("/stories", status_code=201)
    async def create_story(data: StoryIn, user: dict = Depends(get_current_user)):
        settings = await get_settings(db)
        ensure(data.media_url.startswith("http") or data.media_url.startswith("/api/public-files/"), 422, "Upload the photo or video first")
        count = await db.social_stories.count_documents({"author_id": user["id"], "expires_at": {"$gt": now()}})
        ensure(count < STORY_LIMIT, 429, f"You can have up to {STORY_LIMIT} live stories at a time")
        n = now()
        doc = {"id": new_id(), "author_id": user["id"], "media_url": data.media_url, "media_type": data.media_type, "caption": (data.caption or "").strip() or None, "link_post_id": data.link_post_id, "status": "active", "view_count": 0, "created_at": n, "expires_at": n + timedelta(hours=int(settings["story_expiry_hours"]))}
        await db.social_stories.insert_one(dict(doc))
        return {"ok": True, "story": {**doc, "created_at": _iso(n), "expires_at": _iso(doc["expires_at"])}}

    @router.post("/stories/{story_id}/view")
    async def view_story(story_id: str, user: dict = Depends(get_current_user)):
        r = await db.social_story_views.update_one({"story_id": story_id, "user_id": user["id"]}, {"$setOnInsert": {"story_id": story_id, "user_id": user["id"], "created_at": now()}}, upsert=True)
        if r.upserted_id is not None:
            await db.social_stories.update_one({"id": story_id}, {"$inc": {"view_count": 1}})
        return {"ok": True}

    @router.delete("/stories/{story_id}")
    async def delete_story(story_id: str, user: dict = Depends(get_current_user)):
        q = {"id": story_id} if user.get("is_admin") else {"id": story_id, "author_id": user["id"]}
        r = await db.social_stories.update_one(q, {"$set": {"status": "removed", "expires_at": now()}})
        ensure(r.matched_count > 0, 404, "Story not found")
        return {"ok": True}

    # ── create / edit ──
    async def _resolve_place(user: dict, ctx: dict, data: FeedPostIn | FeedPostPatch, existing: Optional[dict] = None) -> dict:
        est = None
        estate_id = getattr(data, "estate_id", None) or (existing or {}).get("estate_id")
        if estate_id:
            est = next((e for e in ctx["estates"] if e["id"] == estate_id), None)
        elif ctx["estates"]:
            est = ctx["estates"][0]
        vis = getattr(data, "visibility", None) or (existing or {}).get("visibility", "city")
        if vis == "estate":
            ensure(est is not None, 422, "Join your estate in Neighbours to share with your estate only")
        return {"visibility": vis, "estate_id": est["id"] if est else None, "estate_name": est["name"] if est else None, "area": (est.get("area") if est else None) or (ctx["areas"][0] if ctx["areas"] else None), "city": (est.get("city") if est else None) or ctx["home_city"]}

    async def _property_snapshot(property_id: Optional[str]) -> Optional[dict]:
        if not property_id:
            return None
        d = await db.properties.find_one({"id": property_id}, {"_id": 0, "id": 1, "title": 1, "price": 1, "listing_type": 1, "city": 1, "images": 1, "bedrooms": 1, "bathrooms": 1, "property_type": 1, "verified": 1, "agent_id": 1, "agent_name": 1})
        ensure(d is not None, 404, "That listing wasn't found")
        return {"id": d["id"], "title": d.get("title"), "price": d.get("price"), "listing_type": d.get("listing_type"), "city": d.get("city"), "image": (d.get("images") or [None])[0], "bedrooms": d.get("bedrooms"), "bathrooms": d.get("bathrooms"), "property_type": d.get("property_type"), "verified": bool(d.get("verified")), "agent_name": d.get("agent_name")}

    async def _mention_ids(handles: list[str]) -> list[str]:
        if not handles:
            return []
        rows = await db.social_profiles.find({"handle_lc": {"$in": handles}}, {"_id": 0, "user_id": 1}).to_list(50)
        return [r["user_id"] for r in rows]

    async def _notify_mentions(post: dict, user: dict, uids: list[str]) -> None:
        for uid in uids:
            if uid == user["id"]:
                continue
            try:
                await notify(db, uid, "SOCIAL_MENTION", f"{user.get('full_name', 'Someone')} mentioned you", (post.get("title") or post.get("body") or "")[:120], {"post_id": post["id"]})
            except Exception:
                continue

    @router.post("/posts", status_code=201)
    async def create_post(data: FeedPostIn, user: dict = Depends(get_current_user)):
        from feed_moderation import screen_post

        settings = await get_settings(db)
        ctx = await _ctx(user)
        prof = await db.social_profiles.find_one({"user_id": user["id"]}, {"_id": 0, "feed_suspended": 1}) or {}
        ensure(not prof.get("feed_suspended"), 403, "Your Feed posting is paused by a moderator. Reply to the notice in Activity to appeal.")
        since = now() - timedelta(days=1)
        ensure(await db.social_posts.count_documents({"author_id": user["id"], "created_at": {"$gte": since}}) < int(settings["max_posts_per_day"]), 429, "You've posted a lot today — try again tomorrow.")
        text = f"{data.title or ''}\n{data.body or ''}".strip()
        has_media = bool([p for p in data.photos if p] or data.videos)
        ensure(bool(text) or has_media, 422, "Write something or add a photo")
        if data.type in ("sale", "free"):
            ensure(bool((data.title or "").strip()), 422, "Give the item a title")
            ensure((data.category or "other") in CATEGORY_LABEL, 422, "Pick a category")
            ensure((data.condition or "good") in CONDITION_LABEL, 422, "Pick a condition")
        if data.type == "sale":
            ensure((data.price or 0) > 0, 422, "Add a price, or post it as Free")
        if data.type == "service":
            ensure(bool((data.service_category or "").strip()), 422, "What service do you offer?")
        if data.type == "promo":
            ensure(bool((data.business_name or "").strip()), 422, "Add your business name")
        prop = await _property_snapshot(data.property_id) if data.type == "property" else None
        if data.type == "property":
            ensure(prop is not None, 422, "Pick the listing to showcase")
        if data.contact_whatsapp or data.contact_phone:
            ensure(bool(user.get("phone")), 422, "Add a phone number to your profile to offer WhatsApp or calls")
        place = await _resolve_place(user, ctx, data)
        n = now()
        handles = _extract_mentions(text)
        mention_ids = await _mention_ids(handles)
        kind = "sell" if data.type == "sale" else "give" if data.type == "free" else "post"
        post = {
            "id": new_id(), "author_id": user["id"], "author_name": user.get("full_name"), "author_avatar": user.get("avatar_url"),
            "type": data.type, "kind": kind, "title": (data.title or "").strip() or None, "body": (data.body or "").strip(),
            "photos": [p for p in data.photos if p][:10], "videos": [v.model_dump() for v in data.videos][:2],
            "price": data.price if data.type in ("sale", "service") else None, "negotiable": data.negotiable if data.type == "sale" else False,
            "category": (data.category or "other") if data.type in ("sale", "free") else None, "condition": (data.condition or "good") if data.type in ("sale", "free") else None, "delivery": data.delivery if data.type in ("sale", "free") else None,
            "service": {"category": data.service_category.strip(), "starting_price": data.starting_price, "coverage": (data.coverage or "").strip() or None} if data.type == "service" else None,
            "property": prop, "property_id": prop["id"] if prop else None,
            "promo": {"business_name": data.business_name.strip(), "offer": (data.offer or "").strip() or None, "link_url": (data.link_url or "").strip() or None, "ends_at": data.ends_at, "brand_id": None} if data.type == "promo" else None,
            **place, "location_label": (data.location_label or "").strip() or None,
            "contact_chat": data.contact_chat or not (data.contact_whatsapp or data.contact_phone), "contact_whatsapp": data.contact_whatsapp, "contact_phone": data.contact_phone,
            "mention_handles": handles, "mention_ids": mention_ids, "hashtags": _extract_hashtags(text), "tags": {"products": data.tagged_products[:6], "brands": data.tagged_brands[:3], "properties": [prop["id"]] if prop else []},
            "sponsored": bool(data.sponsored and (data.type == "promo" or user.get("is_admin"))), "source": "feed",
            "status": "active", "moderation": {"status": "pending" if settings["ai_moderation"] else "clear"},
            "reactions": {k: 0 for k in REACTION_KEYS}, "like_count": 0, "comment_count": 0, "share_count": 0, "repost_count": 0, "save_count": 0, "view_count": 0, "video_views": 0,
            "cross_list_market": data.type == "sale", "market_item_id": None, "edited": False, "created_at": n, "updated_at": n,
        }
        post["market_item_id"] = await market_sync(db, post, user)
        await db.social_posts.insert_one(dict(post))
        await award(db, user["id"], "social_post", 3, {"post_id": post["id"]})
        await db.social_profiles.update_one({"user_id": user["id"]}, {"$inc": {"post_count": 1}, "$setOnInsert": {"user_id": user["id"], "created_at": n}}, upsert=True)
        if mention_ids:
            _spawn(_notify_mentions(post, user, mention_ids))
        if settings["ai_moderation"]:
            _spawn(screen_post(db, post["id"]))
        # Followers hear about new posts from people/brands they follow (bundled by the notification centre's digest rules).
        _spawn(_notify_followers(post, user))
        return {"ok": True, "post": (await _decorate([post], user, ctx))[0]}

    async def _notify_followers(post: dict, user: dict) -> None:
        rows = await db.social_follows.find({"target_type": "user", "target_id": user["id"]}, {"_id": 0, "follower_id": 1}).to_list(5000)
        blocked = await blocked_ids_for(db, user["id"])
        label = TYPE_LABEL.get(post_type_of(post), "post").lower()
        for r in rows:
            uid = r["follower_id"]
            if uid in blocked:
                continue
            try:
                await notify(db, uid, "SOCIAL_FOLLOWED_POST", f"{user.get('full_name', 'Someone you follow')} shared a new {label}", (post.get("title") or post.get("body") or "")[:120], {"post_id": post["id"], "author_id": user["id"]})
            except Exception:
                continue

    @router.get("/posts/mine")
    async def mine(user: dict = Depends(get_current_user)):
        ctx = await _ctx(user)
        # Everything I posted, including posts a moderator removed (so I can read the reason + appeal); my own deletions stay gone.
        rows = await db.social_posts.find({"author_id": user["id"], "$or": [{"status": {"$ne": "removed"}}, {"moderation.decided_by": {"$exists": True}, "moderation.status": {"$in": ["removed", "appealed"]}}]}, {"_id": 0}).sort("created_at", -1).to_list(200)
        items = await _decorate(rows, user, ctx)
        for it, raw in zip(items, rows):
            it["moderation"] = {k: (raw.get("moderation") or {}).get(k) for k in ("status", "summary", "labels", "decision_note")}
        counts: dict[str, int] = {}
        for r in rows:
            counts[r.get("status", "active")] = counts.get(r.get("status", "active"), 0) + 1
        return {"items": items, "counts": counts}

    @router.get("/posts/{post_id}")
    async def detail(post_id: str, user: dict = Depends(get_current_user)):
        p = await _get_post(post_id, user)
        ctx = await _ctx(user)
        out = (await _decorate([p], user, ctx))[0]
        comments = await db.social_post_comments.find({"post_id": post_id, "status": "active"}, {"_id": 0}).sort("created_at", 1).to_list(300)
        cauth = await public_users(db, [c["author_id"] for c in comments])
        liked = {r["comment_id"] for r in await db.social_comment_likes.find({"user_id": user["id"], "comment_id": {"$in": [c["id"] for c in comments]}}, {"_id": 0, "comment_id": 1}).to_list(300)} if comments else set()
        out["comments"] = [{"id": c["id"], "body": c["body"], "parent_id": c.get("parent_id"), "like_count": int(c.get("like_count", 0)), "liked": c["id"] in liked, "created_at": _iso(c["created_at"]), "author": cauth.get(c["author_id"]), "is_mine": c["author_id"] == user["id"], "is_poster": c["author_id"] == p["author_id"]} for c in comments]
        prof = await db.social_profiles.find_one({"user_id": p["author_id"]}, {"_id": 0, "follower_count": 1, "post_count": 1, "bio": 1}) or {}
        out["author_stats"] = {"posts": int(prof.get("post_count") or await db.social_posts.count_documents({"author_id": p["author_id"], "status": {"$in": LIVE + ["gone"]}})), "followers": int(prof.get("follower_count") or 0), "bio": prof.get("bio")}
        out["can_contact"] = p["author_id"] != user["id"] and p.get("status") in LIVE and (p["author_id"] not in await blocked_ids_for(db, user["id"]))
        out["quick_messages"] = QUICK_MESSAGES
        out["moderation"] = {k: (p.get("moderation") or {}).get(k) for k in ("status", "summary", "decision_note")} if p["author_id"] == user["id"] or user.get("is_admin") else None
        if p.get("repost_of"):
            orig = await db.social_posts.find_one({"id": p["repost_of"], "status": {"$ne": "removed"}}, {"_id": 0})
            out["original"] = (await _decorate([orig], user, ctx))[0] if orig else None
        similar_q: dict[str, Any] = {"id": {"$ne": post_id}, "status": {"$in": LIVE}, "moderation.status": {"$nin": ["flagged", "removed"]}}
        if p.get("category"):
            similar_q["category"] = p["category"]
        else:
            similar_q["type"] = post_type_of(p)
        similar = await db.social_posts.find(similar_q, {"_id": 0}).sort("created_at", -1).limit(6).to_list(6)
        out["similar"] = await _decorate(similar, user, ctx)
        if p["author_id"] != user["id"]:
            await db.social_posts.update_one({"id": post_id}, {"$inc": {"view_count": 1}})
        return out

    @router.patch("/posts/{post_id}")
    async def edit_post(post_id: str, data: FeedPostPatch, user: dict = Depends(get_current_user)):
        from feed_moderation import screen_post

        p = await _get_post(post_id, user)
        ensure(p["author_id"] == user["id"] or bool(user.get("is_admin")), 403, "Only the poster can edit this")
        ctx = await _ctx(user)
        ch = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None}
        t = post_type_of(p)
        if "videos" in ch:
            ch["videos"] = [v for v in ch["videos"] if v.get("url")][:2]
        if "photos" in ch:
            ch["photos"] = [x for x in ch["photos"] if x][:10]
        if t == "sale" and (ch.get("price", p.get("price")) or 0) <= 0:
            raise HTTPException(422, "Add a price, or mark the item as free")
        if "category" in ch:
            ensure(ch["category"] in CATEGORY_LABEL, 422, "Pick a category")
        if "condition" in ch:
            ensure(ch["condition"] in CONDITION_LABEL, 422, "Pick a condition")
        if ch.get("contact_whatsapp") or ch.get("contact_phone"):
            ensure(bool(user.get("phone")), 422, "Add a phone number to your profile to offer WhatsApp or calls")
        if t == "service" and any(k in ch for k in ("service_category", "starting_price", "coverage")):
            ch["service"] = {**(p.get("service") or {}), **({"category": ch.pop("service_category")} if "service_category" in ch else {}), **({"starting_price": ch.pop("starting_price")} if "starting_price" in ch else {}), **({"coverage": ch.pop("coverage")} if "coverage" in ch else {})}
        if t == "promo" and any(k in ch for k in ("business_name", "offer", "link_url")):
            ch["promo"] = {**(p.get("promo") or {}), **({"business_name": ch.pop("business_name")} if "business_name" in ch else {}), **({"offer": ch.pop("offer")} if "offer" in ch else {}), **({"link_url": ch.pop("link_url")} if "link_url" in ch else {})}
        for k in ("service_category", "starting_price", "coverage", "business_name", "offer", "link_url"):
            ch.pop(k, None)
        content_changed = bool({"title", "body", "photos", "videos", "price"} & set(ch))
        if content_changed:
            ch["edited"] = True
            text = f"{ch.get('title', p.get('title')) or ''}\n{ch.get('body', p.get('body')) or ''}"
            ch["mention_handles"], ch["hashtags"] = _extract_mentions(text), _extract_hashtags(text)
            ch["mention_ids"] = await _mention_ids(ch["mention_handles"])
            if (await get_settings(db))["ai_moderation"]:
                ch["moderation"] = {"status": "pending"}
        ch["updated_at"] = now()
        merged = {**p, **ch}
        merged["market_item_id"] = await market_sync(db, merged, user)
        ch["market_item_id"] = merged["market_item_id"]
        await db.social_posts.update_one({"id": post_id}, {"$set": ch})
        if content_changed and ch.get("moderation"):
            _spawn(screen_post(db, post_id))
        return {"ok": True, "post": (await _decorate([merged], user, ctx))[0]}

    @router.delete("/posts/{post_id}")
    async def delete_post(post_id: str, user: dict = Depends(get_current_user)):
        p = await db.social_posts.find_one({"id": post_id}, {"_id": 0})
        ensure(p is not None, 404, "Post not found")
        ensure(p["author_id"] == user["id"] or bool(user.get("is_admin")), 403, "Only the poster can delete this")
        await db.social_posts.update_one({"id": post_id}, {"$set": {"status": "removed", "updated_at": now()}})
        if p.get("market_item_id"):
            await db.marketplace.update_one({"id": p["market_item_id"]}, {"$set": {"status": "removed"}})
        await db.social_profiles.update_one({"user_id": p["author_id"], "post_count": {"$gt": 0}}, {"$inc": {"post_count": -1}})
        return {"ok": True}

    # ── reactions ──
    @router.post("/posts/{post_id}/react")
    async def react(post_id: str, data: ReactIn, user: dict = Depends(get_current_user)):
        p = await _get_post(post_id, user)
        if data.emoji is not None:
            ensure(data.emoji in REACTION_KEYS, 422, "Unknown reaction")
        key = {"post_id": post_id, "user_id": user["id"]}
        prev = await db.social_post_reactions.find_one(key, {"_id": 0, "emoji": 1})
        inc: dict[str, int] = {}
        if prev:
            inc[f"reactions.{prev['emoji']}"] = -1
        if data.emoji is None or (prev and prev["emoji"] == data.emoji):
            if prev:
                await db.social_post_reactions.delete_one(key)
            mine = None
        else:
            await db.social_post_reactions.update_one(key, {"$set": {**key, "emoji": data.emoji, "created_at": now()}}, upsert=True)
            inc[f"reactions.{data.emoji}"] = inc.get(f"reactions.{data.emoji}", 0) + 1
            mine = data.emoji
            await _bump_interest(user["id"], p, 1.0)
            if not prev and p["author_id"] != user["id"]:
                em = next((r["emoji"] for r in REACTIONS if r["key"] == data.emoji), "👍")
                try:
                    await notify(db, p["author_id"], "SOCIAL_REACTION", f"{user.get('full_name', 'Someone')} reacted {em} to your post", (p.get("title") or p.get("body") or "")[:100], {"post_id": post_id, "emoji": data.emoji})
                except Exception:
                    pass
        inc = {k: v for k, v in inc.items() if v}
        if inc:
            await db.social_posts.update_one({"id": post_id}, {"$inc": inc})
        fresh = await db.social_posts.find_one({"id": post_id}, {"_id": 0, "reactions": 1})
        reactions = {k: max(0, int((fresh or {}).get("reactions", {}).get(k, 0) or 0)) for k in REACTION_KEYS}
        await db.social_posts.update_one({"id": post_id}, {"$set": {"like_count": sum(reactions.values())}})
        return {"my_reaction": mine, "reactions": reactions, "reaction_count": sum(reactions.values())}

    @router.get("/posts/{post_id}/reactions")
    async def who_reacted(post_id: str, user: dict = Depends(get_current_user)):
        await _get_post(post_id, user)
        rows = await db.social_post_reactions.find({"post_id": post_id}, {"_id": 0}).sort("created_at", -1).to_list(200)
        users = await public_users(db, [r["user_id"] for r in rows])
        return {"items": [{"emoji": r["emoji"], "user": users.get(r["user_id"])} for r in rows if users.get(r["user_id"])]}

    # ── comments (threaded) ──
    @router.post("/posts/{post_id}/comments", status_code=201)
    async def comment(post_id: str, data: CommentIn, user: dict = Depends(get_current_user)):
        settings = await get_settings(db)
        p = await _get_post(post_id, user)
        ensure(p["author_id"] not in await blocked_ids_for(db, user["id"]), 403, "You can't reply to this member")
        ensure(await db.social_post_comments.count_documents({"author_id": user["id"], "created_at": {"$gte": now() - timedelta(hours=1)}}) < int(settings["max_comments_per_hour"]), 429, "Slow down a little — too many comments in the last hour.")
        parent = None
        if data.parent_id:
            parent = await db.social_post_comments.find_one({"id": data.parent_id, "post_id": post_id, "status": "active"}, {"_id": 0})
            ensure(parent is not None, 404, "That comment is gone")
        handles = _extract_mentions(data.body)
        c = {"id": new_id(), "post_id": post_id, "author_id": user["id"], "body": data.body.strip(), "parent_id": (parent or {}).get("parent_id") or (parent or {}).get("id"), "mention_handles": handles, "status": "active", "like_count": 0, "created_at": now()}
        await db.social_post_comments.insert_one(dict(c))
        await db.social_posts.update_one({"id": post_id}, {"$inc": {"comment_count": 1}})
        await _bump_interest(user["id"], p, 1.5)
        if p["author_id"] != user["id"]:
            await notify(db, p["author_id"], "SOCIAL_POST_COMMENT", f"{user.get('full_name', 'Someone')} commented on your post", f"{c['body'][:110]}", {"post_id": post_id, "comment_id": c["id"]})
        if parent and parent["author_id"] not in (user["id"], p["author_id"]):
            await notify(db, parent["author_id"], "SOCIAL_COMMENT_REPLY", f"{user.get('full_name', 'Someone')} replied to your comment", c["body"][:110], {"post_id": post_id, "comment_id": c["id"]})
        for uid in await _mention_ids(handles):
            if uid not in (user["id"], p["author_id"]):
                await notify(db, uid, "SOCIAL_MENTION", f"{user.get('full_name', 'Someone')} mentioned you in a comment", c["body"][:110], {"post_id": post_id, "comment_id": c["id"]})
        authors = await public_users(db, [user["id"]])
        return {"ok": True, "comment": {"id": c["id"], "body": c["body"], "parent_id": c["parent_id"], "like_count": 0, "created_at": _iso(c["created_at"]), "author": authors.get(user["id"]), "is_mine": True, "is_poster": p["author_id"] == user["id"]}}

    @router.delete("/posts/{post_id}/comments/{comment_id}")
    async def delete_comment(post_id: str, comment_id: str, user: dict = Depends(get_current_user)):
        p = await _get_post(post_id, user)
        c = await db.social_post_comments.find_one({"id": comment_id, "post_id": post_id, "status": "active"}, {"_id": 0})
        ensure(c is not None, 404, "Comment not found")
        ensure(c["author_id"] == user["id"] or p["author_id"] == user["id"] or bool(user.get("is_admin")), 403, "You can't remove this comment")
        r = await db.social_post_comments.update_many({"$or": [{"id": comment_id}, {"parent_id": comment_id}], "status": "active"}, {"$set": {"status": "removed", "removed_by": user["id"], "updated_at": now()}})
        await db.social_posts.update_one({"id": post_id}, {"$inc": {"comment_count": -int(r.modified_count)}})
        await db.social_posts.update_one({"id": post_id, "comment_count": {"$lt": 0}}, {"$set": {"comment_count": 0}})
        return {"ok": True}

    @router.post("/posts/{post_id}/comments/{comment_id}/like")
    async def like_comment(post_id: str, comment_id: str, user: dict = Depends(get_current_user)):
        await _get_post(post_id, user)
        key = {"comment_id": comment_id, "user_id": user["id"]}
        if await db.social_comment_likes.find_one(key):
            await db.social_comment_likes.delete_one(key)
            await db.social_post_comments.update_one({"id": comment_id, "like_count": {"$gt": 0}}, {"$inc": {"like_count": -1}})
            liked = False
        else:
            await db.social_comment_likes.insert_one({**key, "created_at": now()})
            await db.social_post_comments.update_one({"id": comment_id}, {"$inc": {"like_count": 1}})
            liked = True
        fresh = await db.social_post_comments.find_one({"id": comment_id}, {"_id": 0, "like_count": 1})
        return {"liked": liked, "like_count": int((fresh or {}).get("like_count", 0))}

    # ── share / repost / save ──
    @router.post("/posts/{post_id}/share")
    async def share(post_id: str, data: ShareIn, user: dict = Depends(get_current_user)):
        p = await _get_post(post_id, user)
        ctx = await _ctx(user)
        await db.social_shares.insert_one({"id": new_id(), "post_id": post_id, "user_id": user["id"], "channel": data.channel, "created_at": now()})
        if data.channel != "repost":
            await db.social_posts.update_one({"id": post_id}, {"$inc": {"share_count": 1}})
            if p["author_id"] != user["id"]:
                await notify(db, p["author_id"], "SOCIAL_SHARE", f"{user.get('full_name', 'Someone')} shared your post", (p.get("title") or p.get("body") or "")[:100], {"post_id": post_id})
            return {"ok": True, "share_count": int(p.get("share_count", 0)) + 1, "url": f"https://amass.africa/social/post/{post_id}"}
        ensure(p["author_id"] != user["id"], 400, "That's your own post")
        ensure(await db.social_posts.find_one({"repost_of": post_id, "author_id": user["id"], "status": {"$ne": "removed"}}) is None, 409, "You've already reposted this")
        n = now()
        root = p
        if p.get("repost_of"):
            root = await db.social_posts.find_one({"id": p["repost_of"]}, {"_id": 0}) or p
        repost = {
            "id": new_id(), "author_id": user["id"], "author_name": user.get("full_name"), "author_avatar": user.get("avatar_url"), "type": "general", "kind": "post",
            "title": None, "body": (data.comment or "").strip(), "photos": [], "videos": [], "repost_of": root["id"], "repost_comment": (data.comment or "").strip() or None,
            "visibility": "everyone", "city": ctx["home_city"], "area": ctx["areas"][0] if ctx["areas"] else None, "estate_id": None, "contact_chat": False, "contact_whatsapp": False, "contact_phone": False,
            "status": "active", "moderation": {"status": "clear"}, "reactions": {k: 0 for k in REACTION_KEYS}, "like_count": 0, "comment_count": 0, "share_count": 0, "repost_count": 0, "save_count": 0, "view_count": 0, "video_views": 0,
            "source": "repost", "edited": False, "created_at": n, "updated_at": n, "mention_handles": [], "hashtags": _extract_hashtags(data.comment or ""), "tags": {},
        }
        await db.social_posts.insert_one(dict(repost))
        await db.social_posts.update_one({"id": root["id"]}, {"$inc": {"repost_count": 1}})
        if root["author_id"] != user["id"]:
            await notify(db, root["author_id"], "SOCIAL_SHARE", f"{user.get('full_name', 'Someone')} reposted your post", (root.get("title") or root.get("body") or "")[:100], {"post_id": root["id"], "repost_id": repost["id"]})
        return {"ok": True, "repost": (await _decorate([repost], user, ctx))[0]}

    @router.post("/posts/{post_id}/save")
    async def toggle_save(post_id: str, user: dict = Depends(get_current_user)):
        p = await _get_post(post_id, user)
        key = {"post_id": post_id, "user_id": user["id"]}
        if await db.social_saves.find_one(key):
            await db.social_saves.delete_one(key)
            await db.social_posts.update_one({"id": post_id, "save_count": {"$gt": 0}}, {"$inc": {"save_count": -1}})
            saved = False
        else:
            await db.social_saves.insert_one({**key, "created_at": now()})
            await db.social_posts.update_one({"id": post_id}, {"$inc": {"save_count": 1}})
            await _bump_interest(user["id"], p, 2.0)
            saved = True
        return {"saved": saved}

    @router.get("/saved")
    async def saved_posts(user: dict = Depends(get_current_user)):
        ctx = await _ctx(user)
        ids = [s["post_id"] for s in await db.social_saves.find({"user_id": user["id"]}, {"_id": 0, "post_id": 1}).sort("created_at", -1).to_list(200)]
        rows = await db.social_posts.find({"id": {"$in": ids}, "status": {"$ne": "removed"}}, {"_id": 0}).to_list(200)
        by = {r["id"]: r for r in rows}
        return {"items": await _decorate([by[i] for i in ids if i in by], user, ctx)}

    @router.post("/views")
    async def views(data: ViewsIn, user: dict = Depends(get_current_user)):
        """Batched impressions from the client (once per viewer per post → reach for creators)."""
        counted = 0
        for pid in data.post_ids[:50]:
            r = await db.social_post_views.update_one({"post_id": pid, "user_id": user["id"]}, {"$setOnInsert": {"post_id": pid, "user_id": user["id"], "created_at": now()}}, upsert=True)
            if r.upserted_id is not None:
                await db.social_posts.update_one({"id": pid}, {"$inc": {"view_count": 1}})
                counted += 1
        if data.video_ids:
            await db.social_posts.update_many({"id": {"$in": data.video_ids[:50]}}, {"$inc": {"video_views": 1}})
        return {"ok": True, "counted": counted}

    # ── follow ──
    @router.post("/follow/{target_id}")
    async def follow(target_id: str, data: FollowIn, user: dict = Depends(get_current_user)):
        ensure(not (data.target_type == "user" and target_id == user["id"]), 400, "You can't follow yourself")
        if data.target_type == "user":
            ensure(await db.users.find_one({"id": target_id}, {"_id": 0, "id": 1}) is not None, 404, "Member not found")
            ensure(target_id not in await blocked_ids_for(db, user["id"]), 403, "You can't follow this member")
        elif data.target_type == "brand":
            ensure(await db.shop_retailers.find_one({"id": target_id}, {"_id": 0, "id": 1}) is not None, 404, "Brand not found")
        else:
            ensure(await db.marketplace.find_one({"id": target_id, "category": "services"}, {"_id": 0, "id": 1}) is not None, 404, "Provider not found")
        key = {"follower_id": user["id"], "target_type": data.target_type, "target_id": target_id}
        if await db.social_follows.find_one(key):
            await db.social_follows.delete_one(key)
            following = False
            if data.target_type == "user":
                await db.social_profiles.update_one({"user_id": target_id, "follower_count": {"$gt": 0}}, {"$inc": {"follower_count": -1}})
        else:
            await db.social_follows.insert_one({**key, "id": new_id(), "created_at": now()})
            following = True
            if data.target_type == "user":
                await db.social_profiles.update_one({"user_id": target_id}, {"$inc": {"follower_count": 1}, "$setOnInsert": {"user_id": target_id, "created_at": now()}}, upsert=True)
                await notify(db, target_id, "SOCIAL_FOLLOW", f"{user.get('full_name', 'Someone')} started following you", "Tap to see their profile", {"user_id": user["id"]})
        count = await db.social_follows.count_documents({"target_type": data.target_type, "target_id": target_id})
        return {"following": following, "follower_count": count}

    @router.get("/following")
    async def following_list(user: dict = Depends(get_current_user)):
        rows = await db.social_follows.find({"follower_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(2000)
        users = await public_users(db, [r["target_id"] for r in rows if r["target_type"] == "user"])
        brands = {b["id"]: b for b in await db.shop_retailers.find({"id": {"$in": [r["target_id"] for r in rows if r["target_type"] == "brand"]}}, {"_id": 0, "id": 1, "name": 1, "logo": 1, "slug": 1}).to_list(200)}
        provs = {p["id"]: p for p in await db.marketplace.find({"id": {"$in": [r["target_id"] for r in rows if r["target_type"] == "provider"]}}, {"_id": 0, "id": 1, "seller_name": 1, "name": 1, "image": 1, "subcategory": 1}).to_list(200)}
        out = []
        for r in rows:
            if r["target_type"] == "user" and users.get(r["target_id"]):
                out.append({"target_type": "user", "id": r["target_id"], "name": users[r["target_id"]]["full_name"], "image": users[r["target_id"]].get("avatar_url"), "path": f"/social/user/{r['target_id']}"})
            elif r["target_type"] == "brand" and brands.get(r["target_id"]):
                b = brands[r["target_id"]]
                out.append({"target_type": "brand", "id": b["id"], "name": b["name"], "image": b.get("logo"), "path": f"/shop/store/{b.get('slug') or b['id']}"})
            elif r["target_type"] == "provider" and provs.get(r["target_id"]):
                p = provs[r["target_id"]]
                out.append({"target_type": "provider", "id": p["id"], "name": p.get("seller_name") or p.get("name"), "image": p.get("image"), "subtitle": p.get("subcategory"), "path": f"/fixa/{p['id']}"})
        return {"items": out}

    # ── profiles (everyone is a creator) ──
    @router.get("/users/{user_id}")
    async def profile(user_id: str, user: dict = Depends(get_current_user)):
        ctx = await _ctx(user)
        u = await db.users.find_one({"id": user_id}, {"_id": 0, "id": 1, "full_name": 1, "avatar_url": 1, "profile_photo": 1, "city": 1, "verified": 1, "is_agent": 1, "created_at": 1})
        ensure(u is not None, 404, "Member not found")
        prof = await db.social_profiles.find_one({"user_id": user_id}, {"_id": 0}) or {}
        pub = (await public_users(db, [user_id])).get(user_id) or {}
        blocked = user_id in await blocked_ids_for(db, user["id"])
        rows = [] if blocked else await db.social_posts.find({"author_id": user_id, "status": {"$in": LIVE + ["gone"]}, "moderation.status": {"$nin": ["flagged", "removed"]}}, {"_id": 0}).sort("created_at", -1).limit(60).to_list(60)
        posts = await _decorate(rows, user, ctx)
        followers = await db.social_follows.count_documents({"target_type": "user", "target_id": user_id})
        following_n = await db.social_follows.count_documents({"follower_id": user_id})
        following = await db.social_follows.find_one({"follower_id": user["id"], "target_type": "user", "target_id": user_id}) is not None
        provider = await db.marketplace.find_one({"seller_id": user_id, "category": "services", "status": {"$nin": ["removed", "paused"]}}, {"_id": 0, "id": 1, "subcategory": 1, "is_fixa_verified": 1})
        return {
            **pub, "verified": bool(pub.get("verified") or prof.get("creator_verified")), "bio": prof.get("bio"), "handle": prof.get("handle"), "website": prof.get("website"),
            "is_business": bool(prof.get("is_business")), "business_name": prof.get("business_name"), "creator_category": prof.get("creator_category"), "badges": prof.get("badges") or [],
            "stats": {"posts": len(rows), "followers": followers, "following": following_n, "reactions": sum(p["reaction_count"] for p in posts)},
            "following": following, "is_me": user_id == user["id"], "blocked": blocked, "posts": posts,
            "fixa_provider": {"id": provider["id"], "trade": provider.get("subcategory"), "verified": bool(provider.get("is_fixa_verified"))} if provider else None,
            "agent": {"is_agent": bool(u.get("is_agent"))},
        }

    @router.patch("/me")
    async def patch_me(data: ProfileIn, user: dict = Depends(get_current_user)):
        ch = {k: v for k, v in data.model_dump(exclude_unset=True).items()}
        if "handle" in ch and ch["handle"]:
            ch["handle"] = ch["handle"].strip().lstrip("@")
            ch["handle_lc"] = ch["handle"].lower()
            taken = await db.social_profiles.find_one({"handle_lc": ch["handle_lc"], "user_id": {"$ne": user["id"]}}, {"_id": 0, "user_id": 1})
            ensure(taken is None, 409, "That handle is taken")
        for k in ("display_name", "bio", "business_name", "creator_category", "website"):
            if k in ch and isinstance(ch[k], str):
                ch[k] = ch[k].strip() or None
        await db.social_profiles.update_one({"user_id": user["id"]}, {"$set": {**ch, "updated_at": now()}, "$setOnInsert": {"user_id": user["id"], "created_at": now()}}, upsert=True)
        return {"ok": True, "profile": await db.social_profiles.find_one({"user_id": user["id"]}, {"_id": 0, "phone_hash": 0})}

    @router.get("/mentions/search")
    async def mention_search(q: str = Query("", max_length=40), user: dict = Depends(get_current_user)):
        needle = q.strip().lstrip("@")
        if len(needle) < 1:
            return {"items": []}
        rx = {"$regex": re.escape(needle), "$options": "i"}
        profs = await db.social_profiles.find({"$or": [{"handle": rx}, {"display_name": rx}]}, {"_id": 0, "user_id": 1, "handle": 1}).limit(12).to_list(12)
        ids = [p["user_id"] for p in profs]
        if len(ids) < 8:
            extra = await db.users.find({"full_name": rx, "id": {"$nin": ids}}, {"_id": 0, "id": 1}).limit(8 - len(ids)).to_list(8)
            ids += [u["id"] for u in extra]
        users = await public_users(db, ids)
        handles = {p["user_id"]: p.get("handle") for p in profs}
        return {"items": [{**users[i], "handle": handles.get(i) or users[i].get("handle")} for i in ids if i in users and i != user["id"]]}

    # ── creator dashboard ──
    @router.get("/creator/dashboard")
    async def creator_dashboard(days: int = Query(30, ge=7, le=90), user: dict = Depends(get_current_user)):
        since = now() - timedelta(days=days)
        posts = await db.social_posts.find({"author_id": user["id"], "status": {"$ne": "removed"}}, {"_id": 0}).sort("created_at", -1).to_list(500)
        ids = [p["id"] for p in posts]
        followers = await db.social_follows.count_documents({"target_type": "user", "target_id": user["id"]})
        new_followers = await db.social_follows.count_documents({"target_type": "user", "target_id": user["id"], "created_at": {"$gte": since}})
        reach = await db.social_post_views.count_documents({"post_id": {"$in": ids}, "created_at": {"$gte": since}}) if ids else 0
        reactions = sum(_reaction_total(p) for p in posts)
        comments = sum(int(p.get("comment_count", 0)) for p in posts)
        shares = sum(int(p.get("share_count", 0)) + int(p.get("repost_count", 0)) for p in posts)
        saves = sum(int(p.get("save_count", 0)) for p in posts)
        video_views = sum(int(p.get("video_views", 0)) for p in posts)
        enquiries = await db.social_contact_events.count_documents({"to_user_id": user["id"], "created_at": {"$gte": since}})
        offers = await db.marketplace_offers.count_documents({"seller_id": user["id"], "created_at": {"$gte": since.isoformat()}}) if "marketplace_offers" in await db.list_collection_names() else 0
        views_total = sum(int(p.get("view_count", 0)) for p in posts)
        engagement_rate = round(100.0 * (reactions + comments + shares + saves) / views_total, 1) if views_total else 0.0
        # daily series (views) for the sparkline
        series: list[int] = [0] * min(days, 30)
        async for v in db.social_post_views.find({"post_id": {"$in": ids}, "created_at": {"$gte": now() - timedelta(days=len(series))}}, {"_id": 0, "created_at": 1}) if ids else _empty():
            d = (now() - (_aware(v["created_at"]) or now())).days
            if 0 <= d < len(series):
                series[len(series) - 1 - d] += 1
        top = sorted(posts, key=lambda p: (_reaction_total(p) + 2 * int(p.get("comment_count", 0)) + int(p.get("view_count", 0)) / 10.0), reverse=True)[:5]
        ctx = await _ctx(user)
        by_type: dict[str, int] = {}
        for p in posts:
            by_type[post_type_of(p)] = by_type.get(post_type_of(p), 0) + 1
        prof = await db.social_profiles.find_one({"user_id": user["id"]}, {"_id": 0, "handle": 1, "display_name": 1, "bio": 1, "is_business": 1, "business_name": 1, "creator_verified": 1, "creator_category": 1, "website": 1}) or {}
        return {
            "period_days": days, "profile": prof,
            "totals": {"followers": followers, "new_followers": new_followers, "posts": len(posts), "reach": reach, "views": views_total, "reactions": reactions, "comments": comments, "shares": shares, "saves": saves, "video_views": video_views, "enquiries": enquiries, "offers": offers, "engagement_rate": engagement_rate},
            "views_series": series, "by_type": by_type, "top_posts": await _decorate(top, user, ctx),
            "note": "Reach counts unique members who saw each post. Engagement never guarantees sales or earnings.",
        }

    async def _empty():
        if False:
            yield None

    # ── contact / enquiries (viewer-initiated, same channels as before) ──
    @router.post("/posts/{post_id}/contact")
    async def contact(post_id: str, data: ContactIn, user: dict = Depends(get_current_user)):
        p = await _get_post(post_id, user)
        ensure(p["author_id"] != user["id"], 400, "This is your own post")
        ensure(p["author_id"] not in await blocked_ids_for(db, user["id"]), 403, "You can't contact this member")
        enabled = {"chat": bool(p.get("contact_chat", True)), "whatsapp": bool(p.get("contact_whatsapp")), "phone": bool(p.get("contact_phone"))}
        ensure(enabled.get(data.channel, False), 403, "The poster hasn't enabled that contact option")
        await db.social_contact_events.insert_one({"id": new_id(), "post_id": post_id, "from_user_id": user["id"], "to_user_id": p["author_id"], "channel": data.channel, "created_at": now()})
        if data.channel == "chat":
            from chat import _bump_conversation, _notify as chat_notify

            conv = await db.conversations.find_one({"kind": "social", "social_post_id": post_id, "participant_ids": {"$all": [user["id"], p["author_id"]], "$size": 2}}, {"_id": 0})
            n = now()
            if not conv:
                conv = {"id": str(uuid.uuid4()), "kind": "social", "property_id": None, "listing_id": p.get("market_item_id"), "item_id": p.get("market_item_id"), "social_post_id": post_id, "participant_ids": sorted([user["id"], p["author_id"]]), "created_by": user["id"], "last_message_preview": None, "last_message_at": None, "created_at": n, "updated_at": n}
                await db.conversations.insert_one(dict(conv))
            text = (data.message or "").strip()
            if text:
                msg = {"id": str(uuid.uuid4()), "conversation_id": conv["id"], "sender_id": user["id"], "sender_name": user.get("full_name") or "A neighbour", "text": text, "kind": "text", "attachments": [], "client_msg_id": None, "status": "sent", "created_at": n}
                await db.chat_messages.insert_one(msg)
                await _bump_conversation(db, conv["id"], text, n)
                await chat_notify(db, p["author_id"], conv["id"], msg["sender_name"], text, None, None)
            return {"channel": "chat", "conversation_id": conv["id"]}
        author = await db.users.find_one({"id": p["author_id"]}, {"_id": 0, "phone": 1, "full_name": 1})
        number = (author or {}).get("phone")
        ensure(bool(number), 409, "The poster hasn't added a phone number yet")
        digits = re.sub(r"[^\d]", "", number)
        text = f"Hi {((author or {}).get('full_name') or 'there').split(' ')[0]}, I saw your post “{p.get('title') or (p.get('body') or '')[:40]}” on AMASS."
        return {"channel": data.channel, "number": number, "url": f"https://wa.me/{digits}?text={text}" if data.channel == "whatsapp" else f"tel:{number}"}

    # ── hide / mute / report / preferences ──
    @router.post("/posts/{post_id}/hide")
    async def hide(post_id: str, user: dict = Depends(get_current_user)):
        await db.social_post_hidden.update_one({"user_id": user["id"], "post_id": post_id}, {"$set": {"user_id": user["id"], "post_id": post_id, "created_at": now()}}, upsert=True)
        p = await db.social_posts.find_one({"id": post_id}, {"_id": 0, "category": 1, "type": 1, "service": 1, "kind": 1})
        if p:
            await _bump_interest(user["id"], p, -2.0)
        return {"ok": True}

    @router.post("/posts/{post_id}/report")
    async def report(post_id: str, data: ReportIn, user: dict = Depends(get_current_user)):
        p = await _get_post(post_id, user)
        ensure(p["author_id"] != user["id"], 400, "You can't report your own post")
        if await db.social_post_reports.find_one({"post_id": post_id, "reporter_id": user["id"], "status": "open"}):
            return {"ok": True, "duplicate": True}
        await db.social_post_reports.insert_one({"id": new_id(), "target_type": "post", "post_id": post_id, "post_title": p.get("title") or (p.get("body") or "")[:60], "author_id": p["author_id"], "reporter_id": user["id"], "reason": data.reason, "details": (data.details or "").strip() or None, "status": "open", "created_at": now()})
        await db.social_post_hidden.update_one({"user_id": user["id"], "post_id": post_id}, {"$set": {"user_id": user["id"], "post_id": post_id, "created_at": now()}}, upsert=True)
        # 3+ independent reports → auto-hide pending review (never let one person silence a post)
        n = await db.social_post_reports.count_documents({"post_id": post_id, "status": "open"})
        if n >= 3 and p.get("status") in LIVE:
            await db.social_posts.update_one({"id": post_id}, {"$set": {"status": "hidden_review", "moderation.status": "flagged", "moderation.summary": f"Hidden after {n} member reports", "moderation.labels": ["reports"], "updated_at": now()}})
            await market_sync(db, {**p, "status": "hidden_review"}, {"id": p["author_id"], "full_name": p.get("author_name")})
        return {"ok": True}

    @router.get("/prefs")
    async def prefs(user: dict = Depends(get_current_user)):
        prof = await db.social_profiles.find_one({"user_id": user["id"]}, {"_id": 0, "feed_prefs": 1, "interests": 1}) or {}
        fp = prof.get("feed_prefs") or {}
        muted = await public_users(db, list(await muted_ids_for(db, user["id"])))
        hidden_n = await db.social_post_hidden.count_documents({"user_id": user["id"]})
        learned = sorted(((k, v) for k, v in (prof.get("interests") or {}).items() if v > 0), key=lambda kv: -kv[1])[:8]
        return {"interests": fp.get("interests") or [], "show_sponsored": fp.get("show_sponsored", True), "autoplay_videos": fp.get("autoplay_videos", True), "default_filter": fp.get("default_filter") or "all", "learned_interests": [{"key": k, "label": CATEGORY_LABEL.get(k, TYPE_LABEL.get(k, k.title())), "score": round(v, 1)} for k, v in learned], "muted": list(muted.values()), "hidden_count": hidden_n, "categories": CATEGORIES, "filters": FILTERS}

    @router.put("/prefs")
    async def set_prefs(data: PrefsIn, user: dict = Depends(get_current_user)):
        ch = {f"feed_prefs.{k}": v for k, v in data.model_dump(exclude_unset=True).items() if v is not None}
        if "feed_prefs.default_filter" in ch:
            ensure(ch["feed_prefs.default_filter"] in FILTER_KEYS, 422, "Unknown filter")
        if "feed_prefs.interests" in ch:
            ch["feed_prefs.interests"] = [k for k in ch["feed_prefs.interests"] if k in CATEGORY_LABEL or k in TYPE_LABEL][:20]
        if ch:
            await db.social_profiles.update_one({"user_id": user["id"]}, {"$set": ch, "$setOnInsert": {"user_id": user["id"], "created_at": now()}}, upsert=True)
        return await prefs(user)

    @router.delete("/prefs/hidden")
    async def clear_hidden(user: dict = Depends(get_current_user)):
        r = await db.social_post_hidden.delete_many({"user_id": user["id"]})
        return {"ok": True, "cleared": r.deleted_count}

    @router.post("/prefs/reset-interests")
    async def reset_interests(user: dict = Depends(get_current_user)):
        await db.social_profiles.update_one({"user_id": user["id"]}, {"$unset": {"interests": ""}})
        return {"ok": True}

    # ── appeals (author side) ──
    @router.post("/posts/{post_id}/appeal", status_code=201)
    async def appeal(post_id: str, data: CommentIn, user: dict = Depends(get_current_user)):
        p = await db.social_posts.find_one({"id": post_id, "author_id": user["id"]}, {"_id": 0})
        ensure(p is not None, 404, "Post not found")
        ensure((p.get("moderation") or {}).get("status") in ("flagged", "removed") or p.get("status") in ("hidden_review", "removed"), 409, "This post isn't under a moderation action")
        ensure(await db.social_appeals.find_one({"post_id": post_id, "status": "open"}) is None, 409, "An appeal is already open")
        ensure(await db.social_appeals.count_documents({"post_id": post_id}) < 2, 409, "This post has already been appealed twice — the decision is final")
        doc = {"id": new_id(), "post_id": post_id, "user_id": user["id"], "message": data.body.strip(), "status": "open", "created_at": now()}
        await db.social_appeals.insert_one(dict(doc))
        await db.social_posts.update_one({"id": post_id}, {"$set": {"moderation.status": "appealed", "moderation.appeal_id": doc["id"]}})
        return {"ok": True, "appeal": {**doc, "created_at": _iso(doc["created_at"])}}

    # ── taggable things ──
    @router.get("/tag/properties")
    async def tag_properties(q: str = "", user: dict = Depends(get_current_user)):
        query: dict[str, Any] = {"status": {"$nin": ["archived", "draft"]}}
        if q.strip():
            rx = {"$regex": re.escape(q.strip()), "$options": "i"}
            query["$or"] = [{"title": rx}, {"city": rx}, {"location": rx}]
        mine = await db.properties.find({**query, "agent_id": user["id"]}, {"_id": 0, "id": 1, "title": 1, "price": 1, "listing_type": 1, "city": 1, "images": 1}).sort("created_at", -1).limit(10).to_list(10)
        others = await db.properties.find({**query, "agent_id": {"$ne": user["id"]}}, {"_id": 0, "id": 1, "title": 1, "price": 1, "listing_type": 1, "city": 1, "images": 1}).sort("views_count", -1).limit(10).to_list(10)
        return {"items": [{"id": d["id"], "title": d.get("title"), "price": d.get("price"), "listing_type": d.get("listing_type"), "city": d.get("city"), "image": (d.get("images") or [None])[0], "mine": d in mine} for d in mine + others]}

    @router.get("/tag/products")
    async def tag_products(q: str = "", user: dict = Depends(get_current_user)):
        query: dict[str, Any] = {"published": True}
        if q.strip():
            rx = {"$regex": re.escape(q.strip()), "$options": "i"}
            query["$or"] = [{"name": rx}, {"brand": rx}, {"retailer_name": rx}]
        docs = await db.shop_products.find(query, {"_id": 0, "id": 1, "name": 1, "price": 1, "images": 1, "retailer_name": 1, "retailer_id": 1}).sort("popularity_score", -1).limit(12).to_list(12)
        return {"items": [{"id": d["id"], "name": d["name"], "price": d.get("price"), "image": (d.get("images") or [None])[0], "brand": d.get("retailer_name"), "brand_id": d.get("retailer_id")} for d in docs]}

    return router


async def ensure_feed_indexes(db) -> None:
    await db.social_posts.create_index([("type", 1), ("status", 1), ("created_at", -1)])
    await db.social_posts.create_index([("moderation.status", 1), ("created_at", -1)])
    await db.social_posts.create_index("hashtags")
    await db.social_posts.create_index("repost_of", sparse=True)
    await db.social_post_reactions.create_index([("post_id", 1), ("user_id", 1)], unique=True)
    await db.social_post_comments.create_index([("parent_id", 1), ("created_at", 1)], sparse=True)
    await db.social_comment_likes.create_index([("comment_id", 1), ("user_id", 1)], unique=True)
    await db.social_follows.create_index([("follower_id", 1), ("target_type", 1), ("target_id", 1)], unique=True)
    await db.social_follows.create_index([("target_type", 1), ("target_id", 1)])
    await db.social_saves.create_index([("user_id", 1), ("post_id", 1)], unique=True)
    await db.social_stories.create_index([("expires_at", 1), ("status", 1)])
    await db.social_stories.create_index([("author_id", 1), ("created_at", -1)])
    await db.social_story_views.create_index([("story_id", 1), ("user_id", 1)], unique=True)
    await db.social_post_views.create_index([("post_id", 1), ("user_id", 1)], unique=True)
    await db.social_post_views.create_index("created_at")
    await db.social_shares.create_index([("post_id", 1), ("created_at", -1)])
    await db.social_appeals.create_index([("status", 1), ("created_at", -1)])
    await db.social_profiles.create_index("handle_lc", sparse=True)
    await db.feed_settings.create_index("key", unique=True)
    await db.feed_audit_log.create_index([("created_at", -1)])
