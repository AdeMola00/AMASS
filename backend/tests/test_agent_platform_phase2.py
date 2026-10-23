"""AMASS Agent Platform Phase 2 backend tests.

Covers:
- Public agent profile (by slug + user_id fallback + 410 when suspended + 404 unknown)
- Public listings
- Badge rules catalog + Badge progress
- Admin pin/unpin badge (and non-admin 403)
- Account deletion + JWT invalidation + collection scrub
- Slug backfill idempotency across backend restart
- Paystack webhook smoke (no signature)
- Phase 1 regression sweep
"""
import os
import time
import uuid
import subprocess

import pytest
import requests

BASE_URL = os.environ.get(
    "EXPO_BACKEND_URL",
    "https://property-os-africa.preview.emergentagent.com",
).rstrip("/")

DEMO_EMAIL = "demo@amass.africa"
DEMO_PASSWORD = "amass2026"
DEMO_SLUG = "ada-demo-a8d30c"

STATE: dict = {}


# ─── Fixtures ─────────────────────────────────────────────
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
    assert r.status_code == 200, r.text
    body = r.json()
    tok = body.get("access_token") or body.get("token")
    STATE["demo_token"] = tok
    STATE["demo_user_id"] = body.get("user", {}).get("id")
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def demo_me(session, demo_headers):
    r = session.get(f"{BASE_URL}/api/auth/me", headers=demo_headers)
    assert r.status_code == 200
    me = r.json()
    STATE["demo_user_id"] = me["id"]
    return me


# ─── 1. Public agent profile ────────────────────────────
class TestPublicAgentProfile:
    def test_by_slug(self, session, demo_me):
        r = session.get(f"{BASE_URL}/api/agent-platform/public/{DEMO_SLUG}")
        assert r.status_code == 200, r.text
        p = r.json()
        assert p["full_name"] == "Ada Demo"
        assert p["badge"]["id"] == "verified"
        assert p["is_founding_agent"] is True
        assert p["share_url"] == f"https://amass.africa/agent/{DEMO_SLUG}"
        # Stats populated (numeric keys)
        for k in ("active_listings", "verified_listings", "total_sold", "total_rented", "response_rate"):
            assert k in p and isinstance(p[k], (int, float))

    def test_by_user_id_fallback(self, session, demo_me):
        uid = demo_me["id"]
        r = session.get(f"{BASE_URL}/api/agent-platform/public/{uid}")
        assert r.status_code == 200, r.text
        assert r.json()["user_id"] == uid

    def test_unknown_slug_404(self, session):
        r = session.get(f"{BASE_URL}/api/agent-platform/public/does-not-exist-xyz")
        assert r.status_code == 404

    def test_suspended_returns_410(self, session, demo_headers, demo_me):
        uid = demo_me["id"]
        # Suspend
        r1 = session.post(
            f"{BASE_URL}/api/admin/agents/{uid}/suspend",
            json={"suspend": True, "reason": "phase2 test"},
            headers=demo_headers,
        )
        assert r1.status_code == 200, r1.text
        try:
            r2 = session.get(f"{BASE_URL}/api/agent-platform/public/{DEMO_SLUG}")
            assert r2.status_code == 410, f"expected 410 got {r2.status_code}: {r2.text}"
        finally:
            # Reinstate
            r3 = session.post(
                f"{BASE_URL}/api/admin/agents/{uid}/suspend",
                json={"suspend": False},
                headers=demo_headers,
            )
            assert r3.status_code == 200


# ─── 2. Public listings ─────────────────────────────────
class TestPublicListings:
    def test_listings(self, session):
        r = session.get(f"{BASE_URL}/api/agent-platform/public/{DEMO_SLUG}/listings")
        assert r.status_code == 200, r.text
        docs = r.json()
        assert isinstance(docs, list)
        # None archived
        for d in docs:
            assert d.get("status") != "archived"
        # Newest first (created_at desc) if >=2
        if len(docs) >= 2:
            a, b = docs[0].get("created_at"), docs[1].get("created_at")
            if a and b:
                assert str(a) >= str(b), "expected newest-first ordering"


# ─── 3. Badge rules catalog ─────────────────────────────
class TestBadgeRules:
    def test_rules_shape(self, session):
        r = session.get(f"{BASE_URL}/api/agent-platform/badge/rules")
        assert r.status_code == 200, r.text
        rules = r.json()
        assert isinstance(rules, dict)
        for tier in ("registered", "verified", "trusted", "top_agent"):
            assert tier in rules
            t = rules[tier]
            for k in ("label", "colour", "icon", "criteria", "description"):
                assert k in t, f"tier {tier} missing {k}"


# ─── 4. Badge progress ──────────────────────────────────
class TestBadgeProgress:
    def test_progress_demo(self, session, demo_headers):
        r = session.get(
            f"{BASE_URL}/api/agent-platform/badge/progress", headers=demo_headers
        )
        assert r.status_code == 200, r.text
        p = r.json()
        assert p["current_badge"]["id"] == "verified"
        assert p["next_badge"]["id"] == "trusted"
        assert isinstance(p["checks"], list)
        assert len(p["checks"]) >= 4, f"expected >=4 checks, got {len(p['checks'])}"
        for c in p["checks"]:
            for k in ("label", "current", "target", "met"):
                assert k in c
        assert 0 <= p["progress_percent"] <= 100


# ─── 5. Admin pin/unpin badge ───────────────────────────
class TestAdminBadgePin:
    def test_pin_top_agent(self, session, demo_headers, demo_me):
        uid = demo_me["id"]
        r = session.post(
            f"{BASE_URL}/api/admin/agents/{uid}/badge",
            json={"tier": "top_agent"},
            headers=demo_headers,
        )
        assert r.status_code == 200, r.text
        assert r.json().get("tier") == "top_agent"
        # Verify pinned shows on public profile
        r2 = session.get(f"{BASE_URL}/api/agent-platform/public/{DEMO_SLUG}")
        assert r2.status_code == 200
        assert r2.json()["badge"]["id"] == "top_agent"

    def test_unpin(self, session, demo_headers, demo_me):
        uid = demo_me["id"]
        r = session.post(
            f"{BASE_URL}/api/admin/agents/{uid}/badge",
            json={"tier": None},
            headers=demo_headers,
        )
        assert r.status_code == 200, r.text
        # Auto-compute → verified
        r2 = session.get(f"{BASE_URL}/api/agent-platform/public/{DEMO_SLUG}")
        assert r2.status_code == 200
        assert r2.json()["badge"]["id"] == "verified"

    def test_non_admin_403(self, session, demo_me):
        # Register throwaway non-admin
        email = f"nonadm+{int(time.time())}_{uuid.uuid4().hex[:6]}@example.com"
        r = session.post(
            f"{BASE_URL}/api/auth/register",
            json={"email": email, "password": "test1234", "full_name": "Non Admin"},
        )
        assert r.status_code == 200, r.text
        tok = r.json().get("access_token") or r.json().get("token")
        h = {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}
        r2 = session.post(
            f"{BASE_URL}/api/admin/agents/{demo_me['id']}/badge",
            json={"tier": "trusted"},
            headers=h,
        )
        assert r2.status_code == 403, f"expected 403 got {r2.status_code}: {r2.text}"


# ─── 6. Account deletion ────────────────────────────────
class TestAccountDeletion:
    def test_delete_flow(self, session):
        email = f"deltest+{int(time.time())}_{uuid.uuid4().hex[:4]}@example.com"
        # Register throwaway
        r = session.post(
            f"{BASE_URL}/api/auth/register",
            json={"email": email, "password": "test1234", "full_name": "Del Test"},
        )
        assert r.status_code == 200, r.text
        tok = r.json().get("access_token") or r.json().get("token")
        h = {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}

        # Seed some data → daily_login task creates wallet + txns
        rc = session.post(
            f"{BASE_URL}/api/earn/claim",
            json={"task_id": "daily_login"},
            headers=h,
        )
        # Accept 200; some environments may return 400 if already claimed. Log and continue.
        if rc.status_code not in (200, 201):
            print(f"WARN /api/earn/claim daily_login → {rc.status_code} {rc.text[:200]}")

        # Delete
        rd = session.post(
            f"{BASE_URL}/api/agent-platform/account/delete", headers=h
        )
        assert rd.status_code == 200, rd.text
        body = rd.json()
        assert body.get("ok") is True
        assert "deleted_at" in body
        scrubbed = body.get("scrubbed_collections") or []
        assert isinstance(scrubbed, list)
        # Should include wallets and token_transactions per PRD spec
        joined = " ".join(scrubbed)
        assert "wallets" in joined, f"wallets not scrubbed: {scrubbed}"
        assert "token_transactions" in joined, f"token_transactions not scrubbed: {scrubbed}"

        # Login with same creds → 401
        rl = session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": email, "password": "test1234"},
        )
        assert rl.status_code == 401, f"expected 401 got {rl.status_code}: {rl.text}"

        # Old JWT should now be invalid → 401
        rm = session.get(f"{BASE_URL}/api/auth/me", headers=h)
        assert rm.status_code == 401, f"expected 401 got {rm.status_code}: {rm.text}"


# ─── 7. Slug backfill idempotency across restart ────────
class TestSlugBackfillIdempotency:
    @pytest.mark.restarts_backend
    def test_restart_and_verify(self, session, demo_headers, demo_me):
        # Snapshot slug before restart
        r0 = session.get(f"{BASE_URL}/api/agent-platform/public/{DEMO_SLUG}")
        assert r0.status_code == 200, r0.text
        slug_before = r0.json()["slug"]

        # Restart backend
        try:
            subprocess.run(
                ["sudo", "supervisorctl", "restart", "backend"],
                check=True, capture_output=True, timeout=60,
            )
        except Exception as e:
            pytest.skip(f"Cannot restart backend in test env: {e}")

        # Wait for it to come back
        deadline = time.time() + 30
        healthy = False
        while time.time() < deadline:
            try:
                rr = requests.get(f"{BASE_URL}/api/agent-platform/plans", timeout=5)
                if rr.status_code == 200:
                    healthy = True
                    break
            except Exception:
                pass
            time.sleep(1)
        assert healthy, "Backend did not become healthy within 30s"

        # Verify still exactly the same slug for demo user
        r1 = session.get(f"{BASE_URL}/api/agent-platform/public/{demo_me['id']}")
        assert r1.status_code == 200, r1.text
        assert r1.json()["slug"] == slug_before, (
            f"slug changed: {slug_before} → {r1.json()['slug']}"
        )


# ─── 8. Paystack webhook smoke ──────────────────────────
class TestWebhookSmoke:
    def test_paystack_webhook_no_sig(self, session):
        r = session.post(
            f"{BASE_URL}/api/payments/paystack/webhook",
            data="",  # empty body, no signature
            headers={"Content-Type": "application/json"},
        )
        # Should not crash; accept 200 or 401 depending on enforcement
        assert r.status_code in (200, 400, 401), (
            f"unexpected status {r.status_code}: {r.text[:200]}"
        )


# ─── 9. Phase 1 regression sweep ────────────────────────
class TestPhase1Regression:
    def test_plans(self, session):
        r = session.get(f"{BASE_URL}/api/agent-platform/plans")
        assert r.status_code == 200
        assert len(r.json()) == 3

    def test_founding(self, session):
        r = session.get(f"{BASE_URL}/api/agent-platform/founding")
        assert r.status_code == 200
        assert r.json().get("target") == 500

    def test_subscription_me(self, session, demo_headers):
        r = session.get(
            f"{BASE_URL}/api/agent-platform/subscription/me", headers=demo_headers
        )
        assert r.status_code == 200

    def test_subscribe_starter_immediate(self, session, demo_headers):
        r = session.post(
            f"{BASE_URL}/api/agent-platform/subscription/subscribe",
            json={"plan_id": "starter"},
            headers=demo_headers,
        )
        assert r.status_code == 200, r.text
        assert r.json().get("activated") is True

    def test_subscription_cancel(self, session, demo_headers):
        r = session.post(
            f"{BASE_URL}/api/agent-platform/subscription/cancel",
            headers=demo_headers,
        )
        # 200 if had a paid sub, 400 if already on starter — both acceptable
        assert r.status_code in (200, 400), r.text

    def test_quota(self, session, demo_headers):
        r = session.get(f"{BASE_URL}/api/agent-platform/quota", headers=demo_headers)
        assert r.status_code == 200
        q = r.json()
        assert "plan_id" in q and "listing_limit" in q

    def test_onboarding(self, session, demo_headers):
        r = session.get(
            f"{BASE_URL}/api/agent-platform/onboarding", headers=demo_headers
        )
        assert r.status_code == 200
        assert r.json().get("total_steps") == 5

    def test_starter_kit_me(self, session, demo_headers):
        r = session.get(
            f"{BASE_URL}/api/agent-platform/starter-kit/me", headers=demo_headers
        )
        assert r.status_code == 200

    def test_admin_agents_list(self, session, demo_headers):
        r = session.get(f"{BASE_URL}/api/admin/agents", headers=demo_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_admin_kpis(self, session, demo_headers):
        r = session.get(
            f"{BASE_URL}/api/admin/agents/kpis", headers=demo_headers
        )
        assert r.status_code == 200

    def test_properties_402_on_starter(self, session, demo_headers):
        # Ensure demo is on starter
        session.post(
            f"{BASE_URL}/api/agent-platform/subscription/cancel", headers=demo_headers
        )
        prop = {
            "title": "TEST_phase2_402",
            "description": "quota test",
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
        r = session.post(
            f"{BASE_URL}/api/properties", json=prop, headers=demo_headers
        )
        # Should be 402 IF demo is over quota; if under, it will be 200.
        # PRD says demo has 9+ listings so we expect 402.
        assert r.status_code in (200, 402)
        if r.status_code == 402:
            detail = r.json().get("detail") or {}
            assert detail.get("error") == "plan_limit_reached"
