"""AMASS Phase D-1 — Property Type Registry.

Single source of truth for property type slugs + display colours across
the entire platform. Admin can CRUD. Existing docs referencing legacy
`property_type` strings continue to work — we match case-insensitively.

Colour system (from brief):
  RESIDENTIAL     Blue      #2563EB
  APARTMENT       Purple    #7C3AED
  ESTATE          Green     #059669
  LAND            Brown     #92400E
  COMMERCIAL      Orange    #EA580C
  INDUSTRIAL      Dark Grey #374151
  HOSPITALITY     Teal      #0D9488
  INSTITUTIONAL   Indigo    #4338CA
  OTHER           Grey      #6B7280
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel, Field


DEFAULT_PROPERTY_TYPES = [
    {"slug": "residential",   "label": "Residential",   "icon": "home",         "color": "#2563EB", "order": 1, "subtypes": ["detached", "semi_detached", "terrace", "bungalow", "duplex", "mansion"]},
    {"slug": "apartment",     "label": "Apartment",     "icon": "business",     "color": "#7C3AED", "order": 2, "subtypes": ["studio", "1bed", "2bed", "3bed", "penthouse", "serviced"]},
    {"slug": "estate",        "label": "Estate",        "icon": "grid",         "color": "#059669", "order": 3, "subtypes": ["gated_community", "housing_estate", "residential_complex"]},
    {"slug": "land",          "label": "Land",          "icon": "leaf-outline", "color": "#92400E", "order": 4, "subtypes": ["undeveloped", "farmland", "commercial_plot", "residential_plot"]},
    {"slug": "commercial",    "label": "Commercial",    "icon": "briefcase",    "color": "#EA580C", "order": 5, "subtypes": ["office", "shop", "showroom", "hotel_commercial"]},
    {"slug": "industrial",    "label": "Industrial",    "icon": "construct",    "color": "#374151", "order": 6, "subtypes": ["warehouse", "factory", "logistics"]},
    {"slug": "hospitality",   "label": "Hospitality",   "icon": "bed",          "color": "#0D9488", "order": 7, "subtypes": ["hotel", "short_let", "resort"]},
    {"slug": "institutional", "label": "Institutional", "icon": "school",       "color": "#4338CA", "order": 8, "subtypes": ["school", "hospital", "government", "religious"]},
    {"slug": "other",         "label": "Other",         "icon": "help-circle",  "color": "#6B7280", "order": 99, "subtypes": []},
]


class PropertyTypeIn(BaseModel):
    slug: str = Field(..., min_length=2, max_length=32, pattern=r"^[a-z0-9_]+$")
    label: str = Field(..., min_length=2, max_length=64)
    icon: str = "home"
    color: str = Field(..., pattern=r"^#[0-9A-Fa-f]{6}$")
    order: int = 100
    subtypes: List[str] = []
    active: bool = True


class PropertyTypePatchIn(BaseModel):
    label: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")
    order: Optional[int] = None
    subtypes: Optional[List[str]] = None
    active: Optional[bool] = None


async def ensure_default_property_types(db):
    """Seed defaults on startup — idempotent."""
    for t in DEFAULT_PROPERTY_TYPES:
        exists = await db.property_types.find_one({"slug": t["slug"]}, {"_id": 0, "slug": 1})
        if exists:
            continue
        await db.property_types.insert_one({
            "id": str(uuid.uuid4()),
            **t,
            "active": True,
            "is_system": True,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        })


def register_property_type_routes(db, require_admin):
    public = APIRouter(prefix="/api/property-types", tags=["property-types"])
    admin = APIRouter(prefix="/api/admin/property-types", tags=["property-types-admin"])

    @public.get("")
    async def list_property_types(include_inactive: bool = False):
        q: dict = {} if include_inactive else {"active": True}
        return await db.property_types.find(q, {"_id": 0}).sort("order", 1).to_list(200)

    @admin.get("")
    async def admin_list(_admin=Depends(require_admin)):
        return await db.property_types.find({}, {"_id": 0}).sort("order", 1).to_list(200)

    @admin.post("")
    async def admin_create(data: PropertyTypeIn, admin_user: dict = Depends(require_admin)):
        exists = await db.property_types.find_one({"slug": data.slug}, {"_id": 0})
        if exists:
            raise HTTPException(409, f"Slug '{data.slug}' already exists")
        doc = {
            "id": str(uuid.uuid4()),
            **data.model_dump(),
            "is_system": False,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        }
        await db.property_types.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @admin.patch("/{slug}")
    async def admin_patch(slug: str, data: PropertyTypePatchIn, admin_user: dict = Depends(require_admin)):
        updates = {k: v for k, v in data.model_dump().items() if v is not None}
        if not updates:
            raise HTTPException(400, "Nothing to update")
        updates["updated_at"] = datetime.now(timezone.utc)
        r = await db.property_types.update_one({"slug": slug}, {"$set": updates})
        if not r.matched_count:
            raise HTTPException(404, "Property type not found")
        return {"ok": True, "updated": list(updates.keys())}

    @admin.delete("/{slug}")
    async def admin_delete(slug: str, _admin=Depends(require_admin)):
        pt = await db.property_types.find_one({"slug": slug}, {"_id": 0})
        if not pt:
            raise HTTPException(404, "Not found")
        if pt.get("is_system"):
            # Soft-delete system types (deactivate) to preserve historical refs.
            await db.property_types.update_one({"slug": slug}, {"$set": {"active": False}})
            return {"ok": True, "action": "deactivated_system_type"}
        await db.property_types.delete_one({"slug": slug})
        return {"ok": True, "action": "deleted"}

    return public, admin
