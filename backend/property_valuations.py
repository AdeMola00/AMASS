"""AMASS Phase D-8 — Hybrid Comparable Estimator + AI valuation.

Algorithm (deterministic first, LLM narrative second):
  1. Find up-to-N comparable properties in same LGA + same property_type
     with a listing price + size_sqm.
  2. Compute median ₦/sqm from comparables' latest listings.
  3. Baseline value = median_ppsqm × target.size_sqm (if size known,
     else median comp listing_price).
  4. Adjustments:
       + verification_tier bump (SUPER +5%, VERIFIED +2%, else 0%)
       + amenities count (each +0.5% up to +5%)
       – fraud_flags penalty (each ACTIVE flag −3%, cap −15%)
  5. Confidence: from comparables count + verification score + median dispersion.
  6. LLM narrative from Claude Sonnet 4.5 (via Emergent LLM key) — optional.
  7. Cache result in `property_valuations` for 24 hours.

Range: value ± dispersion% (min 8%, max 25%).
"""
from __future__ import annotations

import math
import os
import statistics
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query


VALUATION_TTL_HOURS = 24
COMP_RADIUS_M_DEFAULT = 2500  # 2.5km


async def _find_comparables(db, prop: Dict[str, Any], radius_m: int = COMP_RADIUS_M_DEFAULT,
                            limit: int = 10) -> List[Dict[str, Any]]:
    ep = prop.get("entrance_point")
    if not ep or not ep.get("coordinates"):
        return []
    lng, lat = ep["coordinates"]
    # 1. Nearby same-type properties with an active listing
    nearby = await db.properties_geo.find({
        "property_uuid": {"$ne": prop["property_uuid"]},
        "physical_status": {"$ne": "MERGED"},
        "property_type": prop.get("property_type"),
        "entrance_point": {
            "$near": {"$geometry": {"type": "Point", "coordinates": [lng, lat]},
                      "$maxDistance": radius_m},
        },
    }, {"_id": 0}).limit(30).to_list(30)
    if not nearby:
        # Fallback — same LGA regardless of type
        nearby = await db.properties_geo.find({
            "lga": prop.get("lga"),
            "property_uuid": {"$ne": prop["property_uuid"]},
            "physical_status": {"$ne": "MERGED"},
        }, {"_id": 0}).limit(30).to_list(30)

    comps: List[Dict[str, Any]] = []
    for other in nearby:
        listing = await db.property_listings.find_one(
            {"property_id": other["property_uuid"],
             "status": {"$in": ["active", "available", "verified", "coming_soon"]},
             "price": {"$gt": 0}},
            {"_id": 0}, sort=[("updated_at", -1)],
        )
        if not listing:
            continue
        sqm = (listing.get("size_sqm") or other.get("details", {}).get("size_sqm") or 0) or 0
        price = listing.get("price") or 0
        if price <= 0:
            continue
        ppsqm = (price / sqm) if sqm > 0 else None
        comps.append({
            "amass_property_id": other["amass_property_id"],
            "property_uuid": other["property_uuid"],
            "listing_id": listing.get("id"),
            "listing_type": listing.get("listing_type") or "buy",
            "price": price,
            "size_sqm": sqm,
            "price_per_sqm": ppsqm,
            "distance_m": None,  # can be enriched later
            "state": other.get("state"),
            "lga": other.get("lga"),
        })
        if len(comps) >= limit:
            break
    return comps


def _median_ppsqm(comps: List[Dict[str, Any]]) -> Optional[float]:
    ppsqm = [c["price_per_sqm"] for c in comps if c.get("price_per_sqm")]
    if not ppsqm: return None
    return statistics.median(ppsqm)


def _dispersion_pct(comps: List[Dict[str, Any]]) -> float:
    """Median absolute deviation as % of median ppsqm."""
    ppsqm = [c["price_per_sqm"] for c in comps if c.get("price_per_sqm")]
    if len(ppsqm) < 2:
        return 20.0
    med = statistics.median(ppsqm)
    if med == 0:
        return 25.0
    mad = statistics.median([abs(x - med) for x in ppsqm])
    return max(8.0, min(25.0, (mad / med) * 100))


async def _adjustments(db, prop: Dict[str, Any]) -> Dict[str, float]:
    tier_bump = {"SUPER": 0.05, "VERIFIED": 0.02}.get(
        prop.get("verification_tier") or "", 0.0
    )
    amenities = (prop.get("details") or {}).get("amenities") or []
    amen_bump = min(0.05, len(amenities) * 0.005)
    active_flags = await db.fraud_flags.count_documents(
        {"property_uuid": prop["property_uuid"], "status": "ACTIVE"}
    )
    fraud_penalty = -min(0.15, active_flags * 0.03)
    return {
        "verification_tier": tier_bump,
        "amenities": amen_bump,
        "fraud_flags": fraud_penalty,
    }


async def _llm_narrative(prop: Dict[str, Any], value: float, range_low: float,
                          range_high: float, confidence: int,
                          comps_count: int) -> Optional[str]:
    """Optional narrative — degrades gracefully if the LLM call fails."""
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key: return None
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
    except Exception:
        return None
    ctx = (
        f"Property: {prop.get('amass_property_id')} — "
        f"{prop.get('property_type') or 'property'} in "
        f"{prop.get('area') or ''} {prop.get('lga') or ''}, {prop.get('state') or ''}. "
        f"Verification tier: {prop.get('verification_tier') or 'UNVERIFIED'}. "
        f"Estimated value: ₦{value:,.0f} (range ₦{range_low:,.0f}–₦{range_high:,.0f}). "
        f"Confidence: {confidence}%. Comparables considered: {comps_count}."
    )
    try:
        chat = (LlmChat(api_key=key, session_id=f"val-{prop['property_uuid']}",
                        system_message=(
                            "You are an African real-estate valuer. Given a value estimate + "
                            "market context, write 2 concise sentences (max 40 words) explaining "
                            "the price and what drives confidence up or down. No pricing advice; "
                            "purely descriptive."
                        ))
                .with_model("anthropic", "claude-sonnet-4-5-20250929")
                .with_max_tokens(160))
        rsp = await chat.send_message(UserMessage(text=ctx))
        return (getattr(rsp, "text", None) or str(rsp)).strip()
    except Exception:
        return None


async def estimate_property_valuation(
    db, property_uuid: str, force_refresh: bool = False,
    triggered_by: str = "user",
) -> Dict[str, Any]:
    prop = await db.properties_geo.find_one({"property_uuid": property_uuid}, {"_id": 0})
    if not prop:
        raise HTTPException(404, "Property not found")
    if prop.get("physical_status") == "MERGED":
        raise HTTPException(410, "Property has been merged")

    # Cache hit?
    if not force_refresh:
        cached = await db.property_valuations.find_one(
            {"property_uuid": property_uuid, "status": "ACTIVE"},
            {"_id": 0}, sort=[("valued_at", -1)],
        )
        if cached and cached.get("valued_at"):
            valued_at = cached["valued_at"]
            if valued_at.tzinfo is None:
                valued_at = valued_at.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) - valued_at < timedelta(hours=VALUATION_TTL_HOURS):
                return cached

    comps = await _find_comparables(db, prop)
    med_ppsqm = _median_ppsqm(comps)
    disp = _dispersion_pct(comps)
    target_sqm = ((prop.get("details") or {}).get("size_sqm") or 0)

    if med_ppsqm and target_sqm:
        baseline = med_ppsqm * target_sqm
        method = "median_ppsqm_x_size"
    elif comps:
        baseline = statistics.median([c["price"] for c in comps])
        method = "median_comp_price"
    else:
        baseline = 0.0
        method = "no_comparables"

    adj = await _adjustments(db, prop)
    adj_multiplier = 1 + sum(adj.values())
    value = round(baseline * adj_multiplier)

    range_low = round(value * (1 - disp / 100))
    range_high = round(value * (1 + disp / 100))

    # Confidence 0–100
    conf = 30
    if comps: conf += min(35, 4 * len(comps))
    if prop.get("verification_tier") == "SUPER": conf += 15
    elif prop.get("verification_tier") == "VERIFIED": conf += 10
    if med_ppsqm: conf += 10
    if disp < 12: conf += 5
    conf = max(0, min(100, conf))

    now = datetime.now(timezone.utc)
    narrative = None
    if value > 0:
        narrative = await _llm_narrative(prop, value, range_low, range_high, conf, len(comps))

    valuation = {
        "id": str(uuid.uuid4()),
        "amass_property_id": prop["amass_property_id"],
        "property_uuid": property_uuid,
        "value": value,
        "range_low": range_low,
        "range_high": range_high,
        "currency": "NGN",
        "confidence": conf,
        "method": method,
        "comparables_count": len(comps),
        "comparables_sample": comps[:5],
        "median_price_per_sqm": med_ppsqm,
        "dispersion_pct": round(disp, 1),
        "adjustments": adj,
        "narrative": narrative,
        "target_size_sqm": target_sqm,
        "triggered_by": triggered_by,
        "valued_at": now,
        "status": "ACTIVE",
    }
    # Mark previous ACTIVE ones as SUPERSEDED
    await db.property_valuations.update_many(
        {"property_uuid": property_uuid, "status": "ACTIVE"},
        {"$set": {"status": "SUPERSEDED", "superseded_at": now}},
    )
    await db.property_valuations.insert_one(valuation)
    # Also stamp a compact copy onto properties_geo for quick reads
    await db.properties_geo.update_one(
        {"property_uuid": property_uuid},
        {"$set": {
            "ai_valuation": {
                "value": value, "range_low": range_low, "range_high": range_high,
                "currency": "NGN", "confidence": conf,
                "method": method, "valued_at": now,
            },
        }},
    )
    valuation.pop("_id", None)
    return valuation


# ── Router ──────────────────────────────────────────────────────
def register_valuation_routes(db, get_current_user, require_admin):
    router = APIRouter(prefix="/api", tags=["property-valuations"])

    @router.get("/properties-v2/{amass_id}/valuation")
    async def get_valuation(amass_id: str, force_refresh: bool = Query(False)):
        prop = await db.properties_geo.find_one(
            {"$or": [{"amass_property_id": amass_id}, {"aliases": amass_id}]},
            {"_id": 0, "property_uuid": 1, "amass_property_id": 1, "physical_status": 1},
        )
        if not prop or prop.get("physical_status") == "MERGED":
            raise HTTPException(404, "Property not found")
        val = await estimate_property_valuation(
            db, prop["property_uuid"], force_refresh=force_refresh
        )
        # Strip internals from public payload
        return {
            "amass_property_id": val["amass_property_id"],
            "value": val["value"],
            "range_low": val["range_low"],
            "range_high": val["range_high"],
            "currency": val["currency"],
            "confidence": val["confidence"],
            "method": val["method"],
            "comparables_count": val["comparables_count"],
            "dispersion_pct": val["dispersion_pct"],
            "narrative": val.get("narrative"),
            "valued_at": val["valued_at"],
        }

    @router.post("/admin/valuations/{amass_id}/refresh")
    async def admin_refresh(amass_id: str, admin: dict = Depends(require_admin)):
        prop = await db.properties_geo.find_one(
            {"amass_property_id": amass_id}, {"_id": 0}
        )
        if not prop:
            raise HTTPException(404, "Property not found")
        return await estimate_property_valuation(
            db, prop["property_uuid"], force_refresh=True, triggered_by=f"admin:{admin['id']}"
        )

    return router
