"""AMASS Phase D-6 — Verification scoring, expiry, and fraud signals.

Score (0–100) is a rolling number on `properties_geo.verification_score` with
transparent factors:
  • Verification recency (age since verified_at)                40 pts
  • GPS accuracy tier at time of verification                    20 pts
  • Drift from pin (agent GPS vs stored entrance point)          15 pts
  • On-site proof photo attached                                 10 pts
  • Agent trust (verifications completed × cap)                  10 pts
  • Duplicate cleanliness (no active fraud flags)                 5 pts

Tiers:  ≥ 85 SUPER · ≥ 70 VERIFIED · ≥ 50 UNSTABLE · else UNVERIFIED

Score decay: linear decay from 40 to 0 over 12 months since verified_at.
Anything unverified starts at 0.

Fraud rule set (recomputed on `verify` and via admin sweep):
  RAPID_VERIFICATION      — same agent submits > 6 verifications inside 30min
  HIGH_GPS_DRIFT          — verify.drift_from_pin_meters > 250
  LOW_GPS_ACCURACY_SET    — verified with accuracy_meters > 50
  STALE_UNVERIFIED        — property older than 30 days, still UNVERIFIED
  CLUSTER_DUPLICATE       — 3+ properties within 15m radius
  MISSING_PROOF_PHOTO     — PROPERTY_EXISTS verdict, no photo attached
Each flag is upsert-idempotent per (property_uuid, flag_type).
"""
from __future__ import annotations

import math
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query


# ── Score helpers ────────────────────────────────────────────────
def _recency_pts(verified_at: Optional[datetime]) -> int:
    if not verified_at:
        return 0
    if verified_at.tzinfo is None:
        verified_at = verified_at.replace(tzinfo=timezone.utc)
    age_days = (datetime.now(timezone.utc) - verified_at).days
    if age_days <= 30: return 40
    if age_days >= 365: return 0
    # linear decay
    return max(0, int(40 * (365 - age_days) / (365 - 30)))


def _gps_tier_pts(accuracy_m: Optional[float]) -> int:
    if accuracy_m is None: return 0
    if accuracy_m <= 10: return 20
    if accuracy_m <= 25: return 14
    if accuracy_m <= 50: return 6
    return 0


def _drift_pts(drift_m: Optional[float]) -> int:
    if drift_m is None: return 0
    if drift_m <= 15: return 15
    if drift_m <= 50: return 10
    if drift_m <= 150: return 5
    return 0


def _photo_pts(photo_path: Optional[str]) -> int:
    return 10 if photo_path else 0


async def _agent_trust_pts(db, agent_id: Optional[str]) -> int:
    if not agent_id: return 0
    n = await db.agent_verification_tasks.count_documents(
        {"assigned_agent_id": agent_id, "status": "COMPLETED"}
    )
    if n >= 20: return 10
    if n >= 5:  return 6
    if n >= 1:  return 3
    return 0


async def _duplicate_cleanliness_pts(db, property_uuid: str) -> int:
    active = await db.fraud_flags.count_documents(
        {"property_uuid": property_uuid, "status": "ACTIVE",
         "flag_type": {"$in": ["CLUSTER_DUPLICATE", "HIGH_GPS_DRIFT"]}}
    )
    return 0 if active else 5


def _tier_from_score(score: int) -> str:
    if score >= 85: return "SUPER"
    if score >= 70: return "VERIFIED"
    if score >= 50: return "UNSTABLE"
    return "UNVERIFIED"


async def compute_verification_score(db, property_doc: Dict[str, Any]) -> Dict[str, Any]:
    """Compute + persist the verification score for one property."""
    verify_task = await db.agent_verification_tasks.find_one(
        {"property_uuid": property_doc["property_uuid"], "status": "COMPLETED"},
        {"_id": 0}, sort=[("completed_at", -1)],
    )
    vd = (verify_task or {}).get("verification_data") or {}
    accuracy = vd.get("accuracy_meters")
    drift = vd.get("drift_from_pin_meters")
    photo = vd.get("photo_path")

    breakdown = {
        "recency": _recency_pts(property_doc.get("verified_at")),
        "gps_tier": _gps_tier_pts(accuracy),
        "drift": _drift_pts(drift),
        "photo": _photo_pts(photo),
        "agent_trust": await _agent_trust_pts(db, property_doc.get("verified_by")),
        "duplicate_cleanliness": await _duplicate_cleanliness_pts(db, property_doc["property_uuid"]),
    }
    total = sum(breakdown.values())
    tier = _tier_from_score(total)
    now = datetime.now(timezone.utc)
    await db.properties_geo.update_one(
        {"property_uuid": property_doc["property_uuid"]},
        {"$set": {
            "verification_score": total,
            "verification_tier": tier,
            "verification_score_breakdown": breakdown,
            "verification_score_computed_at": now,
        }},
    )
    return {"score": total, "tier": tier, "breakdown": breakdown, "computed_at": now}


# ── Fraud detection rules ────────────────────────────────────────
async def _upsert_flag(db, property_uuid: str, flag_type: str, detail: Dict[str, Any],
                       severity: str = "medium"):
    now = datetime.now(timezone.utc)
    # If an active flag exists, just refresh detail + last_seen
    existing = await db.fraud_flags.find_one(
        {"property_uuid": property_uuid, "flag_type": flag_type, "status": "ACTIVE"},
        {"_id": 0},
    )
    if existing:
        await db.fraud_flags.update_one(
            {"id": existing["id"]},
            {"$set": {"detail": detail, "last_seen_at": now, "updated_at": now}},
        )
        return existing["id"]
    fid = str(uuid.uuid4())
    await db.fraud_flags.insert_one({
        "id": fid,
        "property_uuid": property_uuid,
        "flag_type": flag_type,
        "severity": severity,
        "detail": detail,
        "status": "ACTIVE",
        "created_at": now,
        "updated_at": now,
        "last_seen_at": now,
    })
    return fid


async def _clear_flag_if_present(db, property_uuid: str, flag_type: str, reason: str):
    """Auto-clear a flag when its trigger no longer applies."""
    now = datetime.now(timezone.utc)
    await db.fraud_flags.update_many(
        {"property_uuid": property_uuid, "flag_type": flag_type, "status": "ACTIVE"},
        {"$set": {"status": "AUTO_CLEARED", "cleared_at": now,
                  "cleared_reason": reason, "updated_at": now}},
    )


async def _check_rapid_verification(db, agent_id: Optional[str]) -> Optional[Dict[str, Any]]:
    if not agent_id: return None
    since = datetime.now(timezone.utc) - timedelta(minutes=30)
    n = await db.agent_verification_tasks.count_documents(
        {"assigned_agent_id": agent_id, "status": "COMPLETED",
         "completed_at": {"$gte": since}},
    )
    if n > 6:
        return {"agent_id": agent_id, "verifications_in_30_min": n}
    return None


async def _check_cluster_duplicate(db, property_doc: Dict[str, Any]) -> Optional[int]:
    ep = property_doc.get("entrance_point")
    if not ep or not ep.get("coordinates"): return None
    lng, lat = ep["coordinates"]
    # Mongo does not allow $near with count/aggregate — use $geoWithin/$centerSphere instead.
    # Radius is in radians: 15m / earth_radius_m
    radius_rad = 15 / 6378100.0
    n = await db.properties_geo.count_documents({
        "property_uuid": {"$ne": property_doc["property_uuid"]},
        "physical_status": {"$ne": "MERGED"},
        "entrance_point": {
            "$geoWithin": {"$centerSphere": [[lng, lat], radius_rad]},
        },
    })
    return n if n >= 2 else None  # 2 neighbours within 15m = cluster of 3+


async def _check_stale_unverified(db, property_doc: Dict[str, Any]) -> Optional[int]:
    if property_doc.get("location_verification_status") == "VERIFIED":
        return None
    created = property_doc.get("created_at")
    if not created: return None
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    age = (datetime.now(timezone.utc) - created).days
    return age if age >= 30 else None


async def evaluate_property_fraud(db, property_uuid: str) -> Dict[str, Any]:
    """Recompute all fraud flags for one property. Called after verify + on admin sweep."""
    prop = await db.properties_geo.find_one({"property_uuid": property_uuid}, {"_id": 0})
    if not prop:
        return {"flags": [], "cleared": []}
    flagged: List[str] = []
    cleared: List[str] = []

    # Latest verification
    verify_task = await db.agent_verification_tasks.find_one(
        {"property_uuid": property_uuid, "status": "COMPLETED"},
        {"_id": 0}, sort=[("completed_at", -1)],
    )
    vd = (verify_task or {}).get("verification_data") or {}

    # HIGH_GPS_DRIFT
    drift = vd.get("drift_from_pin_meters")
    if drift is not None and drift > 250:
        await _upsert_flag(db, property_uuid, "HIGH_GPS_DRIFT",
                           {"drift_meters": drift}, severity="high")
        flagged.append("HIGH_GPS_DRIFT")
    elif drift is not None:
        await _clear_flag_if_present(db, property_uuid, "HIGH_GPS_DRIFT",
                                     "drift within threshold")
        cleared.append("HIGH_GPS_DRIFT")

    # LOW_GPS_ACCURACY_SET
    acc = vd.get("accuracy_meters")
    if acc is not None and acc > 50:
        await _upsert_flag(db, property_uuid, "LOW_GPS_ACCURACY_SET",
                           {"accuracy_meters": acc}, severity="medium")
        flagged.append("LOW_GPS_ACCURACY_SET")

    # MISSING_PROOF_PHOTO
    if vd.get("verdict") == "PROPERTY_EXISTS" and not vd.get("photo_path"):
        await _upsert_flag(db, property_uuid, "MISSING_PROOF_PHOTO",
                           {"submitted_at": vd.get("submitted_at")}, severity="low")
        flagged.append("MISSING_PROOF_PHOTO")

    # RAPID_VERIFICATION (agent-level)
    rapid = await _check_rapid_verification(db, prop.get("verified_by"))
    if rapid:
        await _upsert_flag(db, property_uuid, "RAPID_VERIFICATION", rapid, severity="medium")
        flagged.append("RAPID_VERIFICATION")

    # CLUSTER_DUPLICATE
    neighbour_count = await _check_cluster_duplicate(db, prop)
    if neighbour_count is not None:
        await _upsert_flag(db, property_uuid, "CLUSTER_DUPLICATE",
                           {"neighbours_within_15m": neighbour_count}, severity="high")
        flagged.append("CLUSTER_DUPLICATE")
    else:
        await _clear_flag_if_present(db, property_uuid, "CLUSTER_DUPLICATE",
                                     "no dense cluster")

    # STALE_UNVERIFIED
    stale = await _check_stale_unverified(db, prop)
    if stale is not None:
        await _upsert_flag(db, property_uuid, "STALE_UNVERIFIED",
                           {"age_days": stale}, severity="low")
        flagged.append("STALE_UNVERIFIED")
    else:
        await _clear_flag_if_present(db, property_uuid, "STALE_UNVERIFIED",
                                     "now verified")

    return {"flags": flagged, "cleared": cleared}


async def sweep_stale_unverified(db, batch_size: int = 200) -> Dict[str, int]:
    """Batch flag properties older than 30 days still UNVERIFIED."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    stale = await db.properties_geo.find(
        {"location_verification_status": {"$ne": "VERIFIED"},
         "physical_status": {"$ne": "MERGED"},
         "created_at": {"$lt": cutoff}},
        {"_id": 0, "property_uuid": 1, "created_at": 1},
    ).limit(batch_size).to_list(batch_size)
    n = 0
    for p in stale:
        age = (datetime.now(timezone.utc) - (p["created_at"].replace(tzinfo=timezone.utc)
                                              if p["created_at"].tzinfo is None
                                              else p["created_at"])).days
        await _upsert_flag(db, p["property_uuid"], "STALE_UNVERIFIED",
                           {"age_days": age}, severity="low")
        n += 1
    return {"stale_flagged": n}


# ── Router ───────────────────────────────────────────────────────
def register_verification_scoring_routes(db, get_current_user, require_admin):
    router = APIRouter(prefix="/api", tags=["verification-scoring"])

    @router.get("/properties-v2/{amass_id}/score")
    async def get_property_score(amass_id: str):
        prop = await db.properties_geo.find_one(
            {"$or": [{"amass_property_id": amass_id}, {"aliases": amass_id}]},
            {"_id": 0, "property_uuid": 1, "amass_property_id": 1,
             "verification_score": 1, "verification_tier": 1,
             "verification_score_breakdown": 1,
             "verification_score_computed_at": 1,
             "location_verification_status": 1, "verified_at": 1,
             "physical_status": 1},
        )
        if not prop or prop.get("physical_status") == "MERGED":
            raise HTTPException(404, "Property not found")
        if prop.get("verification_score") is None:
            # Compute on the fly (first-visit lazy compute)
            full = await db.properties_geo.find_one(
                {"amass_property_id": prop["amass_property_id"]}, {"_id": 0}
            )
            await compute_verification_score(db, full)
            prop = await db.properties_geo.find_one(
                {"amass_property_id": prop["amass_property_id"]},
                {"_id": 0, "amass_property_id": 1, "verification_score": 1,
                 "verification_tier": 1, "verification_score_breakdown": 1,
                 "verification_score_computed_at": 1,
                 "location_verification_status": 1, "verified_at": 1},
            )
        return {
            "amass_property_id": prop["amass_property_id"],
            "score": prop.get("verification_score", 0),
            "tier": prop.get("verification_tier", "UNVERIFIED"),
            "breakdown": prop.get("verification_score_breakdown") or {},
            "computed_at": prop.get("verification_score_computed_at"),
            "verified_at": prop.get("verified_at"),
            "location_verification_status": prop.get("location_verification_status"),
        }

    @router.get("/admin/fraud/flags")
    async def list_flags(
        status: str = Query("ACTIVE"),
        flag_type: Optional[str] = Query(None),
        limit: int = Query(50, ge=1, le=200),
        _admin=Depends(require_admin),
    ):
        q: Dict[str, Any] = {"status": status.upper()}
        if flag_type: q["flag_type"] = flag_type.upper()
        rows = await db.fraud_flags.find(q, {"_id": 0}) \
            .sort("created_at", -1).limit(limit).to_list(limit)
        # hydrate property snapshot
        for r in rows:
            p = await db.properties_geo.find_one(
                {"property_uuid": r["property_uuid"]},
                {"_id": 0, "amass_property_id": 1, "state": 1, "lga": 1, "area": 1,
                 "raw_address": 1, "property_type": 1, "verification_tier": 1},
            )
            r["property"] = p
        # counts by type
        counts_pipe = [{"$match": {"status": "ACTIVE"}},
                       {"$group": {"_id": "$flag_type", "n": {"$sum": 1}}}]
        counts = {r["_id"]: r["n"] async for r in db.fraud_flags.aggregate(counts_pipe)}
        return {"items": rows, "count": len(rows), "counts_by_type": counts}

    @router.post("/admin/fraud/flags/{flag_id}/dismiss")
    async def dismiss_flag(
        flag_id: str,
        reason: str = Body("false positive", embed=True),
        admin: dict = Depends(require_admin),
    ):
        r = await db.fraud_flags.update_one(
            {"id": flag_id, "status": "ACTIVE"},
            {"$set": {"status": "DISMISSED", "dismissed_at": datetime.now(timezone.utc),
                      "dismissed_by": admin["id"], "cleared_reason": reason,
                      "updated_at": datetime.now(timezone.utc)}},
        )
        if not r.matched_count:
            raise HTTPException(404, "Flag not found or already resolved")
        return {"ok": True}

    @router.post("/admin/fraud/sweep")
    async def admin_sweep(_admin=Depends(require_admin)):
        r = await sweep_stale_unverified(db)
        return r

    @router.post("/admin/properties/{amass_id}/recompute-score")
    async def admin_recompute_score(amass_id: str, _admin=Depends(require_admin)):
        prop = await db.properties_geo.find_one({"amass_property_id": amass_id}, {"_id": 0})
        if not prop:
            raise HTTPException(404, "Property not found")
        s = await compute_verification_score(db, prop)
        f = await evaluate_property_fraud(db, prop["property_uuid"])
        return {"score": s, "fraud": f}

    return router
