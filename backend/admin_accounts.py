"""In-app Admin Cockpit — Accounts & roles + Admin Portal connection status (app admin token).

The external AMASS Admin Portal (admin_portal.py) manages the same data with its own scoped tokens; these routes
let admins do the essentials from inside the app: find a user, suspend / reactivate, grant or revoke admin.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

PORTAL_URL = "https://amass-control.emergent.host"


class UserPatchIn(BaseModel):
    account_status: Optional[str] = None
    is_admin: Optional[bool] = None


def register_admin_accounts_routes(db, require_admin) -> APIRouter:
    router = APIRouter(prefix="/api/admin", tags=["admin-accounts"])

    def now():
        return datetime.now(timezone.utc)

    @router.get("/users")
    async def list_users(search: str = "", status: str = "all", role: str = "all", admin: dict = Depends(require_admin)):
        q: dict = {}
        if search.strip():
            rx = {"$regex": search.strip(), "$options": "i"}
            q["$or"] = [{"full_name": rx}, {"email": rx}, {"phone": rx}]
        if status == "suspended":
            q["account_status"] = "suspended"
        elif status == "active":
            q["account_status"] = {"$ne": "suspended"}
        if role == "admin":
            q["is_admin"] = True
        elif role == "agent":
            q["is_agent"] = True
        docs = await db.users.find(q, {"_id": 0, "id": 1, "full_name": 1, "email": 1, "phone": 1, "city": 1, "avatar_url": 1, "is_admin": 1, "is_agent": 1, "account_status": 1, "created_at": 1, "identity_verified": 1}).sort("created_at", -1).to_list(100)
        ids = [d["id"] for d in docs]
        apps = {a["user_id"]: a.get("status") for a in await db.agent_applications.find({"user_id": {"$in": ids}}, {"_id": 0, "user_id": 1, "status": 1}).to_list(200)}
        brand_mgrs = {b["email"] for b in await db.brand_accounts.find({}, {"_id": 0, "email": 1}).to_list(1000)}
        return {
            "items": [{**d, "status": d.get("account_status") or "active", "agent_application": apps.get(d["id"]), "has_brand_login": (d.get("email") or "") in brand_mgrs} for d in docs],
            "totals": {"users": await db.users.count_documents({}), "suspended": await db.users.count_documents({"account_status": "suspended"}), "admins": await db.users.count_documents({"is_admin": True}), "agents": await db.users.count_documents({"is_agent": True})},
        }

    @router.patch("/users/{user_id}")
    async def patch_user(user_id: str, body: UserPatchIn, admin: dict = Depends(require_admin)):
        u = await db.users.find_one({"id": user_id}, {"_id": 0, "full_name": 1, "email": 1, "is_admin": 1})
        if not u:
            raise HTTPException(404, "User not found")
        sets: dict = {}
        if body.account_status is not None:
            if body.account_status not in ("active", "suspended"):
                raise HTTPException(400, "account_status must be active or suspended")
            if user_id == admin["id"] and body.account_status == "suspended":
                raise HTTPException(400, "You can't suspend yourself")
            sets.update({"account_status": body.account_status, "status_changed_at": now(), "status_changed_by": admin["id"]})
        if body.is_admin is not None:
            if user_id == admin["id"] and not body.is_admin:
                raise HTTPException(400, "You can't remove your own admin access")
            sets["is_admin"] = bool(body.is_admin)
        if not sets:
            raise HTTPException(400, "Nothing to change")
        await db.users.update_one({"id": user_id}, {"$set": sets})
        await db.audit_log.insert_one({"id": str(uuid.uuid4()), "source": "cockpit", "actor_id": admin["id"], "actor_name": admin.get("full_name") or admin.get("email"), "action": f"updated account {u.get('full_name') or u.get('email')}: " + ", ".join(f"{k}={v}" for k, v in sets.items() if k in ("account_status", "is_admin")), "target": user_id, "at": now()})
        return {"ok": True, **{k: v for k, v in sets.items() if k in ("account_status", "is_admin")}}

    @router.get("/portal-connection")
    async def portal_connection(admin: dict = Depends(require_admin)):
        from portal_keys import key_status
        from public_url import public_api_base

        staff = await db.admin_staff.count_documents({"disabled": {"$ne": True}})
        last = await db.audit_log.find_one({"source": "portal"}, {"_id": 0, "at": 1, "actor_name": 1, "action": 1}, sort=[("at", -1)])
        base = public_api_base()
        return {
            "portal_url": PORTAL_URL,
            "api_base": f"{base}/api/portal" if base else None,
            "key": await key_status(db),
            "staff_accounts": staff,
            "builtin_admins": await db.users.count_documents({"is_admin": True}),
            "last_portal_activity": last,
            "managed": ["Dashboard", "Leads", "Properties", "Property verification", "Agents", "Users", "Marketplace (brand products)", "App configuration", "Token economy", "Transactions", "Payments (verify)", "Notifications (broadcasts)", "Analytics", "Reports", "Roles & permissions", "Settings (team)", "Media uploads"],
            "in_app_only": ["FIXA provider applications & reports", "Agency teams", "Brands & brand logins", "KYC / identity documents", "Duplicate & passport review", "Zone pricing & monetization", "Email designs", "Feature flags detail"],
            "not_managed": ["Landing-page CMS", "Developers", "Property owners", "Construction / Home marketplaces", "AI insights", "Messages", "Subscriptions page"],
        }

    @router.post("/portal-connection/key", status_code=201)
    async def portal_key_create(body: Optional[dict] = None, admin: dict = Depends(require_admin)):
        from portal_keys import create_key

        return await create_key(db, admin, (body or {}).get("label"))

    @router.delete("/portal-connection/key")
    async def portal_key_revoke(admin: dict = Depends(require_admin)):
        from portal_keys import revoke_key

        return {"ok": True, "revoked": await revoke_key(db, admin)}

    return router
