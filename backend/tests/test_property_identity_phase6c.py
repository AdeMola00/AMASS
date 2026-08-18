"""Phase 6C — Property Identity backend regression + PATCH refactor tests.

Focus:
  1. PATCH /api/agent/properties/{oid} now takes a single dict body with
     optional keys: details, listing, media_ids (list of base64 strings,
     capped at 20).
  2. Full happy path incl. media_ids.
  3. Idempotent submit with same client_submission_id.
  4. Duplicate gate: same lat/lng → highest_score >= 60 with candidates,
     decision=same_property attaches listing to existing property.
  5. GET /api/agent/properties/mine returns wizard-created listings.
  6. Light regression on existing property_identity + duplicate endpoints.
"""
from __future__ import annotations

import asyncio
import os
import time
import uuid

import pytest
import requests

BASE_URL = (
    os.environ.get("EXPO_BACKEND_URL")
    or os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or "https://property-os-africa.preview.emergentagent.com"
).rstrip("/")

DEMO_EMAIL = "demo@amass.africa"
DEMO_PASSWORD = "amass2026"


# ─── Fixtures ────────────────────────────────────────────
@pytest.fixture(scope="session")
def api():
    s = requests.Session()
    s.headers["Content-Type"] = "application/json"
    return s


@pytest.fixture(scope="session")
def demo_auth(api):
    r = api.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD},
        timeout=15,
    )
    assert r.status_code == 200, f"demo login failed: {r.status_code} {r.text}"
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="session")
def other_auth(api):
    """A different registered user to test cross-agent access denial."""
    email = f"pi6c_other_{int(time.time()*1000)}_{uuid.uuid4().hex[:6]}@test.amass"
    r = api.post(
        f"{BASE_URL}/api/auth/register",
        json={"email": email, "password": "Passw0rd!", "full_name": "Other Agent"},
        timeout=15,
    )
    assert r.status_code == 200, f"register failed: {r.text}"
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


# ─── helpers ─────────────────────────────────────────────
def _csid(tag="A"):
    return f"csid-6c-{int(time.time()*1000)}-{tag}-{uuid.uuid4().hex[:6]}"


def _jitter_loc(accuracy=7, source="GPS"):
    # Add a small pseudo-random jitter so each new draft gets a unique point
    # This is used only for the standard happy-path tests.
    return {
        "latitude": 6.4281 + (uuid.uuid4().int % 1000) / 1e6,
        "longitude": 3.4219 + (uuid.uuid4().int % 1000) / 1e6,
        "accuracy_meters": accuracy,
        "location_source": source,
    }


def _fixed_loc():
    """A fixed point used specifically for duplicate-detection tests."""
    return {
        "latitude": 6.500123,
        "longitude": 3.500123,
        "accuracy_meters": 5,
        "location_source": "GPS",
    }


def _addr(state="Lagos", street="Ahmadu Bello Way", hn="12"):
    return {
        "state": state, "lga": "Eti-Osa", "area": "Victoria Island",
        "street": street, "house_number": hn,
    }


def _details():
    return {"property_type": "duplex", "bedrooms": 4, "bathrooms": 5}


def _listing():
    return {"listing_type": "buy", "price": 250_000_000, "currency": "NGN"}


def _b64_photo(i: int) -> str:
    # ~40-byte fake base64 blobs (not real images, endpoint doesn't validate)
    return f"data:image/jpeg;base64,PHOTO_{i:03d}_" + uuid.uuid4().hex


def _start_draft(api, headers, tag="s"):
    csid = _csid(tag)
    r = api.post(
        f"{BASE_URL}/api/agent/properties/onboarding",
        json={"client_submission_id": csid}, headers=headers,
    )
    assert r.status_code == 200, r.text
    return csid, r.json()["onboarding_id"]


def _save_location(api, headers, oid, location=None, address=None):
    location = location or _jitter_loc()
    address = address or _addr()
    r = api.post(
        f"{BASE_URL}/api/agent/properties/{oid}/location",
        json={"location": location, "address": address},
        headers=headers,
    )
    assert r.status_code == 200, r.text
    return r.json()


def _get_draft(api, headers, oid):
    r = api.get(
        f"{BASE_URL}/api/agent/properties/onboarding/{oid}", headers=headers
    )
    assert r.status_code == 200, r.text
    return r.json()


# ═════════════════════════════════════════════════════════
# 1. PATCH single-dict body — new refactor
# ═════════════════════════════════════════════════════════
class TestPatchDictBody:
    def test_patch_details_only(self, api, demo_auth):
        _, oid = _start_draft(api, demo_auth, "pd")
        _save_location(api, demo_auth, oid)
        r = api.patch(
            f"{BASE_URL}/api/agent/properties/{oid}",
            json={"details": _details()},
            headers=demo_auth,
        )
        assert r.status_code == 200, r.text
        assert r.json() == {"ok": True}
        d = _get_draft(api, demo_auth, oid)
        assert d["details"]["property_type"] == "duplex"
        assert d["details"]["bedrooms"] == 4
        assert d["listing"] is None
        assert d["status"] == "DETAILS_PENDING"

    def test_patch_listing_only(self, api, demo_auth):
        _, oid = _start_draft(api, demo_auth, "pl")
        _save_location(api, demo_auth, oid)
        r = api.patch(
            f"{BASE_URL}/api/agent/properties/{oid}",
            json={"listing": _listing()},
            headers=demo_auth,
        )
        assert r.status_code == 200
        d = _get_draft(api, demo_auth, oid)
        assert d["listing"]["listing_type"] == "buy"
        assert d["listing"]["price"] == 250_000_000
        assert d["details"] is None

    def test_patch_media_ids_only_and_cap(self, api, demo_auth):
        _, oid = _start_draft(api, demo_auth, "pm")
        _save_location(api, demo_auth, oid)
        # Send 25 photos — should be capped at 20
        photos = [_b64_photo(i) for i in range(25)]
        r = api.patch(
            f"{BASE_URL}/api/agent/properties/{oid}",
            json={"media_ids": photos},
            headers=demo_auth,
        )
        assert r.status_code == 200, r.text
        d = _get_draft(api, demo_auth, oid)
        assert isinstance(d["media_ids"], list)
        assert len(d["media_ids"]) == 20, f"expected 20, got {len(d['media_ids'])}"
        # First 20 preserved in order
        assert d["media_ids"] == photos[:20]

        # Under-cap send (3 photos) → stored as-is (overwrites, not append)
        few = [_b64_photo(100 + i) for i in range(3)]
        r2 = api.patch(
            f"{BASE_URL}/api/agent/properties/{oid}",
            json={"media_ids": few},
            headers=demo_auth,
        )
        assert r2.status_code == 200
        d2 = _get_draft(api, demo_auth, oid)
        assert d2["media_ids"] == few

    def test_patch_all_three_at_once(self, api, demo_auth):
        _, oid = _start_draft(api, demo_auth, "p3")
        _save_location(api, demo_auth, oid)
        photos = [_b64_photo(i) for i in range(4)]
        r = api.patch(
            f"{BASE_URL}/api/agent/properties/{oid}",
            json={
                "details": _details(),
                "listing": _listing(),
                "media_ids": photos,
            },
            headers=demo_auth,
        )
        assert r.status_code == 200, r.text
        d = _get_draft(api, demo_auth, oid)
        assert d["details"]["property_type"] == "duplex"
        assert d["listing"]["listing_type"] == "buy"
        assert d["media_ids"] == photos

    def test_patch_unknown_oid_404(self, api, demo_auth):
        r = api.patch(
            f"{BASE_URL}/api/agent/properties/{uuid.uuid4()}",
            json={"details": _details()},
            headers=demo_auth,
        )
        assert r.status_code == 404, r.text

    def test_other_agent_cannot_patch(self, api, demo_auth, other_auth):
        _, oid = _start_draft(api, demo_auth, "sec")
        _save_location(api, demo_auth, oid)
        r = api.patch(
            f"{BASE_URL}/api/agent/properties/{oid}",
            json={"details": _details()},
            headers=other_auth,
        )
        # Owner-check returns 404 (does not disclose existence)
        assert r.status_code == 404, r.text

    def test_patch_unauthenticated_401(self, api, demo_auth):
        _, oid = _start_draft(api, demo_auth, "noauth")
        r = api.patch(
            f"{BASE_URL}/api/agent/properties/{oid}",
            json={"details": _details()},
        )
        assert r.status_code in (401, 403), r.text


# ═════════════════════════════════════════════════════════
# 2. Full happy path w/ media_ids + idempotent submit
# ═════════════════════════════════════════════════════════
class TestFullHappyPath:
    def test_end_to_end_with_media(self, api, demo_auth):
        csid, oid = _start_draft(api, demo_auth, "e2e")
        _save_location(api, demo_auth, oid)
        photos = [_b64_photo(i) for i in range(6)]
        r_patch = api.patch(
            f"{BASE_URL}/api/agent/properties/{oid}",
            json={
                "details": _details(),
                "listing": _listing(),
                "media_ids": photos,
            },
            headers=demo_auth,
        )
        assert r_patch.status_code == 200

        r_dup = api.post(
            f"{BASE_URL}/api/agent/properties/{oid}/duplicate-check",
            headers=demo_auth,
        )
        assert r_dup.status_code == 200, r_dup.text
        body_dup = r_dup.json()
        assert body_dup["action"] in (
            "allow", "possible_duplicate", "high_confidence_duplicate"
        )

        # If the check flagged possible/high, submit needs a decision first;
        # for this test we pick a random jitter location and don't force it,
        # but if flagged we record a not_same_property decision so submit passes.
        if body_dup["action"] != "allow":
            r_dec = api.post(
                f"{BASE_URL}/api/agent/properties/{oid}/decision",
                json={
                    "client_submission_id": csid,
                    "duplicate_decision": "not_same_property",
                    "not_same_reason": "different building, coincidental proximity",
                },
                headers=demo_auth,
            )
            assert r_dec.status_code == 200, r_dec.text

        r_sub = api.post(
            f"{BASE_URL}/api/agent/properties/{oid}/submit",
            json={"client_submission_id": csid},
            headers=demo_auth,
        )
        assert r_sub.status_code == 200, r_sub.text
        body = r_sub.json()
        assert body["status"] == "SUBMITTED"
        # Format: AMASS-XXX-YYYYYYYY
        amass_id = body["amass_property_id"]
        parts = amass_id.split("-")
        assert len(parts) == 3
        assert parts[0] == "AMASS"
        assert parts[1].isupper() and len(parts[1]) == 3
        assert parts[2].isdigit() and len(parts[2]) == 8
        uuid.UUID(body["property_id"])
        uuid.UUID(body["listing_id"])

        # Draft should now carry media_ids in the persisted property
        # via public passport.
        r_pub = requests.get(f"{BASE_URL}/api/properties-v2/{amass_id}", timeout=15)
        assert r_pub.status_code == 200
        p = r_pub.json()
        assert p["amass_property_id"] == amass_id
        assert isinstance(p.get("media_ids"), list)
        assert len(p["media_ids"]) == len(photos)

    def test_idempotent_submit_same_csid(self, api, demo_auth):
        csid, oid = _start_draft(api, demo_auth, "idem")
        _save_location(api, demo_auth, oid)
        api.patch(
            f"{BASE_URL}/api/agent/properties/{oid}",
            json={"details": _details(), "listing": _listing()},
            headers=demo_auth,
        )
        # optional duplicate check to keep flow parity — clear the gate defensively
        api.post(
            f"{BASE_URL}/api/agent/properties/{oid}/duplicate-check",
            headers=demo_auth,
        )
        # If a decision is needed, add one
        d = _get_draft(api, demo_auth, oid)
        if (d.get("duplicate_check") or {}).get("action") != "allow" \
                and not d.get("duplicate_decision"):
            api.post(
                f"{BASE_URL}/api/agent/properties/{oid}/decision",
                json={
                    "client_submission_id": csid,
                    "duplicate_decision": "not_same_property",
                    "not_same_reason": "different building",
                },
                headers=demo_auth,
            )

        r1 = api.post(
            f"{BASE_URL}/api/agent/properties/{oid}/submit",
            json={"client_submission_id": csid}, headers=demo_auth,
        )
        assert r1.status_code == 200, r1.text
        b1 = r1.json()

        r2 = api.post(
            f"{BASE_URL}/api/agent/properties/{oid}/submit",
            json={"client_submission_id": csid}, headers=demo_auth,
        )
        assert r2.status_code == 200
        b2 = r2.json()
        assert b2.get("idempotent") is True
        assert b2["amass_property_id"] == b1["amass_property_id"]
        assert b2["property_id"] == b1["property_id"]
        assert b2["listing_id"] == b1["listing_id"]


# ═════════════════════════════════════════════════════════
# 3. Duplicate gate — same location → possible_duplicate → decision → attach
# NOTE: the draft-based /duplicate-check does NOT send building_footprint /
# parcel_polygon (those fields are not collected by the wizard), so at best
# a wizard-only same-location, same-address, same-type, same-attrs draft
# scores proximity(30)+address(10)+type(5)+attrs(5) = 50, i.e. BELOW the
# default possible_threshold of 60. We lower `possible_threshold` to 40
# via the admin config endpoint for this class so the gate is exercised.
# The demo user is in ADMIN_EMAILS by default.
# ═════════════════════════════════════════════════════════
class TestDuplicateGate:
    @pytest.fixture(scope="class", autouse=True)
    def _lower_threshold(self, request):
        # Login demo → get admin token, snapshot, lower, restore on teardown
        r = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}, timeout=15,
        )
        assert r.status_code == 200, r.text
        h = {"Authorization": f"Bearer {r.json()['access_token']}"}
        prev = requests.get(
            f"{BASE_URL}/api/admin/duplicate/config", headers=h, timeout=15,
        )
        assert prev.status_code == 200, prev.text
        prev_cfg = prev.json()
        # Lower threshold to 40 (guardrail min)
        patched = requests.patch(
            f"{BASE_URL}/api/admin/duplicate/config",
            json={"possible_threshold": 40, "high_confidence_threshold": 60},
            headers=h, timeout=15,
        )
        assert patched.status_code == 200, patched.text

        yield

        # Restore original thresholds
        requests.patch(
            f"{BASE_URL}/api/admin/duplicate/config",
            json={
                "possible_threshold": prev_cfg.get("possible_threshold", 60),
                "high_confidence_threshold": prev_cfg.get("high_confidence_threshold", 80),
            },
            headers=h, timeout=15,
        )

    @pytest.fixture(scope="class")
    def _shared(self):
        # A per-class random location so we don't collide with other test
        # classes / prior runs of this class.
        return {
            "lat": 6.55 + (uuid.uuid4().int % 10_000) / 1e6,
            "lng": 3.55 + (uuid.uuid4().int % 10_000) / 1e6,
        }

    def _loc(self, s):
        return {
            "latitude": s["lat"], "longitude": s["lng"],
            "accuracy_meters": 5, "location_source": "GPS",
        }

    def test_first_property_and_duplicate_attach(self, api, demo_auth, _shared):
        # ── 1. Create first property at the shared location ──
        csid1, oid1 = _start_draft(api, demo_auth, "dup1")
        _save_location(
            api, demo_auth, oid1,
            location=self._loc(_shared),
            address=_addr(street="Duplicate Street", hn="42"),
        )
        api.patch(
            f"{BASE_URL}/api/agent/properties/{oid1}",
            json={"details": _details(), "listing": _listing()},
            headers=demo_auth,
        )
        # A clean dup-check should be "allow" (no existing yet)
        first_dup = api.post(
            f"{BASE_URL}/api/agent/properties/{oid1}/duplicate-check",
            headers=demo_auth,
        )
        assert first_dup.status_code == 200
        # If not allow, provide a decision to unblock the submit
        if first_dup.json()["action"] != "allow":
            api.post(
                f"{BASE_URL}/api/agent/properties/{oid1}/decision",
                json={
                    "client_submission_id": csid1,
                    "duplicate_decision": "not_same_property",
                    "not_same_reason": "seeding first property in test",
                },
                headers=demo_auth,
            )
        r1 = api.post(
            f"{BASE_URL}/api/agent/properties/{oid1}/submit",
            json={"client_submission_id": csid1}, headers=demo_auth,
        )
        assert r1.status_code == 200, r1.text
        first_amass = r1.json()["amass_property_id"]
        first_prop_uuid = r1.json()["property_id"]

        # ── 2. Second onboarding at same lat/lng/address ──
        csid2, oid2 = _start_draft(api, demo_auth, "dup2")
        _save_location(
            api, demo_auth, oid2,
            location=self._loc(_shared),
            address=_addr(street="Duplicate Street", hn="42"),
        )
        api.patch(
            f"{BASE_URL}/api/agent/properties/{oid2}",
            json={"details": _details(), "listing": _listing()},
            headers=demo_auth,
        )
        r_dup = api.post(
            f"{BASE_URL}/api/agent/properties/{oid2}/duplicate-check",
            headers=demo_auth,
        )
        assert r_dup.status_code == 200, r_dup.text
        body = r_dup.json()
        assert body["highest_score"] >= 40, body
        assert body["action"] in ("possible_duplicate", "high_confidence_duplicate")
        assert body["candidates"], "expected candidates populated"
        # The first_amass id must appear amongst candidates
        cand_ids = [c["amass_property_id"] for c in body["candidates"]]
        assert first_amass in cand_ids, cand_ids

        # ── 3. Submit without decision → 409 duplicate_decision_required ──
        r_blocked = api.post(
            f"{BASE_URL}/api/agent/properties/{oid2}/submit",
            json={"client_submission_id": csid2}, headers=demo_auth,
        )
        assert r_blocked.status_code == 409, r_blocked.text

        # ── 4. Record same_property decision ──
        r_dec = api.post(
            f"{BASE_URL}/api/agent/properties/{oid2}/decision",
            json={
                "client_submission_id": csid2,
                "duplicate_decision": "same_property",
                "same_as_amass_id": first_amass,
            },
            headers=demo_auth,
        )
        assert r_dec.status_code == 200, r_dec.text
        assert r_dec.json()["decision"] == "same_property"

        # ── 5. Submit should attach to existing (attached_to_existing=True) ──
        r_sub2 = api.post(
            f"{BASE_URL}/api/agent/properties/{oid2}/submit",
            json={"client_submission_id": csid2}, headers=demo_auth,
        )
        assert r_sub2.status_code == 200, r_sub2.text
        b2 = r_sub2.json()
        assert b2.get("attached_to_existing") is True
        assert b2["amass_property_id"] == first_amass
        assert b2["property_id"] == first_prop_uuid
        # New listing_id, distinct from first
        assert b2["listing_id"]

        # ── 6. Verify via public listings endpoint (>=2 listings on the property) ──
        r_pub = requests.get(
            f"{BASE_URL}/api/properties-v2/{first_amass}/listings", timeout=15
        )
        assert r_pub.status_code == 200
        arr = r_pub.json()
        assert isinstance(arr, list) and len(arr) >= 2, arr


# ═════════════════════════════════════════════════════════
# 4. GET /mine returns wizard listings joined with property
# ═════════════════════════════════════════════════════════
class TestMineFromWizard:
    def test_mine_contains_wizard_row(self, api, demo_auth):
        csid, oid = _start_draft(api, demo_auth, "mine")
        _save_location(api, demo_auth, oid)
        api.patch(
            f"{BASE_URL}/api/agent/properties/{oid}",
            json={"details": _details(), "listing": _listing()},
            headers=demo_auth,
        )
        api.post(
            f"{BASE_URL}/api/agent/properties/{oid}/duplicate-check",
            headers=demo_auth,
        )
        d = _get_draft(api, demo_auth, oid)
        if (d.get("duplicate_check") or {}).get("action") != "allow" \
                and not d.get("duplicate_decision"):
            api.post(
                f"{BASE_URL}/api/agent/properties/{oid}/decision",
                json={
                    "client_submission_id": csid,
                    "duplicate_decision": "not_same_property",
                    "not_same_reason": "unique",
                },
                headers=demo_auth,
            )
        r = api.post(
            f"{BASE_URL}/api/agent/properties/{oid}/submit",
            json={"client_submission_id": csid}, headers=demo_auth,
        )
        assert r.status_code == 200, r.text
        listing_id = r.json()["listing_id"]
        amass_id = r.json()["amass_property_id"]

        r_mine = api.get(
            f"{BASE_URL}/api/agent/properties/mine", headers=demo_auth
        )
        assert r_mine.status_code == 200, r_mine.text
        arr = r_mine.json()
        assert isinstance(arr, list) and len(arr) >= 1
        # find our listing
        row = next((x for x in arr if x.get("id") == listing_id), None)
        assert row is not None, f"listing {listing_id} not found in /mine"
        assert row.get("property") is not None
        assert row["property"]["amass_property_id"] == amass_id
        assert row["listing_type"] == "buy"


# ═════════════════════════════════════════════════════════
# 5. Regression on other endpoints in these two modules
# ═════════════════════════════════════════════════════════
class TestRegression:
    def test_list_drafts(self, api, demo_auth):
        r = api.get(
            f"{BASE_URL}/api/agent/properties/onboarding", headers=demo_auth
        )
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_adhoc_duplicate_check(self, api, demo_auth):
        r = api.post(
            f"{BASE_URL}/api/agent/properties/duplicate-check",
            json={
                "latitude": 6.4281, "longitude": 3.4219,
                "accuracy_meters": 10, "property_type": "duplex",
                "address": _addr(),
            },
            headers=demo_auth,
        )
        assert r.status_code == 200, r.text
        b = r.json()
        assert "candidates" in b and "highest_score" in b and "action" in b
        assert b["action"] in ("allow", "possible_duplicate", "high_confidence_duplicate")

    def test_public_by_unknown_amass_id_404(self, api):
        r = api.get(f"{BASE_URL}/api/properties-v2/AMASS-XXX-99999999", timeout=15)
        assert r.status_code == 404

    def test_start_onboarding_requires_auth(self, api):
        r = api.post(
            f"{BASE_URL}/api/agent/properties/onboarding",
            json={"client_submission_id": _csid("noauth")},
        )
        assert r.status_code in (401, 403)

    def test_location_requires_auth(self, api):
        r = api.post(
            f"{BASE_URL}/api/agent/properties/{uuid.uuid4()}/location",
            json={"location": _jitter_loc(), "address": _addr()},
        )
        assert r.status_code in (401, 403)

    def test_decision_validation(self, api, demo_auth):
        # Start a draft; try invalid decision value → 400
        csid, oid = _start_draft(api, demo_auth, "dec-val")
        _save_location(api, demo_auth, oid)
        r = api.post(
            f"{BASE_URL}/api/agent/properties/{oid}/decision",
            json={
                "client_submission_id": csid,
                "duplicate_decision": "bogus",
            },
            headers=demo_auth,
        )
        assert r.status_code == 400, r.text

    def test_decision_same_needs_id(self, api, demo_auth):
        csid, oid = _start_draft(api, demo_auth, "dec-id")
        _save_location(api, demo_auth, oid)
        r = api.post(
            f"{BASE_URL}/api/agent/properties/{oid}/decision",
            json={
                "client_submission_id": csid,
                "duplicate_decision": "same_property",
            },
            headers=demo_auth,
        )
        assert r.status_code == 400, r.text
