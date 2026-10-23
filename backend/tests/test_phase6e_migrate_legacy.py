"""AMASS Phase 6E — Legacy → Property Identity migration.

IMPORTANT: Run this file WITHOUT pytest-xdist (parallel workers break the
shared seeded_legacy fixture). Invoke with `pytest -o addopts=` to strip the
project's default `-n auto --dist loadscope` addopts, e.g.:
    pytest backend/tests/test_phase6e_migrate_legacy.py -o addopts= -v

Verifies:
  • Admin AuthZ on /api/admin/cockpit/migrate-legacy*
  • /migrate-legacy/status counts (total_legacy, already_migrated, pending, missing_gps)
  • POST /migrate-legacy?dry_run=true does NOT write to properties_geo / property_listings
  • POST /migrate-legacy?dry_run=false actually creates:
      - properties_geo doc (with entrance_point, media_ids, passport_visibility.show_street)
      - property_listings doc linked via property_id
      - property_representations doc (APPROVED for mandated, PENDING otherwise)
      - audit rows PROPERTY_CREATED + LISTING_CREATED (+ PROPERTY_VERIFIED if verified)
      - legacy doc updated with migrated_to_amass_property_id
  • Idempotency: second run scans 0 pending
  • Missing GPS legacy docs are skipped as skipped_missing_gps (no properties_geo)
  • After migration:
      - GET /api/passport/{amass_id}  → photos + listings count present
      - GET /api/properties-v2/{amass_id} → legacy_property_id preserved
      - GET /api/properties (v1) still shows legacy doc (regression)

Seeds fresh legacy docs directly in MongoDB (matches the shape of the seeded
legacy properties), and cleans them up after the test class runs.
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone

import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get(
    "EXPO_BACKEND_URL",
    "https://property-os-africa.preview.emergentagent.com",
).rstrip("/")

DEMO_EMAIL = "demo@amass.africa"
DEMO_PASSWORD = "amass2026"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "amass_db")

TEST_LEGACY_TAG = f"TEST_PHASE6E_{uuid.uuid4().hex[:8]}"


# ─── Session-level fixtures ──────────────────────────────────────
@pytest.fixture(scope="module")
def s():
    return requests.Session()


@pytest.fixture(scope="module")
def db():
    return MongoClient(MONGO_URL)[DB_NAME]


@pytest.fixture(scope="module")
def admin_headers(s):
    r = s.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD},
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return {
        "Authorization": f"Bearer {r.json()['access_token']}",
        "Content-Type": "application/json",
    }


@pytest.fixture(scope="module")
def non_admin_headers(s):
    email = f"noadm_{uuid.uuid4().hex[:8]}@example.com"
    r = s.post(
        f"{BASE_URL}/api/auth/register",
        json={"email": email, "password": "TestPass123", "full_name": "Non Admin"},
    )
    assert r.status_code == 200, r.text
    return {
        "Authorization": f"Bearer {r.json()['access_token']}",
        "Content-Type": "application/json",
    }


def _mk_legacy(
    *, has_gps=True, verified=False, listing_source="pending", tag=TEST_LEGACY_TAG,
    state="Lagos", listing_type="buy",
):
    now = datetime.now(timezone.utc)
    doc = {
        "id": f"legacy-{tag}-{uuid.uuid4().hex[:10]}",
        "title": f"{tag} Property",
        "description": f"{tag} description",
        "price": 12345000,
        "currency": "NGN",
        "listing_type": listing_type,
        "property_type": "duplex",
        "bedrooms": 4,
        "bathrooms": 4,
        "size_sqm": 320,
        "location": "Test Street, Lekki",
        "city": "Lekki",
        "state": state,
        "country": "Nigeria",
        "images": [
            "https://images.unsplash.com/photo-p6e-1?w=1200",
            "https://images.unsplash.com/photo-p6e-2?w=1200",
        ],
        "amenities": ["Pool", "Security"],
        "status": "active",
        "verified": verified,
        "agent_id": f"agent-{tag}-{uuid.uuid4().hex[:6]}",
        "agent_name": "Test Agent",
        "listing_source": listing_source,
        "mandate": (
            {"owner_name": "Test Owner", "owner_phone": "+2340000000000",
             "mandate_type": "exclusive"}
            if listing_source == "mandated" else None
        ),
        "is_amass_exclusive": False,
        "token_cost": 5,
        "created_at": now,
        "_test_tag": tag,
    }
    if has_gps:
        doc["latitude"] = 6.4300 + (uuid.uuid4().int % 500) * 0.00001
        doc["longitude"] = 3.4700 + (uuid.uuid4().int % 500) * 0.00001
    return doc


@pytest.fixture(scope="module")
def seeded_legacy(db):
    """Seed 4 legacy docs: 1 verified+mandated, 1 verified+owner_listed,
    1 unverified pending, 1 missing GPS."""
    docs = [
        _mk_legacy(verified=True, listing_source="mandated"),
        _mk_legacy(verified=True, listing_source="owner_listed"),
        _mk_legacy(verified=False, listing_source="pending"),
        _mk_legacy(has_gps=False, listing_source="pending"),
    ]
    db.properties.insert_many([dict(d) for d in docs])
    yield docs

    # ── Cleanup ─────────────────────────────────────────────
    ids = [d["id"] for d in docs]
    amass_ids = []
    for legacy_id in ids:
        p = db.properties.find_one({"id": legacy_id}, {"migrated_to_amass_property_id": 1,
                                                       "migrated_to_property_uuid": 1})
        if p and p.get("migrated_to_amass_property_id"):
            amass_ids.append((p["migrated_to_amass_property_id"],
                              p.get("migrated_to_property_uuid")))
    # Remove derived geo/listing/rep/audit rows
    for amass_id, prop_uuid in amass_ids:
        db.properties_geo.delete_many({"amass_property_id": amass_id})
        db.property_listings.delete_many({"amass_property_id": amass_id})
        db.property_representations.delete_many({"amass_property_id": amass_id})
        if prop_uuid:
            db.property_audit_logs.delete_many({"property_id": prop_uuid})
    db.properties.delete_many({"id": {"$in": ids}})


# ═════════════════════════════════════════════════════════════════
# 0) AuthZ
# ═════════════════════════════════════════════════════════════════
class TestAuthZ:
    def test_status_requires_auth(self, s):
        r = s.get(f"{BASE_URL}/api/admin/cockpit/migrate-legacy/status")
        assert r.status_code in (401, 403), r.text

    def test_migrate_requires_auth(self, s):
        r = s.post(f"{BASE_URL}/api/admin/cockpit/migrate-legacy?dry_run=true")
        assert r.status_code in (401, 403), r.text

    def test_status_non_admin_forbidden(self, s, non_admin_headers):
        r = s.get(f"{BASE_URL}/api/admin/cockpit/migrate-legacy/status",
                  headers=non_admin_headers)
        assert r.status_code == 403, r.text

    def test_migrate_non_admin_forbidden(self, s, non_admin_headers):
        r = s.post(f"{BASE_URL}/api/admin/cockpit/migrate-legacy?dry_run=true",
                   headers=non_admin_headers)
        assert r.status_code == 403, r.text


# ═════════════════════════════════════════════════════════════════
# 1) /migrate-legacy/status shape + counts
# ═════════════════════════════════════════════════════════════════
class TestStatus:
    def test_status_fields(self, s, admin_headers, seeded_legacy, db):
        r = s.get(f"{BASE_URL}/api/admin/cockpit/migrate-legacy/status",
                  headers=admin_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("total_legacy", "already_migrated", "pending", "missing_gps"):
            assert k in d, f"missing key {k}: {d}"
            assert isinstance(d[k], int)
        # We seeded 4 fresh docs → pending must be ≥ 4, missing_gps ≥ 1
        assert d["pending"] >= 4, d
        assert d["missing_gps"] >= 1, d
        # Cross-check against direct Mongo counts (small drift allowed — the other
        # xdist worker may insert listings between the API call and this count)
        assert abs(d["total_legacy"] - db.properties.count_documents({})) <= 10
        assert abs(d["already_migrated"] - db.properties.count_documents(
            {"migrated_to_amass_property_id": {"$exists": True}}
        )) <= 10


# ═════════════════════════════════════════════════════════════════
# 2) Dry run does NOT insert
# ═════════════════════════════════════════════════════════════════
class TestDryRun:
    def test_dry_run_no_inserts(self, s, admin_headers, seeded_legacy, db):
        before_geo = db.properties_geo.count_documents({})
        before_listings = db.property_listings.count_documents({})
        before_reps = db.property_representations.count_documents({})
        before_status = s.get(
            f"{BASE_URL}/api/admin/cockpit/migrate-legacy/status",
            headers=admin_headers,
        ).json()

        r = s.post(
            f"{BASE_URL}/api/admin/cockpit/migrate-legacy?dry_run=true",
            headers=admin_headers,
        )
        assert r.status_code == 200, r.text
        summary = r.json()
        assert summary.get("dry_run") is True
        assert summary["total_scanned"] >= 4
        # None should show up as "migrated"
        assert summary["migrated"] == 0
        # Every pending-with-GPS report is dry_run; missing-GPS still reported.
        dry_reports = [x for x in summary["reports"] if x["status"] == "dry_run"]
        missing_reports = [x for x in summary["reports"]
                           if x["status"] == "skipped_missing_gps"]
        assert len(dry_reports) >= 3, dry_reports
        assert len(missing_reports) >= 1, missing_reports

        # DB unchanged
        assert db.properties_geo.count_documents({}) == before_geo
        assert db.property_listings.count_documents({}) == before_listings
        assert db.property_representations.count_documents({}) == before_reps

        after_status = s.get(
            f"{BASE_URL}/api/admin/cockpit/migrate-legacy/status",
            headers=admin_headers,
        ).json()
        assert after_status == before_status, (before_status, after_status)


# ═════════════════════════════════════════════════════════════════
# 3) Real migration – full behaviour
# ═════════════════════════════════════════════════════════════════
@pytest.fixture(scope="module")
def migrated(s, admin_headers, seeded_legacy):
    r = s.post(
        f"{BASE_URL}/api/admin/cockpit/migrate-legacy?dry_run=false",
        headers=admin_headers,
    )
    assert r.status_code == 200, r.text
    return r.json()


class TestRealMigration:
    def test_summary_counts(self, migrated):
        assert migrated.get("dry_run") is False
        assert migrated["migrated"] >= 3, migrated
        # missing-GPS ones we seeded
        assert migrated["skipped_missing_gps"] >= 1, migrated
        assert migrated["errors"] == [], migrated

    def test_legacy_flag_set(self, seeded_legacy, db):
        for d in seeded_legacy:
            legacy = db.properties.find_one({"id": d["id"]})
            if d.get("latitude") is None:
                assert not legacy.get("migrated_to_amass_property_id"), \
                    "missing-GPS doc should NOT have been migrated"
            else:
                assert legacy.get("migrated_to_amass_property_id"), \
                    f"legacy {d['id']} missing amass id"

    def test_properties_geo_created(self, seeded_legacy, db):
        for d in seeded_legacy:
            if d.get("latitude") is None:
                # no properties_geo for missing-GPS docs
                assert db.properties_geo.count_documents(
                    {"legacy_property_id": d["id"]}
                ) == 0
                continue
            geo = db.properties_geo.find_one({"legacy_property_id": d["id"]})
            assert geo is not None, f"no properties_geo for {d['id']}"
            # entrance_point GeoJSON
            assert geo["entrance_point"]["type"] == "Point"
            assert geo["entrance_point"]["coordinates"] == [d["longitude"], d["latitude"]]
            # media_ids preserved
            assert geo["media_ids"] == d["images"]
            # visibility default: show_street True
            assert geo["passport_visibility"]["show_street"] is True
            # AMASS-<STATE>-<8 digits>
            aid = geo["amass_property_id"]
            assert aid.startswith("AMASS-"), aid
            parts = aid.split("-")
            assert len(parts) == 3 and len(parts[2]) == 8 and parts[2].isdigit(), aid

    def test_listing_linked(self, seeded_legacy, db):
        for d in seeded_legacy:
            if d.get("latitude") is None:
                continue
            geo = db.properties_geo.find_one({"legacy_property_id": d["id"]},
                                             {"property_uuid": 1, "amass_property_id": 1})
            listing = db.property_listings.find_one(
                {"property_id": geo["property_uuid"]}
            )
            assert listing is not None, f"no listing for {d['id']}"
            assert listing["amass_property_id"] == geo["amass_property_id"]
            assert listing.get("migrated_from_legacy") is True
            assert listing["legacy_property_id"] == d["id"]

    def test_representation_status_matches_source(self, seeded_legacy, db):
        for d in seeded_legacy:
            if d.get("latitude") is None:
                continue
            geo = db.properties_geo.find_one({"legacy_property_id": d["id"]},
                                             {"property_uuid": 1})
            rep = db.property_representations.find_one(
                {"property_id": geo["property_uuid"]}
            )
            assert rep is not None, f"no representation for {d['id']}"
            expected = "APPROVED" if d["listing_source"] == "mandated" else "PENDING"
            assert rep["status"] == expected, (d["listing_source"], rep["status"])

    def test_audit_rows_written(self, seeded_legacy, db):
        for d in seeded_legacy:
            if d.get("latitude") is None:
                continue
            geo = db.properties_geo.find_one({"legacy_property_id": d["id"]},
                                             {"property_uuid": 1})
            actions = set(
                x["action"]
                for x in db.property_audit_logs.find(
                    {"property_id": geo["property_uuid"]}, {"action": 1}
                )
            )
            assert "PROPERTY_CREATED" in actions, (d["id"], actions)
            assert "LISTING_CREATED" in actions, (d["id"], actions)
            if d.get("verified"):
                assert "PROPERTY_VERIFIED" in actions, (d["id"], actions)


# ═════════════════════════════════════════════════════════════════
# 4) Idempotency – second run migrates nothing
# ═════════════════════════════════════════════════════════════════
class TestIdempotency:
    def test_second_run_zero(self, s, admin_headers, migrated, db):
        before_geo = db.properties_geo.count_documents({})
        before_listings = db.property_listings.count_documents({})
        r = s.post(
            f"{BASE_URL}/api/admin/cockpit/migrate-legacy?dry_run=false",
            headers=admin_headers,
        )
        assert r.status_code == 200, r.text
        summary = r.json()
        # Zero *new* migrations (missing-GPS docs re-scan is expected — they
        # never receive the migrated flag).
        assert summary["migrated"] == 0, summary
        # And DB counts strictly unchanged → no duplicates.
        assert db.properties_geo.count_documents({}) == before_geo
        assert db.property_listings.count_documents({}) == before_listings


# ═════════════════════════════════════════════════════════════════
# 5) Passport + properties-v2 resolve after migration
# ═════════════════════════════════════════════════════════════════
class TestPostMigrationEndpoints:
    def test_passport_shows_legacy_photos_and_listings(
        self, s, seeded_legacy, migrated, db,
    ):
        # Pick a migrated legacy (skip the missing_gps one)
        d = next(x for x in seeded_legacy if x.get("latitude") is not None)
        legacy = db.properties.find_one({"id": d["id"]},
                                        {"migrated_to_amass_property_id": 1})
        amass_id = legacy["migrated_to_amass_property_id"]

        r = s.get(f"{BASE_URL}/api/passport/{amass_id}")
        assert r.status_code == 200, r.text
        body = r.json()
        # Legacy photos preserved
        photos = body.get("property", {}).get("photos") or []
        assert d["images"][0] in photos, (photos, d["images"])
        # Listings count ≥ 1
        assert isinstance(body.get("listings"), list) and len(body["listings"]) >= 1
        # listing_type available
        assert body["listings"][0].get("listing_type") == d["listing_type"]

    def test_properties_v2_preserves_legacy_id(
        self, s, seeded_legacy, migrated, db,
    ):
        d = next(x for x in seeded_legacy if x.get("latitude") is not None)
        legacy = db.properties.find_one({"id": d["id"]},
                                        {"migrated_to_amass_property_id": 1})
        amass_id = legacy["migrated_to_amass_property_id"]
        r = s.get(f"{BASE_URL}/api/properties-v2/{amass_id}")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["amass_property_id"] == amass_id
        assert body["legacy_property_id"] == d["id"]


# ═════════════════════════════════════════════════════════════════
# 6) Regression – legacy /api/properties still returns docs
# ═════════════════════════════════════════════════════════════════
class TestLegacyRegression:
    def test_v1_properties_still_lists_legacy(self, s, seeded_legacy, migrated):
        r = s.get(f"{BASE_URL}/api/properties?limit=200")
        assert r.status_code == 200, r.text
        data = r.json()
        # Might be paginated / limited; just check that at least one seeded
        # legacy id still shows up
        ids = [p.get("id") for p in data] if isinstance(data, list) else \
              [p.get("id") for p in data.get("items", [])]
        seeded_ids = {d["id"] for d in seeded_legacy}
        assert seeded_ids & set(ids), (
            f"None of the seeded legacy ids ({seeded_ids}) appear in v1 list "
            f"(got {len(ids)} items)"
        )
