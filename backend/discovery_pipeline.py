"""AMASS Phase D-3 — Candidate reducer + bulk discovery jobs.

Pipeline:
  Google Place  →  property_candidates  →  duplicate check
                                        →  (unique) promote to properties_geo
                                        →  (duplicate) attach to existing

Candidate types inferred from Google `types` (best-effort, admin can override).

Job runner uses asyncio.create_task at endpoint level — not a distributed
queue, but sufficient for the current 5rps + max_concurrent_jobs=2 policy.
Crashed jobs (RUNNING at startup) are flipped to FAILED via server.on_startup.
"""
from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel, Field


# ── Candidate type inference from Google Places `types[]` ──
def infer_candidate_type(google_types: List[str]) -> str:
    ts = set(t.lower() for t in (google_types or []))
    if ts & {"real_estate_agency"}: return "AGENCY"
    if ts & {"apartment_complex", "apartment_building", "condominium"}: return "PROPERTY_COMPLEX"
    if ts & {"gated_community", "housing_development", "residential_area"}: return "ESTATE"
    if ts & {"office", "shopping_mall", "store", "warehouse"}: return "COMMERCIAL"
    if ts & {"lodging", "hotel", "resort"}: return "PROPERTY_COMPLEX"
    if ts & {"school", "university", "hospital", "church", "mosque"}: return "UNKNOWN"  # institutional — not a property
    if ts & {"premise", "subpremise", "point_of_interest"}: return "PROPERTY"
    return "UNKNOWN"


def _place_to_candidate_doc(place: dict, source_type: str = "GOOGLE_PLACES") -> dict:
    loc = place.get("location") or {}
    lat = loc.get("latitude")
    lng = loc.get("longitude")
    types = place.get("types") or []
    return {
        "id": str(uuid.uuid4()),
        "source_type": source_type,
        "source_reference": place.get("id"),
        "google_place_id": place.get("id"),
        "candidate_type": infer_candidate_type(types),
        "status": "DISCOVERED",
        "name": (place.get("displayName") or {}).get("text"),
        "address": place.get("formattedAddress"),
        "latitude": lat,
        "longitude": lng,
        "location": {"type": "Point", "coordinates": [lng, lat]} if lat is not None and lng is not None else None,
        "google_types": types,
        "primary_type": place.get("primaryType"),
        "business_status": place.get("businessStatus"),
        "google_maps_uri": place.get("googleMapsUri"),
        "duplicate_score": None,
        "duplicate_matches": [],
        "promoted_to_amass_property_id": None,
        "reviewed_by": None,
        "reviewed_at": None,
        "review_notes": None,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
        "discovered_at": datetime.now(timezone.utc),
    }


class BulkJobIn(BaseModel):
    label: str = Field(..., min_length=3, max_length=120)
    searches: List[Dict[str, Any]] = Field(..., min_length=1, max_length=50)
    include_details: bool = False


class PromoteIn(BaseModel):
    verified_address: Optional[dict] = None  # {state, lga, area, ...}
    notes: Optional[str] = None
    force_new: bool = False  # skip duplicate-attach even if match


class ResolveDupIn(BaseModel):
    action: str = Field(..., pattern="^(MERGE|KEEP_SEPARATE|MARK_RELATED)$")
    amass_property_id: Optional[str] = None  # required for MERGE + MARK_RELATED
    reason: Optional[str] = None


def register_discovery_pipeline_routes(db, require_admin):
    from app_settings import get_feature_flag
    from discovery_google import _pick_client
    router = APIRouter(prefix="/api/admin/discovery", tags=["discovery-pipeline"])

    async def _score_candidate(cand: dict) -> dict:
        """Simple proximity + type scoring against properties_geo.
        The wizard's `duplicate_detection.py` is authoritative — this is
        just enough for admin queue triage."""
        if not cand.get("location"):
            return {"score": 0, "matches": [], "action": "allow"}
        lat = cand["latitude"]; lng = cand["longitude"]
        candidates_geo = await db.properties_geo.find({
            "physical_status": {"$ne": "MERGED"},
            "entrance_point": {
                "$near": {"$geometry": {"type": "Point", "coordinates": [lng, lat]},
                          "$maxDistance": 75},
            },
        }, {"_id": 0}).limit(10).to_list(10)
        import math
        matches = []
        highest = 0
        for other in candidates_geo:
            oc = other.get("entrance_point", {}).get("coordinates") or [None, None]
            olng, olat = oc[0], oc[1]
            if olat is None or olng is None: continue
            # Haversine (m)
            R = 6371000.0
            dLat = math.radians(olat - lat); dLng = math.radians(olng - lng)
            a = math.sin(dLat/2)**2 + math.cos(math.radians(lat)) * math.cos(math.radians(olat)) * math.sin(dLng/2)**2
            d = int(2 * R * math.asin(math.sqrt(a)))
            # Proximity score: 40 at 0m linearly down to 0 at 75m
            proximity = max(0, 40 - int(40 * d / 75))
            type_match = 15 if (cand.get("candidate_type") or "").lower() in (other.get("property_type") or "").lower() else 0
            # Address token overlap
            addr_cand = set((cand.get("address") or "").lower().split())
            addr_other = set(str(other.get("normalized_address") or "").split())
            addr_score = min(25, 5 * len(addr_cand & addr_other))
            score = proximity + type_match + addr_score
            if score > highest: highest = score
            reasons = []
            if proximity >= 30: reasons.append(f"very close ({d}m)")
            elif proximity >= 15: reasons.append(f"near ({d}m)")
            if type_match: reasons.append("same type")
            if addr_score >= 10: reasons.append("address overlap")
            matches.append({
                "amass_property_id": other["amass_property_id"],
                "property_uuid": other["property_uuid"],
                "distance_meters": d,
                "score": score,
                "reasons": reasons,
            })
        matches.sort(key=lambda m: m["score"], reverse=True)
        action = ("high_confidence_duplicate" if highest >= 75
                  else "possible_duplicate" if highest >= 45
                  else "allow")
        return {"score": highest, "matches": matches[:5], "action": action}

    # ─── Ingest a single Google place → candidate ───
    @router.post("/candidates/from-place/{place_id}")
    async def create_candidate_from_place(place_id: str, admin_user: dict = Depends(require_admin)):
        if not await get_feature_flag(db, "PROPERTY_DISCOVERY_ENABLED"):
            raise HTTPException(403, "Discovery disabled")
        # Idempotent: skip if candidate already exists for this place_id
        existing = await db.property_candidates.find_one({"google_place_id": place_id}, {"_id": 0})
        if existing:
            return {"created": False, "candidate": existing, "reason": "already_ingested"}

        # Fetch details (uses cache if present)
        client = _pick_client()
        try:
            place = await client.place_details(place_id)
        except HTTPException:
            raise
        cand = _place_to_candidate_doc(place)
        # Score against properties_geo
        dup = await _score_candidate(cand)
        cand["duplicate_score"] = dup["score"]
        cand["duplicate_matches"] = dup["matches"]
        if dup["action"] == "high_confidence_duplicate":
            cand["status"] = "DUPLICATE"
        elif dup["action"] == "possible_duplicate":
            cand["status"] = "PENDING_DEDUPLICATION"
        else:
            cand["status"] = "UNVERIFIED"  # unique candidate awaiting agent/admin promotion
        await db.property_candidates.insert_one(cand)
        cand.pop("_id", None)
        return {"created": True, "candidate": cand, "duplicate_action": dup["action"]}

    # ─── List candidates ───
    @router.get("/candidates")
    async def list_candidates(
        status: Optional[str] = Query(None),
        candidate_type: Optional[str] = Query(None),
        limit: int = Query(50, ge=1, le=200),
        _admin=Depends(require_admin),
    ):
        q: dict = {}
        if status: q["status"] = status.upper()
        if candidate_type: q["candidate_type"] = candidate_type.upper()
        rows = await db.property_candidates.find(q, {"_id": 0}) \
            .sort("created_at", -1).limit(limit).to_list(limit)
        return {"items": rows, "count": len(rows)}

    @router.get("/candidates/{cand_id}")
    async def get_candidate(cand_id: str, _admin=Depends(require_admin)):
        c = await db.property_candidates.find_one({"id": cand_id}, {"_id": 0})
        if not c: raise HTTPException(404, "Candidate not found")
        return c

    # ─── Phase D-4: Duplicate review — full side-by-side payload ───
    @router.get("/candidates/{cand_id}/review")
    async def review_candidate(cand_id: str, _admin=Depends(require_admin)):
        """Returns candidate + fully hydrated matched AMASS properties for
        side-by-side comparison (map, distance, addresses, counts).

        Always re-scores against properties_geo so the admin sees a live
        picture — the stored duplicate_matches may be stale."""
        cand = await db.property_candidates.find_one({"id": cand_id}, {"_id": 0})
        if not cand:
            raise HTTPException(404, "Candidate not found")

        # Re-score live so we see the freshest neighbours.
        dup = await _score_candidate(cand)
        # Hydrate each match with the full properties_geo doc + listings count
        matches_hydrated = []
        for m in dup["matches"]:
            p = await db.properties_geo.find_one(
                {"amass_property_id": m["amass_property_id"]}, {"_id": 0}
            )
            if not p:
                continue
            listings_count = await db.property_listings.count_documents(
                {"property_id": p["property_uuid"]}
            )
            reps_count = await db.property_representations.count_documents(
                {"property_id": p["property_uuid"], "status": "APPROVED"}
            )
            coords = (p.get("entrance_point") or {}).get("coordinates") or [None, None]
            matches_hydrated.append({
                "amass_property_id": p["amass_property_id"],
                "property_uuid": p["property_uuid"],
                "property_type": p.get("property_type"),
                "property_identity_status": p.get("property_identity_status"),
                "location_verification_status": p.get("location_verification_status"),
                "state": p.get("state"),
                "lga": p.get("lga"),
                "area": p.get("area"),
                "estate": p.get("estate"),
                "street": p.get("street"),
                "raw_address": p.get("raw_address"),
                "latitude": coords[1] if coords[1] is not None else None,
                "longitude": coords[0] if coords[0] is not None else None,
                "listings_count": listings_count,
                "representations_count": reps_count,
                "aliases": p.get("aliases") or [],
                "created_at": p.get("created_at"),
                "distance_meters": m["distance_meters"],
                "score": m["score"],
                "reasons": m.get("reasons") or [],
            })

        # Any prior admin decisions on this candidate?
        history = await db.discovery_admin_overrides.find(
            {"candidate_id": cand_id}, {"_id": 0}
        ).sort("created_at", -1).to_list(20)

        return {
            "candidate": cand,
            "highest_score": dup["score"],
            "recommended_action": dup["action"],
            "matches": matches_hydrated,
            "override_history": history,
        }

    @router.post("/candidates/{cand_id}/resolve")
    async def resolve_candidate(
        cand_id: str,
        data: ResolveDupIn = Body(...),
        admin: dict = Depends(require_admin),
    ):
        """Admin decides:
          • MERGE  → attach candidate to existing AMASS property (no new lead)
          • KEEP_SEPARATE → clear duplicate lock, allow promotion as a new lead
          • MARK_RELATED → keep candidate independent, but link to nearby property
        Writes to discovery_admin_overrides + property_audit_logs when a
        property is affected.
        """
        cand = await db.property_candidates.find_one({"id": cand_id}, {"_id": 0})
        if not cand:
            raise HTTPException(404, "Candidate not found")
        if cand.get("promoted_to_amass_property_id"):
            raise HTTPException(400, "Candidate already resolved")

        now = datetime.now(timezone.utc)
        action = data.action.upper()
        override_id = str(uuid.uuid4())
        override_doc: Dict[str, Any] = {
            "id": override_id,
            "candidate_id": cand_id,
            "google_place_id": cand.get("google_place_id"),
            "action": action,
            "amass_property_id": data.amass_property_id,
            "reason": data.reason,
            "actor_id": admin["id"],
            "actor_email": admin.get("email"),
            "highest_score_at_decision": cand.get("duplicate_score"),
            "created_at": now,
        }

        # ── MERGE: attach candidate to existing property ───────────────
        if action == "MERGE":
            if not data.amass_property_id:
                raise HTTPException(400, "amass_property_id required for MERGE")
            target = await db.properties_geo.find_one(
                {"amass_property_id": data.amass_property_id}, {"_id": 0}
            )
            if not target:
                raise HTTPException(404, f"Target property {data.amass_property_id} not found")
            await db.property_candidates.update_one(
                {"id": cand_id},
                {"$set": {
                    "status": "DUPLICATE",
                    "promoted_to_amass_property_id": target["amass_property_id"],
                    "merged_into_property_uuid": target["property_uuid"],
                    "reviewed_by": admin["id"],
                    "reviewed_at": now,
                    "review_notes": data.reason or "merged into existing property",
                    "updated_at": now,
                }},
            )
            # Add candidate details to the property (aliases + discovery_candidate_ids)
            update_ops: Dict[str, Any] = {
                "$addToSet": {
                    "discovery_candidate_ids": cand_id,
                },
                "$set": {"updated_at": now},
            }
            # Add candidate's Google place_id + raw address as aliases for later lookup
            aliases_to_add = set()
            if cand.get("google_place_id"):
                aliases_to_add.add(f"google:{cand['google_place_id']}")
            if cand.get("address"):
                aliases_to_add.add(cand["address"])
            if aliases_to_add:
                update_ops["$addToSet"]["aliases"] = {"$each": sorted(aliases_to_add)}
            await db.properties_geo.update_one(
                {"amass_property_id": target["amass_property_id"]}, update_ops
            )
            await db.property_audit_logs.insert_one({
                "id": str(uuid.uuid4()),
                "property_id": target["property_uuid"],
                "actor_id": admin["id"],
                "actor_type": "admin",
                "action": "CANDIDATE_MERGED",
                "new_value": {
                    "candidate_id": cand_id,
                    "google_place_id": cand.get("google_place_id"),
                    "candidate_name": cand.get("name"),
                    "amass_property_id": target["amass_property_id"],
                },
                "reason": data.reason,
                "created_at": now,
            })
            await db.discovery_admin_overrides.insert_one(override_doc)
            return {
                "ok": True,
                "action": "MERGE",
                "candidate_id": cand_id,
                "amass_property_id": target["amass_property_id"],
                "property_uuid": target["property_uuid"],
                "override_id": override_id,
            }

        # ── KEEP_SEPARATE: allow this candidate to be promoted as a new lead ──
        if action == "KEEP_SEPARATE":
            await db.property_candidates.update_one(
                {"id": cand_id},
                {"$set": {
                    "status": "UNVERIFIED",
                    "duplicate_matches": [],  # clear lock — admin explicitly cleared
                    "duplicate_score": 0,
                    "admin_override_keep_separate": True,
                    "reviewed_by": admin["id"],
                    "reviewed_at": now,
                    "review_notes": data.reason or "kept separate by admin",
                    "updated_at": now,
                }},
            )
            override_doc["previous_status"] = cand.get("status")
            await db.discovery_admin_overrides.insert_one(override_doc)
            return {
                "ok": True,
                "action": "KEEP_SEPARATE",
                "candidate_id": cand_id,
                "next_status": "UNVERIFIED",
                "override_id": override_id,
            }

        # ── MARK_RELATED: informational link (candidate stays independent) ──
        if action == "MARK_RELATED":
            if not data.amass_property_id:
                raise HTTPException(400, "amass_property_id required for MARK_RELATED")
            target = await db.properties_geo.find_one(
                {"amass_property_id": data.amass_property_id}, {"_id": 0}
            )
            if not target:
                raise HTTPException(404, f"Target property {data.amass_property_id} not found")
            await db.property_candidates.update_one(
                {"id": cand_id},
                {"$set": {
                    "status": "UNVERIFIED",
                    "related_amass_property_id": target["amass_property_id"],
                    "reviewed_by": admin["id"],
                    "reviewed_at": now,
                    "review_notes": data.reason or f"related to {target['amass_property_id']}",
                    "updated_at": now,
                }},
            )
            await db.properties_geo.update_one(
                {"amass_property_id": target["amass_property_id"]},
                {"$addToSet": {"related_candidate_ids": cand_id},
                 "$set": {"updated_at": now}},
            )
            await db.property_audit_logs.insert_one({
                "id": str(uuid.uuid4()),
                "property_id": target["property_uuid"],
                "actor_id": admin["id"],
                "actor_type": "admin",
                "action": "CANDIDATE_MARKED_RELATED",
                "new_value": {
                    "candidate_id": cand_id,
                    "candidate_name": cand.get("name"),
                    "amass_property_id": target["amass_property_id"],
                },
                "reason": data.reason,
                "created_at": now,
            })
            await db.discovery_admin_overrides.insert_one(override_doc)
            return {
                "ok": True,
                "action": "MARK_RELATED",
                "candidate_id": cand_id,
                "amass_property_id": target["amass_property_id"],
                "override_id": override_id,
            }

        raise HTTPException(400, "Unknown action")

    @router.get("/overrides")
    async def list_overrides(
        candidate_id: Optional[str] = Query(None),
        amass_property_id: Optional[str] = Query(None),
        action: Optional[str] = Query(None),
        limit: int = Query(50, ge=1, le=200),
        _admin=Depends(require_admin),
    ):
        q: dict = {}
        if candidate_id: q["candidate_id"] = candidate_id
        if amass_property_id: q["amass_property_id"] = amass_property_id
        if action: q["action"] = action.upper()
        rows = await db.discovery_admin_overrides.find(q, {"_id": 0}) \
            .sort("created_at", -1).limit(limit).to_list(limit)
        return {"items": rows, "count": len(rows)}

    # ─── Promote candidate to AMASS lead (properties_geo) ───
    @router.post("/candidates/{cand_id}/promote")
    async def promote_candidate(
        cand_id: str,
        data: PromoteIn = Body(default_factory=PromoteIn),
        admin: dict = Depends(require_admin),
    ):
        cand = await db.property_candidates.find_one({"id": cand_id}, {"_id": 0})
        if not cand: raise HTTPException(404, "Candidate not found")
        if cand.get("promoted_to_amass_property_id"):
            return {"ok": True, "already_promoted": True,
                    "amass_property_id": cand["promoted_to_amass_property_id"]}

        # If it's a high-confidence duplicate and admin didn't force, attach.
        if not data.force_new and cand.get("duplicate_matches"):
            top = cand["duplicate_matches"][0]
            if top["score"] >= 75:
                await db.property_candidates.update_one(
                    {"id": cand_id},
                    {"$set": {"status": "DUPLICATE",
                              "promoted_to_amass_property_id": top["amass_property_id"],
                              "reviewed_by": admin["id"],
                              "reviewed_at": datetime.now(timezone.utc),
                              "review_notes": data.notes or "attached to existing"}},
                )
                return {"ok": True, "attached_to_existing": True,
                        "amass_property_id": top["amass_property_id"]}

        # Create a new properties_geo doc — status PENDING_REVIEW, awaits agent verification.
        from property_identity import _next_property_id, _state_code
        state = (data.verified_address or {}).get("state") or "Lagos"
        sc = _state_code(state)
        amass_id = await _next_property_id(db, sc)
        prop_uuid = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        va = data.verified_address or {}
        doc = {
            "property_uuid": prop_uuid,
            "amass_property_id": amass_id,
            "source_type": cand.get("source_type", "GOOGLE_PLACES"),
            "source_reference": cand.get("source_reference"),
            "google_place_id": cand.get("google_place_id"),
            "state": state,
            "lga": va.get("lga"),
            "district": va.get("district"),
            "area": va.get("area"),
            "estate": va.get("estate"),
            "street": va.get("street"),
            "raw_address": cand.get("address"),
            "normalized_address": (cand.get("address") or "").lower(),
            "entrance_point": cand.get("location"),
            "gps_accuracy_meters": 25,
            "location_source": "GOOGLE_PLACES",
            "location_verification_status": "UNVERIFIED",  # awaits on-site GPS
            "property_identity_status": "PENDING_REVIEW",
            "physical_status": "ACTIVE",
            "property_type": cand.get("candidate_type"),
            "details": {},
            "media_ids": [],
            "aliases": [],
            "created_by": admin["id"],
            "candidate_id": cand_id,
            "created_at": now,
            "updated_at": now,
        }
        await db.properties_geo.insert_one(doc)
        await db.property_candidates.update_one(
            {"id": cand_id},
            {"$set": {"status": "VERIFICATION_PENDING",
                      "promoted_to_amass_property_id": amass_id,
                      "reviewed_by": admin["id"],
                      "reviewed_at": now,
                      "review_notes": data.notes}},
        )
        await db.property_audit_logs.insert_one({
            "id": str(uuid.uuid4()),
            "property_id": prop_uuid,
            "actor_id": admin["id"],
            "actor_type": "admin",
            "action": "PROPERTY_CREATED",
            "new_value": {"source": "GOOGLE_PLACES_DISCOVERY", "candidate_id": cand_id,
                          "amass_property_id": amass_id},
            "created_at": now,
        })
        return {"ok": True, "amass_property_id": amass_id, "property_uuid": prop_uuid,
                "status": "PENDING_REVIEW"}

    # ─── Dismiss ───
    @router.post("/candidates/{cand_id}/dismiss")
    async def dismiss_candidate(
        cand_id: str,
        reason: str = Body("not_a_property", embed=True),
        admin: dict = Depends(require_admin),
    ):
        r = await db.property_candidates.update_one(
            {"id": cand_id},
            {"$set": {"status": "ARCHIVED", "reviewed_by": admin["id"],
                      "reviewed_at": datetime.now(timezone.utc),
                      "review_notes": reason}},
        )
        if not r.matched_count: raise HTTPException(404, "Not found")
        return {"ok": True}

    # ─── Bulk discovery jobs ───
    async def _run_bulk_job(job_id: str):
        """Runner: iterates the job's searches, calls text/nearby, ingests candidates."""
        client = _pick_client()
        job = await db.discovery_jobs.find_one({"id": job_id}, {"_id": 0})
        if not job:
            return
        await db.discovery_jobs.update_one(
            {"id": job_id},
            {"$set": {"status": "RUNNING", "started_at": datetime.now(timezone.utc)}},
        )
        candidates_created = 0
        duplicates = 0
        errors: List[str] = []
        try:
            for i, search in enumerate(job["searches"]):
                if search.get("query"):
                    from discovery_google import PlacesTextSearchIn
                    r = await client.text_search(PlacesTextSearchIn(**{"query": search["query"], "max_results": search.get("max_results", 10)}))
                elif search.get("lat") and search.get("lng"):
                    from discovery_google import PlacesNearbyIn
                    r = await client.nearby_search(PlacesNearbyIn(**{
                        "lat": search["lat"], "lng": search["lng"],
                        "radius_m": search.get("radius_m", 2000),
                        "max_results": search.get("max_results", 10),
                    }))
                else:
                    continue
                for place in r.get("places", []):
                    # Idempotent ingest
                    existing = await db.property_candidates.find_one(
                        {"google_place_id": place.get("id")}, {"_id": 0, "id": 1}
                    )
                    if existing:
                        continue
                    cand = _place_to_candidate_doc(place)
                    dup = await _score_candidate(cand)
                    cand["duplicate_score"] = dup["score"]
                    cand["duplicate_matches"] = dup["matches"]
                    if dup["action"] == "high_confidence_duplicate":
                        cand["status"] = "DUPLICATE"
                        duplicates += 1
                    elif dup["action"] == "possible_duplicate":
                        cand["status"] = "PENDING_DEDUPLICATION"
                    else:
                        cand["status"] = "UNVERIFIED"
                    await db.property_candidates.insert_one(cand)
                    candidates_created += 1
                await db.discovery_jobs.update_one(
                    {"id": job_id},
                    {"$set": {"progress": {"current": i + 1, "total": len(job["searches"])},
                              "candidates_created": candidates_created,
                              "duplicates_flagged": duplicates}},
                )
                # Cancellation check
                fresh = await db.discovery_jobs.find_one({"id": job_id}, {"status": 1})
                if fresh and fresh.get("status") == "CANCELLED":
                    return
            await db.discovery_jobs.update_one(
                {"id": job_id},
                {"$set": {"status": "COMPLETED", "completed_at": datetime.now(timezone.utc),
                          "candidates_created": candidates_created,
                          "duplicates_flagged": duplicates, "errors": errors}},
            )
        except Exception as e:
            await db.discovery_jobs.update_one(
                {"id": job_id},
                {"$set": {"status": "FAILED", "completed_at": datetime.now(timezone.utc),
                          "error": str(e), "candidates_created": candidates_created}},
            )

    @router.post("/jobs")
    async def create_bulk_job(data: BulkJobIn, admin: dict = Depends(require_admin)):
        if not await get_feature_flag(db, "PROPERTY_DISCOVERY_ENABLED"):
            raise HTTPException(403, "Discovery disabled")
        # Concurrent-job limit
        running = await db.discovery_jobs.count_documents({"status": {"$in": ["QUEUED", "RUNNING"]}})
        from app_settings import get_setting
        limits = await get_setting(db, "google_limits")
        if running >= limits.get("max_concurrent_jobs", 2):
            raise HTTPException(429, f"Too many concurrent jobs (max {limits.get('max_concurrent_jobs',2)})")
        job = {
            "id": str(uuid.uuid4()),
            "label": data.label,
            "searches": data.searches,
            "include_details": data.include_details,
            "status": "QUEUED",
            "progress": {"current": 0, "total": len(data.searches)},
            "candidates_created": 0,
            "duplicates_flagged": 0,
            "created_by": admin["id"],
            "created_at": datetime.now(timezone.utc),
        }
        await db.discovery_jobs.insert_one(job)
        # Fire-and-forget runner (best-effort — no distributed queue)
        asyncio.create_task(_run_bulk_job(job["id"]))
        job.pop("_id", None)
        return job

    @router.get("/jobs")
    async def list_jobs(limit: int = Query(20, ge=1, le=100), _admin=Depends(require_admin)):
        rows = await db.discovery_jobs.find({}, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
        return rows

    @router.get("/jobs/{job_id}")
    async def get_job(job_id: str, _admin=Depends(require_admin)):
        j = await db.discovery_jobs.find_one({"id": job_id}, {"_id": 0})
        if not j: raise HTTPException(404, "Job not found")
        return j

    @router.post("/jobs/{job_id}/cancel")
    async def cancel_job(job_id: str, _admin=Depends(require_admin)):
        r = await db.discovery_jobs.update_one(
            {"id": job_id, "status": {"$in": ["QUEUED", "RUNNING"]}},
            {"$set": {"status": "CANCELLED", "cancelled_at": datetime.now(timezone.utc)}},
        )
        if not r.matched_count: raise HTTPException(404, "Job not cancellable")
        return {"ok": True}

    return router


async def fail_crashed_jobs(db):
    """Called from server.on_startup — flip RUNNING jobs to FAILED (crash recovery)."""
    now = datetime.now(timezone.utc)
    await db.discovery_jobs.update_many(
        {"status": {"$in": ["QUEUED", "RUNNING"]}},
        {"$set": {"status": "FAILED", "completed_at": now,
                  "error": "Server restarted while job was running"}},
    )
