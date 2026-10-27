"""AMASS Admin Portal API — the live-data backend for https://amass-control.emergent.host.

The portal is a separate React app. It calls `${API_BASE}/auth/login`, `/platform-users`, `/agents`, `/properties`,
`/roles`, `/dashboard/*`, … and expects the shapes implemented here (reverse-engineered from its bundle). Point the
portal's API base at `https://<this backend>/api/portal` and every page manages this app's real users, agents,
listings, brands' products, tokens, broadcasts and app settings. Both `/api/portal` and `/api/portal/api` are
mounted so either `xo` or `wo` in the portal can be changed.

Security: two ways in, both scoped to this router only —
  • Shared key (preferred, chosen by the owner): the portal's backend sends `X-AMASS-Portal-Key: amass_pk_…` (or
    `Authorization: Bearer amass_pk_…`) generated in the app's Cockpit → Admin Portal connection (see portal_keys.py).
    Acts as super_admin; `X-AMASS-Portal-Actor` names the staff member for the audit log.
  • Staff token (typ=portal, aud=portal-api; see staff_auth) from `/auth/login` for `admin_staff` docs or app users
    flagged is_admin (always super_admin). Every route declares the module + action it needs and the role matrix in
    `admin_roles` decides; super_admin bypasses.
Every write is appended to `audit_log` (source=portal) and surfaces in the portal's Recent Activities.

Deliberately NOT managed here (reported to the owner): Landing-page CMS, Media library browsing, Developers,
Property Owners, Construction/Home marketplaces, AI insights, Messages, Payments initialisation — these belong to the
portal's own landing-site backend. Their routes return empty lists / 501 so the pages render instead of crashing.
"""
from __future__ import annotations

import csv
import io
import logging
import uuid
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile, File
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, EmailStr, Field

from staff_auth import bearer, decode_scoped, hash_password, issue_scoped_token, norm_email, now, throttle_check, throttle_clear, throttle_fail, verify_password

logger = logging.getLogger("amass.portal")

# ─── RBAC ────────────────────────────────────────────────────────────────────
MODULES = [
    "dashboard", "leads", "cms", "analytics", "reports", "properties", "property_verification", "agents", "users",
    "property_owners", "developers", "construction_marketplace", "home_marketplace", "marketplace", "app_config",
    "tokens", "media", "transactions", "payments", "subscriptions", "messages", "notifications", "roles",
    "ai_management", "settings",
]
ACTIONS = ["view", "create", "edit", "delete"]
ROLE_LABELS = {
    "super_admin": "Super Admin", "administrator": "Administrator", "content_manager": "Content Manager",
    "property_manager": "Property Manager", "agent_manager": "Agent Manager", "customer_support": "Customer Support",
    "finance": "Finance", "marketing": "Marketing",
}
ROLE_DESCRIPTIONS = {
    "super_admin": "Unrestricted access to every module.",
    "administrator": "Everything except changing roles or deleting team members.",
    "content_manager": "Marketplace products, broadcasts, media and app configuration.",
    "property_manager": "Listings, verification queue, owners and developers.",
    "agent_manager": "Agent onboarding, verification and the leads they generate.",
    "customer_support": "Look up users, leads and transactions; suspend or reactivate accounts.",
    "finance": "Transactions, payments, subscriptions and the token economy.",
    "marketing": "Leads, broadcasts, marketplace promotions, analytics and reports.",
}


def _perm(view=True, create=False, edit=False, delete=False) -> dict:
    return {"view": view, "create": create, "edit": edit, "delete": delete}


def _all() -> dict:
    return _perm(True, True, True, True)


def default_permissions(role: str) -> dict:
    p: dict[str, dict] = {m: _perm(False) for m in MODULES}
    p["dashboard"] = _perm(True)
    if role == "super_admin":
        return {m: _all() for m in MODULES}
    if role == "administrator":
        p = {m: _all() for m in MODULES}
        p["roles"] = _perm(True)
        p["settings"] = _perm(True, True, True, False)
        return p
    grants: dict[str, dict[str, dict]] = {
        "content_manager": {"cms": _all(), "media": _all(), "marketplace": _all(), "notifications": _all(), "app_config": _perm(True, False, True), "properties": _perm(True), "analytics": _perm(True)},
        "property_manager": {"properties": _all(), "property_verification": _all(), "property_owners": _all(), "developers": _all(), "agents": _perm(True), "leads": _perm(True, False, True), "analytics": _perm(True), "reports": _perm(True)},
        "agent_manager": {"agents": _all(), "leads": _perm(True, False, True, True), "properties": _perm(True), "property_verification": _perm(True), "users": _perm(True), "analytics": _perm(True)},
        "customer_support": {"users": _perm(True, False, True), "leads": _perm(True, False, True), "agents": _perm(True), "properties": _perm(True), "transactions": _perm(True), "payments": _perm(True), "subscriptions": _perm(True), "notifications": _perm(True), "messages": _perm(True, True, True)},
        "finance": {"transactions": _all(), "payments": _all(), "subscriptions": _all(), "tokens": _all(), "reports": _all(), "analytics": _perm(True), "users": _perm(True)},
        "marketing": {"leads": _perm(True, True, True), "cms": _perm(True, True, True), "notifications": _all(), "marketplace": _perm(True, True, True), "analytics": _perm(True), "reports": _all(), "media": _all()},
    }
    for m, v in grants.get(role, {}).items():
        p[m] = v
    return p


# ─── models ──────────────────────────────────────────────────────────────────
class LoginIn(BaseModel):
    email: EmailStr
    password: str


class ProfileIn(BaseModel):
    name: Optional[str] = Field(None, max_length=120)


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str


class StaffIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str
    role: str


class RolePermsIn(BaseModel):
    permissions: dict[str, dict[str, bool]]


class StatusIn(BaseModel):
    status: str


class VerifiedIn(BaseModel):
    verified: bool


class AgentIn(BaseModel):
    name: str
    email: EmailStr
    phone: Optional[str] = None
    city: Optional[str] = None
    agency: Optional[str] = None


class PropertyIn(BaseModel):
    title: str
    description: Optional[str] = ""
    type: str = "Apartment"
    listing: str = "Sale"
    city: str = "Lagos"
    address: Optional[str] = ""
    price: float = 0
    bedrooms: int = 0
    bathrooms: int = 0
    area_sqm: float = 0
    image: Optional[str] = ""


class BroadcastIn(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    message: str = Field(min_length=1, max_length=1000)
    audience: Literal["all", "agents", "buyers", "developers"] = "all"
    channels: list[str] = ["in_app"]


class ConfigIn(BaseModel):
    data: dict[str, Any]


LISTING_LABEL = {"buy": "Sale", "rent": "Rent", "shortlet": "Shortlet", "lease": "Lease"}
LISTING_KEY = {v: k for k, v in LISTING_LABEL.items()}
LEAD_TYPES = {"agent": "Agent application", "partner": "FIXA provider application", "property": "Property enquiry", "contact": "Service request"}


def register_admin_portal_routes(db: AsyncIOMotorDatabase, admin_emails: set[str]) -> APIRouter:
    router = APIRouter(tags=["admin-portal"])

    # ─── roles store ───
    async def ensure_roles() -> None:
        for name in ROLE_LABELS:
            await db.admin_roles.update_one({"name": name}, {"$setOnInsert": {"name": name, "label": ROLE_LABELS[name], "description": ROLE_DESCRIPTIONS[name], "permissions": default_permissions(name), "created_at": now()}}, upsert=True)

    async def role_permissions(role: str) -> dict:
        if role == "super_admin":
            return default_permissions("super_admin")
        doc = await db.admin_roles.find_one({"name": role}, {"_id": 0, "permissions": 1})
        return (doc or {}).get("permissions") or default_permissions(role)

    # ─── accounts ───
    def _public(acc: dict) -> dict:
        return {"id": acc["id"], "name": acc.get("name") or acc.get("full_name") or "Admin", "email": acc["email"], "role": acc["role"], "permissions": acc.get("permissions") or {}, "source": acc.get("source", "staff")}

    async def _load_account(sub: str, src: str) -> dict:
        if src == "user":
            u = await db.users.find_one({"id": sub}, {"_id": 0, "id": 1, "full_name": 1, "email": 1, "is_admin": 1})
            if not u or not (u.get("is_admin") or (u.get("email") or "").lower() in admin_emails):
                raise HTTPException(401, "Account unavailable")
            return {"id": u["id"], "name": u.get("full_name"), "email": u["email"], "role": "super_admin", "source": "user"}
        s = await db.admin_staff.find_one({"id": sub}, {"_id": 0, "password_hash": 0})
        if not s or s.get("disabled"):
            raise HTTPException(401, "Account unavailable")
        return {**s, "source": "staff"}

    async def current_account(request: Request, creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer)) -> dict:
        # 1) Shared secret from the AMASS Admin Portal's own backend (X-AMASS-Portal-Key or Bearer amass_pk_…)
        from portal_keys import PREFIX, authenticate_key

        raw = request.headers.get("x-amass-portal-key") or (creds.credentials if creds and creds.credentials.startswith(PREFIX) else None)
        if raw:
            acc = await authenticate_key(db, raw, actor=request.headers.get("x-amass-portal-actor"))
            acc["permissions"] = default_permissions("super_admin")
            return acc
        # 2) Scoped staff token issued by /auth/login
        payload = decode_scoped(creds, "portal")
        acc = await _load_account(payload["sub"], payload.get("src", "staff"))
        acc["permissions"] = await role_permissions(acc["role"])
        return acc

    def require(module: str, action: str = "view"):
        async def dep(acc: dict = Depends(current_account)) -> dict:
            if acc["role"] == "super_admin" or (acc["permissions"].get(module) or {}).get(action):
                return acc
            raise HTTPException(403, f"Your role can't {action} {module.replace('_', ' ')}")

        return dep

    async def audit(acc: dict, action: str, target: Optional[str] = None, **meta) -> None:
        await db.audit_log.insert_one({"id": str(uuid.uuid4()), "source": "portal", "actor_id": acc["id"], "actor_name": acc.get("name") or acc["email"], "action": action, "target": target, "meta": meta, "at": now()})

    # ─── AUTH ───
    @router.post("/auth/login")
    async def login(body: LoginIn, request: Request):
        email = norm_email(body.email)
        await throttle_check(db, "portal", email)
        staff = await db.admin_staff.find_one({"email": email}, {"_id": 0})
        acc: Optional[dict] = None
        if staff and not staff.get("disabled") and verify_password(body.password, staff.get("password_hash")):
            acc = {**staff, "source": "staff"}
        else:
            u = await db.users.find_one({"email": email}, {"_id": 0, "id": 1, "full_name": 1, "email": 1, "is_admin": 1, "password_hash": 1})
            is_admin = bool(u and (u.get("is_admin") or email in admin_emails))
            if u and is_admin and verify_password(body.password, u.get("password_hash")):
                acc = {"id": u["id"], "name": u.get("full_name"), "email": u["email"], "role": "super_admin", "source": "user"}
            elif not staff:
                verify_password(body.password, None)  # constant work for unknown emails
        if not acc:
            await throttle_fail(db, "portal", email)
            raise HTTPException(401, "Invalid email or password, or this account has no admin access")
        await throttle_clear(db, "portal", email)
        acc["permissions"] = await role_permissions(acc["role"])
        token = issue_scoped_token(acc["id"], "portal", src=acc["source"], role=acc["role"])
        await db.admin_staff.update_one({"id": acc["id"]}, {"$set": {"last_login_at": now(), "last_login_ip": request.client.host if request.client else None}})
        await audit(acc, "signed in to the admin portal")
        return {"token": token, "user": _public(acc)}

    @router.get("/auth/me")
    async def me(acc: dict = Depends(current_account)):
        return _public(acc)

    @router.post("/auth/logout")
    async def logout(acc: dict = Depends(current_account)):
        return {"ok": True}

    @router.patch("/auth/profile")
    async def profile(body: ProfileIn, acc: dict = Depends(current_account)):
        if body.name:
            coll = db.users if acc["source"] == "user" else db.admin_staff
            field = "full_name" if acc["source"] == "user" else "name"
            await coll.update_one({"id": acc["id"]}, {"$set": {field: body.name.strip()}})
            acc["name"] = body.name.strip()
        return _public(acc)

    @router.post("/auth/change-password")
    async def change_password(body: ChangePasswordIn, acc: dict = Depends(current_account)):
        if acc["source"] == "portal_key":
            raise HTTPException(400, "Key-based sessions have no password — rotate the key in the AMASS app instead")
        coll = db.users if acc["source"] == "user" else db.admin_staff
        doc = await coll.find_one({"id": acc["id"]}, {"_id": 0, "password_hash": 1})
        if not doc or not verify_password(body.current_password, doc.get("password_hash")):
            raise HTTPException(400, "Current password is incorrect")
        await coll.update_one({"id": acc["id"]}, {"$set": {"password_hash": hash_password(body.new_password), "password_changed_at": now()}})
        await audit(acc, "changed their password")
        return {"ok": True}

    # ─── ROLES ───
    @router.get("/roles")
    async def roles(acc: dict = Depends(require("roles", "view"))):
        await ensure_roles()
        docs = await db.admin_roles.find({}, {"_id": 0}).to_list(50)
        counts = Counter(s["role"] for s in await db.admin_staff.find({"disabled": {"$ne": True}}, {"_id": 0, "role": 1}).to_list(1000))
        counts["super_admin"] += await db.users.count_documents({"is_admin": True})
        order = list(ROLE_LABELS)
        docs.sort(key=lambda d: order.index(d["name"]) if d["name"] in order else 99)
        return {"roles": [{"name": d["name"], "label": d.get("label") or d["name"], "description": d.get("description", ""), "permissions": d["permissions"] if d["name"] != "super_admin" else default_permissions("super_admin"), "user_count": counts.get(d["name"], 0)} for d in docs], "modules": MODULES, "actions": ACTIONS}

    @router.put("/roles/{name}")
    async def put_role(name: str, body: RolePermsIn, acc: dict = Depends(require("roles", "edit"))):
        if name == "super_admin":
            raise HTTPException(400, "Super Admin always has full access")
        if name not in ROLE_LABELS:
            raise HTTPException(404, "Unknown role")
        perms = {m: {a: bool((body.permissions.get(m) or {}).get(a)) for a in ACTIONS} for m in MODULES}
        await db.admin_roles.update_one({"name": name}, {"$set": {"permissions": perms, "updated_at": now(), "updated_by": acc["id"]}}, upsert=True)
        await audit(acc, f"updated permissions for {ROLE_LABELS[name]}", name)
        return {"ok": True}

    # ─── TEAM (admin users) ───
    @router.get("/admin-users")
    async def admin_users(acc: dict = Depends(require("settings", "view"))):
        staff = await db.admin_staff.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", 1).to_list(500)
        admins = await db.users.find({"is_admin": True}, {"_id": 0, "id": 1, "full_name": 1, "email": 1, "created_at": 1}).to_list(100)
        return [{"id": u["id"], "name": u.get("full_name") or u["email"], "email": u["email"], "role": "super_admin", "builtin": True, "created_at": u.get("created_at")} for u in admins] + [
            {"id": s["id"], "name": s["name"], "email": s["email"], "role": s["role"], "disabled": bool(s.get("disabled")), "created_at": s.get("created_at"), "last_login_at": s.get("last_login_at")} for s in staff
        ]

    @router.post("/admin-users", status_code=201)
    async def create_staff(body: StaffIn, acc: dict = Depends(require("settings", "create"))):
        if body.role not in ROLE_LABELS or body.role == "super_admin":
            raise HTTPException(400, "Pick a role other than Super Admin")
        email = norm_email(body.email)
        if await db.admin_staff.find_one({"email": email}) or await db.users.find_one({"email": email, "is_admin": True}):
            raise HTTPException(409, "That email already has admin access")
        doc = {"id": str(uuid.uuid4()), "name": body.name.strip(), "email": email, "role": body.role, "password_hash": hash_password(body.password), "disabled": False, "created_by": acc["id"], "created_at": now()}
        await db.admin_staff.insert_one({**doc})
        await audit(acc, f"added team member {doc['name']} ({ROLE_LABELS[body.role]})", doc["id"])
        doc.pop("password_hash")
        return doc

    @router.delete("/admin-users/{staff_id}")
    async def delete_staff(staff_id: str, acc: dict = Depends(require("settings", "delete"))):
        if staff_id == acc["id"]:
            raise HTTPException(400, "You can't remove yourself")
        s = await db.admin_staff.find_one({"id": staff_id}, {"_id": 0, "name": 1})
        if not s:
            raise HTTPException(404, "Team member not found (built-in AMASS admins are managed in the app)")
        await db.admin_staff.delete_one({"id": staff_id})
        await audit(acc, f"removed team member {s.get('name')}", staff_id)
        return {"ok": True}

    # ─── PLATFORM USERS (app accounts) ───
    @router.get("/platform-users")
    async def platform_users(search: str = "", acc: dict = Depends(require("users", "view"))):
        q: dict = {}
        if search.strip():
            rx = {"$regex": search.strip(), "$options": "i"}
            q["$or"] = [{"full_name": rx}, {"email": rx}, {"phone": rx}]
        docs = await db.users.find(q, {"_id": 0, "id": 1, "full_name": 1, "email": 1, "phone": 1, "city": 1, "account_status": 1, "is_agent": 1, "is_admin": 1, "created_at": 1}).sort("created_at", -1).to_list(200)
        return [{"id": u["id"], "name": u.get("full_name") or u.get("email"), "email": u.get("email"), "phone": u.get("phone"), "city": u.get("city"), "status": u.get("account_status") or "active", "is_agent": bool(u.get("is_agent")), "is_admin": bool(u.get("is_admin")), "created_at": u.get("created_at")} for u in docs]

    @router.patch("/platform-users/{user_id}/status")
    async def user_status(user_id: str, body: StatusIn, acc: dict = Depends(require("users", "edit"))):
        if body.status not in ("active", "suspended"):
            raise HTTPException(400, "status must be active or suspended")
        u = await db.users.find_one({"id": user_id}, {"_id": 0, "full_name": 1, "email": 1, "is_admin": 1})
        if not u:
            raise HTTPException(404, "User not found")
        if u.get("is_admin") and body.status == "suspended":
            raise HTTPException(400, "Remove admin access in the app before suspending an admin")
        await db.users.update_one({"id": user_id}, {"$set": {"account_status": body.status, "status_changed_at": now(), "status_changed_by": acc["id"]}})
        await audit(acc, f"{'suspended' if body.status == 'suspended' else 'reactivated'} user {u.get('full_name') or u.get('email')}", user_id)
        return {"ok": True, "status": body.status}

    # ─── AGENTS ───
    async def _agent_rows(search: str = "", city: str = "all", verified: Optional[str] = None) -> list[dict]:
        apps = await db.agent_applications.find({}, {"_id": 0, "user_id": 1, "full_name": 1, "email": 1, "phone": 1, "state": 1, "agency_name": 1, "status": 1, "verification_level": 1, "created_at": 1}).to_list(2000)
        by_user = {a["user_id"]: a for a in apps}
        legacy = await db.users.find({"is_agent": True, "id": {"$nin": list(by_user)}}, {"_id": 0, "id": 1, "full_name": 1, "email": 1, "phone": 1, "city": 1, "agency_name": 1, "created_at": 1}).to_list(2000)
        ids = list(by_user) + [u["id"] for u in legacy]
        counts: Counter = Counter()
        async for p in db.properties.find({"agent_id": {"$in": ids}, "status": {"$nin": ["archived", "sold"]}}, {"_id": 0, "agent_id": 1}):
            counts[p["agent_id"]] += 1
        users = {u["id"]: u for u in await db.users.find({"id": {"$in": list(by_user)}}, {"_id": 0, "id": 1, "city": 1, "is_agent": 1}).to_list(2000)}
        rows = []
        for a in apps:
            u = users.get(a["user_id"], {})
            rows.append({"id": a["user_id"], "name": a.get("full_name"), "email": a.get("email"), "phone": a.get("phone"), "city": a.get("state") or u.get("city") or "Lagos", "agency": a.get("agency_name"), "verified": a.get("status") == "approved", "status": a.get("status", "pending"), "verification_level": a.get("verification_level", 1), "listings_count": counts.get(a["user_id"], 0), "created_at": a.get("created_at"), "legacy": False})
        for u in legacy:
            rows.append({"id": u["id"], "name": u.get("full_name"), "email": u.get("email"), "phone": u.get("phone"), "city": u.get("city") or "Lagos", "agency": u.get("agency_name"), "verified": True, "status": "legacy", "verification_level": 1, "listings_count": counts.get(u["id"], 0), "created_at": u.get("created_at"), "legacy": True})
        if search.strip():
            s = search.strip().lower()
            rows = [r for r in rows if s in " ".join(str(r.get(k) or "") for k in ("name", "email", "phone", "agency")).lower()]
        if city and city != "all":
            rows = [r for r in rows if (r.get("city") or "").lower() == city.lower()]
        if verified in ("true", "false"):
            rows = [r for r in rows if r["verified"] == (verified == "true")]
        rows.sort(key=lambda r: (r["verified"], str(r.get("created_at") or "")), reverse=False)
        return rows

    @router.get("/agents")
    async def agents(search: str = "", city: str = "all", verified: Optional[str] = None, acc: dict = Depends(require("agents", "view"))):
        return await _agent_rows(search, city, verified)

    @router.patch("/agents/{user_id}/verify")
    async def agent_verify(user_id: str, body: VerifiedIn, acc: dict = Depends(require("agents", "edit"))):
        from agent_platform import set_agent_verification

        res = await set_agent_verification(db, user_id, approve=body.verified, reviewer_id=acc["id"], reason=None if body.verified else "Verification removed from the admin portal")
        await audit(acc, f"{'verified' if body.verified else 'removed verification for'} agent {res.get('name') or user_id}", user_id)
        return {"ok": True, **res}

    @router.post("/agents", status_code=201)
    async def add_agent(body: AgentIn, acc: dict = Depends(require("agents", "create"))):
        email = norm_email(body.email)
        u = await db.users.find_one({"email": email}, {"_id": 0, "id": 1, "full_name": 1})
        if not u:
            raise HTTPException(404, "No AMASS account with that email — ask them to sign up in the app first, then verify them here")
        if await db.agent_applications.find_one({"user_id": u["id"]}):
            raise HTTPException(409, "This user already has an agent application — verify it from the list")
        doc = {"id": str(uuid.uuid4()), "user_id": u["id"], "full_name": body.name or u.get("full_name"), "email": email, "phone": body.phone or "", "state": body.city or "Lagos", "agency_name": body.agency, "status": "pending", "verification_level": 1, "created_at": now(), "updated_at": now(), "created_by_admin": acc["id"]}
        await db.agent_applications.insert_one({**doc})
        await audit(acc, f"added agent {doc['full_name']} (pending verification)", u["id"])
        return {"id": u["id"], "name": doc["full_name"], "email": email, "phone": doc["phone"], "city": doc["state"], "agency": body.agency, "verified": False, "status": "pending", "listings_count": 0}

    @router.delete("/agents/{user_id}")
    async def remove_agent(user_id: str, acc: dict = Depends(require("agents", "delete"))):
        app_doc = await db.agent_applications.find_one({"user_id": user_id}, {"_id": 0, "full_name": 1})
        await db.agent_applications.delete_one({"user_id": user_id})
        await db.users.update_one({"id": user_id}, {"$set": {"is_agent": False}})
        await audit(acc, f"removed agent status from {(app_doc or {}).get('full_name') or user_id} (listings kept)", user_id)
        return {"ok": True}

    # ─── PROPERTIES ───
    def _prop_row(p: dict) -> dict:
        return {"id": p["id"], "title": p.get("title"), "type": (p.get("property_type") or "").title() or "Other", "listing": LISTING_LABEL.get(p.get("listing_type"), (p.get("listing_type") or "").title()), "bedrooms": p.get("bedrooms") or 0, "bathrooms": p.get("bathrooms") or 0, "area_sqm": p.get("size_sqm") or 0, "city": p.get("city"), "address": p.get("location"), "agent_name": p.get("agent_name"), "agent_id": p.get("agent_id"), "price": p.get("price") or 0, "currency": p.get("currency") or "NGN", "status": p.get("status") or "pending", "verified": bool(p.get("verified")), "image": (p.get("images") or [None])[0], "created_at": p.get("created_at")}

    @router.get("/properties-meta")
    async def properties_meta(acc: dict = Depends(require("properties", "view"))):
        types = sorted({(t or "").title() for t in await db.properties.distinct("property_type") if t} | {"Apartment", "Duplex", "Terrace", "Bungalow", "Penthouse", "Land", "Commercial"})
        statuses = sorted({s for s in await db.properties.distinct("status") if s} | {"pending", "available", "sold", "archived"})
        cities = sorted({c for c in await db.properties.distinct("city") if c} | {"Lagos", "Abuja"})
        return {"types": types, "listings": ["Sale", "Rent", "Shortlet", "Lease"], "statuses": statuses, "cities": cities}

    @router.get("/properties")
    async def properties(search: str = "", city: str = "all", type: str = "all", status: str = "all", acc: dict = Depends(require("properties", "view"))):
        q: dict = {}
        if search.strip():
            rx = {"$regex": search.strip(), "$options": "i"}
            q["$or"] = [{"title": rx}, {"location": rx}, {"agent_name": rx}, {"city": rx}]
        if city != "all":
            q["city"] = city
        if type != "all":
            q["property_type"] = type.lower()
        if status != "all":
            q["status"] = status
        docs = await db.properties.find(q, {"_id": 0}).sort("created_at", -1).to_list(400)
        return [_prop_row(p) for p in docs]

    @router.post("/properties", status_code=201)
    async def create_property(body: PropertyIn, acc: dict = Depends(require("properties", "create"))):
        doc = {"id": str(uuid.uuid4()), "title": body.title.strip(), "description": body.description or "", "property_type": body.type.lower(), "listing_type": LISTING_KEY.get(body.listing, "buy"), "city": body.city, "state": "Lagos" if body.city == "Lagos" else body.city, "country": "Nigeria", "location": body.address or body.city, "price": body.price, "currency": "NGN", "bedrooms": body.bedrooms, "bathrooms": body.bathrooms, "size_sqm": body.area_sqm, "images": [body.image] if body.image else [], "amenities": [], "status": "pending", "verified": False, "listing_source": "admin_portal", "agent_id": None, "agent_name": "AMASS", "token_cost": 0, "views_count": 0, "created_at": now(), "created_by_admin": acc["id"]}
        await db.properties.insert_one({**doc})
        await audit(acc, f"created listing “{doc['title']}” (pending approval)", doc["id"])
        return _prop_row(doc)

    @router.patch("/properties/{prop_id}/status")
    async def property_status(prop_id: str, body: StatusIn, acc: dict = Depends(require("properties", "edit"))):
        r = await db.properties.update_one({"id": prop_id}, {"$set": {"status": body.status, "status_changed_at": now(), "status_changed_by": acc["id"]}})
        if not r.matched_count:
            raise HTTPException(404, "Property not found")
        await audit(acc, f"marked a listing {body.status}", prop_id)
        return {"ok": True, "status": body.status}

    @router.patch("/properties/{prop_id}/verify")
    async def property_verify(prop_id: str, body: VerifiedIn, acc: dict = Depends(require("property_verification", "edit"))):
        p = await db.properties.find_one({"id": prop_id}, {"_id": 0, "title": 1, "migrated_to_amass_property_id": 1})
        if not p:
            raise HTTPException(404, "Property not found")
        await db.properties.update_one({"id": prop_id}, {"$set": {"verified": body.verified, "verified_at": now() if body.verified else None, "verified_by": acc["id"] if body.verified else None}})
        if p.get("migrated_to_amass_property_id"):
            await db.properties_geo.update_one({"amass_property_id": p["migrated_to_amass_property_id"]}, {"$set": {"property_identity_status": "VERIFIED" if body.verified else "PENDING_REVIEW", "verified_at": now() if body.verified else None, "verified_by": acc["id"] if body.verified else None, "updated_at": now()}})
        await audit(acc, f"{'verified' if body.verified else 'removed verification from'} listing “{p.get('title')}”", prop_id)
        return {"ok": True, "verified": body.verified}

    @router.delete("/properties/{prop_id}")
    async def delete_property(prop_id: str, acc: dict = Depends(require("properties", "delete"))):
        p = await db.properties.find_one({"id": prop_id}, {"_id": 0, "title": 1})
        if not p:
            raise HTTPException(404, "Property not found")
        await db.properties.update_one({"id": prop_id}, {"$set": {"status": "archived", "archived_at": now(), "archived_by": acc["id"], "archived_from": "admin_portal"}})
        await audit(acc, f"archived listing “{p.get('title')}”", prop_id)
        return {"ok": True, "archived": True}

    # ─── LEADS (unified: agent + FIXA applications, property enquiries, service requests) ───
    async def _lead_rows() -> list[dict]:
        meta = {m["lead_id"]: m for m in await db.portal_leads_meta.find({}, {"_id": 0}).to_list(5000)}
        rows: list[dict] = []
        for a in await db.agent_applications.find({}, {"_id": 0, "id": 1, "user_id": 1, "full_name": 1, "email": 1, "phone": 1, "status": 1, "agency_name": 1, "created_at": 1}).sort("created_at", -1).to_list(1000):
            default = "Closed" if a.get("status") in ("approved", "rejected") else "New"
            rows.append({"id": f"agent:{a['user_id']}", "type": "agent", "name": a.get("full_name"), "email": a.get("email"), "phone": a.get("phone"), "message": f"Agent application · {a.get('agency_name') or 'independent'} · {a.get('status', 'pending')}", "status": default, "created_at": a.get("created_at")})
        for f in await db.marketplace.find({"category": "services"}, {"_id": 0, "id": 1, "seller_id": 1, "title": 1, "fixa_status": 1, "created_at": 1, "applied_at": 1, "subcategory": 1}).sort("created_at", -1).to_list(1000):
            u = await db.users.find_one({"id": f.get("seller_id")}, {"_id": 0, "full_name": 1, "email": 1, "phone": 1})
            default = "Closed" if f.get("fixa_status") in ("verified", "rejected") else "New"
            rows.append({"id": f"partner:{f['id']}", "type": "partner", "name": (u or {}).get("full_name") or f.get("title"), "email": (u or {}).get("email"), "phone": (u or {}).get("phone"), "message": f"FIXA provider · {f.get('subcategory') or 'services'} · {f.get('fixa_status') or 'listed'}", "status": default, "created_at": f.get("created_at")})
        for l in await db.lead_unlocks.find({}, {"_id": 0}).sort("created_at", -1).to_list(500):
            u = await db.users.find_one({"id": l.get("favorite_user_id")}, {"_id": 0, "full_name": 1, "email": 1, "phone": 1})
            p = await db.properties.find_one({"id": l.get("property_id")}, {"_id": 0, "title": 1})
            rows.append({"id": f"property:{l['id']}", "type": "property", "name": (u or {}).get("full_name") or "AMASS user", "email": (u or {}).get("email"), "phone": (u or {}).get("phone"), "message": f"Enquiry on “{(p or {}).get('title') or 'a listing'}” (contact unlocked)", "status": "New", "created_at": l.get("created_at")})
        for s in await db.service_requests.find({}, {"_id": 0, "id": 1, "user_id": 1, "title": 1, "category": 1, "status": 1, "created_at": 1}).sort("created_at", -1).to_list(500):
            u = await db.users.find_one({"id": s.get("user_id")}, {"_id": 0, "full_name": 1, "email": 1, "phone": 1})
            rows.append({"id": f"contact:{s['id']}", "type": "contact", "name": (u or {}).get("full_name") or "AMASS user", "email": (u or {}).get("email"), "phone": (u or {}).get("phone"), "message": f"{s.get('title') or 'Service request'} · {s.get('category') or ''}", "status": "Closed" if s.get("status") == "closed" else "New", "created_at": s.get("created_at")})
        out = []
        for r in rows:
            m = meta.get(r["id"])
            if m and m.get("deleted"):
                continue
            if m and m.get("status"):
                r["status"] = m["status"]
            out.append(r)
        out.sort(key=lambda r: str(r.get("created_at") or ""), reverse=True)
        return out

    @router.get("/leads")
    async def leads(search: str = "", type: str = "all", status: str = "all", acc: dict = Depends(require("leads", "view"))):
        rows = await _lead_rows()
        if type != "all":
            rows = [r for r in rows if r["type"] == type]
        if status != "all":
            rows = [r for r in rows if r["status"] == status]
        if search.strip():
            s = search.strip().lower()
            rows = [r for r in rows if s in " ".join(str(r.get(k) or "") for k in ("name", "email", "phone", "message")).lower()]
        return rows[:500]

    @router.patch("/leads/{lead_id}/status")
    async def lead_status(lead_id: str, body: StatusIn, acc: dict = Depends(require("leads", "edit"))):
        if body.status not in ("New", "Contacted", "Closed"):
            raise HTTPException(400, "status must be New, Contacted or Closed")
        if lead_id not in {r["id"] for r in await _lead_rows()}:
            raise HTTPException(404, "Lead not found")
        await db.portal_leads_meta.update_one({"lead_id": lead_id}, {"$set": {"lead_id": lead_id, "status": body.status, "updated_at": now(), "updated_by": acc["id"]}}, upsert=True)
        await audit(acc, f"marked a lead {body.status}", lead_id)
        return {"ok": True}

    @router.delete("/leads/{lead_id}")
    async def lead_delete(lead_id: str, acc: dict = Depends(require("leads", "delete"))):
        await db.portal_leads_meta.update_one({"lead_id": lead_id}, {"$set": {"lead_id": lead_id, "deleted": True, "updated_at": now(), "updated_by": acc["id"]}}, upsert=True)
        await audit(acc, "removed a lead from the list", lead_id)
        return {"ok": True}

    def _csv(rows: list[dict], name: str) -> StreamingResponse:
        buf = io.StringIO()
        if rows:
            w = csv.DictWriter(buf, fieldnames=list(rows[0].keys()))
            w.writeheader()
            for r in rows:
                w.writerow({k: (v.isoformat() if isinstance(v, datetime) else v) for k, v in r.items()})
        return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="{name}.csv"'})

    @router.get("/leads-export/csv")
    async def leads_csv(acc: dict = Depends(require("leads", "view"))):
        return _csv(await _lead_rows(), "amass-leads")

    # ─── DASHBOARD ───
    async def _daily_counts(days: int) -> list[dict]:
        since = now() - timedelta(days=days - 1)
        c: Counter = Counter()
        for coll in (db.agent_applications, db.lead_unlocks, db.service_requests):
            async for d in coll.find({"created_at": {"$gte": since}}, {"_id": 0, "created_at": 1}):
                ca = d.get("created_at")
                if isinstance(ca, datetime):
                    c[ca.strftime("%Y-%m-%d")] += 1
        return [{"date": (since + timedelta(days=i)).strftime("%d %b"), "leads": c.get((since + timedelta(days=i)).strftime("%Y-%m-%d"), 0)} for i in range(days)]

    @router.get("/dashboard/stats")
    async def dashboard_stats(acc: dict = Depends(require("dashboard", "view"))):
        start_today = now().replace(hour=0, minute=0, second=0, microsecond=0)
        leads_total = await db.agent_applications.count_documents({}) + await db.lead_unlocks.count_documents({}) + await db.service_requests.count_documents({}) + await db.marketplace.count_documents({"category": "services"})
        new_today = sum([await db.agent_applications.count_documents({"created_at": {"$gte": start_today}}), await db.lead_unlocks.count_documents({"created_at": {"$gte": start_today}}), await db.service_requests.count_documents({"created_at": {"$gte": start_today}})])
        return {
            "total_leads": leads_total, "new_leads_today": new_today,
            "registered_agents": await db.users.count_documents({"is_agent": True}),
            "registered_users": await db.users.count_documents({}),
            "total_properties": await db.properties.count_documents({"status": {"$ne": "archived"}}),
            "pending_property_approvals": await db.properties.count_documents({"$or": [{"verified": {"$ne": True}}, {"status": "pending"}]}) + await db.agent_applications.count_documents({"status": "pending"}) + await db.marketplace.count_documents({"category": "services", "fixa_status": "pending"}),
            "newsletter_subscribers": await db.notification_prefs.count_documents({"email_digest": {"$ne": "off"}}),
        }

    @router.get("/dashboard/leads-trend")
    async def leads_trend(acc: dict = Depends(require("dashboard", "view"))):
        return await _daily_counts(14)

    @router.get("/dashboard/lead-sources")
    async def lead_sources(acc: dict = Depends(require("dashboard", "view"))):
        return [
            {"name": "Property enquiries", "value": await db.lead_unlocks.count_documents({})},
            {"name": "Agent applications", "value": await db.agent_applications.count_documents({})},
            {"name": "FIXA applications", "value": await db.marketplace.count_documents({"category": "services"})},
            {"name": "Service requests", "value": await db.service_requests.count_documents({})},
        ]

    @router.get("/dashboard/activities")
    async def activities(acc: dict = Depends(require("dashboard", "view"))):
        docs = await db.audit_log.find({"source": "portal"}, {"_id": 0, "id": 1, "actor_name": 1, "action": 1, "at": 1}).sort("at", -1).to_list(20)
        return [{"id": d["id"], "user_name": d.get("actor_name") or "Admin", "action": d.get("action"), "created_at": d.get("at")} for d in docs]

    # ─── NOTIFICATIONS (broadcasts) ───
    async def _audience_ids(audience: str) -> list[str]:
        q: dict = {"account_status": {"$ne": "suspended"}}
        if audience == "agents":
            q["is_agent"] = True
        elif audience == "buyers":
            q["is_agent"] = {"$ne": True}
        elif audience == "developers":
            q["is_agent"] = True
            q["agency_id"] = {"$exists": True, "$ne": None}
        return [u["id"] async for u in db.users.find(q, {"_id": 0, "id": 1})]

    async def _deliver(bid: str, title: str, message: str, audience: str) -> int:
        from notification_center import emit

        n = 0
        for uid in await _audience_ids(audience):
            try:
                await emit(db, uid, "announcement", title, message, {"broadcast_id": bid}, action_url="/updates")
                n += 1
            except Exception as e:  # noqa: BLE001
                logger.warning("broadcast %s to %s failed: %s", bid, uid, e)
        await db.portal_broadcasts.update_one({"id": bid}, {"$set": {"delivered": n, "channel_status.in_app": "sent"}})
        return n

    @router.get("/notifications")
    async def broadcasts(acc: dict = Depends(require("notifications", "view"))):
        return await db.portal_broadcasts.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)

    @router.post("/notifications", status_code=201)
    async def create_broadcast(body: BroadcastIn, acc: dict = Depends(require("notifications", "create"))):
        import asyncio

        bid = str(uuid.uuid4())
        doc = {"id": bid, "title": body.title.strip(), "message": body.message.strip(), "audience": body.audience, "channels": body.channels, "channel_status": {c: ("sending" if c == "in_app" else "queued") for c in body.channels}, "active": True, "delivered": 0, "created_by": acc["id"], "created_at": now()}
        await db.portal_broadcasts.insert_one({**doc})
        if "in_app" in body.channels:
            asyncio.create_task(_deliver(bid, doc["title"], doc["message"], body.audience))
        await audit(acc, f"sent broadcast “{doc['title']}” to {body.audience}", bid)
        return doc

    @router.patch("/notifications/{bid}/toggle")
    async def toggle_broadcast(bid: str, acc: dict = Depends(require("notifications", "edit"))):
        import asyncio

        b = await db.portal_broadcasts.find_one({"id": bid}, {"_id": 0})
        if not b:
            raise HTTPException(404, "Broadcast not found")
        active = not b.get("active", True)
        await db.portal_broadcasts.update_one({"id": bid}, {"$set": {"active": active}})
        if active:
            asyncio.create_task(_deliver(bid, b["title"], b["message"], b["audience"]))
        else:
            await db.notifications.delete_many({"meta.broadcast_id": bid})
        await audit(acc, f"{'re-enabled' if active else 'hid'} broadcast “{b['title']}”", bid)
        return {"ok": True, "active": active}

    @router.delete("/notifications/{bid}")
    async def delete_broadcast(bid: str, acc: dict = Depends(require("notifications", "delete"))):
        await db.portal_broadcasts.delete_one({"id": bid})
        await db.notifications.delete_many({"meta.broadcast_id": bid})
        await audit(acc, "deleted a broadcast", bid)
        return {"ok": True}

    # ─── APP CONFIG (= app_settings sections) ───
    @router.get("/app-config")
    async def app_config(acc: dict = Depends(require("app_config", "view"))):
        docs = await db.app_settings.find({}, {"_id": 0, "key": 1, "value": 1, "updated_at": 1}).to_list(100)
        docs.sort(key=lambda d: (d["key"] != "feature_flags", d["key"]))
        return [{"key": d["key"], "label": d["key"].replace("_", " ").title(), "data": d["value"] if isinstance(d["value"], dict) else {"value": d["value"]}, "updated_at": d.get("updated_at")} for d in docs]

    @router.put("/app-config/{key}")
    async def put_config(key: str, body: ConfigIn, acc: dict = Depends(require("app_config", "edit"))):
        doc = await db.app_settings.find_one({"key": key}, {"_id": 0, "value": 1})
        if not doc:
            raise HTTPException(404, "Unknown settings section")
        old = doc["value"] if isinstance(doc["value"], dict) else {}
        merged = {**old}
        for k, v in body.data.items():
            if k in old and isinstance(old[k], bool) and not isinstance(v, bool):
                raise HTTPException(400, f"'{k}' must be on/off")
            if k in old and isinstance(old[k], (int, float)) and not isinstance(old[k], bool) and not isinstance(v, (int, float)):
                try:
                    v = type(old[k])(v)
                except (TypeError, ValueError):
                    raise HTTPException(400, f"'{k}' must be a number")
            merged[k] = v
        await db.app_settings.update_one({"key": key}, {"$set": {"value": merged, "updated_at": now(), "updated_by": acc["id"]}})
        await audit(acc, f"updated app configuration “{key.replace('_', ' ')}”", key)
        return {"ok": True, "key": key, "data": merged}

    # ─── ANALYTICS & REPORTS ───
    async def _token_stats() -> tuple[int, int, int]:
        circ = 0
        async for w in db.wallets.find({"currency": "MASS"}, {"_id": 0, "balance": 1, "bonus_balance": 1}):
            circ += int(w.get("balance") or 0) + int(w.get("bonus_balance") or 0)
        revenue = 0
        async for l in db.payment_ledger.find({"verified.status": "success"}, {"_id": 0, "amount_ngn": 1}):
            revenue += int(l.get("amount_ngn") or 0)
        plans = await db.agent_subscriptions.count_documents({"status": "active"})
        return circ, revenue, plans

    @router.get("/analytics/overview")
    async def analytics(acc: dict = Depends(require("analytics", "view"))):
        circ, revenue, plans = await _token_stats()
        by_status = Counter((p.get("status") or "pending") for p in await db.properties.find({}, {"_id": 0, "status": 1}).to_list(5000))
        by_city = Counter((p.get("city") or "Unknown") for p in await db.properties.find({}, {"_id": 0, "city": 1}).to_list(5000))
        agents = await _agent_rows()
        return {
            "kpis": {"active_users": await db.users.count_documents({"account_status": {"$ne": "suspended"}}), "total_listings": await db.properties.count_documents({"status": {"$ne": "archived"}}), "approved_listings": await db.properties.count_documents({"verified": True}), "verified_agents": sum(1 for a in agents if a["verified"]), "products": await db.shop_products.count_documents({"published": True}), "token_circulation": circ, "est_token_revenue": revenue, "active_plans": plans},
            "leads_trend": await _daily_counts(14),
            "listings_by_status": [{"name": k, "value": v} for k, v in by_status.most_common()],
            "listings_by_city": [{"name": k, "value": v} for k, v in by_city.most_common(8)],
            "top_agents": [{"name": a.get("name") or "Agent", "listings": a["listings_count"]} for a in sorted(agents, key=lambda a: -a["listings_count"])[:6]],
        }

    def _monthly(items: list[datetime], months: int = 6, key: str = "leads") -> list[dict]:
        c: Counter = Counter(d.strftime("%Y-%m") for d in items if isinstance(d, datetime))
        out = []
        cur = now().replace(day=1)
        for i in range(months - 1, -1, -1):
            y, m = cur.year, cur.month - i
            while m <= 0:
                m += 12
                y -= 1
            k = f"{y:04d}-{m:02d}"
            out.append({"month": datetime(y, m, 1).strftime("%b"), key: c.get(k, 0)})
        return out

    @router.get("/reports/summary")
    async def reports(acc: dict = Depends(require("reports", "view"))):
        circ, revenue, plans = await _token_stats()
        lead_dates = [d["created_at"] for coll in (db.agent_applications, db.lead_unlocks, db.service_requests) for d in await coll.find({}, {"_id": 0, "created_at": 1}).to_list(5000)]
        listing_dates = [d["created_at"] for d in await db.properties.find({}, {"_id": 0, "created_at": 1}).to_list(5000)]
        cats = Counter((p.get("category") or "other") for p in await db.shop_products.find({"published": True}, {"_id": 0, "category": 1}).to_list(5000))
        agents = await _agent_rows()
        return {
            "totals": {"total_leads": len(lead_dates), "total_listings": len(listing_dates), "approved_listings": await db.properties.count_documents({"verified": True}), "verified_agents": sum(1 for a in agents if a["verified"]), "products": sum(cats.values()), "est_token_revenue": revenue},
            "leads_by_month": _monthly(lead_dates, 6, "leads"),
            "listings_by_month": _monthly(listing_dates, 6, "listings"),
            "products_by_category": [{"name": k.replace("_", " ").title(), "value": v} for k, v in cats.most_common()],
        }

    @router.get("/reports/export")
    async def export(ds: str = Query("leads"), acc: dict = Depends(require("reports", "view"))):
        if ds == "leads":
            return _csv(await _lead_rows(), "amass-leads")
        if ds == "properties":
            return _csv([_prop_row(p) for p in await db.properties.find({}, {"_id": 0}).to_list(5000)], "amass-properties")
        if ds == "agents":
            return _csv(await _agent_rows(), "amass-agents")
        if ds == "products":
            rows = [{"id": p["id"], "name": p.get("name"), "brand": p.get("retailer_name"), "category": p.get("category"), "price": (p.get("price") or {}).get("amount"), "stock": (p.get("stock") or {}).get("status"), "published": p.get("published")} for p in await db.shop_products.find({}, {"_id": 0}).to_list(5000)]
            return _csv(rows, "amass-products")
        if ds == "wallets":
            rows = [{"user_id": w.get("user_id"), "currency": w.get("currency"), "balance": w.get("balance"), "bonus_balance": w.get("bonus_balance"), "lifetime_earned": w.get("lifetime_earned")} for w in await db.wallets.find({}, {"_id": 0}).to_list(10000)]
            return _csv(rows, "amass-wallets")
        if ds == "users":
            rows = [{"id": u["id"], "name": u.get("full_name"), "email": u.get("email"), "phone": u.get("phone"), "city": u.get("city"), "is_agent": bool(u.get("is_agent")), "status": u.get("account_status") or "active", "created_at": u.get("created_at")} for u in await db.users.find({}, {"_id": 0}).to_list(10000)]
            return _csv(rows, "amass-users")
        raise HTTPException(400, "Unknown dataset")

    # ─── MEDIA (uploads used by product/category images) ───
    @router.post("/media/upload", status_code=201)
    async def media_upload(folder: str = "general", file: UploadFile = File(...), acc: dict = Depends(require("media", "create"))):
        from object_storage import upload_photo_bytes
        from public_url import public_api_base

        data = await file.read()
        path = await upload_photo_bytes(f"portal-{acc['id']}", data, file.content_type or "image/jpeg", public=True)
        url = f"{public_api_base()}/api/public-files/{path}"
        doc = {"id": str(uuid.uuid4()), "url": url, "path": path, "folder": folder, "name": file.filename, "size": len(data), "content_type": file.content_type, "uploaded_by": acc["id"], "created_at": now()}
        await db.portal_media.insert_one({**doc})
        return doc

    @router.get("/media")
    async def media(acc: dict = Depends(require("media", "view"))):
        return await db.portal_media.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)

    @router.delete("/media/{media_id}")
    async def media_delete(media_id: str, acc: dict = Depends(require("media", "delete"))):
        await db.portal_media.delete_one({"id": media_id})
        return {"ok": True}

    # ─── NOT MANAGED HERE (landing-site concerns) — render empty instead of crashing ───
    @router.get("/cms/sections")
    async def cms_sections(acc: dict = Depends(current_account)):
        return []

    @router.put("/cms/sections/{key}")
    async def cms_put(key: str, acc: dict = Depends(current_account)):
        raise HTTPException(501, "The landing page is not managed by the AMASS app backend")

    @router.get("/developers")
    @router.get("/developers/projects")
    @router.get("/property-owners")
    @router.get("/ai/history")
    async def empty_lists(acc: dict = Depends(current_account)):
        return []

    @router.post("/developers")
    @router.post("/developers/projects")
    @router.post("/property-owners")
    @router.post("/ai/market-insight")
    @router.post("/payments/initialize")
    async def not_managed(acc: dict = Depends(current_account)):
        raise HTTPException(501, "Not managed from the admin portal — handled inside the AMASS app")

    from admin_portal_commerce import register_commerce_routes

    router.include_router(register_commerce_routes(db, require, audit))
    return router
