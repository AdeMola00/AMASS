"""AMASS Phase 6E — Legacy properties → Property Identity migration.

Migrates docs from the legacy `properties` collection into the new Phase 6A
model (`properties_geo` + `property_listings`) while:
  • Preserving legacy id via new `legacy_property_id` field on properties_geo
  • Assigning a stable AMASS-XXX-YYYYYYYY id per state
  • Marking a starter `passport_visibility` doc
  • Creating a PENDING representation per listing (per user's data model rule)
  • Writing audit rows for every migration

Idempotent: running it twice is safe — legacy docs that already have a
`migrated_to_amass_property_id` set are skipped.

Run:
  python -m migrations.migrate_legacy_properties
or invoked programmatically via `run_migration(db)`.
"""
from __future__ import annotations

import asyncio
import os
import uuid
from datetime import datetime, timezone
from typing import List, Optional


async def _get_db():
    from motor.motor_asyncio import AsyncIOMotorClient
    from dotenv import load_dotenv
    load_dotenv()
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "amass_db")
    client = AsyncIOMotorClient(mongo_url)
    return client[db_name], client


STATE_CODES = {
    "Lagos": "LAG", "FCT": "FCT", "Abuja": "FCT", "Oyo": "OYO", "Rivers": "RIV",
    "Kano": "KAN", "Kaduna": "KAD", "Ogun": "OGN", "Delta": "DEL", "Enugu": "ENU",
    "Anambra": "ANA", "Edo": "EDO", "Cross River": "CRR", "Akwa Ibom": "AKW",
    "Imo": "IMO", "Abia": "ABI", "Osun": "OSU", "Ondo": "OND", "Ekiti": "EKI",
}


def _state_code(state: Optional[str]) -> str:
    return STATE_CODES.get((state or "").strip(), (state or "NG")[:3].upper())


async def _next_amass_id(db, state_code: str) -> str:
    """Same atomic counter used by the wizard."""
    res = await db.property_id_counters.find_one_and_update(
        {"state_code": state_code},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True,
    )
    return f"AMASS-{state_code}-{res['seq']:08d}"


def _normalize_address(a: dict) -> str:
    parts = [
        a.get("house_number"), a.get("street"), a.get("estate"),
        a.get("area"), a.get("lga"), a.get("state"),
    ]
    return " ".join(p.strip() for p in parts if p).lower()


DEFAULT_VISIBILITY_MIGRATED = {
    # Legacy listings already had full address on the public site — preserve that
    # for these specific ones (admin can tighten later per property).
    "show_exact_gps": False,
    "show_street": True,          # legacy had street visible
    "show_house_number": False,
    "show_raw_address": False,
    "show_photos": True,
    "show_current_listings": True,
    "show_representatives": True,
    "show_history": True,
    "show_amenities": True,
    "show_physical_details": True,
    "show_size": True,
    "allow_enquiries": True,
    "show_qr": True,
}


async def _audit(db, property_id, action, new=None, reason=None):
    await db.property_audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "property_id": property_id,
        "actor_id": None,
        "actor_type": "system",
        "action": action,
        "old_value": None,
        "new_value": new,
        "reason": reason,
        "created_at": datetime.now(timezone.utc),
    })


async def migrate_one(db, legacy: dict, *, dry_run: bool = False) -> dict:
    """Migrate a single legacy property doc. Returns a report dict."""
    if legacy.get("migrated_to_amass_property_id"):
        return {
            "id": legacy["id"],
            "status": "skipped_already_migrated",
            "amass_property_id": legacy["migrated_to_amass_property_id"],
        }
    lat = legacy.get("latitude")
    lng = legacy.get("longitude")
    if lat is None or lng is None:
        # Stamp so `/status.pending` drains and we don't waste cycles rescanning.
        if not dry_run:
            await db.properties.update_one(
                {"id": legacy["id"]},
                {"$set": {"migration_skipped_reason": "missing_gps",
                          "migration_last_checked_at": datetime.now(timezone.utc)}},
            )
        return {"id": legacy["id"], "status": "skipped_missing_gps"}

    state = (legacy.get("state") or "Lagos").strip() or "Lagos"
    sc = _state_code(state)
    if dry_run:
        return {"id": legacy["id"], "status": "dry_run", "state_code": sc}

    amass_id = await _next_amass_id(db, sc)
    property_uuid = str(uuid.uuid4())
    now = datetime.now(timezone.utc)

    # Address block
    addr = {
        "state": state,
        "lga": legacy.get("city"),
        "area": legacy.get("location"),
        "estate": None,
        "street": legacy.get("location"),
        "house_number": None,
        "landmark": None,
        "raw_address": legacy.get("location"),
    }
    normalized = _normalize_address(addr)

    property_doc = {
        "property_uuid": property_uuid,
        "amass_property_id": amass_id,
        "legacy_property_id": legacy["id"],
        "state": state,
        "lga": addr["lga"],
        "district": None,
        "area": addr["area"],
        "estate": addr["estate"],
        "street": addr["street"],
        "house_number": None,
        "landmark": None,
        "raw_address": addr["raw_address"],
        "normalized_address": normalized,
        "entrance_point": {"type": "Point", "coordinates": [lng, lat]},
        "gps_accuracy_meters": 25,  # legacy — assumed
        "location_source": "MIGRATED_LEGACY",
        "location_verification_status": "UNVERIFIED",
        "property_identity_status": "VERIFIED" if legacy.get("verified") else "PENDING_REVIEW",
        "physical_status": "SOLD" if legacy.get("status") == "sold" else "ACTIVE",
        "property_type": legacy.get("property_type"),
        "property_subtype": None,
        "details": {
            "property_type": legacy.get("property_type"),
            "bedrooms": legacy.get("bedrooms"),
            "bathrooms": legacy.get("bathrooms"),
            "building_size_sqm": legacy.get("size_sqm"),
            "amenities": legacy.get("amenities") or [],
            "year_built": legacy.get("year_built"),
        },
        "media_ids": legacy.get("images") or [],
        "passport_visibility": DEFAULT_VISIBILITY_MIGRATED,
        "created_by": legacy.get("agent_id"),
        "created_at": legacy.get("created_at") or now,
        "updated_at": now,
        "migrated_at": now,
        "aliases": [],
        "has_verified_representation": bool(legacy.get("listing_source") == "mandated"),
    }
    await db.properties_geo.insert_one(property_doc)

    # Listing
    listing_id = str(uuid.uuid4())
    listing_doc = {
        "id": listing_id,
        "property_id": property_uuid,
        "amass_property_id": amass_id,
        "agent_id": legacy.get("agent_id"),
        "agency_id": None,
        "listing_type": legacy.get("listing_type") or "buy",
        "listing_status": ("SOLD" if legacy.get("status") == "sold"
                           else "ACTIVE" if legacy.get("verified")
                           else "PENDING_REVIEW"),
        "price": legacy.get("price"),
        "currency": legacy.get("currency") or "NGN",
        "description": legacy.get("description"),
        "representation_type": (
            "owner" if legacy.get("listing_source") == "owner_listed" else
            "agent" if legacy.get("listing_source") == "mandated" else
            "agent"
        ),
        "owner_name": (legacy.get("mandate") or {}).get("owner_name"),
        "owner_phone": (legacy.get("mandate") or {}).get("owner_phone"),
        "legacy_property_id": legacy["id"],
        "migrated_from_legacy": True,
        "created_at": legacy.get("created_at") or now,
        "updated_at": now,
    }
    await db.property_listings.insert_one(listing_doc)

    # Auto-create representation (per the same rule as the wizard)
    if legacy.get("agent_id"):
        rep_status = "APPROVED" if legacy.get("listing_source") == "mandated" else "PENDING"
        rep_doc = {
            "id": str(uuid.uuid4()),
            "property_id": property_uuid,
            "amass_property_id": amass_id,
            "listing_id": listing_id,
            "user_id": legacy["agent_id"],
            "representation_type": listing_doc["representation_type"],
            "status": rep_status,
            "owner_name": listing_doc["owner_name"],
            "owner_phone": listing_doc["owner_phone"],
            "documents": [],
            "mandate_type": (legacy.get("mandate") or {}).get("mandate_type"),
            "mandate_expiry": None,
            "notes": None,
            "autocreated_by_wizard": False,
            "migrated_from_legacy": True,
            "submitted_at": listing_doc["created_at"],
            "decided_at": now if rep_status == "APPROVED" else None,
            "decided_by": "SYSTEM_MIGRATION" if rep_status == "APPROVED" else None,
            "history": [{"status": rep_status, "at": now, "actor_id": None,
                         "reason": "migration bootstrap"}],
            "created_at": now,
            "updated_at": now,
        }
        try:
            await db.property_representations.insert_one(rep_doc)
        except Exception:
            pass  # unique-index fallback

    # Mark legacy doc so re-runs are idempotent
    await db.properties.update_one(
        {"id": legacy["id"]},
        {"$set": {
            "migrated_to_amass_property_id": amass_id,
            "migrated_to_property_uuid": property_uuid,
            "migrated_at": now,
        }},
    )

    # Audit
    await _audit(db, property_uuid, "PROPERTY_CREATED",
                 new={"amass_property_id": amass_id, "source": "legacy_migration"})
    await _audit(db, property_uuid, "LISTING_CREATED",
                 new={"listing_id": listing_id, "source": "legacy_migration"})
    if legacy.get("verified"):
        await _audit(db, property_uuid, "PROPERTY_VERIFIED",
                     new={"status": "VERIFIED"}, reason="Migrated as verified")

    return {
        "id": legacy["id"],
        "status": "migrated",
        "amass_property_id": amass_id,
        "property_uuid": property_uuid,
        "listing_id": listing_id,
    }


async def run_migration(db, *, dry_run: bool = False, limit: Optional[int] = None):
    """Migrate all legacy properties. Returns a summary dict."""
    q: dict = {"migrated_to_amass_property_id": {"$exists": False}}
    cursor = db.properties.find(q, {"_id": 0})
    if limit:
        cursor = cursor.limit(limit)
    all_legacy = await cursor.to_list(None)

    reports: List[dict] = []
    for legacy in all_legacy:
        try:
            r = await migrate_one(db, legacy, dry_run=dry_run)
        except Exception as e:
            r = {"id": legacy.get("id"), "status": "error", "error": str(e)}
        reports.append(r)

    summary = {
        "total_scanned": len(all_legacy),
        "migrated": sum(1 for r in reports if r["status"] == "migrated"),
        "skipped_already_migrated": sum(1 for r in reports if r["status"] == "skipped_already_migrated"),
        "skipped_missing_gps": sum(1 for r in reports if r["status"] == "skipped_missing_gps"),
        "errors": [r for r in reports if r["status"] == "error"],
        "dry_run": dry_run,
        "reports": reports,
    }
    return summary


if __name__ == "__main__":
    async def main():
        db, client = await _get_db()
        try:
            summary = await run_migration(db, dry_run=False)
            print("─── Migration Summary ───")
            print(f"Scanned:                {summary['total_scanned']}")
            print(f"Migrated:               {summary['migrated']}")
            print(f"Already migrated:       {summary['skipped_already_migrated']}")
            print(f"Missing GPS (skipped):  {summary['skipped_missing_gps']}")
            print(f"Errors:                 {len(summary['errors'])}")
            for r in summary["reports"]:
                if r["status"] == "migrated":
                    print(f"  ✓ {r['id'][:8]} → {r['amass_property_id']}")
                else:
                    print(f"  {r['status']:24s} {r.get('id','?')[:8]}")
        finally:
            client.close()

    asyncio.run(main())
