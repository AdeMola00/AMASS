"""AMASS Phase D-5 — Agent Task Queue + Territory + Verify-existing-lead wizard.

Flow:
  Candidate promoted (D-3/D-4)  →  create agent_verification_task
  Agent (in matching territory) →  claim task
  Agent on-site                  →  submit GPS + photo + verdict
  Task done                       →  properties_geo.location_verification_status
                                     bumped to VERIFIED / DISPUTED / ARCHIVED

Territory model: state + LGA list + optional areas + optional radius from
center point. If radius is set, we also compute distance-based eligibility.

Task auto-expires after N days (default 14, admin-configurable via
app_settings key `verification_task_expiry_days`).
"""
from __future__ import annotations

import math
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import Response
from pydantic import BaseModel, Field


TASK_STATUSES = ["OPEN", "CLAIMED", "IN_PROGRESS", "COMPLETED", "DISPUTED", "EXPIRED", "CANCELLED"]
VERDICTS = ["PROPERTY_EXISTS", "DIFFERENT_ADDRESS", "IS_DUPLICATE", "NOT_A_PROPERTY", "INACCESSIBLE"]


class TerritoryIn(BaseModel):
    state: str = Field(..., min_length=2, max_length=64)
    lgas: List[str] = Field(default_factory=list)
    areas: List[str] = Field(default_factory=list)
    center_lat: Optional[float] = None
    center_lng: Optional[float] = None
    radius_km: Optional[float] = Field(default=None, ge=0.5, le=200)
    is_active: bool = True


class VerifySubmitIn(BaseModel):
    verdict: str = Field(..., pattern="^(PROPERTY_EXISTS|DIFFERENT_ADDRESS|IS_DUPLICATE|NOT_A_PROPERTY|INACCESSIBLE)$")
    latitude: float
    longitude: float
    accuracy_meters: Optional[float] = None
    photo_data_url: Optional[str] = None  # data:image/jpeg;base64,...
    notes: Optional[str] = None
    corrected_address: Optional[Dict[str, Any]] = None  # {state, lga, area, street, ...}
    duplicate_of_amass_id: Optional[str] = None  # if verdict == IS_DUPLICATE


class ForceAssignIn(BaseModel):
    agent_id: str


# ────────────────────────── Helpers ───────────────────────────────
def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371.0
    dLat = math.radians(lat2 - lat1)
    dLng = math.radians(lng2 - lng1)
    a = (math.sin(dLat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dLng / 2) ** 2)
    return 2 * R * math.asin(math.sqrt(a))


def _gps_tier(accuracy_meters: Optional[float]) -> str:
    if accuracy_meters is None:
        return "unknown"
    if accuracy_meters <= 10: return "excellent"
    if accuracy_meters <= 25: return "warning"
    if accuracy_meters <= 50: return "poor"
    return "invalid"


async def create_verification_task_for_property(
    db, property_doc: Dict[str, Any], candidate_id: Optional[str] = None,
    created_by: Optional[str] = None, priority: str = "normal",
) -> Dict[str, Any]:
    """Idempotent — one open task per property_uuid at a time."""
    existing = await db.agent_verification_tasks.find_one(
        {"property_uuid": property_doc["property_uuid"],
         "status": {"$in": ["OPEN", "CLAIMED", "IN_PROGRESS"]}},
        {"_id": 0},
    )
    if existing:
        return existing

    from app_settings import get_setting
    settings = await get_setting(db, "verification_task_expiry_days")
    expiry_days = int((settings or {}).get("value", 14)) if isinstance(settings, dict) else 14
    now = datetime.now(timezone.utc)
    ep = property_doc.get("entrance_point") or {}
    coords = ep.get("coordinates") or [None, None]
    task = {
        "id": str(uuid.uuid4()),
        "task_type": "VERIFY_CANDIDATE" if candidate_id else "VERIFY_PROPERTY",
        "candidate_id": candidate_id,
        "amass_property_id": property_doc["amass_property_id"],
        "property_uuid": property_doc["property_uuid"],
        "state": property_doc.get("state"),
        "lga": property_doc.get("lga"),
        "area": property_doc.get("area"),
        "raw_address": property_doc.get("raw_address"),
        "property_type": property_doc.get("property_type"),
        "latitude": coords[1],
        "longitude": coords[0],
        "location": property_doc.get("entrance_point"),
        "status": "OPEN",
        "priority": priority,  # low | normal | high
        "assigned_agent_id": None,
        "claimed_at": None,
        "completed_at": None,
        "expires_at": now + timedelta(days=expiry_days),
        "verification_data": None,
        "created_by": created_by,
        "created_at": now,
        "updated_at": now,
    }
    await db.agent_verification_tasks.insert_one(task)
    task.pop("_id", None)
    # D-10: notify agents in matching territory (best-effort)
    try:
        from discovery_notifications import notify_task_assigned
        await notify_task_assigned(db, task)
    except Exception:
        pass
    return task


async def _territory_query(db, agent_id: str) -> Optional[Dict[str, Any]]:
    return await db.agent_territories.find_one({"agent_id": agent_id, "is_active": True}, {"_id": 0})


def _matches_territory(task: Dict[str, Any], territory: Dict[str, Any]) -> bool:
    """Territory match: state must match. LGA (if listed) must match.
    If radius_km set, task must be within radius of center."""
    if not territory:
        return False
    if (task.get("state") or "").lower() != (territory.get("state") or "").lower():
        return False
    lgas = [x.lower() for x in (territory.get("lgas") or [])]
    if lgas and (task.get("lga") or "").lower() not in lgas:
        return False
    center_lat = territory.get("center_lat")
    center_lng = territory.get("center_lng")
    radius = territory.get("radius_km")
    if center_lat is not None and center_lng is not None and radius:
        if task.get("latitude") is None or task.get("longitude") is None:
            return False
        d = _haversine_km(center_lat, center_lng, task["latitude"], task["longitude"])
        if d > radius:
            return False
    return True


async def _audit(db, property_uuid, actor, action, new=None, old=None, reason=None):
    await db.property_audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "property_id": property_uuid,
        "actor_id": (actor or {}).get("id"),
        "actor_type": "admin" if (actor or {}).get("is_admin") else "agent",
        "action": action,
        "old_value": old,
        "new_value": new,
        "reason": reason,
        "created_at": datetime.now(timezone.utc),
    })


# ────────────────────────── Router ────────────────────────────────
def register_agent_tasks_routes(db, get_current_user, require_admin):
    from object_storage import upload_photo_base64

    agent_router = APIRouter(prefix="/api/agent", tags=["agent-tasks"])
    admin_router = APIRouter(prefix="/api/admin/verification-tasks", tags=["agent-tasks-admin"])

    # ─── Territory ────────────────────────────────────────────────
    @agent_router.get("/territory/me")
    async def get_my_territory(user: dict = Depends(get_current_user)):
        t = await db.agent_territories.find_one({"agent_id": user["id"]}, {"_id": 0})
        return t or {"agent_id": user["id"], "state": None, "lgas": [], "areas": [],
                     "is_active": False}

    @agent_router.put("/territory/me")
    async def set_my_territory(data: TerritoryIn = Body(...), user: dict = Depends(get_current_user)):
        now = datetime.now(timezone.utc)
        doc = data.model_dump()
        doc.update({"agent_id": user["id"], "updated_at": now})
        r = await db.agent_territories.find_one({"agent_id": user["id"]}, {"_id": 0})
        if r:
            await db.agent_territories.update_one(
                {"agent_id": user["id"]}, {"$set": doc}
            )
        else:
            doc["id"] = str(uuid.uuid4())
            doc["created_at"] = now
            await db.agent_territories.insert_one(doc)
        doc.pop("_id", None)
        return doc

    # ─── Task Queue (agent-facing) ────────────────────────────────
    @agent_router.get("/verification-tasks")
    async def list_my_tasks(
        include_completed: bool = Query(False),
        limit: int = Query(50, ge=1, le=200),
        user: dict = Depends(get_current_user),
    ):
        """Returns:
          • claimed_by_me: tasks I've claimed (any status except EXPIRED)
          • open_in_territory: OPEN tasks in my territory
        """
        territory = await _territory_query(db, user["id"])
        claimed = await db.agent_verification_tasks.find(
            {"assigned_agent_id": user["id"],
             "status": {"$nin": ["EXPIRED"] if include_completed else ["EXPIRED", "COMPLETED", "CANCELLED"]}},
            {"_id": 0},
        ).sort("updated_at", -1).limit(limit).to_list(limit)

        open_in_territory: List[Dict[str, Any]] = []
        if territory and territory.get("state"):
            q = {"status": "OPEN", "state": territory["state"]}
            if territory.get("lgas"):
                q["lga"] = {"$in": territory["lgas"]}
            open_rows = await db.agent_verification_tasks.find(q, {"_id": 0}) \
                .sort([("priority", -1), ("created_at", -1)]).limit(limit).to_list(limit)
            # Radius filter
            for t in open_rows:
                if _matches_territory(t, territory):
                    if territory.get("center_lat") and territory.get("center_lng") and t.get("latitude"):
                        t["distance_km"] = round(_haversine_km(
                            territory["center_lat"], territory["center_lng"],
                            t["latitude"], t["longitude"]), 2)
                    open_in_territory.append(t)
            # Sort by distance if we computed one
            open_in_territory.sort(key=lambda x: x.get("distance_km", 9999))
        return {
            "territory": territory,
            "claimed_by_me": claimed,
            "open_in_territory": open_in_territory,
            "counts": {"claimed": len(claimed), "open": len(open_in_territory)},
        }

    @agent_router.get("/verification-tasks/{task_id}")
    async def get_task(task_id: str, user: dict = Depends(get_current_user)):
        t = await db.agent_verification_tasks.find_one({"id": task_id}, {"_id": 0})
        if not t:
            raise HTTPException(404, "Task not found")
        # Non-admin: only see if OPEN, or if it's yours
        if not user.get("is_admin"):
            if t["status"] != "OPEN" and t.get("assigned_agent_id") != user["id"]:
                raise HTTPException(403, "This task is claimed by another agent")
        # Hydrate matching AMASS property snapshot
        prop = await db.properties_geo.find_one(
            {"property_uuid": t["property_uuid"]},
            {"_id": 0, "amass_property_id": 1, "property_uuid": 1, "state": 1,
             "lga": 1, "area": 1, "estate": 1, "street": 1, "raw_address": 1,
             "property_type": 1, "location_verification_status": 1,
             "property_identity_status": 1, "entrance_point": 1, "media_ids": 1},
        )
        return {"task": t, "property": prop}

    @agent_router.post("/verification-tasks/{task_id}/claim")
    async def claim_task(task_id: str, user: dict = Depends(get_current_user)):
        # Atomic claim — only if OPEN
        r = await db.agent_verification_tasks.find_one_and_update(
            {"id": task_id, "status": "OPEN"},
            {"$set": {"status": "CLAIMED",
                      "assigned_agent_id": user["id"],
                      "claimed_at": datetime.now(timezone.utc),
                      "updated_at": datetime.now(timezone.utc)}},
            return_document=True,  # motor returns the updated doc when True
            projection={"_id": 0},
        )
        if not r:
            raise HTTPException(409, "Task not available (already claimed or expired)")
        return r

    @agent_router.post("/verification-tasks/{task_id}/release")
    async def release_task(task_id: str, user: dict = Depends(get_current_user)):
        r = await db.agent_verification_tasks.find_one_and_update(
            {"id": task_id, "assigned_agent_id": user["id"],
             "status": {"$in": ["CLAIMED", "IN_PROGRESS"]}},
            {"$set": {"status": "OPEN",
                      "assigned_agent_id": None,
                      "claimed_at": None,
                      "updated_at": datetime.now(timezone.utc)}},
            return_document=True,
            projection={"_id": 0},
        )
        if not r:
            raise HTTPException(404, "You don't own an active claim on this task")
        return r

    @agent_router.post("/verification-tasks/{task_id}/verify")
    async def submit_verification(
        task_id: str,
        data: VerifySubmitIn = Body(...),
        user: dict = Depends(get_current_user),
    ):
        t = await db.agent_verification_tasks.find_one({"id": task_id}, {"_id": 0})
        if not t:
            raise HTTPException(404, "Task not found")
        if t.get("assigned_agent_id") != user["id"] and not user.get("is_admin"):
            raise HTTPException(403, "You have not claimed this task")
        if t["status"] not in ("CLAIMED", "IN_PROGRESS"):
            raise HTTPException(400, f"Cannot verify a {t['status']} task")

        # 1) Upload photo (if provided) via Emergent Object Storage
        photo_path: Optional[str] = None
        if data.photo_data_url:
            photo_path = await upload_photo_base64(user["id"], data.photo_data_url)

        now = datetime.now(timezone.utc)
        # 2) Distance check between agent-submitted GPS and property.entrance_point
        prop = await db.properties_geo.find_one({"property_uuid": t["property_uuid"]}, {"_id": 0})
        if not prop:
            raise HTTPException(404, "Property not found")
        prop_ep = (prop.get("entrance_point") or {}).get("coordinates") or [None, None]
        drift_m = None
        if prop_ep[0] is not None and prop_ep[1] is not None:
            drift_m = int(_haversine_km(prop_ep[1], prop_ep[0], data.latitude, data.longitude) * 1000)

        verification_data = {
            "verdict": data.verdict,
            "latitude": data.latitude,
            "longitude": data.longitude,
            "accuracy_meters": data.accuracy_meters,
            "gps_tier": _gps_tier(data.accuracy_meters),
            "drift_from_pin_meters": drift_m,
            "photo_path": photo_path,
            "notes": data.notes,
            "corrected_address": data.corrected_address,
            "duplicate_of_amass_id": data.duplicate_of_amass_id,
            "submitted_at": now,
            "submitted_by": user["id"],
        }

        # 3) Update task + property based on verdict
        new_task_status = "COMPLETED"
        property_updates: Dict[str, Any] = {"updated_at": now}
        if data.verdict == "PROPERTY_EXISTS":
            property_updates["location_verification_status"] = "VERIFIED"
            property_updates["property_identity_status"] = "VERIFIED"
            property_updates["verified_at"] = now
            property_updates["verified_by"] = user["id"]
            if data.corrected_address:
                for k in ("state", "lga", "area", "estate", "street"):
                    if data.corrected_address.get(k):
                        property_updates[k] = data.corrected_address[k]
            # Refresh entrance point from agent's GPS if drift is significant AND accurate
            if drift_m is not None and drift_m > 25 and (data.accuracy_meters or 999) <= 25:
                property_updates["entrance_point"] = {
                    "type": "Point", "coordinates": [data.longitude, data.latitude],
                }
                property_updates["gps_accuracy_meters"] = data.accuracy_meters
                property_updates["location_source"] = "AGENT_ONSITE"
        elif data.verdict == "DIFFERENT_ADDRESS":
            property_updates["property_identity_status"] = "DISPUTED"
            new_task_status = "DISPUTED"
        elif data.verdict == "IS_DUPLICATE":
            property_updates["property_identity_status"] = "PENDING_REVIEW"
            property_updates["needs_admin_review"] = True
            property_updates["review_reason"] = f"Agent flagged as duplicate of {data.duplicate_of_amass_id}"
            new_task_status = "DISPUTED"
        elif data.verdict == "NOT_A_PROPERTY":
            property_updates["physical_status"] = "ARCHIVED"
            property_updates["property_identity_status"] = "REJECTED"
        elif data.verdict == "INACCESSIBLE":
            new_task_status = "OPEN"  # release for retry
            property_updates = {"updated_at": now}

        # Add photo to property.media_ids as a proof shot
        if photo_path and data.verdict == "PROPERTY_EXISTS":
            property_updates.setdefault("$addToSet", {})
            # We split the ops below

        # Persist property
        set_ops = {k: v for k, v in property_updates.items() if k != "$addToSet"}
        update_ops: Dict[str, Any] = {"$set": set_ops}
        if photo_path and data.verdict == "PROPERTY_EXISTS":
            update_ops["$addToSet"] = {"verification_photo_paths": photo_path}
        await db.properties_geo.update_one({"property_uuid": t["property_uuid"]}, update_ops)

        # Persist task
        task_set: Dict[str, Any] = {
            "status": new_task_status,
            "verification_data": verification_data,
            "updated_at": now,
        }
        if new_task_status in ("COMPLETED", "DISPUTED"):
            task_set["completed_at"] = now
        if new_task_status == "OPEN":
            task_set["assigned_agent_id"] = None
            task_set["claimed_at"] = None
        await db.agent_verification_tasks.update_one({"id": task_id}, {"$set": task_set})

        # If verdict says duplicate, also flag the candidate row (if any)
        if data.verdict == "IS_DUPLICATE" and t.get("candidate_id"):
            await db.property_candidates.update_one(
                {"id": t["candidate_id"]},
                {"$set": {"status": "PENDING_DEDUPLICATION",
                          "related_amass_property_id": data.duplicate_of_amass_id,
                          "review_notes": data.notes,
                          "updated_at": now}},
            )

        # Audit
        await _audit(db, t["property_uuid"], user, "PROPERTY_VERIFIED_BY_AGENT" if data.verdict == "PROPERTY_EXISTS" else f"AGENT_VERIFICATION_{data.verdict}",
                     new={"task_id": task_id, "verdict": data.verdict, "drift_m": drift_m,
                          "photo_path": photo_path})

        # D-6: recompute score + fraud flags (best-effort)
        try:
            from verification_scoring import compute_verification_score, evaluate_property_fraud
            fresh_prop = await db.properties_geo.find_one({"property_uuid": t["property_uuid"]}, {"_id": 0})
            if fresh_prop:
                await compute_verification_score(db, fresh_prop)
                await evaluate_property_fraud(db, t["property_uuid"])
        except Exception:
            pass

        # D-10: notify agent of verification win (only on completion)
        if new_task_status == "COMPLETED":
            try:
                from discovery_notifications import notify_verification_win
                await notify_verification_win(db, user["id"], t, drift_m)
            except Exception:
                pass

        # D-8: trigger valuation refresh (best-effort, only on verified)
        if data.verdict == "PROPERTY_EXISTS":
            try:
                from property_valuations import estimate_property_valuation
                await estimate_property_valuation(db, t["property_uuid"], triggered_by="verification")
            except Exception:
                pass

        return {
            "ok": True,
            "task_status": new_task_status,
            "property_status": property_updates.get("location_verification_status") or property_updates.get("property_identity_status"),
            "drift_from_pin_meters": drift_m,
            "photo_path": photo_path,
        }

    # ─── Admin ───────────────────────────────────────────────────
    @admin_router.get("")
    async def admin_list(
        status: Optional[str] = Query(None),
        state: Optional[str] = Query(None),
        agent_id: Optional[str] = Query(None),
        limit: int = Query(50, ge=1, le=200),
        _admin=Depends(require_admin),
    ):
        q: Dict[str, Any] = {}
        if status: q["status"] = status.upper()
        if state: q["state"] = state
        if agent_id: q["assigned_agent_id"] = agent_id
        rows = await db.agent_verification_tasks.find(q, {"_id": 0}) \
            .sort("created_at", -1).limit(limit).to_list(limit)
        counts_pipe = [{"$group": {"_id": "$status", "n": {"$sum": 1}}}]
        counts = {r["_id"]: r["n"] async for r in db.agent_verification_tasks.aggregate(counts_pipe)}
        return {"items": rows, "count": len(rows), "counts_by_status": counts}

    @admin_router.post("/{task_id}/assign")
    async def admin_force_assign(
        task_id: str,
        data: ForceAssignIn = Body(...),
        admin: dict = Depends(require_admin),
    ):
        r = await db.agent_verification_tasks.find_one_and_update(
            {"id": task_id, "status": {"$in": ["OPEN", "CLAIMED"]}},
            {"$set": {"status": "CLAIMED",
                      "assigned_agent_id": data.agent_id,
                      "claimed_at": datetime.now(timezone.utc),
                      "updated_at": datetime.now(timezone.utc)}},
            return_document=True, projection={"_id": 0},
        )
        if not r:
            raise HTTPException(404, "Task cannot be reassigned")
        return r

    @admin_router.post("/{task_id}/cancel")
    async def admin_cancel(
        task_id: str,
        reason: str = Body("cancelled by admin", embed=True),
        admin: dict = Depends(require_admin),
    ):
        r = await db.agent_verification_tasks.update_one(
            {"id": task_id, "status": {"$nin": ["COMPLETED", "CANCELLED"]}},
            {"$set": {"status": "CANCELLED", "cancelled_reason": reason,
                      "updated_at": datetime.now(timezone.utc)}},
        )
        if not r.matched_count:
            raise HTTPException(404, "Task not cancellable")
        return {"ok": True}

    @admin_router.post("/create-for-property/{amass_property_id}")
    async def admin_create_for_property(
        amass_property_id: str,
        priority: str = Body("normal", embed=True),
        admin: dict = Depends(require_admin),
    ):
        prop = await db.properties_geo.find_one({"amass_property_id": amass_property_id}, {"_id": 0})
        if not prop:
            raise HTTPException(404, "Property not found")
        task = await create_verification_task_for_property(
            db, prop, candidate_id=prop.get("candidate_id"),
            created_by=admin["id"], priority=priority,
        )
        return task

    return agent_router, admin_router


# ─── Startup helpers ─────────────────────────────────────────────
async def expire_stale_tasks(db):
    now = datetime.now(timezone.utc)
    r = await db.agent_verification_tasks.update_many(
        {"status": {"$in": ["OPEN", "CLAIMED", "IN_PROGRESS"]},
         "expires_at": {"$lt": now}},
        {"$set": {"status": "EXPIRED", "updated_at": now}},
    )
    return r.modified_count if hasattr(r, "modified_count") else 0
