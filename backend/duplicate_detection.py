"""AMASS Duplicate Detection Engine — Phase 6B

Pure MongoDB + 2dsphere. Scoring model (100 pts total):
  proximity 30 · footprint 25 · parcel 20 · address 10 · type 5 · attrs 5 · photo 5

Thresholds (admin-configurable via `system_config` doc id="duplicate_config"):
  ≥ high_confidence (default 80) → block with strong warning
  ≥ possible        (default 60) → possible duplicate, agent decides
  <  possible                    → allow

visual_similarity_score is always 0 in 6B — the field is exposed so an
image-embedding service can slot in later without schema changes.
"""
from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from difflib import SequenceMatcher
from typing import List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel
from motor.motor_asyncio import AsyncIOMotorDatabase


DEFAULTS = {
    "high_confidence_threshold": 80,
    "possible_threshold": 60,
    "search_radius_meters": 25,
    "gps_multiplier": 2,  # radius = max(search_radius, gps_accuracy * multiplier)
    "max_candidates": 20,
}


class DuplicateCheckIn(BaseModel):
    latitude: float
    longitude: float
    accuracy_meters: float = 15
    property_type: Optional[str] = None
    bedrooms: Optional[int] = None
    bathrooms: Optional[int] = None
    building_size_sqm: Optional[int] = None
    address: Optional[dict] = None  # {state, lga, area, street, house_number, estate}
    building_footprint: Optional[dict] = None  # GeoJSON Polygon
    parcel_polygon: Optional[dict] = None  # GeoJSON Polygon


class SubmitDecisionIn(BaseModel):
    client_submission_id: str
    duplicate_decision: Optional[str] = None  # "same_property" | "not_same_property"
    same_as_amass_id: Optional[str] = None    # required when decision=same_property
    not_same_reason: Optional[str] = None     # required when decision=not_same_property


class AdminThresholdIn(BaseModel):
    high_confidence_threshold: Optional[int] = None
    possible_threshold: Optional[int] = None
    search_radius_meters: Optional[int] = None


def _load_config(db):
    async def _get():
        doc = await db.system_config.find_one({"id": "duplicate_config"}, {"_id": 0})
        return {**DEFAULTS, **(doc or {})}
    return _get


def _norm(s: Optional[str]) -> str:
    if not s:
        return ""
    x = s.lower()
    x = re.sub(r"\brd\.?\b", "road", x)
    x = re.sub(r"\bst\.?\b", "street", x)
    x = re.sub(r"\bcl\.?\b", "close", x)
    x = re.sub(r"\bave\.?\b", "avenue", x)
    x = re.sub(r"[^a-z0-9\s]", " ", x)
    x = re.sub(r"\s+", " ", x).strip()
    return x


def _score_proximity(distance_m: float, gps_acc: float) -> int:
    """30 pts. Adjust brackets when GPS is inaccurate — widens tolerance."""
    slack = max(0.0, gps_acc - 10) / 2  # add up to +7.5m of slack for weak GPS
    if distance_m <= 5 + slack: return 30
    if distance_m <= 10 + slack: return 25
    if distance_m <= 15 + slack: return 20
    if distance_m <= 25 + slack: return 10
    return 0


def _score_type(new_type: Optional[str], existing_type: Optional[str]) -> int:
    if not new_type or not existing_type: return 0
    a, b = _norm(new_type), _norm(existing_type)
    if a == b: return 5
    # Group: apartment/flat, house/duplex/bungalow, land/plot
    groups = [
        {"apartment", "flat", "penthouse", "serviced apartment"},
        {"detached", "semi detached", "terraced", "duplex", "bungalow", "mansion", "villa", "house"},
        {"land", "plot", "residential land", "commercial land"},
        {"office", "shop", "warehouse", "commercial"},
    ]
    for g in groups:
        if a in g and b in g: return 3
    return 0


def _score_attrs(a: dict, b: dict) -> int:
    """5 pts based on bedroom/bathroom/size similarity."""
    pts = 0
    if a.get("bedrooms") is not None and a.get("bedrooms") == b.get("bedrooms"): pts += 2
    if a.get("bathrooms") is not None and a.get("bathrooms") == b.get("bathrooms"): pts += 2
    sz_a = a.get("building_size_sqm") or 0
    sz_b = b.get("building_size_sqm") or 0
    if sz_a and sz_b and abs(sz_a - sz_b) / max(sz_a, sz_b) < 0.15:
        pts += 1
    return min(5, pts)


def _score_address(new_addr: dict, existing: dict) -> int:
    """10 pts based on fuzzy address similarity (SequenceMatcher on normalized)."""
    if not new_addr: return 0
    fields = [
        (new_addr.get("normalized_address") or _norm(
            " ".join(str(new_addr.get(k, "")) for k in ("house_number", "street", "estate", "area", "lga"))
        )),
        _norm(existing.get("normalized_address") or existing.get("raw_address") or ""),
    ]
    if not fields[0] or not fields[1]: return 0
    r = SequenceMatcher(None, fields[0], fields[1]).ratio()
    if r >= 0.9: return 10
    if r >= 0.75: return 7
    if r >= 0.55: return 4
    if r >= 0.4: return 2
    return 0


def _polygon_overlap_ratio(a: dict, b: dict) -> float:
    """Rough bounding-box overlap ratio when Mongo returns candidates via
    $geoIntersects. We compute IoU on the bboxes for a quick, deterministic
    signal — good enough at 6B; a proper Shapely-based area calc can slot in
    later without changing the scoring interface."""
    if not a or not b or a.get("type") != "Polygon" or b.get("type") != "Polygon":
        return 0.0
    def bbox(poly):
        pts = poly["coordinates"][0]
        xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
        return min(xs), min(ys), max(xs), max(ys)
    x1a, y1a, x2a, y2a = bbox(a)
    x1b, y1b, x2b, y2b = bbox(b)
    ix1, iy1 = max(x1a, x1b), max(y1a, y1b)
    ix2, iy2 = min(x2a, x2b), min(y2a, y2b)
    if ix2 <= ix1 or iy2 <= iy1: return 0.0
    inter = (ix2 - ix1) * (iy2 - iy1)
    union = (x2a - x1a) * (y2a - y1a) + (x2b - x1b) * (y2b - y1b) - inter
    return inter / union if union > 0 else 0.0


def _score_footprint(new_fp: Optional[dict], ex_fp: Optional[dict]) -> int:
    if not new_fp or not ex_fp: return 0
    r = _polygon_overlap_ratio(new_fp, ex_fp)
    if r >= 0.8: return 25
    if r >= 0.5: return 20
    if r >= 0.25: return 10
    if r > 0: return 5
    return 0


def _score_parcel(new_p: Optional[dict], ex_p: Optional[dict]) -> int:
    if not new_p or not ex_p: return 0
    r = _polygon_overlap_ratio(new_p, ex_p)
    if r >= 0.5: return 20
    if r >= 0.25: return 12
    if r > 0: return 5
    return 0


def _haversine_m(lat1, lng1, lat2, lng2) -> float:
    import math
    R = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1); dl = math.radians(lng2 - lng1)
    a = math.sin(dp/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return 2 * R * math.asin(math.sqrt(a))


async def score_candidates(
    db: AsyncIOMotorDatabase, payload: DuplicateCheckIn, cfg: dict
) -> tuple:
    radius = max(int(cfg["search_radius_meters"]),
                 int(payload.accuracy_meters * cfg["gps_multiplier"]))
    q = {
        "entrance_point": {
            "$near": {
                "$geometry": {"type": "Point",
                              "coordinates": [payload.longitude, payload.latitude]},
                "$maxDistance": radius,
            }
        }
    }
    raw = await db.properties_geo.find(q, {"_id": 0}).to_list(cfg["max_candidates"])
    new_attrs = {
        "bedrooms": payload.bedrooms, "bathrooms": payload.bathrooms,
        "building_size_sqm": payload.building_size_sqm,
    }
    new_addr = {**(payload.address or {})}
    if new_addr and "normalized_address" not in new_addr:
        new_addr["normalized_address"] = _norm(" ".join(
            str(new_addr.get(k, "")) for k in ("house_number", "street", "estate", "area", "lga")
        ))
    scored = []
    for ex in raw:
        coords = ex.get("entrance_point", {}).get("coordinates") or [0, 0]
        dist = _haversine_m(payload.latitude, payload.longitude, coords[1], coords[0])
        prox = _score_proximity(dist, payload.accuracy_meters)
        fp = _score_footprint(payload.building_footprint, ex.get("building_footprint"))
        pc = _score_parcel(payload.parcel_polygon, ex.get("parcel_polygon"))
        addr = _score_address(new_addr, ex)
        typ = _score_type(payload.property_type, ex.get("property_type"))
        attrs = _score_attrs(new_attrs, ex.get("details", {}) or {})
        photo = 0  # visual_similarity_score deferred to post-6B
        total = prox + fp + pc + addr + typ + attrs + photo
        reasons = []
        if prox >= 20: reasons.append(f"Only {dist:.0f}m from an existing property")
        if fp >= 20: reasons.append("Building footprint significantly overlaps")
        if pc >= 12: reasons.append("Land parcel overlaps")
        if addr >= 7: reasons.append("Address is very similar")
        if typ and typ >= 3: reasons.append("Same property type family")
        if attrs >= 3: reasons.append("Same bedroom/bathroom/size profile")
        scored.append({
            "amass_property_id": ex.get("amass_property_id"),
            "property_uuid": ex.get("property_uuid"),
            "distance_meters": round(dist, 1),
            "score": total,
            "breakdown": {
                "proximity": prox, "footprint": fp, "parcel": pc,
                "address": addr, "type": typ, "attributes": attrs,
                "visual_similarity_score": photo,
            },
            "reasons": reasons,
            "preview": {
                "state": ex.get("state"), "lga": ex.get("lga"), "area": ex.get("area"),
                "estate": ex.get("estate"), "street": ex.get("street"),
                "property_type": ex.get("property_type"),
                "bedrooms": (ex.get("details") or {}).get("bedrooms"),
                "physical_status": ex.get("physical_status"),
                "identity_status": ex.get("property_identity_status"),
            },
        })
    scored.sort(key=lambda x: x["score"], reverse=True)
    highest = scored[0]["score"] if scored else 0
    if highest >= cfg["high_confidence_threshold"]:
        action = "high_confidence_duplicate"
    elif highest >= cfg["possible_threshold"]:
        action = "possible_duplicate"
    else:
        action = "allow"
    return scored, highest, action, radius


def register_duplicate_routes(db, require_auth, require_admin):
    router = APIRouter(prefix="/api/agent/properties", tags=["duplicate-detection"])
    admin_router = APIRouter(prefix="/api/admin/duplicate", tags=["admin-duplicate"])
    _get_cfg = _load_config(db)

    @router.post("/duplicate-check")
    async def duplicate_check(
        payload: DuplicateCheckIn = Body(...),
        user: dict = Depends(require_auth),
    ):
        cfg = await _get_cfg()
        candidates, highest, action, radius = await score_candidates(db, payload, cfg)
        return {
            "search_radius_meters": radius,
            "highest_score": highest,
            "action": action,
            "high_confidence_threshold": cfg["high_confidence_threshold"],
            "possible_threshold": cfg["possible_threshold"],
            "candidates": candidates,
        }

    @router.post("/{oid}/duplicate-check")
    async def duplicate_check_for_draft(
        oid: str, user: dict = Depends(require_auth)
    ):
        d = await db.property_onboarding.find_one(
            {"id": oid, "agent_id": user["id"]}, {"_id": 0}
        )
        if not d:
            raise HTTPException(404, "Draft not found")
        loc = d.get("location") or {}
        if not loc:
            raise HTTPException(400, "Capture location before running duplicate check")
        details = d.get("details") or {}
        payload = DuplicateCheckIn(
            latitude=loc["latitude"], longitude=loc["longitude"],
            accuracy_meters=loc.get("accuracy_meters", 15),
            property_type=details.get("property_type"),
            bedrooms=details.get("bedrooms"),
            bathrooms=details.get("bathrooms"),
            building_size_sqm=details.get("building_size_sqm"),
            address=d.get("address") or None,
        )
        cfg = await _get_cfg()
        candidates, highest, action, radius = await score_candidates(db, payload, cfg)
        # Persist the check on the draft for the submit gate.
        await db.property_onboarding.update_one(
            {"id": oid},
            {"$set": {
                "duplicate_check": {
                    "run_at": datetime.now(timezone.utc),
                    "highest_score": highest,
                    "action": action,
                    "candidates": candidates,
                },
                "status": "DUPLICATE_CHECK",
                "updated_at": datetime.now(timezone.utc),
            }},
        )
        # Also stamp an audit row.
        await db.property_audit_logs.insert_one({
            "id": str(uuid.uuid4()),
            "property_id": None, "onboarding_id": oid,
            "actor_id": user["id"], "actor_type": "agent",
            "action": "DUPLICATE_DETECTED" if action != "allow" else "DUPLICATE_CHECK_CLEAR",
            "new_value": {"highest_score": highest, "action": action},
            "created_at": datetime.now(timezone.utc),
        })
        return {
            "search_radius_meters": radius,
            "highest_score": highest,
            "action": action,
            "high_confidence_threshold": cfg["high_confidence_threshold"],
            "possible_threshold": cfg["possible_threshold"],
            "candidates": candidates,
        }

    @router.post("/{oid}/decision")
    async def record_decision(
        oid: str, data: SubmitDecisionIn = Body(...),
        user: dict = Depends(require_auth),
    ):
        """Record agent's response to a duplicate warning. Called BEFORE
        /submit when highest_score >= possible_threshold."""
        d = await db.property_onboarding.find_one(
            {"id": oid, "agent_id": user["id"], "client_submission_id": data.client_submission_id}
        )
        if not d:
            raise HTTPException(404, "Draft not found for this submission id")
        if data.duplicate_decision not in ("same_property", "not_same_property"):
            raise HTTPException(400, "duplicate_decision must be 'same_property' or 'not_same_property'")
        if data.duplicate_decision == "same_property" and not data.same_as_amass_id:
            raise HTTPException(400, "same_as_amass_id is required when marking same_property")
        if data.duplicate_decision == "not_same_property" and not data.not_same_reason:
            raise HTTPException(400, "not_same_reason is required when marking not_same_property")
        now = datetime.now(timezone.utc)
        await db.property_onboarding.update_one(
            {"id": oid},
            {"$set": {
                "duplicate_decision": {
                    "decision": data.duplicate_decision,
                    "same_as_amass_id": data.same_as_amass_id,
                    "not_same_reason": data.not_same_reason,
                    "decided_at": now, "decided_by": user["id"],
                },
                "updated_at": now,
            }},
        )
        await db.property_audit_logs.insert_one({
            "id": str(uuid.uuid4()),
            "property_id": None, "onboarding_id": oid,
            "actor_id": user["id"], "actor_type": "agent",
            "action": "DUPLICATE_REVIEWED",
            "new_value": {"decision": data.duplicate_decision,
                          "same_as_amass_id": data.same_as_amass_id,
                          "reason": data.not_same_reason},
            "created_at": now,
        })
        return {"ok": True, "decision": data.duplicate_decision}

    # ── Admin threshold config ──
    @admin_router.get("/config")
    async def admin_get_config(_admin=Depends(require_admin)):
        return await _get_cfg()

    @admin_router.patch("/config")
    async def admin_patch_config(
        data: AdminThresholdIn = Body(...), _admin=Depends(require_admin)
    ):
        updates = {k: v for k, v in data.model_dump().items() if v is not None}
        if not updates:
            raise HTTPException(400, "Nothing to update")
        # Guardrails per user's instruction: never allow disabling protection.
        if updates.get("possible_threshold", 60) < 40:
            raise HTTPException(400, "possible_threshold must be >= 40")
        if updates.get("high_confidence_threshold", 80) < 60:
            raise HTTPException(400, "high_confidence_threshold must be >= 60")
        await db.system_config.update_one(
            {"id": "duplicate_config"},
            {"$set": {**updates, "updated_at": datetime.now(timezone.utc)}},
            upsert=True,
        )
        return {"ok": True, "updated": list(updates.keys())}

    return router, admin_router
