"""AMASS Property Representations & Claims — Phase 6C

Separation of concerns (per user data-model rule):
  • property_representations — WHO represents a physical property (relationship)
  • property_claims           — supporting evidence/documents for a representation

Lifecycle of a representation:
  PENDING → (DOCS_REQUESTED) → APPROVED → (SUSPENDED / REVOKED)
                            ↘ REJECTED

Representation types (extensible):
  owner · agent_mandate · landlord · developer · property_manager · agency

Every listing created via the wizard auto-generates a PENDING representation.
The agent then uploads mandate/authorisation via a claim; admin decides.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import List, Literal, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from motor.motor_asyncio import AsyncIOMotorDatabase


REPRESENTATION_TYPES = (
    "owner", "agent_mandate", "landlord", "developer", "property_manager", "agency",
)
REP_STATUS_ACTIVE = {"APPROVED"}
REP_STATUS_ALL = {"PENDING", "DOCS_REQUESTED", "APPROVED", "REJECTED", "SUSPENDED", "REVOKED"}


class ClaimSubmitIn(BaseModel):
    representation_type: Literal[
        "owner", "agent_mandate", "landlord", "developer", "property_manager", "agency"
    ] = "agent_mandate"
    mandate_type: Optional[Literal["exclusive", "sole", "open", "verbal", "written"]] = None
    mandate_expiry: Optional[str] = None  # ISO date
    documents: List[str] = Field(default_factory=list)  # base64 or URLs
    owner_name: Optional[str] = None
    owner_phone: Optional[str] = None
    notes: Optional[str] = None


class AdminDecisionIn(BaseModel):
    action: Literal["approve", "reject", "request_docs", "suspend", "revoke"]
    reason: Optional[str] = None
    valid_until: Optional[str] = None  # ISO date, used for approve


class RepStatusPatchIn(BaseModel):
    documents: Optional[List[str]] = None
    mandate_type: Optional[str] = None
    mandate_expiry: Optional[str] = None
    notes: Optional[str] = None


async def _audit(db, property_id, actor, action, new=None, old=None, reason=None):
    await db.property_audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "property_id": property_id,
        "actor_id": (actor or {}).get("id"),
        "actor_type": "admin" if (actor or {}).get("is_admin") else "agent",
        "action": action,
        "old_value": old,
        "new_value": new,
        "reason": reason,
        "created_at": datetime.now(timezone.utc),
    })


async def create_pending_representation_from_listing(
    db: AsyncIOMotorDatabase,
    *,
    property_uuid: str,
    amass_property_id: str,
    listing_id: str,
    agent_id: str,
    representation_type: str = "agent_mandate",
    owner_name: Optional[str] = None,
    owner_phone: Optional[str] = None,
    autocreated_by_wizard: bool = True,
) -> dict:
    """Called from the wizard submit path. Idempotent per (property, listing, agent)."""
    if representation_type not in REPRESENTATION_TYPES:
        representation_type = "agent_mandate"
    # Idempotency: if a rep already exists for this listing, keep it.
    existing = await db.property_representations.find_one(
        {"listing_id": listing_id, "user_id": agent_id}, {"_id": 0}
    )
    if existing:
        return existing
    now = datetime.now(timezone.utc)
    doc = {
        "id": str(uuid.uuid4()),
        "property_id": property_uuid,
        "amass_property_id": amass_property_id,
        "listing_id": listing_id,
        "user_id": agent_id,
        "representation_type": representation_type,
        "status": "PENDING",
        "owner_name": owner_name,
        "owner_phone": owner_phone,
        "documents": [],
        "mandate_type": None,
        "mandate_expiry": None,
        "notes": None,
        "autocreated_by_wizard": autocreated_by_wizard,
        "submitted_at": now,
        "decided_at": None,
        "decided_by": None,
        "decision_reason": None,
        "history": [{"status": "PENDING", "at": now, "actor_id": agent_id, "reason": "auto-created from listing"}],
        "created_at": now,
        "updated_at": now,
    }
    await db.property_representations.insert_one(doc)
    await _audit(db, property_uuid, {"id": agent_id}, "REPRESENTATION_CREATED",
                 new={"representation_id": doc["id"], "type": representation_type})
    return doc


def register_representation_routes(db, require_auth, require_admin, optional_user=None):
    agent = APIRouter(prefix="/api/agent/representations", tags=["representations-agent"])
    public = APIRouter(prefix="/api/properties-v2", tags=["representations-public"])
    admin = APIRouter(prefix="/api/admin/representations", tags=["representations-admin"])

    # ─── AGENT: submit a claim (proof for their pending representation) ─
    @agent.post("/{rep_id}/claim")
    async def submit_claim(
        rep_id: str,
        data: ClaimSubmitIn = Body(...),
        user: dict = Depends(require_auth),
    ):
        rep = await db.property_representations.find_one(
            {"id": rep_id, "user_id": user["id"]}, {"_id": 0}
        )
        if not rep:
            raise HTTPException(404, "Representation not found")
        if rep["status"] in ("REVOKED", "REJECTED"):
            raise HTTPException(400, "This representation is closed and cannot be updated")
        # A claim on an already-APPROVED representation is a re-verification
        # attempt (new mandate/expiry/docs). Move it back to PENDING and audit.
        force_pending = rep["status"] == "APPROVED"
        now = datetime.now(timezone.utc)
        claim = {
            "id": str(uuid.uuid4()),
            "representation_id": rep_id,
            "property_id": rep["property_id"],
            "amass_property_id": rep["amass_property_id"],
            "user_id": user["id"],
            "documents": data.documents[:12],  # cap
            "mandate_type": data.mandate_type,
            "mandate_expiry": data.mandate_expiry,
            "owner_name": data.owner_name,
            "owner_phone": data.owner_phone,
            "notes": data.notes,
            "status": "SUBMITTED",
            "submitted_at": now,
            "reviewed_by": None,
            "reviewed_at": None,
            "review_notes": None,
        }
        await db.property_claims.insert_one(claim)

        # Denormalise the most recent claim onto the representation for quick
        # admin review + move status forward if it was DOCS_REQUESTED.
        rep_updates: dict = {
            "documents": data.documents[:12] or rep.get("documents") or [],
            "mandate_type": data.mandate_type or rep.get("mandate_type"),
            "mandate_expiry": data.mandate_expiry or rep.get("mandate_expiry"),
            "owner_name": data.owner_name or rep.get("owner_name"),
            "owner_phone": data.owner_phone or rep.get("owner_phone"),
            "notes": data.notes or rep.get("notes"),
            "updated_at": now,
        }
        if rep["status"] == "DOCS_REQUESTED" or force_pending:
            rep_updates["status"] = "PENDING"
        await db.property_representations.update_one(
            {"id": rep_id},
            {"$set": rep_updates,
             "$push": {"history": {
                 "status": rep_updates.get("status", rep["status"]),
                 "at": now, "actor_id": user["id"],
                 "reason": "claim submitted",
             }}},
        )
        await _audit(db, rep["property_id"], user, "CLAIM_SUBMITTED",
                     new={"claim_id": claim["id"], "representation_id": rep_id})
        return {"ok": True, "claim_id": claim["id"], "status": rep_updates.get("status", rep["status"])}

    @agent.get("/mine")
    async def my_representations(
        status: Optional[str] = Query(None),
        user: dict = Depends(require_auth),
    ):
        q: dict = {"user_id": user["id"]}
        if status:
            q["status"] = status.upper()
        reps = await db.property_representations.find(q, {"_id": 0}) \
            .sort("submitted_at", -1).to_list(200)
        # attach property + listing preview for the UI
        prop_ids = list({r["property_id"] for r in reps})
        props = await db.properties_geo.find(
            {"property_uuid": {"$in": prop_ids}}, {"_id": 0}
        ).to_list(500) if prop_ids else []
        pmap = {p["property_uuid"]: p for p in props}
        listing_ids = [r["listing_id"] for r in reps if r.get("listing_id")]
        listings = await db.property_listings.find(
            {"id": {"$in": listing_ids}}, {"_id": 0}
        ).to_list(500) if listing_ids else []
        lmap = {l["id"]: l for l in listings}
        return [
            {**r, "property": pmap.get(r["property_id"]), "listing": lmap.get(r.get("listing_id"))}
            for r in reps
        ]

    @agent.get("/{rep_id}")
    async def get_my_representation(rep_id: str, user: dict = Depends(require_auth)):
        rep = await db.property_representations.find_one(
            {"id": rep_id, "user_id": user["id"]}, {"_id": 0}
        )
        if not rep:
            raise HTTPException(404, "Not found")
        claims = await db.property_claims.find(
            {"representation_id": rep_id}, {"_id": 0}
        ).sort("submitted_at", -1).to_list(50)
        return {**rep, "claims": claims}

    @agent.patch("/{rep_id}")
    async def patch_my_representation(
        rep_id: str,
        data: RepStatusPatchIn = Body(...),
        user: dict = Depends(require_auth),
    ):
        rep = await db.property_representations.find_one(
            {"id": rep_id, "user_id": user["id"]}, {"_id": 0}
        )
        if not rep:
            raise HTTPException(404, "Not found")
        if rep["status"] in ("REVOKED", "REJECTED"):
            raise HTTPException(400, "Closed")
        updates = {k: v for k, v in data.model_dump().items() if v is not None}
        if not updates:
            raise HTTPException(400, "Nothing to update")
        updates["updated_at"] = datetime.now(timezone.utc)
        await db.property_representations.update_one({"id": rep_id}, {"$set": updates})
        return {"ok": True}

    # ─── PUBLIC: list APPROVED representations only (with agent public info) ─
    @public.get("/{amass_id}/representations")
    async def public_reps(amass_id: str):
        p = await db.properties_geo.find_one(
            {"$or": [{"amass_property_id": amass_id}, {"aliases": amass_id}]},
            {"_id": 0, "property_uuid": 1},
        )
        if not p:
            raise HTTPException(404, "Property not found")
        reps = await db.property_representations.find(
            {"property_id": p["property_uuid"], "status": "APPROVED"}, {"_id": 0}
        ).to_list(50)
        # Lightweight agent profile join
        user_ids = list({r["user_id"] for r in reps})
        agents = await db.agent_applications.find(
            {"user_id": {"$in": user_ids}}, {"_id": 0}
        ).to_list(100) if user_ids else []
        amap = {a["user_id"]: a for a in agents}
        out = []
        for r in reps:
            a = amap.get(r["user_id"], {})
            out.append({
                "id": r["id"],
                "representation_type": r["representation_type"],
                "status": r["status"],
                "mandate_type": r.get("mandate_type"),
                "mandate_expiry": r.get("mandate_expiry"),
                "decided_at": r.get("decided_at"),
                "agent": {
                    "user_id": r["user_id"],
                    "full_name": a.get("full_name"),
                    "agency_name": a.get("agency_name"),
                    "avatar_url": a.get("avatar_url"),
                    "verification_level": a.get("verification_level", 1),
                    "slug": a.get("slug"),
                    "rating": a.get("rating", 0),
                    "reviews_count": a.get("reviews_count", 0),
                } if a else {"user_id": r["user_id"]},
            })
        return out

    # ─── ADMIN: queue + decision ────────────────────────────────
    @admin.get("/queue")
    async def admin_queue(
        status: str = Query("PENDING"),
        limit: int = Query(50, ge=1, le=200),
        _=Depends(require_admin),
    ):
        s = status.upper()
        if s not in REP_STATUS_ALL:
            raise HTTPException(400, "Invalid status")
        reps = await db.property_representations.find({"status": s}, {"_id": 0}) \
            .sort("submitted_at", -1).limit(limit).to_list(limit)
        # attach agent + property preview
        prop_ids = list({r["property_id"] for r in reps})
        user_ids = list({r["user_id"] for r in reps})
        props = await db.properties_geo.find(
            {"property_uuid": {"$in": prop_ids}}, {"_id": 0}
        ).to_list(500) if prop_ids else []
        pmap = {p["property_uuid"]: p for p in props}
        agents = await db.agent_applications.find(
            {"user_id": {"$in": user_ids}}, {"_id": 0}
        ).to_list(500) if user_ids else []
        amap = {a["user_id"]: a for a in agents}
        for r in reps:
            r["property_preview"] = pmap.get(r["property_id"])
            r["agent_preview"] = amap.get(r["user_id"])
        return reps

    @admin.post("/{rep_id}/decide")
    async def admin_decide(
        rep_id: str,
        data: AdminDecisionIn = Body(...),
        admin: dict = Depends(require_admin),
    ):
        rep = await db.property_representations.find_one({"id": rep_id}, {"_id": 0})
        if not rep:
            raise HTTPException(404, "Not found")

        status_map = {
            "approve": "APPROVED",
            "reject": "REJECTED",
            "request_docs": "DOCS_REQUESTED",
            "suspend": "SUSPENDED",
            "revoke": "REVOKED",
        }
        new_status = status_map[data.action]
        if new_status == rep["status"]:
            return {"ok": True, "already": True, "status": new_status}

        now = datetime.now(timezone.utc)
        updates: dict = {
            "status": new_status,
            "decided_at": now,
            "decided_by": admin["id"],
            "decision_reason": data.reason,
            "updated_at": now,
        }
        if new_status == "APPROVED":
            updates["approved_at"] = now
            if data.valid_until:
                updates["mandate_expiry"] = data.valid_until

        await db.property_representations.update_one(
            {"id": rep_id},
            {"$set": updates,
             "$push": {"history": {
                 "status": new_status, "at": now, "actor_id": admin["id"],
                 "reason": data.reason,
             }}},
        )
        # Audit
        await _audit(db, rep["property_id"], admin, f"REPRESENTATION_{new_status}",
                     new={"representation_id": rep_id}, reason=data.reason)

        # Public-facing property status touch-up when the first mandate is approved
        if new_status == "APPROVED":
            await db.properties_geo.update_one(
                {"property_uuid": rep["property_id"]},
                {"$set": {"has_verified_representation": True, "updated_at": now}},
            )
        # Tell the agent about the admin decision (Notification Center → "Admin decisions").
        try:
            from notification_center import emit
            copy = {
                "APPROVED": ("Your mandate was approved", "Your representation is now live on the Property Passport."),
                "REJECTED": ("Your mandate was declined", data.reason or "Review the reason and resubmit your documents."),
                "DOCS_REQUESTED": ("More documents needed", data.reason or "An admin asked for additional mandate documents."),
                "SUSPENDED": ("Your mandate was suspended", data.reason or "Contact support if you believe this is a mistake."),
                "REVOKED": ("Your mandate was revoked", data.reason or "Your representation has been removed."),
            }[new_status]
            await emit(
                db, rep.get("user_id") or rep.get("agent_id"), "REPRESENTATION_DECISION", copy[0], copy[1],
                {"representation_id": rep_id, "status": new_status, "amass_property_id": rep.get("amass_property_id"), "property_id": rep.get("property_id")},
                dedupe_key=f"rep:{rep_id}:{new_status}:{now.date().isoformat()}",
                action_url=f"/property-passport/{rep['amass_property_id']}" if rep.get("amass_property_id") else "/agent-dashboard",
            )
        except Exception:
            pass
        return {"ok": True, "status": new_status}

    return agent, public, admin
