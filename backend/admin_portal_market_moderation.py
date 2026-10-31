"""Admin Portal — Market moderation: FIXA service providers and Declutter classifieds (/api/portal/market/fixa/*,
/api/portal/market/declutter/*). Gated by the existing `marketplace` permission module.

The actions are the exact same functions the in-app admin uses (fixa.approve_provider …, marketplace_v2.moderate_listing …),
so a decision made in the portal and one made in the app behave identically (status, notifications, logs).
"""
from __future__ import annotations

import re
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from staff_auth import now


class NoteIn(BaseModel):
    note: Optional[str] = Field(None, max_length=400)


class FixaResolveIn(BaseModel):
    outcome: Literal["resolved", "dismissed"] = "resolved"
    note: Optional[str] = Field(None, max_length=400)
    reinstate: bool = False


class DeclutterActionIn(BaseModel):
    action: Literal["pause_listing", "restore_listing", "remove_listing"]
    note: Optional[str] = Field(None, max_length=400)


class DeclutterResolveIn(BaseModel):
    action: Literal["dismiss", "remove_listing", "pause_listing", "restore_listing"]
    note: Optional[str] = Field(None, max_length=400)




def register_market_moderation_routes(db, require, audit) -> APIRouter:
    router = APIRouter()

    # ─── FIXA providers ───
    @router.get("/fixa/overview")
    async def fixa_overview(acc: dict = Depends(require("marketplace", "view"))):
        from fixa import moderation_overview

        return await moderation_overview(db)

    @router.get("/fixa/providers")
    async def fixa_providers(status: str = "pending", acc: dict = Depends(require("marketplace", "view"))):
        from fixa import moderation_applications

        items = await moderation_applications(db, status)
        return {"items": items, "count": len(items)}

    @router.post("/fixa/providers/{provider_id}/approve")
    async def fixa_approve(provider_id: str, body: Optional[NoteIn] = None, acc: dict = Depends(require("marketplace", "edit"))):
        from fixa import approve_provider

        out = await approve_provider(db, provider_id, acc, (body.note if body else "") or "")
        await audit(acc, "approved a FIXA provider", provider_id)
        return out

    @router.post("/fixa/providers/{provider_id}/reject")
    async def fixa_reject(provider_id: str, body: Optional[NoteIn] = None, acc: dict = Depends(require("marketplace", "edit"))):
        from fixa import reject_provider

        out = await reject_provider(db, provider_id, acc, (body.note if body else "") or "")
        await audit(acc, "rejected a FIXA application", provider_id)
        return out

    @router.post("/fixa/providers/{provider_id}/suspend")
    async def fixa_suspend(provider_id: str, body: Optional[NoteIn] = None, acc: dict = Depends(require("marketplace", "edit"))):
        from fixa import suspend_provider

        out = await suspend_provider(db, provider_id, acc, (body.note if body else "") or "")
        await audit(acc, "suspended a FIXA provider", provider_id)
        return out

    @router.post("/fixa/providers/{provider_id}/reinstate")
    async def fixa_reinstate(provider_id: str, acc: dict = Depends(require("marketplace", "edit"))):
        from fixa import reinstate_provider

        out = await reinstate_provider(db, provider_id, acc)
        await audit(acc, "reinstated a FIXA provider", provider_id)
        return out

    @router.get("/fixa/reports")
    async def fixa_reports(status: str = "open", acc: dict = Depends(require("marketplace", "view"))):
        from fixa import moderation_reports

        rows = await moderation_reports(db, status)
        return {"items": rows, "count": len(rows)}

    @router.post("/fixa/reports/{report_id}/resolve")
    async def fixa_resolve(report_id: str, body: FixaResolveIn, acc: dict = Depends(require("marketplace", "edit"))):
        from fixa import resolve_report

        out = await resolve_report(db, report_id, acc, body.outcome, body.note, body.reinstate)
        await audit(acc, f"{body.outcome} a FIXA report", report_id)
        return out

    # ─── Declutter classifieds ───
    DECLUTTER_PREVIEW = {"_id": 0, "id": 1, "name": 1, "image": 1, "images": 1, "price": 1, "city": 1, "status": 1, "category": 1, "subcategory": 1, "condition": 1, "seller_id": 1, "seller_name": 1, "posted_at": 1, "created_at": 1, "updated_at": 1, "paused_reason": 1, "removed_at": 1, "views": 1, "saves": 1}

    @router.get("/declutter/listings")
    async def declutter_listings(status: str = "active", q: str = "", seller_id: Optional[str] = None, limit: int = Query(100, ge=1, le=500), acc: dict = Depends(require("marketplace", "view"))):
        query: dict[str, Any] = {"category": {"$ne": "services"}}
        if status == "active":
            query["status"] = {"$nin": ["paused", "sold", "removed"]}
        elif status != "all":
            query["status"] = status
        if q.strip():
            rx = {"$regex": re.escape(q.strip()), "$options": "i"}
            query["$or"] = [{"name": rx}, {"seller_name": rx}, {"city": rx}]
        if seller_id:
            query["seller_id"] = seller_id
        rows = await db.marketplace.find(query, DECLUTTER_PREVIEW).sort([("posted_at", -1), ("created_at", -1)]).limit(limit).to_list(limit)
        ids = [r["id"] for r in rows]
        open_reports: dict[str, int] = {}
        if ids:
            async for g in db.marketplace_reports.aggregate([{"$match": {"item_id": {"$in": ids}, "status": "OPEN"}}, {"$group": {"_id": "$item_id", "n": {"$sum": 1}}}]):
                open_reports[g["_id"]] = g["n"]
        for r in rows:
            r["status"] = r.get("status") or "active"
            r["open_reports"] = open_reports.get(r["id"], 0)
        return {"items": rows, "count": len(rows)}

    @router.patch("/declutter/listings/{item_id}")
    async def declutter_moderate(item_id: str, body: DeclutterActionIn, acc: dict = Depends(require("marketplace", "edit"))):
        from marketplace_v2 import moderate_listing

        it = await moderate_listing(db, item_id, body.action)
        if body.action == "remove_listing":
            await db.marketplace_reports.update_many({"item_id": item_id, "status": "OPEN"}, {"$set": {"status": "RESOLVED", "resolution": "remove_listing", "resolution_note": (body.note or "").strip() or None, "resolved_by": acc["id"], "resolved_at": now().isoformat(), "updated_at": now().isoformat()}})
        verb = {"pause_listing": "paused", "restore_listing": "restored", "remove_listing": "removed"}[body.action]
        await audit(acc, f"{verb} Declutter listing “{it.get('name')}”", item_id, note=body.note)
        return {"ok": True, "action": body.action, "item_id": item_id}

    @router.get("/declutter/reports")
    async def declutter_reports(status: str = "OPEN", limit: int = Query(100, ge=1, le=300), acc: dict = Depends(require("marketplace", "view"))):
        from marketplace_v2 import moderation_reports

        return await moderation_reports(db, status.upper(), limit)

    @router.post("/declutter/reports/{report_id}/resolve")
    async def declutter_resolve(report_id: str, body: DeclutterResolveIn, acc: dict = Depends(require("marketplace", "edit"))):
        from marketplace_v2 import resolve_report

        out = await resolve_report(db, report_id, acc, body.action, body.note)
        await audit(acc, f"resolved a Declutter report ({body.action.replace('_', ' ')})", report_id)
        return out

    return router
