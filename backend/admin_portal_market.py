"""Admin Portal — Market management (the Market tab of the AMASS app) under /api/portal/market/*.

What a portal admin can manage here, and the permission module that gates it:
  • Brands (shop_retailers), brand logins, brand products, offers, images, Market banners,
    featured placement ............................................................ `brands`
  • FIXA service providers (applications, suspend / reinstate, reports) ............ `marketplace`
  • Declutter classifieds (user listings, reports) ................................. `marketplace`

Rules kept from the app: removing a brand / product / banner hides it (restorable); the only hard
delete is a brand *login* (explicit admin action, same as the in-app admin). Offers follow the shop's
data-honesty rule — a reduction is only shown when the previous price is really higher, and its terms
always say whether an end date was published. Every write goes to the portal audit log.
"""
from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field, field_validator

from admin_portal_commerce import new_product_doc, product_row, recount_retailer
from brands import BrandIn, BrandPatchIn, _account_public, _brand_admin_view, create_brand_account, create_brand_doc, resend_brand_link
from staff_auth import now

IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"}
MAX_IMAGE_BYTES = 8 * 1024 * 1024


def sniff_image(data: bytes) -> Optional[str]:
    """Content type from the bytes themselves (the browser's declared type is not trusted)."""
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if data[4:12] in (b"ftypavif", b"ftypavis"):
        return "image/avif"
    return None


# ─── models ──────────────────────────────────────────────────────────────────
class OfferIn(BaseModel):
    previous_price: int = Field(gt=0, description="The price before the reduction (NGN)")
    label: Optional[str] = Field(None, max_length=60)
    terms: Optional[str] = Field(None, max_length=300)
    expires_at: Optional[datetime] = None
    source_url: Optional[str] = Field(None, max_length=500)


class MarketProductIn(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    description: str = Field("", max_length=2000)
    category: str
    price: int = Field(ge=0)
    images: list[str] = []
    stock_status: Literal["in_stock", "out_of_stock", "preorder"] = "in_stock"
    published: bool = True
    featured: bool = False
    offer: Optional[OfferIn] = None


class MarketProductPatchIn(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=160)
    description: Optional[str] = Field(None, max_length=2000)
    category: Optional[str] = None
    price: Optional[int] = Field(None, ge=0)
    images: Optional[list[str]] = None
    stock_status: Optional[Literal["in_stock", "out_of_stock", "preorder"]] = None
    published: Optional[bool] = None
    featured: Optional[bool] = None


class FeaturedIn(BaseModel):
    featured: bool


class AccountIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: str


class DisabledIn(BaseModel):
    disabled: bool


class ImagesIn(BaseModel):
    images: list[str]


ROUTE_RX = re.compile(r"^(/[A-Za-z0-9_\-./?=&%+]*|https://[^\s]+)$")


def _check_route(v: Optional[str]) -> Optional[str]:
    """Only in-app paths (/shop/…) or https:// links — never javascript: or free text."""
    if v is None:
        return v
    v = v.strip()
    if not ROUTE_RX.match(v):
        raise ValueError("route must be an in-app path like /shop/category/lighting or an https:// link")
    return v


class BannerIn(BaseModel):
    title: str = Field(min_length=2, max_length=90)
    body: str = Field("", max_length=240)
    cta: str = Field("Open", min_length=1, max_length=30)
    route: str = Field("/shop/category/all", max_length=500, description="In-app route (e.g. /shop/store/<slug>) or https:// link")
    tone: Literal["brand", "info", "warning", "success"] = "info"
    image: Optional[str] = None
    order: int = 0
    active: bool = True
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None

    @field_validator("route")
    @classmethod
    def _route_ok(cls, v: str) -> str:
        return _check_route(v) or v


class BannerPatchIn(BaseModel):
    title: Optional[str] = Field(None, min_length=2, max_length=90)
    body: Optional[str] = Field(None, max_length=240)
    cta: Optional[str] = Field(None, min_length=1, max_length=30)
    route: Optional[str] = Field(None, max_length=500)

    @field_validator("route")
    @classmethod
    def _route_ok(cls, v: Optional[str]) -> Optional[str]:
        return _check_route(v)
    tone: Optional[Literal["brand", "info", "warning", "success"]] = None
    image: Optional[str] = None
    order: Optional[int] = None
    active: Optional[bool] = None
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    clear_schedule: bool = False


# ─── shapes ──────────────────────────────────────────────────────────────────
def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def offer_view(p: dict) -> Optional[dict]:
    promo = p.get("promo")
    if not promo:
        return None
    price = (p.get("price") or {}).get("amount") or 0
    prev = promo.get("previous_price") or 0
    exp = promo.get("expires_at")
    expired = False
    if exp:
        try:
            expired = _aware(datetime.fromisoformat(str(exp).replace("Z", "+00:00"))) < now()
        except ValueError:
            expired = False
    return {
        "label": promo.get("label"), "previous_price": prev, "price": price, "saving": max(prev - price, 0),
        "percent_off": round((prev - price) / prev * 100) if prev and prev > price else 0,
        "terms": promo.get("terms"), "expires_at": exp, "source_url": promo.get("source_url"), "verified_at": promo.get("verified_at"),
        "status": "hidden" if not p.get("published") else ("expired" if expired else "live"),
    }


def market_product_row(p: dict) -> dict:
    row = product_row(p)
    row.update({
        "name": p.get("name"), "category": p.get("category"), "brand_id": p.get("retailer_id"), "brand_name": p.get("retailer_name"),
        "published": bool(p.get("published")), "removed_at": p.get("removed_at"), "stock_status": (p.get("stock") or {}).get("status"),
        "offer": offer_view(p), "source": p.get("source"), "views": p.get("views", 0), "saves": p.get("saves", 0), "basket_adds": p.get("basket_adds", 0),
    })
    return row


def banner_row(b: dict) -> dict:
    from shop import banner_is_live

    return {**{k: v for k, v in b.items() if k != "_id"}, "live": banner_is_live(b), "archived": bool(b.get("archived_at"))}


def _build_offer(body: OfferIn, price: int, actor_name: str) -> dict:
    if body.previous_price <= price:
        raise HTTPException(400, f"The previous price must be higher than the current price (₦{price:,})")
    exp = _aware(body.expires_at)
    if exp and exp < now():
        raise HTTPException(400, "The end date is already in the past")
    today = now().date().isoformat()
    terms = (body.terms or "").strip() or (f"Offer listed by AMASS Admin on {today}" + (f" · ends {exp.date().isoformat()}" if exp else " · no end date published"))
    return {"label": (body.label or "").strip() or "Reduced price", "previous_price": body.previous_price, "expires_at": exp.isoformat() if exp else None, "terms": terms, "source_url": (body.source_url or "").strip() or None, "verified_at": today, "set_by": actor_name}


SCHEMA = [
    {"group": "overview", "permission": "brands", "endpoints": [["GET", "/market/overview", "Counts for every Market area"], ["GET", "/market/categories", "The six Market categories (keys + labels)"], ["GET", "/market/schema", "This list"]]},
    {"group": "brands", "permission": "brands", "endpoints": [
        ["GET", "/market/brands?search=&status=all|visible|hidden&sponsored=true", "List brands with logins + counts"],
        ["POST", "/market/brands", "Create a brand {name, tagline?, logo_url?, categories[], website?, phone?, whatsapp?, email?, accent?, published}"],
        ["GET", "/market/brands/{id}", "Brand detail with its products"],
        ["PATCH", "/market/brands/{id}", "Edit details / published / sponsored"],
        ["DELETE", "/market/brands/{id}", "Hide the brand from the Market (restorable)"],
        ["POST", "/market/brands/{id}/restore", "Show the brand again"],
        ["PATCH", "/market/brands/{id}/featured", "{featured} — pin the brand to the top of its sections"],
        ["POST", "/market/brands/{id}/logo", "multipart `file` → sets the brand logo"],
    ]},
    {"group": "brand logins", "permission": "brands", "endpoints": [
        ["GET", "/market/brands/{id}/accounts", "Brand logins"],
        ["POST", "/market/brands/{id}/accounts", "{name, email} → invite emailed (fallback `invite_link` when the email can't be delivered)"],
        ["POST", "/market/brands/{id}/accounts/{aid}/invite", "Re-send the invite / set-password link"],
        ["PATCH", "/market/brands/{id}/accounts/{aid}", "{disabled}"],
        ["DELETE", "/market/brands/{id}/accounts/{aid}", "Delete the login"],
    ]},
    {"group": "products", "permission": "brands", "endpoints": [
        ["GET", "/market/products?brand_id=&search=&status=all|visible|hidden&category=&offers=true&featured=true", "Catalogue"],
        ["POST", "/market/brands/{id}/products", "Add a product {name, description, category, price, images[], stock_status, published, featured, offer?}"],
        ["GET", "/market/products/{pid}", "Product"],
        ["PATCH", "/market/products/{pid}", "Edit (images[] replaces the list — use it to reorder / remove)"],
        ["DELETE", "/market/products/{pid}", "Hide the product (restorable)"],
        ["POST", "/market/products/{pid}/restore", "Show it again"],
        ["PATCH", "/market/products/{pid}/featured", "{featured}"],
        ["POST", "/market/products/{pid}/images", "multipart `file` → appends an image"],
        ["DELETE", "/market/products/{pid}/images?url=", "Remove one image"],
    ]},
    {"group": "offers", "permission": "brands", "endpoints": [
        ["GET", "/market/offers?status=live|expired|all&brand_id=", "Products with a price drop"],
        ["PUT", "/market/products/{pid}/offer", "{previous_price, label?, terms?, expires_at?, source_url?} — previous price must beat the current price"],
        ["DELETE", "/market/products/{pid}/offer", "End the offer"],
    ]},
    {"group": "featured", "permission": "brands", "endpoints": [["GET", "/market/featured", "Sponsored brands + featured products"]]},
    {"group": "banners", "permission": "brands", "endpoints": [
        ["GET", "/market/banners?include_archived=true", "Market home banners"],
        ["GET", "/market/banners/preview", "Exactly what the app shows right now"],
        ["POST", "/market/banners", "{title, body, cta, route, tone brand|info|warning|success, image?, order, active, starts_at?, ends_at?}"],
        ["PATCH", "/market/banners/{id}", "Edit / schedule / switch off (clear_schedule=true removes the window)"],
        ["DELETE", "/market/banners/{id}", "Archive (restorable)"],
        ["POST", "/market/banners/{id}/restore", "Un-archive"],
    ]},
    {"group": "images", "permission": "brands", "endpoints": [["POST", "/market/upload?folder=", "multipart `file` (≤ 8 MB image) → {url, path}"]]},
    {"group": "fixa", "permission": "marketplace", "endpoints": [
        ["GET", "/market/fixa/overview", "pending / verified / hidden / open reports"],
        ["GET", "/market/fixa/providers?status=pending|verified|rejected|suspended|hidden|all", "Providers"],
        ["POST", "/market/fixa/providers/{id}/approve", "{note?}"], ["POST", "/market/fixa/providers/{id}/reject", "{note?}"],
        ["POST", "/market/fixa/providers/{id}/suspend", "{note?}"], ["POST", "/market/fixa/providers/{id}/reinstate", ""],
        ["GET", "/market/fixa/reports?status=open|resolved|dismissed|all", "Reports"],
        ["POST", "/market/fixa/reports/{id}/resolve", "{outcome resolved|dismissed, note?, reinstate}"],
    ]},
    {"group": "declutter", "permission": "marketplace", "endpoints": [
        ["GET", "/market/declutter/listings?status=active|paused|sold|removed|all&q=&limit=", "User listings"],
        ["PATCH", "/market/declutter/listings/{id}", "{action pause_listing|restore_listing|remove_listing, note?}"],
        ["GET", "/market/declutter/reports?status=OPEN|RESOLVED|ALL", "Reports"],
        ["POST", "/market/declutter/reports/{id}/resolve", "{action dismiss|remove_listing|pause_listing|restore_listing, note?}"],
    ]},
]


def register_market_routes(db, require, audit) -> APIRouter:
    router = APIRouter(prefix="/market", tags=["portal-market"])

    def _actor(acc: dict) -> str:
        return acc.get("name") or acc.get("email") or "AMASS Admin"

    async def _brand(brand_id: str) -> dict:
        r = await db.shop_retailers.find_one({"id": brand_id}, {"_id": 0})
        if not r:
            raise HTTPException(404, "Brand not found")
        return r

    async def _brand_view(r: dict) -> dict:
        accounts = await db.brand_accounts.find({"brand_id": r["id"]}, {"_id": 0}).to_list(50)
        return {**_brand_admin_view(r, accounts), "deal_count": r.get("deal_count", 0), "hidden_at": r.get("hidden_at"), "source": r.get("source")}

    async def _product(pid: str) -> dict:
        p = await db.shop_products.find_one({"id": pid}, {"_id": 0})
        if not p:
            raise HTTPException(404, "Product not found")
        return p

    async def _upload_image(acc: dict, file: UploadFile, who: str) -> dict:
        from object_storage import upload_photo_bytes
        from public_url import public_api_base

        if (file.content_type or "") not in IMAGE_TYPES:
            raise HTTPException(415, "Upload a JPEG, PNG, WebP, GIF or AVIF image")
        data = await file.read()
        if len(data) > MAX_IMAGE_BYTES:
            raise HTTPException(413, "Image too large (max 8 MB)")
        kind = sniff_image(data)
        if not kind:
            raise HTTPException(415, "That file isn't a valid image")
        path = await upload_photo_bytes(who, data, kind, public=True)
        return {"url": f"{public_api_base()}/api/public-files/{path}", "path": path, "bytes": len(data), "content_type": kind, "name": file.filename}

    # ─── schema / overview ───
    @router.get("/schema")
    async def schema(acc: dict = Depends(require("brands", "view"))):
        return {"base": "/api/portal", "groups": SCHEMA}

    @router.get("/categories")
    async def categories(acc: dict = Depends(require("brands", "view"))):
        from shop import CATEGORIES

        return CATEGORIES

    @router.get("/overview")
    async def overview(acc: dict = Depends(require("brands", "view"))):
        from fixa import moderation_overview
        from shop import active_admin_banners

        brands_total = await db.shop_retailers.count_documents({})
        brands_visible = await db.shop_retailers.count_documents({"published": True})
        products_total = await db.shop_products.count_documents({})
        products_visible = await db.shop_products.count_documents({"published": True})
        offers = await db.shop_products.count_documents({"published": True, "promo": {"$ne": None}})
        featured = await db.shop_products.count_documents({"published": True, "sponsored": True})
        sponsored_brands = await db.shop_retailers.count_documents({"published": True, "sponsored": True})
        banners = await db.shop_banners.count_documents({"archived_at": None})
        return {
            "brands": {"total": brands_total, "visible": brands_visible, "hidden": brands_total - brands_visible, "sponsored": sponsored_brands},
            "products": {"total": products_total, "visible": products_visible, "hidden": products_total - products_visible, "offers": offers, "featured": featured},
            "banners": {"total": banners, "live": len(await active_admin_banners(db))},
            "fixa": await moderation_overview(db),
            "declutter": {
                "active": await db.marketplace.count_documents({"category": {"$ne": "services"}, "status": {"$nin": ["paused", "sold", "removed"]}}),
                "paused": await db.marketplace.count_documents({"category": {"$ne": "services"}, "status": "paused"}),
                "removed": await db.marketplace.count_documents({"category": {"$ne": "services"}, "status": "removed"}),
                "open_reports": await db.marketplace_reports.count_documents({"status": "OPEN"}),
            },
        }

    # ─── brands ───
    @router.get("/brands")
    async def list_brands(search: str = "", status: str = "all", sponsored: Optional[bool] = None, acc: dict = Depends(require("brands", "view"))):
        q: dict[str, Any] = {}
        if search.strip():
            q["$or"] = [{"name": {"$regex": re.escape(search.strip()), "$options": "i"}}, {"brands": {"$regex": re.escape(search.strip()), "$options": "i"}}]
        if status == "visible":
            q["published"] = True
        elif status == "hidden":
            q["published"] = {"$ne": True}
        if sponsored is not None:
            q["sponsored"] = sponsored
        rs = await db.shop_retailers.find(q, {"_id": 0}).sort([("sponsored", -1), ("name", 1)]).to_list(500)
        accounts = await db.brand_accounts.find({"brand_id": {"$in": [r["id"] for r in rs]}}, {"_id": 0}).to_list(2000)
        by_brand: dict[str, list[dict]] = {}
        for a in accounts:
            by_brand.setdefault(a["brand_id"], []).append(a)
        items = [{**_brand_admin_view(r, by_brand.get(r["id"], [])), "deal_count": r.get("deal_count", 0), "hidden_at": r.get("hidden_at"), "source": r.get("source")} for r in rs]
        return {"items": items, "count": len(items)}

    @router.post("/brands", status_code=201)
    async def create_brand(body: BrandIn, acc: dict = Depends(require("brands", "create"))):
        if await db.shop_retailers.find_one({"name": {"$regex": f"^{re.escape(body.name.strip())}$", "$options": "i"}}):
            raise HTTPException(409, "A brand with that name already exists")
        doc = create_brand_doc(name=body.name, created_by=acc["id"], source="admin_portal", tagline=body.tagline, logo_url=body.logo_url, categories=body.categories, website=body.website, phone=body.phone, whatsapp=body.whatsapp, email=str(body.email) if body.email else None, accent=body.accent, published=body.published)
        await db.shop_retailers.insert_one({**doc})
        await audit(acc, f"created brand “{doc['name']}” in the Market", doc["id"])
        return await _brand_view(doc)

    @router.get("/brands/{brand_id}")
    async def brand_detail(brand_id: str, acc: dict = Depends(require("brands", "view"))):
        r = await _brand(brand_id)
        products = await db.shop_products.find({"retailer_id": brand_id}, {"_id": 0}).sort("updated_at", -1).to_list(1000)
        return {**await _brand_view(r), "products": [market_product_row(p) for p in products]}

    @router.patch("/brands/{brand_id}")
    async def patch_brand(brand_id: str, body: BrandPatchIn, acc: dict = Depends(require("brands", "edit"))):
        sets = {k: v for k, v in body.model_dump(exclude_none=True).items()}
        if "email" in sets:
            sets["email"] = str(sets["email"])
        if "name" in sets:
            sets["name"] = sets["name"].strip()
            sets["short_name"] = sets["name"]
            dup = await db.shop_retailers.find_one({"id": {"$ne": brand_id}, "name": {"$regex": f"^{re.escape(sets['name'])}$", "$options": "i"}}, {"_id": 1})
            if dup:
                raise HTTPException(409, "A brand with that name already exists")
        if "website" in sets:
            sets["shop_url"] = sets["website"]
        if sets.get("published") is True:
            sets["hidden_at"] = None
        elif sets.get("published") is False:
            sets["hidden_at"] = now()
            sets["hidden_by"] = acc["id"]
        sets["updated_at"] = now()
        r = await db.shop_retailers.find_one_and_update({"id": brand_id}, {"$set": sets}, projection={"_id": 0}, return_document=True)
        if not r:
            raise HTTPException(404, "Brand not found")
        await audit(acc, f"updated brand “{r['name']}”", brand_id, fields=[k for k in sets if k != "updated_at"])
        return await _brand_view(r)

    @router.delete("/brands/{brand_id}")
    async def hide_brand(brand_id: str, acc: dict = Depends(require("brands", "delete"))):
        r = await db.shop_retailers.find_one_and_update({"id": brand_id}, {"$set": {"published": False, "hidden_at": now(), "hidden_by": acc["id"], "updated_at": now()}}, projection={"_id": 0}, return_document=True)
        if not r:
            raise HTTPException(404, "Brand not found")
        await audit(acc, f"hid brand “{r['name']}” from the Market", brand_id)
        return {"ok": True, "hidden": True, "brand": await _brand_view(r)}

    @router.post("/brands/{brand_id}/restore")
    async def restore_brand(brand_id: str, acc: dict = Depends(require("brands", "edit"))):
        r = await db.shop_retailers.find_one_and_update({"id": brand_id}, {"$set": {"published": True, "hidden_at": None, "updated_at": now()}}, projection={"_id": 0}, return_document=True)
        if not r:
            raise HTTPException(404, "Brand not found")
        await audit(acc, f"restored brand “{r['name']}” to the Market", brand_id)
        return await _brand_view(r)

    @router.patch("/brands/{brand_id}/featured")
    async def brand_featured(brand_id: str, body: FeaturedIn, acc: dict = Depends(require("brands", "edit"))):
        r = await db.shop_retailers.find_one_and_update({"id": brand_id}, {"$set": {"sponsored": body.featured, "updated_at": now()}}, projection={"_id": 0}, return_document=True)
        if not r:
            raise HTTPException(404, "Brand not found")
        await audit(acc, f"{'featured' if body.featured else 'un-featured'} brand “{r['name']}”", brand_id)
        return await _brand_view(r)

    @router.post("/brands/{brand_id}/logo", status_code=201)
    async def brand_logo(brand_id: str, file: UploadFile = File(...), acc: dict = Depends(require("brands", "edit"))):
        r = await _brand(brand_id)
        up = await _upload_image(acc, file, f"brand-{brand_id}")
        r = await db.shop_retailers.find_one_and_update({"id": brand_id}, {"$set": {"logo_url": up["url"], "updated_at": now()}}, projection={"_id": 0}, return_document=True)
        await audit(acc, f"changed the logo of “{r['name']}”", brand_id)
        return {**await _brand_view(r), "upload": up}

    # ─── brand logins ───
    @router.get("/brands/{brand_id}/accounts")
    async def brand_accounts(brand_id: str, acc: dict = Depends(require("brands", "view"))):
        await _brand(brand_id)
        rows = await db.brand_accounts.find({"brand_id": brand_id}, {"_id": 0}).sort("created_at", 1).to_list(50)
        return {"items": [_account_public(a) for a in rows], "count": len(rows)}

    @router.post("/brands/{brand_id}/accounts", status_code=201)
    async def invite_account(brand_id: str, body: AccountIn, acc: dict = Depends(require("brands", "create"))):
        if "@" not in body.email or "." not in body.email.split("@")[-1]:
            raise HTTPException(422, "Enter a valid email address")
        out = await create_brand_account(db, brand_id, body.name, body.email, acc["id"])
        await audit(acc, f"invited {out['email']} to manage “{out.pop('brand_name')}”", out["id"], email_sent=out["email_sent"])
        return out

    @router.post("/brands/{brand_id}/accounts/{account_id}/invite")
    async def reinvite_account(brand_id: str, account_id: str, acc: dict = Depends(require("brands", "edit"))):
        out = await resend_brand_link(db, brand_id, account_id)
        await audit(acc, f"re-sent a {out.pop('kind')} link to {out['email']}", account_id, email_sent=out["email_sent"])
        return out

    @router.patch("/brands/{brand_id}/accounts/{account_id}")
    async def toggle_account(brand_id: str, account_id: str, body: DisabledIn, acc: dict = Depends(require("brands", "edit"))):
        a = await db.brand_accounts.find_one_and_update({"id": account_id, "brand_id": brand_id}, {"$set": {"disabled": body.disabled, "updated_at": now()}}, projection={"_id": 0}, return_document=True)
        if not a:
            raise HTTPException(404, "Brand login not found")
        await audit(acc, f"{'disabled' if body.disabled else 'enabled'} brand login {a['email']}", account_id)
        return _account_public(a)

    @router.delete("/brands/{brand_id}/accounts/{account_id}")
    async def delete_account(brand_id: str, account_id: str, acc: dict = Depends(require("brands", "delete"))):
        a = await db.brand_accounts.find_one({"id": account_id, "brand_id": brand_id}, {"_id": 0, "email": 1})
        if not a:
            raise HTTPException(404, "Brand login not found")
        await db.brand_accounts.delete_one({"id": account_id, "brand_id": brand_id})
        await audit(acc, f"deleted brand login {a['email']}", account_id)
        return {"ok": True}

    # ─── products ───
    @router.get("/products")
    async def list_products(brand_id: Optional[str] = None, search: str = "", status: str = "all", category: Optional[str] = None, offers: Optional[bool] = None, featured: Optional[bool] = None, limit: int = Query(500, ge=1, le=2000), acc: dict = Depends(require("brands", "view"))):
        q: dict[str, Any] = {}
        if brand_id:
            q["retailer_id"] = brand_id
        if search.strip():
            rx = {"$regex": re.escape(search.strip()), "$options": "i"}
            q["$or"] = [{"name": rx}, {"brand": rx}, {"retailer_name": rx}]
        if status == "visible":
            q["published"] = True
        elif status == "hidden":
            q["published"] = {"$ne": True}
        if category:
            q["category"] = category
        if offers is not None:
            q["promo"] = {"$ne": None} if offers else None
        if featured is not None:
            q["sponsored"] = featured
        docs = await db.shop_products.find(q, {"_id": 0}).sort("updated_at", -1).to_list(limit)
        return {"items": [market_product_row(p) for p in docs], "count": len(docs)}

    @router.post("/brands/{brand_id}/products", status_code=201)
    async def add_product(brand_id: str, body: MarketProductIn, acc: dict = Depends(require("brands", "create"))):
        from shop import CATEGORY_KEYS

        r = await _brand(brand_id)
        if body.category not in CATEGORY_KEYS:
            raise HTTPException(400, "Pick one of the Market categories")
        doc = new_product_doc(r, name=body.name, description=body.description, category=body.category, price=body.price, images=body.images, stock_status=body.stock_status, featured=body.featured, published=body.published, source="admin_portal")
        if body.offer:
            doc["promo"] = _build_offer(body.offer, body.price, _actor(acc))
        await db.shop_products.insert_one({**doc})
        await recount_retailer(db, brand_id)
        await audit(acc, f"added product “{doc['name']}” for {r['name']}", doc["id"])
        return market_product_row(doc)

    @router.get("/products/{pid}")
    async def product_detail(pid: str, acc: dict = Depends(require("brands", "view"))):
        return market_product_row(await _product(pid))

    @router.patch("/products/{pid}")
    async def patch_product(pid: str, body: MarketProductPatchIn, acc: dict = Depends(require("brands", "edit"))):
        from shop import CATEGORY_KEYS

        p = await _product(pid)
        sets: dict[str, Any] = {"updated_at": now(), "last_verified_at": now()}
        if body.name is not None:
            sets["name"] = body.name.strip()
        if body.description is not None:
            sets["description"] = body.description.strip()
        if body.category is not None:
            if body.category not in CATEGORY_KEYS:
                raise HTTPException(400, "Pick one of the Market categories")
            sets["category"] = body.category
        if body.price is not None:
            sets["price.amount"] = int(body.price)
            sets["price.verified_at"] = now().date().isoformat()
            promo = p.get("promo")
            if promo and (promo.get("previous_price") or 0) <= int(body.price):
                sets["promo"] = None  # the reduction no longer holds — drop it rather than show a fake deal
        if body.images is not None:
            sets["images"] = [i for i in body.images if i]
        if body.stock_status is not None:
            sets["stock"] = {"status": body.stock_status, "verified_at": now().date().isoformat()}
        if body.published is not None:
            sets["published"] = body.published
            if body.published:
                sets["removed_at"] = None
        if body.featured is not None:
            sets["sponsored"] = body.featured
        p = await db.shop_products.find_one_and_update({"id": pid}, {"$set": sets}, projection={"_id": 0}, return_document=True)
        await recount_retailer(db, p["retailer_id"])
        await audit(acc, f"edited product “{p.get('name')}”", pid, fields=[k for k in sets if k not in ("updated_at", "last_verified_at")])
        return market_product_row(p)

    @router.delete("/products/{pid}")
    async def hide_product(pid: str, acc: dict = Depends(require("brands", "delete"))):
        p = await db.shop_products.find_one_and_update({"id": pid}, {"$set": {"published": False, "removed_at": now(), "removed_by": acc["id"], "updated_at": now()}}, projection={"_id": 0}, return_document=True)
        if not p:
            raise HTTPException(404, "Product not found")
        await recount_retailer(db, p["retailer_id"])
        await audit(acc, f"hid product “{p.get('name')}” from the Market", pid)
        return {"ok": True, "hidden": True, "product": market_product_row(p)}

    @router.post("/products/{pid}/restore")
    async def restore_product(pid: str, acc: dict = Depends(require("brands", "edit"))):
        p = await db.shop_products.find_one_and_update({"id": pid}, {"$set": {"published": True, "removed_at": None, "updated_at": now()}}, projection={"_id": 0}, return_document=True)
        if not p:
            raise HTTPException(404, "Product not found")
        await recount_retailer(db, p["retailer_id"])
        await audit(acc, f"restored product “{p.get('name')}” to the Market", pid)
        return market_product_row(p)

    @router.patch("/products/{pid}/featured")
    async def product_featured(pid: str, body: FeaturedIn, acc: dict = Depends(require("brands", "edit"))):
        p = await db.shop_products.find_one_and_update({"id": pid}, {"$set": {"sponsored": body.featured, "updated_at": now()}}, projection={"_id": 0}, return_document=True)
        if not p:
            raise HTTPException(404, "Product not found")
        await audit(acc, f"{'featured' if body.featured else 'un-featured'} product “{p.get('name')}”", pid)
        return market_product_row(p)

    @router.post("/products/{pid}/images", status_code=201)
    async def add_product_image(pid: str, file: UploadFile = File(...), acc: dict = Depends(require("brands", "edit"))):
        p = await _product(pid)
        up = await _upload_image(acc, file, f"brand-{p['retailer_id']}")
        p = await db.shop_products.find_one_and_update({"id": pid}, {"$push": {"images": up["url"]}, "$set": {"updated_at": now()}}, projection={"_id": 0}, return_document=True)
        await audit(acc, f"added a photo to “{p.get('name')}”", pid)
        return {**market_product_row(p), "upload": up}

    @router.delete("/products/{pid}/images")
    async def remove_product_image(pid: str, url: str, acc: dict = Depends(require("brands", "edit"))):
        p = await _product(pid)
        if url not in (p.get("images") or []):
            raise HTTPException(404, "That image isn't on this product")
        p = await db.shop_products.find_one_and_update({"id": pid}, {"$pull": {"images": url}, "$set": {"updated_at": now()}}, projection={"_id": 0}, return_document=True)
        await audit(acc, f"removed a photo from “{p.get('name')}”", pid)
        return market_product_row(p)

    # ─── offers (price drops) ───
    @router.get("/offers")
    async def list_offers(status: str = "live", brand_id: Optional[str] = None, acc: dict = Depends(require("brands", "view"))):
        q: dict[str, Any] = {"promo": {"$ne": None}}
        if brand_id:
            q["retailer_id"] = brand_id
        docs = await db.shop_products.find(q, {"_id": 0}).sort("updated_at", -1).to_list(2000)
        rows = [market_product_row(p) for p in docs]
        if status in ("live", "expired", "hidden"):
            rows = [r for r in rows if (r["offer"] or {}).get("status") == status]
        return {"items": rows, "count": len(rows)}

    @router.put("/products/{pid}/offer")
    async def set_offer(pid: str, body: OfferIn, acc: dict = Depends(require("brands", "edit"))):
        p = await _product(pid)
        price = int((p.get("price") or {}).get("amount") or 0)
        promo = _build_offer(body, price, _actor(acc))
        p = await db.shop_products.find_one_and_update({"id": pid}, {"$set": {"promo": promo, "updated_at": now(), "last_verified_at": now()}}, projection={"_id": 0}, return_document=True)
        await recount_retailer(db, p["retailer_id"])
        await audit(acc, f"set an offer on “{p.get('name')}” (₦{body.previous_price:,} → ₦{price:,})", pid)
        return market_product_row(p)

    @router.delete("/products/{pid}/offer")
    async def clear_offer(pid: str, acc: dict = Depends(require("brands", "edit"))):
        p = await db.shop_products.find_one_and_update({"id": pid}, {"$set": {"promo": None, "updated_at": now()}}, projection={"_id": 0}, return_document=True)
        if not p:
            raise HTTPException(404, "Product not found")
        await recount_retailer(db, p["retailer_id"])
        await audit(acc, f"ended the offer on “{p.get('name')}”", pid)
        return market_product_row(p)

    # ─── featured placement ───
    @router.get("/featured")
    async def featured(acc: dict = Depends(require("brands", "view"))):
        brands = await db.shop_retailers.find({"sponsored": True}, {"_id": 0}).sort("name", 1).to_list(100)
        products = await db.shop_products.find({"sponsored": True}, {"_id": 0}).sort("updated_at", -1).to_list(200)
        return {"brands": [await _brand_view(r) for r in brands], "products": [market_product_row(p) for p in products]}

    # ─── Market home banners ───
    @router.get("/banners")
    async def list_banners(include_archived: bool = False, acc: dict = Depends(require("brands", "view"))):
        q = {} if include_archived else {"archived_at": None}
        rows = await db.shop_banners.find(q, {"_id": 0}).sort([("order", 1), ("created_at", -1)]).to_list(100)
        return {"items": [banner_row(b) for b in rows], "count": len(rows)}

    @router.get("/banners/preview")
    async def preview_banners(acc: dict = Depends(require("brands", "view"))):
        from shop import active_admin_banners

        return {"items": await active_admin_banners(db)}

    @router.post("/banners", status_code=201)
    async def create_banner(body: BannerIn, acc: dict = Depends(require("brands", "create"))):
        s, e = _aware(body.starts_at), _aware(body.ends_at)
        if s and e and e <= s:
            raise HTTPException(400, "The end must be after the start")
        if e and e < now():
            raise HTTPException(400, "The end date is already in the past")
        doc = {"id": str(uuid.uuid4()), **body.model_dump(exclude={"starts_at", "ends_at"}), "starts_at": s, "ends_at": e, "archived_at": None, "created_by": acc["id"], "created_by_name": _actor(acc), "created_at": now(), "updated_at": now()}
        await db.shop_banners.insert_one({**doc})
        await audit(acc, f"added Market banner “{doc['title']}”", doc["id"])
        return banner_row(doc)

    @router.patch("/banners/{banner_id}")
    async def patch_banner(banner_id: str, body: BannerPatchIn, acc: dict = Depends(require("brands", "edit"))):
        sets = body.model_dump(exclude_none=True, exclude={"clear_schedule"})
        if "starts_at" in sets:
            sets["starts_at"] = _aware(sets["starts_at"])
        if "ends_at" in sets:
            sets["ends_at"] = _aware(sets["ends_at"])
        if body.clear_schedule:
            sets["starts_at"] = None
            sets["ends_at"] = None
        cur = await db.shop_banners.find_one({"id": banner_id}, {"_id": 0})
        if not cur:
            raise HTTPException(404, "Banner not found")
        s = sets.get("starts_at", cur.get("starts_at"))
        e = sets.get("ends_at", cur.get("ends_at"))
        if s and e and _aware(e) <= _aware(s):
            raise HTTPException(400, "The end must be after the start")
        sets["updated_at"] = now()
        b = await db.shop_banners.find_one_and_update({"id": banner_id}, {"$set": sets}, projection={"_id": 0}, return_document=True)
        await audit(acc, f"updated Market banner “{b['title']}”", banner_id, fields=[k for k in sets if k != "updated_at"])
        return banner_row(b)

    @router.delete("/banners/{banner_id}")
    async def archive_banner(banner_id: str, acc: dict = Depends(require("brands", "delete"))):
        b = await db.shop_banners.find_one_and_update({"id": banner_id}, {"$set": {"archived_at": now(), "active": False, "updated_at": now()}}, projection={"_id": 0}, return_document=True)
        if not b:
            raise HTTPException(404, "Banner not found")
        await audit(acc, f"archived Market banner “{b['title']}”", banner_id)
        return {"ok": True, "archived": True, "banner": banner_row(b)}

    @router.post("/banners/{banner_id}/restore")
    async def restore_banner(banner_id: str, acc: dict = Depends(require("brands", "edit"))):
        # Restore = bring it back: un-archive and switch it on again (archiving had switched it off).
        b = await db.shop_banners.find_one_and_update({"id": banner_id}, {"$set": {"archived_at": None, "active": True, "updated_at": now()}}, projection={"_id": 0}, return_document=True)
        if not b:
            raise HTTPException(404, "Banner not found")
        await audit(acc, f"restored Market banner “{b['title']}”", banner_id)
        return banner_row(b)

    # ─── images ───
    @router.post("/upload", status_code=201)
    async def upload(folder: str = "market", file: UploadFile = File(...), acc: dict = Depends(require("brands", "create"))):
        up = await _upload_image(acc, file, f"portal-{acc['id']}")
        doc = {"id": str(uuid.uuid4()), **up, "folder": folder, "uploaded_by": acc["id"], "created_at": now()}
        await db.portal_media.insert_one({**doc})
        return {k: v for k, v in doc.items() if k != "_id"}

    from admin_portal_market_moderation import register_market_moderation_routes

    router.include_router(register_market_moderation_routes(db, require, audit))
    return router
