"""AMASS Shop — the Brands section of the Market tab as a Lagos home-shopping experience.

Data honesty rules (enforced here, not just in the UI):
  • Every retailer/product carries `source_url` + `last_verified_at`; prices/stock/promos are read
    from the retailer's own storefront (see shop_seed.py) and never invented.
  • A promo (previous price / % off) is only shown when the retailer itself lists one; its `terms`
    always state whether an end date was published.
  • No retailer is connected for in-app checkout (`checkout_connected: false`) — the basket ends in a
    hand-off (official website / call / WhatsApp). Nothing here ever simulates an order or payment.
  • Property-marker monetisation (MASS unlocks) is untouched: this module never reads wallets.
"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field

from social_common import connection_ids, ensure, new_id, now, public_users

AMASS_DOMAIN = "https://amass.africa"
LOGO_DIR = os.path.join(os.path.dirname(__file__), "assets", "shop_logos")
LOGO_STORAGE_PREFIX = "amass/shop/logos/"

CATEGORIES = [
    {"key": "furniture", "label": "Furniture", "icon": "bed", "color": "#F59E0B"},
    {"key": "electronics", "label": "Electronics", "icon": "tv", "color": "#3B82F6"},
    {"key": "appliances", "label": "Appliances", "icon": "snow", "color": "#10B981"},
    {"key": "home_decor", "label": "Home décor", "icon": "color-palette", "color": "#EC4899"},
    {"key": "kitchen", "label": "Kitchen", "icon": "restaurant", "color": "#EF4444"},
    {"key": "lighting", "label": "Lighting", "icon": "bulb", "color": "#8B5CF6"},
]
CATEGORY_KEYS = {c["key"] for c in CATEGORIES}
CATEGORY_LABEL = {c["key"]: c["label"] for c in CATEGORIES}

PRODUCT_PUBLIC = {"_id": 0, "retailer_slug": 0, "source_id": 0}


# ─────────────────────────── projections ───────────────────────────
def logo_url(r: dict) -> Optional[str]:
    if r.get("logo_url"):  # brand-managed logos are absolute (object storage / CDN)
        return r["logo_url"]
    return f"/api/shop/assets/logos/{r['logo']}" if r.get("logo") else None


def purchase_routes(r: dict) -> list[dict]:
    """Where a shopper can actually buy — never an in-app checkout unless `checkout_connected`."""
    routes = []
    if r.get("shop_url") or r.get("website"):
        routes.append({"kind": "website", "label": f"Shop at {r.get('short_name') or r['name']}", "url": r.get("shop_url") or r.get("website")})
    if r.get("whatsapp"):
        digits = "".join(ch for ch in r["whatsapp"] if ch.isdigit())
        routes.append({"kind": "whatsapp", "label": "WhatsApp the store", "url": f"https://wa.me/{digits}"})
    if r.get("phone"):
        routes.append({"kind": "call", "label": "Call the store", "url": f"tel:{r['phone']}"})
    return routes


def retailer_brief(r: dict) -> dict:
    return {"id": r["id"], "slug": r["slug"], "name": r["name"], "short_name": r.get("short_name") or r["name"], "logo_url": logo_url(r), "accent": r.get("accent") or "#111111",
            "verification_status": (r.get("verification") or {}).get("status", "unverified")}


def retailer_public(r: dict) -> dict:
    locs = r.get("locations") or []
    ful = r.get("fulfilment") or {}
    lines = []
    for key, label in (("delivery", "Delivery"), ("pickup", "Pickup"), ("showroom", "Showroom"), ("installation", "Installation")):
        f = ful.get(key) or {}
        if f.get("available") is True:
            lines.append({"key": key, "label": label, "note": f.get("note"), "source": f.get("source"), "verified_at": f.get("verified_at")})
    return {
        **retailer_brief(r),
        "tagline": r.get("tagline"), "categories": r.get("categories") or [], "category_labels": [CATEGORY_LABEL.get(c, c) for c in (r.get("categories") or [])],
        "brands": r.get("brands") or [], "area": locs[0]["area"] if locs else "Lagos", "areas": sorted({l["area"] for l in locs if l.get("area")}),
        "locations": locs, "hours": r.get("hours"), "fulfilment": ful, "fulfilment_lines": lines,
        "tags": r.get("tags") or [], "verification": r.get("verification") or {}, "website": r.get("website"), "shop_url": r.get("shop_url"),
        "phone": r.get("phone"), "whatsapp": r.get("whatsapp"), "email": r.get("email"),
        "product_count": r.get("product_count", 0), "deal_count": r.get("deal_count", 0), "in_stock_count": r.get("in_stock_count", 0),
        "checkout_connected": bool(r.get("checkout_connected")), "purchase_routes": purchase_routes(r), "sponsored": bool(r.get("sponsored")),
        "badge": (r.get("tags") or [{}])[0].get("label") if r.get("tags") else None,
    }


def product_public(p: dict, retailer: Optional[dict]) -> dict:
    out = {k: v for k, v in p.items() if k not in ("_id", "retailer_slug", "source_id", "popularity_score")}
    out["retailer"] = retailer_brief(retailer) if retailer else None
    out["share_url"] = f"{AMASS_DOMAIN}/shop/product/{p['id']}"
    out["sponsored"] = bool(p.get("sponsored"))
    out.setdefault("tags", [])
    return out


# ─────────────────────────── models ───────────────────────────
class BasketAddIn(BaseModel):
    product_id: str
    qty: int = Field(1, ge=1, le=20)


class BasketQtyIn(BaseModel):
    qty: int = Field(ge=0, le=20)


class SaveToggleIn(BaseModel):
    kind: Literal["product", "store"]
    target_id: str


class HandoffIn(BaseModel):
    route: Literal["website", "call", "whatsapp"]
    product_id: Optional[str] = None


# ─────────────────────────── routes ───────────────────────────
def register_shop_routes(db, get_current_user, bearer, decode_user_id):
    router = APIRouter(prefix="/api/shop", tags=["shop"])
    _logo_cache: dict[str, tuple[bytes, str]] = {}

    async def optional_user(creds=Depends(bearer)) -> Optional[dict]:
        if not creds:
            return None
        uid = decode_user_id(creds.credentials)
        return await db.users.find_one({"id": uid}, {"_id": 0, "id": 1, "full_name": 1, "is_admin": 1}) if uid else None

    async def _retailers(published_only: bool = True) -> list[dict]:
        q = {"published": True} if published_only else {}
        return await db.shop_retailers.find(q, {"_id": 0}).sort([("sponsored", -1), ("product_count", -1), ("name", 1)]).to_list(200)

    async def _retailer_by_slug_or_id(key: str) -> dict:
        r = await db.shop_retailers.find_one({"$or": [{"slug": key}, {"id": key}], "published": True}, {"_id": 0})
        ensure(r is not None, 404, "Store not found")
        return r

    async def _user_state(user: Optional[dict], product_ids: list[str]) -> dict:
        """Saved flags, basket quantities and opted-in friend saves for a set of products."""
        state = {"saved": set(), "saved_stores": set(), "basket": {}, "friends": {}}
        if not user:
            return state
        saves = await db.shop_saves.find({"user_id": user["id"]}, {"_id": 0, "kind": 1, "target_id": 1}).to_list(2000)
        state["saved"] = {s["target_id"] for s in saves if s["kind"] == "product"}
        state["saved_stores"] = {s["target_id"] for s in saves if s["kind"] == "store"}
        async for b in db.shop_baskets.find({"user_id": user["id"]}, {"_id": 0, "items": 1}):
            for it in b.get("items", []):
                state["basket"][it["product_id"]] = it["qty"]
        if product_ids:
            conns = await connection_ids(db, user["id"])
            if conns:
                sharing = [p["user_id"] async for p in db.social_profiles.find({"user_id": {"$in": list(conns)}, "share_saves": True}, {"_id": 0, "user_id": 1})]
                if sharing:
                    rows = await db.shop_saves.aggregate([
                        {"$match": {"kind": "product", "target_id": {"$in": product_ids}, "user_id": {"$in": sharing}}},
                        {"$group": {"_id": "$target_id", "n": {"$sum": 1}, "users": {"$push": "$user_id"}}},
                    ]).to_list(len(product_ids))
                    users = await public_users(db, [u for r in rows for u in r["users"][:3]])
                    for r in rows:
                        state["friends"][r["_id"]] = {"count": int(r["n"]), "saved_by": [users[u] for u in r["users"][:3] if u in users]}
        return state

    def _decorate(products: list[dict], retailers_by_id: dict, state: dict) -> list[dict]:
        out = []
        for p in products:
            d = product_public(p, retailers_by_id.get(p["retailer_id"]))
            d["saved"] = p["id"] in state["saved"]
            d["in_basket_qty"] = state["basket"].get(p["id"], 0)
            fr = state["friends"].get(p["id"])
            d["friends_saved"] = fr["count"] if fr else 0
            d["friends"] = fr["saved_by"] if fr else []
            out.append(d)
        return out

    def _sort(products: list[dict], sort: str) -> list[dict]:
        def price(p):
            return p.get("price", {}).get("amount") or 0
        if sort == "price_asc":
            return sorted(products, key=lambda p: (p["price"].get("kind") == "on_request", price(p)))
        if sort == "price_desc":
            return sorted(products, key=lambda p: (p["price"].get("kind") == "on_request", -price(p)))
        if sort == "deals":
            return sorted(products, key=lambda p: (p.get("promo") is None, -(p.get("popularity_score") or 0)))
        if sort == "newest":
            return sorted(products, key=lambda p: ("new" not in (p.get("tags") or []), -(p.get("created_at") or now()).timestamp()))
        # relevance: in-stock first, then popularity, then has image
        return sorted(products, key=lambda p: (p["stock"].get("status") == "out_of_stock", -(p.get("popularity_score") or 0), not p.get("images")))

    def _product_query(category: Optional[str], q: Optional[str], retailer_id: Optional[str], deals: bool, in_stock: bool, brand: Optional[str]) -> dict:
        query: dict = {"published": True}
        if category:
            ensure(category in CATEGORY_KEYS, 400, "Unknown category")
            query["category"] = category
        if retailer_id:
            query["retailer_id"] = retailer_id
        if deals:
            query["promo"] = {"$ne": None}
        if in_stock:
            query["stock.status"] = "in_stock"
        if brand:
            query["brand"] = {"$regex": f"^{brand}$", "$options": "i"}
        if q and q.strip():
            import re as _re
            rx = {"$regex": _re.escape(q.strip()), "$options": "i"}
            query["$or"] = [{"name": rx}, {"brand": rx}, {"subcategory": rx}, {"description": rx}, {"retailer_name": rx}]
        return query

    # ─── public assets (logos) ───
    @router.get("/assets/logos/{name}")
    async def logo_asset(name: str):
        ensure("/" not in name and name.endswith(".png"), 400, "Bad asset")
        if name not in _logo_cache:
            data: Optional[bytes] = None
            try:
                from object_storage import get_object
                data, _ct = await get_object(LOGO_STORAGE_PREFIX + name)
            except Exception:
                data = None
            if data is None:
                local = os.path.join(LOGO_DIR, name)
                ensure(os.path.exists(local), 404, "Logo not found")
                with open(local, "rb") as fh:
                    data = fh.read()
            _logo_cache[name] = (data, "image/png")
        data, ct = _logo_cache[name]
        return Response(content=data, media_type=ct, headers={"Cache-Control": "public, max-age=86400"})

    # ─── home ───
    @router.get("/home")
    async def shop_home(user: Optional[dict] = Depends(optional_user)):
        retailers = await _retailers()
        rby = {r["id"]: r for r in retailers}
        products = await db.shop_products.find({"published": True}, {"_id": 0}).to_list(2000)
        state = await _user_state(user, [p["id"] for p in products])

        cat_counts = {c["key"]: 0 for c in CATEGORIES}
        for p in products:
            cat_counts[p["category"]] = cat_counts.get(p["category"], 0) + 1
        categories = [{**c, "count": cat_counts.get(c["key"], 0)} for c in CATEGORIES]

        # Filters only exist when the data behind them is real.
        deals = [p for p in products if p.get("promo")]
        filters = []
        if deals:
            filters.append({"key": "offers", "label": "Offers", "icon": "pricetag-outline", "count": len(deals)})
        for key, label, icon in (("delivery", "Delivery", "car-outline"), ("pickup", "Pickup", "bag-handle-outline"), ("showroom", "Showroom", "storefront-outline"), ("installation", "Installation", "construct-outline")):
            n = sum(1 for r in retailers if ((r.get("fulfilment") or {}).get(key) or {}).get("available") is True)
            if n:
                filters.append({"key": key, "label": label, "icon": icon, "count": n})
        n_w = sum(1 for r in retailers if any(t.get("key") == "warranty" for t in r.get("tags") or []))
        if n_w:
            filters.append({"key": "warranty", "label": "Verified warranty", "icon": "shield-checkmark-outline", "count": n_w})
        n_i = sum(1 for p in products if p["stock"].get("status") == "in_stock")
        if n_i:
            filters.append({"key": "in_stock", "label": "In stock", "icon": "checkmark-circle-outline", "count": n_i})

        popular = [p for p in products if p["stock"].get("status") != "out_of_stock" and p.get("images")]
        popular.sort(key=lambda p: (-(p.get("popularity_score") or 0), p["price"].get("kind") == "on_request", p["price"].get("amount") or 0))
        new = sorted([p for p in products if p.get("images")], key=lambda p: ("new" not in (p.get("tags") or []), -(p.get("created_at") or now()).timestamp()))
        furnish = [r for r in retailers if "furniture" in (r.get("categories") or [])]
        electronics = [r for r in retailers if "electronics" in (r.get("categories") or []) or "appliances" in (r.get("categories") or [])]

        sections = [
            {"key": "furnish", "kind": "retailers", "title": "Stores to help you furnish your home", "retailers": [retailer_public(r) for r in furnish]},
            {"key": "deals", "kind": "products", "title": "Deals in Lagos", "subtitle": "Only retailer-listed reductions — terms on each item", "products": _decorate(_sort(deals, "deals")[:12], rby, state), "see_all": "/shop/category/all?deals=1"},
            {"key": "popular", "kind": "products", "title": "Popular near you", "subtitle": "Most saved and basketed by AMASS shoppers", "products": _decorate(popular[:12], rby, state), "see_all": "/shop/category/all?sort=relevance"},
            {"key": "electronics", "kind": "retailers", "title": "Electronics & appliance stores", "retailers": [retailer_public(r) for r in electronics]},
            {"key": "new", "kind": "products", "title": "New arrivals", "subtitle": "Marked new by the retailer, then newest in our catalogue", "products": _decorate(new[:12], rby, state), "see_all": "/shop/category/all?sort=newest"},
        ]
        sections = [s for s in sections if (s.get("products") or s.get("retailers"))]

        banners = []
        if deals:
            top = max(deals, key=lambda p: ((p["promo"].get("previous_price") or 0) - (p["price"].get("amount") or 0)))
            banners.append({"key": "deals", "title": f"{len(deals)} verified price drops in Lagos", "body": "Reductions listed by the retailers themselves. Terms and the verification date are on every item.", "cta": "See deals", "route": "/shop/category/all?deals=1", "tone": "warning", "image": (top.get("images") or [None])[0]})
        banners.append({"key": "home-hub", "title": "Furnishing a home?", "body": "Keep receipts, warranties and what you bought for each room in My Home — reminders before a warranty runs out.", "cta": "Open My Home", "route": "/home/items", "tone": "brand", "image": None})
        orca = next((r for r in retailers if r["slug"] == "orca-deco"), None)
        if orca:
            banners.append({"key": "orca", "title": "ORCA Mall is open at Eko Atlantic", "body": "Furniture, décor and kitchenware under one roof. Catalogue not yet connected — visit or call the store.", "cta": "Store details", "route": "/shop/store/orca-deco", "tone": "info", "image": None})

        basket_count = sum(state["basket"].values())
        return {
            "area": "Lagos", "categories": categories, "filters": filters,
            "retailers": [retailer_public(r) for r in retailers], "retailer_total": len(retailers),
            "banners": banners, "sections": sections,
            "basket": {"count": basket_count, "retailers": len({p["retailer_id"] for p in products if state["basket"].get(p["id"])})},
            "saved": {"products": sorted(state["saved"]), "stores": sorted(state["saved_stores"])},
            "generated_at": now().isoformat(),
        }

    # ─── retailers ───
    @router.get("/retailers")
    async def list_retailers(category: Optional[str] = None, filter: Optional[str] = Query(None, alias="filter"), q: Optional[str] = None, user: Optional[dict] = Depends(optional_user)):
        rows = await _retailers()
        if category and category != "all":
            ensure(category in CATEGORY_KEYS, 400, "Unknown category")
            rows = [r for r in rows if category in (r.get("categories") or [])]
        if filter and filter != "all":
            if filter == "offers":
                rows = [r for r in rows if r.get("deal_count", 0) > 0]
            elif filter == "warranty":
                rows = [r for r in rows if any(t.get("key") == "warranty" for t in r.get("tags") or [])]
            elif filter in ("delivery", "pickup", "showroom", "installation"):
                rows = [r for r in rows if ((r.get("fulfilment") or {}).get(filter) or {}).get("available") is True]
            elif filter == "in_stock":
                rows = [r for r in rows if r.get("in_stock_count", 0) > 0]
        if q and q.strip():
            needle = q.strip().lower()
            rows = [r for r in rows if needle in r["name"].lower() or any(needle in b.lower() for b in r.get("brands") or []) or any(needle in CATEGORY_LABEL.get(c, c).lower() for c in r.get("categories") or [])]
        state = await _user_state(user, [])
        out = [retailer_public(r) for r in rows]
        for r in out:
            r["saved"] = r["id"] in state["saved_stores"]
        return {"retailers": out, "total": len(out), "area": "Lagos"}

    @router.get("/retailers/{key}")
    async def retailer_detail(key: str, user: Optional[dict] = Depends(optional_user)):
        r = await _retailer_by_slug_or_id(key)
        products = await db.shop_products.find({"retailer_id": r["id"], "published": True}, {"_id": 0}).to_list(1000)
        state = await _user_state(user, [p["id"] for p in products])
        cats = {}
        subs = {}
        for p in products:
            cats[p["category"]] = cats.get(p["category"], 0) + 1
            subs[p.get("subcategory") or "Other"] = subs.get(p.get("subcategory") or "Other", 0) + 1
        deals = [p for p in products if p.get("promo")]
        promotions = [{"product_id": p["id"], "label": p["promo"]["label"], "name": p["name"], "price": p["price"]["amount"], "previous_price": p["promo"].get("previous_price"), "terms": p["promo"].get("terms"), "expires_at": p["promo"].get("expires_at"), "verified_at": p["promo"].get("verified_at"), "source_url": p["promo"].get("source_url")} for p in deals]
        featured = _sort(products, "relevance")[:8]
        basket_items = [p for p in products if state["basket"].get(p["id"])]
        detail = retailer_public(r)
        detail["saved"] = r["id"] in state["saved_stores"]
        detail["product_categories"] = [{**c, "count": cats[c["key"]]} for c in CATEGORIES if c["key"] in cats]
        detail["subcategories"] = sorted(({"key": k, "label": k, "count": v} for k, v in subs.items()), key=lambda s: -s["count"])
        detail["promotions"] = promotions
        detail["featured"] = _decorate(featured, {r["id"]: r}, state)
        detail["basket"] = {"count": sum(state["basket"][p["id"]] for p in basket_items), "subtotal": sum((p["price"].get("amount") or 0) * state["basket"][p["id"]] for p in basket_items)}
        detail["fees_note"] = "Delivery and service charges are confirmed by the retailer at purchase — AMASS adds no fee."
        if detail["product_count"] == 0:
            detail["catalogue_note"] = "This store's catalogue is not connected yet. Visit the showroom or contact the store for products and prices."
        return detail

    @router.get("/retailers/{key}/products")
    async def retailer_products(key: str, category: Optional[str] = None, subcategory: Optional[str] = None, q: Optional[str] = None, sort: str = "relevance", deals: bool = False, in_stock: bool = False, user: Optional[dict] = Depends(optional_user)):
        r = await _retailer_by_slug_or_id(key)
        query = _product_query(category if category and category != "all" else None, q, r["id"], deals, in_stock, None)
        if subcategory:
            query["subcategory"] = subcategory
        products = await db.shop_products.find(query, {"_id": 0}).to_list(1000)
        state = await _user_state(user, [p["id"] for p in products])
        return {"retailer": retailer_brief(r), "products": _decorate(_sort(products, sort), {r["id"]: r}, state), "total": len(products)}

    # ─── products ───
    @router.get("/products")
    async def list_products(category: Optional[str] = None, q: Optional[str] = None, retailer: Optional[str] = None, brand: Optional[str] = None, sort: str = "relevance", deals: bool = False, in_stock: bool = False, limit: int = Query(200, le=500), user: Optional[dict] = Depends(optional_user)):
        retailer_id = None
        if retailer:
            retailer_id = (await _retailer_by_slug_or_id(retailer))["id"]
        query = _product_query(category if category and category != "all" else None, q, retailer_id, deals, in_stock, brand)
        products = await db.shop_products.find(query, {"_id": 0}).to_list(limit)
        retailers = await _retailers()
        rby = {r["id"]: r for r in retailers}
        state = await _user_state(user, [p["id"] for p in products])
        brands = sorted({p.get("brand") for p in products if p.get("brand")})
        used = sorted({p["retailer_id"] for p in products})
        return {"products": _decorate(_sort(products, sort), rby, state), "total": len(products), "brands": brands, "retailers": [retailer_brief(rby[i]) for i in used if i in rby],
                "category": {**next((c for c in CATEGORIES if c["key"] == category), {"key": "all", "label": "All products"})} if category else {"key": "all", "label": "All products"}}

    @router.get("/products/{product_id}")
    async def product_detail(product_id: str, user: Optional[dict] = Depends(optional_user)):
        p = await db.shop_products.find_one({"id": product_id, "published": True}, {"_id": 0})
        ensure(p is not None, 404, "Product not found")
        r = await db.shop_retailers.find_one({"id": p["retailer_id"]}, {"_id": 0})
        state = await _user_state(user, [p["id"]])
        await db.shop_products.update_one({"id": product_id}, {"$inc": {"views": 1, "popularity_score": 1}})
        d = _decorate([p], {r["id"]: r} if r else {}, state)[0]
        d["retailer_detail"] = retailer_public(r) if r else None
        routes = purchase_routes(r) if r else []
        if p.get("source_url"):
            routes = [{"kind": "website", "label": "View on retailer site", "url": p["source_url"]}] + [x for x in routes if x["kind"] != "website"]
        d["purchase_routes"] = routes
        if user:
            cids = [c["id"] async for c in db.shared_collections.find({"member_ids": user["id"]}, {"_id": 0, "id": 1})]
            if cids:
                in_lists = await db.collection_items.find({"collection_id": {"$in": cids}, "target_id": product_id}, {"_id": 0, "collection_id": 1}).to_list(50)
                colls = await db.shared_collections.find({"id": {"$in": [i["collection_id"] for i in in_lists]}}, {"_id": 0, "id": 1, "name": 1, "emoji": 1, "member_ids": 1}).to_list(50)
                d["in_lists"] = [{"id": c["id"], "name": c["name"], "emoji": c.get("emoji"), "shared": len(c.get("member_ids", [])) > 1} for c in colls]
        d.setdefault("in_lists", [])
        similar = await db.shop_products.find({"published": True, "id": {"$ne": product_id}, "$or": [{"subcategory": p.get("subcategory")}, {"category": p["category"], "retailer_id": p["retailer_id"]}]}, {"_id": 0}).to_list(40)
        retailers = await _retailers(); rby = {x["id"]: x for x in retailers}
        sstate = await _user_state(user, [s["id"] for s in similar])
        d["similar"] = _decorate(_sort(similar, "relevance")[:8], rby, sstate)
        return d

    # ─── search ───
    @router.get("/search")
    async def search(q: str = Query(min_length=1, max_length=60), user: Optional[dict] = Depends(optional_user)):
        retailers = await _retailers(); rby = {r["id"]: r for r in retailers}
        needle = q.strip().lower()
        stores = [retailer_public(r) for r in retailers if needle in r["name"].lower() or any(needle in b.lower() for b in r.get("brands") or [])]
        products = await db.shop_products.find(_product_query(None, q, None, False, False, None), {"_id": 0}).to_list(120)
        state = await _user_state(user, [p["id"] for p in products])
        brands = sorted({p["brand"] for p in products if p.get("brand") and needle in p["brand"].lower()})
        cats = [c for c in CATEGORIES if needle in c["label"].lower()]
        return {"q": q, "stores": stores, "brands": brands, "categories": cats, "products": _decorate(_sort(products, "relevance"), rby, state)}

    @router.get("/search/suggest")
    async def suggest(q: str = Query("", max_length=60)):
        needle = q.strip().lower()
        retailers = await _retailers()
        out = []
        if needle:
            out += [{"kind": "store", "label": r["name"], "slug": r["slug"]} for r in retailers if needle in r["name"].lower()][:3]
            out += [{"kind": "category", "label": c["label"], "key": c["key"]} for c in CATEGORIES if needle in c["label"].lower()][:2]
            brands = await db.shop_products.distinct("brand", {"published": True, "brand": {"$regex": needle, "$options": "i"}})
            out += [{"kind": "brand", "label": b} for b in sorted(brands)[:4]]
            subs = await db.shop_products.distinct("subcategory", {"published": True, "subcategory": {"$regex": needle, "$options": "i"}})
            out += [{"kind": "query", "label": s} for s in sorted(subs)[:4]]
        else:
            subs = await db.shop_products.aggregate([{"$match": {"published": True}}, {"$group": {"_id": "$subcategory", "n": {"$sum": 1}}}, {"$sort": {"n": -1}}, {"$limit": 8}]).to_list(8)
            out = [{"kind": "query", "label": s["_id"]} for s in subs if s["_id"]]
        return {"suggestions": out[:10]}

    # ─── social context (friend saves, opted-in only) ───
    @router.get("/context")
    async def context(ids: str = Query(..., max_length=2000), user: dict = Depends(get_current_user)):
        pids = [i for i in ids.split(",") if i][:100]
        state = await _user_state(user, pids)
        return {pid: {"friends_saved": state["friends"].get(pid, {}).get("count", 0), "saved_by": state["friends"].get(pid, {}).get("saved_by", []), "saved": pid in state["saved"], "in_basket_qty": state["basket"].get(pid, 0)} for pid in pids}

    # ─── saves ───
    @router.post("/saves/toggle")
    async def toggle_save(data: SaveToggleIn, user: dict = Depends(get_current_user)):
        coll = db.shop_products if data.kind == "product" else db.shop_retailers
        target = await coll.find_one({"id": data.target_id, "published": True}, {"_id": 0, "id": 1})
        ensure(target is not None, 404, "Not found")
        key = {"user_id": user["id"], "kind": data.kind, "target_id": data.target_id}
        existing = await db.shop_saves.find_one(key)
        if existing:
            await db.shop_saves.delete_one(key)
            if data.kind == "product":
                await db.shop_products.update_one({"id": data.target_id}, {"$inc": {"saves": -1, "popularity_score": -3}})
            return {"saved": False}
        await db.shop_saves.insert_one({**key, "id": new_id(), "created_at": now()})
        if data.kind == "product":
            await db.shop_products.update_one({"id": data.target_id}, {"$inc": {"saves": 1, "popularity_score": 3}})
        return {"saved": True}

    @router.get("/saves")
    async def list_saves(user: dict = Depends(get_current_user)):
        saves = await db.shop_saves.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
        pids = [s["target_id"] for s in saves if s["kind"] == "product"]
        sids = [s["target_id"] for s in saves if s["kind"] == "store"]
        products = await db.shop_products.find({"id": {"$in": pids}, "published": True}, {"_id": 0}).to_list(len(pids)) if pids else []
        retailers = await _retailers(); rby = {r["id"]: r for r in retailers}
        state = await _user_state(user, pids)
        order = {pid: i for i, pid in enumerate(pids)}
        products.sort(key=lambda p: order.get(p["id"], 0))
        stores = [retailer_public(rby[s]) for s in sids if s in rby]
        for s in stores:
            s["saved"] = True
        return {"products": _decorate(products, rby, state), "stores": stores}

    # ─── basket (per retailer; hand-off only) ───
    async def _basket_view(user: dict) -> dict:
        baskets = await db.shop_baskets.find({"user_id": user["id"]}, {"_id": 0}).to_list(50)
        pids = [it["product_id"] for b in baskets for it in b.get("items", [])]
        products = await db.shop_products.find({"id": {"$in": pids}}, {"_id": 0}).to_list(len(pids)) if pids else []
        pby = {p["id"]: p for p in products}
        retailers = await _retailers(False); rby = {r["id"]: r for r in retailers}
        state = await _user_state(user, pids)
        groups = []
        total_items = 0
        for b in baskets:
            r = rby.get(b["retailer_id"])
            if not r:
                continue
            items = []
            subtotal = 0
            unpriced = 0
            for it in b.get("items", []):
                p = pby.get(it["product_id"])
                if not p:
                    continue
                d = _decorate([p], rby, state)[0]
                amt = p["price"].get("amount") if p["price"].get("kind") in ("fixed", "from") else None
                line = (amt or 0) * it["qty"] if amt else None
                if line is None:
                    unpriced += 1
                else:
                    subtotal += line
                total_items += it["qty"]
                items.append({"product": d, "qty": it["qty"], "line_total": line, "added_at": it.get("added_at")})
            if not items:
                continue
            groups.append({
                "retailer": retailer_public(r), "items": items, "item_count": sum(i["qty"] for i in items), "subtotal": subtotal, "unpriced_count": unpriced,
                "has_from_prices": any(i["product"]["price"].get("kind") == "from" for i in items),
                "fees": None,  # no retailer has published a fee schedule we could verify → never invent one
                "fees_note": "Delivery, installation and service charges are confirmed by the retailer when you buy. AMASS adds no fee.",
                "purchase_routes": purchase_routes(r), "checkout_connected": bool(r.get("checkout_connected")),
                "updated_at": b.get("updated_at"),
            })
        groups.sort(key=lambda g: g["updated_at"] or now(), reverse=True)
        return {"groups": groups, "total_items": total_items, "retailer_count": len(groups)}

    @router.get("/basket")
    async def get_basket(user: dict = Depends(get_current_user)):
        return await _basket_view(user)

    @router.get("/basket/count")
    async def basket_count(user: dict = Depends(get_current_user)):
        n = 0
        async for b in db.shop_baskets.find({"user_id": user["id"]}, {"_id": 0, "items.qty": 1}):
            n += sum(i["qty"] for i in b.get("items", []))
        return {"count": n}

    @router.post("/basket/items")
    async def add_to_basket(data: BasketAddIn, user: dict = Depends(get_current_user)):
        p = await db.shop_products.find_one({"id": data.product_id, "published": True}, {"_id": 0})
        ensure(p is not None, 404, "Product not found")
        ensure(p["stock"].get("status") != "out_of_stock", 409, "This item is out of stock at the retailer")
        key = {"user_id": user["id"], "retailer_id": p["retailer_id"]}
        b = await db.shop_baskets.find_one(key, {"_id": 0})
        if not b:
            await db.shop_baskets.insert_one({**key, "id": new_id(), "items": [], "created_at": now(), "updated_at": now()})
            b = {"items": []}
        items = b.get("items", [])
        cur = next((i for i in items if i["product_id"] == data.product_id), None)
        if cur:
            cur["qty"] = min(20, cur["qty"] + data.qty)
        else:
            items.append({"product_id": data.product_id, "qty": data.qty, "added_at": now()})
        await db.shop_baskets.update_one(key, {"$set": {"items": items, "updated_at": now()}})
        await db.shop_products.update_one({"id": data.product_id}, {"$inc": {"basket_adds": 1, "popularity_score": 2}})
        qty = next(i["qty"] for i in items if i["product_id"] == data.product_id)
        n = 0
        async for bb in db.shop_baskets.find({"user_id": user["id"]}, {"_id": 0, "items.qty": 1}):
            n += sum(i["qty"] for i in bb.get("items", []))
        return {"ok": True, "qty": qty, "count": n, "retailer_id": p["retailer_id"]}

    @router.patch("/basket/items/{product_id}")
    async def set_basket_qty(product_id: str, data: BasketQtyIn, user: dict = Depends(get_current_user)):
        p = await db.shop_products.find_one({"id": product_id}, {"_id": 0, "retailer_id": 1})
        ensure(p is not None, 404, "Product not found")
        key = {"user_id": user["id"], "retailer_id": p["retailer_id"]}
        b = await db.shop_baskets.find_one(key, {"_id": 0})
        ensure(b is not None, 404, "Basket not found")
        items = [i for i in b.get("items", []) if i["product_id"] != product_id or data.qty > 0]
        for i in items:
            if i["product_id"] == product_id:
                i["qty"] = data.qty
        if items:
            await db.shop_baskets.update_one(key, {"$set": {"items": items, "updated_at": now()}})
        else:
            await db.shop_baskets.delete_one(key)
        return await _basket_view(user)

    @router.delete("/basket/retailer/{retailer_id}")
    async def clear_retailer_basket(retailer_id: str, user: dict = Depends(get_current_user)):
        await db.shop_baskets.delete_one({"user_id": user["id"], "retailer_id": retailer_id})
        return await _basket_view(user)

    @router.post("/basket/retailer/{retailer_id}/handoff")
    async def basket_handoff(retailer_id: str, data: HandoffIn, user: dict = Depends(get_current_user)):
        """Records that the shopper left for the retailer. Never creates an order."""
        r = await db.shop_retailers.find_one({"id": retailer_id}, {"_id": 0})
        ensure(r is not None, 404, "Store not found")
        route = next((x for x in purchase_routes(r) if x["kind"] == data.route), None)
        ensure(route is not None, 400, "That purchase route isn't available for this store")
        b = await db.shop_baskets.find_one({"user_id": user["id"], "retailer_id": retailer_id}, {"_id": 0, "items": 1})
        await db.shop_handoffs.insert_one({"id": new_id(), "user_id": user["id"], "retailer_id": retailer_id, "route": data.route, "product_id": data.product_id, "items": (b or {}).get("items", []), "created_at": now()})
        return {"ok": True, "url": route["url"], "label": route["label"], "note": "You're leaving AMASS to buy directly from the retailer. Prices, stock, delivery and warranty are confirmed by them."}

    return router


# ─────────────────────────── indexes ───────────────────────────
async def ensure_shop_indexes(db) -> None:
    await db.shop_retailers.create_index("id", unique=True)
    await db.shop_retailers.create_index("slug", unique=True)
    await db.shop_products.create_index("id", unique=True)
    await db.shop_products.create_index("source_id", unique=True)
    await db.shop_products.create_index([("retailer_id", 1), ("category", 1)])
    await db.shop_products.create_index([("published", 1), ("category", 1), ("stock.status", 1)])
    await db.shop_saves.create_index([("user_id", 1), ("kind", 1), ("target_id", 1)], unique=True)
    await db.shop_saves.create_index([("kind", 1), ("target_id", 1)])
    await db.shop_baskets.create_index([("user_id", 1), ("retailer_id", 1)], unique=True)
    await db.shop_handoffs.create_index([("retailer_id", 1), ("created_at", -1)])
