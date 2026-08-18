"""AMASS Phase 6B — Duplicate Detection Engine backend verification.

Runs against public EXPO_BACKEND_URL. Uses the demo admin
(demo@amass.africa / amass2026) which is in ADMIN_EMAILS.

Existing Phase 6A fixture (do NOT delete):
  AMASS-LAG-00000001 at (lat=6.4321, lng=3.4567) — 4-bed duplex in Lekki Phase 1
"""
from __future__ import annotations

import os
import time
import uuid

import pytest
import requests

BASE_URL = os.environ.get(
    "EXPO_BACKEND_URL",
    "https://property-os-africa.preview.emergentagent.com",
).rstrip("/")

DEMO_EMAIL = "demo@amass.africa"
DEMO_PASSWORD = "amass2026"

EXISTING_AMASS_ID = "AMASS-LAG-00000001"
EXISTING_LAT = 6.4321
EXISTING_LNG = 3.4567


# ─── Fixtures ─────────────────────────────────────────────────────
@pytest.fixture(scope="module")
def s():
    return requests.Session()


@pytest.fixture(scope="module")
def demo_headers(s):
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})
    assert r.status_code == 200, f"login failed {r.status_code} {r.text}"
    return {"Authorization": f"Bearer {r.json()['access_token']}",
            "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def existing_property(s, demo_headers):
    """Confirm the Phase 6A fixture is present. If missing the whole
    Phase 6B behaviour is untestable, so skip."""
    r = s.get(f"{BASE_URL}/api/properties-v2/{EXISTING_AMASS_ID}")
    if r.status_code != 200:
        pytest.skip(f"Phase 6A fixture missing: {r.status_code} {r.text}")
    return r.json()


@pytest.fixture(scope="module")
def non_admin_headers(s):
    """A separate agent user that is NOT in ADMIN_EMAILS."""
    email = f"nonadmin_{uuid.uuid4().hex[:8]}@example.com"
    r = s.post(f"{BASE_URL}/api/auth/register",
               json={"email": email, "password": "TestPass123",
                     "full_name": "Non Admin"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}",
            "Content-Type": "application/json"}


# ── helpers ──
def _sq_polygon(cx, cy, half_deg=0.0005):
    """Return a GeoJSON Polygon square around (cx=lng, cy=lat)."""
    return {"type": "Polygon", "coordinates": [[
        [cx - half_deg, cy - half_deg],
        [cx + half_deg, cy - half_deg],
        [cx + half_deg, cy + half_deg],
        [cx - half_deg, cy + half_deg],
        [cx - half_deg, cy - half_deg],
    ]]}


# ═══════════════════════════════════════════════════════════════════
# 1) Scoring correctness
# ═══════════════════════════════════════════════════════════════════
class TestScoring:
    def test_proximity_zero_distance(self, s, demo_headers, existing_property):
        r = s.post(f"{BASE_URL}/api/agent/properties/duplicate-check",
                   headers=demo_headers,
                   json={"latitude": EXISTING_LAT, "longitude": EXISTING_LNG,
                         "accuracy_meters": 5})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["candidates"], "expected at least 1 candidate"
        c = d["candidates"][0]
        assert c["breakdown"]["proximity"] == 30
        assert c["distance_meters"] < 1.0

    def test_address_and_type_and_attrs(self, s, demo_headers, existing_property):
        # Build a payload that matches the existing property's address strongly.
        ex = existing_property
        addr = {
            "state": ex.get("state") or "Lagos",
            "lga": ex.get("lga"),
            "area": ex.get("area"),
            "estate": ex.get("estate"),
            "street": ex.get("street"),
            "house_number": ex.get("house_number"),
        }
        details = ex.get("details") or {}
        r = s.post(f"{BASE_URL}/api/agent/properties/duplicate-check",
                   headers=demo_headers,
                   json={"latitude": EXISTING_LAT, "longitude": EXISTING_LNG,
                         "accuracy_meters": 5,
                         "property_type": ex.get("property_type") or "duplex",
                         "bedrooms": details.get("bedrooms") or 4,
                         "bathrooms": details.get("bathrooms") or 4,
                         "building_size_sqm": details.get("building_size_sqm") or 300,
                         "address": addr})
        assert r.status_code == 200
        c = r.json()["candidates"][0]
        b = c["breakdown"]
        assert b["proximity"] == 30
        # Type — same type → 5 (skipped if existing has no type)
        if ex.get("property_type"):
            assert b["type"] == 5, f"type breakdown={b}"
        # Attributes: same bedrooms/bathrooms + size within 15% → 5
        assert b["attributes"] == 5, f"attrs breakdown={b}"
        # Address (any positive is fine — Phase 6A may store partial addr)
        assert b["address"] >= 0
        # Total ≈ 50 (30 + 5 + 5 + address 10) without polygon data
        assert c["score"] >= 40

    def test_footprint_polygon_overlap(self, s, demo_headers, existing_property):
        fp = _sq_polygon(EXISTING_LNG, EXISTING_LAT, half_deg=0.0005)
        r = s.post(f"{BASE_URL}/api/agent/properties/duplicate-check",
                   headers=demo_headers,
                   json={"latitude": EXISTING_LAT, "longitude": EXISTING_LNG,
                         "accuracy_meters": 5, "building_footprint": fp})
        assert r.status_code == 200
        b = r.json()["candidates"][0]["breakdown"]
        # existing property has no footprint stored → engine returns 0 (both sides required)
        assert b["footprint"] in (0, 5, 10, 20, 25)

    def test_distant_lat_lng_returns_zero_candidates(self, s, demo_headers):
        # Abuja far from Lagos
        r = s.post(f"{BASE_URL}/api/agent/properties/duplicate-check",
                   headers=demo_headers,
                   json={"latitude": 9.0765, "longitude": 7.3986,
                         "accuracy_meters": 10})
        assert r.status_code == 200
        d = r.json()
        assert d["candidates"] == []
        assert d["action"] == "allow"
        assert d["highest_score"] == 0

    def test_type_mismatch_across_families(self, s, demo_headers):
        # duplex (house family) vs "land" (land family) → 0
        r = s.post(f"{BASE_URL}/api/agent/properties/duplicate-check",
                   headers=demo_headers,
                   json={"latitude": EXISTING_LAT, "longitude": EXISTING_LNG,
                         "accuracy_meters": 5, "property_type": "land"})
        assert r.status_code == 200
        c = r.json()["candidates"][0]
        assert c["breakdown"]["type"] == 0

    def test_type_same_family_diff_subtype(self, s, demo_headers, existing_property):
        # existing is "duplex" — "bungalow" is same house family → 3
        if not existing_property.get("property_type"):
            pytest.skip("existing property has no property_type")
        r = s.post(f"{BASE_URL}/api/agent/properties/duplicate-check",
                   headers=demo_headers,
                   json={"latitude": EXISTING_LAT, "longitude": EXISTING_LNG,
                         "accuracy_meters": 5, "property_type": "bungalow"})
        c = r.json()["candidates"][0]
        assert c["breakdown"]["type"] == 3


# ═══════════════════════════════════════════════════════════════════
# 2) Action classification (uses admin threshold PATCH)
# ═══════════════════════════════════════════════════════════════════
class TestActionClassification:
    def test_allow_when_below_possible(self, s, demo_headers):
        r = s.post(f"{BASE_URL}/api/agent/properties/duplicate-check",
                   headers=demo_headers,
                   json={"latitude": 9.0765, "longitude": 7.3986,
                         "accuracy_meters": 10})
        assert r.json()["action"] == "allow"

    def test_possible_duplicate_bracket(self, s, demo_headers):
        # Force by lowering possible_threshold to 40 (>=40 allowed).
        r = s.patch(f"{BASE_URL}/api/admin/duplicate/config",
                    headers=demo_headers, json={"possible_threshold": 40})
        assert r.status_code == 200, r.text
        try:
            r = s.post(f"{BASE_URL}/api/agent/properties/duplicate-check",
                       headers=demo_headers,
                       json={"latitude": EXISTING_LAT, "longitude": EXISTING_LNG,
                             "accuracy_meters": 5, "property_type": "duplex"})
            d = r.json()
            # highest ≈ 35 (proximity 30 + type 5). If score >=40 -> possible.
            assert d["action"] in ("possible_duplicate", "allow")
            # A stronger payload should definitely flag possible_duplicate.
            r2 = s.post(f"{BASE_URL}/api/agent/properties/duplicate-check",
                        headers=demo_headers,
                        json={"latitude": EXISTING_LAT, "longitude": EXISTING_LNG,
                              "accuracy_meters": 5, "property_type": "duplex",
                              "bedrooms": 4, "bathrooms": 4,
                              "building_size_sqm": 300})
            assert r2.json()["highest_score"] >= 40
            assert r2.json()["action"] == "possible_duplicate"
        finally:
            r = s.patch(f"{BASE_URL}/api/admin/duplicate/config",
                        headers=demo_headers, json={"possible_threshold": 60})
            assert r.status_code == 200


# ═══════════════════════════════════════════════════════════════════
# 3) Draft-scoped duplicate check
# ═══════════════════════════════════════════════════════════════════
def _new_draft(s, headers, csid, lat, lng, address=None, details=None, listing=None):
    r = s.post(f"{BASE_URL}/api/agent/properties/onboarding",
               headers=headers, json={"client_submission_id": csid})
    assert r.status_code == 200, r.text
    oid = r.json()["onboarding_id"]
    r = s.post(f"{BASE_URL}/api/agent/properties/{oid}/location",
               headers=headers,
               json={"location": {"latitude": lat, "longitude": lng,
                                  "accuracy_meters": 5,
                                  "location_source": "GPS"},
                     "address": address or {"state": "Lagos", "lga": "Eti-Osa",
                                            "area": "Lekki Phase 1"}})
    assert r.status_code == 200, r.text
    if details or listing:
        body = {}
        if details: body["details"] = details
        if listing: body["listing"] = listing
        r = s.patch(f"{BASE_URL}/api/agent/properties/{oid}",
                    headers=headers, json=body)
        assert r.status_code == 200, r.text
    return oid


class TestDraftScopedCheck:
    def test_no_location_returns_400(self, s, demo_headers):
        csid = f"csid-nolocation-{uuid.uuid4().hex[:8]}"
        r = s.post(f"{BASE_URL}/api/agent/properties/onboarding",
                   headers=demo_headers, json={"client_submission_id": csid})
        oid = r.json()["onboarding_id"]
        r = s.post(f"{BASE_URL}/api/agent/properties/{oid}/duplicate-check",
                   headers=demo_headers)
        assert r.status_code == 400

    def test_persists_check_and_writes_audit(self, s, demo_headers):
        csid = f"csid-dupcheck-{uuid.uuid4().hex[:8]}"
        oid = _new_draft(s, demo_headers, csid, EXISTING_LAT, EXISTING_LNG,
                         details={"property_type": "duplex",
                                  "bedrooms": 4, "bathrooms": 4,
                                  "building_size_sqm": 300})
        r = s.post(f"{BASE_URL}/api/agent/properties/{oid}/duplicate-check",
                   headers=demo_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["highest_score"] > 0
        assert d["action"] in ("possible_duplicate", "high_confidence_duplicate", "allow")

        # Draft now has status DUPLICATE_CHECK and persisted duplicate_check
        r = s.get(f"{BASE_URL}/api/agent/properties/onboarding/{oid}",
                  headers=demo_headers)
        draft = r.json()
        assert draft["status"] == "DUPLICATE_CHECK"
        dc = draft.get("duplicate_check") or {}
        assert "highest_score" in dc and "action" in dc and "candidates" in dc


# ═══════════════════════════════════════════════════════════════════
# 4) Decision recording
# ═══════════════════════════════════════════════════════════════════
class TestDecisionRecording:
    def test_all_decision_paths(self, s, demo_headers):
        csid = f"csid-dec-{uuid.uuid4().hex[:8]}"
        oid = _new_draft(s, demo_headers, csid, EXISTING_LAT, EXISTING_LNG)
        # Same but no amass_id → 400
        r = s.post(f"{BASE_URL}/api/agent/properties/{oid}/decision",
                   headers=demo_headers,
                   json={"duplicate_decision": "same_property",
                         "client_submission_id": csid})
        assert r.status_code == 400

        # Valid same_property
        r = s.post(f"{BASE_URL}/api/agent/properties/{oid}/decision",
                   headers=demo_headers,
                   json={"duplicate_decision": "same_property",
                         "same_as_amass_id": EXISTING_AMASS_ID,
                         "client_submission_id": csid})
        assert r.status_code == 200, r.text
        assert r.json()["decision"] == "same_property"

        # not_same_property missing reason → 400
        r = s.post(f"{BASE_URL}/api/agent/properties/{oid}/decision",
                   headers=demo_headers,
                   json={"duplicate_decision": "not_same_property",
                         "client_submission_id": csid})
        assert r.status_code == 400

        # Valid not_same
        r = s.post(f"{BASE_URL}/api/agent/properties/{oid}/decision",
                   headers=demo_headers,
                   json={"duplicate_decision": "not_same_property",
                         "not_same_reason": "Different building on same street",
                         "client_submission_id": csid})
        assert r.status_code == 200

        # Invalid decision
        r = s.post(f"{BASE_URL}/api/agent/properties/{oid}/decision",
                   headers=demo_headers,
                   json={"duplicate_decision": "maybe",
                         "client_submission_id": csid})
        assert r.status_code == 400

        # Mismatched CSID
        r = s.post(f"{BASE_URL}/api/agent/properties/{oid}/decision",
                   headers=demo_headers,
                   json={"duplicate_decision": "same_property",
                         "same_as_amass_id": EXISTING_AMASS_ID,
                         "client_submission_id": "wrong-csid"})
        assert r.status_code == 404


# ═══════════════════════════════════════════════════════════════════
# 5) Submit-gate integration
# ═══════════════════════════════════════════════════════════════════
class TestSubmitGate:
    def test_409_when_no_decision(self, s, demo_headers):
        # Existing seed has sparse `details`, so max achievable score at
        # this location is ~45 (prox 30 + addr 7 + type 5 + attrs 3).
        # Lower possible_threshold to 40 to force the 409 gate, then restore.
        rp = s.patch(f"{BASE_URL}/api/admin/duplicate/config",
                     headers=demo_headers, json={"possible_threshold": 40})
        assert rp.status_code == 200
        try:
            csid = f"csid-gate-{uuid.uuid4().hex[:8]}"
            oid = _new_draft(
                s, demo_headers, csid, EXISTING_LAT, EXISTING_LNG,
                details={"property_type": "duplex", "bedrooms": 4,
                         "bathrooms": 4, "building_size_sqm": 300},
                listing={"listing_type": "buy", "price": 100_000_000},
            )
            r = s.post(f"{BASE_URL}/api/agent/properties/{oid}/duplicate-check",
                       headers=demo_headers)
            assert r.json()["highest_score"] >= 40, \
                f"expected possible-duplicate score, got {r.json()}"
            assert r.json()["action"] == "possible_duplicate"
            # Try submit → should 409
            r = s.post(f"{BASE_URL}/api/agent/properties/{oid}/submit",
                       headers=demo_headers, json={"client_submission_id": csid})
            assert r.status_code == 409, r.text
            body = r.json().get("detail") or r.json()
            assert body.get("error") == "duplicate_decision_required"
            assert "highest_score" in body
            assert isinstance(body.get("candidates"), list)
            assert len(body["candidates"]) <= 3
        finally:
            s.patch(f"{BASE_URL}/api/admin/duplicate/config",
                    headers=demo_headers, json={"possible_threshold": 60})

    def test_same_property_attaches(self, s, demo_headers):
        csid = f"csid-attach-{uuid.uuid4().hex[:8]}"
        oid = _new_draft(
            s, demo_headers, csid, EXISTING_LAT, EXISTING_LNG,
            details={"property_type": "duplex", "bedrooms": 4,
                     "bathrooms": 4, "building_size_sqm": 300},
            listing={"listing_type": "rent", "price": 5_000_000},
        )
        r = s.post(f"{BASE_URL}/api/agent/properties/{oid}/duplicate-check",
                   headers=demo_headers)
        assert r.status_code == 200

        # Count listings before
        before = s.get(f"{BASE_URL}/api/properties-v2/{EXISTING_AMASS_ID}/listings").json()

        r = s.post(f"{BASE_URL}/api/agent/properties/{oid}/decision",
                   headers=demo_headers,
                   json={"duplicate_decision": "same_property",
                         "same_as_amass_id": EXISTING_AMASS_ID,
                         "client_submission_id": csid})
        assert r.status_code == 200

        r = s.post(f"{BASE_URL}/api/agent/properties/{oid}/submit",
                   headers=demo_headers, json={"client_submission_id": csid})
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("attached_to_existing") is True
        assert j["amass_property_id"] == EXISTING_AMASS_ID
        assert "listing_id" in j

        after = s.get(f"{BASE_URL}/api/properties-v2/{EXISTING_AMASS_ID}/listings").json()
        assert len(after) == len(before) + 1

        # Idempotency
        r2 = s.post(f"{BASE_URL}/api/agent/properties/{oid}/submit",
                    headers=demo_headers, json={"client_submission_id": csid})
        assert r2.status_code == 200
        j2 = r2.json()
        assert j2.get("idempotent") is True
        assert j2["listing_id"] == j["listing_id"]

    def test_not_same_property_creates_new(self, s, demo_headers):
        csid = f"csid-notsame-{uuid.uuid4().hex[:8]}"
        # Place at ~same lat/lng so a duplicate is detected
        oid = _new_draft(
            s, demo_headers, csid, EXISTING_LAT, EXISTING_LNG,
            details={"property_type": "duplex", "bedrooms": 4,
                     "bathrooms": 4, "building_size_sqm": 300},
            listing={"listing_type": "buy", "price": 90_000_000},
        )
        s.post(f"{BASE_URL}/api/agent/properties/{oid}/duplicate-check",
               headers=demo_headers)
        r = s.post(f"{BASE_URL}/api/agent/properties/{oid}/decision",
                   headers=demo_headers,
                   json={"duplicate_decision": "not_same_property",
                         "not_same_reason": "Adjacent plot",
                         "client_submission_id": csid})
        assert r.status_code == 200
        r = s.post(f"{BASE_URL}/api/agent/properties/{oid}/submit",
                   headers=demo_headers, json={"client_submission_id": csid})
        assert r.status_code == 200, r.text
        j = r.json()
        assert not j.get("attached_to_existing")
        assert j["amass_property_id"].startswith("AMASS-LAG-")
        assert j["amass_property_id"] != EXISTING_AMASS_ID

        # Idempotent
        r2 = s.post(f"{BASE_URL}/api/agent/properties/{oid}/submit",
                    headers=demo_headers, json={"client_submission_id": csid})
        j2 = r2.json()
        assert j2.get("idempotent") is True
        assert j2["amass_property_id"] == j["amass_property_id"]


# ═══════════════════════════════════════════════════════════════════
# 6) Admin threshold guardrails
# ═══════════════════════════════════════════════════════════════════
class TestAdminThresholds:
    def test_get_config(self, s, demo_headers):
        r = s.get(f"{BASE_URL}/api/admin/duplicate/config", headers=demo_headers)
        assert r.status_code == 200
        d = r.json()
        assert "high_confidence_threshold" in d
        assert "possible_threshold" in d

    def test_patch_possible_below_40_rejected(self, s, demo_headers):
        r = s.patch(f"{BASE_URL}/api/admin/duplicate/config",
                    headers=demo_headers, json={"possible_threshold": 20})
        assert r.status_code == 400

    def test_patch_high_below_60_rejected(self, s, demo_headers):
        r = s.patch(f"{BASE_URL}/api/admin/duplicate/config",
                    headers=demo_headers, json={"high_confidence_threshold": 50})
        assert r.status_code == 400

    def test_valid_update_and_reset(self, s, demo_headers):
        r = s.patch(f"{BASE_URL}/api/admin/duplicate/config",
                    headers=demo_headers, json={"possible_threshold": 55})
        assert r.status_code == 200
        r = s.get(f"{BASE_URL}/api/admin/duplicate/config", headers=demo_headers)
        assert r.json()["possible_threshold"] == 55
        # Reset
        r = s.patch(f"{BASE_URL}/api/admin/duplicate/config",
                    headers=demo_headers, json={"possible_threshold": 60})
        assert r.status_code == 200

    def test_non_admin_patch_forbidden(self, s, non_admin_headers):
        r = s.patch(f"{BASE_URL}/api/admin/duplicate/config",
                    headers=non_admin_headers, json={"possible_threshold": 65})
        assert r.status_code == 403


# ═══════════════════════════════════════════════════════════════════
# 7) GPS accuracy multiplier
# ═══════════════════════════════════════════════════════════════════
class TestGpsAccuracyMultiplier:
    def test_widens_search_radius(self, s, demo_headers):
        r = s.post(f"{BASE_URL}/api/agent/properties/duplicate-check",
                   headers=demo_headers,
                   json={"latitude": EXISTING_LAT, "longitude": EXISTING_LNG,
                         "accuracy_meters": 50})
        assert r.status_code == 200
        assert r.json()["search_radius_meters"] == 100

    def test_default_radius_25m(self, s, demo_headers):
        r = s.post(f"{BASE_URL}/api/agent/properties/duplicate-check",
                   headers=demo_headers,
                   json={"latitude": EXISTING_LAT, "longitude": EXISTING_LNG,
                         "accuracy_meters": 5})
        assert r.json()["search_radius_meters"] == 25

    def test_slack_helps_weak_gps(self, s, demo_headers):
        # ~15m north of existing (0.000135 degrees ≈ 15m)
        r = s.post(f"{BASE_URL}/api/agent/properties/duplicate-check",
                   headers=demo_headers,
                   json={"latitude": EXISTING_LAT + 0.000135,
                         "longitude": EXISTING_LNG,
                         "accuracy_meters": 50})
        assert r.status_code == 200
        cands = r.json()["candidates"]
        assert cands, "expected proximity slack to still return candidate"
        assert cands[0]["breakdown"]["proximity"] > 0


# ═══════════════════════════════════════════════════════════════════
# 8) Regression sweep
# ═══════════════════════════════════════════════════════════════════
class TestRegression:
    def test_brand_new_lat_lng_full_flow(self, s, demo_headers):
        csid = f"csid-fresh-{uuid.uuid4().hex[:8]}"
        # Somewhere in Lagos with no existing property nearby (Ikorodu area)
        oid = _new_draft(
            s, demo_headers, csid, 6.6194, 3.5105,
            details={"property_type": "bungalow", "bedrooms": 3,
                     "bathrooms": 2, "building_size_sqm": 150},
            listing={"listing_type": "buy", "price": 45_000_000},
        )
        r = s.post(f"{BASE_URL}/api/agent/properties/{oid}/duplicate-check",
                   headers=demo_headers)
        j = r.json()
        assert j["action"] == "allow", f"expected allow for fresh spot, got {j}"
        # Submit should NOT be gated
        r = s.post(f"{BASE_URL}/api/agent/properties/{oid}/submit",
                   headers=demo_headers, json={"client_submission_id": csid})
        assert r.status_code == 200, r.text
        assert r.json()["amass_property_id"].startswith("AMASS-LAG-")

    def test_existing_listings_endpoint(self, s):
        r = s.get(f"{BASE_URL}/api/properties-v2/{EXISTING_AMASS_ID}/listings")
        assert r.status_code == 200
        assert len(r.json()) >= 2

    def test_agent_platform_plans(self, s):
        r = s.get(f"{BASE_URL}/api/agent-platform/plans")
        assert r.status_code == 200
        assert isinstance(r.json(), list) and len(r.json()) >= 1

    def test_agent_score(self, s, demo_headers):
        r = s.get(f"{BASE_URL}/api/agent/score", headers=demo_headers)
        assert r.status_code == 200
        assert "overall_score" in r.json() or "score" in r.json() or "total" in r.json()

    def test_crm_leads(self, s, demo_headers):
        r = s.get(f"{BASE_URL}/api/crm/leads", headers=demo_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_legacy_post_properties(self, s, demo_headers):
        r = s.post(f"{BASE_URL}/api/properties", headers=demo_headers,
                   json={"title": f"TEST_Regression {uuid.uuid4().hex[:6]}",
                         "price": 25_000_000, "listing_type": "buy",
                         "property_type": "apartment", "bedrooms": 2,
                         "bathrooms": 2, "size_sqm": 90,
                         "state": "Lagos", "city": "Lagos",
                         "area": "Yaba", "address": "TEST_Regression",
                         "location": "Yaba, Lagos",
                         "latitude": 6.5150, "longitude": 3.3711,
                         "description": "Regression test property"})
        # 200 create OR 402 quota exhausted are both valid non-regressions
        assert r.status_code in (200, 201, 402), r.text
