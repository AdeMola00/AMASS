"""AMASS CMS + System Settings + Password Reset + Notifications + Expanded RBAC.

Adds five capability groups to the unified backend:

  1. CMS (`/api/cms/*` public GETs + `/api/admin/cms/*` writes)
     – Landing hero, stats, value props, marketplace teaser, CTA, feature flags
     – Marketplace categories on landing
     – Everything is a JSON doc in `db.cms_content` keyed by `key`.

  2. System Settings (`/api/admin/settings/*`)
     – Token bundles (MASS + FIX), subscription plans, FIX earn/spend rules
     – Overrides the defaults compiled into tokens.py.

  3. Password reset (`/api/auth/forgot`, `/api/auth/reset`)
     – Resend-powered email via Emergent-managed integration.

  4. Notifications broadcast (`/api/admin/notifications/broadcast`)
     – Send an in-app notification (persisted in `db.notifications`) to all users
       or a filtered subset (e.g. is_agent=true, city=Lagos).

  5. Expanded RBAC
     – `roles: List[str]` on users: super_admin, moderator, support, analyst.
     – Fine-grained gates for future features. Legacy `is_admin` still works.
"""
from __future__ import annotations

import os
import secrets
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List, Optional

import bcrypt
import httpx
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, EmailStr, Field

load_dotenv(Path(__file__).parent / ".env")
logger = logging.getLogger("amass.cms")

EMAIL_BASE_URL = "https://integrations.emergentagent.com"
EMAIL_KEY = os.environ.get("EMERGENT_EMAIL_KEY", "")
EMAIL_FROM_NAME = os.environ.get("EMAIL_FROM_NAME", "AMASS Africa")
APP_PUBLIC_URL = os.environ.get("APP_PUBLIC_URL", "https://amass.africa").rstrip("/")

# ─── Default CMS content (used to seed on first boot) ──────────────
DEFAULT_LANDING = {
    "key": "landing",
    "hero": {
        "eyebrow": "Africa's Property Operating System · Now unified across web & mobile",
        "title_line_1": "Discover, verify,",
        "title_line_2": "own it.",
        "title_line_2_accent": "own it",
        "subtitle": "One trusted network for African real estate — from Lagos duplexes and Abuja land to Nairobi apartments. Verified titles, AI-powered search, and a marketplace to actually make your home a home.",
        "search_placeholder": "Try “3 bed apartment in Lekki” or “land in Abeokuta”",
    },
    "stats": [
        {"n": "12,000+", "label": "Verified listings"},
        {"n": "850+", "label": "Certified agents"},
        {"n": "35+", "label": "Cities across Africa"},
        {"n": "₦4.2B", "label": "Transacted this quarter"},
    ],
    "value_props": [
        {"icon": "shield", "title": "Title-verified", "body": "Every AMASS-verified property has been cross-checked against land registries and mandate documents so you don't walk into surprises."},
        {"icon": "sparkles", "title": "AI that actually knows Africa", "body": "Search in plain English or Pidgin. Our AI understands neighborhoods, prices in ₦ and answers investment questions."},
        {"icon": "wallet", "title": "One wallet, everywhere", "body": "MASS unlocks premium property intel. FIX rewards verified service providers. Same balance in the app, the web, and the admin."},
    ],
    "marketplace_teaser": {
        "eyebrow": "AMASS Marketplace",
        "title": "After you find the house, we help you make it a home.",
        "body": "Furniture, construction materials, and vetted service pros through FIXA — bookable in-app with FIX tokens. Everything you need to move in, renovate, or rent out.",
        "images": [
            "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800",
            "https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=800",
            "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800",
            "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800",
        ],
    },
    "cta": {
        "title": "Ready to list, sell, or find your next place?",
        "body": "Join thousands of buyers, verified agents and homeowners already using AMASS across Nigeria, Kenya, Ghana and Rwanda.",
        "primary_label": "Create an account",
        "primary_href": "/register",
        "secondary_label": "Browse properties",
        "secondary_href": "/properties",
    },
    "feature_flags": {
        "show_neighborhoods": True,
        "show_marketplace_teaser": True,
        "show_featured": True,
        "show_ai_search": True,
    },
    "updated_at": None,
}


class LandingContent(BaseModel):
    hero: dict
    stats: list
    value_props: list
    marketplace_teaser: dict
    cta: dict
    feature_flags: dict
    updated_at: Optional[str] = None


class CmsUpdateIn(BaseModel):
    hero: Optional[dict] = None
    stats: Optional[list] = None
    value_props: Optional[list] = None
    marketplace_teaser: Optional[dict] = None
    cta: Optional[dict] = None
    feature_flags: Optional[dict] = None


class SettingsUpdateIn(BaseModel):
    key: str  # "token_bundles" | "fix_bundles" | "subscription_plans" | "fix_earn_rules" | "fix_spend_rules"
    value: list  # or dict


class ForgotIn(BaseModel):
    email: EmailStr


class ResetIn(BaseModel):
    token: str
    password: str = Field(min_length=6)


class BroadcastIn(BaseModel):
    title: str
    body: str
    audience: Optional[str] = "all"  # all | agents | customers | admin
    city: Optional[str] = None
    action_url: Optional[str] = None


class RolesUpdateIn(BaseModel):
    roles: List[str] = []  # subset of super_admin, moderator, support, analyst


VALID_ROLES = {"super_admin", "moderator", "support", "analyst"}


async def _send_email(to: str, subject: str, html: str) -> Optional[str]:
    """Fire an email via the Emergent-managed Resend proxy. Returns email id on
    success, None on failure. Never raises — password reset must still function
    (with logged reset link) if email fails."""
    if not EMAIL_KEY:
        logger.warning("EMERGENT_EMAIL_KEY not set — skipping email send")
        return None
    payload = {"to": [to], "subject": subject, "html": html, "from_name": EMAIL_FROM_NAME}
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{EMAIL_BASE_URL}/api/v1/email/send",
                headers={"X-Email-Key": EMAIL_KEY},
                json=payload,
            )
        resp.raise_for_status()
        try:
            return resp.json().get("id")
        except Exception:
            return "sent"
    except httpx.HTTPStatusError as e:
        logger.error(f"Email send failed: {e.response.status_code} {e.response.text}")
    except Exception as e:
        logger.error(f"Email send error: {e}")
    return None


def _reset_email_html(reset_url: str, name: str) -> str:
    return f"""<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
<tr><td style="padding:40px 40px 20px 40px;">
  <div style="display:inline-flex;align-items:center;gap:8px;">
    <div style="width:28px;height:28px;background:#E11B22;border-radius:6px;display:inline-block;"></div>
    <span style="font-size:22px;font-weight:600;color:#0A0A0A;font-family:Georgia,serif;">AMASS</span>
  </div>
</td></tr>
<tr><td style="padding:0 40px 20px 40px;">
  <h1 style="font-family:Georgia,serif;font-size:32px;color:#0A0A0A;margin:20px 0 12px 0;line-height:1.1;">Reset your password</h1>
  <p style="font-size:16px;color:#3F3F46;line-height:1.6;margin:0 0 20px 0;">Hi {name},</p>
  <p style="font-size:16px;color:#3F3F46;line-height:1.6;margin:0 0 24px 0;">Someone (hopefully you) asked to reset your AMASS account password. Click the button below to choose a new one. This link expires in 30 minutes.</p>
</td></tr>
<tr><td style="padding:0 40px 32px 40px;" align="center">
  <a href="{reset_url}" style="display:inline-block;background:#E11B22;color:#ffffff;font-weight:600;text-decoration:none;padding:14px 32px;border-radius:999px;font-size:15px;">Reset password</a>
</td></tr>
<tr><td style="padding:0 40px 32px 40px;">
  <p style="font-size:13px;color:#71717A;line-height:1.6;margin:0 0 8px 0;">If the button doesn't work, paste this URL into your browser:</p>
  <p style="font-size:12px;color:#71717A;word-break:break-all;margin:0 0 20px 0;"><a href="{reset_url}" style="color:#E11B22;">{reset_url}</a></p>
  <p style="font-size:13px;color:#71717A;line-height:1.6;margin:0;">Didn't request this? You can safely ignore this email — your password won't change.</p>
</td></tr>
<tr><td style="padding:24px 40px;border-top:1px solid #EEEEEE;background:#FAFAFA;">
  <p style="font-size:12px;color:#A1A1AA;margin:0;">AMASS Africa · One trusted network for African real estate</p>
</td></tr>
</table></td></tr></table></body></html>"""


def register_cms_routes(
    db: AsyncIOMotorDatabase,
    get_current_user,
    hash_password,
    create_token,
    user_to_out,
) -> APIRouter:
    router = APIRouter(prefix="/api", tags=["cms"])

    async def _seed_cms():
        existing = await db.cms_content.find_one({"key": "landing"})
        if not existing:
            doc = dict(DEFAULT_LANDING)
            doc["updated_at"] = datetime.now(timezone.utc).isoformat()
            await db.cms_content.insert_one(doc)

    async def _require_admin(user: dict) -> dict:
        from admin import _is_admin  # local import to avoid circular
        if not await _is_admin(user):
            raise HTTPException(403, "Admin access required")
        return user

    # ─── PUBLIC CMS ──────────────────────────────────────────
    @router.get("/cms/landing")
    async def get_landing():
        await _seed_cms()
        doc = await db.cms_content.find_one({"key": "landing"}, {"_id": 0, "key": 0})
        return doc or {}

    @router.get("/cms/{content_key}")
    async def get_cms(content_key: str):
        doc = await db.cms_content.find_one({"key": content_key}, {"_id": 0, "key": 0})
        if not doc:
            raise HTTPException(404, "Content not found")
        return doc

    # ─── ADMIN CMS ──────────────────────────────────────────
    @router.get("/admin/cms/landing")
    async def admin_get_landing(user: dict = Depends(get_current_user)):
        await _require_admin(user)
        await _seed_cms()
        doc = await db.cms_content.find_one({"key": "landing"}, {"_id": 0})
        return doc

    @router.patch("/admin/cms/landing")
    async def admin_update_landing(data: CmsUpdateIn, user: dict = Depends(get_current_user)):
        await _require_admin(user)
        update = {k: v for k, v in data.model_dump().items() if v is not None}
        update["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.cms_content.update_one(
            {"key": "landing"},
            {"$set": update, "$setOnInsert": {"key": "landing"}},
            upsert=True,
        )
        await db.audit_log.insert_one({
            "actor_id": user["id"], "actor_email": user["email"],
            "action": "cms_update_landing", "target_id": "landing",
            "meta": {"fields": list(update.keys())},
            "created_at": datetime.now(timezone.utc),
        })
        doc = await db.cms_content.find_one({"key": "landing"}, {"_id": 0})
        return doc

    @router.post("/admin/cms/landing/reset")
    async def admin_reset_landing(user: dict = Depends(get_current_user)):
        await _require_admin(user)
        doc = dict(DEFAULT_LANDING)
        doc["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.cms_content.update_one({"key": "landing"}, {"$set": doc}, upsert=True)
        await db.audit_log.insert_one({
            "actor_id": user["id"], "actor_email": user["email"],
            "action": "cms_reset_landing", "target_id": "landing",
            "created_at": datetime.now(timezone.utc),
        })
        return {"ok": True, "content": {k: v for k, v in doc.items() if k != "key"}}

    # ─── ADMIN SYSTEM SETTINGS ──────────────────────────────
    @router.get("/admin/settings")
    async def admin_list_settings(user: dict = Depends(get_current_user)):
        await _require_admin(user)
        from tokens import TOKEN_BUNDLES, FIX_BUNDLES, SUBSCRIPTION_PLANS, FIX_EARN_RULES, FIX_SPEND_RULES
        overrides = {d["key"]: d["value"] async for d in db.system_settings.find({}, {"_id": 0})}
        return {
            "token_bundles": overrides.get("token_bundles", TOKEN_BUNDLES),
            "fix_bundles": overrides.get("fix_bundles", FIX_BUNDLES),
            "subscription_plans": overrides.get("subscription_plans", SUBSCRIPTION_PLANS),
            "fix_earn_rules": overrides.get("fix_earn_rules", [
                {"event": k, "amount": v["amount"], "description": v["description"]}
                for k, v in FIX_EARN_RULES.items()
            ]),
            "fix_spend_rules": overrides.get("fix_spend_rules", [
                {"action": k, "amount": v["amount"], "description": v["description"]}
                for k, v in FIX_SPEND_RULES.items()
            ]),
        }

    @router.put("/admin/settings")
    async def admin_update_settings(data: SettingsUpdateIn, user: dict = Depends(get_current_user)):
        await _require_admin(user)
        if data.key not in {"token_bundles", "fix_bundles", "subscription_plans", "fix_earn_rules", "fix_spend_rules"}:
            raise HTTPException(400, "Invalid settings key")
        await db.system_settings.update_one(
            {"key": data.key},
            {"$set": {"key": data.key, "value": data.value, "updated_at": datetime.now(timezone.utc)}},
            upsert=True,
        )
        await db.audit_log.insert_one({
            "actor_id": user["id"], "actor_email": user["email"],
            "action": "settings_update", "target_id": data.key,
            "meta": {"item_count": len(data.value) if isinstance(data.value, list) else 1},
            "created_at": datetime.now(timezone.utc),
        })
        return {"ok": True, "key": data.key}

    # ─── NOTIFICATIONS BROADCAST ────────────────────────────
    @router.post("/admin/notifications/broadcast")
    async def admin_broadcast(data: BroadcastIn, user: dict = Depends(get_current_user)):
        await _require_admin(user)
        query: dict = {}
        if data.audience == "agents":
            query["is_agent"] = True
        elif data.audience == "customers":
            query["is_agent"] = {"$ne": True}
        elif data.audience == "admin":
            query["$or"] = [{"is_admin": True}, {"email": {"$in": os.environ.get("ADMIN_EMAILS", "").split(",")}}]
        if data.city:
            query["city"] = {"$regex": data.city, "$options": "i"}
        recipients = await db.users.find(query, {"_id": 0, "id": 1}).to_list(100000)
        now = datetime.now(timezone.utc)
        docs = [
            {
                "id": secrets.token_hex(12),
                "user_id": r["id"],
                "title": data.title,
                "body": data.body,
                "action_url": data.action_url,
                "type": "broadcast",
                "read": False,
                "created_at": now,
            }
            for r in recipients
        ]
        if docs:
            await db.notifications.insert_many(docs)
        await db.audit_log.insert_one({
            "actor_id": user["id"], "actor_email": user["email"],
            "action": "broadcast_notification",
            "target_id": data.audience or "all",
            "meta": {"recipients": len(docs), "title": data.title},
            "created_at": now,
        })
        return {"ok": True, "recipients": len(docs)}

    # ─── EXPANDED RBAC ──────────────────────────────────────
    @router.patch("/admin/users/{user_id}/roles")
    async def update_user_roles(
        user_id: str, data: RolesUpdateIn, user: dict = Depends(get_current_user)
    ):
        await _require_admin(user)
        invalid = set(data.roles) - VALID_ROLES
        if invalid:
            raise HTTPException(400, f"Invalid roles: {sorted(invalid)}")
        target = await db.users.find_one({"id": user_id})
        if not target:
            raise HTTPException(404, "User not found")
        await db.users.update_one({"id": user_id}, {"$set": {"roles": data.roles}})
        await db.audit_log.insert_one({
            "actor_id": user["id"], "actor_email": user["email"],
            "action": "update_roles", "target_id": user_id,
            "meta": {"roles": data.roles},
            "created_at": datetime.now(timezone.utc),
        })
        return {"ok": True, "roles": data.roles}

    # ─── PASSWORD RESET ─────────────────────────────────────
    @router.post("/auth/forgot")
    async def forgot_password(data: ForgotIn):
        """Always returns 200 (do not leak whether the email exists)."""
        u = await db.users.find_one({"email": data.email.lower()})
        if u:
            token = secrets.token_urlsafe(32)
            expires = datetime.now(timezone.utc) + timedelta(minutes=30)
            await db.password_reset_tokens.insert_one({
                "token": token,
                "user_id": u["id"],
                "email": u["email"],
                "expires_at": expires,
                "used": False,
                "created_at": datetime.now(timezone.utc),
            })
            reset_url = f"{APP_PUBLIC_URL}/reset-password?token={token}"
            email_id = await _send_email(
                to=u["email"],
                subject="Reset your AMASS password",
                html=_reset_email_html(reset_url, u.get("full_name", "there")),
            )
            if not email_id:
                # Email failed to send but flow must not break — log for support recovery
                logger.warning(f"Reset link fallback (email delivery failed): {reset_url}")
        return {"ok": True, "message": "If an account exists with that email, a reset link has been sent."}

    @router.post("/auth/reset")
    async def reset_password(data: ResetIn):
        now = datetime.now(timezone.utc)
        rec = await db.password_reset_tokens.find_one({"token": data.token})
        if not rec or rec.get("used"):
            raise HTTPException(400, "Invalid or already-used reset link")
        exp = rec.get("expires_at")
        if isinstance(exp, datetime) and exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if not exp or exp < now:
            raise HTTPException(400, "This reset link has expired. Please request a new one.")
        u = await db.users.find_one({"id": rec["user_id"]})
        if not u:
            raise HTTPException(400, "Account not found")
        new_hash = hash_password(data.password)
        await db.users.update_one({"id": u["id"]}, {"$set": {"password_hash": new_hash}})
        await db.password_reset_tokens.update_one(
            {"token": data.token}, {"$set": {"used": True, "used_at": now}}
        )
        # Auto-login the user after reset
        token = create_token(u["id"])
        await db.audit_log.insert_one({
            "actor_id": u["id"], "actor_email": u["email"],
            "action": "password_reset", "target_id": u["id"],
            "created_at": now,
        })
        return {"ok": True, "access_token": token, "user": user_to_out(u).model_dump()}

    return router
