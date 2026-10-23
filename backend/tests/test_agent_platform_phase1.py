"""AMASS Agent Platform Phase 1 backend tests.

Covers plans catalog, founding counter, subscription flow, quota enforcement,
onboarding, starter kit visibility, admin management endpoints, 403 for
non-admins, and existing-endpoint regression sweep.
"""
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


# ─── Shared session state ───────────────────────────────────────
STATE: dict = {}


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def demo_headers(session):
    r = session.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD},
    )
    if r.status_code != 200:
        # Fall back to register
        r = session.post(
            f"{BASE_URL}/api/auth/register",
            json={
                "email": DEMO_EMAIL,
                "password": DEMO_PASSWORD,
                "full_name": "Ada Demo",
            },
        )
    assert r.status_code == 200, r.text
    body = r.json()
    token = body.get("access_token") or body.get("token")
    STATE["demo_user_id"] = body.get("user", {}).get("id")
    STATE["demo_token"] = token
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def demo_me(session, demo_headers):
    r = session.get(f"{BASE_URL}/api/auth/me", headers=demo_headers)
    assert r.status_code == 200, r.text
    me = r.json()
    STATE["demo_user_id"] = me["id"]
    return me


@pytest.fixture(scope="module")
def nonadmin_headers(session):
    email = f"testagent+{int(time.time())}_{uuid.uuid4().hex[:6]}@example.com"
    r = session.post(
        f"{BASE_URL}/api/auth/register",
        json={"email": email, "password": "test1234", "full_name": "Test Agent"},
    )
    assert r.status_code == 200, r.text
    token = r.json().get("access_token") or r.json().get("token")
    STATE["nonadmin_email"] = email
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ─── 1. Plans catalog ───────────────────────────────────────────
class TestPlansCatalog:
    def test_plans_shape_and_values(self, session):
        r = session.get(f"{BASE_URL}/api/agent-platform/plans")
        assert r.status_code == 200, r.text
        plans = r.json()
        assert isinstance(plans, list) and len(plans) == 3
        by_id = {p["id"]: p for p in plans}
        assert set(by_id.keys()) == {"starter", "pro", "agency"}

        starter = by_id["starter"]
        assert starter["monthly_price_ngn"] == 0
        assert starter["listing_limit"] == 5

        pro = by_id["pro"]
        assert pro["monthly_price_ngn"] == 15000
        assert pro["founding_price_ngn"] == 10000
        assert pro["listing_limit"] == 30
        assert pro["is_founding_price"] is True
        assert pro["effective_price_ngn"] == 10000

        agency = by_id["agency"]
        assert agency["monthly_price_ngn"] == 50000
        assert agency["founding_price_ngn"] == 35000
        assert agency["listing_limit"] == 150

    def test_founding_counter(self, session):
        r = session.get(f"{BASE_URL}/api/agent-platform/founding")
        assert r.status_code == 200, r.text
        f = r.json()
        for k in ("target", "claimed", "remaining", "is_open"):
            assert k in f
        assert f["target"] == 500
        assert isinstance(f["claimed"], int) and f["claimed"] >= 0
        STATE["founding_baseline"] = f["claimed"]


# ─── 2. Subscribe flow ──────────────────────────────────────────
class TestSubscribeFlow:
    def test_subscribe_starter(self, session, demo_headers):
        r = session.post(
            f"{BASE_URL}/api/agent-platform/subscription/subscribe",
            json={"plan_id": "starter"},
            headers=demo_headers,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("activated") is True

    def test_subscribe_pro_requires_payment(self, session, demo_headers):
        r = session.post(
            f"{BASE_URL}/api/agent-platform/subscription/subscribe",
            json={"plan_id": "pro"},
            headers=demo_headers,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("activated") is False
        assert body.get("requires_payment") is True
        ref = body.get("pending_reference")
        assert isinstance(ref, str) and ref.startswith("agentsub_")
        STATE["pending_ref"] = ref

    def test_activate_pro(self, session, demo_headers):
        ref = STATE["pending_ref"]
        r = session.post(
            f"{BASE_URL}/api/agent-platform/subscription/activate",
            params={"pending_reference": ref},
            headers=demo_headers,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        sub = body.get("subscription") or {}
        assert sub.get("plan_id") == "pro"
        assert sub.get("status") == "active"

    def test_founding_counter_incremented(self, session):
        r = session.get(f"{BASE_URL}/api/agent-platform/founding")
        assert r.status_code == 200
        new_claimed = r.json()["claimed"]
        assert new_claimed == STATE["founding_baseline"] + 1, (
            f"Expected {STATE['founding_baseline']+1}, got {new_claimed}"
        )

    def test_subscription_me_reflects_pro(self, session, demo_headers):
        r = session.get(
            f"{BASE_URL}/api/agent-platform/subscription/me", headers=demo_headers
        )
        assert r.status_code == 200, r.text
        sub = r.json()
        assert sub.get("plan_id") == "pro"
        assert sub.get("listing_limit") == 30

    def test_quota_on_pro(self, session, demo_headers):
        r = session.get(
            f"{BASE_URL}/api/agent-platform/quota", headers=demo_headers
        )
        assert r.status_code == 200, r.text
        q = r.json()
        assert q["plan_id"] == "pro"
        assert q["listing_limit"] == 30
        assert q["at_limit"] is False

    def test_create_property_under_pro_ok(self, session, demo_headers):
        prop = {
            "title": "TEST_pro_listing",
            "description": "test property while on pro plan",
            "price": 5_000_000,
            "listing_type": "buy",
            "property_type": "apartment",
            "bedrooms": 2,
            "bathrooms": 2,
            "size_sqm": 90,
            "location": "Lekki Phase 1",
            "city": "Lagos",
            "state": "Lagos",
            "country": "Nigeria",
            "latitude": 6.4381,
            "longitude": 3.4692,
            "images": [],
            "amenities": [],
            "is_owner": False,
            "has_mandate": False,
        }
        r = session.post(
            f"{BASE_URL}/api/properties", json=prop, headers=demo_headers
        )
        assert r.status_code == 200, r.text
        created = r.json()
        assert created.get("title") == "TEST_pro_listing"
        STATE["created_property_id"] = created["id"]

    def test_cancel_subscription(self, session, demo_headers):
        r = session.post(
            f"{BASE_URL}/api/agent-platform/subscription/cancel", headers=demo_headers
        )
        assert r.status_code == 200, r.text
        # After cancel → starter
        r2 = session.get(
            f"{BASE_URL}/api/agent-platform/subscription/me", headers=demo_headers
        )
        assert r2.status_code == 200
        assert r2.json().get("plan_id") == "starter"


# ─── 3. Quota enforcement on Starter ─────────────────────────────
class TestQuotaEnforcement:
    """Uses a throwaway account so the assertions don't depend on how many
    listings the shared demo user has accumulated across suites."""

    @pytest.fixture(scope="class")
    def starter_headers(self, session):
        email = f"quota+{int(time.time())}_{uuid.uuid4().hex[:6]}@example.com"
        r = session.post(
            f"{BASE_URL}/api/auth/register",
            json={"email": email, "password": "test1234", "full_name": "Quota Tester"},
        )
        assert r.status_code == 200, r.text
        token = r.json().get("access_token") or r.json().get("token")
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    @staticmethod
    def _prop(title: str) -> dict:
        return {
            "title": title,
            "description": "quota filler",
            "price": 1_000_000,
            "listing_type": "buy",
            "property_type": "apartment",
            "bedrooms": 1,
            "bathrooms": 1,
            "size_sqm": 40,
            "location": "Ikeja",
            "city": "Lagos",
            "state": "Lagos",
            "country": "Nigeria",
            "latitude": 6.6018,
            "longitude": 3.3515,
            "images": [],
            "amenities": [],
            "is_owner": False,
            "has_mandate": False,
        }

    def test_quota_on_starter(self, session, starter_headers):
        r = session.get(f"{BASE_URL}/api/agent-platform/quota", headers=starter_headers)
        assert r.status_code == 200, r.text
        q = r.json()
        assert q["plan_id"] == "starter"
        assert q["listing_limit"] == 5
        assert q["at_limit"] is False
        for i in range(q["remaining"]):
            rc = session.post(
                f"{BASE_URL}/api/properties",
                json=self._prop(f"TEST_quota_fill_{i}"),
                headers=starter_headers,
            )
            assert rc.status_code == 200, rc.text
        q2 = session.get(f"{BASE_URL}/api/agent-platform/quota", headers=starter_headers).json()
        assert q2["active_listings"] == 5
        assert q2["at_limit"] is True

    def test_create_property_402_on_starter(self, session, starter_headers):
        r = session.post(
            f"{BASE_URL}/api/properties",
            json=self._prop("TEST_should_fail_402"),
            headers=starter_headers,
        )
        assert r.status_code == 402, f"expected 402, got {r.status_code}: {r.text}"
        detail = r.json().get("detail") or {}
        assert detail.get("error") == "plan_limit_reached"
        assert detail.get("plan_id") == "starter"
        assert detail.get("limit") == 5
        assert detail.get("active", 0) >= 5


# ─── 4. Onboarding + starter kit visibility ─────────────────────
class TestOnboarding:
    def test_onboarding_shape(self, session, demo_headers):
        r = session.get(
            f"{BASE_URL}/api/agent-platform/onboarding", headers=demo_headers
        )
        assert r.status_code == 200, r.text
        o = r.json()
        assert o["total_steps"] == 5
        assert isinstance(o["steps"], list) and len(o["steps"]) == 5
        step_ids = [s["id"] for s in o["steps"]]
        assert step_ids == ["account", "professional", "kyc", "plan", "listings"]
        assert 0 <= o["percent"] <= 100
        assert isinstance(o["can_go_live"], bool)
        assert o["starter_kit_status"] in (
            "not_eligible", "eligible", "processing", "dispatched", "delivered"
        )

    def test_starter_kit_me(self, session, demo_headers):
        r = session.get(
            f"{BASE_URL}/api/agent-platform/starter-kit/me", headers=demo_headers
        )
        assert r.status_code == 200, r.text
        kit = r.json()
        assert "status" in kit and "user_id" in kit


# ─── 5. Admin endpoints (as demo) ────────────────────────────────
class TestAdminEndpoints:
    def test_admin_list_agents_filters(self, session, demo_headers, demo_me):
        for params in [{}, {"status": "pending"}, {"plan": "starter"}, {"q": "demo"}]:
            r = session.get(
                f"{BASE_URL}/api/admin/agents", params=params, headers=demo_headers
            )
            assert r.status_code == 200, f"{params}: {r.status_code} {r.text}"
            assert isinstance(r.json(), list)

    def test_admin_verify_agent(self, session, demo_headers, demo_me):
        uid = demo_me["id"]
        # Ensure application exists — most admin flows need agent_applications doc.
        # Try direct verify; if missing, skip gracefully.
        r = session.post(
            f"{BASE_URL}/api/admin/agents/{uid}/verify",
            json={"approve": True, "verification_level": 2},
            headers=demo_headers,
        )
        if r.status_code == 404:
            pytest.skip("No agent_application for demo user — skipping verify test")
        assert r.status_code == 200, r.text
        assert r.json().get("status") == "approved"

    def test_admin_suspend_unsuspend(self, session, demo_headers, demo_me):
        uid = demo_me["id"]
        r1 = session.post(
            f"{BASE_URL}/api/admin/agents/{uid}/suspend",
            json={"suspend": True, "reason": "test"},
            headers=demo_headers,
        )
        assert r1.status_code == 200, r1.text
        assert r1.json().get("status") == "suspended"
        r2 = session.post(
            f"{BASE_URL}/api/admin/agents/{uid}/suspend",
            json={"suspend": False},
            headers=demo_headers,
        )
        assert r2.status_code == 200, r2.text
        assert r2.json().get("status") == "approved"

    def test_admin_patch_plan_and_revert(self, session, demo_headers):
        r = session.patch(
            f"{BASE_URL}/api/admin/plans/pro",
            json={"monthly_price_ngn": 20000},
            headers=demo_headers,
        )
        assert r.status_code == 200, r.text
        # Verify by refetching
        r2 = session.get(f"{BASE_URL}/api/agent-platform/plans")
        assert r2.status_code == 200
        pro = next(p for p in r2.json() if p["id"] == "pro")
        assert pro["monthly_price_ngn"] == 20000
        # Revert
        r3 = session.patch(
            f"{BASE_URL}/api/admin/plans/pro",
            json={"monthly_price_ngn": 15000},
            headers=demo_headers,
        )
        assert r3.status_code == 200
        r4 = session.get(f"{BASE_URL}/api/agent-platform/plans")
        pro2 = next(p for p in r4.json() if p["id"] == "pro")
        assert pro2["monthly_price_ngn"] == 15000

    def test_admin_starter_kit_workflow(self, session, demo_headers, demo_me):
        uid = demo_me["id"]
        for status in ("processing", "dispatched", "delivered"):
            r = session.post(
                f"{BASE_URL}/api/admin/starter-kits/{uid}/status",
                json={"status": status, "notes": f"test-{status}"},
                headers=demo_headers,
            )
            assert r.status_code == 200, f"{status}: {r.status_code} {r.text}"
            assert r.json().get("status") == status

    def test_admin_kpis(self, session, demo_headers):
        r = session.get(
            f"{BASE_URL}/api/admin/agents/kpis", headers=demo_headers
        )
        assert r.status_code == 200, r.text
        k = r.json()
        for top in ("agents", "plans", "revenue", "founding", "targets"):
            assert top in k, f"missing key {top}"
        agents = k["agents"]
        for f in ("total", "verified", "pending", "suspended", "with_5plus_verified_listings"):
            assert f in agents
        rev = k["revenue"]
        assert "mrr_ngn" in rev and "arr_ngn" in rev


# ─── 6. Non-admin 403 sweep ─────────────────────────────────────
class TestNonAdmin403:
    def test_admin_routes_403(self, session, nonadmin_headers):
        routes = [
            ("GET", "/api/admin/agents", None),
            ("POST", "/api/admin/agents/anyid/verify", {"approve": True}),
            ("POST", "/api/admin/agents/anyid/suspend", {"suspend": True}),
            ("PATCH", "/api/admin/plans/pro", {"monthly_price_ngn": 15000}),
            ("POST", "/api/admin/starter-kits/anyid/status", {"status": "processing"}),
            ("GET", "/api/admin/agents/kpis", None),
        ]
        for method, path, body in routes:
            url = f"{BASE_URL}{path}"
            if method == "GET":
                r = session.get(url, headers=nonadmin_headers)
            elif method == "POST":
                r = session.post(url, json=body or {}, headers=nonadmin_headers)
            else:
                r = session.patch(url, json=body or {}, headers=nonadmin_headers)
            assert r.status_code == 403, (
                f"{method} {path} expected 403 got {r.status_code}: {r.text[:200]}"
            )


# ─── 7. Regression sweep for pre-existing endpoints ─────────────
class TestRegression:
    def test_auth_me(self, session, demo_headers):
        r = session.get(f"{BASE_URL}/api/auth/me", headers=demo_headers)
        assert r.status_code == 200

    def test_properties_list(self, session):
        r = session.get(f"{BASE_URL}/api/properties")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_marketplace(self, session):
        r = session.get(f"{BASE_URL}/api/marketplace")
        assert r.status_code == 200

    def test_wallet_dual(self, session, demo_headers):
        r = session.get(f"{BASE_URL}/api/wallet/dual", headers=demo_headers)
        assert r.status_code == 200
        w = r.json()
        assert "mass" in w and "fix" in w

    def test_earn_tasks(self, session, demo_headers):
        r = session.get(f"{BASE_URL}/api/earn/tasks", headers=demo_headers)
        assert r.status_code == 200

    def test_agent_promotions_config(self, session):
        r = session.get(f"{BASE_URL}/api/agent/promotions/config")
        assert r.status_code == 200

    def test_improve_catalog(self, session):
        r = session.get(f"{BASE_URL}/api/improve/catalog")
        assert r.status_code == 200

    def test_payments_initialize(self, session, demo_headers):
        # "explorer" (₦1,000) is the cheapest bundle at/above the admin-configured
        # top-up minimum (`/api/monetization/config.topup_min_ngn`).
        r = session.post(
            f"{BASE_URL}/api/payments/initialize",
            json={"provider": "paystack", "currency": "MASS", "bundle_id": "explorer"},
            headers=demo_headers,
        )
        # Mocked in .env — should return 200 with a checkout_url or similar
        assert r.status_code in (200, 201), r.text


# ─── Cleanup ────────────────────────────────────────────────────
def test_zz_cleanup(session, demo_headers):
    """Delete test property created during pro flow (if any)."""
    pid = STATE.get("created_property_id")
    if not pid:
        return
    # Try common delete endpoint; ignore failures.
    r = session.delete(f"{BASE_URL}/api/properties/{pid}", headers=demo_headers)
    print(f"cleanup DELETE /api/properties/{pid} → {r.status_code}")
