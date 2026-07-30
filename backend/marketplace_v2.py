"""Marketplace v2 — OfferUp/Letgo style C2C classifieds routes.

Additive routes (all under /api/marketplace/*):
  - POST   /items/{id}/save          (toggle save/unsave)
  - GET    /saved
  - GET    /search/suggestions
  - POST   /items/{id}/offer         (mocked buyer offer)
  - POST   /items                    (create listing)
  - GET    /my-listings
  - GET    /sellers/{seller_id}
  - GET    /categories
  - GET    /trending
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from marketplace_c2c_seed import CATEGORIES, TRENDING_SEARCHES, POPULAR_BRANDS


def register_marketplace_v2_routes(db, get_current_user):
    router = APIRouter(prefix="/api/marketplace")

    # ─── Save / Unsave ─────────────────────────────────────────
    @router.post("/items/{item_id}/save")
    async def toggle_save(item_id: str, user: dict = Depends(get_current_user)):
        it = await db.marketplace.find_one({"id": item_id}, {"id": 1, "_id": 0})
        if not it:
            raise HTTPException(404, "Item not found")
        existing = await db.marketplace_saves.find_one(
            {"user_id": user["id"], "item_id": item_id}
        )
        if existing:
            await db.marketplace_saves.delete_one({"_id": existing["_id"]})
            await db.marketplace.update_one({"id": item_id}, {"$inc": {"saves": -1}})
            return {"saved": False}
        await db.marketplace_saves.insert_one(
            {
                "user_id": user["id"],
                "item_id": item_id,
                "saved_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        await db.marketplace.update_one({"id": item_id}, {"$inc": {"saves": 1}})
        return {"saved": True}

    @router.get("/saved/ids")
    async def saved_ids(user: dict = Depends(get_current_user)):
        docs = await db.marketplace_saves.find(
            {"user_id": user["id"]}, {"_id": 0, "item_id": 1}
        ).to_list(500)
        return {"ids": [d["item_id"] for d in docs]}

    @router.get("/saved")
    async def saved_items(user: dict = Depends(get_current_user)):
        docs = await db.marketplace_saves.find(
            {"user_id": user["id"]}, {"_id": 0}
        ).sort("saved_at", -1).to_list(200)
        ids = [d["item_id"] for d in docs]
        if not ids:
            return []
        items = await db.marketplace.find({"id": {"$in": ids}}, {"_id": 0}).to_list(500)
        order = {i: idx for idx, i in enumerate(ids)}
        items.sort(key=lambda x: order.get(x["id"], 999))
        return items

    # ─── Search suggestions ────────────────────────────────────
    @router.get("/search/suggestions")
    async def search_suggestions(q: str = Query("", max_length=64)):
        q = (q or "").strip().lower()
        if not q:
            # cold-start suggestions
            return {
                "categories": [c["label"] for c in CATEGORIES[:6]],
                "trending": TRENDING_SEARCHES[:8],
                "brands": POPULAR_BRANDS[:8],
                "items": [],
            }

        cat_hits = [c["label"] for c in CATEGORIES if q in c["label"].lower()][:5]
        brand_hits = [b for b in POPULAR_BRANDS if q in b.lower()][:6]
        trending_hits = [t for t in TRENDING_SEARCHES if q in t.lower()][:6]

        item_docs = await db.marketplace.find(
            {
                "$or": [
                    {"name": {"$regex": q, "$options": "i"}},
                    {"subcategory": {"$regex": q, "$options": "i"}},
                    {"brand": {"$regex": q, "$options": "i"}},
                ]
            },
            {"_id": 0, "id": 1, "name": 1, "image": 1, "price": 1, "city": 1},
        ).limit(6).to_list(6)

        return {
            "categories": cat_hits,
            "trending": trending_hits,
            "brands": brand_hits,
            "items": item_docs,
        }

    # ─── Make Offer (mocked buyer→seller offer) ────────────────
    class OfferIn(BaseModel):
        amount: int
        message: Optional[str] = None

    @router.post("/items/{item_id}/offer")
    async def make_offer(
        item_id: str,
        data: OfferIn,
        user: dict = Depends(get_current_user),
    ):
        it = await db.marketplace.find_one({"id": item_id}, {"_id": 0})
        if not it:
            raise HTTPException(404, "Item not found")
        if data.amount <= 0:
            raise HTTPException(400, "Amount must be positive")
        offer = {
            "id": str(uuid.uuid4()),
            "item_id": item_id,
            "buyer_id": user["id"],
            "buyer_name": user.get("full_name"),
            "seller_id": it.get("seller_id"),
            "amount": data.amount,
            "message": data.message,
            "status": "sent",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.marketplace_offers.insert_one(offer)
        offer.pop("_id", None)
        return {"ok": True, "offer": offer}

    @router.get("/offers/sent")
    async def offers_sent(user: dict = Depends(get_current_user)):
        docs = await db.marketplace_offers.find(
            {"buyer_id": user["id"]}, {"_id": 0}
        ).sort("created_at", -1).to_list(100)
        return docs

    # ─── Create listing (post) ─────────────────────────────────
    class ListingIn(BaseModel):
        name: str = Field(..., min_length=3, max_length=140)
        description: str = Field(..., min_length=10, max_length=2000)
        price: int = Field(..., gt=0)
        category: str
        subcategory: str
        condition: str = "used"
        brand: Optional[str] = None
        image: str
        images: List[str] = Field(default_factory=list)
        city: Optional[str] = None
        location: Optional[str] = None
        latitude: Optional[float] = None
        longitude: Optional[float] = None
        negotiable: bool = True
        contact_prefs: List[str] = Field(default_factory=lambda: ["chat", "call", "whatsapp"])
        seller_phone: Optional[str] = None
        seller_whatsapp: Optional[str] = None
        specs: dict = Field(default_factory=dict)
        tags: List[str] = Field(default_factory=list)

    @router.post("/items")
    async def create_listing(data: ListingIn, user: dict = Depends(get_current_user)):
        now = datetime.now(timezone.utc)
        item = {
            "id": str(uuid.uuid4()),
            **data.model_dump(),
            "currency": "NGN",
            "rating": 4.8,
            "reviews": 0,
            "verified": False,
            "delivery": False,
            "delivery_days": 0,
            "stock": 1,
            "popular": False,
            "on_sale": False,
            "posted_at": now.isoformat(),
            "views": 0,
            "saves": 0,
            "is_boosted": False,
            "is_featured": False,
            "vendor": user.get("full_name", "Seller"),
            "vendor_id": None,
            # seller
            "seller_id": user["id"],
            "seller_name": user.get("full_name"),
            "seller_avatar": user.get("avatar_url"),
            "seller_phone": data.seller_phone or user.get("phone"),
            "seller_whatsapp": data.seller_whatsapp or user.get("phone"),
            "seller_type": "individual",
            "seller_verified": bool(user.get("phone_verified") or user.get("verified")),
            "seller_rating": 4.8,
            "seller_reviews": 0,
            "seller_joined_year": now.year,
            "seller_response_time_hours": 2,
            "seller_response_rate": 100,
            "seller_bio": user.get("bio"),
        }
        # ensure a first image
        if item.get("images") is None:
            item["images"] = []
        if item["image"] and item["image"] not in item["images"]:
            item["images"] = [item["image"], *item["images"]]
        await db.marketplace.insert_one(item)
        item.pop("_id", None)
        return {"ok": True, "item": item}

    @router.get("/my-listings")
    async def my_listings(user: dict = Depends(get_current_user)):
        docs = await db.marketplace.find(
            {"seller_id": user["id"]}, {"_id": 0}
        ).sort("posted_at", -1).to_list(200)
        return docs

    # ─── Seller profile ────────────────────────────────────────
    @router.get("/sellers/{seller_id}")
    async def get_seller(seller_id: str):
        items = await db.marketplace.find({"seller_id": seller_id}, {"_id": 0}).to_list(200)
        if not items:
            raise HTTPException(404, "Seller has no listings")
        first = items[0]
        profile = {
            "seller_id": seller_id,
            "seller_name": first.get("seller_name"),
            "seller_avatar": first.get("seller_avatar"),
            "seller_type": first.get("seller_type", "individual"),
            "seller_verified": first.get("seller_verified", False),
            "seller_rating": first.get("seller_rating", 4.7),
            "seller_reviews": first.get("seller_reviews", 0),
            "seller_joined_year": first.get("seller_joined_year", 2024),
            "seller_response_time_hours": first.get("seller_response_time_hours", 2),
            "seller_response_rate": first.get("seller_response_rate", 90),
            "seller_bio": first.get("seller_bio"),
            "seller_phone": first.get("seller_phone"),
            "seller_whatsapp": first.get("seller_whatsapp"),
            "city": first.get("city"),
            "listings_count": len(items),
            "items_sold": max(0, first.get("seller_reviews", 0) - 2),
        }
        return {"profile": profile, "items": items}

    # ─── Categories & trending ─────────────────────────────────
    @router.get("/categories")
    async def list_categories():
        # Attach live counts
        out = []
        for c in CATEGORIES:
            cnt = await db.marketplace.count_documents({"category": c["key"]})
            out.append({**c, "count": cnt})
        return out

    @router.get("/trending")
    async def trending():
        return {
            "searches": TRENDING_SEARCHES,
            "brands": POPULAR_BRANDS,
        }

    return router
