"""Phase 6A — Property Identity Core backend tests.

Covers: onboarding idempotency, GPS tiers, PATCH stages, submit + validation,
public lookups + aliases, state code mapping, sequential counter, 2dsphere,
/mine isolation, and a regression sweep of untouched endpoints.
"""
import asyncio
import os
import time
import uuid

import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient

BASE_URL = (
    os.environ.get("EXPO_BACKEND_URL")
    or os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or "https://property-os-africa.preview.emergentagent.com"
).rstrip("/")

DEMO_EMAIL = "demo@amass.africa"
DEMO_PASSWORD = "amass2026"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "amass_db")


# ─── Fixtures ────────────────────────────────────────────
@pytest.fixture(scope="session")
def api():
    s = requests.Session()
    s.headers["Content-Type"] = "application/json"
    return s


@pytest.fixture(scope="session")
def demo_token(api):
    r = api.post(f"{BASE_URL}/api/auth/login",
                 json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})
    assert r.status_code == 200, f"demo login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def demo_auth(demo_token):
    return {"Authorization": f"Bearer {demo_token}"}


@pytest.fixture(scope="session")
def fresh_user(api):
    """Register a fresh user, return (token, headers, user)."""
    email = f"pi6a_{int(time.time()*1000)}_{uuid.uuid4().hex[:6]}@test.amass"
    r = api.post(f"{BASE_URL}/api/auth/register", json={
        "email": email, "password": "Passw0rd!", "full_name": "PI Fresh"
    })
    assert r.status_code == 200, f"register failed: {r.text}"
    data = r.json()
    return {
        "token": data["access_token"],
        "headers": {"Authorization": f"Bearer {data['access_token']}"},
        "user": data["user"],
        "email": email,
    }


@pytest.fixture(scope="session", autouse=True)
def _wait_backend():
    for _ in range(15):
        try:
            r = requests.get(f"{BASE_URL}/api/agent-platform/plans", timeout=5)
            if r.status_code == 200:
                return
        except Exception:
            pass
        time.sleep(1)


# ─── helpers ─────────────────────────────────────────────
def _mongo():
    return AsyncIOMotorClient(MONGO_URL)[DB_NAME]


def _new_csid(tag="A"):
    return f"csid-{int(time.time()*1000)}-{tag}-{uuid.uuid4().hex[:6]}"


def _lagos_loc(accuracy=7, source="GPS"):
    # Victoria Island-ish
    return {
        "latitude": 6.4281 + (uuid.uuid4().int % 1000) / 1e6,
        "longitude": 3.4219 + (uuid.uuid4().int % 1000) / 1e6,
        "accuracy_meters": accuracy,
        "location_source": source,
    }


def _default_addr(state="Lagos"):
    return {
        "state": state, "lga": "Eti-Osa", "area": "Victoria Island",
        "street": "Ahmadu Bello Way", "house_number": "12",
    }


def _default_details():
    return {"property_type": "duplex", "bedrooms": 4, "bathrooms": 5}


def _default_listing():
    return {"listing_type": "buy", "price": 250_000_000, "currency": "NGN"}


# ═════════════════════════════════════════════════════════
# 1. Onboarding — idempotency
# ═════════════════════════════════════════════════════════
class TestOnboardingIdempotency:
    def test_unauthenticated_401(self, api):
        r = api.post(f"{BASE_URL}/api/agent/properties/onboarding",
                     json={"client_submission_id": _new_csid("noauth")})
        assert r.status_code in (401, 403), r.text

    def test_start_and_resume_same_csid(self, api, demo_auth):
        csid = _new_csid("dup")
        r1 = api.post(f"{BASE_URL}/api/agent/properties/onboarding",
                      json={"client_submission_id": csid}, headers=demo_auth)
        assert r1.status_code == 200, r1.text
        b1 = r1.json()
        assert b1["status"] == "DRAFT"
        assert b1["resumed"] is False
        assert b1["onboarding_id"]

        r2 = api.post(f"{BASE_URL}/api/agent/properties/onboarding",
                      json={"client_submission_id": csid}, headers=demo_auth)
        b2 = r2.json()
        assert r2.status_code == 200
        assert b2["onboarding_id"] == b1["onboarding_id"]
        assert b2["resumed"] is True

    def test_different_csid_different_id(self, api, demo_auth):
        a = api.post(f"{BASE_URL}/api/agent/properties/onboarding",
                     json={"client_submission_id": _new_csid("A")},
                     headers=demo_auth).json()
        b = api.post(f"{BASE_URL}/api/agent/properties/onboarding",
                     json={"client_submission_id": _new_csid("B")},
                     headers=demo_auth).json()
        assert a["onboarding_id"] != b["onboarding_id"]


# ═════════════════════════════════════════════════════════
# 2. Location + GPS tiers
# ═════════════════════════════════════════════════════════
class TestLocationCapture:
    def _start(self, api, headers):
        r = api.post(f"{BASE_URL}/api/agent/properties/onboarding",
                     json={"client_submission_id": _new_csid("loc")},
                     headers=headers)
        return r.json()["onboarding_id"]

    @pytest.mark.parametrize("acc,source,exp_status,msg_kw", [
        (7,  "GPS", "GPS_VERIFIED", "Excellent"),
        (20, "GPS", "CAPTURED",     "Good"),
        (40, "GPS", "CAPTURED",     "Low accuracy"),
        (75, "GPS", "INVALID",      "Poor"),
    ])
    def test_gps_tiers(self, api, demo_auth, acc, source, exp_status, msg_kw):
        oid = self._start(api, demo_auth)
        r = api.post(f"{BASE_URL}/api/agent/properties/{oid}/location",
                     json={"location": _lagos_loc(acc, source),
                           "address": _default_addr()},
                     headers=demo_auth)
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["gps_verification"] == exp_status
        assert msg_kw.lower() in b["gps_message"].lower(), b["gps_message"]

    def test_map_selected_unverified(self, api, demo_auth):
        oid = self._start(api, demo_auth)
        r = api.post(f"{BASE_URL}/api/agent/properties/{oid}/location",
                     json={"location": _lagos_loc(3, "MAP_SELECTED"),
                           "address": _default_addr()},
                     headers=demo_auth)
        assert r.status_code == 200
        assert r.json()["gps_verification"] == "UNVERIFIED"

    def test_non_owner_gets_404(self, api, demo_auth, fresh_user):
        oid = self._start(api, demo_auth)
        # fresh user tries to modify demo's draft
        r = api.post(f"{BASE_URL}/api/agent/properties/{oid}/location",
                     json={"location": _lagos_loc(), "address": _default_addr()},
                     headers=fresh_user["headers"])
        assert r.status_code == 404


# ═════════════════════════════════════════════════════════
# 3. Details / listing PATCH + GET draft
# ═════════════════════════════════════════════════════════
class TestPatchStages:
    def test_patch_and_get(self, api, demo_auth):
        csid = _new_csid("patch")
        oid = api.post(f"{BASE_URL}/api/agent/properties/onboarding",
                       json={"client_submission_id": csid},
                       headers=demo_auth).json()["onboarding_id"]

        api.post(f"{BASE_URL}/api/agent/properties/{oid}/location",
                 json={"location": _lagos_loc(), "address": _default_addr()},
                 headers=demo_auth)

        r1 = api.patch(f"{BASE_URL}/api/agent/properties/{oid}",
                       json={"details": _default_details()},
                       headers=demo_auth)
        assert r1.status_code == 200

        r2 = api.patch(f"{BASE_URL}/api/agent/properties/{oid}",
                       json={"listing": _default_listing()},
                       headers=demo_auth)
        assert r2.status_code == 200

        g = api.get(f"{BASE_URL}/api/agent/properties/onboarding/{oid}",
                    headers=demo_auth)
        assert g.status_code == 200
        d = g.json()
        assert d["location"]["latitude"]
        assert d["details"]["property_type"] == "duplex"
        assert d["details"]["bedrooms"] == 4
        assert d["listing"]["listing_type"] == "buy"
        assert d["listing"]["price"] == 250_000_000


# ═════════════════════════════════════════════════════════
# 4. Submit — creates property + listing + audit
# ═════════════════════════════════════════════════════════
class TestSubmit:
    async def _mongo_check(self, prop_uuid, amass_id):
        db = _mongo()
        p = await db.properties_geo.find_one({"amass_property_id": amass_id})
        assert p, "properties_geo row missing"
        assert p["entrance_point"]["type"] == "Point"
        assert isinstance(p["entrance_point"]["coordinates"], list)
        assert p["property_identity_status"] == "PENDING_REVIEW"
        assert p["physical_status"] == "ACTIVE"

        listing = await db.property_listings.find_one({"property_id": prop_uuid})
        assert listing, "property_listings row missing"
        assert listing["listing_type"]
        assert listing["price"]
        assert listing["listing_status"] == "PENDING_REVIEW"

        n = await db.property_audit_logs.count_documents({"property_id": prop_uuid})
        assert n >= 2, f"expected >=2 audit rows, got {n}"

        ctr = await db.property_id_counters.find_one({"state_code": "LAG"})
        assert ctr and isinstance(ctr["seq"], int) and ctr["seq"] > 0

    def _full_flow(self, api, headers, state="Lagos", tag="submit"):
        csid = _new_csid(tag)
        oid = api.post(f"{BASE_URL}/api/agent/properties/onboarding",
                       json={"client_submission_id": csid},
                       headers=headers).json()["onboarding_id"]
        api.post(f"{BASE_URL}/api/agent/properties/{oid}/location",
                 json={"location": _lagos_loc(), "address": _default_addr(state)},
                 headers=headers)
        api.patch(f"{BASE_URL}/api/agent/properties/{oid}",
                  json={"details": _default_details()}, headers=headers)
        api.patch(f"{BASE_URL}/api/agent/properties/{oid}",
                  json={"listing": _default_listing()}, headers=headers)
        r = api.post(f"{BASE_URL}/api/agent/properties/{oid}/submit",
                     json={"client_submission_id": csid}, headers=headers)
        return csid, oid, r

    def test_submit_creates_all(self, api, demo_auth):
        csid, oid, r = self._full_flow(api, demo_auth)
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["status"] == "SUBMITTED"
        assert b["amass_property_id"].startswith("AMASS-LAG-")
        seq_part = b["amass_property_id"].split("-")[-1]
        assert len(seq_part) == 8 and seq_part.isdigit(), seq_part
        # UUID check
        uuid.UUID(b["property_id"])
        uuid.UUID(b["listing_id"])

        # Mongo state
        asyncio.get_event_loop().run_until_complete(
            self._mongo_check(b["property_id"], b["amass_property_id"])
        )

        # Idempotent retry
        r2 = api.post(f"{BASE_URL}/api/agent/properties/{oid}/submit",
                      json={"client_submission_id": csid}, headers=demo_auth)
        assert r2.status_code == 200
        b2 = r2.json()
        assert b2.get("idempotent") is True
        assert b2["amass_property_id"] == b["amass_property_id"]
        assert b2["property_id"] == b["property_id"]
        assert b2["listing_id"] == b["listing_id"]

        # Mismatched CSID
        r3 = api.post(f"{BASE_URL}/api/agent/properties/{oid}/submit",
                      json={"client_submission_id": "csid-does-not-exist-xxxx"},
                      headers=demo_auth)
        assert r3.status_code == 404


# ═════════════════════════════════════════════════════════
# 5. Submit validation guards
# ═════════════════════════════════════════════════════════
class TestSubmitGuards:
    def _new(self, api, headers, tag):
        csid = _new_csid(tag)
        oid = api.post(f"{BASE_URL}/api/agent/properties/onboarding",
                       json={"client_submission_id": csid},
                       headers=headers).json()["onboarding_id"]
        return csid, oid

    def test_location_only_missing_details(self, api, demo_auth):
        csid, oid = self._new(api, demo_auth, "g1")
        api.post(f"{BASE_URL}/api/agent/properties/{oid}/location",
                 json={"location": _lagos_loc(), "address": _default_addr()},
                 headers=demo_auth)
        r = api.post(f"{BASE_URL}/api/agent/properties/{oid}/submit",
                     json={"client_submission_id": csid}, headers=demo_auth)
        assert r.status_code == 400
        assert "details" in r.text.lower()

    def test_details_only_missing_location(self, api, demo_auth):
        csid, oid = self._new(api, demo_auth, "g2")
        api.patch(f"{BASE_URL}/api/agent/properties/{oid}",
                  json={"details": _default_details()}, headers=demo_auth)
        r = api.post(f"{BASE_URL}/api/agent/properties/{oid}/submit",
                     json={"client_submission_id": csid}, headers=demo_auth)
        assert r.status_code == 400
        assert "location" in r.text.lower()

    def test_missing_listing(self, api, demo_auth):
        csid, oid = self._new(api, demo_auth, "g3")
        api.post(f"{BASE_URL}/api/agent/properties/{oid}/location",
                 json={"location": _lagos_loc(), "address": _default_addr()},
                 headers=demo_auth)
        api.patch(f"{BASE_URL}/api/agent/properties/{oid}",
                  json={"details": _default_details()}, headers=demo_auth)
        r = api.post(f"{BASE_URL}/api/agent/properties/{oid}/submit",
                     json={"client_submission_id": csid}, headers=demo_auth)
        assert r.status_code == 400
        assert "listing" in r.text.lower()


# ═════════════════════════════════════════════════════════
# 6. Public property lookup + alias
# ═════════════════════════════════════════════════════════
class TestPublicLookup:
    def _make(self, api, headers):
        t = TestSubmit()
        csid, oid, r = t._full_flow(api, headers, tag="public")
        assert r.status_code == 200
        return r.json()

    def test_get_by_amass_id_no_created_by(self, api, demo_auth):
        b = self._make(api, demo_auth)
        r = requests.get(f"{BASE_URL}/api/properties-v2/{b['amass_property_id']}")
        assert r.status_code == 200, r.text
        p = r.json()
        assert p["amass_property_id"] == b["amass_property_id"]
        assert "created_by" not in p

    def test_unknown_404(self, api):
        r = requests.get(f"{BASE_URL}/api/properties-v2/UNKNOWN-XYZ-123")
        assert r.status_code == 404

    def test_listings_endpoint(self, api, demo_auth):
        b = self._make(api, demo_auth)
        r = requests.get(f"{BASE_URL}/api/properties-v2/{b['amass_property_id']}/listings")
        assert r.status_code == 200
        arr = r.json()
        assert isinstance(arr, list) and len(arr) >= 1
        assert arr[0]["property_id"] == b["property_id"]

    def test_alias_resolution(self, api, demo_auth):
        b = self._make(api, demo_auth)
        alias = f"AMASS-LAG-99{uuid.uuid4().hex[:6].upper()}"

        async def push():
            db = _mongo()
            await db.properties_geo.update_one(
                {"amass_property_id": b["amass_property_id"]},
                {"$push": {"aliases": alias}},
            )
        asyncio.get_event_loop().run_until_complete(push())

        r = requests.get(f"{BASE_URL}/api/properties-v2/{alias}")
        assert r.status_code == 200, r.text
        p = r.json()
        assert p.get("resolved_via_alias") is True
        assert p.get("requested_id") == alias
        assert p["amass_property_id"] == b["amass_property_id"]


# ═════════════════════════════════════════════════════════
# 7. State code coverage
# ═════════════════════════════════════════════════════════
class TestStateCodes:
    @pytest.mark.parametrize("state,prefix", [
        ("FCT", "AMASS-FCT-"),
        ("Rivers", "AMASS-RIV-"),
    ])
    def test_known_states(self, api, demo_auth, state, prefix):
        t = TestSubmit()
        _, _, r = t._full_flow(api, demo_auth, state=state, tag=f"st-{state}")
        assert r.status_code == 200, r.text
        assert r.json()["amass_property_id"].startswith(prefix)

    def test_unknown_state_fallback(self, api, demo_auth):
        t = TestSubmit()
        _, _, r = t._full_flow(api, demo_auth, state="Wakanda", tag="st-wk")
        assert r.status_code == 200
        amass = r.json()["amass_property_id"]
        # AMASS-{3upper}-{8digits}
        parts = amass.split("-")
        assert len(parts) == 3
        assert len(parts[1]) == 3 and parts[1].isupper()


# ═════════════════════════════════════════════════════════
# 8. Sequential counter per state
# ═════════════════════════════════════════════════════════
class TestCounter:
    def test_three_lagos_increment(self, api, demo_auth):
        t = TestSubmit()
        seqs = []
        for i in range(3):
            _, _, r = t._full_flow(api, demo_auth, tag=f"seq{i}")
            assert r.status_code == 200
            seqs.append(int(r.json()["amass_property_id"].split("-")[-1]))
        # Strictly increasing (may not be +1 due to parallel prior tests)
        assert seqs == sorted(seqs) and len(set(seqs)) == 3, seqs
        # Adjacent runs within this batch should be consecutive
        assert seqs[1] - seqs[0] == 1
        assert seqs[2] - seqs[1] == 1

    def test_concurrent_submits(self, api, demo_auth):
        # Prepare two full drafts, then submit concurrently
        t = TestSubmit()
        prepared = []
        for i in range(2):
            csid = _new_csid(f"cc{i}")
            oid = api.post(f"{BASE_URL}/api/agent/properties/onboarding",
                           json={"client_submission_id": csid},
                           headers=demo_auth).json()["onboarding_id"]
            api.post(f"{BASE_URL}/api/agent/properties/{oid}/location",
                     json={"location": _lagos_loc(), "address": _default_addr()},
                     headers=demo_auth)
            api.patch(f"{BASE_URL}/api/agent/properties/{oid}",
                      json={"details": _default_details()}, headers=demo_auth)
            api.patch(f"{BASE_URL}/api/agent/properties/{oid}",
                      json={"listing": _default_listing()}, headers=demo_auth)
            prepared.append((csid, oid))

        import concurrent.futures as cf
        def _submit(pair):
            csid, oid = pair
            return requests.post(
                f"{BASE_URL}/api/agent/properties/{oid}/submit",
                json={"client_submission_id": csid},
                headers=demo_auth, timeout=30,
            )
        with cf.ThreadPoolExecutor(max_workers=2) as ex:
            results = list(ex.map(_submit, prepared))
        codes = [r.status_code for r in results]
        assert codes == [200, 200], [r.text for r in results]
        ids = {r.json()["amass_property_id"] for r in results}
        assert len(ids) == 2, ids


# ═════════════════════════════════════════════════════════
# 9. 2dsphere query
# ═════════════════════════════════════════════════════════
class TestGeoIndex:
    def test_near_lagos(self):
        async def q():
            db = _mongo()
            cur = db.properties_geo.find({
                "entrance_point": {
                    "$near": {
                        "$geometry": {"type": "Point", "coordinates": [3.4219, 6.4281]},
                        "$maxDistance": 5000,
                    }
                }
            }).limit(5)
            return await cur.to_list(5)
        rows = asyncio.get_event_loop().run_until_complete(q())
        assert len(rows) >= 1


# ═════════════════════════════════════════════════════════
# 10. My properties isolation
# ═════════════════════════════════════════════════════════
class TestMine:
    def test_demo_has_rows(self, api, demo_auth):
        r = api.get(f"{BASE_URL}/api/agent/properties/mine", headers=demo_auth)
        assert r.status_code == 200
        arr = r.json()
        assert isinstance(arr, list) and len(arr) >= 1
        row = arr[0]
        assert "property" in row and row["property"] is not None
        assert row["property"].get("amass_property_id")
        assert row.get("listing_type")

    def test_fresh_user_isolation(self, api, fresh_user):
        # Fresh user's /mine before submitting should be empty
        r0 = api.get(f"{BASE_URL}/api/agent/properties/mine",
                     headers=fresh_user["headers"])
        assert r0.status_code == 200
        assert r0.json() == []

        t = TestSubmit()
        csid, oid, sr = t._full_flow(api, fresh_user["headers"], tag="fresh")
        assert sr.status_code == 200
        their_amass = sr.json()["amass_property_id"]

        r = api.get(f"{BASE_URL}/api/agent/properties/mine",
                    headers=fresh_user["headers"])
        assert r.status_code == 200
        arr = r.json()
        assert len(arr) == 1
        assert arr[0]["property"]["amass_property_id"] == their_amass
        assert arr[0]["agent_id"] == fresh_user["user"]["id"]


# ═════════════════════════════════════════════════════════
# 11. Regression sweep
# ═════════════════════════════════════════════════════════
class TestRegression:
    def test_auth_me(self, api, demo_auth):
        r = api.get(f"{BASE_URL}/api/auth/me", headers=demo_auth)
        assert r.status_code == 200
        assert r.json()["email"] == DEMO_EMAIL

    def test_properties_list(self, api):
        r = api.get(f"{BASE_URL}/api/properties")
        assert r.status_code == 200
        data = r.json()
        # Should be list-like and NOT contain new v2 rows (v2 rows have no "images" schema)
        assert isinstance(data, (list, dict))

    def test_agent_plans(self, api):
        r = api.get(f"{BASE_URL}/api/agent-platform/plans")
        assert r.status_code == 200
        assert isinstance(r.json(), list) and len(r.json()) >= 1

    def test_agent_subscription_me(self, api, demo_auth):
        r = api.get(f"{BASE_URL}/api/agent-platform/subscription/me",
                    headers=demo_auth)
        assert r.status_code == 200

    def test_public_agent(self, api):
        r = api.get(f"{BASE_URL}/api/agent-platform/public/ada-demo-a8d30c")
        # 200 if slug exists in this env, otherwise 404 acceptable
        assert r.status_code in (200, 404), r.status_code

    def test_share_property(self, api):
        # Find any existing property id from the old list
        lr = api.get(f"{BASE_URL}/api/properties")
        arr = lr.json()
        items = arr if isinstance(arr, list) else arr.get("items", [])
        if not items:
            pytest.skip("No legacy properties available")
        pid = items[0].get("id") or items[0].get("_id") or items[0].get("property_id")
        if not pid:
            pytest.skip("Legacy property has no usable id")
        r = api.get(f"{BASE_URL}/api/share/property/{pid}")
        assert r.status_code in (200, 404), r.text

    def test_agent_score(self, api, demo_auth):
        r = api.get(f"{BASE_URL}/api/agent/score", headers=demo_auth)
        assert r.status_code == 200

    def test_crm_leads(self, api, demo_auth):
        r = api.get(f"{BASE_URL}/api/crm/leads", headers=demo_auth)
        assert r.status_code == 200

    def test_old_properties_post_quota_enforced(self, api, fresh_user):
        # New user with Starter plan (5 listings) should still be allowed a few,
        # but the endpoint should exist and NOT 500. We just assert non-5xx.
        payload = {
            "title": "TEST_regression_prop",
            "description": "test",
            "price": 1000000,
            "listing_type": "buy",
            "property_type": "apartment",
            "bedrooms": 1, "bathrooms": 1,
            "city": "Lagos", "state": "Lagos",
            "address": "Test",
        }
        r = api.post(f"{BASE_URL}/api/properties", json=payload,
                     headers=fresh_user["headers"])
        # Either succeeds or returns a business-logic status (402/422/400)
        assert r.status_code < 500, r.text
