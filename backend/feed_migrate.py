"""One-off, idempotent migration that turns the old Social/Declutter data into Feed data.

  1. Every existing `social_posts` row gets a `type` (give → free, sell → sale) and a `moderation` block.
  2. Old single-emoji likes (`social_post_likes`) become 👍 reactions (`social_post_reactions`).
  3. Every Market › Declutter classified (`marketplace` rows that are not FIXA services) becomes a
     For-sale post by its seller, linked through `market_item_id` so offers / saves / checkout keep working.
  4. Follower/post counters on `social_profiles`, default feed settings.
Runs on boot; keyed on `feed_migrated` flags so it is safe to run every start.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from social_common import new_id, now

logger = logging.getLogger("amass.feed.migrate")
MARKET_TO_SOCIAL_CATEGORY = {
    "furniture": "furniture", "electronics": "electronics", "appliances": "appliances", "phones": "electronics", "fashion": "clothing",
    "tools": "garden", "home": "decor", "business": "other", "vehicles": "other", "motorcycles": "other", "real_estate": "other", "construction": "other",
}
MARKET_CONDITION = {"new": "new", "like_new": "like_new", "used": "good", "for_parts": "spares", "refurbished": "good"}


def _dt(v) -> datetime:
    if isinstance(v, datetime):
        return v if v.tzinfo else v.replace(tzinfo=timezone.utc)
    if isinstance(v, str):
        try:
            d = datetime.fromisoformat(v.replace("Z", "+00:00"))
            return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
        except ValueError:
            pass
    return now()


async def migrate_feed(db) -> dict:
    from feed import REACTION_KEYS, get_settings

    out = {"typed": 0, "reactions": 0, "declutter_posts": 0, "counters": 0}
    await get_settings(db)
    # settings schema v2: one alternating discovery interval instead of separate fixa/brands ones; flag ⇒ hidden (no auto-hide score)
    await db.feed_settings.update_one({"key": "feed", "homes_every": 14}, {"$set": {"homes_every": 20}})
    await db.feed_settings.update_one({"key": "feed"}, {"$unset": {"fixa_every": "", "brands_every": "", "auto_hide_score": ""}})

    # 1. type + moderation on legacy posts
    async for p in db.social_posts.find({"$or": [{"type": {"$exists": False}}, {"moderation": {"$exists": False}}]}, {"_id": 0, "id": 1, "kind": 1, "like_count": 1, "type": 1, "moderation": 1}):
        sets = {}
        if not p.get("type"):
            sets["type"] = "free" if p.get("kind") == "give" else "sale" if p.get("kind") == "sell" else "general"
        if not p.get("moderation"):
            sets["moderation"] = {"status": "clear", "summary": "Pre-dates AI screening"}
        sets.setdefault("reactions", {**{k: 0 for k in REACTION_KEYS}, "like": int(p.get("like_count") or 0)})
        await db.social_posts.update_one({"id": p["id"]}, {"$set": sets})
        out["typed"] += 1

    # 2. likes → reactions
    async for like in db.social_post_likes.find({"migrated": {"$ne": True}}, {"_id": 0}):
        await db.social_post_reactions.update_one({"post_id": like["post_id"], "user_id": like["user_id"]}, {"$setOnInsert": {"post_id": like["post_id"], "user_id": like["user_id"], "emoji": "like", "created_at": like.get("created_at") or now()}}, upsert=True)
        await db.social_post_likes.update_one({"post_id": like["post_id"], "user_id": like["user_id"]}, {"$set": {"migrated": True}})
        out["reactions"] += 1

    # 3. Declutter classifieds → For-sale posts (skip FIXA services and anything already mirrored)
    q = {"category": {"$ne": "services"}, "status": {"$nin": ["removed", "sold"]}, "social_post_id": {"$exists": False}, "feed_migrated": {"$ne": True}}
    async for item in db.marketplace.find(q, {"_id": 0}):
        seller_id = item.get("seller_id") or item.get("vendor_id") or f"market-{item['id']}"
        user = await db.users.find_one({"id": seller_id}, {"_id": 0, "id": 1, "full_name": 1, "avatar_url": 1, "city": 1}) or {}
        created = _dt(item.get("posted_at") or item.get("created_at"))
        price = int(item.get("price") or 0)
        post = {
            "id": new_id(), "author_id": seller_id, "author_name": user.get("full_name") or item.get("seller_name") or item.get("vendor") or "AMASS seller", "author_avatar": user.get("avatar_url") or item.get("seller_avatar"),
            "type": "sale" if price > 0 else "free", "kind": "sell" if price > 0 else "give", "title": (item.get("name") or "Item")[:90], "body": (item.get("description") or "")[:2200],
            "photos": [u for u in ([item.get("image")] + list(item.get("images") or [])) if u][:10], "videos": [],
            "price": price or None, "negotiable": bool(item.get("negotiable", True)), "category": MARKET_TO_SOCIAL_CATEGORY.get(item.get("category") or "", "other"), "condition": MARKET_CONDITION.get(item.get("condition") or "", "good"),
            "delivery": "both" if item.get("delivery") else "pickup", "visibility": "city", "estate_id": None, "estate_name": None, "area": None, "city": item.get("city") or user.get("city") or "Lagos", "location_label": item.get("location"),
            "contact_chat": True, "contact_whatsapp": bool(item.get("seller_whatsapp")), "contact_phone": bool(item.get("seller_phone")),
            "mention_handles": [], "mention_ids": [], "hashtags": [], "tags": {}, "sponsored": bool(item.get("is_featured") or item.get("is_boosted")), "source": "declutter_migration",
            "status": "paused" if item.get("status") == "paused" else "active", "moderation": {"status": "clear", "summary": "Migrated from Market › Declutter"},
            "reactions": {k: 0 for k in REACTION_KEYS}, "like_count": 0, "comment_count": 0, "share_count": 0, "repost_count": 0, "save_count": int(item.get("saves") or 0), "view_count": int(item.get("views") or 0), "video_views": 0,
            "cross_list_market": True, "market_item_id": item["id"], "edited": False, "created_at": created, "updated_at": created,
        }
        await db.social_posts.insert_one(post)
        await db.marketplace.update_one({"id": item["id"]}, {"$set": {"social_post_id": post["id"], "feed_migrated": True, "source": item.get("source") or "declutter"}})
        out["declutter_posts"] += 1

    # 4. counters
    async for row in db.social_posts.aggregate([{"$match": {"status": {"$in": ["active", "reserved", "gone"]}}}, {"$group": {"_id": "$author_id", "n": {"$sum": 1}}}]):
        await db.social_profiles.update_one({"user_id": row["_id"]}, {"$set": {"post_count": int(row["n"])}, "$setOnInsert": {"user_id": row["_id"], "created_at": now()}}, upsert=True)
        out["counters"] += 1
    async for row in db.social_follows.aggregate([{"$match": {"target_type": "user"}}, {"$group": {"_id": "$target_id", "n": {"$sum": 1}}}]):
        await db.social_profiles.update_one({"user_id": row["_id"]}, {"$set": {"follower_count": int(row["n"])}}, upsert=True)
    # handles need a lowercase key for @mention lookups
    async for prof in db.social_profiles.find({"handle": {"$type": "string"}, "handle_lc": {"$exists": False}}, {"_id": 0, "user_id": 1, "handle": 1}):
        await db.social_profiles.update_one({"user_id": prof["user_id"]}, {"$set": {"handle_lc": prof["handle"].lower()}})
    return out
