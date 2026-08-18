"""AMASS Property Identity — Phase 6A

Core infrastructure separating a physical PROPERTY (permanent identity)
from an agent's LISTING (commercial representation).

Collections (MongoDB, all with idempotent create_index in server.py):
  • properties_geo         — canonical physical property, 2dsphere on entrance_point
  • property_listings      — one property → many listings (agents, prices, statuses)
  • property_onboarding    — 5-stage wizard drafts, resumable + idempotent
  • property_audit_logs    — immutable trail (append-only)

The AMASS Property ID (`AMASS-{STATE}-{SEQ}`) is stable across:
  agent changes · listing changes · price changes · sale/rent status.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import List, Literal, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from motor.motor_asyncio import AsyncIOMotorDatabase


STATE_CODES = {
    "Lagos": "LAG", "FCT": "FCT", "Abuja": "FCT", "Oyo": "OYO", "Rivers": "RIV",
    "Kano": "KAN", "Kaduna": "KAD", "Ogun": "OGN", "Delta": "DEL", "Enugu": "ENU",
    "Anambra": "ANA", "Edo": "EDO", "Cross River": "CRR", "Akwa Ibom": "AKW",
    "Imo": "IMO", "Abia": "ABI", "Osun": "OSU", "Ondo": "OND", "Ekiti": "EKI",
    "Kwara": "KWA", "Kogi": "KOG", "Niger": "NIG", "Plateau": "PLA",
    "Nasarawa": "NAS", "Benue": "BEN", "Taraba": "TAR", "Adamawa": "ADA",
    "Bauchi": "BAU", "Gombe": "GOM", "Yobe": "YOB", "Borno": "BOR",
    "Jigawa": "JIG", "Katsina": "KAT", "Sokoto": "SOK", "Kebbi": "KEB",
    "Zamfara": "ZAM", "Bayelsa": "BAY", "Ebonyi": "EBO",
}
GPS_EXCELLENT_M = 10
GPS_WARNING_M = 25
GPS_POOR_M = 50


def _state_code(state: str) -> str:
    return STATE_CODES.get((state or "").strip(), (state or "NG")[:3].upper())


def _gps_status(accuracy: float, source: str) -> str:
    if source == "MAP_SELECTED":
        return "UNVERIFIED"
    if accuracy <= GPS_EXCELLENT_M:
        return "GPS_VERIFIED"
    if accuracy <= GPS_WARNING_M:
        return "CAPTURED"
    if accuracy <= GPS_POOR_M:
        return "CAPTURED"
    return "INVALID"


# ─── Pydantic ────────────────────────────────────────────────────
class GeoPoint(BaseModel):
    type: Literal["Point"] = "Point"
    coordinates: List[float]  # [lng, lat]


class LocationIn(BaseModel):
    latitude: float
    longitude: float
    accuracy_meters: float
    location_source: Literal["GPS", "NETWORK", "MAP_SELECTED", "ADDRESS_SEARCH", "MANUAL"] = "GPS"
    altitude: Optional[float] = None
    heading: Optional[float] = None
    speed: Optional[float] = None


class AddressIn(BaseModel):
    state: str
    lga: Optional[str] = None
    district: Optional[str] = None
    area: Optional[str] = None
    estate: Optional[str] = None
    street: Optional[str] = None
    house_number: Optional[str] = None
    landmark: Optional[str] = None
    raw_address: Optional[str] = None


class PropertyDetailsIn(BaseModel):
    property_type: str
    property_subtype: Optional[str] = None
    bedrooms: Optional[int] = None
    bathrooms: Optional[int] = None
    floors: Optional[int] = None
    land_size_sqm: Optional[int] = None
    building_size_sqm: Optional[int] = None
    amenities: List[str] = []
    year_built: Optional[int] = None


class ListingDetailsIn(BaseModel):
    listing_type: Literal["buy", "rent", "lease", "shortlet"]
    price: int
    currency: str = "NGN"
    description: Optional[str] = None
    title_document: Optional[str] = None
    representation_type: Optional[
        Literal["owner", "agent", "agency", "developer", "landlord"]
    ] = "agent"
    owner_name: Optional[str] = None
    owner_phone: Optional[str] = None


class SavePatchIn(BaseModel):
    """Typed body for PATCH /api/agent/properties/{oid}. Any mistyped key
    is rejected by Pydantic (extra=forbid), which prevents silent no-ops."""
    model_config = {"extra": "forbid"}
    details: Optional[PropertyDetailsIn] = None
    listing: Optional[ListingDetailsIn] = None
    media_ids: Optional[List[str]] = None


class OnboardingStartIn(BaseModel):
    client_submission_id: str = Field(..., min_length=8, max_length=64)


class OnboardingLocationIn(BaseModel):
    location: LocationIn
    address: Optional[AddressIn] = None


class SubmitIn(BaseModel):
    client_submission_id: str


class DuplicateCheckOut(BaseModel):
    candidates: list
    highest_score: int = 0
    action: Literal["allow", "possible_duplicate", "high_confidence_duplicate"]


def _normalize_address(a: dict) -> str:
    parts = [
        a.get("house_number"), a.get("street"), a.get("estate"),
        a.get("area"), a.get("lga"), a.get("state"),
    ]
    return " ".join(p.strip() for p in parts if p).lower()


async def _next_property_id(db, state_code: str) -> str:
    """Atomically increment the per-state counter → AMASS-XXX-00000123."""
    res = await db.property_id_counters.find_one_and_update(
        {"state_code": state_code},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True,
    )
    return f"AMASS-{state_code}-{res['seq']:08d}"


async def _audit(db, property_id: Optional[str], actor: dict, action: str,
                 old=None, new=None, reason: Optional[str] = None,
                 onboarding_id: Optional[str] = None) -> None:
    await db.property_audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "property_id": property_id,
        "onboarding_id": onboarding_id,
        "actor_id": actor.get("id") if actor else None,
        "actor_type": "admin" if (actor or {}).get("is_admin") else "agent",
        "action": action,
        "old_value": old,
        "new_value": new,
        "reason": reason,
        "created_at": datetime.now(timezone.utc),
    })


def register_property_identity_routes(db, require_auth, require_admin):
    router = APIRouter(prefix="/api/agent/properties", tags=["property-identity"])
    public = APIRouter(prefix="/api/properties-v2", tags=["property-identity-public"])

    # ═══ ONBOARDING WIZARD ═══════════════════════════════════════
    @router.post("/onboarding")
    async def start_onboarding(
        data: OnboardingStartIn = Body(...),
        user: dict = Depends(require_auth),
    ):
        """Idempotent onboarding start. Same client_submission_id → same draft."""
        existing = await db.property_onboarding.find_one(
            {"client_submission_id": data.client_submission_id, "agent_id": user["id"]},
            {"_id": 0},
        )
        if existing:
            return {"onboarding_id": existing["id"], "status": existing["status"], "resumed": True}
        now = datetime.now(timezone.utc)
        oid = str(uuid.uuid4())
        doc = {
            "id": oid,
            "client_submission_id": data.client_submission_id,
            "agent_id": user["id"],
            "status": "DRAFT",
            "location": None,
            "address": None,
            "details": None,
            "listing": None,
            "media_ids": [],
            "created_at": now,
            "updated_at": now,
        }
        await db.property_onboarding.insert_one(doc)
        doc.pop("_id", None)
        await _audit(db, None, user, "ONBOARDING_STARTED", new={"id": oid},
                     onboarding_id=oid)
        return {"onboarding_id": oid, "status": "DRAFT", "resumed": False}

    @router.post("/{oid}/location")
    async def save_location(
        oid: str, data: OnboardingLocationIn = Body(...),
        user: dict = Depends(require_auth),
    ):
        draft = await db.property_onboarding.find_one({"id": oid, "agent_id": user["id"]})
        if not draft:
            raise HTTPException(404, "Onboarding draft not found")
        loc = data.location
        status = _gps_status(loc.accuracy_meters, loc.location_source)
        location_doc = {
            "point": {"type": "Point", "coordinates": [loc.longitude, loc.latitude]},
            "latitude": loc.latitude, "longitude": loc.longitude,
            "accuracy_meters": loc.accuracy_meters,
            "location_source": loc.location_source,
            "altitude": loc.altitude, "heading": loc.heading, "speed": loc.speed,
            "captured_at": datetime.now(timezone.utc),
            "verification_status": status,
        }
        updates: dict = {
            "location": location_doc,
            "status": "LOCATION_CAPTURED",
            "updated_at": datetime.now(timezone.utc),
        }
        if data.address:
            addr = data.address.model_dump()
            addr["normalized_address"] = _normalize_address(addr)
            updates["address"] = addr
        await db.property_onboarding.update_one({"id": oid}, {"$set": updates})
        return {
            "ok": True, "status": "LOCATION_CAPTURED",
            "gps_verification": status,
            "gps_message": _gps_message(loc.accuracy_meters, loc.location_source),
        }

    @router.patch("/{oid}")
    async def save_details(
        oid: str,
        payload: SavePatchIn = Body(...),
        user: dict = Depends(require_auth),
    ):
        draft = await db.property_onboarding.find_one({"id": oid, "agent_id": user["id"]})
        if not draft:
            raise HTTPException(404, "Onboarding draft not found")
        updates: dict = {"updated_at": datetime.now(timezone.utc)}
        if payload.details is not None:
            updates["details"] = payload.details.model_dump()
            updates["status"] = "DETAILS_PENDING"
        if payload.listing is not None:
            updates["listing"] = payload.listing.model_dump()
        if payload.media_ids is not None:
            # Cap total photos at 20 to protect Mongo doc size / bandwidth.
            updates["media_ids"] = payload.media_ids[:20]
        if len(updates) == 1:  # only updated_at — nothing meaningful
            raise HTTPException(400, "Nothing to update — provide details, listing, or media_ids")
        await db.property_onboarding.update_one({"id": oid}, {"$set": updates})
        return {"ok": True}

    @router.get("/onboarding/{oid}")
    async def get_draft(oid: str, user: dict = Depends(require_auth)):
        d = await db.property_onboarding.find_one(
            {"id": oid, "agent_id": user["id"]}, {"_id": 0}
        )
        if not d:
            raise HTTPException(404, "Draft not found")
        return d

    @router.get("/onboarding")
    async def list_drafts(user: dict = Depends(require_auth)):
        return await db.property_onboarding.find(
            {"agent_id": user["id"], "status": {"$nin": ["APPROVED"]}}, {"_id": 0}
        ).sort("updated_at", -1).to_list(50)

    @router.post("/{oid}/submit")
    async def submit_onboarding(
        oid: str, data: SubmitIn = Body(...),
        user: dict = Depends(require_auth),
    ):
        """Idempotent submit. Creates properties_geo + property_listings.
        Duplicate detection is a separate call (Phase 6B) — this ships
        the Property Identity Core only."""
        draft = await db.property_onboarding.find_one({
            "id": oid, "agent_id": user["id"],
            "client_submission_id": data.client_submission_id,
        })
        if not draft:
            raise HTTPException(404, "Draft not found for this submission id")
        # Idempotent: if already submitted, return the same result.
        if draft.get("property_id") and draft.get("listing_id"):
            return {
                "ok": True, "idempotent": True,
                "amass_property_id": draft["amass_property_id"],
                "property_id": draft["property_id"],
                "listing_id": draft["listing_id"],
            }
        if not draft.get("location"):
            raise HTTPException(400, "Location required before submit")
        if not draft.get("details"):
            raise HTTPException(400, "Property details required before submit")
        if not draft.get("listing"):
            raise HTTPException(400, "Listing details required before submit")
        # ── Duplicate gate (Phase 6B) ─────────────────────────
        # If a high-confidence match was flagged and the agent hasn't
        # explicitly reviewed it, block. If they said "same_property",
        # attach the new listing to the existing canonical property
        # instead of creating a new one.
        dup = draft.get("duplicate_check") or {}
        decision = draft.get("duplicate_decision") or {}
        try:
            from duplicate_detection import _load_config as _dup_cfg_loader
            cfg = await _dup_cfg_loader(db)()
        except Exception:
            cfg = {"high_confidence_threshold": 80, "possible_threshold": 60}
        highest = int(dup.get("highest_score") or 0)
        if highest >= cfg["possible_threshold"] and not decision:
            raise HTTPException(
                409,
                {"error": "duplicate_decision_required",
                 "message": "A possible existing property was found — please review before submitting.",
                 "highest_score": highest,
                 "candidates": dup.get("candidates", [])[:3]},
            )
        if decision.get("decision") == "same_property":
            canonical = await db.properties_geo.find_one(
                {"amass_property_id": decision["same_as_amass_id"]}, {"_id": 0}
            )
            if not canonical:
                raise HTTPException(404, "The property you selected as 'same' no longer exists")
            now = datetime.now(timezone.utc)
            listing_doc = {
                "id": str(uuid.uuid4()),
                "property_id": canonical["property_uuid"],
                "amass_property_id": canonical["amass_property_id"],
                "agent_id": user["id"], "agency_id": None,
                "listing_type": draft["listing"]["listing_type"],
                "listing_status": "PENDING_REVIEW",
                "price": draft["listing"]["price"],
                "currency": draft["listing"].get("currency", "NGN"),
                "description": draft["listing"].get("description"),
                "representation_type": draft["listing"].get("representation_type", "agent"),
                "owner_name": draft["listing"].get("owner_name"),
                "owner_phone": draft["listing"].get("owner_phone"),
                "attached_via_duplicate_decision": True,
                "created_at": now, "updated_at": now,
            }
            await db.property_listings.insert_one(listing_doc)
            # Auto-create PENDING representation for this listing.
            try:
                from property_representations import create_pending_representation_from_listing
                await create_pending_representation_from_listing(
                    db,
                    property_uuid=canonical["property_uuid"],
                    amass_property_id=canonical["amass_property_id"],
                    listing_id=listing_doc["id"],
                    agent_id=user["id"],
                    representation_type=(
                        "owner" if (draft["listing"].get("representation_type") == "owner")
                        else draft["listing"].get("representation_type") or "agent_mandate"
                    ),
                    owner_name=draft["listing"].get("owner_name"),
                    owner_phone=draft["listing"].get("owner_phone"),
                )
            except Exception:
                pass
            await db.property_onboarding.update_one(
                {"id": oid},
                {"$set": {
                    "status": "SUBMITTED",
                    "amass_property_id": canonical["amass_property_id"],
                    "property_id": canonical["property_uuid"],
                    "listing_id": listing_doc["id"],
                    "submitted_at": now, "updated_at": now,
                }},
            )
            await _audit(db, canonical["property_uuid"], user, "LISTING_ATTACHED_TO_EXISTING",
                         new={"listing_id": listing_doc["id"],
                              "amass_property_id": canonical["amass_property_id"]},
                         onboarding_id=oid)
            return {
                "ok": True, "attached_to_existing": True,
                "amass_property_id": canonical["amass_property_id"],
                "property_id": canonical["property_uuid"],
                "listing_id": listing_doc["id"], "status": "SUBMITTED",
            }
        # ── Otherwise create a new canonical property ───────────
        addr = draft.get("address") or {}
        state = (addr.get("state") or "").strip() or "Lagos"
        sc = _state_code(state)
        amass_id = await _next_property_id(db, sc)
        prop_uuid = str(uuid.uuid4())
        now = datetime.now(timezone.utc)

        property_doc = {
            "property_uuid": prop_uuid,
            "amass_property_id": amass_id,
            "state": state,
            "lga": addr.get("lga"),
            "district": addr.get("district"),
            "area": addr.get("area"),
            "estate": addr.get("estate"),
            "street": addr.get("street"),
            "house_number": addr.get("house_number"),
            "landmark": addr.get("landmark"),
            "raw_address": addr.get("raw_address"),
            "normalized_address": addr.get("normalized_address"),
            "entrance_point": draft["location"]["point"],
            "gps_accuracy_meters": draft["location"]["accuracy_meters"],
            "location_source": draft["location"]["location_source"],
            "location_verification_status": draft["location"]["verification_status"],
            "property_identity_status": "PENDING_REVIEW",
            "physical_status": "ACTIVE",
            "property_type": (draft["details"] or {}).get("property_type"),
            "property_subtype": (draft["details"] or {}).get("property_subtype"),
            "details": draft["details"],
            "media_ids": draft.get("media_ids", []),
            "created_by": user["id"],
            "created_at": now,
            "updated_at": now,
            "aliases": [],
        }
        # Flag for admin review when the agent overrode a high-confidence duplicate.
        if highest >= cfg["high_confidence_threshold"] and decision.get("decision") == "not_same_property":
            property_doc["needs_admin_review"] = True
            property_doc["review_reason"] = f"Agent bypassed a high-confidence duplicate (score {highest})"
            property_doc["duplicate_score_at_creation"] = highest
        await db.properties_geo.insert_one(property_doc)

        listing_doc = {
            "id": str(uuid.uuid4()),
            "property_id": prop_uuid,
            "amass_property_id": amass_id,
            "agent_id": user["id"],
            "agency_id": None,
            "listing_type": draft["listing"]["listing_type"],
            "listing_status": "PENDING_REVIEW",
            "price": draft["listing"]["price"],
            "currency": draft["listing"].get("currency", "NGN"),
            "description": draft["listing"].get("description"),
            "representation_type": draft["listing"].get("representation_type", "agent"),
            "owner_name": draft["listing"].get("owner_name"),
            "owner_phone": draft["listing"].get("owner_phone"),
            "created_at": now,
            "updated_at": now,
        }
        await db.property_listings.insert_one(listing_doc)
        # Auto-create PENDING representation for this new listing.
        try:
            from property_representations import create_pending_representation_from_listing
            await create_pending_representation_from_listing(
                db,
                property_uuid=prop_uuid,
                amass_property_id=amass_id,
                listing_id=listing_doc["id"],
                agent_id=user["id"],
                representation_type=(
                    "owner" if (draft["listing"].get("representation_type") == "owner")
                    else draft["listing"].get("representation_type") or "agent_mandate"
                ),
                owner_name=draft["listing"].get("owner_name"),
                owner_phone=draft["listing"].get("owner_phone"),
            )
        except Exception:
            pass
        await db.property_onboarding.update_one(
            {"id": oid},
            {"$set": {
                "status": "SUBMITTED", "amass_property_id": amass_id,
                "property_id": prop_uuid, "listing_id": listing_doc["id"],
                "submitted_at": now, "updated_at": now,
            }},
        )
        await _audit(db, prop_uuid, user, "PROPERTY_CREATED",
                     new={"amass_property_id": amass_id}, onboarding_id=oid)
        await _audit(db, prop_uuid, user, "LISTING_CREATED",
                     new={"listing_id": listing_doc["id"]}, onboarding_id=oid)
        return {
            "ok": True, "amass_property_id": amass_id,
            "property_id": prop_uuid, "listing_id": listing_doc["id"],
            "status": "SUBMITTED",
        }

    # ═══ PROPERTY CANONICAL LOOKUPS (public) ═══════════════════════
    async def _resolve_canonical(amass_id: str):
        """Follow merges + aliases so any historical AMASS ID resolves to the
        current canonical property doc. Returns (canonical_doc, resolved_via)."""
        p = await db.properties_geo.find_one({"amass_property_id": amass_id}, {"_id": 0})
        # If the direct hit is a merged loser, follow the pointer to the winner.
        if p and p.get("physical_status") == "MERGED" and p.get("merged_into_amass_id"):
            target = p["merged_into_amass_id"]
            winner = await db.properties_geo.find_one(
                {"amass_property_id": target}, {"_id": 0}
            )
            if winner:
                return winner, "merged"
        if p:
            return p, "direct"
        # Alias lookup — merged properties expose their old id via winner.aliases[]
        p = await db.properties_geo.find_one({"aliases": amass_id}, {"_id": 0})
        if p:
            return p, "alias"
        return None, None

    @public.get("/{amass_id}")
    async def get_property_by_amass_id(amass_id: str):
        p, via = await _resolve_canonical(amass_id)
        if not p:
            raise HTTPException(404, "Property not found")
        # Strip sensitive fields for public view
        p.pop("created_by", None)
        if via in ("alias", "merged"):
            return {**p, "resolved_via_alias": True, "requested_id": amass_id}
        return p

    @public.get("/{amass_id}/listings")
    async def property_listings(amass_id: str):
        p, _ = await _resolve_canonical(amass_id)
        if not p:
            raise HTTPException(404, "Property not found")
        return await db.property_listings.find(
            {"property_id": p["property_uuid"]}, {"_id": 0}
        ).sort("created_at", -1).to_list(100)

    # ═══ AGENT DASHBOARD ═══════════════════════════════════════════
    @router.get("/mine")
    async def my_properties(user: dict = Depends(require_auth)):
        listings = await db.property_listings.find(
            {"agent_id": user["id"]}, {"_id": 0}
        ).to_list(500)
        prop_ids = list({l["property_id"] for l in listings})
        props = await db.properties_geo.find(
            {"property_uuid": {"$in": prop_ids}}, {"_id": 0}
        ).to_list(500) if prop_ids else []
        pmap = {p["property_uuid"]: p for p in props}
        return [{**l, "property": pmap.get(l["property_id"])} for l in listings]

    return router, public


def _gps_message(accuracy: float, source: str) -> str:
    if source == "MAP_SELECTED":
        return "Location selected on map. Capture GPS at the property for verification."
    if accuracy <= GPS_EXCELLENT_M:
        return f"Excellent GPS accuracy ({accuracy:.0f}m). You're good to continue."
    if accuracy <= GPS_WARNING_M:
        return f"Good GPS accuracy ({accuracy:.0f}m). You can continue."
    if accuracy <= GPS_POOR_M:
        return f"Low accuracy ({accuracy:.0f}m). Move closer to the entrance or continue and confirm on the map."
    return f"Poor accuracy ({accuracy:.0f}m). Please move to an open area or select the location on the map."
