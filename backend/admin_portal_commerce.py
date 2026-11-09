"""Admin Portal — Marketplace (brand products), Token Economy, Transactions, Payments.

Shapes match the portal's Marketplace / Token Economy / Transactions pages. Products are the real `shop_products`
shown under Market → Brands in the app; categories are the six built-in shop categories (custom ones are stored but
the app's filters only use the built-ins — reported). Token bundles merge the built-in catalogue with admin-added
ones (`token_bundles`), hidden built-ins are remembered in `runtime_state`.
"""
from __future__ import annotations

import uuid
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from staff_auth import now


class CategoryIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    slug: Optional[str] = None
    image: Optional[str] = None
    active: bool = True
    order: int = 0


class ProductIn(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    description: Optional[str] = ""
    category_id: Optional[str] = None
    price: float = 0
    images: list[str] = []
    seller: Optional[str] = "AMASS Home"
    stock: Optional[int] = None
    featured: bool = False
    status: Literal["active", "hidden"] = "active"


class ProductPatchIn(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category_id: Optional[str] = None
    price: Optional[float] = None
    images: Optional[list[str]] = None
    stock: Optional[int] = None
    featured: Optional[bool] = None
    status: Optional[Literal["active", "hidden"]] = None


class FlagsIn(BaseModel):
    featured: Optional[bool] = None
    status: Optional[Literal["active", "hidden"]] = None


class BundleIn(BaseModel):
    name: str
    tokens: int = Field(ge=1)
    price: int = Field(ge=0)
    bonus: int = 0


class RewardIn(BaseModel):
    action: str
    tokens: int = Field(ge=0)
    active: bool = True


class WalletAdjustIn(BaseModel):
    amount: int
    reason: str = "manual adjustment"


class GenericIn(BaseModel):
    model_config = {"extra": "allow"}


def product_row(p: dict) -> dict:
    from shop import CATEGORY_LABEL

    return {
        "id": p["id"], "title": p.get("name"), "description": p.get("description"), "category_id": p.get("category"),
        "category_name": CATEGORY_LABEL.get(p.get("category"), (p.get("category") or "").replace("_", " ").title()),
        "price": (p.get("price") or {}).get("amount") or 0, "images": p.get("images") or [], "seller": p.get("retailer_name"), "retailer_id": p.get("retailer_id"),
        "stock": 1 if (p.get("stock") or {}).get("status") == "in_stock" else 0, "stock_status": (p.get("stock") or {}).get("status"),
        "featured": bool(p.get("sponsored")), "status": "active" if p.get("published") else "hidden", "created_at": p.get("created_at"), "updated_at": p.get("updated_at"),
    }


def new_product_doc(retailer: dict, *, name: str, description: str, category: str, price: float, images: list[str], stock_status: str, featured: bool, published: bool, source: str) -> dict:
    t = now()
    pid = str(uuid.uuid4())
    return {
        "id": pid, "retailer_id": retailer["id"], "retailer_name": retailer["name"], "retailer_slug": retailer.get("slug"), "name": name.strip(), "brand": retailer.get("short_name") or retailer["name"],
        "category": category, "subcategory": None, "description": (description or "").strip(), "images": [i for i in images if i], "price": {"kind": "fixed", "amount": int(price), "currency": "NGN", "rrp": None, "source_url": None, "verified_at": t.date().isoformat()},
        "stock": {"status": stock_status, "verified_at": t.date().isoformat()}, "promo": None, "tags": [], "specs": {}, "spec": None, "variants": [], "warranty": None, "sku": None,
        "published": published, "sponsored": featured, "popularity": 0, "popularity_score": 0, "views": 0, "saves": 0, "basket_adds": 0, "source_id": f"{source}:{pid}", "source_url": None, "source": source,
        "created_at": t, "updated_at": t, "last_verified_at": t,
    }


async def recount_retailer(db, retailer_id: str) -> None:
    total = await db.shop_products.count_documents({"retailer_id": retailer_id, "published": True})
    deals = await db.shop_products.count_documents({"retailer_id": retailer_id, "published": True, "promo": {"$ne": None}})
    in_stock = await db.shop_products.count_documents({"retailer_id": retailer_id, "published": True, "stock.status": "in_stock"})
    await db.shop_retailers.update_one({"id": retailer_id}, {"$set": {"product_count": total, "deal_count": deals, "in_stock_count": in_stock, "updated_at": now()}})


def register_commerce_routes(db, require, audit) -> APIRouter:
    router = APIRouter()

    # ─── MARKETPLACE: categories ───
    @router.get("/marketplace/categories")
    async def categories(acc: dict = Depends(require("marketplace", "view"))):
        from shop import CATEGORIES

        custom = await db.shop_categories.find({}, {"_id": 0}).sort("order", 1).to_list(100)
        return [{"id": c["key"], "name": c["label"], "slug": c["key"], "image": None, "active": True, "order": i, "builtin": True} for i, c in enumerate(CATEGORIES)] + custom

    @router.post("/marketplace/categories", status_code=201)
    async def create_category(body: CategoryIn, acc: dict = Depends(require("marketplace", "create"))):
        slug = (body.slug or body.name).strip().lower().replace(" ", "_")
        from shop import CATEGORY_KEYS

        if slug in CATEGORY_KEYS or await db.shop_categories.find_one({"slug": slug}):
            raise HTTPException(409, "A category with that name already exists")
        doc = {"id": slug, "name": body.name.strip(), "slug": slug, "image": body.image, "active": body.active, "order": body.order, "builtin": False, "created_at": now()}
        await db.shop_categories.insert_one({**doc})
        await audit(acc, f"added marketplace category “{doc['name']}”", slug)
        return doc

    @router.delete("/marketplace/categories/{cat_id}")
    async def delete_category(cat_id: str, acc: dict = Depends(require("marketplace", "delete"))):
        from shop import CATEGORY_KEYS

        if cat_id in CATEGORY_KEYS:
            raise HTTPException(400, "Built-in categories are used by the app's filters and can't be deleted")
        await db.shop_categories.delete_one({"id": cat_id})
        await audit(acc, "deleted a marketplace category", cat_id)
        return {"ok": True}

    # ─── MARKETPLACE: products (brand products in Market → Brands) ───
    async def _retailer_for_seller(seller: Optional[str], acc: dict) -> dict:
        name = (seller or "AMASS Home").strip()
        r = await db.shop_retailers.find_one({"$or": [{"name": {"$regex": f"^{name}$", "$options": "i"}}, {"short_name": {"$regex": f"^{name}$", "$options": "i"}}]}, {"_id": 0})
        if r:
            return r
        from brands import create_brand_doc

        doc = create_brand_doc(name=name, created_by=acc["id"], source="admin_portal")
        await db.shop_retailers.insert_one({**doc})
        return doc

    @router.get("/marketplace/products")
    async def products(acc: dict = Depends(require("marketplace", "view"))):
        docs = await db.shop_products.find({}, {"_id": 0}).sort("updated_at", -1).to_list(2000)
        return [product_row(p) for p in docs]

    @router.post("/marketplace/products", status_code=201)
    async def create_product(body: ProductIn, acc: dict = Depends(require("marketplace", "create"))):
        from shop import CATEGORY_KEYS

        category = body.category_id if body.category_id in CATEGORY_KEYS or await db.shop_categories.find_one({"id": body.category_id}) else "home_decor"
        retailer = await _retailer_for_seller(body.seller, acc)
        doc = new_product_doc(retailer, name=body.title, description=body.description or "", category=category, price=body.price, images=body.images, stock_status="in_stock" if (body.stock is None or body.stock > 0) else "out_of_stock", featured=body.featured, published=body.status == "active", source="admin_portal")
        await db.shop_products.insert_one({**doc})
        await recount_retailer(db, retailer["id"])
        await audit(acc, f"added product “{doc['name']}” for {retailer['name']}", doc["id"])
        return product_row(doc)

    @router.patch("/marketplace/products/{pid}/flags")
    async def product_flags(pid: str, body: FlagsIn, acc: dict = Depends(require("marketplace", "edit"))):
        sets: dict[str, Any] = {"updated_at": now()}
        if body.featured is not None:
            sets["sponsored"] = body.featured
        if body.status is not None:
            sets["published"] = body.status == "active"
        p = await db.shop_products.find_one_and_update({"id": pid}, {"$set": sets}, projection={"_id": 0}, return_document=True)
        if not p:
            raise HTTPException(404, "Product not found")
        await recount_retailer(db, p["retailer_id"])
        await audit(acc, f"updated flags on product “{p.get('name')}”", pid, **{k: v for k, v in sets.items() if k != "updated_at"})
        return product_row(p)

    @router.patch("/marketplace/products/{pid}")
    async def product_patch(pid: str, body: ProductPatchIn, acc: dict = Depends(require("marketplace", "edit"))):
        sets: dict[str, Any] = {"updated_at": now()}
        if body.title is not None:
            sets["name"] = body.title.strip()
        if body.description is not None:
            sets["description"] = body.description.strip()
        if body.category_id is not None:
            sets["category"] = body.category_id
        if body.price is not None:
            sets["price.amount"] = int(body.price)
        if body.images is not None:
            sets["images"] = [i for i in body.images if i]
        if body.stock is not None:
            sets["stock.status"] = "in_stock" if body.stock > 0 else "out_of_stock"
        if body.featured is not None:
            sets["sponsored"] = body.featured
        if body.status is not None:
            sets["published"] = body.status == "active"
        p = await db.shop_products.find_one_and_update({"id": pid}, {"$set": sets}, projection={"_id": 0}, return_document=True)
        if not p:
            raise HTTPException(404, "Product not found")
        await recount_retailer(db, p["retailer_id"])
        await audit(acc, f"edited product “{p.get('name')}”", pid)
        return product_row(p)

    @router.delete("/marketplace/products/{pid}")
    async def product_delete(pid: str, acc: dict = Depends(require("marketplace", "delete"))):
        p = await db.shop_products.find_one_and_update({"id": pid}, {"$set": {"published": False, "removed_at": now(), "removed_by": acc["id"]}}, projection={"_id": 0}, return_document=True)
        if not p:
            raise HTTPException(404, "Product not found")
        await recount_retailer(db, p["retailer_id"])
        await audit(acc, f"removed product “{p.get('name')}” from the Market", pid)
        return {"ok": True, "hidden": True}

    # ─── MARKETPLACE: generic promotions / pricing-rules (portal-only records) ───
    for kind in ("promotions", "pricing-rules"):

        def _bind(k: str):
            @router.get(f"/marketplace/{k}")
            async def _list(acc: dict = Depends(require("marketplace", "view"))):
                return await db.portal_generic.find({"kind": k}, {"_id": 0}).sort("created_at", -1).to_list(200)

            @router.post(f"/marketplace/{k}", status_code=201)
            async def _create(body: GenericIn, acc: dict = Depends(require("marketplace", "create"))):
                doc = {"id": str(uuid.uuid4()), "kind": k, **body.model_dump(), "created_at": now(), "created_by": acc["id"]}
                await db.portal_generic.insert_one({**doc})
                await audit(acc, f"added a marketplace {k[:-1].replace('-', ' ')}", doc["id"])
                return doc

            @router.delete(f"/marketplace/{k}/{{item_id}}")
            async def _delete(item_id: str, acc: dict = Depends(require("marketplace", "delete"))):
                await db.portal_generic.delete_one({"id": item_id, "kind": k})
                return {"ok": True}

        _bind(kind)

    # ─── TOKENS ───
    @router.get("/tokens/bundles")
    async def bundles(acc: dict = Depends(require("tokens", "view"))):
        from tokens import effective_bundles

        return [{"id": b["id"], "name": b["name"], "tokens": b["tokens"], "price": b["price_ngn"], "bonus": b.get("bonus", 0), "builtin": b.get("builtin", False)} for b in await effective_bundles(db, include_hidden=True)]

    @router.post("/tokens/bundles", status_code=201)
    async def create_bundle(body: BundleIn, acc: dict = Depends(require("tokens", "create"))):
        bid = body.name.strip().lower().replace(" ", "_")[:40] or str(uuid.uuid4())[:8]
        if await db.token_bundles.find_one({"id": bid}):
            bid = f"{bid}_{str(uuid.uuid4())[:4]}"
        doc = {"id": bid, "name": body.name.strip(), "tokens": body.tokens, "bonus": body.bonus, "price_ngn": body.price, "active": True, "created_at": now(), "created_by": acc["id"]}
        await db.token_bundles.insert_one({**doc})
        await audit(acc, f"added token bundle “{doc['name']}”", bid)
        return {"id": bid, "name": doc["name"], "tokens": doc["tokens"], "price": doc["price_ngn"], "bonus": doc["bonus"]}

    @router.delete("/tokens/bundles/{bid}")
    async def delete_bundle(bid: str, acc: dict = Depends(require("tokens", "delete"))):
        from tokens import TOKEN_BUNDLES

        if any(b["id"] == bid for b in TOKEN_BUNDLES):
            await db.runtime_state.update_one({"key": "hidden_token_bundles"}, {"$addToSet": {"value": bid}}, upsert=True)
        else:
            await db.token_bundles.delete_one({"id": bid})
        await audit(acc, "removed a token bundle from the store", bid)
        return {"ok": True}

    @router.get("/tokens/plans")
    async def plans(acc: dict = Depends(require("tokens", "view"))):
        docs = await db.agent_plans.find({}, {"_id": 0}).to_list(50)
        return [{"id": p["id"], "name": p.get("name"), "price": p.get("monthly_price_ngn", 0), "interval": "month", "features": p.get("features") or [], "listing_limit": p.get("listing_limit")} for p in docs]

    @router.delete("/tokens/plans/{plan_id}")
    async def delete_plan(plan_id: str, acc: dict = Depends(require("tokens", "delete"))):
        raise HTTPException(400, "Agent plans have live subscribers — edit them under Admin → Agent plans in the app instead of deleting")

    @router.get("/tokens/rewards")
    async def rewards(acc: dict = Depends(require("tokens", "view"))):
        from earn_and_tools import TASK_REWARDS as EARN_ACTIONS

        custom = await db.earn_rewards.find({}, {"_id": 0}).to_list(100)
        return [{"id": k, "action": v["label"], "tokens": v["tokens"], "active": True, "builtin": True} for k, v in EARN_ACTIONS.items()] + custom

    @router.post("/tokens/rewards", status_code=201)
    async def create_reward(body: RewardIn, acc: dict = Depends(require("tokens", "create"))):
        doc = {"id": str(uuid.uuid4()), "action": body.action.strip(), "tokens": body.tokens, "active": body.active, "builtin": False, "created_at": now(), "created_by": acc["id"]}
        await db.earn_rewards.insert_one({**doc})
        await audit(acc, f"added reward “{doc['action']}” ({body.tokens} tokens)", doc["id"])
        return doc

    @router.delete("/tokens/rewards/{rid}")
    async def delete_reward(rid: str, acc: dict = Depends(require("tokens", "delete"))):
        from earn_and_tools import TASK_REWARDS as EARN_ACTIONS

        if rid in EARN_ACTIONS:
            raise HTTPException(400, "Built-in rewards are awarded automatically by the app and can't be deleted here")
        await db.earn_rewards.delete_one({"id": rid})
        return {"ok": True}

    @router.get("/tokens/wallets")
    async def wallets(search: str = "", acc: dict = Depends(require("tokens", "view"))):
        q: dict = {}
        if search.strip():
            rx = {"$regex": search.strip(), "$options": "i"}
            q["$or"] = [{"full_name": rx}, {"email": rx}]
        users = await db.users.find(q, {"_id": 0, "id": 1, "full_name": 1, "email": 1}).sort("created_at", -1).to_list(100)
        ws = {w["user_id"]: w for w in await db.wallets.find({"user_id": {"$in": [u["id"] for u in users]}, "currency": "MASS"}, {"_id": 0}).to_list(200)}
        return [{"id": u["id"], "user_name": u.get("full_name") or u.get("email"), "email": u.get("email"), "balance": int((ws.get(u["id"]) or {}).get("balance") or 0) + int((ws.get(u["id"]) or {}).get("bonus_balance") or 0)} for u in users]

    @router.patch("/tokens/wallets/{user_id}")
    async def adjust_wallet(user_id: str, body: WalletAdjustIn, acc: dict = Depends(require("tokens", "edit"))):
        from tokens import WalletService

        if body.amount == 0:
            raise HTTPException(400, "Amount can't be zero")
        svc = WalletService(db)
        if body.amount > 0:
            w = await svc.credit(user_id, body.amount, "adjustment", f"Admin adjustment: {body.reason}", meta={"admin_id": acc["id"], "source": "portal"})
        else:
            w = await svc.debit(user_id, -body.amount, "adjustment", f"Admin adjustment: {body.reason}", meta={"admin_id": acc["id"], "source": "portal"})
        await audit(acc, f"adjusted a wallet by {body.amount:+d} tokens ({body.reason})", user_id)
        return {"ok": True, "balance": int(w.get("balance") or 0) + int(w.get("bonus_balance") or 0)}

    # ─── TRANSACTIONS & PAYMENTS ───
    @router.get("/transactions")
    async def transactions(status: str = "all", purpose: str = "all", acc: dict = Depends(require("transactions", "view"))):
        rows = []
        for i in await db.payment_intents.find({}, {"_id": 0}).sort("created_at", -1).to_list(500):
            st = {"initialized": "pending", "pending": "pending", "success": "success", "paid": "success", "completed": "success", "failed": "failed", "abandoned": "failed"}.get(str(i.get("status") or "").lower(), str(i.get("status") or "pending"))
            rows.append({"id": i["reference"], "reference": i["reference"], "email": i.get("email"), "user_id": i.get("user_id"), "item_name": i.get("bundle_name") or i.get("bundle_id"), "amount": i.get("amount_ngn") or 0, "status": st, "purpose": "Token Bundle", "provider": i.get("provider"), "created_at": i.get("created_at")})
        for s in await db.agent_subscriptions.find({"payment_reference": {"$ne": None}}, {"_id": 0}).sort("created_at", -1).to_list(300):
            rows.append({"id": s.get("payment_reference") or s["id"], "reference": s.get("payment_reference") or s["id"], "email": None, "user_id": s.get("user_id"), "item_name": f"Agent plan · {s.get('plan_id')}", "amount": s.get("monthly_price_ngn") or 0, "status": "success" if s.get("status") == "active" else ("pending" if s.get("status") == "pending" else "failed"), "purpose": "Subscription", "provider": s.get("provider"), "created_at": s.get("created_at")})
        if status != "all":
            rows = [r for r in rows if r["status"] == status.lower()]
        if purpose != "all":
            rows = [r for r in rows if r["purpose"].lower().replace(" ", "_") == purpose.lower().replace(" ", "_")]
        rows.sort(key=lambda r: str(r.get("created_at") or ""), reverse=True)
        return rows[:500]

    @router.get("/payments/verify/{reference}")
    async def verify_payment(reference: str, acc: dict = Depends(require("payments", "view"))):
        ledger = await db.payment_ledger.find_one({"reference": reference}, {"_id": 0})
        intent = await db.payment_intents.find_one({"reference": reference}, {"_id": 0})
        if not ledger and not intent:
            raise HTTPException(404, "Unknown payment reference")
        return {"reference": reference, "status": "success" if ledger else (intent or {}).get("status", "pending"), "credited": bool(ledger), "amount": (ledger or intent or {}).get("amount_ngn"), "provider": (ledger or intent or {}).get("provider"), "mock": bool(((ledger or {}).get("verified") or {}).get("mock"))}

    return router
