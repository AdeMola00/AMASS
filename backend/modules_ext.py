"""AMASS unified-platform extension: Media library (object storage), Marketplace,
App Configuration and Token Economy. Registers routes on the shared `api` router
so the Admin Portal, Landing Page and Mobile App all use one backend + one DB."""
import os
import uuid
import asyncio
import logging
import requests
from typing import Optional, Dict, Any, List
from pymongo import ReturnDocument
from datetime import datetime, timezone, timedelta
from fastapi import UploadFile, File, Depends, HTTPException, Response, Query
from pydantic import BaseModel

from server import api, db, require, get_current_user, log_activity, now_iso, new_id

logger = logging.getLogger("amass")

STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = os.environ.get("APP_NAME", "amass")
_storage_key = None

MIME_TYPES = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "gif": "image/gif",
              "webp": "image/webp", "svg": "image/svg+xml", "mp4": "video/mp4", "webm": "video/webm",
              "pdf": "application/pdf", "csv": "text/csv", "txt": "text/plain"}


def _init_storage():
    global _storage_key
    if _storage_key:
        return _storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    return _storage_key


def init_storage_safe():
    try:
        _init_storage()
        logger.info("Object storage initialized")
    except Exception as e:  # noqa
        logger.error("Storage init failed: %s", e)


def _put_object(path: str, data: bytes, content_type: str):
    key = _init_storage()
    resp = requests.put(f"{STORAGE_URL}/objects/{path}",
                        headers={"X-Storage-Key": key, "Content-Type": content_type},
                        data=data, timeout=120)
    if resp.status_code == 403:
        global _storage_key
        _storage_key = None
        key = _init_storage()
        resp = requests.put(f"{STORAGE_URL}/objects/{path}",
                            headers={"X-Storage-Key": key, "Content-Type": content_type},
                            data=data, timeout=120)
    resp.raise_for_status()
    return resp.json()


def _get_object(path: str):
    key = _init_storage()
    resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


# =====================================================================
# Media library
# =====================================================================
@api.post("/media/upload")
async def media_upload(file: UploadFile = File(...), folder: str = Query("general"),
                       user: dict = Depends(require("media", "create"))):
    ext = (file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else "bin")
    content_type = file.content_type or MIME_TYPES.get(ext, "application/octet-stream")
    path = f"{APP_NAME}/{folder}/{uuid.uuid4()}.{ext}"
    data = await file.read()
    if len(data) > 20 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large (max 20MB)")
    if not (content_type.startswith("image/") or content_type in ("video/mp4", "video/webm", "application/pdf")):
        raise HTTPException(status_code=400, detail="Unsupported file type")
    result = await asyncio.get_event_loop().run_in_executor(None, _put_object, path, data, content_type)
    doc = {"id": new_id(), "storage_path": result["path"], "url": f"/api/media/file/{result['path']}",
           "original_filename": file.filename, "content_type": content_type,
           "folder": folder, "size": result.get("size", len(data)), "is_deleted": False,
           "uploaded_by": user.get("email", ""), "created_at": now_iso()}
    await db.media.insert_one(doc)
    await log_activity("uploaded media", "media", user, file.filename)
    return {k: v for k, v in doc.items() if k != "_id"}


@api.get("/media")
async def media_list(user: dict = Depends(require("media")), folder: Optional[str] = None):
    q: Dict[str, Any] = {"is_deleted": False}
    if folder and folder != "all":
        q["folder"] = folder
    return await db.media.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)


@api.delete("/media/{mid}")
async def media_delete(mid: str, user: dict = Depends(require("media", "delete"))):
    res = await db.media.update_one({"id": mid}, {"$set": {"is_deleted": True}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Media not found")
    return {"success": True}


@api.get("/media/file/{path:path}")
async def media_file(path: str):
    record = await db.media.find_one({"storage_path": path, "is_deleted": False}, {"_id": 0})
    if not record:
        raise HTTPException(status_code=404, detail="File not found")
    data, content_type = await asyncio.get_event_loop().run_in_executor(None, _get_object, path)
    return Response(content=data, media_type=record.get("content_type", content_type),
                    headers={"Cache-Control": "public, max-age=31536000"})


# =====================================================================
# Generic CRUD helper (kept tiny + reusable for shared modules)
# =====================================================================
async def _list(coll, q=None, sort_field="created_at"):
    return await db[coll].find(q or {}, {"_id": 0}).sort(sort_field, -1).to_list(2000)


async def _create(coll, body: dict, user, label):
    doc = {**body, "id": new_id(), "created_at": now_iso()}
    await db[coll].insert_one(doc)
    await log_activity(f"created {label}", coll, user, doc.get("name") or doc.get("title", ""))
    return {"success": True, "id": doc["id"]}


async def _update(coll, _id, body: dict):
    res = await db[coll].update_one({"id": _id}, {"$set": body})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"success": True}


async def _delete(coll, _id):
    res = await db[coll].delete_one({"id": _id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"success": True}


# =====================================================================
# Marketplace
# =====================================================================
class MPCategory(BaseModel):
    name: str
    slug: Optional[str] = ""
    icon: Optional[str] = ""
    image: Optional[str] = ""
    active: bool = True
    order: int = 0


class MPProduct(BaseModel):
    title: str
    description: Optional[str] = ""
    category_id: Optional[str] = ""
    price: int = 0
    currency: str = "NGN"
    images: List[str] = []
    seller: Optional[str] = ""
    stock: int = 0
    featured: bool = False
    sponsored: bool = False
    status: str = "active"


class MPPromotion(BaseModel):
    title: str
    kind: str = "discount"        # discount | banner | sponsored
    value: Optional[str] = ""
    image: Optional[str] = ""
    active: bool = True


class MPPricingRule(BaseModel):
    name: str
    kind: str = "commission"      # commission | listing_fee | featured_fee
    value: float = 0
    active: bool = True


PRODUCT_STATUSES = ("active", "archived")


async def _category_name(cid):
    if not cid:
        return ""
    c = await db.mp_categories.find_one({"id": cid}, {"_id": 0, "name": 1})
    return c["name"] if c else ""


@api.get("/marketplace/categories")
async def mp_categories(user: dict = Depends(require("marketplace"))):
    return await db.mp_categories.find({}, {"_id": 0}).sort("order", 1).to_list(500)

@api.post("/marketplace/categories")
async def mp_cat_create(body: MPCategory, user: dict = Depends(require("marketplace", "create"))):
    return await _create("mp_categories", body.model_dump(), user, "category")

@api.put("/marketplace/categories/{cid}")
async def mp_cat_update(cid: str, body: MPCategory, user: dict = Depends(require("marketplace", "edit"))):
    return await _update("mp_categories", cid, body.model_dump())

@api.delete("/marketplace/categories/{cid}")
async def mp_cat_delete(cid: str, user: dict = Depends(require("marketplace", "delete"))):
    return await _delete("mp_categories", cid)


@api.get("/marketplace/products")
async def mp_products(user: dict = Depends(require("marketplace")), search: Optional[str] = None,
                      category_id: Optional[str] = None, status: Optional[str] = None):
    q: Dict[str, Any] = {}
    if category_id and category_id != "all":
        q["category_id"] = category_id
    if status and status != "all":
        q["status"] = status
    if search:
        q["title"] = {"$regex": search, "$options": "i"}
    return await db.mp_products.find(q, {"_id": 0}).sort("created_at", -1).to_list(2000)

@api.post("/marketplace/products")
async def mp_prod_create(body: MPProduct, user: dict = Depends(require("marketplace", "create"))):
    d = body.model_dump(); d["category_name"] = await _category_name(body.category_id)
    if d.get("status") not in PRODUCT_STATUSES: d["status"] = "active"
    return await _create("mp_products", d, user, "product")

@api.put("/marketplace/products/{pid}")
async def mp_prod_update(pid: str, body: MPProduct, user: dict = Depends(require("marketplace", "edit"))):
    d = body.model_dump(); d["category_name"] = await _category_name(body.category_id)
    if d.get("status") not in PRODUCT_STATUSES: d["status"] = "active"
    return await _update("mp_products", pid, d)

@api.patch("/marketplace/products/{pid}/flags")
async def mp_prod_flags(pid: str, body: dict, user: dict = Depends(require("marketplace", "edit"))):
    allowed = {k: v for k, v in body.items() if k in ("featured", "sponsored", "status")}
    return await _update("mp_products", pid, allowed)

@api.delete("/marketplace/products/{pid}")
async def mp_prod_delete(pid: str, user: dict = Depends(require("marketplace", "delete"))):
    return await _delete("mp_products", pid)


@api.get("/marketplace/promotions")
async def mp_promos(user: dict = Depends(require("marketplace"))):
    return await _list("mp_promotions")

@api.post("/marketplace/promotions")
async def mp_promo_create(body: MPPromotion, user: dict = Depends(require("marketplace", "create"))):
    return await _create("mp_promotions", body.model_dump(), user, "promotion")

@api.delete("/marketplace/promotions/{pid}")
async def mp_promo_delete(pid: str, user: dict = Depends(require("marketplace", "delete"))):
    return await _delete("mp_promotions", pid)


@api.get("/marketplace/pricing-rules")
async def mp_pricing(user: dict = Depends(require("marketplace"))):
    return await _list("mp_pricing_rules")

@api.post("/marketplace/pricing-rules")
async def mp_pricing_create(body: MPPricingRule, user: dict = Depends(require("marketplace", "create"))):
    return await _create("mp_pricing_rules", body.model_dump(), user, "pricing rule")

@api.delete("/marketplace/pricing-rules/{pid}")
async def mp_pricing_delete(pid: str, user: dict = Depends(require("marketplace", "delete"))):
    return await _delete("mp_pricing_rules", pid)


# Public marketplace (app + landing)
@api.get("/public/marketplace/categories")
async def pub_mp_categories():
    return await db.mp_categories.find({"active": True}, {"_id": 0}).sort("order", 1).to_list(500)

@api.get("/public/marketplace/products")
async def pub_mp_products(category_id: Optional[str] = None, featured: Optional[bool] = None, limit: int = 60):
    q: Dict[str, Any] = {"status": "active"}
    if category_id and category_id != "all":
        q["category_id"] = category_id
    if featured:
        q["featured"] = True
    return await db.mp_products.find(q, {"_id": 0}).sort("created_at", -1).to_list(min(limit, 200))


# =====================================================================
# App configuration (drives Mobile App + Landing homepage)
# =====================================================================
class AppConfigUpdate(BaseModel):
    data: Dict[str, Any]


@api.get("/app-config")
async def app_config_list(user: dict = Depends(require("app_config"))):
    return await db.app_config.find({}, {"_id": 0}).sort("order", 1).to_list(100)

@api.put("/app-config/{key}")
async def app_config_update(key: str, body: AppConfigUpdate, user: dict = Depends(require("app_config", "edit"))):
    res = await db.app_config.update_one({"key": key}, {"$set": {"data": body.data, "updated_at": now_iso()}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Config section not found")
    await log_activity(f"updated app config '{key}'", "app_config", user)
    return {"success": True}

@api.get("/public/app-config")
async def pub_app_config():
    rows = await db.app_config.find({}, {"_id": 0}).to_list(100)
    return {r["key"]: r["data"] for r in rows}


# =====================================================================
# Token economy
# =====================================================================
class TokenBundle(BaseModel):
    name: str
    tokens: int = 0
    price: int = 0
    currency: str = "NGN"
    bonus: int = 0
    active: bool = True


class SubscriptionPlan(BaseModel):
    name: str
    price: int = 0
    currency: str = "NGN"
    interval: str = "monthly"
    features: List[str] = []
    active: bool = True


class TokenReward(BaseModel):
    action: str
    tokens: int = 0
    active: bool = True


class WalletAdjust(BaseModel):
    amount: int
    reason: Optional[str] = ""


@api.get("/tokens/bundles")
async def tok_bundles(user: dict = Depends(require("tokens"))):
    return await _list("token_bundles")

@api.post("/tokens/bundles")
async def tok_bundle_create(body: TokenBundle, user: dict = Depends(require("tokens", "create"))):
    return await _create("token_bundles", body.model_dump(), user, "token bundle")

@api.put("/tokens/bundles/{bid}")
async def tok_bundle_update(bid: str, body: TokenBundle, user: dict = Depends(require("tokens", "edit"))):
    return await _update("token_bundles", bid, body.model_dump())

@api.delete("/tokens/bundles/{bid}")
async def tok_bundle_delete(bid: str, user: dict = Depends(require("tokens", "delete"))):
    return await _delete("token_bundles", bid)


@api.get("/tokens/plans")
async def tok_plans(user: dict = Depends(require("tokens"))):
    return await _list("subscription_plans")

@api.post("/tokens/plans")
async def tok_plan_create(body: SubscriptionPlan, user: dict = Depends(require("tokens", "create"))):
    return await _create("subscription_plans", body.model_dump(), user, "plan")

@api.put("/tokens/plans/{pid}")
async def tok_plan_update(pid: str, body: SubscriptionPlan, user: dict = Depends(require("tokens", "edit"))):
    return await _update("subscription_plans", pid, body.model_dump())

@api.delete("/tokens/plans/{pid}")
async def tok_plan_delete(pid: str, user: dict = Depends(require("tokens", "delete"))):
    return await _delete("subscription_plans", pid)


@api.get("/tokens/rewards")
async def tok_rewards(user: dict = Depends(require("tokens"))):
    return await _list("token_rewards")

@api.post("/tokens/rewards")
async def tok_reward_create(body: TokenReward, user: dict = Depends(require("tokens", "create"))):
    return await _create("token_rewards", body.model_dump(), user, "reward")

@api.delete("/tokens/rewards/{rid}")
async def tok_reward_delete(rid: str, user: dict = Depends(require("tokens", "delete"))):
    return await _delete("token_rewards", rid)


@api.get("/tokens/wallets")
async def tok_wallets(user: dict = Depends(require("tokens")), search: Optional[str] = None):
    q: Dict[str, Any] = {}
    if search:
        q["user_name"] = {"$regex": search, "$options": "i"}
    return await db.wallets.find(q, {"_id": 0}).sort("balance", -1).to_list(1000)

@api.patch("/tokens/wallets/{wid}")
async def tok_wallet_adjust(wid: str, body: WalletAdjust, user: dict = Depends(require("tokens", "edit"))):
    res = await db.wallets.find_one_and_update(
        {"id": wid},
        [{"$set": {"balance": {"$max": [0, {"$add": ["$balance", body.amount]}]}, "updated_at": now_iso()}}],
        projection={"_id": 0}, return_document=ReturnDocument.AFTER)
    if not res:
        raise HTTPException(status_code=404, detail="Wallet not found")
    await log_activity(f"adjusted wallet by {body.amount} tokens", "wallet", user, body.reason)
    return {"success": True, "balance": res["balance"]}


# Public token catalog (app)
@api.get("/public/tokens/bundles")
async def pub_bundles():
    return await db.token_bundles.find({"active": True}, {"_id": 0}).to_list(200)

@api.get("/public/tokens/plans")
async def pub_plans():
    return await db.subscription_plans.find({"active": True}, {"_id": 0}).to_list(200)


# =====================================================================
# Analytics
# =====================================================================
@api.get("/analytics/overview")
async def analytics_overview(user: dict = Depends(require("analytics"))):
    total_users = await db.platform_users.count_documents({})
    active_users = await db.platform_users.count_documents({"status": "active"})
    total_props = await db.properties.count_documents({})
    approved = await db.properties.count_documents({"status": "approved"})
    pending = await db.properties.count_documents({"status": "pending"})
    agents_total = await db.agents.count_documents({})
    agents_verified = await db.agents.count_documents({"verified": True})
    products = await db.mp_products.count_documents({})

    status_rows = await db.properties.aggregate([{"$group": {"_id": "$status", "value": {"$sum": 1}}}]).to_list(20)
    city_rows = await db.properties.aggregate([{"$group": {"_id": "$city", "value": {"$sum": 1}}}, {"$sort": {"value": -1}}]).to_list(12)
    top = await db.properties.aggregate([
        {"$match": {"agent_name": {"$nin": [None, ""]}}},
        {"$group": {"_id": "$agent_name", "listings": {"$sum": 1}}},
        {"$sort": {"listings": -1}}, {"$limit": 6}]).to_list(6)

    wallet_agg = await db.wallets.aggregate([{"$group": {"_id": None, "c": {"$sum": "$balance"}}}]).to_list(1)
    circulation = wallet_agg[0]["c"] if wallet_agg else 0
    bundles = await db.token_bundles.find({"active": True}, {"_id": 0}).to_list(100)
    ppt = (sum(b["price"] / max(1, b["tokens"]) for b in bundles) / len(bundles)) if bundles else 0
    est_revenue = int(circulation * ppt)
    active_plans = await db.subscription_plans.count_documents({"active": True})

    trend = []
    for i in range(13, -1, -1):
        day = datetime.now(timezone.utc) - timedelta(days=i)
        c = await db.leads.count_documents({"created_at": {"$regex": f"^{day.strftime('%Y-%m-%d')}"}})
        trend.append({"date": day.strftime("%b %d"), "leads": c})

    return {
        "kpis": {"active_users": active_users, "total_users": total_users, "total_listings": total_props,
                 "approved_listings": approved, "pending_listings": pending, "agents": agents_total,
                 "verified_agents": agents_verified, "products": products,
                 "token_circulation": circulation, "est_token_revenue": est_revenue, "active_plans": active_plans},
        "listings_by_status": [{"name": r["_id"], "value": r["value"]} for r in status_rows],
        "listings_by_city": [{"name": r["_id"], "value": r["value"]} for r in city_rows],
        "top_agents": [{"name": r["_id"], "listings": r["listings"]} for r in top],
        "leads_trend": trend,
    }


# =====================================================================
# Notifications broadcaster
# =====================================================================
class NotificationInput(BaseModel):
    title: str
    message: str
    channels: List[str] = ["in_app"]
    audience: str = "all"


@api.post("/notifications")
async def create_notification(body: NotificationInput, user: dict = Depends(require("notifications", "create"))):
    # in_app announcements are delivered live; email/push/sms are queued (provider not yet connected)
    channel_status = {ch: ("sent" if ch == "in_app" else "queued") for ch in body.channels}
    doc = {"id": new_id(), "title": body.title, "message": body.message, "channels": body.channels,
           "audience": body.audience, "channel_status": channel_status,
           "active": "in_app" in body.channels, "created_by": user.get("email", ""), "created_at": now_iso()}
    await db.notifications.insert_one(doc)
    await log_activity("sent a broadcast", "notification", user, body.title)
    return {k: v for k, v in doc.items() if k != "_id"}


@api.get("/notifications")
async def list_notifications(user: dict = Depends(require("notifications"))):
    return await db.notifications.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)


@api.patch("/notifications/{nid}/toggle")
async def toggle_notification(nid: str, user: dict = Depends(require("notifications", "edit"))):
    n = await db.notifications.find_one({"id": nid})
    if not n:
        raise HTTPException(status_code=404, detail="Not found")
    await db.notifications.update_one({"id": nid}, {"$set": {"active": not n.get("active", False)}})
    return {"success": True}


@api.delete("/notifications/{nid}")
async def delete_notification(nid: str, user: dict = Depends(require("notifications", "delete"))):
    return await _delete("notifications", nid)


@api.get("/public/announcements")
async def public_announcements():
    return await db.notifications.find(
        {"active": True, "channels": "in_app"},
        {"_id": 0, "id": 1, "title": 1, "message": 1, "created_at": 1}).sort("created_at", -1).to_list(50)


# =====================================================================
# Unified bootstrap — one call for the Mobile App / Landing Page
# =====================================================================
@api.get("/public/bootstrap")
async def public_bootstrap():
    landing = await db.cms_sections.find({"visible": True}, {"_id": 0}).sort("order", 1).to_list(100)
    cfg = await db.app_config.find({}, {"_id": 0}).to_list(100)
    categories = await db.mp_categories.find({"active": True}, {"_id": 0}).sort("order", 1).to_list(200)
    featured_products = await db.mp_products.find({"status": "active", "featured": True}, {"_id": 0}).to_list(30)
    featured_props = await db.properties.find({"status": "approved"}, {"_id": 0}).sort("created_at", -1).to_list(12)
    bundles = await db.token_bundles.find({"active": True}, {"_id": 0}).to_list(50)
    plans = await db.subscription_plans.find({"active": True}, {"_id": 0}).to_list(50)
    announcements = await db.notifications.find({"active": True, "channels": "in_app"}, {"_id": 0}).sort("created_at", -1).to_list(20)
    return {
        "landing": {s["key"]: s["data"] for s in landing},
        "app_config": {c["key"]: c["data"] for c in cfg},
        "marketplace_categories": categories,
        "featured_products": featured_products,
        "featured_properties": featured_props,
        "token_bundles": bundles,
        "subscription_plans": plans,
        "announcements": announcements,
    }


# =====================================================================
# Seeding
# =====================================================================
EXT_VERSION = 1


async def seed_ext():
    if await db.app_meta.find_one({"key": "ext_version", "value": EXT_VERSION}):
        return
    for coll in ("mp_categories", "mp_products", "mp_promotions", "mp_pricing_rules",
                 "app_config", "token_bundles", "subscription_plans", "token_rewards", "wallets"):
        await db[coll].delete_many({})

    cats = [
        {"name": "Furniture", "slug": "furniture", "icon": "Sofa", "active": True, "order": 1,
         "image": "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?q=80&w=800&auto=format&fit=crop"},
        {"name": "Kitchen", "slug": "kitchen", "icon": "CookingPot", "active": True, "order": 2,
         "image": "https://images.unsplash.com/photo-1556909212-d5b604d0c90d?q=80&w=800&auto=format&fit=crop"},
        {"name": "Electronics", "slug": "electronics", "icon": "Tv", "active": True, "order": 3,
         "image": "https://images.unsplash.com/photo-1498049794561-7780e7231661?q=80&w=800&auto=format&fit=crop"},
        {"name": "Appliances", "slug": "appliances", "icon": "WashingMachine", "active": True, "order": 4,
         "image": "https://images.unsplash.com/photo-1585659722983-3a675dabf23d?q=80&w=800&auto=format&fit=crop"},
        {"name": "Lighting", "slug": "lighting", "icon": "Lightbulb", "active": True, "order": 5,
         "image": "https://images.unsplash.com/photo-1524758631624-e2822e304c36?q=80&w=800&auto=format&fit=crop"},
        {"name": "Decor", "slug": "decor", "icon": "Frame", "active": True, "order": 6,
         "image": "https://images.unsplash.com/photo-1513161455079-7dc1de15ef3e?q=80&w=800&auto=format&fit=crop"},
    ]
    for c in cats:
        c["id"] = new_id(); c["created_at"] = now_iso()
    await db.mp_categories.insert_many(cats)

    sample = [
        ("Scandinavian Sofa", 480000, 0), ("Solid Oak Dining Set", 620000, 1),
        ("Smart 55\" 4K TV", 410000, 2), ("Double-Door Fridge", 780000, 3),
        ("Pendant Light Cluster", 96000, 4), ("Woven Wall Art", 38000, 5),
        ("Velvet Accent Chair", 155000, 0), ("Air Fryer Pro", 72000, 1),
    ]
    prods = []
    for i, (title, price, ci) in enumerate(sample):
        cat = cats[ci]
        prods.append({"id": new_id(), "title": title, "description": "Curated for the AMASS Home Marketplace.",
                      "category_id": cat["id"], "category_name": cat["name"], "price": price, "currency": "NGN",
                      "images": [cat["image"]], "seller": "AMASS Home", "stock": 25,
                      "featured": i < 3, "sponsored": i == 0, "status": "active", "created_at": now_iso()})
    await db.mp_products.insert_many(prods)

    await db.mp_promotions.insert_many([
        {"id": new_id(), "title": "New Home Bundle -15%", "kind": "discount", "value": "15%", "image": "", "active": True, "created_at": now_iso()},
        {"id": new_id(), "title": "Featured: Electronics Week", "kind": "sponsored", "value": "", "image": "", "active": True, "created_at": now_iso()},
    ])
    await db.mp_pricing_rules.insert_many([
        {"id": new_id(), "name": "Marketplace commission", "kind": "commission", "value": 7.5, "active": True, "created_at": now_iso()},
        {"id": new_id(), "name": "Featured listing fee", "kind": "featured_fee", "value": 5000, "active": True, "created_at": now_iso()},
    ])

    order = 0
    def cfg(key, data):
        nonlocal order; order += 1
        return {"key": key, "data": data, "order": order, "updated_at": now_iso()}
    await db.app_config.insert_many([
        cfg("homepage_sections", {"sections": [
            {"key": "featured", "title": "Featured Properties", "enabled": True},
            {"key": "categories", "title": "Browse by Category", "enabled": True},
            {"key": "nearby", "title": "Near You", "enabled": True},
            {"key": "marketplace", "title": "Home Marketplace", "enabled": True},
        ]}),
        cfg("map_settings", {"default_lat": 6.4531, "default_lng": 3.3958, "default_zoom": 12,
                             "clustering": True, "style": "streets"}),
        cfg("marketplace_config", {"enabled": True, "currency": "NGN", "min_order": 0, "delivery_enabled": True}),
        cfg("app_banners", {"banners": [
            {"title": "Get Early Access", "subtitle": "Join thousands across Africa", "image": "", "link": "#", "active": True},
        ]}),
        cfg("notifications", {"push_enabled": True, "email_enabled": True, "sms_enabled": False,
                              "announcement": "Welcome to AMASS — Africa's property super app."}),
        cfg("featured_properties", {"property_ids": []}),
    ])

    await db.token_bundles.insert_many([
        {"id": new_id(), "name": "Starter", "tokens": 50, "price": 5000, "currency": "NGN", "bonus": 0, "active": True, "created_at": now_iso()},
        {"id": new_id(), "name": "Growth", "tokens": 200, "price": 18000, "currency": "NGN", "bonus": 20, "active": True, "created_at": now_iso()},
        {"id": new_id(), "name": "Pro", "tokens": 500, "price": 40000, "currency": "NGN", "bonus": 75, "active": True, "created_at": now_iso()},
    ])
    await db.subscription_plans.insert_many([
        {"id": new_id(), "name": "Agent Basic", "price": 0, "currency": "NGN", "interval": "monthly",
         "features": ["5 active listings", "Basic analytics"], "active": True, "created_at": now_iso()},
        {"id": new_id(), "name": "Agent Pro", "price": 15000, "currency": "NGN", "interval": "monthly",
         "features": ["Unlimited listings", "Verified badge", "CRM", "Priority support"], "active": True, "created_at": now_iso()},
        {"id": new_id(), "name": "Developer", "price": 60000, "currency": "NGN", "interval": "monthly",
         "features": ["Project pages", "Off-plan tools", "Team seats", "Dedicated manager"], "active": True, "created_at": now_iso()},
    ])
    await db.token_rewards.insert_many([
        {"id": new_id(), "action": "Complete profile", "tokens": 10, "active": True, "created_at": now_iso()},
        {"id": new_id(), "action": "Verify a listing", "tokens": 25, "active": True, "created_at": now_iso()},
        {"id": new_id(), "action": "Refer a friend", "tokens": 50, "active": True, "created_at": now_iso()},
    ])

    # Wallets for existing platform users
    users = await db.platform_users.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(2000)
    if users:
        import random
        await db.wallets.insert_many([
            {"id": new_id(), "user_id": u["id"], "user_name": u["name"],
             "balance": random.choice([0, 10, 25, 50, 120, 300]), "updated_at": now_iso()} for u in users
        ])

    await db.app_meta.update_one({"key": "ext_version"}, {"$set": {"value": EXT_VERSION}}, upsert=True)
    logger.info("Seeded extension data (v%s)", EXT_VERSION)
