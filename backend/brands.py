"""Brands — the Market → Brands section is brands-only.

  • Only an AMASS admin creates a brand (a `shop_retailers` doc) and its brand logins (`brand_accounts`).
  • Brand staff sign in on the dedicated Brand portal screen (not the normal app login) with a brand-scoped token
    (typ=brand) and can only add / update / hide products that belong to their own brand.
  • Regular users have no write access to brand products anywhere (the shop API is read-only for them).

Admin routes live under /api/admin/brands (app admin token). Brand routes live under /api/brand (brand token).
"""
from __future__ import annotations

import hashlib
import logging
import re
import secrets
import uuid
from datetime import timedelta
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr, Field

from admin_portal_commerce import new_product_doc, product_row, recount_retailer
from staff_auth import bearer, decode_scoped, hash_password, issue_scoped_token, norm_email, now, throttle_check, throttle_clear, throttle_fail, verify_password

logger = logging.getLogger("amass.brands")

INVITE_TTL_HOURS = 72
INVITE_RESEND_SECONDS = 60
GENERIC_FORGOT_MSG = "If a brand login exists for that email, a link to set a new password is on its way."


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _aware(dt):
    from datetime import timezone

    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _slug(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return s or uuid.uuid4().hex[:8]


def create_brand_doc(*, name: str, created_by: str, source: str = "admin", tagline: Optional[str] = None, logo_url: Optional[str] = None, categories: Optional[list[str]] = None, website: Optional[str] = None, phone: Optional[str] = None, whatsapp: Optional[str] = None, email: Optional[str] = None, accent: Optional[str] = None, published: bool = True) -> dict:
    t = now()
    return {
        "id": str(uuid.uuid4()), "slug": f"{_slug(name)}-{uuid.uuid4().hex[:4]}", "name": name.strip(), "short_name": name.strip(), "tagline": tagline, "logo": None, "logo_url": logo_url, "accent": accent or "#111111",
        "categories": categories or [], "brands": [name.strip()], "locations": [], "hours": None, "fulfilment": {}, "tags": [], "website": website, "shop_url": website, "phone": phone, "whatsapp": whatsapp, "email": email,
        "verification": {"status": "verified", "last_verified_at": t.date().isoformat(), "sources": [], "note": "Brand account managed by the brand through the AMASS Brand portal"},
        "product_count": 0, "deal_count": 0, "in_stock_count": 0, "checkout_connected": False, "sponsored": False, "published": published, "managed": True, "source": source, "created_by": created_by, "created_at": t, "updated_at": t,
    }


# ─── models ──────────────────────────────────────────────────────────────────
class BrandIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    tagline: Optional[str] = Field(None, max_length=140)
    logo_url: Optional[str] = None
    categories: list[str] = []
    website: Optional[str] = None
    phone: Optional[str] = None
    whatsapp: Optional[str] = None
    email: Optional[EmailStr] = None
    accent: Optional[str] = None
    published: bool = True


class BrandPatchIn(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=80)
    tagline: Optional[str] = Field(None, max_length=140)
    logo_url: Optional[str] = None
    categories: Optional[list[str]] = None
    website: Optional[str] = None
    phone: Optional[str] = None
    whatsapp: Optional[str] = None
    email: Optional[EmailStr] = None
    accent: Optional[str] = None
    published: Optional[bool] = None
    sponsored: Optional[bool] = None


class BrandAccountIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr


class BrandLoginIn(BaseModel):
    email: EmailStr
    password: str


class BrandForgotIn(BaseModel):
    email: EmailStr


class BrandSetPasswordIn(BaseModel):
    token: str = Field(min_length=20, max_length=200)
    password: str


class BrandChangePasswordIn(BaseModel):
    current_password: str
    new_password: str


class BrandProductIn(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    description: str = Field("", max_length=2000)
    category: str
    price: int = Field(ge=0)
    images: list[str] = []
    stock_status: Literal["in_stock", "out_of_stock", "preorder"] = "in_stock"
    published: bool = True
    promo_previous_price: Optional[int] = Field(None, ge=0)
    promo_label: Optional[str] = Field(None, max_length=60)


class BrandProductPatchIn(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=160)
    description: Optional[str] = Field(None, max_length=2000)
    category: Optional[str] = None
    price: Optional[int] = Field(None, ge=0)
    images: Optional[list[str]] = None
    stock_status: Optional[Literal["in_stock", "out_of_stock", "preorder"]] = None
    published: Optional[bool] = None
    promo_previous_price: Optional[int] = Field(None, ge=0)
    promo_label: Optional[str] = Field(None, max_length=60)
    clear_promo: bool = False


class UploadIn(BaseModel):
    data_url: str


def _account_public(a: dict) -> dict:
    inv = a.get("invite") or {}
    return {
        "id": a["id"], "name": a.get("name"), "email": a["email"], "brand_id": a["brand_id"], "disabled": bool(a.get("disabled")), "created_at": a.get("created_at"), "last_login_at": a.get("last_login_at"),
        "password_set": bool(a.get("password_hash")), "invite_sent_at": inv.get("sent_at"), "invite_expires_at": inv.get("expires_at"), "invite_kind": inv.get("kind"), "invite_error": a.get("invite_error"),
    }


def _brand_admin_view(r: dict, accounts: list[dict]) -> dict:
    from shop import logo_url

    return {"id": r["id"], "slug": r.get("slug"), "name": r["name"], "tagline": r.get("tagline"), "logo_url": logo_url(r), "accent": r.get("accent"), "categories": r.get("categories") or [], "website": r.get("website"), "phone": r.get("phone"), "whatsapp": r.get("whatsapp"), "email": r.get("email"), "published": bool(r.get("published")), "sponsored": bool(r.get("sponsored")), "managed": bool(r.get("managed")), "product_count": r.get("product_count", 0), "in_stock_count": r.get("in_stock_count", 0), "created_at": r.get("created_at"), "accounts": [_account_public(a) for a in accounts]}


def register_brand_routes(db, require_admin) -> tuple[APIRouter, APIRouter]:
    admin = APIRouter(prefix="/api/admin/brands", tags=["brands-admin"])
    brand = APIRouter(prefix="/api/brand", tags=["brand-portal"])

    async def _log(actor: str, action: str, target: Optional[str], **meta) -> None:
        await db.audit_log.insert_one({"id": str(uuid.uuid4()), "source": "brands", "actor_id": actor, "action": action, "target": target, "meta": meta, "at": now()})

    # ─── ADMIN: brands ───
    @admin.get("")
    async def list_brands(_admin: dict = Depends(require_admin)):
        rs = await db.shop_retailers.find({}, {"_id": 0}).sort("name", 1).to_list(500)
        accounts = await db.brand_accounts.find({}, {"_id": 0}).to_list(2000)
        by_brand: dict[str, list[dict]] = {}
        for a in accounts:
            by_brand.setdefault(a["brand_id"], []).append(a)
        return {"items": [_brand_admin_view(r, by_brand.get(r["id"], [])) for r in rs], "categories": __import__("shop").CATEGORIES}

    @admin.post("", status_code=201)
    async def create_brand(body: BrandIn, admin_user: dict = Depends(require_admin)):
        if await db.shop_retailers.find_one({"name": {"$regex": f"^{re.escape(body.name.strip())}$", "$options": "i"}}):
            raise HTTPException(409, "A brand with that name already exists")
        doc = create_brand_doc(name=body.name, created_by=admin_user["id"], tagline=body.tagline, logo_url=body.logo_url, categories=body.categories, website=body.website, phone=body.phone, whatsapp=body.whatsapp, email=str(body.email) if body.email else None, accent=body.accent, published=body.published)
        await db.shop_retailers.insert_one({**doc})
        await _log(admin_user["id"], f"created brand {doc['name']}", doc["id"])
        return _brand_admin_view(doc, [])

    @admin.patch("/{brand_id}")
    async def patch_brand(brand_id: str, body: BrandPatchIn, admin_user: dict = Depends(require_admin)):
        sets = {k: v for k, v in body.model_dump(exclude_none=True).items()}
        if "email" in sets:
            sets["email"] = str(sets["email"])
        if "name" in sets:
            sets["short_name"] = sets["name"]
        if "website" in sets:
            sets["shop_url"] = sets["website"]
        sets["updated_at"] = now()
        r = await db.shop_retailers.find_one_and_update({"id": brand_id}, {"$set": sets}, projection={"_id": 0}, return_document=True)
        if not r:
            raise HTTPException(404, "Brand not found")
        if "published" in sets and not sets["published"]:
            pass  # products stay but the retailer is hidden from the Market; brand logins keep working
        await _log(admin_user["id"], f"updated brand {r['name']}", brand_id, fields=list(sets))
        accounts = await db.brand_accounts.find({"brand_id": brand_id}, {"_id": 0}).to_list(50)
        return _brand_admin_view(r, accounts)

    # ─── invite / set-password links (email) ───
    async def _send_link(acc: dict, brand_name: str, kind: str) -> Optional[str]:
        """Issue a single-use set-password token, email it and return an error string (None on success)."""
        from auth_security import send_email
        from email_theme import button, p, render_email
        from public_url import public_api_base

        token = secrets.token_urlsafe(32)
        t = now()
        await db.brand_accounts.update_one({"id": acc["id"]}, {"$set": {"invite": {"token_hash": _token_hash(token), "kind": kind, "sent_at": t, "expires_at": t + timedelta(hours=INVITE_TTL_HOURS)}}, "$unset": {"invite_error": ""}})
        link = f"{public_api_base()}/brand/set-password?token={token}"
        first = (acc.get("name") or "there").split(" ")[0]
        if kind == "invite":
            subject = f"You're invited to manage {brand_name} on AMASS"
            html = render_email(
                title=f"Welcome to the AMASS Brand portal", kicker="Brand partner", hero="city", greeting=f"Hi {first},",
                preheader=f"Set up your {brand_name} brand login and start adding products to Market → Brands.",
                body_html=p(f"An AMASS admin has set up <strong>{brand_name}</strong> under Market → Brands and made you a brand manager.")
                + p("Tap the button to choose your own password. You'll then be able to add and update your products, photos, prices and stock — everything shoppers see in the AMASS app.")
                + button("Set my password", link)
                + p(f"This link is single-use and expires in {INVITE_TTL_HOURS} hours. If it has expired, ask your AMASS contact to send a new invite.", muted=True, size=13),
                note="The Brand portal is separate from an AMASS member account — sign in at the Brand sign in screen with this email.",
            )
        else:
            subject = f"Set a new password for your {brand_name} brand login"
            html = render_email(
                title="Set a new password", kicker="Brand portal · Account security", hero="night", greeting=f"Hi {first},",
                preheader=f"Choose a new password for your {brand_name} brand login on AMASS.",
                body_html=p(f"Someone asked to set a new password for the <strong>{brand_name}</strong> brand login on AMASS.")
                + button("Choose a new password", link)
                + p(f"The link works once and expires in {INVITE_TTL_HOURS} hours. If you didn't ask for this, you can ignore this email — your password won't change.", muted=True, size=13),
                note="For your security, AMASS will never ask you to share your password by reply.",
            )
        try:
            await send_email(to=acc["email"], subject=subject, html=html)
            return None
        except HTTPException as e:
            err = str(e.detail)
            if "can't receive email" in err:
                err = f"{acc['email']} can't receive email right now — share the link with them instead."
            await db.brand_accounts.update_one({"id": acc["id"]}, {"$set": {"invite_error": err, "invite.fallback_link": link}})
            logger.warning("brand %s email to %s failed: %s", kind, acc["email"], err)
            return err

    def _invite_result(fresh: dict, err: Optional[str]) -> dict:
        """When the email couldn't be delivered, hand the admin the link once so they can pass it on (WhatsApp etc.)."""
        out = {**_account_public(fresh), "email_sent": err is None, "email_error": err}
        if err:
            out["invite_link"] = (fresh.get("invite") or {}).get("fallback_link")
        return out

    # ─── ADMIN: brand logins ───
    @admin.post("/{brand_id}/accounts", status_code=201)
    async def create_account(brand_id: str, body: BrandAccountIn, admin_user: dict = Depends(require_admin)):
        r = await db.shop_retailers.find_one({"id": brand_id}, {"_id": 0, "name": 1})
        if not r:
            raise HTTPException(404, "Brand not found")
        email = norm_email(body.email)
        if await db.brand_accounts.find_one({"email": email}):
            raise HTTPException(409, "That email already has a brand login")
        doc = {"id": str(uuid.uuid4()), "brand_id": brand_id, "name": body.name.strip(), "email": email, "password_hash": None, "disabled": False, "created_by": admin_user["id"], "created_at": now()}
        await db.brand_accounts.insert_one({**doc})
        err = await _send_link(doc, r["name"], "invite")
        await _log(admin_user["id"], f"invited {email} to manage {r['name']}", doc["id"], email_sent=err is None)
        fresh = await db.brand_accounts.find_one({"id": doc["id"]}, {"_id": 0})
        return _invite_result(fresh, err)

    @admin.post("/{brand_id}/accounts/{account_id}/invite")
    async def resend_invite(brand_id: str, account_id: str, admin_user: dict = Depends(require_admin)):
        acc = await db.brand_accounts.find_one({"id": account_id, "brand_id": brand_id}, {"_id": 0})
        if not acc:
            raise HTTPException(404, "Brand login not found")
        r = await db.shop_retailers.find_one({"id": brand_id}, {"_id": 0, "name": 1})
        kind = "reset" if acc.get("password_hash") else "invite"
        err = await _send_link(acc, (r or {}).get("name") or "your brand", kind)
        await _log(admin_user["id"], f"re-sent a {kind} link to {acc['email']}", account_id, email_sent=err is None)
        fresh = await db.brand_accounts.find_one({"id": account_id}, {"_id": 0})
        return _invite_result(fresh, err)

    @admin.patch("/{brand_id}/accounts/{account_id}")
    async def toggle_account(brand_id: str, account_id: str, body: dict, admin_user: dict = Depends(require_admin)):
        if "disabled" not in body:
            raise HTTPException(400, "Send {disabled: true|false}")
        res = await db.brand_accounts.update_one({"id": account_id, "brand_id": brand_id}, {"$set": {"disabled": bool(body["disabled"]), "updated_at": now()}})
        if not res.matched_count:
            raise HTTPException(404, "Brand login not found")
        await _log(admin_user["id"], f"{'disabled' if body['disabled'] else 'enabled'} a brand login", account_id)
        return {"ok": True, "disabled": bool(body["disabled"])}

    @admin.delete("/{brand_id}/accounts/{account_id}")
    async def delete_account(brand_id: str, account_id: str, admin_user: dict = Depends(require_admin)):
        res = await db.brand_accounts.delete_one({"id": account_id, "brand_id": brand_id})
        if not res.deleted_count:
            raise HTTPException(404, "Brand login not found")
        await _log(admin_user["id"], "deleted a brand login", account_id)
        return {"ok": True}

    # ─── BRAND PORTAL: auth ───
    async def current_brand(creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer)) -> dict:
        payload = decode_scoped(creds, "brand")
        acc = await db.brand_accounts.find_one({"id": payload["sub"]}, {"_id": 0})
        if not acc or acc.get("disabled"):
            raise HTTPException(401, "Brand login unavailable")
        r = await db.shop_retailers.find_one({"id": acc["brand_id"]}, {"_id": 0})
        if not r:
            raise HTTPException(401, "Brand no longer exists")
        return {"account": acc, "brand": r}

    def _me(ctx: dict) -> dict:
        from shop import CATEGORIES, retailer_public

        return {"account": _account_public(ctx["account"]), "brand": {**retailer_public(ctx["brand"]), "published": bool(ctx["brand"].get("published"))}, "categories": CATEGORIES}

    @brand.post("/auth/login")
    async def brand_login(body: BrandLoginIn, request: Request):
        email = norm_email(body.email)
        await throttle_check(db, "brand", email)
        acc = await db.brand_accounts.find_one({"email": email}, {"_id": 0})
        if not acc or acc.get("disabled") or not verify_password(body.password, acc.get("password_hash")):
            if not acc:
                verify_password(body.password, None)
            await throttle_fail(db, "brand", email)
            raise HTTPException(401, "Invalid email or password")
        await throttle_clear(db, "brand", email)
        await db.brand_accounts.update_one({"id": acc["id"]}, {"$set": {"last_login_at": now(), "last_login_ip": request.client.host if request.client else None}})
        r = await db.shop_retailers.find_one({"id": acc["brand_id"]}, {"_id": 0})
        if not r:
            raise HTTPException(401, "Brand no longer exists")
        acc.pop("password_hash", None)
        return {"token": issue_scoped_token(acc["id"], "brand", brand_id=acc["brand_id"]), **_me({"account": acc, "brand": r})}

    @brand.post("/auth/forgot-password")
    async def brand_forgot_password(body: BrandForgotIn):
        """Enumeration-safe: same reply whether or not the login exists; resends throttled per account."""
        email = norm_email(body.email)
        acc = await db.brand_accounts.find_one({"email": email}, {"_id": 0})
        if acc and not acc.get("disabled"):
            last = (acc.get("invite") or {}).get("sent_at")
            if not last or (now() - _aware(last)).total_seconds() >= INVITE_RESEND_SECONDS:
                r = await db.shop_retailers.find_one({"id": acc["brand_id"]}, {"_id": 0, "name": 1})
                await _send_link(acc, (r or {}).get("name") or "your brand", "reset" if acc.get("password_hash") else "invite")
        return {"ok": True, "message": GENERIC_FORGOT_MSG}

    async def _account_for_token(token: str) -> dict:
        acc = await db.brand_accounts.find_one({"invite.token_hash": _token_hash(token)}, {"_id": 0, "password_hash": 0})
        if not acc or acc.get("disabled"):
            raise HTTPException(410, "This link is no longer valid. Ask AMASS for a new invite.")
        if now() > _aware(acc["invite"]["expires_at"]):
            raise HTTPException(410, "This link has expired. Ask AMASS for a new invite.")
        return acc

    @brand.get("/auth/invite/{token}")
    async def brand_invite_lookup(token: str):
        acc = await _account_for_token(token)
        r = await db.shop_retailers.find_one({"id": acc["brand_id"]}, {"_id": 0})
        from shop import logo_url

        return {"email": acc["email"], "name": acc.get("name"), "brand_name": (r or {}).get("name"), "brand_logo_url": logo_url(r) if r else None, "kind": acc["invite"].get("kind", "invite"), "expires_at": acc["invite"].get("expires_at")}

    @brand.post("/auth/set-password")
    async def brand_set_password(body: BrandSetPasswordIn, request: Request):
        acc = await _account_for_token(body.token)
        res = await db.brand_accounts.update_one(
            {"id": acc["id"], "invite.token_hash": _token_hash(body.token)},
            {"$set": {"password_hash": hash_password(body.password), "password_changed_at": now(), "last_login_at": now(), "last_login_ip": request.client.host if request.client else None}, "$unset": {"invite": "", "invite_error": ""}},
        )
        if not res.modified_count:
            raise HTTPException(410, "This link was already used. Ask AMASS for a new invite.")
        await throttle_clear(db, "brand", acc["email"])
        r = await db.shop_retailers.find_one({"id": acc["brand_id"]}, {"_id": 0})
        if not r:
            raise HTTPException(401, "Brand no longer exists")
        await _log(acc["id"], "set their brand login password", acc["id"])
        fresh = await db.brand_accounts.find_one({"id": acc["id"]}, {"_id": 0})
        return {"token": issue_scoped_token(acc["id"], "brand", brand_id=acc["brand_id"]), **_me({"account": fresh, "brand": r})}

    @brand.get("/me")
    async def brand_me(ctx: dict = Depends(current_brand)):
        return _me(ctx)

    @brand.post("/auth/change-password")
    async def brand_change_password(body: BrandChangePasswordIn, ctx: dict = Depends(current_brand)):
        doc = await db.brand_accounts.find_one({"id": ctx["account"]["id"]}, {"_id": 0, "password_hash": 1})
        if not verify_password(body.current_password, (doc or {}).get("password_hash")):
            raise HTTPException(400, "Current password is incorrect")
        await db.brand_accounts.update_one({"id": ctx["account"]["id"]}, {"$set": {"password_hash": hash_password(body.new_password), "password_changed_at": now()}})
        return {"ok": True}

    @brand.patch("/profile")
    async def brand_profile(body: BrandPatchIn, ctx: dict = Depends(current_brand)):
        allowed = {"tagline", "logo_url", "website", "phone", "whatsapp", "email", "accent"}
        sets = {k: (str(v) if k == "email" else v) for k, v in body.model_dump(exclude_none=True).items() if k in allowed}
        if not sets:
            raise HTTPException(400, "Nothing to update")
        if "website" in sets:
            sets["shop_url"] = sets["website"]
        sets["updated_at"] = now()
        r = await db.shop_retailers.find_one_and_update({"id": ctx["brand"]["id"]}, {"$set": sets}, projection={"_id": 0}, return_document=True)
        await _log(ctx["account"]["id"], "updated brand profile", r["id"], fields=list(sets))
        return _me({"account": ctx["account"], "brand": r})

    # ─── BRAND PORTAL: products (scoped to own brand) ───
    def _promo(previous_price: Optional[int], label: Optional[str], price: int) -> Optional[dict]:
        if previous_price and previous_price > price:
            return {"label": label or "Reduced price", "previous_price": previous_price, "expires_at": None, "terms": f"Price set by the brand on {now().date().isoformat()}", "source_url": None, "verified_at": now().date().isoformat()}
        return None

    def _brand_row(p: dict) -> dict:
        row = product_row(p)
        row.update({"name": p.get("name"), "category": p.get("category"), "published": bool(p.get("published")), "promo": p.get("promo"), "views": p.get("views", 0), "saves": p.get("saves", 0), "basket_adds": p.get("basket_adds", 0)})
        return row

    @brand.get("/products")
    async def brand_products(ctx: dict = Depends(current_brand)):
        docs = await db.shop_products.find({"retailer_id": ctx["brand"]["id"]}, {"_id": 0}).sort("updated_at", -1).to_list(1000)
        items = [_brand_row(p) for p in docs]
        return {"items": items, "count": len(items)}

    @brand.post("/products", status_code=201)
    async def brand_create_product(body: BrandProductIn, ctx: dict = Depends(current_brand)):
        from shop import CATEGORY_KEYS

        if body.category not in CATEGORY_KEYS:
            raise HTTPException(400, "Pick one of the Market categories")
        doc = new_product_doc(ctx["brand"], name=body.name, description=body.description, category=body.category, price=body.price, images=body.images, stock_status=body.stock_status, featured=False, published=body.published, source="brand_portal")
        doc["promo"] = _promo(body.promo_previous_price, body.promo_label, body.price)
        doc["created_by_account"] = ctx["account"]["id"]
        await db.shop_products.insert_one({**doc})
        await recount_retailer(db, ctx["brand"]["id"])
        await _log(ctx["account"]["id"], f"added product “{doc['name']}”", doc["id"])
        return _brand_row(doc)

    @brand.patch("/products/{pid}")
    async def brand_patch_product(pid: str, body: BrandProductPatchIn, ctx: dict = Depends(current_brand)):
        from shop import CATEGORY_KEYS

        p = await db.shop_products.find_one({"id": pid, "retailer_id": ctx["brand"]["id"]}, {"_id": 0})
        if not p:
            raise HTTPException(404, "Product not found for your brand")
        sets: dict = {"updated_at": now(), "last_verified_at": now()}
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
        if body.images is not None:
            sets["images"] = [i for i in body.images if i]
        if body.stock_status is not None:
            sets["stock"] = {"status": body.stock_status, "verified_at": now().date().isoformat()}
        if body.published is not None:
            sets["published"] = body.published
        if body.clear_promo:
            sets["promo"] = None
        elif body.promo_previous_price is not None:
            sets["promo"] = _promo(body.promo_previous_price, body.promo_label, int(body.price if body.price is not None else (p.get("price") or {}).get("amount") or 0))
        p = await db.shop_products.find_one_and_update({"id": pid}, {"$set": sets}, projection={"_id": 0}, return_document=True)
        await recount_retailer(db, ctx["brand"]["id"])
        await _log(ctx["account"]["id"], f"updated product “{p.get('name')}”", pid)
        return _brand_row(p)

    @brand.delete("/products/{pid}")
    async def brand_hide_product(pid: str, ctx: dict = Depends(current_brand)):
        p = await db.shop_products.find_one_and_update({"id": pid, "retailer_id": ctx["brand"]["id"]}, {"$set": {"published": False, "removed_at": now(), "removed_by_account": ctx["account"]["id"]}}, projection={"_id": 0}, return_document=True)
        if not p:
            raise HTTPException(404, "Product not found for your brand")
        await recount_retailer(db, ctx["brand"]["id"])
        await _log(ctx["account"]["id"], f"removed product “{p.get('name')}”", pid)
        return {"ok": True}

    @brand.post("/upload", status_code=201)
    async def brand_upload(body: UploadIn, ctx: dict = Depends(current_brand)):
        from object_storage import upload_photo_base64
        from public_url import public_api_base

        b64 = body.data_url.split(",", 1)[1] if body.data_url.startswith("data:") else body.data_url
        if int(len(b64) * 0.75) > 6 * 1024 * 1024:
            raise HTTPException(413, "Photo too large (max 6 MB)")
        path = await upload_photo_base64(f"brand-{ctx['brand']['id']}", body.data_url, public=True)
        return {"url": f"{public_api_base()}/api/public-files/{path}", "path": path}

    return admin, brand
