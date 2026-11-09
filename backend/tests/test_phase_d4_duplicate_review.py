"""AMASS Phase D-4 — Duplicate Review admin flow.

Covers:
  • GET  /candidates/{id}/review — returns candidate + hydrated matches + history
  • POST /candidates/{id}/resolve  (MERGE | KEEP_SEPARATE | MARK_RELATED)
  • Idempotency: cannot resolve a candidate twice
  • Missing amass_property_id → 400 for MERGE and MARK_RELATED
  • MERGE writes to property_audit_logs and appends aliases
  • MARK_RELATED writes to property_audit_logs; candidate stays UNVERIFIED
  • KEEP_SEPARATE clears the duplicate lock and allows subsequent promotion
  • GET /overrides lists discovery_admin_overrides
  • Auth guards
"""
import os
import uuid
import asyncio
from datetime import datetime, timezone

import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient

BASE_URL = os.environ.get(
    "EXPO_BACKEND_URL", "https://property-os-africa.preview.emergentagent.com"
).rstrip("/")
DEMO_EMAIL = "demo@amass.africa"
DEMO_PASSWORD = "amass2026"
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "amass_db")

BASE_URL = os.environ.get(
    "EXPO_BACKEND_URL", "https://property-os-africa.preview.emergentagent.com"
).rstrip("/")
DEMO_EMAIL = "demo@amass.africa"
DEMO_PASSWORD = "amass2026"


# ── Fixtures ─────────────────────────────────────────────────────
@pytest.fixture(scope="module")
def admin_headers():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return {"Authorization": f"Bearer {r.json()['access_token']}",
            "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def non_admin_headers():
    email = "d4_nonadmin_user@example.com"
    pwd = "TestPass123!"
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pwd})
    if r.status_code != 200:
        rr = requests.post(f"{BASE_URL}/api/auth/register",
                           json={"email": email, "password": pwd, "full_name": "NonAdmin D4"})
        assert rr.status_code == 200, rr.text
        tok = rr.json()["access_token"]
    else:
        tok = r.json()["access_token"]
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module", autouse=True)
def ensure_flag(admin_headers):
    r = requests.get(f"{BASE_URL}/api/admin/settings/feature_flags", headers=admin_headers)
    assert r.status_code == 200
    flags = r.json()["value"]
    flags["PROPERTY_DISCOVERY_ENABLED"] = True
    requests.patch(f"{BASE_URL}/api/admin/settings/feature_flags",
                   headers=admin_headers, json={"value": flags})


# ── Helpers ──────────────────────────────────────────────────────
def _run(coro_factory):
    """Run an async helper with a fresh event loop AND a fresh mongo client
    (motor binds each client to a specific loop)."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro_factory())
    finally:
        loop.close()


async def _insert_candidate_async(lat: float, lng: float, name: str, address: str) -> dict:
    """Directly insert a synthetic candidate — avoids the mock-place idempotency wall."""
    cli = AsyncIOMotorClient(MONGO_URL)
    db = cli[DB_NAME]
    try:
        cid = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        doc = {
            "id": cid,
            "source_type": "GOOGLE_PLACES",
            "source_reference": f"synthetic_{cid[:8]}",
            "google_place_id": f"synth_{cid[:12]}",
            "candidate_type": "PROPERTY",
            "status": "UNVERIFIED",
            "name": name,
            "address": address,
            "latitude": lat,
            "longitude": lng,
            "location": {"type": "Point", "coordinates": [lng, lat]},
            "google_types": ["premise", "point_of_interest"],
            "primary_type": "premise",
            "business_status": "OPERATIONAL",
            "google_maps_uri": None,
            "duplicate_score": 0,
            "duplicate_matches": [],
            "promoted_to_amass_property_id": None,
            "reviewed_by": None,
            "reviewed_at": None,
            "review_notes": None,
            "created_at": now,
            "updated_at": now,
            "discovered_at": now,
        }
        await db.property_candidates.insert_one(doc)
        doc.pop("_id", None)
        return doc
    finally:
        cli.close()


def _create_candidate(admin_headers=None, lat=None, lng=None) -> dict:
    """Sync wrapper — inserts a fresh candidate in Lagos VI area by default."""
    import random
    base_lat, base_lng = 6.4400, 3.4750
    lat = lat if lat is not None else base_lat + random.uniform(-0.005, 0.005)
    lng = lng if lng is not None else base_lng + random.uniform(-0.005, 0.005)
    name = f"D4 Synth {uuid.uuid4().hex[:6]}"
    address = f"{random.randint(1, 999)} Test Ave, Victoria Island, Lagos"
    return _run(lambda: _insert_candidate_async(lat, lng, name, address))


def _promote_first_candidate_as_new(admin_headers, cand_id: str) -> str:
    """Force-promote a candidate as a NEW AMASS lead so we have a target for MERGE/RELATED."""
    r = requests.post(
        f"{BASE_URL}/api/admin/discovery/candidates/{cand_id}/promote",
        headers=admin_headers,
        json={"force_new": True, "notes": "phase d-4 target seed"},
    )
    assert r.status_code == 200, f"promote failed: {r.status_code} {r.text}"
    body = r.json()
    if body.get("already_promoted"):
        return body["amass_property_id"]
    assert body.get("amass_property_id"), body
    return body["amass_property_id"]


# ── Access control ───────────────────────────────────────────────
def test_review_requires_admin(non_admin_headers):
    r = requests.get(
        f"{BASE_URL}/api/admin/discovery/candidates/does-not-exist/review",
        headers=non_admin_headers,
    )
    assert r.status_code in (401, 403)


def test_resolve_requires_admin(non_admin_headers):
    r = requests.post(
        f"{BASE_URL}/api/admin/discovery/candidates/does-not-exist/resolve",
        headers=non_admin_headers,
        json={"action": "KEEP_SEPARATE"},
    )
    assert r.status_code in (401, 403)


# ── Happy path — review payload shape ────────────────────────────
def test_review_returns_candidate_and_matches(admin_headers):
    cand = _create_candidate(admin_headers)
    r = requests.get(
        f"{BASE_URL}/api/admin/discovery/candidates/{cand['id']}/review",
        headers=admin_headers,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["candidate"]["id"] == cand["id"]
    assert "matches" in body and isinstance(body["matches"], list)
    assert "recommended_action" in body
    assert "override_history" in body


def test_review_404_for_unknown_candidate(admin_headers):
    r = requests.get(
        f"{BASE_URL}/api/admin/discovery/candidates/does-not-exist-xyz/review",
        headers=admin_headers,
    )
    assert r.status_code == 404


# ── KEEP_SEPARATE — clears the lock ──────────────────────────────
def test_keep_separate_clears_duplicate_lock(admin_headers):
    cand = _create_candidate(admin_headers)
    r = requests.post(
        f"{BASE_URL}/api/admin/discovery/candidates/{cand['id']}/resolve",
        headers=admin_headers,
        json={"action": "KEEP_SEPARATE", "reason": "distinct unit"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["action"] == "KEEP_SEPARATE"
    assert body["next_status"] == "UNVERIFIED"

    # Confirm candidate now UNVERIFIED with cleared duplicate_matches
    got = requests.get(
        f"{BASE_URL}/api/admin/discovery/candidates/{cand['id']}",
        headers=admin_headers,
    ).json()
    assert got["status"] == "UNVERIFIED"
    assert got.get("duplicate_matches") == []
    assert got.get("admin_override_keep_separate") is True
    assert got.get("review_notes") == "distinct unit"

    # Override history recorded
    ov = requests.get(
        f"{BASE_URL}/api/admin/discovery/overrides?candidate_id={cand['id']}",
        headers=admin_headers,
    ).json()
    assert ov["count"] >= 1
    assert ov["items"][0]["action"] == "KEEP_SEPARATE"


# ── MERGE — attach candidate to existing property ───────────────
def test_merge_attaches_candidate_to_property(admin_headers):
    # Step 1 — seed an AMASS property by promoting a candidate as force_new
    seed_cand = _create_candidate(admin_headers)
    target_amass_id = _promote_first_candidate_as_new(admin_headers, seed_cand["id"])

    # Step 2 — create a second candidate, then MERGE into target
    dup_cand = _create_candidate(admin_headers)
    r = requests.post(
        f"{BASE_URL}/api/admin/discovery/candidates/{dup_cand['id']}/resolve",
        headers=admin_headers,
        json={"action": "MERGE", "amass_property_id": target_amass_id, "reason": "same building"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["action"] == "MERGE"
    assert body["amass_property_id"] == target_amass_id
    assert body["property_uuid"]

    # Candidate status should be DUPLICATE with promoted id set
    got = requests.get(
        f"{BASE_URL}/api/admin/discovery/candidates/{dup_cand['id']}",
        headers=admin_headers,
    ).json()
    assert got["status"] == "DUPLICATE"
    assert got["promoted_to_amass_property_id"] == target_amass_id

    # An audit log should exist
    logs = requests.get(
        f"{BASE_URL}/api/admin/cockpit/audit-logs?property_id={target_amass_id}&action=CANDIDATE_MERGED",
        headers=admin_headers,
    ).json()
    assert logs["count"] >= 1
    assert any(l["new_value"].get("candidate_id") == dup_cand["id"] for l in logs["items"])


def test_merge_requires_amass_id(admin_headers):
    cand = _create_candidate(admin_headers)
    r = requests.post(
        f"{BASE_URL}/api/admin/discovery/candidates/{cand['id']}/resolve",
        headers=admin_headers,
        json={"action": "MERGE"},
    )
    assert r.status_code == 400
    assert "amass_property_id" in r.text


def test_merge_404_on_unknown_target(admin_headers):
    cand = _create_candidate(admin_headers)
    r = requests.post(
        f"{BASE_URL}/api/admin/discovery/candidates/{cand['id']}/resolve",
        headers=admin_headers,
        json={"action": "MERGE", "amass_property_id": "AMASS-XXX-99999999"},
    )
    assert r.status_code == 404


# ── MARK_RELATED — keeps candidate independent ──────────────────
def test_mark_related_keeps_candidate_independent(admin_headers):
    seed_cand = _create_candidate(admin_headers)
    target_amass_id = _promote_first_candidate_as_new(admin_headers, seed_cand["id"])

    other = _create_candidate(admin_headers)
    r = requests.post(
        f"{BASE_URL}/api/admin/discovery/candidates/{other['id']}/resolve",
        headers=admin_headers,
        json={"action": "MARK_RELATED", "amass_property_id": target_amass_id, "reason": "same estate"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["action"] == "MARK_RELATED"

    got = requests.get(
        f"{BASE_URL}/api/admin/discovery/candidates/{other['id']}",
        headers=admin_headers,
    ).json()
    assert got["status"] == "UNVERIFIED"
    assert got.get("related_amass_property_id") == target_amass_id
    # Not promoted yet — remains free to promote as its own lead
    assert not got.get("promoted_to_amass_property_id")

    # Audit log present
    logs = requests.get(
        f"{BASE_URL}/api/admin/cockpit/audit-logs?property_id={target_amass_id}&action=CANDIDATE_MARKED_RELATED",
        headers=admin_headers,
    ).json()
    assert logs["count"] >= 1


# ── Idempotency — resolving twice ────────────────────────────────
def test_resolve_twice_rejected_when_already_promoted(admin_headers):
    seed_cand = _create_candidate(admin_headers)
    target_amass_id = _promote_first_candidate_as_new(admin_headers, seed_cand["id"])

    dup_cand = _create_candidate(admin_headers)
    r1 = requests.post(
        f"{BASE_URL}/api/admin/discovery/candidates/{dup_cand['id']}/resolve",
        headers=admin_headers,
        json={"action": "MERGE", "amass_property_id": target_amass_id},
    )
    assert r1.status_code == 200
    # Second attempt to MERGE should be blocked (candidate already resolved)
    r2 = requests.post(
        f"{BASE_URL}/api/admin/discovery/candidates/{dup_cand['id']}/resolve",
        headers=admin_headers,
        json={"action": "MERGE", "amass_property_id": target_amass_id},
    )
    assert r2.status_code == 400


# ── KEEP_SEPARATE → subsequent promote as NEW works ─────────────
def test_keep_separate_then_promote_creates_new_amass_id(admin_headers):
    cand = _create_candidate(admin_headers)
    # Force KEEP_SEPARATE
    r = requests.post(
        f"{BASE_URL}/api/admin/discovery/candidates/{cand['id']}/resolve",
        headers=admin_headers,
        json={"action": "KEEP_SEPARATE"},
    )
    assert r.status_code == 200
    # Promote should now succeed as a new lead (duplicate_matches were cleared)
    r2 = requests.post(
        f"{BASE_URL}/api/admin/discovery/candidates/{cand['id']}/promote",
        headers=admin_headers,
        json={},
    )
    assert r2.status_code == 200
    body = r2.json()
    assert body.get("amass_property_id")
    assert body.get("attached_to_existing") is not True


# ── Overrides list filter ───────────────────────────────────────
def test_overrides_endpoint_filters(admin_headers):
    r = requests.get(
        f"{BASE_URL}/api/admin/discovery/overrides?action=KEEP_SEPARATE&limit=5",
        headers=admin_headers,
    )
    assert r.status_code == 200
    body = r.json()
    assert "items" in body and "count" in body
    for item in body["items"]:
        assert item["action"] == "KEEP_SEPARATE"


def test_invalid_action_rejected(admin_headers):
    cand = _create_candidate(admin_headers)
    r = requests.post(
        f"{BASE_URL}/api/admin/discovery/candidates/{cand['id']}/resolve",
        headers=admin_headers,
        json={"action": "NUKE"},
    )
    assert r.status_code == 422  # pydantic pattern violation
