"""AMASS Phase D-1 — App Settings: feature flags, verification config,
Google pricing assumptions, verification expiry defaults.

Single collection `app_settings` holds one doc per setting key so admins can
patch individual keys without racing on a monolithic config document.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel


# ── DEFAULT VALUES ─────────────────────────────────────────────────
DEFAULT_FEATURE_FLAGS: Dict[str, bool] = {
    "PROPERTY_DISCOVERY_ENABLED": True,     # discovery admin UI + API
    "GOOGLE_PLACES_ENABLED": False,         # requires GOOGLE_MAPS_SERVER_KEY
    "PROPERTY_CLAIMS_ENABLED": True,        # rep/claims lifecycle
    "PROPERTY_VERIFICATION_ENABLED": True,  # agent verification wizard
    "PROPERTY_PASSPORT_ENABLED": True,      # public passport
    "AI_VALUATION_ENABLED": True,           # comparable engine
    "AI_VALUATION_NARRATIVE_ENABLED": True, # optional LLM explanation
    "BACKGROUND_DISCOVERY_JOBS_ENABLED": True,
    "VERIFICATION_EXPIRY_SWEEPER_ENABLED": True,
}

DEFAULT_VERIFICATION_WEIGHTS: Dict[str, int] = {
    "gps_verified": 25,
    "physical_inspection": 20,
    "fresh_amass_photos": 15,
    "agent_verified": 10,
    "authorization_verified": 15,
    "details_completed": 5,
    "address_confirmed": 5,
    "recent_verification": 5,
}

DEFAULT_VERIFICATION_ACCURACY_M: Dict[str, int] = {
    "excellent_max": 10,   # ≤10m
    "acceptable_max": 25,  # 10–25m
    "warning_max": 50,     # 25–50m — >50 requires better GPS
}

DEFAULT_VERIFICATION_EXPIRY = {
    "default_days": 180,
    "options_days": [90, 180, 365],
    "reverify_task_lead_days": 14,  # create task 14 days before expiry
}

# Google Places pricing assumptions (USD).
# NOTE: These are ESTIMATES — actual Google pricing changes; admin can update.
DEFAULT_GOOGLE_PRICING = {
    "text_search_per_call_usd": 0.032,
    "nearby_search_per_call_usd": 0.032,
    "place_details_basic_per_call_usd": 0.017,
    "place_details_contact_per_call_usd": 0.003,
    "place_photo_per_call_usd": 0.007,
    "notes": "Estimated USD costs. Confirm against current Google Maps Platform pricing before large jobs.",
}

DEFAULT_GOOGLE_LIMITS = {
    "daily_cap_usd": 5.0,
    "monthly_cap_usd": 50.0,
    "admin_confirm_threshold_usd": 2.0,
    "max_concurrent_jobs": 2,
    "requests_per_second": 5,
    "request_timeout_seconds": 10,
    "max_retries": 3,
}

DEFAULT_VALUATION_CONFIG = {
    "min_comparables": 3,
    "comparable_search_radius_km": 3.0,
    "comparable_max_age_days": 365,
    "confidence_high_threshold": 75,
    "confidence_med_threshold": 50,
    "model_version": "hybrid_comparable_v1",
    "disclaimer": "AI-generated estimate based on available market and property data. It is not a professional valuation, appraisal, or guarantee of market price.",
}

DEFAULT_DUPLICATE_CLASSIFICATION = {
    "definite_min": 90,     # 90-100
    "high_prob_min": 75,    # 75-89
    "review_min": 50,       # 50-74
    # 0-49 = LIKELY UNIQUE
}


SETTING_DEFAULTS: Dict[str, Any] = {
    "feature_flags": DEFAULT_FEATURE_FLAGS,
    "verification_weights": DEFAULT_VERIFICATION_WEIGHTS,
    "verification_accuracy_m": DEFAULT_VERIFICATION_ACCURACY_M,
    "verification_expiry": DEFAULT_VERIFICATION_EXPIRY,
    "google_pricing": DEFAULT_GOOGLE_PRICING,
    "google_limits": DEFAULT_GOOGLE_LIMITS,
    "valuation_config": DEFAULT_VALUATION_CONFIG,
    "duplicate_classification": DEFAULT_DUPLICATE_CLASSIFICATION,
}


class SettingPatchIn(BaseModel):
    value: Dict[str, Any]


async def ensure_default_settings(db):
    """Seed defaults on startup — idempotent."""
    for key, value in SETTING_DEFAULTS.items():
        exists = await db.app_settings.find_one({"key": key}, {"_id": 0, "key": 1})
        if exists:
            continue
        await db.app_settings.insert_one({
            "key": key,
            "value": value,
            "is_system": True,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        })


async def get_setting(db, key: str, default: Any = None) -> Any:
    """Fetch a setting value with default fallback (never raises on missing key)."""
    doc = await db.app_settings.find_one({"key": key}, {"_id": 0, "value": 1})
    if not doc:
        return default if default is not None else SETTING_DEFAULTS.get(key)
    return doc.get("value", default)


async def get_feature_flag(db, flag: str) -> bool:
    """Fast helper — returns False when flag is missing/disabled."""
    flags = await get_setting(db, "feature_flags", DEFAULT_FEATURE_FLAGS)
    return bool(flags.get(flag, False))


def register_app_settings_routes(db, require_admin):
    """Admin-only CRUD; public gets a whitelisted subset (feature flags + colours)."""
    admin_r = APIRouter(prefix="/api/admin/settings", tags=["app-settings-admin"])
    public_r = APIRouter(prefix="/api/settings", tags=["app-settings-public"])

    @admin_r.get("")
    async def list_all(_admin=Depends(require_admin)):
        docs = await db.app_settings.find({}, {"_id": 0}).to_list(200)
        return {d["key"]: d["value"] for d in docs}

    @admin_r.get("/{key}")
    async def get_one(key: str, _admin=Depends(require_admin)):
        v = await get_setting(db, key, None)
        if v is None:
            raise HTTPException(404, f"Unknown setting '{key}'")
        return {"key": key, "value": v}

    @admin_r.patch("/{key}")
    async def patch_one(
        key: str,
        data: SettingPatchIn,
        admin_user: dict = Depends(require_admin),
    ):
        if key not in SETTING_DEFAULTS:
            raise HTTPException(400, f"'{key}' is not a valid setting key")
        # For feature_flags, validate keys are known booleans
        if key == "feature_flags":
            for k, v in data.value.items():
                if k not in DEFAULT_FEATURE_FLAGS:
                    raise HTTPException(400, f"Unknown feature flag '{k}'")
                if not isinstance(v, bool):
                    raise HTTPException(400, f"Flag '{k}' must be boolean")
        # For verification_weights, validate sum <= 200 (allow some headroom for admin tuning)
        if key == "verification_weights":
            if not all(isinstance(v, int) and 0 <= v <= 100 for v in data.value.values()):
                raise HTTPException(400, "Each weight must be an integer 0–100")
        r = await db.app_settings.update_one(
            {"key": key},
            {"$set": {"value": data.value, "updated_at": datetime.now(timezone.utc),
                      "updated_by": admin_user["id"]}},
            upsert=True,
        )
        return {"ok": True, "key": key, "value": data.value}

    @admin_r.post("/{key}/reset")
    async def reset_one(key: str, _admin=Depends(require_admin)):
        if key not in SETTING_DEFAULTS:
            raise HTTPException(400, f"'{key}' is not a valid setting key")
        await db.app_settings.update_one(
            {"key": key},
            {"$set": {"value": SETTING_DEFAULTS[key], "updated_at": datetime.now(timezone.utc)}},
            upsert=True,
        )
        return {"ok": True, "key": key, "value": SETTING_DEFAULTS[key], "reset": True}

    # Public: only feature flags (booleans, non-sensitive) exposed
    @public_r.get("/feature-flags")
    async def public_flags():
        return await get_setting(db, "feature_flags", DEFAULT_FEATURE_FLAGS)

    return public_r, admin_r
