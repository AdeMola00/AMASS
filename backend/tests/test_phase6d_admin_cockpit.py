"""AMASS Phase 6D — Admin Cockpit backend verification.

Tests /api/admin/cockpit/* endpoints:
  • Dashboard counters
  • Duplicate queue (with `needs_admin_review` flag propagation from wizard)
  • Compare + Merge (with listing/rep move, alias, audit)
  • Property verify/unverify
  • Audit logs (filters + cursor pagination)
  • Distinct audit actions list
  • is_admin flag on /api/auth/me

Uses the public preview URL and the demo admin account.
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE_URL = os.environ.get(
    "EXPO_BACKEND_URL",
    "https://property-os-africa.preview.emergentagent.com",
).rstrip("/")

DEMO_EMAIL = "demo@amass.africa"
DEMO_PASSWORD = "amass2026"


# ─── Fixtures ─────────────────────────────────────────────────────
@pytest.fixture(scope="module")
def s():
    return requests.Session()


@pytest.fixture(scope="module")
def admin_headers(s):
    r = s.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD},
    )
    assert r.status_code == 200, f"login failed {r.status_code} {r.text}"
    return {
        "Authorization": f"Bearer {r.json()['access_token']}",
        "Content-Type": "application/json",
    }


@pytest.fixture(scope="module")
def non_admin_headers(s):
    email = f"noadmin_{uuid.uuid4().hex[:8]}@example.com"
    r = s.post(
        f"{BASE_URL}/api/auth/register",
        json={"email": email, "password": "TestPass123", "full_name": "Non Admin"},
    )
    assert r.status_code == 200, r.text
    return {
        "Authorization": f"Bearer {r.json()['access_token']}",
        "Content-Type": "application/json",
    }


def _create_property(
    s, headers, lat, lng, csid=None, decision=None, same_as_amass_id=None,
    property_type="duplex", bedrooms=4, area="Lekki Phase 1",
):
    """Runs the wizard end-to-end. Returns response JSON from /submit."""
    csid = csid or f"csid-{uuid.uuid4().hex[:12]}"
    r = s.post(
        f"{BASE_URL}/api/agent/properties/onboarding",
        headers=headers,
        json={"client_submission_id": csid},
    )
    assert r.status_code == 200, r.text
    oid = r.json()["onboarding_id"]

    r = s.post(
        f"{BASE_URL}/api/agent/properties/{oid}/location",
        headers=headers,
        json={
            "location": {
                "latitude": lat,
                "longitude": lng,
                "accuracy_meters": 5,
                "location_source": "GPS",
            },
            "address": {
                "state": "Lagos",
                "lga": "Eti-Osa",
                "area": area,
                "street": "Admiralty Way",
            },
        },
    )
    assert r.status_code == 200, r.text

    r = s.patch(
        f"{BASE_URL}/api/agent/properties/{oid}",
        headers=headers,
        json={
            "details": {
                "property_type": property_type,
                "bedrooms": bedrooms,
                "bathrooms": bedrooms,
                "building_size_sqm": 300,
            },
            "listing": {
                "listing_type": "buy",
                "price": 50000000,
                "currency": "NGN",
                "representation_type": "agent",
            },
        },
    )
    assert r.status_code == 200, r.text

    # Optional: run duplicate check + record decision (needed for high_conf path)
    if decision is not None:
        r = s.post(
            f"{BASE_URL}/api/agent/properties/{oid}/duplicate-check",
            headers=headers,
        )
        assert r.status_code == 200, r.text
        payload = {
            "duplicate_decision": decision,
            "client_submission_id": csid,
        }
        if same_as_amass_id:
            payload["same_as_amass_id"] = same_as_amass_id
        if decision == "not_same_property":
            payload["not_same_reason"] = "Actually a different building"
        r = s.post(
            f"{BASE_URL}/api/agent/properties/{oid}/decision",
            headers=headers,
            json=payload,
        )
        assert r.status_code == 200, r.text

    r = s.post(
        f"{BASE_URL}/api/agent/properties/{oid}/submit",
        headers=headers,
        json={"client_submission_id": csid},
    )
    assert r.status_code == 200, f"submit failed {r.status_code} {r.text}"
    return r.json()


# ═══════════════════════════════════════════════════════════════════
# 0) AuthZ — non-admin blocked, unauthenticated blocked
# ═══════════════════════════════════════════════════════════════════
class TestAuthZ:
    def test_no_auth_dashboard(self, s):
        r = s.get(f"{BASE_URL}/api/admin/cockpit/dashboard")
        assert r.status_code in (401, 403), r.text

    def test_non_admin_dashboard(self, s, non_admin_headers):
        r = s.get(f"{BASE_URL}/api/admin/cockpit/dashboard", headers=non_admin_headers)
        assert r.status_code == 403, r.text

    def test_non_admin_queue(self, s, non_admin_headers):
        r = s.get(f"{BASE_URL}/api/admin/cockpit/duplicate-queue", headers=non_admin_headers)
        assert r.status_code == 403

    def test_non_admin_merge(self, s, non_admin_headers):
        r = s.post(
            f"{BASE_URL}/api/admin/cockpit/merge",
            headers=non_admin_headers,
            json={"winner_amass_id": "AMASS-LAG-00000001", "loser_amass_id": "AMASS-LAG-00000002"},
        )
        assert r.status_code == 403

    def test_non_admin_audit(self, s, non_admin_headers):
        r = s.get(f"{BASE_URL}/api/admin/cockpit/audit-logs", headers=non_admin_headers)
        assert r.status_code == 403


# ═══════════════════════════════════════════════════════════════════
# 1) /auth/me is_admin flag
# ═══════════════════════════════════════════════════════════════════
class TestIsAdminFlag:
    def test_demo_user_is_admin(self, s, admin_headers):
        r = s.get(f"{BASE_URL}/api/auth/me", headers=admin_headers)
        assert r.status_code == 200
        assert r.json().get("is_admin") is True

    def test_non_admin_user_flag_false(self, s, non_admin_headers):
        r = s.get(f"{BASE_URL}/api/auth/me", headers=non_admin_headers)
        assert r.status_code == 200
        assert r.json().get("is_admin") is False


# ═══════════════════════════════════════════════════════════════════
# 2) Dashboard counters
# ═══════════════════════════════════════════════════════════════════
class TestDashboard:
    def test_dashboard_fields(self, s, admin_headers):
        r = s.get(f"{BASE_URL}/api/admin/cockpit/dashboard", headers=admin_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in (
            "pending_duplicate_review",
            "pending_representations",
            "docs_requested",
            "total_properties",
            "total_listings",
            "merged_properties",
            "generated_at",
        ):
            assert k in d, f"missing key {k}"
        assert isinstance(d["total_properties"], int)
        # generated_at is ISO
        datetime.fromisoformat(d["generated_at"].replace("Z", "+00:00"))


# ═══════════════════════════════════════════════════════════════════
# 3) Wizard bypass → needs_admin_review flag → queue
# ═══════════════════════════════════════════════════════════════════
@pytest.fixture(scope="module")
def flagged_pair(s, admin_headers):
    """Create anchor A, then create B at same location with not_same_property
    decision (bypasses high-confidence duplicate) → B should be flagged."""
    # Use a unique location so we don't collide with other tests
    lat = 6.6200 + (uuid.uuid4().int % 100) * 0.0001
    lng = 3.3800 + (uuid.uuid4().int % 100) * 0.0001

    # First property — no duplicates expected
    a = _create_property(s, admin_headers, lat, lng, area="Ikeja GRA")
    assert a.get("amass_property_id")

    # Ensure high_confidence_threshold is low enough that our second
    # submission at the same lat/lng + same type triggers high_conf.
    # Default is 70; proximity=30 + type=5 + attributes=5 + address=10 = 50.
    # Set threshold to 50 for this test.
    r = s.patch(
        f"{BASE_URL}/api/admin/duplicate/config",
        headers=admin_headers,
        json={"high_confidence_threshold": 50, "possible_threshold": 45},
    )
    assert r.status_code == 200, r.text

    try:
        # Second property at *same* location, agent overrides with not_same_property
        b = _create_property(
            s, admin_headers, lat, lng,
            decision="not_same_property", area="Ikeja GRA",
        )
    finally:
        # Restore defaults
        s.patch(
            f"{BASE_URL}/api/admin/duplicate/config",
            headers=admin_headers,
            json={"high_confidence_threshold": 70, "possible_threshold": 45},
        )

    assert b.get("amass_property_id"), b
    # It must be a NEW property (not attached to existing)
    assert not b.get("attached_to_existing")
    assert b["amass_property_id"] != a["amass_property_id"]
    return {"a": a["amass_property_id"], "b": b["amass_property_id"]}


class TestFlaggedFromWizard:
    def test_flag_persisted_on_geo_doc(self, s, admin_headers, flagged_pair):
        # Look for the flagged property in the queue
        r = s.get(
            f"{BASE_URL}/api/admin/cockpit/duplicate-queue?limit=100",
            headers=admin_headers,
        )
        assert r.status_code == 200, r.text
        ids = [it["property"]["amass_property_id"] for it in r.json()["items"]]
        assert flagged_pair["b"] in ids, f"{flagged_pair['b']} not in queue: {ids}"

    def test_review_reason_and_score_on_flagged(self, s, admin_headers, flagged_pair):
        r = s.get(
            f"{BASE_URL}/api/admin/cockpit/duplicate-queue?limit=100",
            headers=admin_headers,
        )
        items = {it["property"]["amass_property_id"]: it for it in r.json()["items"]}
        p = items[flagged_pair["b"]]["property"]
        assert p.get("review_reason") is not None
        assert isinstance(p.get("duplicate_score_at_creation"), int)
        assert p["duplicate_score_at_creation"] >= 50

    def test_queue_candidates_include_anchor(self, s, admin_headers, flagged_pair):
        r = s.get(
            f"{BASE_URL}/api/admin/cockpit/duplicate-queue?limit=100",
            headers=admin_headers,
        )
        items = {it["property"]["amass_property_id"]: it for it in r.json()["items"]}
        cand_ids = [c["amass_property_id"] for c in items[flagged_pair["b"]]["candidates"]]
        assert flagged_pair["a"] in cand_ids, f"anchor {flagged_pair['a']} missing from candidates: {cand_ids}"


# ═══════════════════════════════════════════════════════════════════
# 4) Decide endpoint (clear + flag_for_merge)
# ═══════════════════════════════════════════════════════════════════
class TestDecideDuplicate:
    def test_flag_for_merge_requires_target(self, s, admin_headers, flagged_pair):
        r = s.post(
            f"{BASE_URL}/api/admin/cockpit/duplicate-queue/{flagged_pair['b']}/decide",
            headers=admin_headers,
            json={"action": "flag_for_merge"},
        )
        assert r.status_code == 400, r.text

    def test_flag_for_merge_ok(self, s, admin_headers, flagged_pair):
        r = s.post(
            f"{BASE_URL}/api/admin/cockpit/duplicate-queue/{flagged_pair['b']}/decide",
            headers=admin_headers,
            json={"action": "flag_for_merge", "merge_with_amass_id": flagged_pair["a"]},
        )
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "flagged_for_merge"
        # Audit written
        r = s.get(
            f"{BASE_URL}/api/admin/cockpit/audit-logs?action=DUPLICATE_FLAGGED_FOR_MERGE&limit=50",
            headers=admin_headers,
        )
        assert r.status_code == 200
        assert len(r.json()["items"]) >= 1

    def test_clear_removes_flag(self, s, admin_headers, flagged_pair):
        # Create a fresh flagged pair to clear (independent from previous test)
        r = s.patch(
            f"{BASE_URL}/api/admin/duplicate/config",
            headers=admin_headers,
            json={"high_confidence_threshold": 50, "possible_threshold": 45},
        )
        assert r.status_code == 200
        lat = 6.5400 + (uuid.uuid4().int % 100) * 0.0001
        lng = 3.3600 + (uuid.uuid4().int % 100) * 0.0001
        _create_property(s, admin_headers, lat, lng, area="Yaba")
        try:
            b = _create_property(
                s, admin_headers, lat, lng,
                decision="not_same_property", area="Yaba",
            )
        finally:
            s.patch(
                f"{BASE_URL}/api/admin/duplicate/config",
                headers=admin_headers,
                json={"high_confidence_threshold": 70, "possible_threshold": 45},
            )
        bid = b["amass_property_id"]
        r = s.post(
            f"{BASE_URL}/api/admin/cockpit/duplicate-queue/{bid}/decide",
            headers=admin_headers,
            json={"action": "clear", "reason": "manual review OK"},
        )
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "cleared"

        # Should disappear from queue
        r = s.get(
            f"{BASE_URL}/api/admin/cockpit/duplicate-queue?limit=200",
            headers=admin_headers,
        )
        ids = [it["property"]["amass_property_id"] for it in r.json()["items"]]
        assert bid not in ids
        # Audit written
        r = s.get(
            f"{BASE_URL}/api/admin/cockpit/audit-logs?action=DUPLICATE_REVIEW_CLEARED&limit=50",
            headers=admin_headers,
        )
        assert any(row.get("reason") == "manual review OK" for row in r.json()["items"])

    def test_decide_404_on_unknown(self, s, admin_headers):
        r = s.post(
            f"{BASE_URL}/api/admin/cockpit/duplicate-queue/AMASS-XXX-99999999/decide",
            headers=admin_headers,
            json={"action": "clear"},
        )
        assert r.status_code == 404


# ═══════════════════════════════════════════════════════════════════
# 5) Compare
# ═══════════════════════════════════════════════════════════════════
class TestCompare:
    def test_compare_ok(self, s, admin_headers, flagged_pair):
        r = s.get(
            f"{BASE_URL}/api/admin/cockpit/compare",
            headers=admin_headers,
            params={"a": flagged_pair["a"], "b": flagged_pair["b"]},
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["a"]["amass_property_id"] == flagged_pair["a"]
        assert d["b"]["amass_property_id"] == flagged_pair["b"]
        assert "listings_count" in d["a"] and "representations_count" in d["a"]
        assert d["a"]["listings_count"] >= 1

    def test_compare_404(self, s, admin_headers, flagged_pair):
        r = s.get(
            f"{BASE_URL}/api/admin/cockpit/compare",
            headers=admin_headers,
            params={"a": flagged_pair["a"], "b": "AMASS-XXX-99999999"},
        )
        assert r.status_code == 404


# ═══════════════════════════════════════════════════════════════════
# 6) Merge — full flow
# ═══════════════════════════════════════════════════════════════════
@pytest.fixture(scope="module")
def merge_pair(s, admin_headers):
    """Two brand-new properties for merge lifecycle test."""
    lat = 6.4500 + (uuid.uuid4().int % 100) * 0.0001
    lng = 3.5000 + (uuid.uuid4().int % 100) * 0.0001
    winner = _create_property(s, admin_headers, lat, lng, area="Victoria Island")

    # Second property some meters away (so no duplicate blocking)
    lat2 = lat + 0.005  # ~500m
    lng2 = lng + 0.005
    loser = _create_property(s, admin_headers, lat2, lng2, area="Victoria Island")
    return {
        "winner": winner["amass_property_id"],
        "winner_uuid": winner["property_id"],
        "loser": loser["amass_property_id"],
        "loser_uuid": loser["property_id"],
        "loser_listing_id": loser["listing_id"],
    }


class TestMerge:
    def test_merge_same_id_400(self, s, admin_headers, merge_pair):
        r = s.post(
            f"{BASE_URL}/api/admin/cockpit/merge",
            headers=admin_headers,
            json={"winner_amass_id": merge_pair["winner"],
                  "loser_amass_id": merge_pair["winner"]},
        )
        assert r.status_code == 400

    def test_merge_missing_404(self, s, admin_headers, merge_pair):
        r = s.post(
            f"{BASE_URL}/api/admin/cockpit/merge",
            headers=admin_headers,
            json={"winner_amass_id": merge_pair["winner"],
                  "loser_amass_id": "AMASS-XXX-99999999"},
        )
        assert r.status_code == 404

    def test_merge_success_zzz(self, s, admin_headers, merge_pair):
        """z-prefixed to run after the 400/404 checks in class order."""
        r = s.post(
            f"{BASE_URL}/api/admin/cockpit/merge",
            headers=admin_headers,
            json={"winner_amass_id": merge_pair["winner"],
                  "loser_amass_id": merge_pair["loser"],
                  "reason": "duplicate physical property"},
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["ok"] is True
        assert d["listings_moved"] >= 1
        assert d["loser_aliased_into_winner"] is True

        # Winner has loser aliased
        r = s.get(f"{BASE_URL}/api/properties-v2/{merge_pair['winner']}")
        assert r.status_code == 200
        assert merge_pair["loser"] in (r.json().get("aliases") or [])

        # Loser's AMASS ID still resolves via alias to winner
        r = s.get(f"{BASE_URL}/api/properties-v2/{merge_pair['loser']}")
        assert r.status_code == 200
        assert r.json().get("resolved_via_alias") is True
        assert r.json()["amass_property_id"] == merge_pair["winner"]

        # Loser marked MERGED
        # (we peek via compare which returns physical_status)
        r = s.get(
            f"{BASE_URL}/api/admin/cockpit/compare",
            headers=admin_headers,
            params={"a": merge_pair["winner"], "b": merge_pair["loser"]},
        )
        assert r.status_code == 200
        assert r.json()["b"]["physical_status"] == "MERGED"
        assert r.json()["b"].get("merged_into_amass_id") == merge_pair["winner"]

        # Listing moved to winner
        r = s.get(f"{BASE_URL}/api/properties-v2/{merge_pair['winner']}/listings")
        assert r.status_code == 200
        ids = [l["id"] for l in r.json()]
        assert merge_pair["loser_listing_id"] in ids

        # Audit rows on BOTH properties
        r = s.get(
            f"{BASE_URL}/api/admin/cockpit/audit-logs",
            headers=admin_headers,
            params={"action": "PROPERTY_MERGED", "property_id": merge_pair["winner"], "limit": 20},
        )
        assert r.status_code == 200
        assert len(r.json()["items"]) >= 1
        r = s.get(
            f"{BASE_URL}/api/admin/cockpit/audit-logs",
            headers=admin_headers,
            params={"action": "PROPERTY_MERGED", "property_id": merge_pair["loser"], "limit": 20},
        )
        assert r.status_code == 200
        assert len(r.json()["items"]) >= 1

    def test_merge_already_merged_400(self, s, admin_headers, merge_pair):
        """Attempting to merge an already-merged loser again → 400."""
        r = s.post(
            f"{BASE_URL}/api/admin/cockpit/merge",
            headers=admin_headers,
            json={"winner_amass_id": merge_pair["winner"],
                  "loser_amass_id": merge_pair["loser"]},
        )
        # After the merge above, loser is MERGED
        assert r.status_code == 400, r.text


# ═══════════════════════════════════════════════════════════════════
# 7) Passport alias resolution after merge
# ═══════════════════════════════════════════════════════════════════
class TestPassportAliasAfterMerge:
    def test_passport_resolves_via_alias(self, s, merge_pair):
        r = s.get(f"{BASE_URL}/api/passport/{merge_pair['loser']}")
        # Phase 6C passport route
        if r.status_code == 404:
            pytest.skip("passport endpoint not present / unrelated to merge alias")
        assert r.status_code == 200, r.text
        body = r.json()
        # Passport should canonically show winner amass id (or contain it somewhere)
        canonical = body.get("amass_property_id") or (body.get("property") or {}).get("amass_property_id")
        assert canonical == merge_pair["winner"], f"passport did not resolve to winner: {body}"


# ═══════════════════════════════════════════════════════════════════
# 8) Verify / Unverify
# ═══════════════════════════════════════════════════════════════════
@pytest.fixture(scope="module")
def verify_target(s, admin_headers):
    lat = 6.4700 + (uuid.uuid4().int % 100) * 0.0001
    lng = 3.5300 + (uuid.uuid4().int % 100) * 0.0001
    p = _create_property(s, admin_headers, lat, lng, area="Ikoyi")
    return p["amass_property_id"]


class TestVerify:
    def test_verify_sets_status(self, s, admin_headers, verify_target):
        r = s.post(
            f"{BASE_URL}/api/admin/cockpit/property/{verify_target}/verify",
            headers=admin_headers,
            json={"action": "verify", "reason": "docs confirmed"},
        )
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "VERIFIED"
        r = s.get(f"{BASE_URL}/api/properties-v2/{verify_target}")
        assert r.json()["property_identity_status"] == "VERIFIED"

        # Audit
        r = s.get(
            f"{BASE_URL}/api/admin/cockpit/audit-logs",
            headers=admin_headers,
            params={"action": "PROPERTY_VERIFIED", "property_id": verify_target},
        )
        assert len(r.json()["items"]) >= 1

    def test_unverify_reverts(self, s, admin_headers, verify_target):
        r = s.post(
            f"{BASE_URL}/api/admin/cockpit/property/{verify_target}/verify",
            headers=admin_headers,
            json={"action": "unverify", "reason": "docs invalid"},
        )
        assert r.status_code == 200
        assert r.json()["status"] == "PENDING_REVIEW"
        r = s.get(f"{BASE_URL}/api/properties-v2/{verify_target}")
        assert r.json()["property_identity_status"] == "PENDING_REVIEW"

        r = s.get(
            f"{BASE_URL}/api/admin/cockpit/audit-logs",
            headers=admin_headers,
            params={"action": "PROPERTY_UNVERIFIED", "property_id": verify_target},
        )
        assert len(r.json()["items"]) >= 1

    def test_verify_404(self, s, admin_headers):
        r = s.post(
            f"{BASE_URL}/api/admin/cockpit/property/AMASS-XXX-99999999/verify",
            headers=admin_headers,
            json={"action": "verify"},
        )
        assert r.status_code == 404


# ═══════════════════════════════════════════════════════════════════
# 9) Audit logs — filters + pagination
# ═══════════════════════════════════════════════════════════════════
class TestAuditLogs:
    def test_actions_list(self, s, admin_headers):
        r = s.get(f"{BASE_URL}/api/admin/cockpit/audit-logs/actions", headers=admin_headers)
        assert r.status_code == 200, r.text
        actions = r.json()
        assert isinstance(actions, list)
        # At least the actions we've triggered in this suite
        for a in ("PROPERTY_CREATED", "PROPERTY_MERGED", "PROPERTY_VERIFIED"):
            assert a in actions, f"missing {a} in {actions}"

    def test_default_paginated(self, s, admin_headers):
        r = s.get(f"{BASE_URL}/api/admin/cockpit/audit-logs?limit=5", headers=admin_headers)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data["items"], list)
        assert len(data["items"]) <= 5
        # Since we've created lots of audits in this suite we expect a cursor
        if len(data["items"]) == 5:
            assert data.get("next_cursor")

    def test_cursor_pagination(self, s, admin_headers):
        r = s.get(f"{BASE_URL}/api/admin/cockpit/audit-logs?limit=3", headers=admin_headers)
        d1 = r.json()
        if not d1.get("next_cursor"):
            pytest.skip("not enough audit rows to paginate")
        r = s.get(
            f"{BASE_URL}/api/admin/cockpit/audit-logs",
            headers=admin_headers,
            params={"limit": 3, "cursor": d1["next_cursor"]},
        )
        assert r.status_code == 200
        d2 = r.json()
        ids1 = {it["id"] for it in d1["items"]}
        ids2 = {it["id"] for it in d2["items"]}
        assert ids1.isdisjoint(ids2), "cursor pagination overlapping"

    def test_filter_by_action(self, s, admin_headers):
        r = s.get(
            f"{BASE_URL}/api/admin/cockpit/audit-logs",
            headers=admin_headers,
            params={"action": "PROPERTY_MERGED", "limit": 20},
        )
        assert r.status_code == 200
        for row in r.json()["items"]:
            assert row["action"] == "PROPERTY_MERGED"

    def test_filter_by_actor_type_admin(self, s, admin_headers):
        r = s.get(
            f"{BASE_URL}/api/admin/cockpit/audit-logs",
            headers=admin_headers,
            params={"actor_type": "admin", "limit": 20},
        )
        assert r.status_code == 200
        for row in r.json()["items"]:
            assert row["actor_type"] == "admin"

    def test_filter_by_property_id_amass_form(self, s, admin_headers, verify_target):
        r = s.get(
            f"{BASE_URL}/api/admin/cockpit/audit-logs",
            headers=admin_headers,
            params={"property_id": verify_target, "limit": 20},
        )
        assert r.status_code == 200
        assert len(r.json()["items"]) >= 1

    def test_filter_by_property_id_uuid_form(self, s, admin_headers, merge_pair):
        r = s.get(
            f"{BASE_URL}/api/admin/cockpit/audit-logs",
            headers=admin_headers,
            params={"property_id": merge_pair["winner_uuid"], "limit": 20},
        )
        assert r.status_code == 200
        # every returned row should share this property_id
        for row in r.json()["items"]:
            assert row["property_id"] == merge_pair["winner_uuid"]

    def test_filter_since_until(self, s, admin_headers):
        now = datetime.now(timezone.utc)
        since = (now - timedelta(hours=1)).isoformat()
        until = (now + timedelta(minutes=1)).isoformat()
        r = s.get(
            f"{BASE_URL}/api/admin/cockpit/audit-logs",
            headers=admin_headers,
            params={"since": since, "until": until, "limit": 50},
        )
        assert r.status_code == 200
        assert len(r.json()["items"]) >= 1

    def test_bad_since_400(self, s, admin_headers):
        r = s.get(
            f"{BASE_URL}/api/admin/cockpit/audit-logs",
            headers=admin_headers,
            params={"since": "not-a-date"},
        )
        assert r.status_code == 400

    def test_bad_until_400(self, s, admin_headers):
        r = s.get(
            f"{BASE_URL}/api/admin/cockpit/audit-logs",
            headers=admin_headers,
            params={"until": "not-a-date"},
        )
        assert r.status_code == 400

    def test_unknown_amass_id_returns_empty(self, s, admin_headers):
        r = s.get(
            f"{BASE_URL}/api/admin/cockpit/audit-logs",
            headers=admin_headers,
            params={"property_id": "AMASS-XXX-99999999"},
        )
        assert r.status_code == 200
        assert r.json()["items"] == []
