"""AMASS Property Passport — Phase 6C

PUBLIC, SEO-friendly canonical page for a physical property.

The URL is AMASS-XXX-YYYYYYYY (stable — never changes even when agent,
price, listing status or representation change).

Visibility model:
  Every property has a `passport_visibility` document with per-field toggles
  set by admin. The public endpoint STRIPS everything not explicitly allowed.

Public defaults (safe):
  ✓ AMASS ID
  ✓ Neighbourhood-level location (state / lga / area / estate)
  ✓ Property type + physical characteristics
  ✓ Photos flagged as approved
  ✓ Current active listings (price + listing type, no seller phone)
  ✓ Verified/mandated representatives
  ✓ Public passport history events
  ✓ QR + share URLs

Never public by default:
  ✗ exact GPS coordinates (rounded to ~100m)
  ✗ street + house number
  ✗ raw_address
  ✗ private title docs, mandate docs
  ✗ owner personal contact
  ✗ internal duplicate-detection scores
  ✗ internal audit reasons
"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from motor.motor_asyncio import AsyncIOMotorDatabase


# Public event types that are safe to show in the timeline
PUBLIC_EVENT_TYPES = {
    "PROPERTY_CREATED",
    "PROPERTY_VERIFIED",
    "PROPERTY_ACTIVATED",
    "LISTING_CREATED",
    "LISTING_ATTACHED_TO_EXISTING",
    "LISTING_PRICE_UPDATED",
    "LISTING_STATUS_CHANGED",
    "LISTING_SOLD",
    "LISTING_RENTED",
    "LISTING_WITHDRAWN",
    "REPRESENTATION_APPROVED",
    "REPRESENTATION_REVOKED",
    "PROPERTY_MERGED",
}

# Nice human labels for the timeline (frontend can override)
EVENT_LABELS = {
    "PROPERTY_CREATED": "Property added to AMASS",
    "PROPERTY_VERIFIED": "Property verified",
    "PROPERTY_ACTIVATED": "Property activated",
    "LISTING_CREATED": "New listing published",
    "LISTING_ATTACHED_TO_EXISTING": "New agent listing added",
    "LISTING_PRICE_UPDATED": "Price updated",
    "LISTING_STATUS_CHANGED": "Listing status changed",
    "LISTING_SOLD": "Property marked sold",
    "LISTING_RENTED": "Property rented",
    "LISTING_WITHDRAWN": "Listing withdrawn",
    "REPRESENTATION_APPROVED": "Agent mandate approved",
    "REPRESENTATION_REVOKED": "Agent mandate revoked",
    "PROPERTY_MERGED": "Merged with another property record",
}

DEFAULT_VISIBILITY = {
    "show_exact_gps": False,           # never true unless admin explicitly overrides
    "show_street": False,              # only area/estate shown
    "show_house_number": False,
    "show_raw_address": False,
    "show_photos": True,
    "show_current_listings": True,     # sanitised
    "show_representatives": True,      # only APPROVED
    "show_history": True,              # only public events
    "show_amenities": True,
    "show_physical_details": True,
    "show_size": True,
    "allow_enquiries": True,
    "show_qr": True,
}


def _round_coord(x: float, precision: float = 0.001) -> float:
    """Round to ~100m grid (0.001° ≈ 111 m)."""
    return round(x / precision) * precision


class VisibilityPatchIn(BaseModel):
    show_exact_gps: Optional[bool] = None
    show_street: Optional[bool] = None
    show_house_number: Optional[bool] = None
    show_raw_address: Optional[bool] = None
    show_photos: Optional[bool] = None
    show_current_listings: Optional[bool] = None
    show_representatives: Optional[bool] = None
    show_history: Optional[bool] = None
    show_amenities: Optional[bool] = None
    show_physical_details: Optional[bool] = None
    show_size: Optional[bool] = None
    allow_enquiries: Optional[bool] = None
    show_qr: Optional[bool] = None


def _sanitise_listing(l: dict, allow: dict) -> dict:
    return {
        "id": l["id"],
        "listing_type": l.get("listing_type"),
        "listing_status": l.get("listing_status"),
        "price": l.get("price"),
        "currency": l.get("currency", "NGN"),
        "description": l.get("description"),
        "created_at": l.get("created_at"),
        "representation_type": l.get("representation_type"),
        # Never expose owner_name / owner_phone in the public passport.
    }


def _sanitise_property(p: dict, allow: dict) -> dict:
    ep = p.get("entrance_point", {}).get("coordinates") or [None, None]
    lat = ep[1] if ep and ep[1] is not None else None
    lng = ep[0] if ep and ep[0] is not None else None
    if lat is not None and lng is not None and not allow.get("show_exact_gps"):
        lat = _round_coord(lat)
        lng = _round_coord(lng)
    out = {
        "amass_property_id": p.get("amass_property_id"),
        "property_type": p.get("property_type"),
        "property_subtype": p.get("property_subtype"),
        "state": p.get("state"),
        "lga": p.get("lga"),
        "area": p.get("area"),
        "estate": p.get("estate"),
        "identity_status": p.get("property_identity_status"),
        "physical_status": p.get("physical_status"),
        "has_verified_representation": bool(p.get("has_verified_representation")),
        "created_at": p.get("created_at"),
        "coordinates": {"latitude": lat, "longitude": lng} if lat is not None else None,
        "coordinates_precision": "exact" if allow.get("show_exact_gps") else "~100m",
    }
    if allow.get("show_street"):
        out["street"] = p.get("street")
    if allow.get("show_house_number"):
        out["house_number"] = p.get("house_number")
    if allow.get("show_raw_address"):
        out["raw_address"] = p.get("raw_address")
    if allow.get("show_physical_details"):
        d = p.get("details") or {}
        out["details"] = {
            "bedrooms": d.get("bedrooms"),
            "bathrooms": d.get("bathrooms"),
            "floors": d.get("floors"),
            "year_built": d.get("year_built"),
        }
    if allow.get("show_size"):
        d = p.get("details") or {}
        out["size"] = {
            "building_size_sqm": d.get("building_size_sqm"),
            "land_size_sqm": d.get("land_size_sqm"),
        }
    if allow.get("show_amenities"):
        out["amenities"] = (p.get("details") or {}).get("amenities") or []
    if allow.get("show_photos"):
        out["photos"] = p.get("media_ids") or []
    return out


async def build_passport(db: AsyncIOMotorDatabase, amass_id: str, is_admin: bool = False) -> dict:
    p = await db.properties_geo.find_one({"amass_property_id": amass_id}, {"_id": 0})
    # Follow a MERGED loser to its winner so QR codes / passport URLs remain
    # stable even after admin merges.
    resolved_via_alias = False
    if p and p.get("physical_status") == "MERGED" and p.get("merged_into_amass_id"):
        target = p["merged_into_amass_id"]
        winner = await db.properties_geo.find_one(
            {"amass_property_id": target}, {"_id": 0}
        )
        if winner:
            p = winner
            resolved_via_alias = True
    if not p:
        # Alias fallback (winner.aliases[] contains the requested id)
        p = await db.properties_geo.find_one({"aliases": amass_id}, {"_id": 0})
        if p:
            resolved_via_alias = True
    if not p:
        raise HTTPException(404, "Property not found")

    # visibility
    v = p.get("passport_visibility") or {}
    allow = {**DEFAULT_VISIBILITY, **v}
    # Admin bypass (used for admin cockpit preview)
    if is_admin:
        for k in list(allow.keys()):
            allow[k] = True

    sanitised = _sanitise_property(p, allow)

    # Active listings
    listings_public: list = []
    if allow.get("show_current_listings"):
        listings = await db.property_listings.find(
            {"property_id": p["property_uuid"],
             "listing_status": {"$in": ["ACTIVE", "PENDING_REVIEW", "APPROVED"]}},
            {"_id": 0},
        ).sort("created_at", -1).to_list(50)
        listings_public = [_sanitise_listing(l, allow) for l in listings]

    # Approved representatives
    reps_public: list = []
    if allow.get("show_representatives"):
        reps = await db.property_representations.find(
            {"property_id": p["property_uuid"], "status": "APPROVED"},
            {"_id": 0},
        ).to_list(50)
        agent_ids = list({r["user_id"] for r in reps})
        agents = await db.agent_applications.find(
            {"user_id": {"$in": agent_ids}}, {"_id": 0}
        ).to_list(200) if agent_ids else []
        amap = {a["user_id"]: a for a in agents}
        for r in reps:
            a = amap.get(r["user_id"], {})
            reps_public.append({
                "id": r["id"],
                "representation_type": r["representation_type"],
                "mandate_type": r.get("mandate_type"),
                "mandate_expiry": r.get("mandate_expiry"),
                "decided_at": r.get("decided_at"),
                "agent": {
                    "user_id": r["user_id"],
                    "slug": a.get("slug"),
                    "full_name": a.get("full_name"),
                    "agency_name": a.get("agency_name"),
                    "avatar_url": a.get("avatar_url"),
                    "verification_level": a.get("verification_level", 1),
                    "rating": a.get("rating", 0),
                    "reviews_count": a.get("reviews_count", 0),
                } if a else {"user_id": r["user_id"]},
            })

    # Public timeline
    timeline_public: list = []
    if allow.get("show_history"):
        raw_events = await db.property_audit_logs.find(
            {"property_id": p["property_uuid"], "action": {"$in": list(PUBLIC_EVENT_TYPES)}},
            {"_id": 0},
        ).sort("created_at", 1).to_list(500)
        for e in raw_events:
            timeline_public.append({
                "action": e["action"],
                "label": EVENT_LABELS.get(e["action"], e["action"].replace("_", " ").title()),
                "at": e.get("created_at"),
                # DO NOT leak old_value / new_value / reason / actor_id publicly.
            })

    # QR + share
    # Canonical passport URL always uses the winner's AMASS ID (stable across merges)
    canonical_amass = p.get("amass_property_id")
    domain = os.environ.get("AMASS_PUBLIC_DOMAIN", "amass.africa")
    passport_url = f"https://{domain}/property/{canonical_amass}"
    qr_url = f"https://api.qrserver.com/v1/create-qr-code/?size=512x512&data={passport_url}"

    return {
        "property": sanitised,
        "listings": listings_public,
        "representatives": reps_public,
        "timeline": timeline_public,
        "share": {
            "passport_url": passport_url,
            "qr_url": qr_url if allow.get("show_qr") else None,
            "allow_enquiries": bool(allow.get("allow_enquiries")),
        },
        "visibility": allow,
        "resolved_via_alias": resolved_via_alias,
        "requested_id": amass_id if resolved_via_alias else canonical_amass,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


def register_passport_routes(db, require_auth_or_none, require_admin):
    """require_auth_or_none: dependency that returns a user OR None (for optional auth)."""
    public = APIRouter(prefix="/api/passport", tags=["passport-public"])
    admin = APIRouter(prefix="/api/admin/passport", tags=["passport-admin"])

    @public.get("/{amass_id}")
    async def get_passport(amass_id: str):
        return await build_passport(db, amass_id, is_admin=False)

    @public.get("/by-property-uuid/{property_uuid}")
    async def get_passport_by_uuid(property_uuid: str):
        """Convenience redirect-like — accepts internal UUID. Returned payload
        still uses the canonical amass_property_id."""
        p = await db.properties_geo.find_one({"property_uuid": property_uuid}, {"_id": 0, "amass_property_id": 1})
        if not p:
            raise HTTPException(404, "Property not found")
        return await build_passport(db, p["amass_property_id"], is_admin=False)

    # ─── Admin: full passport (bypasses visibility) + visibility patch ─
    @admin.get("/{amass_id}/full")
    async def admin_full_passport(amass_id: str, _=Depends(require_admin)):
        return await build_passport(db, amass_id, is_admin=True)

    @admin.get("/{amass_id}/visibility")
    async def admin_get_visibility(amass_id: str, _=Depends(require_admin)):
        p = await db.properties_geo.find_one(
            {"amass_property_id": amass_id}, {"_id": 0, "passport_visibility": 1}
        )
        if not p:
            raise HTTPException(404, "Property not found")
        return {**DEFAULT_VISIBILITY, **(p.get("passport_visibility") or {})}

    @admin.patch("/{amass_id}/visibility")
    async def admin_patch_visibility(
        amass_id: str,
        data: VisibilityPatchIn,
        admin_user: dict = Depends(require_admin),
    ):
        updates = {k: v for k, v in data.model_dump().items() if v is not None}
        if not updates:
            raise HTTPException(400, "Nothing to update")
        prop = await db.properties_geo.find_one(
            {"amass_property_id": amass_id}, {"_id": 0, "property_uuid": 1}
        )
        if not prop:
            raise HTTPException(404, "Property not found")
        await db.properties_geo.update_one(
            {"amass_property_id": amass_id},
            {"$set": {**{f"passport_visibility.{k}": v for k, v in updates.items()},
                      "updated_at": datetime.now(timezone.utc)}},
        )
        await db.property_audit_logs.insert_one({
            "id": __import__("uuid").uuid4().hex,
            "property_id": prop["property_uuid"],
            "actor_id": admin_user["id"], "actor_type": "admin",
            "action": "PASSPORT_VISIBILITY_UPDATED",
            "new_value": updates,
            "created_at": datetime.now(timezone.utc),
        })
        return {"ok": True, "updated": list(updates.keys())}

    return public, admin
