"""AMASS Admin routes — Admin Portal API.

Gates:
  • is_admin flag on user OR email matches ADMIN_EMAILS env list.
  • First registered user is auto-promoted to admin (bootstrap).
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

bearer = HTTPBearer(auto_error=False)

ADMIN_EMAILS = [
    e.strip().lower()
    for e in os.environ.get("ADMIN_EMAILS", "admin@amass.africa,demo@amass.africa").split(",")
    if e.strip()
]


async def _is_admin(user: dict) -> bool:
    if user.get("is_admin"):
        return True
    if (user.get("email") or "").lower() in ADMIN_EMAILS:
        return True
    return False


class ApproveIn(BaseModel):
    verified: bool = True
    status: Optional[str] = None  # available | premium | verified | sold


class UserRoleIn(BaseModel):
    is_admin: Optional[bool] = None
    is_agent: Optional[bool] = None


def register_admin_routes(db: AsyncIOMotorDatabase, get_current_user) -> APIRouter:
    router = APIRouter(prefix="/api/admin", tags=["admin"])

    async def require_admin(user: dict = Depends(get_current_user)) -> dict:
        if not await _is_admin(user):
            raise HTTPException(403, "Admin access required")
        return user

    @router.get("/whoami")
    async def whoami(user: dict = Depends(require_admin)):
        return {"id": user["id"], "email": user["email"], "is_admin": True}

    @router.get("/dashboard")
    async def dashboard(user: dict = Depends(require_admin)):
        now = datetime.now(timezone.utc)
        d7 = now - timedelta(days=7)
        d30 = now - timedelta(days=30)

        totals = {
            "users": await db.users.count_documents({}),
            "properties": await db.properties.count_documents({}),
            "properties_verified": await db.properties.count_documents({"verified": True}),
            "properties_pending": await db.properties.count_documents({"verified": False}),
            "marketplace_items": await db.marketplace.count_documents({}),
            "agents": await db.agent_applications.count_documents({}),
            "agents_pending": await db.agent_applications.count_documents({"status": "pending"}),
            "orders": await db.orders.count_documents({}),
            "unlocks": await db.property_unlocks.count_documents({}),
        }
        weekly = {
            "new_users": await db.users.count_documents({"created_at": {"$gte": d7}}),
            "new_properties": await db.properties.count_documents({"created_at": {"$gte": d7}}),
            "views": await db.property_events.count_documents({"event_type": "view", "created_at": {"$gte": d7}}),
            "favorites": await db.property_events.count_documents({"event_type": "favorite", "created_at": {"$gte": d7}}),
        }
        # Revenue: sum of ledger amounts (fulfilled payments) in NGN
        pipeline = [{"$group": {"_id": None, "total": {"$sum": "$amount_ngn"}}}]
        rev_docs = await db.payment_ledger.aggregate(pipeline).to_list(1)
        revenue_ngn = rev_docs[0]["total"] if rev_docs else 0
        # Top cities
        city_pipeline = [
            {"$group": {"_id": "$city", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 5},
        ]
        top_cities = [
            {"city": row["_id"], "count": row["count"]}
            async for row in db.properties.aggregate(city_pipeline)
            if row["_id"]
        ]
        return {
            "totals": totals,
            "weekly": weekly,
            "revenue_ngn": revenue_ngn,
            "top_cities": top_cities,
        }

    @router.get("/properties")
    async def list_properties(
        verified: Optional[bool] = None,
        listing_source: Optional[str] = None,
        q: Optional[str] = None,
        limit: int = 100,
        user: dict = Depends(require_admin),
    ):
        query: dict = {}
        if verified is not None:
            query["verified"] = verified
        if listing_source:
            query["listing_source"] = listing_source
        if q:
            query["$or"] = [
                {"title": {"$regex": q, "$options": "i"}},
                {"city": {"$regex": q, "$options": "i"}},
                {"agent_name": {"$regex": q, "$options": "i"}},
            ]
        docs = await db.properties.find(query, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
        return docs

    @router.post("/properties/{property_id}/approve")
    async def approve_property(
        property_id: str,
        data: ApproveIn,
        user: dict = Depends(require_admin),
    ):
        prop = await db.properties.find_one({"id": property_id}, {"_id": 0})
        if not prop:
            raise HTTPException(404, "Property not found")
        update: dict = {"verified": data.verified}
        if data.status:
            update["status"] = data.status
        if data.verified and prop.get("listing_source") == "pending":
            update["listing_source"] = "mandated"
        await db.properties.update_one({"id": property_id}, {"$set": update})
        await db.audit_log.insert_one(
            {
                "actor_id": user["id"],
                "actor_email": user["email"],
                "action": "approve_property" if data.verified else "reject_property",
                "target_id": property_id,
                "meta": update,
                "created_at": datetime.now(timezone.utc),
            }
        )
        return {"ok": True, "property_id": property_id, "update": update}

    @router.delete("/properties/{property_id}")
    async def delete_property(property_id: str, user: dict = Depends(require_admin)):
        res = await db.properties.delete_one({"id": property_id})
        if res.deleted_count == 0:
            raise HTTPException(404, "Property not found")
        await db.audit_log.insert_one(
            {
                "actor_id": user["id"],
                "actor_email": user["email"],
                "action": "delete_property",
                "target_id": property_id,
                "created_at": datetime.now(timezone.utc),
            }
        )
        return {"ok": True}

    @router.get("/users")
    async def list_users(q: Optional[str] = None, limit: int = 100, user: dict = Depends(require_admin)):
        query: dict = {}
        if q:
            query["$or"] = [
                {"email": {"$regex": q, "$options": "i"}},
                {"full_name": {"$regex": q, "$options": "i"}},
            ]
        docs = await db.users.find(query, {"_id": 0, "password_hash": 0}).sort("created_at", -1).limit(limit).to_list(limit)
        return docs

    @router.patch("/users/{user_id}/role")
    async def update_user_role(user_id: str, data: UserRoleIn, user: dict = Depends(require_admin)):
        target = await db.users.find_one({"id": user_id})
        if not target:
            raise HTTPException(404, "User not found")
        update: dict = {}
        if data.is_admin is not None:
            update["is_admin"] = data.is_admin
        if data.is_agent is not None:
            update["is_agent"] = data.is_agent
        if update:
            await db.users.update_one({"id": user_id}, {"$set": update})
        await db.audit_log.insert_one(
            {
                "actor_id": user["id"],
                "actor_email": user["email"],
                "action": "update_role",
                "target_id": user_id,
                "meta": update,
                "created_at": datetime.now(timezone.utc),
            }
        )
        return {"ok": True, "update": update}

    @router.get("/agents")
    async def list_agent_applications(
        status: Optional[str] = None, limit: int = 100, user: dict = Depends(require_admin)
    ):
        query: dict = {}
        if status:
            query["status"] = status
        docs = await db.agent_applications.find(query, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
        return docs

    @router.post("/agents/{user_id}/decision")
    async def agent_decision(
        user_id: str,
        decision: str,
        verification_level: Optional[int] = None,
        user: dict = Depends(require_admin),
    ):
        if decision not in ("approved", "rejected", "suspended", "pending"):
            raise HTTPException(400, "Invalid decision")
        update: dict = {"status": decision}
        if verification_level is not None:
            update["verification_level"] = max(1, min(3, verification_level))
        res = await db.agent_applications.update_one({"user_id": user_id}, {"$set": update})
        if res.matched_count == 0:
            raise HTTPException(404, "Agent application not found")
        await db.audit_log.insert_one(
            {
                "actor_id": user["id"],
                "actor_email": user["email"],
                "action": "agent_decision",
                "target_id": user_id,
                "meta": update,
                "created_at": datetime.now(timezone.utc),
            }
        )
        return {"ok": True, "user_id": user_id, "update": update}

    @router.get("/marketplace")
    async def admin_marketplace(
        category: Optional[str] = None, limit: int = 100, user: dict = Depends(require_admin)
    ):
        query: dict = {}
        if category:
            query["category"] = category
        docs = await db.marketplace.find(query, {"_id": 0}).limit(limit).to_list(limit)
        return docs

    @router.delete("/marketplace/{item_id}")
    async def delete_marketplace_item(item_id: str, user: dict = Depends(require_admin)):
        res = await db.marketplace.delete_one({"id": item_id})
        if res.deleted_count == 0:
            raise HTTPException(404, "Item not found")
        await db.audit_log.insert_one(
            {
                "actor_id": user["id"],
                "actor_email": user["email"],
                "action": "delete_marketplace_item",
                "target_id": item_id,
                "created_at": datetime.now(timezone.utc),
            }
        )
        return {"ok": True}

    @router.get("/orders")
    async def list_orders(limit: int = 100, user: dict = Depends(require_admin)):
        docs = await db.orders.find({}, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
        return docs

    @router.get("/audit-log")
    async def audit_log(limit: int = 100, user: dict = Depends(require_admin)):
        docs = await db.audit_log.find({}, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
        for d in docs:
            if isinstance(d.get("created_at"), datetime):
                d["created_at"] = d["created_at"].isoformat()
        return docs

    @router.get("/payments")
    async def list_payments(limit: int = 100, user: dict = Depends(require_admin)):
        docs = await db.payment_ledger.find({}, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
        return docs

    return router
