"""
Agent listing manager — one place to run every listing: boost status, real views, saves and leads
(chats started from the home · paid MASS unlocks · inspection requests), title-document status and
quick status actions (mark sold / hide / relist). Read-only over money: unlocks are counted from
entitlements, never created or changed here.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from kyc_documents import docs_summary
from promotions import active_promotion, annotate_promotion


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _dt(v) -> Optional[datetime]:
    if v is None:
        return None
    if isinstance(v, datetime):
        return v if v.tzinfo else v.replace(tzinfo=timezone.utc)
    try:
        d = datetime.fromisoformat(str(v).replace("Z", "+00:00"))
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    except Exception:
        return None


def _iso(v) -> Optional[str]:
    d = _dt(v)
    return d.isoformat() if d else None


class StatusIn(BaseModel):
    status: Literal["available", "coming_soon", "sold", "withdrawn"]


def register_listing_manager_routes(db, get_current_user):
    router = APIRouter(prefix="/api/agent", tags=["agent-listing-manager"])

    async def _lead_rows(listing_ids: list[str], since: Optional[datetime] = None) -> dict[str, dict]:
        """Per-listing lead counts from real activity. Returns {pid: {chats, unlocks, inspections, last_at}}."""
        out: dict[str, dict] = {pid: {"chats": 0, "unlocks": 0, "inspections": 0, "last_at": None} for pid in listing_ids}

        def bump(pid: str, key: str, at) -> None:
            row = out.get(pid)
            if row is None:
                return
            d = _dt(at)
            if since and d and d < since:
                return
            row[key] += 1
            if d and (row["last_at"] is None or d > row["last_at"]):
                row["last_at"] = d

        async for c in db.conversations.find({"property_id": {"$in": listing_ids}}, {"_id": 0, "property_id": 1, "created_at": 1}):
            bump(c["property_id"], "chats", c.get("created_at"))
        async for e in db.entitlements.find({"feature_key": "property", "target_id": {"$in": listing_ids}, "status": "active"}, {"_id": 0, "target_id": 1, "created_at": 1}):
            bump(e["target_id"], "unlocks", e.get("created_at"))
        async for i in db.inspections.find({"property_id": {"$in": listing_ids}}, {"_id": 0, "property_id": 1, "created_at": 1}):
            bump(i["property_id"], "inspections", i.get("created_at"))
        return out

    @router.get("/manager")
    async def listing_manager(user: dict = Depends(get_current_user)):
        listings = await db.properties.find({"agent_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
        annotate_promotion(listings)
        ids = [p["id"] for p in listings]
        since = _now() - timedelta(days=30)
        views_total: dict[str, int] = {}
        views_30d: dict[str, int] = {}
        saves: dict[str, int] = {}
        if ids:
            async for row in db.property_events.aggregate([{"$match": {"property_id": {"$in": ids}, "event_type": "view"}}, {"$group": {"_id": "$property_id", "n": {"$sum": 1}}}]):
                views_total[row["_id"]] = row["n"]
            async for row in db.property_events.aggregate([{"$match": {"property_id": {"$in": ids}, "event_type": "view", "created_at": {"$gte": since}}}, {"$group": {"_id": "$property_id", "n": {"$sum": 1}}}]):
                views_30d[row["_id"]] = row["n"]
            async for row in db.favorites.aggregate([{"$match": {"property_id": {"$in": ids}}}, {"$group": {"_id": "$property_id", "n": {"$sum": 1}}}]):
                saves[row["_id"]] = row["n"]
        leads_all = await _lead_rows(ids)
        leads_30 = await _lead_rows(ids, since)
        pending_docs = {d["_id"]: d["n"] async for d in db.property_documents.aggregate([{"$match": {"property_id": {"$in": ids}, "status": "pending"}}, {"$group": {"_id": "$property_id", "n": {"$sum": 1}}}])} if ids else {}

        rows = []
        for p in listings:
            la = leads_all[p["id"]]
            l30 = leads_30[p["id"]]
            promo = p.get("promotion")
            rows.append({
                "id": p["id"], "title": p.get("title"), "cover": p.get("image") or ((p.get("images") or [None])[0]), "photo_count": len([u for u in (p.get("images") or []) if u]),
                "price": p.get("price"), "listing_type": p.get("listing_type"), "property_type": p.get("property_type"), "status": p.get("status", "available"),
                "verified": bool(p.get("verified")), "city": p.get("city"), "location": p.get("location"), "bedrooms": p.get("bedrooms"), "bathrooms": p.get("bathrooms"), "size_sqm": p.get("size_sqm"),
                "promotion": promo, "boost_active": bool(promo), "boost_tier": (promo or {}).get("tier"), "boost_days_left": (promo or {}).get("days_left"),
                "views_total": int(views_total.get(p["id"], 0)) + int(p.get("views_count") or 0), "views_30d": int(views_30d.get(p["id"], 0)), "saves": int(saves.get(p["id"], 0)),
                "leads": {"chats": la["chats"], "unlocks": la["unlocks"], "inspections": la["inspections"], "total": la["chats"] + la["unlocks"] + la["inspections"], "total_30d": l30["chats"] + l30["unlocks"] + l30["inspections"], "last_at": _iso(la["last_at"])},
                **docs_summary(p), "documents_pending": int(pending_docs.get(p["id"], 0)),
                "created_at": _iso(p.get("created_at")),
            })
        active = [r for r in rows if r["status"] not in ("sold", "withdrawn")]
        summary = {
            "listings": len(rows), "active": len(active), "boosted": sum(1 for r in rows if r["boost_active"]),
            "views_30d": sum(r["views_30d"] for r in rows), "saves": sum(r["saves"] for r in rows),
            "leads_30d": sum(r["leads"]["total_30d"] for r in rows), "leads_total": sum(r["leads"]["total"] for r in rows),
            "docs_pending": sum(1 for r in rows if r["documents_status"] == "pending"), "docs_missing": sum(1 for r in active if r["documents_status"] == "none"),
        }
        return {"summary": summary, "listings": rows}

    @router.get("/listings/{property_id}/leads")
    async def listing_leads(property_id: str, user: dict = Depends(get_current_user)):
        prop = await db.properties.find_one({"id": property_id}, {"_id": 0, "id": 1, "agent_id": 1, "title": 1})
        if not prop:
            raise HTTPException(404, "Listing not found")
        if prop.get("agent_id") != user["id"] and not user.get("is_admin"):
            raise HTTPException(403, "Not your listing")
        leads: list[dict] = []
        convs = await db.conversations.find({"property_id": property_id}, {"_id": 0}).to_list(300)
        ents = await db.entitlements.find({"feature_key": "property", "target_id": property_id, "status": "active"}, {"_id": 0}).to_list(300)
        insps = await db.inspections.find({"property_id": property_id}, {"_id": 0}).to_list(300)
        user_ids = set()
        for c in convs:
            user_ids |= {u for u in (c.get("participant_ids") or []) if u != user["id"]}
        user_ids |= {e["user_id"] for e in ents} | {i.get("user_id") for i in insps if i.get("user_id")}
        users = {u["id"]: u for u in await db.users.find({"id": {"$in": list(user_ids)}}, {"_id": 0, "id": 1, "full_name": 1, "avatar_url": 1, "identity_verified": 1}).to_list(500)}

        def person(uid: Optional[str]) -> dict:
            u = users.get(uid or "", {})
            return {"user_id": uid, "name": u.get("full_name") or "AMASS member", "avatar": u.get("avatar_url"), "identity_verified": bool(u.get("identity_verified"))}

        for c in convs:
            other = next((u for u in (c.get("participant_ids") or []) if u != user["id"]), None)
            leads.append({"id": f"chat-{c['id']}", "kind": "chat", **person(other), "detail": c.get("last_message_preview") or "Started a chat about this home", "at": _iso(c.get("last_message_at") or c.get("created_at")), "conversation_id": c["id"]})
        for e in ents:
            leads.append({"id": f"unlock-{e['id']}", "kind": "unlock", **person(e.get("user_id")), "detail": f"Unlocked the address & your contact · {int(e.get('amount_paid') or 0)} MASS", "at": _iso(e.get("created_at"))})
        for i in insps:
            leads.append({"id": f"insp-{i['id']}", "kind": "inspection", **person(i.get("user_id")), "detail": f"Inspection requested{(' for ' + str(i.get('preferred_date'))) if i.get('preferred_date') else ''} · {i.get('status', 'requested')}", "at": _iso(i.get("created_at")), "inspection_id": i["id"]})
        leads.sort(key=lambda l: l["at"] or "", reverse=True)
        return {"property_id": property_id, "title": prop.get("title"), "leads": leads, "counts": {"chats": len(convs), "unlocks": len(ents), "inspections": len(insps)}}

    @router.patch("/listings/{property_id}/status")
    async def set_listing_status(property_id: str, data: StatusIn, user: dict = Depends(get_current_user)):
        prop = await db.properties.find_one({"id": property_id}, {"_id": 0, "id": 1, "agent_id": 1, "status": 1})
        if not prop:
            raise HTTPException(404, "Listing not found")
        if prop.get("agent_id") != user["id"] and not user.get("is_admin"):
            raise HTTPException(403, "Not your listing")
        await db.properties.update_one({"id": property_id}, {"$set": {"status": data.status, "status_changed_at": _now()}})
        await db.property_audit_logs.insert_one({"id": __import__("uuid").uuid4().hex, "property_id": property_id, "actor_id": user["id"], "actor_type": "agent", "action": "status_change", "old_value": prop.get("status"), "new_value": data.status, "created_at": _now()})
        return {"id": property_id, "status": data.status}

    return router
