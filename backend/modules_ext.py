"""AMASS unified-platform extension: Media library (object storage), Marketplace,
App Configuration and Token Economy. Registers routes on the shared `api` router
so the Admin Portal, Landing Page and Mobile App all use one backend + one DB."""
import os
import uuid
import asyncio
import logging
import csv
import io
import requests
from typing import Optional, Dict, Any, List
from fastapi.responses import StreamingResponse
from pymongo import ReturnDocument
from datetime import datetime, timezone, timedelta
from fastapi import UploadFile, File, Depends, HTTPException, Response, Query
from pydantic import BaseModel
from emergentintegrations.llm.chat import LlmChat, UserMessage

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


class VerifyInput(BaseModel):
    verified: bool


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
    # validate channels against the known set; default to in_app
    channels = [c for c in body.channels if c in ("in_app", "push", "email", "sms")] or ["in_app"]
    channel_status = {ch: ("sent" if ch == "in_app" else "queued") for ch in channels}
    doc = {"id": new_id(), "title": body.title, "message": body.message, "channels": channels,
           "audience": body.audience, "channel_status": channel_status,
           "active": "in_app" in channels, "created_by": user.get("email", ""), "created_at": now_iso()}
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
    (landing, cfg, categories, featured_products, featured_props, bundles, plans, announcements) = await asyncio.gather(
        db.cms_sections.find({"visible": True}, {"_id": 0}).sort("order", 1).to_list(100),
        db.app_config.find({}, {"_id": 0}).to_list(100),
        db.mp_categories.find({"active": True}, {"_id": 0}).sort("order", 1).to_list(200),
        db.mp_products.find({"status": "active", "featured": True}, {"_id": 0}).to_list(30),
        db.properties.find({"status": "approved"}, {"_id": 0}).sort("created_at", -1).to_list(12),
        db.token_bundles.find({"active": True}, {"_id": 0}).to_list(50),
        db.subscription_plans.find({"active": True}, {"_id": 0}).to_list(50),
        db.notifications.find({"active": True, "channels": "in_app"}, {"_id": 0}).sort("created_at", -1).to_list(20),
    )
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
# Reports & CSV exports
# =====================================================================
def _months_back(n):
    out = []
    now = datetime.now(timezone.utc)
    for i in range(n - 1, -1, -1):
        y, m = now.year, now.month - i
        while m <= 0:
            m += 12; y -= 1
        out.append(f"{y:04d}-{m:02d}")
    return out


@api.get("/reports/summary")
async def reports_summary(user: dict = Depends(require("reports"))):
    labels = _months_back(6)
    leads_by_month, listings_by_month = [], []
    for key in labels:
        lc = await db.leads.count_documents({"created_at": {"$regex": f"^{key}"}})
        pc = await db.properties.count_documents({"created_at": {"$regex": f"^{key}"}})
        label = datetime.strptime(key, "%Y-%m").strftime("%b")
        leads_by_month.append({"month": label, "leads": lc})
        listings_by_month.append({"month": label, "listings": pc})

    cat_rows = await db.mp_products.aggregate(
        [{"$group": {"_id": "$category_name", "value": {"$sum": 1}}}, {"$sort": {"value": -1}}]).to_list(20)
    wallet_agg = await db.wallets.aggregate([{"$group": {"_id": None, "c": {"$sum": "$balance"}}}]).to_list(1)
    circulation = wallet_agg[0]["c"] if wallet_agg else 0
    bundles = await db.token_bundles.find({"active": True}, {"_id": 0}).to_list(100)
    ppt = (sum(b["price"] / max(1, b["tokens"]) for b in bundles) / len(bundles)) if bundles else 0

    totals = {
        "total_leads": await db.leads.count_documents({}),
        "total_listings": await db.properties.count_documents({}),
        "approved_listings": await db.properties.count_documents({"status": "approved"}),
        "total_agents": await db.agents.count_documents({}),
        "verified_agents": await db.agents.count_documents({"verified": True}),
        "products": await db.mp_products.count_documents({}),
        "token_circulation": circulation,
        "est_token_revenue": int(circulation * ppt),
    }
    return {"leads_by_month": leads_by_month, "listings_by_month": listings_by_month,
            "products_by_category": [{"name": r["_id"] or "Uncategorized", "value": r["value"]} for r in cat_rows],
            "totals": totals}


REPORT_DATASETS = {
    "leads": ("leads", [("name", "Name"), ("email", "Email"), ("phone", "Phone"), ("type", "Type"), ("status", "Status"), ("created_at", "Created")]),
    "properties": ("properties", [("title", "Title"), ("type", "Type"), ("listing", "Listing"), ("city", "City"), ("price", "Price"), ("status", "Status"), ("verified", "Verified"), ("agent_name", "Agent"), ("created_at", "Created")]),
    "agents": ("agents", [("name", "Name"), ("email", "Email"), ("phone", "Phone"), ("city", "City"), ("agency", "Agency"), ("verified", "Verified"), ("created_at", "Created")]),
    "products": ("mp_products", [("title", "Title"), ("category_name", "Category"), ("price", "Price"), ("stock", "Stock"), ("featured", "Featured"), ("status", "Status")]),
    "wallets": ("wallets", [("user_name", "User"), ("balance", "Balance"), ("updated_at", "Updated")]),
    "users": ("platform_users", [("name", "Name"), ("email", "Email"), ("phone", "Phone"), ("city", "City"), ("status", "Status"), ("created_at", "Created")]),
}


@api.get("/reports/export")
async def reports_export(dataset: str = Query(...), user: dict = Depends(require("reports"))):
    if dataset not in REPORT_DATASETS:
        raise HTTPException(status_code=400, detail="Unknown dataset")
    coll, cols = REPORT_DATASETS[dataset]
    rows = await db[coll].find({}, {"_id": 0}).sort("created_at", -1).to_list(10000)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow([c[1] for c in cols])
    for r in rows:
        w.writerow([r.get(c[0], "") for c in cols])
    buf.seek(0)
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": f"attachment; filename=amass_{dataset}.csv"})


# =====================================================================
# AI Management (Emergent Universal LLM key)
# =====================================================================
AI_PROVIDER = "openai"
AI_MODEL = "gpt-5.4"


class ValuationInput(BaseModel):
    title: Optional[str] = ""
    type: Optional[str] = "Apartment"
    listing: Optional[str] = "Sale"
    city: Optional[str] = ""
    bedrooms: int = 0
    bathrooms: int = 0
    area_sqm: int = 0
    notes: Optional[str] = ""


class InsightInput(BaseModel):
    query: str


async def _llm(system: str, prompt: str) -> str:
    if not EMERGENT_KEY:
        raise HTTPException(status_code=503, detail="LLM key not configured")
    chat = LlmChat(api_key=EMERGENT_KEY, session_id=new_id(), system_message=system).with_model(AI_PROVIDER, AI_MODEL)
    return await chat.send_message(UserMessage(text=prompt))


async def _store_ai(kind, prompt, output, user):
    await db.ai_generations.insert_one({"id": new_id(), "kind": kind, "prompt": prompt,
                                        "output": output, "by": user.get("email", ""), "created_at": now_iso()})
    await log_activity(f"generated AI {kind}", "ai", user)


@api.post("/ai/valuation")
async def ai_valuation(body: ValuationInput, user: dict = Depends(require("ai_management", "create"))):
    system = ("You are AMASS AI, a property valuation expert for African real estate markets. "
              "Give a concise fair-value range in NGN, the key value drivers, and a short confidence note. "
              "Be realistic; do not fabricate exact comparable sales.")
    prompt = f"Estimate a fair market value for this property and justify briefly.\nDetails: {body.model_dump()}"
    out = await _llm(system, prompt)
    await _store_ai("valuation", prompt, out, user)
    return {"output": out}


@api.post("/ai/description")
async def ai_description(body: ValuationInput, user: dict = Depends(require("ai_management", "create"))):
    system = "You are AMASS AI, a real-estate copywriter. Write an appealing, honest 120-160 word listing description. No emojis, no fabricated amenities."
    prompt = f"Write a listing description for this property: {body.model_dump()}"
    out = await _llm(system, prompt)
    await _store_ai("description", prompt, out, user)
    return {"output": out}


@api.post("/ai/market-insight")
async def ai_market_insight(body: InsightInput, user: dict = Depends(require("ai_management", "create"))):
    system = "You are AMASS AI, an African property market analyst. Give a concise, structured market insight with clear caveats. Avoid fabricated statistics; note when something is an estimate."
    out = await _llm(system, body.query)
    await _store_ai("insight", body.query, out, user)
    return {"output": out}


@api.get("/ai/history")
async def ai_history(user: dict = Depends(require("ai_management"))):
    return await db.ai_generations.find({}, {"_id": 0}).sort("created_at", -1).to_list(50)


# =====================================================================
# Developers & off-plan projects  |  Property Owners
# =====================================================================
PROJECT_STATUSES = ("planning", "selling", "sold_out", "completed")


class DeveloperInput(BaseModel):
    name: str
    email: Optional[str] = ""
    phone: Optional[str] = ""
    company: Optional[str] = ""
    city: Optional[str] = ""


class ProjectInput(BaseModel):
    developer_id: Optional[str] = ""
    name: str
    city: Optional[str] = ""
    units: int = 0
    price_from: int = 0
    status: str = "planning"
    completion_date: Optional[str] = ""
    image: Optional[str] = ""


class OwnerInput(BaseModel):
    name: str
    email: Optional[str] = ""
    phone: Optional[str] = ""
    city: Optional[str] = ""


class AssignOwnerInput(BaseModel):
    owner_id: str


async def _dev_name(did):
    if not did:
        return ""
    d = await db.developers.find_one({"id": did}, {"_id": 0, "name": 1})
    return d["name"] if d else ""


# ---- Developers ----
@api.get("/developers")
async def developers_list(user: dict = Depends(require("developers")), search: Optional[str] = None):
    q = {"$or": [{"name": {"$regex": search, "$options": "i"}}, {"company": {"$regex": search, "$options": "i"}}]} if search else {}
    rows = await db.developers.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)
    for r in rows:
        r["projects_count"] = await db.dev_projects.count_documents({"developer_id": r["id"]})
    return rows

@api.post("/developers")
async def developers_create(body: DeveloperInput, user: dict = Depends(require("developers", "create"))):
    d = {**body.model_dump(), "verified": False}
    return await _create("developers", d, user, "developer")

@api.put("/developers/{did}")
async def developers_update(did: str, body: DeveloperInput, user: dict = Depends(require("developers", "edit"))):
    return await _update("developers", did, body.model_dump())

@api.patch("/developers/{did}/verify")
async def developers_verify(did: str, body: VerifyInput, user: dict = Depends(require("developers", "edit"))):
    return await _update("developers", did, {"verified": body.verified})

@api.delete("/developers/{did}")
async def developers_delete(did: str, user: dict = Depends(require("developers", "delete"))):
    return await _delete("developers", did)

@api.get("/developers/projects")
async def projects_list(user: dict = Depends(require("developers")), developer_id: Optional[str] = None):
    q = {"developer_id": developer_id} if developer_id and developer_id != "all" else {}
    return await db.dev_projects.find(q, {"_id": 0}).sort("created_at", -1).to_list(2000)

@api.post("/developers/projects")
async def projects_create(body: ProjectInput, user: dict = Depends(require("developers", "create"))):
    d = body.model_dump()
    if d.get("status") not in PROJECT_STATUSES: d["status"] = "planning"
    d["developer_name"] = await _dev_name(body.developer_id)
    return await _create("dev_projects", d, user, "project")

@api.put("/developers/projects/{pid}")
async def projects_update(pid: str, body: ProjectInput, user: dict = Depends(require("developers", "edit"))):
    d = body.model_dump()
    if d.get("status") not in PROJECT_STATUSES: d["status"] = "planning"
    d["developer_name"] = await _dev_name(body.developer_id)
    return await _update("dev_projects", pid, d)

@api.delete("/developers/projects/{pid}")
async def projects_delete(pid: str, user: dict = Depends(require("developers", "delete"))):
    return await _delete("dev_projects", pid)


# ---- Property Owners ----
@api.get("/property-owners")
async def owners_list(user: dict = Depends(require("property_owners")), search: Optional[str] = None):
    q = {"$or": [{"name": {"$regex": search, "$options": "i"}}, {"email": {"$regex": search, "$options": "i"}}]} if search else {}
    rows = await db.property_owners.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)
    for r in rows:
        r["properties_count"] = await db.properties.count_documents({"owner_id": r["id"]})
    return rows

@api.post("/property-owners")
async def owners_create(body: OwnerInput, user: dict = Depends(require("property_owners", "create"))):
    return await _create("property_owners", {**body.model_dump(), "verified": False}, user, "property owner")

@api.put("/property-owners/{oid}")
async def owners_update(oid: str, body: OwnerInput, user: dict = Depends(require("property_owners", "edit"))):
    return await _update("property_owners", oid, body.model_dump())

@api.patch("/property-owners/{oid}/verify")
async def owners_verify(oid: str, body: VerifyInput, user: dict = Depends(require("property_owners", "edit"))):
    return await _update("property_owners", oid, {"verified": body.verified})

@api.delete("/property-owners/{oid}")
async def owners_delete(oid: str, user: dict = Depends(require("property_owners", "delete"))):
    await db.properties.update_many({"owner_id": oid}, {"$set": {"owner_id": None, "owner_name": ""}})
    return await _delete("property_owners", oid)

@api.get("/property-owners/{oid}/properties")
async def owner_properties(oid: str, user: dict = Depends(require("property_owners"))):
    return await db.properties.find({"owner_id": oid}, {"_id": 0}).sort("created_at", -1).to_list(500)

@api.patch("/property-owners/assign/{pid}")
async def assign_owner(pid: str, body: AssignOwnerInput, user: dict = Depends(require("property_owners", "edit"))):
    owner = await db.property_owners.find_one({"id": body.owner_id}, {"_id": 0, "name": 1})
    if not owner:
        raise HTTPException(status_code=404, detail="Owner not found")
    res = await db.properties.update_one({"id": pid}, {"$set": {"owner_id": body.owner_id, "owner_name": owner["name"]}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Property not found")
    return {"success": True}


@api.get("/public/developers")
async def pub_developers():
    return await db.developers.find({"verified": True}, {"_id": 0}).to_list(500)

@api.get("/public/projects")
async def pub_projects():
    return await db.dev_projects.find({"status": "selling"}, {"_id": 0}).sort("created_at", -1).to_list(200)


async def _seed_pipeline():
    if await db.app_meta.find_one({"key": "pipeline_version", "value": 1}):
        return
    import random
    cities = ["Lagos", "Abuja", "Accra", "Nairobi", "Kigali", "Cape Town"]
    first = ["Amara", "David", "Chinwe", "Kwame", "Zainab", "Tunde", "Fatima", "Emeka", "Lerato", "Kofi"]
    last = ["Okafor", "Mwangi", "Bello", "Mensah", "Adeyemi", "Dlamini", "Nwosu", "Osei", "Kamau", "Achebe"]
    firms = ["Skyline Developments", "Atlas Estates", "Horizon Group", "Cedar Properties", "Summit Builders", "Delta Realty"]

    devs = []
    for i in range(6):
        devs.append({"id": new_id(), "name": firms[i], "company": firms[i],
                     "email": f"contact@{firms[i].split()[0].lower()}.africa", "phone": f"+234 80{random.randint(10000000,99999999)}",
                     "city": random.choice(cities), "verified": random.random() > 0.35, "created_at": now_iso()})
    await db.developers.insert_many(devs)

    proj_img = "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?q=80&w=1200&auto=format&fit=crop"
    projects = []
    for i in range(11):
        d = random.choice(devs)
        st = random.choice(["planning", "selling", "selling", "sold_out", "completed"])
        projects.append({"id": new_id(), "developer_id": d["id"], "developer_name": d["name"],
                         "name": f"{random.choice(['The', 'Royal', 'Grand', 'Palm', 'Marina'])} {random.choice(['Heights', 'Residences', 'Court', 'Gardens', 'Towers'])}",
                         "city": random.choice(cities), "units": random.randint(12, 240),
                         "price_from": random.randint(25, 300) * 1000000, "status": st,
                         "completion_date": f"Q{random.randint(1,4)} 202{random.randint(6,9)}",
                         "image": proj_img, "created_at": now_iso()})
    await db.dev_projects.insert_many(projects)

    owners = []
    for i in range(12):
        fn, ln = random.choice(first), random.choice(last)
        owners.append({"id": new_id(), "name": f"{fn} {ln}", "email": f"{fn.lower()}.{ln.lower()}@owners.amass.africa",
                       "phone": f"+234 81{random.randint(10000000,99999999)}", "city": random.choice(cities),
                       "verified": random.random() > 0.4, "created_at": now_iso()})
    await db.property_owners.insert_many(owners)

    # link ~18 properties to owners
    props = await db.properties.find({}, {"_id": 0, "id": 1}).limit(18).to_list(18)
    for p in props:
        o = random.choice(owners)
        await db.properties.update_one({"id": p["id"]}, {"$set": {"owner_id": o["id"], "owner_name": o["name"]}})

    await db.app_meta.update_one({"key": "pipeline_version"}, {"$set": {"value": 1}}, upsert=True)
    logger.info("Seeded developers/owners pipeline")


# =====================================================================
# Payments (Paystack) — token bundles & subscription plans
# =====================================================================
PAYSTACK_SECRET = os.environ.get("PAYSTACK_SECRET_KEY")
PAYSTACK_BASE = "https://api.paystack.co"


class PaymentInit(BaseModel):
    email: str
    purpose: str          # token_bundle | subscription
    item_id: str


def _pk_init(email, kobo, metadata):
    r = requests.post(f"{PAYSTACK_BASE}/transaction/initialize",
                      headers={"Authorization": f"Bearer {PAYSTACK_SECRET}", "Content-Type": "application/json"},
                      json={"email": email, "amount": kobo, "metadata": metadata}, timeout=30)
    r.raise_for_status()
    return r.json()["data"]


def _pk_verify(reference):
    r = requests.get(f"{PAYSTACK_BASE}/transaction/verify/{reference}",
                     headers={"Authorization": f"Bearer {PAYSTACK_SECRET}"}, timeout=30)
    r.raise_for_status()
    return r.json()["data"]


async def _resolve_item(purpose, item_id):
    if purpose == "token_bundle":
        b = await db.token_bundles.find_one({"id": item_id}, {"_id": 0})
        if b:
            return b["price"], b["name"], b.get("tokens", 0)
    elif purpose == "subscription":
        p = await db.subscription_plans.find_one({"id": item_id}, {"_id": 0})
        if p:
            return p["price"], p["name"], 0
    return None


async def _do_initialize(body: PaymentInit):
    if not PAYSTACK_SECRET:
        raise HTTPException(status_code=503, detail="Paystack not configured")
    resolved = await _resolve_item(body.purpose, body.item_id)
    if not resolved:
        raise HTTPException(status_code=404, detail="Item not found")
    price, name, tokens = resolved
    if price <= 0:
        raise HTTPException(status_code=400, detail="This item is free — no payment required")
    meta = {"purpose": body.purpose, "item_id": body.item_id, "item_name": name, "tokens": tokens}
    data = await asyncio.get_event_loop().run_in_executor(None, _pk_init, body.email, price * 100, meta)
    txn = {"id": new_id(), "reference": data["reference"], "email": body.email, "purpose": body.purpose,
           "item_id": body.item_id, "item_name": name, "amount": price, "currency": "NGN",
           "status": "pending", "gateway": "paystack", "authorization_url": data["authorization_url"],
           "created_at": now_iso(), "verified_at": None}
    await db.transactions.insert_one(txn)
    return {"authorization_url": data["authorization_url"], "reference": data["reference"], "amount": price}


async def _do_verify(reference):
    data = await asyncio.get_event_loop().run_in_executor(None, _pk_verify, reference)
    status = "success" if data.get("status") == "success" else ("failed" if data.get("status") == "failed" else "pending")
    await db.transactions.update_one({"reference": reference},
                                     {"$set": {"status": status, "verified_at": now_iso()}})
    return {"reference": reference, "status": status}


@api.post("/payments/initialize")
async def payments_initialize(body: PaymentInit, user: dict = Depends(require("payments", "create"))):
    return await _do_initialize(body)


@api.get("/payments/verify/{reference}")
async def payments_verify(reference: str, user: dict = Depends(require("payments"))):
    return await _do_verify(reference)


@api.get("/transactions")
async def transactions_list(user: dict = Depends(require("transactions")),
                            status: Optional[str] = None, purpose: Optional[str] = None):
    q: Dict[str, Any] = {}
    if status and status != "all":
        q["status"] = status
    if purpose and purpose != "all":
        q["purpose"] = purpose
    return await db.transactions.find(q, {"_id": 0}).sort("created_at", -1).to_list(2000)


# Public (AMASS app users initiate purchases)
@api.post("/public/payments/initialize")
async def public_payments_initialize(body: PaymentInit):
    return await _do_initialize(body)


@api.get("/public/payments/verify/{reference}")
async def public_payments_verify(reference: str):
    return await _do_verify(reference)


# =====================================================================
# Seeding
# =====================================================================
EXT_VERSION = 1


async def seed_ext():
    await _seed_pipeline()
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
