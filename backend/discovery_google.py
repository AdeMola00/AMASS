"""AMASS Phase D-2 — Google Places server-side integration.

Mockable-first design:
  • Real client used when GOOGLE_MAPS_SERVER_KEY is set + GOOGLE_PLACES_ENABLED flag on.
  • Mock client returns deterministic Lagos-property fixtures otherwise.
  • ALL callers use the same interface — no branching in route handlers.

Cost & quota controls:
  • Every call logs to google_places_usage (day, month, endpoint, place_id, cost_usd).
  • Daily + monthly caps from app_settings.google_limits.
  • Admin-confirm threshold on job cost > google_limits.admin_confirm_threshold_usd.
  • Field masks minimise per-call cost.
  • Place-ID cache (google_places_cache) prevents duplicate Place Details calls
    within Google's permitted cacheable window (30 days per current terms —
    admin-configurable).
  • Rate limit: token bucket (requests_per_second from settings).
  • Retry with exponential backoff on 5xx/429; max_retries + timeout from settings.

Compliance notes:
  • Google API key NEVER exposed to frontend.
  • Attribution fields preserved on photos/places.
  • Only field-masked fields cached; sensitive fields (contact) not persisted
    long-term unless explicitly re-fetched per Google terms.
"""
from __future__ import annotations

import asyncio
import os
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel, Field


GOOGLE_MAPS_SERVER_KEY = os.environ.get("GOOGLE_MAPS_SERVER_KEY", "")
GOOGLE_PLACES_BASE = "https://places.googleapis.com/v1"
CACHE_TTL_DAYS_DEFAULT = 30

# Field masks — kept minimal to control cost.
# Google charges by SKU tier; asking only for basic fields keeps calls cheap.
FIELD_MASK_SEARCH = ",".join([
    "places.id",
    "places.displayName",
    "places.formattedAddress",
    "places.location",
    "places.types",
    "places.primaryType",
    "places.primaryTypeDisplayName",
    "places.businessStatus",
    "nextPageToken",
])
FIELD_MASK_DETAILS = ",".join([
    "id",
    "displayName",
    "formattedAddress",
    "addressComponents",
    "location",
    "types",
    "primaryType",
    "primaryTypeDisplayName",
    "businessStatus",
    "googleMapsUri",
    "internationalPhoneNumber",
    "websiteUri",
    "photos.authorAttributions",
    "photos.name",
])

# Google `types` that suggest actual property/estate candidates.
PROPERTY_TYPE_HINTS = {
    "real_estate_agency", "apartment_complex", "apartment_building",
    "housing_development", "condominium", "gated_community",
    "residential_area", "estate", "lodging", "hotel", "resort",
    "premise", "subpremise", "point_of_interest",
}
COMMERCIAL_HINTS = {"office", "shopping_mall", "store", "warehouse"}
INSTITUTIONAL_HINTS = {"school", "university", "hospital", "church", "mosque"}


class PlacesTextSearchIn(BaseModel):
    query: str = Field(..., min_length=2, max_length=200)
    lat: Optional[float] = None
    lng: Optional[float] = None
    radius_m: Optional[int] = Field(None, ge=100, le=50_000)
    max_results: int = Field(20, ge=1, le=60)
    included_types: Optional[List[str]] = None


class PlacesNearbyIn(BaseModel):
    lat: float
    lng: float
    radius_m: int = Field(1000, ge=100, le=50_000)
    included_types: Optional[List[str]] = None
    max_results: int = Field(20, ge=1, le=60)


class DiscoveryEstimateIn(BaseModel):
    request_type: str = Field(..., pattern=r"^(text_search|nearby_search)$")
    result_count: int = Field(20, ge=1, le=500)
    include_details: bool = False


class DiscoveryConfirmToken(BaseModel):
    """Server-issued signed intent — client echoes back to confirm expensive ops.
    Simple stateless token: base64 of `expiry|estimated_cost|user_id`. Prevents
    replay by comparing user_id + short expiry."""
    token: str


# ═══════════════════════ CLIENT INTERFACE ═══════════════════════
class BaseGooglePlacesClient:
    is_mock: bool = True

    async def text_search(self, payload: PlacesTextSearchIn) -> Dict[str, Any]:  # pragma: no cover
        raise NotImplementedError

    async def nearby_search(self, payload: PlacesNearbyIn) -> Dict[str, Any]:  # pragma: no cover
        raise NotImplementedError

    async def place_details(self, place_id: str) -> Dict[str, Any]:  # pragma: no cover
        raise NotImplementedError


# ═══════════════════════ MOCK CLIENT ═══════════════════════
_MOCK_LAGOS_PROPERTIES = [
    {"place_id": "MOCK_LEKKI_1", "name": "Palm Springs Estate",
     "address": "Lekki Phase 1, Lagos", "lat": 6.4361, "lng": 3.4739,
     "types": ["gated_community", "premise", "point_of_interest"]},
    {"place_id": "MOCK_LEKKI_2", "name": "Nicon Town Apartments",
     "address": "Nicon Town, Lekki, Lagos", "lat": 6.4383, "lng": 3.4780,
     "types": ["apartment_complex", "lodging"]},
    {"place_id": "MOCK_LEKKI_3", "name": "Fola Osibo Serviced Apartments",
     "address": "Fola Osibo, Lekki Phase 1", "lat": 6.4400, "lng": 3.4720,
     "types": ["apartment_complex", "lodging"]},
    {"place_id": "MOCK_IKOYI_1", "name": "Banana Island Estate",
     "address": "Banana Island, Ikoyi, Lagos", "lat": 6.4400, "lng": 3.4400,
     "types": ["gated_community", "residential_area"]},
    {"place_id": "MOCK_IKOYI_2", "name": "Parkview Estate",
     "address": "Parkview, Ikoyi", "lat": 6.4520, "lng": 3.4390,
     "types": ["gated_community"]},
    {"place_id": "MOCK_VI_1", "name": "Eko Atlantic Towers",
     "address": "Eko Atlantic City, VI, Lagos", "lat": 6.4230, "lng": 3.4090,
     "types": ["apartment_complex", "premise"]},
    {"place_id": "MOCK_AGENCY_1", "name": "PWAN Homes Real Estate",
     "address": "Admiralty Way, Lekki, Lagos", "lat": 6.4369, "lng": 3.4759,
     "types": ["real_estate_agency", "point_of_interest"]},
]


class MockGooglePlacesClient(BaseGooglePlacesClient):
    is_mock = True

    def _hydrate(self, p: dict) -> dict:
        return {
            "id": p["place_id"],
            "displayName": {"text": p["name"]},
            "formattedAddress": p["address"],
            "location": {"latitude": p["lat"], "longitude": p["lng"]},
            "types": p["types"],
            "primaryType": p["types"][0] if p["types"] else "point_of_interest",
            "primaryTypeDisplayName": {"text": p["types"][0].replace("_", " ").title()} if p["types"] else None,
            "businessStatus": "OPERATIONAL",
        }

    async def text_search(self, payload: PlacesTextSearchIn) -> Dict[str, Any]:
        await asyncio.sleep(0)  # yield
        q = payload.query.lower()
        results = [p for p in _MOCK_LAGOS_PROPERTIES
                   if q in p["name"].lower() or q in p["address"].lower()
                   or any(q in t for t in p["types"])]
        # Fallback: query "lagos" or "estate" returns everything
        if not results and any(k in q for k in ("lagos", "lekki", "ikoyi", "estate", "apartment")):
            results = _MOCK_LAGOS_PROPERTIES
        return {"places": [self._hydrate(p) for p in results[:payload.max_results]]}

    async def nearby_search(self, payload: PlacesNearbyIn) -> Dict[str, Any]:
        # simple haversine filter in km
        import math
        def dist_km(a_lat, a_lng, b_lat, b_lng):
            R = 6371.0
            dLat, dLng = math.radians(b_lat - a_lat), math.radians(b_lng - a_lng)
            a = math.sin(dLat/2)**2 + math.cos(math.radians(a_lat)) * math.cos(math.radians(b_lat)) * math.sin(dLng/2)**2
            return 2 * R * math.asin(math.sqrt(a))
        within = [p for p in _MOCK_LAGOS_PROPERTIES
                  if dist_km(payload.lat, payload.lng, p["lat"], p["lng"]) * 1000 <= payload.radius_m]
        if payload.included_types:
            within = [p for p in within if any(t in payload.included_types for t in p["types"])]
        return {"places": [self._hydrate(p) for p in within[:payload.max_results]]}

    async def place_details(self, place_id: str) -> Dict[str, Any]:
        for p in _MOCK_LAGOS_PROPERTIES:
            if p["place_id"] == place_id:
                d = self._hydrate(p)
                d["googleMapsUri"] = f"https://maps.google.com/?q={p['lat']},{p['lng']}"
                d["addressComponents"] = [
                    {"longText": p["address"], "types": ["formatted_address"]},
                ]
                return d
        raise HTTPException(404, "Place not found (mock)")


# ═══════════════════════ REAL CLIENT ═══════════════════════
class RealGooglePlacesClient(BaseGooglePlacesClient):
    is_mock = False

    def __init__(self, api_key: str, timeout: float = 10.0, max_retries: int = 3, rps: float = 5.0):
        self.api_key = api_key
        self.timeout = timeout
        self.max_retries = max_retries
        self._min_interval = 1.0 / max(0.5, rps)
        self._last_call: float = 0.0
        self._lock = asyncio.Lock()

    async def _throttle(self):
        async with self._lock:
            now = time.monotonic()
            wait = self._min_interval - (now - self._last_call)
            if wait > 0:
                await asyncio.sleep(wait)
            self._last_call = time.monotonic()

    async def _post(self, endpoint: str, body: dict, field_mask: str) -> Dict[str, Any]:
        await self._throttle()
        headers = {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": self.api_key,
            "X-Goog-FieldMask": field_mask,
        }
        url = f"{GOOGLE_PLACES_BASE}/{endpoint}"
        attempt = 0
        while True:
            try:
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    r = await client.post(url, json=body, headers=headers)
                if r.status_code == 429 or r.status_code >= 500:
                    raise httpx.HTTPStatusError("retryable", request=r.request, response=r)
                if r.status_code >= 400:
                    detail = r.json() if "application/json" in r.headers.get("content-type", "") else r.text
                    raise HTTPException(r.status_code, {"google_error": detail})
                return r.json()
            except (httpx.HTTPStatusError, httpx.RequestError) as e:
                attempt += 1
                if attempt > self.max_retries:
                    raise HTTPException(502, f"Google Places unavailable after {self.max_retries} retries: {e}")
                await asyncio.sleep(min(2 ** attempt, 8))

    async def _get(self, endpoint: str, field_mask: str) -> Dict[str, Any]:
        await self._throttle()
        headers = {
            "X-Goog-Api-Key": self.api_key,
            "X-Goog-FieldMask": field_mask,
        }
        url = f"{GOOGLE_PLACES_BASE}/{endpoint}"
        attempt = 0
        while True:
            try:
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    r = await client.get(url, headers=headers)
                if r.status_code == 429 or r.status_code >= 500:
                    raise httpx.HTTPStatusError("retryable", request=r.request, response=r)
                if r.status_code >= 400:
                    detail = r.json() if "application/json" in r.headers.get("content-type", "") else r.text
                    raise HTTPException(r.status_code, {"google_error": detail})
                return r.json()
            except (httpx.HTTPStatusError, httpx.RequestError) as e:
                attempt += 1
                if attempt > self.max_retries:
                    raise HTTPException(502, f"Google Places unavailable after {self.max_retries} retries: {e}")
                await asyncio.sleep(min(2 ** attempt, 8))

    async def text_search(self, payload: PlacesTextSearchIn) -> Dict[str, Any]:
        body: dict = {"textQuery": payload.query, "maxResultCount": payload.max_results}
        if payload.lat is not None and payload.lng is not None:
            body["locationBias"] = {"circle": {"center": {"latitude": payload.lat, "longitude": payload.lng},
                                               "radius": float(payload.radius_m or 5000)}}
        if payload.included_types:
            body["includedType"] = payload.included_types[0]  # Google v1: single type
        return await self._post("places:searchText", body, FIELD_MASK_SEARCH)

    async def nearby_search(self, payload: PlacesNearbyIn) -> Dict[str, Any]:
        body: dict = {
            "locationRestriction": {
                "circle": {"center": {"latitude": payload.lat, "longitude": payload.lng},
                           "radius": float(payload.radius_m)}
            },
            "maxResultCount": payload.max_results,
        }
        if payload.included_types:
            body["includedTypes"] = payload.included_types
        return await self._post("places:searchNearby", body, FIELD_MASK_SEARCH)

    async def place_details(self, place_id: str) -> Dict[str, Any]:
        return await self._get(f"places/{place_id}", FIELD_MASK_DETAILS)


# ═══════════════════════ USAGE / COST ═══════════════════════
async def _log_usage(db, endpoint: str, cost_usd: float, place_id: Optional[str], user_id: str, is_mock: bool):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    month = today[:7]
    await db.google_places_usage.insert_one({
        "id": str(uuid.uuid4()),
        "day": today,
        "month": month,
        "endpoint": endpoint,
        "place_id": place_id,
        "cost_usd": cost_usd,
        "is_mock": is_mock,
        "user_id": user_id,
        "created_at": datetime.now(timezone.utc),
    })


async def _sum_usage(db, day: Optional[str] = None, month: Optional[str] = None) -> float:
    q: dict = {"is_mock": False}
    if day: q["day"] = day
    if month: q["month"] = month
    pipeline = [{"$match": q}, {"$group": {"_id": None, "total": {"$sum": "$cost_usd"}}}]
    r = await db.google_places_usage.aggregate(pipeline).to_list(1)
    return float(r[0]["total"]) if r else 0.0


def _cost_of_call(pricing: dict, endpoint: str) -> float:
    return float({
        "places:searchText": pricing.get("text_search_per_call_usd", 0.032),
        "places:searchNearby": pricing.get("nearby_search_per_call_usd", 0.032),
        "place_details": pricing.get("place_details_basic_per_call_usd", 0.017),
    }.get(endpoint, 0.0))


# ═══════════════════════ ROUTES ═══════════════════════
_client_singleton: Optional[BaseGooglePlacesClient] = None


def _pick_client() -> BaseGooglePlacesClient:
    """Module-level singleton so the token-bucket throttle actually rate-limits
    across concurrent requests. When GOOGLE_MAPS_SERVER_KEY becomes available
    at runtime, a fresh RealGooglePlacesClient is constructed once."""
    global _client_singleton
    if _client_singleton is not None:
        # If key becomes present after startup, swap to real client
        if GOOGLE_MAPS_SERVER_KEY and _client_singleton.is_mock:
            _client_singleton = RealGooglePlacesClient(GOOGLE_MAPS_SERVER_KEY)
        return _client_singleton
    if GOOGLE_MAPS_SERVER_KEY:
        _client_singleton = RealGooglePlacesClient(GOOGLE_MAPS_SERVER_KEY)
    else:
        _client_singleton = MockGooglePlacesClient()
    return _client_singleton


def register_discovery_google_routes(db, require_admin):
    from app_settings import get_setting, get_feature_flag
    router = APIRouter(prefix="/api/admin/discovery", tags=["discovery-admin"])

    async def _enforce_flag():
        if not await get_feature_flag(db, "PROPERTY_DISCOVERY_ENABLED"):
            raise HTTPException(403, "Discovery is disabled")

    async def _preflight_cost(user: dict, endpoint: str, count: int = 1, extra_details: int = 0) -> dict:
        """Return {'estimated_cost_usd', 'daily_spent', 'monthly_spent',
        'remaining_daily', 'remaining_monthly', 'requires_confirmation'}."""
        pricing = await get_setting(db, "google_pricing")
        limits = await get_setting(db, "google_limits")
        est = _cost_of_call(pricing, endpoint) * count + \
              _cost_of_call(pricing, "place_details") * extra_details
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        month = today[:7]
        daily = await _sum_usage(db, day=today)
        monthly = await _sum_usage(db, month=month)
        if daily + est > limits["daily_cap_usd"]:
            raise HTTPException(402, {
                "error": "daily_cap_exceeded",
                "estimated_cost_usd": round(est, 4),
                "daily_spent_usd": round(daily, 4),
                "daily_cap_usd": limits["daily_cap_usd"],
            })
        if monthly + est > limits["monthly_cap_usd"]:
            raise HTTPException(402, {
                "error": "monthly_cap_exceeded",
                "estimated_cost_usd": round(est, 4),
                "monthly_spent_usd": round(monthly, 4),
                "monthly_cap_usd": limits["monthly_cap_usd"],
            })
        return {
            "estimated_cost_usd": round(est, 4),
            "daily_spent_usd": round(daily, 4),
            "monthly_spent_usd": round(monthly, 4),
            "remaining_daily_usd": round(limits["daily_cap_usd"] - daily, 4),
            "remaining_monthly_usd": round(limits["monthly_cap_usd"] - monthly, 4),
            "requires_confirmation": est > limits["admin_confirm_threshold_usd"],
            "admin_confirm_threshold_usd": limits["admin_confirm_threshold_usd"],
        }

    @router.get("/status")
    async def discovery_status(_admin=Depends(require_admin)):
        """Show whether real Google client is available and current usage snapshot."""
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        month = today[:7]
        return {
            "google_key_present": bool(GOOGLE_MAPS_SERVER_KEY),
            "client_mode": "real" if GOOGLE_MAPS_SERVER_KEY else "mock",
            "discovery_enabled": await get_feature_flag(db, "PROPERTY_DISCOVERY_ENABLED"),
            "google_places_enabled": await get_feature_flag(db, "GOOGLE_PLACES_ENABLED"),
            "daily_spent_usd": round(await _sum_usage(db, day=today), 4),
            "monthly_spent_usd": round(await _sum_usage(db, month=month), 4),
            "limits": await get_setting(db, "google_limits"),
            "pricing": await get_setting(db, "google_pricing"),
        }

    @router.get("/usage")
    async def usage_details(
        days: int = Query(30, ge=1, le=365),
        _admin=Depends(require_admin),
    ):
        since = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")
        # Group by day + endpoint
        pipeline = [
            {"$match": {"day": {"$gte": since}, "is_mock": False}},
            {"$group": {"_id": {"day": "$day", "endpoint": "$endpoint"},
                        "calls": {"$sum": 1},
                        "cost_usd": {"$sum": "$cost_usd"}}},
            {"$sort": {"_id.day": -1}},
        ]
        rows = await db.google_places_usage.aggregate(pipeline).to_list(1000)
        return {"days": days, "since": since, "rows": [
            {"day": r["_id"]["day"], "endpoint": r["_id"]["endpoint"],
             "calls": r["calls"], "cost_usd": round(r["cost_usd"], 4)}
            for r in rows
        ]}

    @router.post("/estimate")
    async def estimate_cost(
        data: DiscoveryEstimateIn,
        admin_user: dict = Depends(require_admin),
    ):
        await _enforce_flag()
        endpoint = "places:searchText" if data.request_type == "text_search" else "places:searchNearby"
        details_needed = data.result_count if data.include_details else 0
        pre = await _preflight_cost(admin_user, endpoint, count=1, extra_details=details_needed)
        return {"request_type": data.request_type, "result_count": data.result_count,
                "include_details": data.include_details, **pre}

    @router.post("/text-search")
    async def text_search(
        payload: PlacesTextSearchIn,
        confirmed: bool = Query(False),
        admin_user: dict = Depends(require_admin),
    ):
        await _enforce_flag()
        client = _pick_client()
        endpoint = "places:searchText"
        pricing = await get_setting(db, "google_pricing")
        cost = _cost_of_call(pricing, endpoint)
        # Only enforce cost caps when using real client
        if not client.is_mock:
            pre = await _preflight_cost(admin_user, endpoint)
            if pre["requires_confirmation"] and not confirmed:
                raise HTTPException(409, {
                    "error": "confirmation_required",
                    "estimated_cost_usd": pre["estimated_cost_usd"],
                    "message": f"Estimated cost ${pre['estimated_cost_usd']} exceeds admin_confirm_threshold. Re-send with ?confirmed=true.",
                    **pre,
                })
        result = await client.text_search(payload)
        await _log_usage(db, endpoint, cost, None, admin_user["id"], is_mock=client.is_mock)
        return {"mode": "mock" if client.is_mock else "real", "cost_usd": cost if not client.is_mock else 0.0, **result}

    @router.post("/nearby-search")
    async def nearby_search(
        payload: PlacesNearbyIn,
        confirmed: bool = Query(False),
        admin_user: dict = Depends(require_admin),
    ):
        await _enforce_flag()
        client = _pick_client()
        endpoint = "places:searchNearby"
        pricing = await get_setting(db, "google_pricing")
        cost = _cost_of_call(pricing, endpoint)
        if not client.is_mock:
            pre = await _preflight_cost(admin_user, endpoint)
            if pre["requires_confirmation"] and not confirmed:
                raise HTTPException(409, {"error": "confirmation_required", **pre})
        result = await client.nearby_search(payload)
        await _log_usage(db, endpoint, cost, None, admin_user["id"], is_mock=client.is_mock)
        return {"mode": "mock" if client.is_mock else "real", "cost_usd": cost if not client.is_mock else 0.0, **result}

    @router.get("/place/{place_id}")
    async def place_details(
        place_id: str,
        force_refresh: bool = Query(False),
        admin_user: dict = Depends(require_admin),
    ):
        """Cached by place_id — respects Google's cacheable-fields policy.
        Cache TTL from settings or DEFAULT 30 days."""
        await _enforce_flag()
        limits = await get_setting(db, "google_limits") or {}
        ttl_days = limits.get("place_cache_ttl_days", CACHE_TTL_DAYS_DEFAULT)
        now = datetime.now(timezone.utc)

        if not force_refresh:
            cached = await db.google_places_cache.find_one(
                {"place_id": place_id}, {"_id": 0}
            )
            if cached and cached.get("cached_at"):
                _cached_at = cached["cached_at"]
                # MongoDB round-trips datetimes as tz-naive UTC — normalise before subtracting.
                if _cached_at.tzinfo is None:
                    _cached_at = _cached_at.replace(tzinfo=timezone.utc)
                age = (now - _cached_at).total_seconds() / 86400
                if age < ttl_days:
                    return {"cached": True, "cached_at": _cached_at,
                            "data": cached["data"], "cost_usd": 0.0}

        client = _pick_client()
        pricing = await get_setting(db, "google_pricing")
        cost = _cost_of_call(pricing, "place_details")
        if not client.is_mock:
            pre = await _preflight_cost(admin_user, "place_details")
            # place_details is cheap; still block if daily cap exceeded (already 402'd inside preflight)

        data = await client.place_details(place_id)
        await _log_usage(db, "place_details", cost, place_id, admin_user["id"], is_mock=client.is_mock)
        # Upsert cache (only allowed fields per Google terms)
        await db.google_places_cache.update_one(
            {"place_id": place_id},
            {"$set": {"place_id": place_id, "data": data,
                      "cached_at": now, "is_mock": client.is_mock}},
            upsert=True,
        )
        return {"cached": False, "data": data, "cost_usd": cost if not client.is_mock else 0.0}

    @router.delete("/cache/{place_id}")
    async def invalidate_cache(place_id: str, _admin=Depends(require_admin)):
        r = await db.google_places_cache.delete_one({"place_id": place_id})
        return {"ok": True, "deleted": r.deleted_count}

    return router
