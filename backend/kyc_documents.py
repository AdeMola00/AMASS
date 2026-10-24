"""
Documents & KYC — identity verification for every member and title documents per listing,
both reviewed by the AMASS team in the admin portal. Badges are only shown after a real review.

Collections
  identity_verifications  one row per user  {user_id, id_type, id_document_url, selfie_url, status, reason, ...}
  property_documents      many per listing  {property_id, agent_id, kind, url, status, reason, ...}

Flags written back
  users.identity_verified / identity_verified_at
  properties.documents_verified / documents_status / verified_document_kinds
Files live in private object storage (amass/uploads/{user_id}/…) and are served by /api/files (owner + admin).
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from object_storage import upload_photo_base64

ID_TYPES: dict[str, str] = {
    "nin": "NIN slip",
    "drivers_licence": "Driver's licence",
    "passport": "International passport",
    "voters_card": "Voter's card",
}
DOC_KINDS: dict[str, str] = {
    "c_of_o": "Certificate of Occupancy",
    "governors_consent": "Governor's Consent",
    "deed_of_assignment": "Deed of Assignment",
    "survey_plan": "Survey plan",
    "building_plan_approval": "Building plan approval",
    "mandate_letter": "Owner's mandate letter",
    "other": "Other title document",
}
STATUSES = ("pending", "approved", "rejected")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(v) -> Optional[str]:
    if v is None:
        return None
    return v.isoformat() if hasattr(v, "isoformat") else str(v)


async def _store(user_id: str, value: str) -> str:
    """Accept a data URL (uploaded now, private) or an already-uploaded /api/files URL."""
    v = (value or "").strip()
    if v.startswith("data:"):
        path = await upload_photo_base64(user_id, v, public=False)
        return f"/api/files/{path}"
    if v.startswith("/api/files/amass/") or v.startswith("http"):
        return v
    raise HTTPException(400, "Upload must be an image data URL or an uploaded file URL")


class IdentityIn(BaseModel):
    id_type: Literal["nin", "drivers_licence", "passport", "voters_card"]
    id_document: str = Field(min_length=10)
    selfie: str = Field(min_length=10)
    id_number_last4: Optional[str] = Field(default=None, max_length=4)


class DocumentIn(BaseModel):
    kind: Literal["c_of_o", "governors_consent", "deed_of_assignment", "survey_plan", "building_plan_approval", "mandate_letter", "other"]
    file: str = Field(min_length=10)
    title: Optional[str] = Field(default=None, max_length=80)


class ReviewIn(BaseModel):
    approve: bool
    reason: Optional[str] = Field(default=None, max_length=300)


def identity_public(row: Optional[dict]) -> dict:
    status = (row or {}).get("status") or "none"
    return {
        "status": status,
        "identity_verified": status == "approved",
        "id_type": (row or {}).get("id_type"),
        "id_type_label": ID_TYPES.get((row or {}).get("id_type") or "", None),
        "submitted_at": _iso((row or {}).get("submitted_at")),
        "reviewed_at": _iso((row or {}).get("reviewed_at")),
        "reason": (row or {}).get("reason"),
        "id_document_url": (row or {}).get("id_document_url"),
        "selfie_url": (row or {}).get("selfie_url"),
    }


def doc_public(d: dict) -> dict:
    return {
        "id": d["id"], "property_id": d["property_id"], "kind": d["kind"], "kind_label": DOC_KINDS.get(d["kind"], d["kind"]), "title": d.get("title"),
        "url": d.get("url"), "status": d.get("status"), "reason": d.get("reason"), "submitted_at": _iso(d.get("submitted_at")), "reviewed_at": _iso(d.get("reviewed_at")),
    }


async def recompute_property_docs(db, property_id: str) -> dict:
    docs = await db.property_documents.find({"property_id": property_id}, {"_id": 0, "kind": 1, "status": 1}).to_list(50)
    verified_kinds = sorted({d["kind"] for d in docs if d.get("status") == "approved"})
    if not docs:
        status = "none"
    elif verified_kinds and all(d.get("status") == "approved" for d in docs):
        status = "verified"
    elif any(d.get("status") == "pending" for d in docs):
        status = "pending"
    elif verified_kinds:
        status = "verified"  # at least one approved, the rest rejected
    else:
        status = "rejected"
    flags = {"documents_verified": bool(verified_kinds), "documents_status": status, "verified_document_kinds": verified_kinds}
    await db.properties.update_one({"id": property_id}, {"$set": flags})
    return flags


def docs_summary(prop: dict) -> dict:
    """Public, file-free trust summary stamped onto property payloads."""
    kinds = prop.get("verified_document_kinds") or []
    return {
        "documents_verified": bool(prop.get("documents_verified")),
        "documents_status": prop.get("documents_status") or "none",
        "verified_documents": [DOC_KINDS.get(k, k) for k in kinds],
    }


def register_kyc_routes(db, get_current_user, require_admin):
    router = APIRouter(prefix="/api", tags=["kyc"])

    async def _notify(user_id: str, kind: str, title: str, body: str, action_url: str):
        try:
            from notification_center import emit
            await emit(db, user_id, kind, title, body, category="admin", action_url=action_url)
        except Exception:
            pass

    # ── Identity (every member) ──
    @router.get("/kyc/me")
    async def kyc_me(user: dict = Depends(get_current_user)):
        row = await db.identity_verifications.find_one({"user_id": user["id"]}, {"_id": 0})
        out = identity_public(row)
        out["id_types"] = [{"key": k, "label": v} for k, v in ID_TYPES.items()]
        return out

    @router.post("/kyc/identity")
    async def submit_identity(data: IdentityIn, user: dict = Depends(get_current_user)):
        existing = await db.identity_verifications.find_one({"user_id": user["id"]}, {"_id": 0})
        if existing and existing.get("status") == "approved":
            raise HTTPException(409, "Your identity is already verified")
        if existing and existing.get("status") == "pending":
            raise HTTPException(409, "Your documents are already under review")
        id_url = await _store(user["id"], data.id_document)
        selfie_url = await _store(user["id"], data.selfie)
        now = _now()
        row = {
            "id": (existing or {}).get("id") or str(uuid.uuid4()), "user_id": user["id"], "id_type": data.id_type, "id_number_last4": data.id_number_last4,
            "id_document_url": id_url, "selfie_url": selfie_url, "status": "pending", "reason": None, "submitted_at": now, "reviewed_at": None, "reviewer_id": None,
            "attempts": int((existing or {}).get("attempts") or 0) + 1,
        }
        await db.identity_verifications.update_one({"user_id": user["id"]}, {"$set": row}, upsert=True)
        await db.users.update_one({"id": user["id"]}, {"$set": {"identity_verified": False, "identity_status": "pending"}})
        await _notify(user["id"], "IDENTITY_SUBMITTED", "Identity documents received", "The AMASS team reviews most submissions within one business day.", "/identity-verification")
        return identity_public(row)

    # ── Title documents per listing (owner uploads, public sees a file-free summary) ──
    @router.get("/properties/{property_id}/documents")
    async def list_documents(property_id: str, user: dict = Depends(get_current_user)):
        prop = await db.properties.find_one({"id": property_id}, {"_id": 0, "id": 1, "agent_id": 1, "title": 1, "documents_verified": 1, "documents_status": 1, "verified_document_kinds": 1})
        if not prop:
            raise HTTPException(404, "Property not found")
        is_owner = prop.get("agent_id") == user["id"] or bool(user.get("is_admin"))
        summary = docs_summary(prop)
        if not is_owner:
            return {**summary, "owner": False, "documents": [], "kinds": [{"key": k, "label": v} for k, v in DOC_KINDS.items()]}
        docs = await db.property_documents.find({"property_id": property_id}, {"_id": 0}).sort("submitted_at", -1).to_list(50)
        return {**summary, "owner": True, "documents": [doc_public(d) for d in docs], "kinds": [{"key": k, "label": v} for k, v in DOC_KINDS.items()]}

    @router.post("/properties/{property_id}/documents")
    async def upload_document(property_id: str, data: DocumentIn, user: dict = Depends(get_current_user)):
        prop = await db.properties.find_one({"id": property_id}, {"_id": 0, "id": 1, "agent_id": 1, "title": 1})
        if not prop:
            raise HTTPException(404, "Property not found")
        if prop.get("agent_id") != user["id"] and not user.get("is_admin"):
            raise HTTPException(403, "Only the listing agent can upload documents")
        # Documents belong to the listing's agent even when an admin uploads on their behalf
        # (so the agent can open the file, remove it while pending, and receives the review notification).
        owner_id = prop.get("agent_id") or user["id"]
        url = await _store(owner_id, data.file)
        doc = {
            "id": str(uuid.uuid4()), "property_id": property_id, "agent_id": owner_id, "uploaded_by": user["id"], "kind": data.kind, "title": (data.title or DOC_KINDS[data.kind])[:80],
            "url": url, "status": "pending", "reason": None, "submitted_at": _now(), "reviewed_at": None, "reviewer_id": None,
        }
        await db.property_documents.insert_one(dict(doc))
        flags = await recompute_property_docs(db, property_id)
        return {**doc_public(doc), **flags}

    @router.delete("/properties/{property_id}/documents/{doc_id}")
    async def delete_document(property_id: str, doc_id: str, user: dict = Depends(get_current_user)):
        doc = await db.property_documents.find_one({"id": doc_id, "property_id": property_id}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Document not found")
        if doc.get("agent_id") != user["id"] and not user.get("is_admin"):
            raise HTTPException(403, "Not your document")
        if doc.get("status") == "approved" and not user.get("is_admin"):
            raise HTTPException(409, "Verified documents can only be removed by AMASS")
        await db.property_documents.delete_one({"id": doc_id})
        return await recompute_property_docs(db, property_id)

    # ── Admin review queue ──
    @router.get("/admin/kyc/queue")
    async def admin_queue(status: str = "pending", _admin: dict = Depends(require_admin)):
        if status not in STATUSES:
            raise HTTPException(422, "status must be pending | approved | rejected")
        ids = await db.identity_verifications.find({"status": status}, {"_id": 0}).sort("submitted_at", 1).to_list(200)
        docs = await db.property_documents.find({"status": status}, {"_id": 0}).sort("submitted_at", 1).to_list(300)
        user_ids = {r["user_id"] for r in ids} | {d["agent_id"] for d in docs}
        users = {u["id"]: u for u in await db.users.find({"id": {"$in": list(user_ids)}}, {"_id": 0, "id": 1, "full_name": 1, "avatar_url": 1, "email": 1, "phone": 1, "is_agent": 1}).to_list(500)}
        props = {p["id"]: p for p in await db.properties.find({"id": {"$in": list({d["property_id"] for d in docs})}}, {"_id": 0, "id": 1, "title": 1, "city": 1, "location": 1, "images": 1, "image": 1}).to_list(500)}
        identity = []
        for r in ids:
            u = users.get(r["user_id"], {})
            identity.append({**identity_public(r), "id": r["id"], "user_id": r["user_id"], "full_name": u.get("full_name", "Member"), "avatar_url": u.get("avatar_url"), "email": u.get("email"), "phone": u.get("phone"), "is_agent": bool(u.get("is_agent")), "attempts": r.get("attempts", 1)})
        documents = []
        for d in docs:
            p = props.get(d["property_id"], {})
            u = users.get(d["agent_id"], {})
            documents.append({**doc_public(d), "property_title": p.get("title", "Listing"), "property_city": p.get("city"), "property_location": p.get("location"), "property_cover": p.get("image") or ((p.get("images") or [None])[0]), "agent_name": u.get("full_name", "Agent"), "agent_avatar": u.get("avatar_url"), "agent_id": d["agent_id"]})
        counts = {
            "identity_pending": await db.identity_verifications.count_documents({"status": "pending"}),
            "documents_pending": await db.property_documents.count_documents({"status": "pending"}),
        }
        return {"identity": identity, "documents": documents, "counts": counts}

    @router.post("/admin/kyc/identity/{user_id}/review")
    async def admin_review_identity(user_id: str, data: ReviewIn, admin: dict = Depends(require_admin)):
        row = await db.identity_verifications.find_one({"user_id": user_id}, {"_id": 0})
        if not row:
            raise HTTPException(404, "No identity submission for this user")
        if not data.approve and not (data.reason or "").strip():
            raise HTTPException(422, "A reason is required when rejecting")
        now = _now()
        status = "approved" if data.approve else "rejected"
        await db.identity_verifications.update_one({"user_id": user_id}, {"$set": {"status": status, "reason": None if data.approve else data.reason.strip(), "reviewed_at": now, "reviewer_id": admin["id"]}})
        await db.users.update_one({"id": user_id}, {"$set": {"identity_verified": data.approve, "identity_status": status, "identity_verified_at": now if data.approve else None}})
        if data.approve:
            # Agents: identity approval also lifts the agent profile to "Identity Verified" (level 2) when still at level 1.
            await db.agent_applications.update_one({"user_id": user_id, "verification_level": {"$lt": 2}}, {"$set": {"verification_level": 2, "updated_at": now}})
            await _notify(user_id, "IDENTITY_VERIFIED", "You're verified ✓", "Your identity check passed. Your verified badge now shows across AMASS.", "/identity-verification")
        else:
            await _notify(user_id, "IDENTITY_REJECTED", "Identity check needs another look", data.reason.strip(), "/identity-verification")
        await db.audit_log.insert_one({"id": str(uuid.uuid4()), "type": "kyc_identity_review", "actor": admin["id"], "user_id": user_id, "approve": data.approve, "reason": data.reason, "created_at": now})
        return identity_public({**row, "status": status, "reason": None if data.approve else data.reason, "reviewed_at": now})

    @router.post("/admin/kyc/documents/{doc_id}/review")
    async def admin_review_document(doc_id: str, data: ReviewIn, admin: dict = Depends(require_admin)):
        doc = await db.property_documents.find_one({"id": doc_id}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Document not found")
        if not data.approve and not (data.reason or "").strip():
            raise HTTPException(422, "A reason is required when rejecting")
        now = _now()
        status = "approved" if data.approve else "rejected"
        await db.property_documents.update_one({"id": doc_id}, {"$set": {"status": status, "reason": None if data.approve else data.reason.strip(), "reviewed_at": now, "reviewer_id": admin["id"]}})
        flags = await recompute_property_docs(db, doc["property_id"])
        prop = await db.properties.find_one({"id": doc["property_id"]}, {"_id": 0, "title": 1})
        label = DOC_KINDS.get(doc["kind"], "Document")
        if data.approve:
            await _notify(doc["agent_id"], "DOCS_VERIFIED", f"{label} verified", f"{(prop or {}).get('title', 'Your listing')} now carries the Title documents verified badge.", f"/agent/listing-docs/{doc['property_id']}")
        else:
            await _notify(doc["agent_id"], "DOCS_REJECTED", f"{label} not accepted", data.reason.strip(), f"/agent/listing-docs/{doc['property_id']}")
        await db.audit_log.insert_one({"id": str(uuid.uuid4()), "type": "kyc_document_review", "actor": admin["id"], "property_id": doc["property_id"], "doc_id": doc_id, "approve": data.approve, "reason": data.reason, "created_at": now})
        return {**doc_public({**doc, "status": status, "reason": None if data.approve else data.reason, "reviewed_at": now}), **flags}

    return router


async def ensure_kyc_indexes(db) -> None:
    await db.identity_verifications.create_index("user_id", unique=True)
    await db.identity_verifications.create_index([("status", 1), ("submitted_at", 1)])
    await db.property_documents.create_index("id", unique=True)
    await db.property_documents.create_index([("property_id", 1), ("status", 1)])
    await db.property_documents.create_index([("status", 1), ("submitted_at", 1)])
