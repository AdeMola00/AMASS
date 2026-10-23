"""Marketplace v2 — OfferUp/Letgo style C2C classifieds routes.

Additive routes (all under /api/marketplace/*):
  - POST   /items/{id}/save          (toggle save/unsave)
  - GET    /saved
  - GET    /search/suggestions
  - POST   /items/{id}/offer         (buyer → seller offer, notifies seller)
  - GET    /offers/sent              (buyer view, item hydrated)
  - GET    /offers/received          (seller view, item hydrated)
  - POST   /offers/{id}/respond      (seller accept|decline|counter · buyer accept counter)
  - POST   /offers/{id}/withdraw     (buyer)
  - POST   /items                    (create listing)
  - PATCH  /items/{id}               (owner edit: price/title/description/negotiable/status)
  - DELETE /items/{id}               (owner soft-delete → status "removed")
  - GET    /my-listings
  - POST   /items/{id}/report        (buyer report → marketplace_reports)
  - GET    /admin/reports            (admin queue)
  - POST   /admin/reports/{id}/resolve
  - GET    /sellers/{seller_id}
  - GET    /categories
  - GET    /trending

Listing lifecycle: status ∈ active (default/missing) · paused · sold · removed.
Public feeds only show `active`; detail pages still open `sold` (shown as Sold);
`removed` is hidden everywhere (404 on detail).
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional, List, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from marketplace_c2c_seed import CATEGORIES, TRENDING_SEARCHES, POPULAR_BRANDS

# Query fragment: listings that are publicly visible in feeds/search.
PUBLIC_ACTIVE = {"status": {"$nin": ["paused", "sold", "removed"]}}
# Query fragment: listings that may still be opened on a detail page.
NOT_REMOVED = {"status": {"$ne": "removed"}}

REPORT_REASONS = ("scam", "prohibited", "wrong_category", "duplicate", "offensive", "other")

_ITEM_PREVIEW = {"_id": 0, "id": 1, "name": 1, "image": 1, "price": 1, "city": 1, "status": 1, "seller_id": 1, "seller_name": 1}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _notify(db, user_id: Optional[str], kind: str, title: str, body: str, meta: dict) -> None:
    if not user_id:
        return
    from notification_center import emit  # respects the user's category / quiet-hour / push preferences
    await emit(db, user_id, kind, title, body, meta)


def _fmt_naira(n: int) -> str:
    return f"₦{int(n):,}"


async def _hydrate_offers(db, offers: list[dict]) -> list[dict]:
    ids = list({o["item_id"] for o in offers})
    if not ids:
        return offers
    items = await db.marketplace.find({"id": {"$in": ids}}, _ITEM_PREVIEW).to_list(len(ids))
    by_id = {i["id"]: i for i in items}
    for o in offers:
        o["item"] = by_id.get(o["item_id"])
    return offers


async def _ensure_item_conversation(db, item: dict, buyer_id: str) -> Optional[str]:
    """Idempotently create the buyer↔seller chat for an item (mirrors chat.from-item)."""
    seller_id = item.get("seller_id")
    if not seller_id or seller_id == buyer_id:
        return None
    existing = await db.conversations.find_one(
        {"item_id": item["id"], "participant_ids": {"$all": [buyer_id, seller_id], "$size": 2}},
        {"_id": 0, "id": 1},
    )
    if existing:
        return existing["id"]
    now = datetime.now(timezone.utc)
    conv = {
        "id": str(uuid.uuid4()),
        "kind": "marketplace",
        "property_id": None,
        "listing_id": None,
        "item_id": item["id"],
        "participant_ids": sorted([buyer_id, seller_id]),
        "created_by": buyer_id,
        "last_message_preview": None,
        "last_message_at": None,
        "created_at": now,
        "updated_at": now,
    }
    await db.conversations.insert_one(conv)
    return conv["id"]



# ─── Request models (module-level so FastAPI can resolve the postponed annotations) ───
class OfferIn(BaseModel):
    amount: int
    message: Optional[str] = None


class OfferRespondIn(BaseModel):
    action: Literal["accept", "decline", "counter"]
    counter_amount: Optional[int] = None
    message: Optional[str] = None


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


class ListingPatch(BaseModel):
    name: Optional[str] = Field(None, min_length=3, max_length=140)
    description: Optional[str] = Field(None, min_length=10, max_length=2000)
    price: Optional[int] = Field(None, gt=0)
    negotiable: Optional[bool] = None
    status: Optional[Literal["active", "paused", "sold"]] = None


class ReportIn(BaseModel):
    reason: Literal["scam", "prohibited", "wrong_category", "duplicate", "offensive", "other"]
    details: Optional[str] = Field(None, max_length=600)


class ResolveIn(BaseModel):
    action: Literal["dismiss", "remove_listing", "pause_listing", "restore_listing"]
    note: Optional[str] = Field(None, max_length=400)


def register_marketplace_v2_routes(db, get_current_user, require_admin):
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
        items = await db.marketplace.find({"id": {"$in": ids}, **NOT_REMOVED}, {"_id": 0}).to_list(500)
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
                **PUBLIC_ACTIVE,
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

    # ─── Offers (buyer ↔ seller) ───────────────────────────────

    @router.post("/items/{item_id}/offer")
    async def make_offer(
        item_id: str,
        data: OfferIn,
        user: dict = Depends(get_current_user),
    ):
        it = await db.marketplace.find_one({"id": item_id, **NOT_REMOVED}, {"_id": 0})
        if not it:
            raise HTTPException(404, "Item not found")
        if data.amount <= 0:
            raise HTTPException(400, "Amount must be positive")
        if it.get("seller_id") == user["id"]:
            raise HTTPException(400, "You can't make an offer on your own listing")
        if it.get("status") in ("sold", "paused"):
            raise HTTPException(409, "This listing is no longer accepting offers")
        if it.get("category") == "services":
            raise HTTPException(400, "Offers are not available for FIXA providers")
        # One live offer per buyer per item — a new offer supersedes the open one.
        await db.marketplace_offers.update_many(
            {"item_id": item_id, "buyer_id": user["id"], "status": {"$in": ["sent", "countered"]}},
            {"$set": {"status": "superseded", "updated_at": _now_iso()}},
        )
        offer = {
            "id": str(uuid.uuid4()),
            "item_id": item_id,
            "buyer_id": user["id"],
            "buyer_name": user.get("full_name"),
            "seller_id": it.get("seller_id"),
            "amount": data.amount,
            "asking_price": it.get("price"),
            "message": (data.message or "").strip() or None,
            "counter_amount": None,
            "status": "sent",
            "created_at": _now_iso(),
            "updated_at": _now_iso(),
        }
        await db.marketplace_offers.insert_one(offer)
        offer.pop("_id", None)
        await _notify(
            db, it.get("seller_id"), "MARKET_OFFER",
            f"New offer on {it.get('name', 'your listing')}",
            f"{user.get('full_name') or 'A buyer'} offered {_fmt_naira(data.amount)} (asking {_fmt_naira(it.get('price') or 0)}).",
            {"offer_id": offer["id"], "item_id": item_id, "tab": "received"},
        )
        return {"ok": True, "offer": offer}

    @router.get("/offers/sent")
    async def offers_sent(user: dict = Depends(get_current_user)):
        docs = await db.marketplace_offers.find(
            {"buyer_id": user["id"], "status": {"$ne": "superseded"}}, {"_id": 0}
        ).sort("created_at", -1).to_list(100)
        return await _hydrate_offers(db, docs)

    @router.get("/offers/received")
    async def offers_received(user: dict = Depends(get_current_user)):
        docs = await db.marketplace_offers.find(
            {"seller_id": user["id"], "status": {"$ne": "superseded"}}, {"_id": 0}
        ).sort("created_at", -1).to_list(200)
        return await _hydrate_offers(db, docs)


    @router.post("/offers/{offer_id}/respond")
    async def respond_offer(offer_id: str, data: OfferRespondIn, user: dict = Depends(get_current_user)):
        offer = await db.marketplace_offers.find_one({"id": offer_id}, {"_id": 0})
        if not offer:
            raise HTTPException(404, "Offer not found")
        item = await db.marketplace.find_one({"id": offer["item_id"]}, {"_id": 0}) or {}
        is_seller = offer.get("seller_id") == user["id"]
        is_buyer = offer.get("buyer_id") == user["id"]
        if not (is_seller or is_buyer):
            raise HTTPException(403, "Not your offer")
        status = offer.get("status")
        now = _now_iso()
        update: dict = {"updated_at": now, "responded_at": now}
        notify_to: Optional[str] = None
        title = body = ""

        if is_seller:
            if status not in ("sent", "countered"):
                raise HTTPException(409, f"Offer is already {status}")
            if data.action == "counter":
                if not data.counter_amount or data.counter_amount <= 0:
                    raise HTTPException(400, "Counter amount must be positive")
                update.update({"status": "countered", "counter_amount": data.counter_amount, "counter_message": (data.message or "").strip() or None})
                title = f"Counter-offer on {item.get('name', 'a listing')}"
                body = f"Seller countered at {_fmt_naira(data.counter_amount)} (your offer {_fmt_naira(offer['amount'])})."
            elif data.action == "accept":
                update.update({"status": "accepted", "agreed_amount": offer.get("counter_amount") if status == "countered" and offer.get("counter_amount") else offer["amount"]})
                title = f"Offer accepted · {item.get('name', 'listing')}"
                body = f"Your offer of {_fmt_naira(update['agreed_amount'])} was accepted. Chat with the seller to arrange pickup."
            else:
                update.update({"status": "declined"})
                title = f"Offer declined · {item.get('name', 'listing')}"
                body = f"The seller declined {_fmt_naira(offer['amount'])}. You can send a new offer."
            notify_to = offer.get("buyer_id")
        else:  # buyer
            if status != "countered":
                raise HTTPException(409, "Only a counter-offer can be answered by the buyer")
            if data.action == "accept":
                update.update({"status": "accepted", "agreed_amount": offer.get("counter_amount")})
                title = f"Counter accepted · {item.get('name', 'listing')}"
                body = f"{offer.get('buyer_name') or 'Buyer'} accepted your counter of {_fmt_naira(offer.get('counter_amount') or 0)}."
            elif data.action == "decline":
                update.update({"status": "declined"})
                title = f"Counter declined · {item.get('name', 'listing')}"
                body = f"{offer.get('buyer_name') or 'Buyer'} declined your counter-offer."
            else:
                raise HTTPException(400, "Buyers can accept or decline a counter-offer")
            notify_to = offer.get("seller_id")

        conversation_id = None
        if update.get("status") == "accepted" and item:
            conversation_id = await _ensure_item_conversation(db, item, offer["buyer_id"])
            update["conversation_id"] = conversation_id

        await db.marketplace_offers.update_one({"id": offer_id}, {"$set": update})
        offer.update(update)
        await _notify(db, notify_to, "MARKET_OFFER", title, body, {
            "offer_id": offer_id, "item_id": offer["item_id"],
            "tab": "sent" if notify_to == offer.get("buyer_id") else "received",
            "conversation_id": conversation_id,
        })
        offer["item"] = {k: item.get(k) for k in ("id", "name", "image", "price", "city", "status", "seller_id", "seller_name")} if item else None
        return {"ok": True, "offer": offer}

    @router.post("/offers/{offer_id}/withdraw")
    async def withdraw_offer(offer_id: str, user: dict = Depends(get_current_user)):
        offer = await db.marketplace_offers.find_one({"id": offer_id, "buyer_id": user["id"]}, {"_id": 0})
        if not offer:
            raise HTTPException(404, "Offer not found")
        if offer.get("status") not in ("sent", "countered"):
            raise HTTPException(409, f"Offer is already {offer.get('status')}")
        now = _now_iso()
        await db.marketplace_offers.update_one({"id": offer_id}, {"$set": {"status": "withdrawn", "updated_at": now}})
        offer.update({"status": "withdrawn", "updated_at": now})
        return {"ok": True, "offer": offer}

    # ─── Create listing (post) ─────────────────────────────────

    @router.post("/items")
    async def create_listing(data: ListingIn, user: dict = Depends(get_current_user)):
        now = datetime.now(timezone.utc)
        item = {
            "id": str(uuid.uuid4()),
            **data.model_dump(),
            "currency": "NGN",
            "status": "active",
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
            {"seller_id": user["id"], **NOT_REMOVED}, {"_id": 0}
        ).sort("posted_at", -1).to_list(200)
        if not docs:
            return docs
        # Open offer counts per listing so the seller can see what needs attention.
        pipeline = [
            {"$match": {"item_id": {"$in": [d["id"] for d in docs]}, "status": {"$in": ["sent", "countered"]}}},
            {"$group": {"_id": "$item_id", "n": {"$sum": 1}}},
        ]
        counts = {r["_id"]: r["n"] async for r in db.marketplace_offers.aggregate(pipeline)}
        for d in docs:
            d.setdefault("status", "active")
            d["open_offers"] = counts.get(d["id"], 0)
        return docs

    # ─── Edit / pause / sell / delete (owner only) ─────────────

    async def _owned_item(item_id: str, user: dict) -> dict:
        it = await db.marketplace.find_one({"id": item_id, **NOT_REMOVED}, {"_id": 0})
        if not it:
            raise HTTPException(404, "Item not found")
        if it.get("seller_id") != user["id"] and not user.get("is_admin"):
            raise HTTPException(403, "You can only manage your own listings")
        return it

    @router.patch("/items/{item_id}")
    async def update_listing(item_id: str, data: ListingPatch, user: dict = Depends(get_current_user)):
        it = await _owned_item(item_id, user)
        changes = {k: v for k, v in data.model_dump().items() if v is not None}
        if not changes:
            raise HTTPException(400, "Nothing to update")
        changes["updated_at"] = _now_iso()
        if changes.get("status") == "sold" and it.get("status") != "sold":
            changes["sold_at"] = changes["updated_at"]
            # Close every open offer — buyers learn the item is gone.
            open_offers = await db.marketplace_offers.find(
                {"item_id": item_id, "status": {"$in": ["sent", "countered"]}}, {"_id": 0, "id": 1, "buyer_id": 1}
            ).to_list(200)
            if open_offers:
                await db.marketplace_offers.update_many(
                    {"id": {"$in": [o["id"] for o in open_offers]}},
                    {"$set": {"status": "declined", "updated_at": changes["updated_at"], "closed_reason": "item_sold"}},
                )
                for o in open_offers:
                    await _notify(db, o["buyer_id"], "MARKET_OFFER", f"{it.get('name', 'Listing')} has been sold",
                                  "The seller marked this item as sold, so your offer was closed.",
                                  {"offer_id": o["id"], "item_id": item_id, "tab": "sent"})
        await db.marketplace.update_one({"id": item_id}, {"$set": changes})
        it.update(changes)
        return {"ok": True, "item": it}

    @router.delete("/items/{item_id}")
    async def delete_listing(item_id: str, user: dict = Depends(get_current_user)):
        await _owned_item(item_id, user)
        now = _now_iso()
        await db.marketplace.update_one({"id": item_id}, {"$set": {"status": "removed", "removed_at": now, "updated_at": now}})
        await db.marketplace_offers.update_many(
            {"item_id": item_id, "status": {"$in": ["sent", "countered"]}},
            {"$set": {"status": "declined", "updated_at": now, "closed_reason": "item_removed"}},
        )
        await db.marketplace_saves.delete_many({"item_id": item_id})
        return {"ok": True}

    # ─── Reports (buyer → admin queue) ─────────────────────────

    @router.post("/items/{item_id}/report")
    async def report_listing(item_id: str, data: ReportIn, user: dict = Depends(get_current_user)):
        it = await db.marketplace.find_one({"id": item_id, **NOT_REMOVED}, _ITEM_PREVIEW)
        if not it:
            raise HTTPException(404, "Item not found")
        if it.get("seller_id") == user["id"]:
            raise HTTPException(400, "You can't report your own listing")
        now = _now_iso()
        # One open report per reporter per item (re-reporting updates the reason).
        existing = await db.marketplace_reports.find_one({"item_id": item_id, "reporter_id": user["id"], "status": "OPEN"}, {"_id": 0, "id": 1})
        if existing:
            await db.marketplace_reports.update_one({"id": existing["id"]}, {"$set": {"reason": data.reason, "details": (data.details or "").strip() or None, "updated_at": now}})
            return {"ok": True, "report_id": existing["id"], "duplicate": True}
        rep = {
            "id": str(uuid.uuid4()),
            "item_id": item_id,
            "seller_id": it.get("seller_id"),
            "reporter_id": user["id"],
            "reporter_name": user.get("full_name") or user.get("email"),
            "reason": data.reason,
            "details": (data.details or "").strip() or None,
            "status": "OPEN",
            "created_at": now,
            "updated_at": now,
        }
        await db.marketplace_reports.insert_one(rep)
        # 3+ independent open reports → auto-pause until an admin looks.
        open_count = await db.marketplace_reports.count_documents({"item_id": item_id, "status": "OPEN"})
        auto_paused = False
        if open_count >= 3 and it.get("status") not in ("paused", "sold"):
            await db.marketplace.update_one({"id": item_id}, {"$set": {"status": "paused", "paused_reason": "auto_reports", "updated_at": now}})
            auto_paused = True
        return {"ok": True, "report_id": rep["id"], "auto_paused": auto_paused}

    @router.get("/admin/reports")
    async def admin_reports(status: str = Query("OPEN"), limit: int = Query(100, ge=1, le=300), _: dict = Depends(require_admin)):
        q = {} if status == "ALL" else {"status": status}
        rows = await db.marketplace_reports.find(q, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
        ids = list({r["item_id"] for r in rows})
        items = await db.marketplace.find({"id": {"$in": ids}}, _ITEM_PREVIEW).to_list(len(ids)) if ids else []
        by_id = {i["id"]: i for i in items}
        for r in rows:
            r["item"] = by_id.get(r["item_id"])
        open_total = await db.marketplace_reports.count_documents({"status": "OPEN"})
        return {"items": rows, "count": len(rows), "open_total": open_total}


    @router.post("/admin/reports/{report_id}/resolve")
    async def admin_resolve_report(report_id: str, data: ResolveIn, admin: dict = Depends(require_admin)):
        rep = await db.marketplace_reports.find_one({"id": report_id}, {"_id": 0})
        if not rep:
            raise HTTPException(404, "Report not found")
        now = _now_iso()
        item_update: dict = {}
        if data.action == "remove_listing":
            item_update = {"status": "removed", "removed_at": now, "removed_by": "admin"}
        elif data.action == "pause_listing":
            item_update = {"status": "paused", "paused_reason": "admin"}
        elif data.action == "restore_listing":
            item_update = {"status": "active", "paused_reason": None}
        if item_update:
            item_update["updated_at"] = now
            await db.marketplace.update_one({"id": rep["item_id"]}, {"$set": item_update})
            if data.action == "remove_listing":
                await db.marketplace_saves.delete_many({"item_id": rep["item_id"]})
        # Resolving one report closes every open report on the same item with the same outcome.
        await db.marketplace_reports.update_many(
            {"item_id": rep["item_id"], "status": "OPEN"},
            {"$set": {"status": "RESOLVED", "resolution": data.action, "resolution_note": (data.note or "").strip() or None,
                      "resolved_by": admin["id"], "resolved_at": now, "updated_at": now}},
        )
        if data.action in ("remove_listing", "pause_listing"):
            await _notify(db, rep.get("seller_id"), "MARKET_MODERATION",
                          "Your listing was " + ("removed" if data.action == "remove_listing" else "paused"),
                          "An AMASS moderator reviewed reports on this listing. Contact support if you think this is a mistake.",
                          {"item_id": rep["item_id"]})
        return {"ok": True, "action": data.action}

    # ─── Seller profile ────────────────────────────────────────
    @router.get("/sellers/{seller_id}")
    async def get_seller(seller_id: str):
        items = await db.marketplace.find({"seller_id": seller_id, **NOT_REMOVED}, {"_id": 0}).sort([("status", 1), ("posted_at", -1)]).to_list(200)
        if not items:
            raise HTTPException(404, "Seller has no listings")
        first = items[0]
        active = [i for i in items if i.get("status", "active") == "active"]
        sold = [i for i in items if i.get("status") == "sold"]
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
            "listings_count": len(active),
            "items_sold": len(sold) if sold else max(0, first.get("seller_reviews", 0) - 2),
        }
        # Active first, then sold (shown with a Sold badge); paused stays private.
        return {"profile": profile, "items": active + sold}

    # ─── Categories & trending ─────────────────────────────────
    @router.get("/categories")
    async def list_categories():
        # Attach live counts
        out = []
        for c in CATEGORIES:
            cnt = await db.marketplace.count_documents({"category": c["key"], **PUBLIC_ACTIVE})
            out.append({**c, "count": cnt})
        return out

    @router.get("/trending")
    async def trending():
        return {
            "searches": TRENDING_SEARCHES,
            "brands": POPULAR_BRANDS,
        }

    return router
