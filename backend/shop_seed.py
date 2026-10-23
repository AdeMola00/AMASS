"""Seeds the Lagos retailer catalogue snapshot (shop_seed_data.json) idempotently.

The JSON was compiled from each retailer's own storefront on the `last_verified_at` date it carries;
re-running never invents data — it only upserts the snapshot and recomputes counts. Retailer logos are
uploaded once to Emergent Object Storage (`amass/shop/logos/…`); the public `/api/shop/assets` route
serves them (falling back to the bundled file if storage is unavailable).
"""
from __future__ import annotations

import json
import logging
import os
import uuid
from datetime import datetime, timezone

logger = logging.getLogger("amass.shop")
DATA_PATH = os.path.join(os.path.dirname(__file__), "shop_seed_data.json")
LOGO_DIR = os.path.join(os.path.dirname(__file__), "assets", "shop_logos")
NS = uuid.UUID("7f1c2a4e-9b7d-4a0e-8c3b-2d5f6e7a8b9c")


def _sid(kind: str, key: str) -> str:
    return str(uuid.uuid5(NS, f"{kind}:{key}"))


def _date(s: str | None) -> datetime | None:
    return datetime.strptime(s, "%Y-%m-%d").replace(tzinfo=timezone.utc) if s else None


async def seed_shop(db) -> dict:
    with open(DATA_PATH, encoding="utf-8") as fh:
        data = json.load(fh)
    now = datetime.now(timezone.utc)
    rid_by_slug: dict[str, str] = {}
    for r in data["retailers"]:
        rid = _sid("retailer", r["slug"])
        rid_by_slug[r["slug"]] = rid
        doc = {**r, "id": rid, "published": True, "checkout_connected": False, "sponsored": False, "updated_at": now}
        doc["verification"] = {**r.get("verification", {}), "last_verified_at": r.get("verification", {}).get("last_verified_at")}
        await db.shop_retailers.update_one({"slug": r["slug"]}, {"$set": doc, "$setOnInsert": {"created_at": now}}, upsert=True)
    n_products = 0
    for p in data["products"]:
        rid = rid_by_slug[p["retailer_slug"]]
        retailer_name = next(r["name"] for r in data["retailers"] if r["slug"] == p["retailer_slug"])
        doc = {**p, "id": _sid("product", p["source_id"]), "retailer_id": rid, "retailer_name": retailer_name, "published": True, "sponsored": False,
               "last_verified_at": p.get("last_verified_at"), "updated_at": now}
        if doc.get("tags") and "bestseller" in doc["tags"]:
            doc.setdefault("popularity_seed", 1)
        await db.shop_products.update_one(
            {"source_id": p["source_id"]},
            {"$set": doc, "$setOnInsert": {"created_at": now, "views": 0, "saves": 0, "basket_adds": 0, "popularity_score": 1 if "bestseller" in (p.get("tags") or []) else 0}},
            upsert=True,
        )
        n_products += 1
    # counts per retailer (what the tiles/rows display)
    for slug, rid in rid_by_slug.items():
        total = await db.shop_products.count_documents({"retailer_id": rid, "published": True})
        deals = await db.shop_products.count_documents({"retailer_id": rid, "published": True, "promo": {"$ne": None}})
        in_stock = await db.shop_products.count_documents({"retailer_id": rid, "published": True, "stock.status": "in_stock"})
        await db.shop_retailers.update_one({"id": rid}, {"$set": {"product_count": total, "deal_count": deals, "in_stock_count": in_stock}})
    uploaded = await _upload_logos(db, data["retailers"])
    return {"retailers": len(rid_by_slug), "products": n_products, "logos_uploaded": uploaded}


async def _upload_logos(db, retailers: list[dict]) -> int:
    """Push each bundled logo PNG to object storage once (tracked in `shop_assets`)."""
    try:
        from object_storage import put_object
    except Exception:  # pragma: no cover
        return 0
    n = 0
    for r in retailers:
        name = r.get("logo")
        if not name:
            continue
        if await db.shop_assets.find_one({"name": name}):
            continue
        local = os.path.join(LOGO_DIR, name)
        if not os.path.exists(local):
            continue
        try:
            with open(local, "rb") as fh:
                await put_object(f"amass/shop/logos/{name}", fh.read(), "image/png")
            await db.shop_assets.insert_one({"name": name, "path": f"amass/shop/logos/{name}", "source": r.get("website"), "uploaded_at": datetime.now(timezone.utc)})
            n += 1
        except Exception as e:  # storage down → the public route serves the bundled file instead
            logger.warning("logo upload failed for %s: %s", name, e)
    return n
