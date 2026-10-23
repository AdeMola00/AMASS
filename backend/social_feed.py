"""Social feed — the Social tab (replaces Discover).

A neighbourhood-first space where people share items they are decluttering (giving away for
free or selling) and connect with nearby neighbours. Nextdoor-style interactions, AMASS rules:

  • Nearby = the viewer's approved estates (Neighbours tab) → their areas → their city.
    A post carries a `visibility` chosen by the poster: estate | area | city. Viewers only see
    the location LABEL (estate name / area / city) — never an address or coordinates.
  • Contact is always user-initiated: a viewer taps Message / WhatsApp / Call on a post whose
    author enabled that channel. Nothing is sent on the author's behalf, no invitations.
  • Phone numbers are never embedded in feed/detail payloads — only on the explicit
    /contact call, and only for channels the author turned on.
  • Photos are uploaded to object storage under a PUBLIC prefix (`amass/public/…`) and served by
    /api/public-files so every signed-in neighbour can see them without per-request auth headers.
  • Optional cross-listing: a "for sale" post can also be mirrored into the Declutter market
    (`marketplace` collection); status changes (sold / paused / removed) follow the post.

Collections: social_posts · social_post_likes · social_post_comments · social_post_hidden ·
social_post_reports · social_contact_events. Routes: /api/social/posts/* and /api/social/feed.
"""
from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field

from social_common import award, blocked_ids_for, ensure, muted_ids_for, new_id, notify, now, public_users

# ─── Catalogue ────────────────────────────────────────────────────────────────
CATEGORIES = [
    {"key": "furniture", "label": "Furniture", "icon": "bed", "color": "#F59E0B"},
    {"key": "electronics", "label": "Electronics", "icon": "tv", "color": "#3B82F6"},
    {"key": "appliances", "label": "Appliances", "icon": "snow", "color": "#10B981"},
    {"key": "kitchen", "label": "Kitchen", "icon": "restaurant", "color": "#EF4444"},
    {"key": "kids", "label": "Kids & baby", "icon": "happy", "color": "#EC4899"},
    {"key": "clothing", "label": "Clothing", "icon": "shirt", "color": "#8B5CF6"},
    {"key": "books", "label": "Books & media", "icon": "book", "color": "#0EA5E9"},
    {"key": "garden", "label": "Garden & outdoor", "icon": "leaf", "color": "#22C55E"},
    {"key": "decor", "label": "Décor", "icon": "color-palette", "color": "#F97316"},
    {"key": "other", "label": "Other", "icon": "cube", "color": "#6B7280"},
]
CATEGORY_LABEL = {c["key"]: c["label"] for c in CATEGORIES}
CONDITIONS = [
    {"key": "new", "label": "Brand new"},
    {"key": "like_new", "label": "Like new"},
    {"key": "good", "label": "Good"},
    {"key": "fair", "label": "Fair"},
    {"key": "spares", "label": "For parts"},
]
CONDITION_LABEL = {c["key"]: c["label"] for c in CONDITIONS}
# Social category → Declutter market (category, subcategory) when cross-listing.
MARKET_CATEGORY = {
    "furniture": ("furniture", "Living room"), "electronics": ("electronics", "Other"), "appliances": ("appliances", "Kitchen appliances"),
    "kitchen": ("appliances", "Kitchen appliances"), "kids": ("fashion", "Kids"), "clothing": ("fashion", "Other"), "books": ("business", "Other"),
    "garden": ("tools", "Garden"), "decor": ("furniture", "Décor"), "other": ("business", "Other"),
}
REPORT_REASONS = ("scam", "prohibited", "spam", "offensive", "wrong_info", "other")
FEED_STATUSES = ["active", "reserved"]
QUICK_MESSAGES = ["Is this still available?", "I'd love to take this — when can I pick it up?", "Could you share a few more details?"]


# ─── Models ───────────────────────────────────────────────────────────────────
class PostIn(BaseModel):
    title: str = Field(..., min_length=3, max_length=80)
    body: str = Field("", max_length=1000)
    kind: Literal["give", "sell"] = "give"
    price: Optional[int] = Field(None, ge=0, le=500_000_000)
    negotiable: bool = True
    category: str = "other"
    condition: str = "good"
    photos: List[str] = Field(default_factory=list, max_length=6)
    visibility: Literal["estate", "area", "city"] = "area"
    estate_id: Optional[str] = None
    pickup_note: Optional[str] = Field(None, max_length=120)
    contact_chat: bool = True
    contact_whatsapp: bool = False
    contact_phone: bool = False
    cross_list_market: bool = False


class PostPatch(BaseModel):
    title: Optional[str] = Field(None, min_length=3, max_length=80)
    body: Optional[str] = Field(None, max_length=1000)
    kind: Optional[Literal["give", "sell"]] = None
    price: Optional[int] = Field(None, ge=0, le=500_000_000)
    negotiable: Optional[bool] = None
    category: Optional[str] = None
    condition: Optional[str] = None
    photos: Optional[List[str]] = Field(None, max_length=6)
    visibility: Optional[Literal["estate", "area", "city"]] = None
    pickup_note: Optional[str] = Field(None, max_length=120)
    contact_chat: Optional[bool] = None
    contact_whatsapp: Optional[bool] = None
    contact_phone: Optional[bool] = None
    cross_list_market: Optional[bool] = None
    status: Optional[Literal["active", "reserved", "gone", "paused"]] = None


class CommentIn(BaseModel):
    body: str = Field(..., min_length=1, max_length=500)


class ContactIn(BaseModel):
    channel: Literal["chat", "whatsapp", "phone"]
    message: Optional[str] = Field(None, max_length=500)


class ReportIn(BaseModel):
    reason: Literal["scam", "prohibited", "spam", "offensive", "wrong_info", "other"]
    details: Optional[str] = Field(None, max_length=600)


class ResolveIn(BaseModel):
    action: Literal["dismiss", "remove_post"]
    note: Optional[str] = Field(None, max_length=400)


class UploadIn(BaseModel):
    data_url: str


def _iso(d) -> Optional[str]:
    if isinstance(d, datetime):
        return d.isoformat()
    return d


def _location_label(p: dict) -> str:
    if p.get("visibility") == "estate" and p.get("estate_name"):
        return p["estate_name"]
    if p.get("visibility") == "area" and p.get("area"):
        return p["area"]
    return p.get("city") or p.get("area") or "Nearby"


def _public_url(path: str) -> str:
    return f"/api/public-files/{path}"


def register_social_feed_routes(db, get_current_user, require_admin):
    router = APIRouter(prefix="/api/social", tags=["social-feed"])
    files = APIRouter(tags=["social-feed"])

    # ─── Viewer context: estates → areas → city ───
    async def _ctx(user: dict) -> dict:
        mems = await db.estate_members.find({"user_id": user["id"], "status": "approved"}, {"_id": 0, "estate_id": 1}).to_list(20)
        ests = []
        if mems:
            ests = await db.estates.find({"id": {"$in": [m["estate_id"] for m in mems]}, "status": {"$ne": "rejected"}}, {"_id": 0, "id": 1, "name": 1, "area": 1, "city": 1}).to_list(20)
        city = user.get("city") or (ests[0]["city"] if ests else None) or "Lagos"
        areas = sorted({e["area"] for e in ests if e.get("area")})
        return {"estates": ests, "estate_ids": [e["id"] for e in ests], "areas": areas, "city": city}

    def _visible_filter(ctx: dict, user_id: str) -> dict:
        ors = [{"visibility": "city", "city": ctx["city"]}, {"author_id": user_id}]
        if ctx["areas"]:
            ors.append({"visibility": "area", "area": {"$in": ctx["areas"]}})
            ors.append({"visibility": "city", "area": {"$in": ctx["areas"]}})
        if ctx["estate_ids"]:
            ors.append({"estate_id": {"$in": ctx["estate_ids"]}})
        return {"$or": ors}

    async def _liked_ids(user_id: str, post_ids: list[str]) -> set[str]:
        if not post_ids:
            return set()
        rows = await db.social_post_likes.find({"user_id": user_id, "post_id": {"$in": post_ids}}, {"_id": 0, "post_id": 1}).to_list(len(post_ids))
        return {r["post_id"] for r in rows}

    async def _outs(posts: list[dict], user: dict, ctx: Optional[dict] = None) -> list[dict]:
        ids = [p["id"] for p in posts]
        liked = await _liked_ids(user["id"], ids)
        authors = await public_users(db, [p["author_id"] for p in posts])
        ctx = ctx or await _ctx(user)
        return [_out(p, user["id"], liked, authors, ctx) for p in posts]

    def _out(p: dict, viewer_id: str, liked: set[str], authors: dict, ctx: dict) -> dict:
        a = authors.get(p["author_id"]) or {"id": p["author_id"], "full_name": p.get("author_name") or "A neighbour", "avatar_url": p.get("author_avatar")}
        return {
            "id": p["id"], "title": p["title"], "body": p.get("body") or "", "kind": p["kind"], "price": p.get("price"), "negotiable": bool(p.get("negotiable", True)),
            "category": p.get("category", "other"), "category_label": CATEGORY_LABEL.get(p.get("category", "other"), "Other"),
            "condition": p.get("condition", "good"), "condition_label": CONDITION_LABEL.get(p.get("condition", "good"), "Good"),
            "photos": p.get("photos") or [], "cover": (p.get("photos") or [None])[0],
            "visibility": p.get("visibility", "area"), "location_label": _location_label(p), "estate_id": p.get("estate_id"), "estate_name": p.get("estate_name"), "area": p.get("area"), "city": p.get("city"),
            "pickup_note": p.get("pickup_note"),
            "contact": {"chat": bool(p.get("contact_chat", True)), "whatsapp": bool(p.get("contact_whatsapp")), "phone": bool(p.get("contact_phone"))},
            "status": p.get("status", "active"), "like_count": int(p.get("like_count", 0)), "comment_count": int(p.get("comment_count", 0)), "view_count": int(p.get("view_count", 0)),
            "created_at": _iso(p.get("created_at")), "updated_at": _iso(p.get("updated_at")), "edited": bool(p.get("edited")),
            "author": {**a, "same_estate": bool(p.get("estate_id") and p.get("estate_id") in ctx["estate_ids"])},
            "liked": p["id"] in liked, "is_mine": p["author_id"] == viewer_id, "market_item_id": p.get("market_item_id"),
        }

    async def _get_post(post_id: str, allow_removed: bool = False) -> dict:
        p = await db.social_posts.find_one({"id": post_id}, {"_id": 0})
        ensure(p is not None and (allow_removed or p.get("status") != "removed"), 404, "This post is no longer available")
        return p

    async def _resolve_estate(user: dict, ctx: dict, estate_id: Optional[str], visibility: str) -> Optional[dict]:
        est = None
        if estate_id:
            est = next((e for e in ctx["estates"] if e["id"] == estate_id), None)
            ensure(est is not None, 403, "Join that estate in Neighbours before posting to it")
        elif ctx["estates"]:
            est = ctx["estates"][0]
        if visibility == "estate":
            ensure(est is not None, 422, "Join your estate in Neighbours to share with your estate only")
        return est

    async def _sync_market(post: dict, user: dict) -> Optional[str]:
        """Mirror a for-sale post into the Declutter market (or update the mirror). Returns market item id."""
        mid = post.get("market_item_id")
        want = bool(post.get("cross_list_market")) and post.get("kind") == "sell" and (post.get("price") or 0) > 0
        status_map = {"active": "active", "reserved": "active", "paused": "paused", "gone": "sold", "removed": "removed"}
        if mid:
            if not want:
                await db.marketplace.update_one({"id": mid}, {"$set": {"status": "removed", "updated_at": now().isoformat()}})
                return None
            await db.marketplace.update_one({"id": mid}, {"$set": {
                "name": post["title"], "description": post.get("body") or post["title"], "price": post["price"], "negotiable": bool(post.get("negotiable", True)),
                "image": (post.get("photos") or [None])[0], "images": post.get("photos") or [], "status": status_map.get(post.get("status", "active"), "active"), "updated_at": now().isoformat(),
            }})
            return mid
        if not want:
            return None
        cat, sub = MARKET_CATEGORY.get(post.get("category", "other"), ("business", "Other"))
        n = now()
        item = {
            "id": str(uuid.uuid4()), "name": post["title"], "description": post.get("body") or post["title"], "price": post["price"], "currency": "NGN",
            "category": cat, "subcategory": sub, "condition": {"new": "new", "like_new": "like_new", "good": "used", "fair": "used", "spares": "for_parts"}.get(post.get("condition", "good"), "used"),
            "brand": None, "image": (post.get("photos") or [None])[0], "images": post.get("photos") or [], "city": post.get("city"), "location": _location_label(post),
            "latitude": None, "longitude": None, "negotiable": bool(post.get("negotiable", True)), "contact_prefs": ["chat"] + (["whatsapp"] if post.get("contact_whatsapp") else []) + (["call"] if post.get("contact_phone") else []),
            "specs": {}, "tags": ["social"], "status": status_map.get(post.get("status", "active"), "active"), "rating": 4.8, "reviews": 0, "verified": False, "delivery": False, "delivery_days": 0,
            "stock": 1, "popular": False, "on_sale": False, "posted_at": n.isoformat(), "views": 0, "saves": 0, "is_boosted": False, "is_featured": False,
            "vendor": user.get("full_name", "Neighbour"), "vendor_id": None, "seller_id": user["id"], "seller_name": user.get("full_name"), "seller_avatar": user.get("avatar_url"),
            "seller_phone": user.get("phone") if post.get("contact_phone") else None, "seller_whatsapp": user.get("phone") if post.get("contact_whatsapp") else None,
            "seller_type": "individual", "seller_verified": bool(user.get("phone_verified") or user.get("verified")), "seller_rating": 4.8, "seller_reviews": 0, "seller_joined_year": n.year,
            "seller_response_time_hours": 2, "seller_response_rate": 100, "seller_bio": user.get("bio"), "source": "social", "social_post_id": post["id"],
        }
        await db.marketplace.insert_one(item)
        return item["id"]

    # ─── Meta (catalogue + my scopes) ───
    @router.get("/posts/meta")
    async def meta(user: dict = Depends(get_current_user)):
        ctx = await _ctx(user)
        mine_active = await db.social_posts.count_documents({"author_id": user["id"], "status": {"$in": ["active", "reserved"]}})
        return {
            "categories": CATEGORIES, "conditions": CONDITIONS, "quick_messages": QUICK_MESSAGES,
            "scopes": {"estates": ctx["estates"], "areas": ctx["areas"], "city": ctx["city"]},
            "defaults": {"visibility": "estate" if ctx["estates"] else ("area" if ctx["areas"] else "city"), "estate_id": ctx["estate_ids"][0] if ctx["estate_ids"] else None, "has_phone": bool(user.get("phone"))},
            "counts": {"mine_active": mine_active},
        }

    # ─── Feed ───
    @router.get("/feed")
    async def feed(
        scope: Literal["estate", "area", "city"] = "city",
        kind: Optional[Literal["give", "sell"]] = None,
        category: Optional[str] = None,
        q: Optional[str] = None,
        cursor: Optional[str] = None,
        limit: int = Query(20, ge=1, le=50),
        user: dict = Depends(get_current_user),
    ):
        ctx = await _ctx(user)
        query: dict = {"status": {"$in": FEED_STATUSES}}
        ands = [_visible_filter(ctx, user["id"])]
        if scope == "estate":
            ands.append({"estate_id": {"$in": ctx["estate_ids"]}} if ctx["estate_ids"] else {"id": "__none__"})
        elif scope == "area":
            if ctx["areas"] or ctx["estate_ids"]:
                sub = []
                if ctx["areas"]:
                    sub.append({"area": {"$in": ctx["areas"]}})
                if ctx["estate_ids"]:
                    sub.append({"estate_id": {"$in": ctx["estate_ids"]}})
                ands.append({"$or": sub})
            else:
                ands.append({"city": ctx["city"]})
        if kind:
            query["kind"] = kind
        if category and category != "all":
            query["category"] = category
        if q and q.strip():
            rx = {"$regex": re.escape(q.strip()), "$options": "i"}
            ands.append({"$or": [{"title": rx}, {"body": rx}, {"category": rx}]})
        hidden = [h["post_id"] for h in await db.social_post_hidden.find({"user_id": user["id"]}, {"_id": 0, "post_id": 1}).to_list(2000)]
        excluded_authors = list(await blocked_ids_for(db, user["id"]) | await muted_ids_for(db, user["id"]))
        if hidden:
            query["id"] = {"$nin": hidden}
        if excluded_authors:
            query["author_id"] = {"$nin": excluded_authors}
        if cursor:
            try:
                ands.append({"created_at": {"$lt": datetime.fromisoformat(cursor)}})
            except ValueError:
                pass
        query["$and"] = ands
        rows = await db.social_posts.find(query, {"_id": 0}).sort("created_at", -1).limit(limit + 1).to_list(limit + 1)
        more = len(rows) > limit
        rows = rows[:limit]
        items = await _outs(rows, user, ctx)
        next_cursor = _iso(rows[-1]["created_at"]) if more and rows else None
        return {
            "items": items, "next_cursor": next_cursor, "scope": scope,
            "scopes": {"estates": ctx["estates"], "areas": ctx["areas"], "city": ctx["city"]},
            "scope_label": (ctx["estates"][0]["name"] if scope == "estate" and ctx["estates"] else (", ".join(ctx["areas"][:1]) if scope == "area" and ctx["areas"] else ctx["city"])),
        }

    # ─── My posts ───
    @router.get("/posts/mine")
    async def mine(user: dict = Depends(get_current_user)):
        rows = await db.social_posts.find({"author_id": user["id"], "status": {"$ne": "removed"}}, {"_id": 0}).sort("updated_at", -1).to_list(200)
        items = await _outs(rows, user)
        counts: dict[str, int] = {}
        for r in rows:
            counts[r.get("status", "active")] = counts.get(r.get("status", "active"), 0) + 1
        return {"items": items, "counts": counts}

    # ─── Create ───
    @router.post("/posts")
    async def create_post(data: PostIn, user: dict = Depends(get_current_user)):
        ctx = await _ctx(user)
        ensure(data.category in CATEGORY_LABEL, 422, "Pick a category")
        ensure(data.condition in CONDITION_LABEL, 422, "Pick a condition")
        if data.kind == "sell":
            ensure((data.price or 0) > 0, 422, "Add a price, or mark the item as free")
        est = await _resolve_estate(user, ctx, data.estate_id, data.visibility)
        if data.contact_whatsapp or data.contact_phone:
            ensure(bool(user.get("phone")), 422, "Add a phone number to your profile to offer WhatsApp or calls")
        n = now()
        post = {
            "id": new_id(), "author_id": user["id"], "author_name": user.get("full_name"), "author_avatar": user.get("avatar_url"),
            "title": data.title.strip(), "body": (data.body or "").strip(), "kind": data.kind, "price": data.price if data.kind == "sell" else None, "negotiable": data.negotiable if data.kind == "sell" else False,
            "category": data.category, "condition": data.condition, "photos": [p for p in data.photos if p][:6],
            "visibility": data.visibility, "estate_id": est["id"] if est else None, "estate_name": est["name"] if est else None,
            "area": (est.get("area") if est else None) or (ctx["areas"][0] if ctx["areas"] else None), "city": (est.get("city") if est else None) or ctx["city"],
            "pickup_note": (data.pickup_note or "").strip() or None,
            "contact_chat": data.contact_chat or not (data.contact_whatsapp or data.contact_phone), "contact_whatsapp": data.contact_whatsapp, "contact_phone": data.contact_phone,
            "cross_list_market": data.cross_list_market, "market_item_id": None,
            "status": "active", "like_count": 0, "comment_count": 0, "view_count": 0, "edited": False, "created_at": n, "updated_at": n,
        }
        post["market_item_id"] = await _sync_market(post, user)
        await db.social_posts.insert_one(post)
        post.pop("_id", None)
        await award(db, user["id"], "social_post", 3, {"post_id": post["id"]})
        return {"ok": True, "post": (await _outs([post], user, ctx))[0]}

    # ─── Detail ───
    @router.get("/posts/{post_id}")
    async def detail(post_id: str, user: dict = Depends(get_current_user)):
        p = await _get_post(post_id)
        ctx = await _ctx(user)
        if p["author_id"] != user["id"]:
            await db.social_posts.update_one({"id": post_id}, {"$inc": {"view_count": 1}})
        out = (await _outs([p], user, ctx))[0]
        comments = await db.social_post_comments.find({"post_id": post_id, "status": "active"}, {"_id": 0}).sort("created_at", 1).to_list(100)
        cauthors = await public_users(db, [c["author_id"] for c in comments])
        out["comments"] = [{"id": c["id"], "body": c["body"], "created_at": _iso(c["created_at"]), "author": cauthors.get(c["author_id"]), "is_mine": c["author_id"] == user["id"], "is_poster": c["author_id"] == p["author_id"]} for c in comments]
        posts_count = await db.social_posts.count_documents({"author_id": p["author_id"], "status": {"$in": ["active", "reserved", "gone"]}})
        given = await db.social_posts.count_documents({"author_id": p["author_id"], "status": "gone"})
        out["author_stats"] = {"posts": posts_count, "given": given}
        out["can_contact"] = p["author_id"] != user["id"] and p.get("status") in FEED_STATUSES and (p["author_id"] not in await blocked_ids_for(db, user["id"]))
        out["quick_messages"] = QUICK_MESSAGES
        similar = await db.social_posts.find({"id": {"$ne": post_id}, "status": {"$in": FEED_STATUSES}, "category": p.get("category"), **_visible_filter(ctx, user["id"])}, {"_id": 0}).sort("created_at", -1).limit(6).to_list(6)
        out["similar"] = await _outs(similar, user, ctx)
        return out

    # ─── Edit / status ───
    @router.patch("/posts/{post_id}")
    async def edit_post(post_id: str, data: PostPatch, user: dict = Depends(get_current_user)):
        p = await _get_post(post_id)
        ensure(p["author_id"] == user["id"] or bool(user.get("is_admin")), 403, "Only the poster can edit this")
        changes = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None}
        ctx = await _ctx(user)
        if "category" in changes:
            ensure(changes["category"] in CATEGORY_LABEL, 422, "Pick a category")
        if "condition" in changes:
            ensure(changes["condition"] in CONDITION_LABEL, 422, "Pick a condition")
        kind = changes.get("kind", p["kind"])
        if kind == "sell":
            ensure((changes.get("price", p.get("price")) or 0) > 0, 422, "Add a price, or mark the item as free")
        else:
            changes["price"] = None
            changes["negotiable"] = False
        if "visibility" in changes and changes["visibility"] == "estate" and not p.get("estate_id"):
            est = await _resolve_estate(user, ctx, None, "estate")
            changes["estate_id"], changes["estate_name"] = est["id"], est["name"]
        if (changes.get("contact_whatsapp") or changes.get("contact_phone")):
            ensure(bool(user.get("phone")), 422, "Add a phone number to your profile to offer WhatsApp or calls")
        for k in ("title", "body", "pickup_note"):
            if k in changes and isinstance(changes[k], str):
                changes[k] = changes[k].strip() or (None if k == "pickup_note" else changes[k])
        if "photos" in changes:
            changes["photos"] = [x for x in changes["photos"] if x][:6]
        content_keys = {"title", "body", "kind", "price", "category", "condition", "photos", "pickup_note"}
        if content_keys & set(changes):
            changes["edited"] = True
        changes["updated_at"] = now()
        merged = {**p, **changes}
        merged["market_item_id"] = await _sync_market(merged, user)
        changes["market_item_id"] = merged["market_item_id"]
        await db.social_posts.update_one({"id": post_id}, {"$set": changes})
        return {"ok": True, "post": (await _outs([merged], user, ctx))[0]}

    @router.delete("/posts/{post_id}")
    async def delete_post(post_id: str, user: dict = Depends(get_current_user)):
        p = await _get_post(post_id)
        ensure(p["author_id"] == user["id"] or bool(user.get("is_admin")), 403, "Only the poster can delete this")
        await db.social_posts.update_one({"id": post_id}, {"$set": {"status": "removed", "updated_at": now()}})
        if p.get("market_item_id"):
            await db.marketplace.update_one({"id": p["market_item_id"]}, {"$set": {"status": "removed"}})
        return {"ok": True}

    # ─── Like ───
    @router.post("/posts/{post_id}/like")
    async def toggle_like(post_id: str, user: dict = Depends(get_current_user)):
        p = await _get_post(post_id)
        key = {"post_id": post_id, "user_id": user["id"]}
        if await db.social_post_likes.find_one(key):
            await db.social_post_likes.delete_one(key)
            await db.social_posts.update_one({"id": post_id, "like_count": {"$gt": 0}}, {"$inc": {"like_count": -1}})
            liked = False
        else:
            await db.social_post_likes.insert_one({**key, "created_at": now()})
            await db.social_posts.update_one({"id": post_id}, {"$inc": {"like_count": 1}})
            liked = True
            if p["author_id"] != user["id"]:
                from notification_center import emit
                await emit(db, p["author_id"], "SOCIAL_POST_LIKE", f"{user.get('full_name', 'A neighbour')} liked your post", p["title"], {"post_id": post_id}, dedupe_key=f"social_like:{post_id}:{user['id']}", action_url=f"/social/post/{post_id}")
        fresh = await db.social_posts.find_one({"id": post_id}, {"_id": 0, "like_count": 1})
        return {"liked": liked, "like_count": int((fresh or {}).get("like_count", 0))}

    # ─── Comments ───
    @router.get("/posts/{post_id}/comments")
    async def list_comments(post_id: str, user: dict = Depends(get_current_user)):
        p = await _get_post(post_id)
        comments = await db.social_post_comments.find({"post_id": post_id, "status": "active"}, {"_id": 0}).sort("created_at", 1).to_list(200)
        authors = await public_users(db, [c["author_id"] for c in comments])
        return {"items": [{"id": c["id"], "body": c["body"], "created_at": _iso(c["created_at"]), "author": authors.get(c["author_id"]), "is_mine": c["author_id"] == user["id"], "is_poster": c["author_id"] == p["author_id"]} for c in comments]}

    @router.post("/posts/{post_id}/comments")
    async def add_comment(post_id: str, data: CommentIn, user: dict = Depends(get_current_user)):
        p = await _get_post(post_id)
        ensure(p["author_id"] not in await blocked_ids_for(db, user["id"]), 403, "You can't reply to this neighbour")
        c = {"id": new_id(), "post_id": post_id, "author_id": user["id"], "body": data.body.strip(), "status": "active", "created_at": now()}
        await db.social_post_comments.insert_one(c)
        await db.social_posts.update_one({"id": post_id}, {"$inc": {"comment_count": 1}})
        if p["author_id"] != user["id"]:
            await notify(db, p["author_id"], "SOCIAL_POST_COMMENT", f"{user.get('full_name', 'A neighbour')} replied to your post", f"“{p['title']}”: {c['body'][:90]}", {"post_id": post_id, "comment_id": c["id"]})
        authors = await public_users(db, [user["id"]])
        return {"ok": True, "comment": {"id": c["id"], "body": c["body"], "created_at": _iso(c["created_at"]), "author": authors.get(user["id"]), "is_mine": True, "is_poster": p["author_id"] == user["id"]}}

    @router.delete("/posts/{post_id}/comments/{comment_id}")
    async def delete_comment(post_id: str, comment_id: str, user: dict = Depends(get_current_user)):
        p = await _get_post(post_id)
        c = await db.social_post_comments.find_one({"id": comment_id, "post_id": post_id, "status": "active"}, {"_id": 0})
        ensure(c is not None, 404, "Comment not found")
        ensure(c["author_id"] == user["id"] or p["author_id"] == user["id"] or bool(user.get("is_admin")), 403, "You can't remove this reply")
        await db.social_post_comments.update_one({"id": comment_id}, {"$set": {"status": "removed", "removed_by": user["id"], "updated_at": now()}})
        await db.social_posts.update_one({"id": post_id, "comment_count": {"$gt": 0}}, {"$inc": {"comment_count": -1}})
        return {"ok": True}

    # ─── Contact (always viewer-initiated) ───
    @router.post("/posts/{post_id}/contact")
    async def contact_poster(post_id: str, data: ContactIn, user: dict = Depends(get_current_user)):
        p = await _get_post(post_id)
        ensure(p["author_id"] != user["id"], 400, "This is your own post")
        ensure(p.get("status") in FEED_STATUSES, 409, "This item is no longer available")
        ensure(p["author_id"] not in await blocked_ids_for(db, user["id"]), 403, "You can't contact this neighbour")
        enabled = {"chat": bool(p.get("contact_chat", True)), "whatsapp": bool(p.get("contact_whatsapp")), "phone": bool(p.get("contact_phone"))}
        ensure(enabled.get(data.channel, False), 403, "The poster hasn't enabled that contact option")
        await db.social_contact_events.insert_one({"id": new_id(), "post_id": post_id, "from_user_id": user["id"], "to_user_id": p["author_id"], "channel": data.channel, "created_at": now()})
        if data.channel == "chat":
            from chat import _bump_conversation, _notify as chat_notify
            conv = await db.conversations.find_one({"kind": "social", "social_post_id": post_id, "participant_ids": {"$all": [user["id"], p["author_id"]], "$size": 2}}, {"_id": 0})
            n = now()
            if not conv:
                conv = {
                    "id": str(uuid.uuid4()), "kind": "social", "property_id": None, "listing_id": None, "item_id": None, "social_post_id": post_id,
                    "participant_ids": sorted([user["id"], p["author_id"]]), "created_by": user["id"], "last_message_preview": None, "last_message_at": None, "created_at": n, "updated_at": n,
                }
                await db.conversations.insert_one(conv)
                conv.pop("_id", None)
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
        text = f"Hi {((author or {}).get('full_name') or 'there').split(' ')[0]}, I saw your post “{p['title']}” on AMASS Social."
        url = f"https://wa.me/{digits}?text={text}" if data.channel == "whatsapp" else f"tel:{number}"
        return {"channel": data.channel, "number": number, "url": url}

    # ─── Hide / report ───
    @router.post("/posts/{post_id}/hide")
    async def hide_post(post_id: str, user: dict = Depends(get_current_user)):
        await _get_post(post_id)
        await db.social_post_hidden.update_one({"user_id": user["id"], "post_id": post_id}, {"$set": {"user_id": user["id"], "post_id": post_id, "created_at": now()}}, upsert=True)
        return {"ok": True}

    @router.delete("/posts/{post_id}/hide")
    async def unhide_post(post_id: str, user: dict = Depends(get_current_user)):
        await db.social_post_hidden.delete_one({"user_id": user["id"], "post_id": post_id})
        return {"ok": True}

    @router.post("/posts/{post_id}/report")
    async def report_post(post_id: str, data: ReportIn, user: dict = Depends(get_current_user)):
        p = await _get_post(post_id)
        ensure(p["author_id"] != user["id"], 400, "You can't report your own post")
        if await db.social_post_reports.find_one({"post_id": post_id, "reporter_id": user["id"], "status": "open"}):
            return {"ok": True, "duplicate": True}
        await db.social_post_reports.insert_one({"id": new_id(), "post_id": post_id, "post_title": p["title"], "author_id": p["author_id"], "reporter_id": user["id"], "reason": data.reason, "details": (data.details or "").strip() or None, "status": "open", "created_at": now()})
        await db.social_post_hidden.update_one({"user_id": user["id"], "post_id": post_id}, {"$set": {"user_id": user["id"], "post_id": post_id, "created_at": now()}}, upsert=True)
        return {"ok": True}

    # ─── Photo upload (public prefix so neighbours can view) ───
    @router.post("/posts/uploads")
    async def upload_photo(data: UploadIn, user: dict = Depends(get_current_user)):
        b64 = data.data_url.split(",", 1)[1] if data.data_url.startswith("data:") else data.data_url
        ensure(int(len(b64) * 0.75) <= 6 * 1024 * 1024, 413, "Photo too large (max 6 MB)")
        from object_storage import upload_photo_base64
        path = await upload_photo_base64(user["id"], data.data_url, public=True)
        return {"url": _public_url(path), "path": path}

    @files.get("/api/public-files/{file_path:path}")
    async def public_file(file_path: str):
        """Unauthenticated read for objects under `amass/public/` only (Social post photos)."""
        if not file_path.startswith("amass/public/") or ".." in file_path:
            raise HTTPException(404, "Not found")
        from object_storage import get_object
        try:
            data, ct = await get_object(file_path)
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(404, "File not found")
        return Response(content=data, media_type=ct, headers={"Cache-Control": "public, max-age=86400"})

    # ─── Admin moderation ───
    @router.get("/posts/admin/reports")
    async def admin_reports(status: str = "open", admin: dict = Depends(require_admin)):
        rows = await db.social_post_reports.find({"status": status}, {"_id": 0}).sort("created_at", -1).to_list(200)
        users = await public_users(db, [r["reporter_id"] for r in rows] + [r["author_id"] for r in rows])
        for r in rows:
            r["reporter"], r["author"], r["created_at"] = users.get(r["reporter_id"]), users.get(r["author_id"]), _iso(r["created_at"])
        return {"items": rows}

    @router.post("/posts/admin/reports/{report_id}/resolve")
    async def admin_resolve(report_id: str, data: ResolveIn, admin: dict = Depends(require_admin)):
        r = await db.social_post_reports.find_one({"id": report_id}, {"_id": 0})
        ensure(r is not None, 404, "Report not found")
        if data.action == "remove_post":
            await db.social_posts.update_one({"id": r["post_id"]}, {"$set": {"status": "removed", "removed_reason": r["reason"], "updated_at": now()}})
            await notify(db, r["author_id"], "SOCIAL_POST_REMOVED", "Your Social post was removed", f"“{r.get('post_title', 'Your post')}” was removed after a report ({r['reason']}).", {"post_id": r["post_id"]})
        await db.social_post_reports.update_many({"post_id": r["post_id"], "status": "open"}, {"$set": {"status": "resolved", "action": data.action, "note": data.note, "resolved_by": admin["id"], "resolved_at": now()}})
        return {"ok": True}

    return router, files


async def ensure_social_feed_indexes(db) -> None:
    await db.social_posts.create_index("id", unique=True)
    await db.social_posts.create_index([("status", 1), ("created_at", -1)])
    await db.social_posts.create_index([("author_id", 1), ("updated_at", -1)])
    await db.social_posts.create_index([("estate_id", 1), ("status", 1)])
    await db.social_posts.create_index([("city", 1), ("area", 1), ("visibility", 1)])
    await db.social_post_likes.create_index([("post_id", 1), ("user_id", 1)], unique=True)
    await db.social_post_comments.create_index([("post_id", 1), ("created_at", 1)])
    await db.social_post_hidden.create_index([("user_id", 1), ("post_id", 1)], unique=True)
    await db.social_post_reports.create_index([("status", 1), ("created_at", -1)])
    await db.conversations.create_index([("social_post_id", 1), ("kind", 1)])
