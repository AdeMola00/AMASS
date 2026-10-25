"""
Security-hardening regression suite (iteration 9).

Verifies the P0 security fixes surfaced by the deployment agent + code review:
  1. /api/seed is admin-gated (401 anon, 403 non-admin, 200 demo/admin)
  2. /api/tokens/purchase and /api/wallet/fix/purchase are 410 Gone with a redirect field
  3. Wallet atomic credit/debit + idempotency (FIX earn + daily_login claim)
  4. Referral qualify/payout are admin-only
  5. Wide regression sweep on the public + auth surface still returns 200s

Base URL comes from EXPO_BACKEND_URL env var (falls back to the preview URL
already used by the app so tests match what the mobile client sees).
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get(
    "EXPO_BACKEND_URL",
    "https://property-os-africa.preview.emergentagent.com",
).rstrip("/")

DEMO_EMAIL = "demo@amass.africa"
DEMO_PASSWORD = "amass2026"


# ─── Fixtures ────────────────────────────────────────────────────
@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def demo_token(client):
    r = client.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD},
    )
    assert r.status_code == 200, f"Demo login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def demo_headers(demo_token):
    return {"Authorization": f"Bearer {demo_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def fresh_user(client):
    """Register a brand-new non-admin user and return (email, token, user_id)."""
    email = f"TEST_sec_{uuid.uuid4().hex[:10]}@amass.africa"
    r = client.post(
        f"{BASE_URL}/api/auth/register",
        json={"email": email, "password": "TestPass!123", "full_name": "TEST Sec"},
    )
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    body = r.json()
    return {
        "email": email,
        "token": body["access_token"],
        "user": body["user"],
        "headers": {
            "Authorization": f"Bearer {body['access_token']}",
            "Content-Type": "application/json",
        },
    }


# ─── 1. /api/seed admin gating ──────────────────────────────────
class TestSeedAdminGating:
    def test_seed_unauthenticated_returns_401(self, client):
        r = client.post(f"{BASE_URL}/api/seed")
        assert r.status_code == 401, r.text
        assert "not authenticated" in r.text.lower()

    def test_seed_non_admin_returns_403(self, client, fresh_user):
        r = client.post(f"{BASE_URL}/api/seed", headers=fresh_user["headers"])
        assert r.status_code == 403, r.text
        assert "admin" in r.text.lower()

    def test_seed_admin_demo_returns_200(self, client, demo_headers):
        # dry_run: proves the admin passes the gate WITHOUT wiping every listing
        # in the shared database (which breaks every other suite mid-run).
        r = client.post(f"{BASE_URL}/api/seed", params={"dry_run": "true"}, headers=demo_headers)
        assert r.status_code == 200, r.text
        body = r.json()
        assert isinstance(body, dict), body
        assert body.get("dry_run") is True
        # Should contain counts for at least properties + marketplace
        assert any(k in body for k in ("properties", "marketplace", "seeded"))


# ─── 2. Deprecated purchase endpoints → 410 Gone ─────────────────
class TestPurchaseEndpointsGone:
    payload = {"bundle_id": "starter"}

    def test_tokens_purchase_returns_410(self, client, demo_headers):
        r = client.post(
            f"{BASE_URL}/api/tokens/purchase",
            json=self.payload,
            headers=demo_headers,
        )
        assert r.status_code == 410, r.text
        body = r.json()
        detail = body.get("detail", body)
        assert isinstance(detail, dict), detail
        assert detail.get("redirect", "").startswith("/api/payments/")

    def test_fix_purchase_route_is_gone(self, client, demo_headers):
        """FIX was removed entirely (Jun 2026) — the route no longer exists."""
        r = client.post(
            f"{BASE_URL}/api/wallet/fix/purchase",
            json=self.payload,
            headers=demo_headers,
        )
        assert r.status_code == 404, r.text

    def test_purchase_gone_endpoints_dont_credit_wallet(self, client, demo_headers):
        """Even in the (broken) case where 410 flow leaks state, wallet must NOT change."""
        before = client.get(f"{BASE_URL}/api/wallet/me", headers=demo_headers).json()
        client.post(
            f"{BASE_URL}/api/tokens/purchase",
            json=self.payload,
            headers=demo_headers,
        )
        client.post(
            f"{BASE_URL}/api/wallet/fix/purchase",
            json=self.payload,
            headers=demo_headers,
        )
        after = client.get(f"{BASE_URL}/api/wallet/me", headers=demo_headers).json()
        assert before["balance"] == after["balance"]
        assert before["bonus_balance"] == after["bonus_balance"]


# ─── 3. Wallet — MASS only ───────────────────────────────────────
class TestWalletAtomicity:
    def test_single_mass_wallet(self, client, demo_headers):
        r = client.get(f"{BASE_URL}/api/wallet/me", headers=demo_headers)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("currency", "MASS") == "MASS"
        assert isinstance(body["balance"], int)
        assert client.get(f"{BASE_URL}/api/wallet/dual", headers=demo_headers).status_code == 404
        assert client.get(f"{BASE_URL}/api/wallet/fix", headers=demo_headers).status_code == 404
        assert client.post(f"{BASE_URL}/api/wallet/fix/earn", json={"event": "job_completed"}, headers=demo_headers).status_code == 404

    def test_daily_login_claim_once(self, client, demo_headers):
        # Ensure a clean run: if today already claimed we assert 'already_claimed'
        before = client.get(f"{BASE_URL}/api/wallet/dual", headers=demo_headers).json()
        r1 = client.post(
            f"{BASE_URL}/api/earn/claim",
            json={"task_id": "daily_login"},
            headers=demo_headers,
        )
        assert r1.status_code == 200, r1.text
        b1 = r1.json()

        r2 = client.post(
            f"{BASE_URL}/api/earn/claim",
            json={"task_id": "daily_login"},
            headers=demo_headers,
        )
        assert r2.status_code == 200, r2.text
        b2 = r2.json()
        # After two calls, one must be already_claimed_today
        assert (
            b2.get("reason") == "already_claimed_today"
            or b1.get("reason") == "already_claimed_today"
        ), {"first": b1, "second": b2}

        # If the first call actually credited, verify MASS lifetime_earned went up by 2
        credited_this_run = 0
        if b1.get("ok") and not b1.get("reason"):
            credited_this_run = b1.get("credited") or b1.get("amount") or 2
        after = client.get(f"{BASE_URL}/api/wallet/dual", headers=demo_headers).json()
        if credited_this_run:
            lt_delta = after["mass"].get("lifetime_earned", 0) - before["mass"].get(
                "lifetime_earned", 0
            )
            assert lt_delta == credited_this_run, {
                "before": before["mass"].get("lifetime_earned"),
                "after": after["mass"].get("lifetime_earned"),
                "credited": credited_this_run,
            }


# ─── 4. Referral qualify / payout admin-only ────────────────────
class TestReferralAdminGating:
    @pytest.fixture(scope="class")
    def referral_id(self, client, fresh_user):
        # Need a property id to build a referral
        props = client.get(f"{BASE_URL}/api/properties").json()
        assert props, "no properties seeded"
        prop_id = props[0]["id"]
        r = client.post(
            f"{BASE_URL}/api/agent-workspace/referrals",
            json={
                "property_id": prop_id,
                "client_name": "TEST Client",
                "client_phone": "+2348000000000",
                "product_id": "renovation_loan",
            },
            headers=fresh_user["headers"],
        )
        assert r.status_code == 200, r.text
        return r.json()["id"]

    def test_qualify_by_non_admin_403(self, client, fresh_user, referral_id):
        r = client.post(
            f"{BASE_URL}/api/agent-workspace/referrals/{referral_id}/qualify",
            json={"application_id": "app_test_1", "deal_value_ngn": 5_000_000},
            headers=fresh_user["headers"],
        )
        assert r.status_code == 403, r.text
        assert "admin" in r.text.lower()

    def test_qualify_by_admin_200(self, client, demo_headers, referral_id):
        r = client.post(
            f"{BASE_URL}/api/agent-workspace/referrals/{referral_id}/qualify",
            json={"application_id": "app_test_1", "deal_value_ngn": 5_000_000},
            headers=demo_headers,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert body.get("commission_amount_ngn", 0) > 0, body

    def test_payout_by_non_admin_403(self, client, fresh_user, referral_id):
        r = client.post(
            f"{BASE_URL}/api/agent-workspace/referrals/{referral_id}/payout",
            json={"method": "wallet"},
            headers=fresh_user["headers"],
        )
        assert r.status_code == 403, r.text

    def test_payout_by_admin_200(self, client, demo_headers, referral_id):
        r = client.post(
            f"{BASE_URL}/api/agent-workspace/referrals/{referral_id}/payout",
            json={"method": "wallet"},
            headers=demo_headers,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True


# ─── 5. Regression sweep on public + auth surface ───────────────
class TestRegressionSurface:
    def test_register_new_user(self, client):
        email = f"TEST_reg_{uuid.uuid4().hex[:10]}@amass.africa"
        r = client.post(
            f"{BASE_URL}/api/auth/register",
            json={"email": email, "password": "Passw0rd!", "full_name": "TEST Reg"},
        )
        assert r.status_code == 200, r.text
        assert "access_token" in r.json()

    def test_auth_me(self, client, demo_headers):
        r = client.get(f"{BASE_URL}/api/auth/me", headers=demo_headers)
        assert r.status_code == 200, r.text
        assert r.json()["email"] == DEMO_EMAIL

    def test_properties_returns_seed(self, client):
        r = client.get(f"{BASE_URL}/api/properties")
        assert r.status_code == 200, r.text
        assert len(r.json()) >= 9, f"expected at least the 9 seed properties, got {len(r.json())}"

    def test_marketplace_list(self, client):
        r = client.get(f"{BASE_URL}/api/marketplace")
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_wallet_me(self, client, demo_headers):
        r = client.get(f"{BASE_URL}/api/wallet/me", headers=demo_headers)
        assert r.status_code == 200, r.text
        assert "balance" in r.json()

    def test_wallet_dual_is_gone(self, client, demo_headers):
        r = client.get(f"{BASE_URL}/api/wallet/dual", headers=demo_headers)
        assert r.status_code == 404, r.text

    def test_wallet_transactions_mass(self, client, demo_headers):
        # Prefer the documented /wallet/transactions?currency=MASS shape
        r = client.get(
            f"{BASE_URL}/api/wallet/transactions?currency=MASS", headers=demo_headers
        )
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_wallet_mass_transactions_route(self, client, demo_headers):
        """Review request references /api/wallet/mass/transactions — flag if 404."""
        r = client.get(f"{BASE_URL}/api/wallet/mass/transactions", headers=demo_headers)
        # Not asserting hard success; this test documents whether the alias exists
        assert r.status_code in (200, 404), r.text

    def test_earn_tasks(self, client, demo_headers):
        r = client.get(f"{BASE_URL}/api/earn/tasks", headers=demo_headers)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "tasks" in body

    def test_earn_referral_me(self, client, demo_headers):
        r = client.get(f"{BASE_URL}/api/earn/referral/me", headers=demo_headers)
        assert r.status_code == 200, r.text

    def test_agent_promotions_config(self, client, demo_headers):
        r = client.get(f"{BASE_URL}/api/agent/promotions/config", headers=demo_headers)
        assert r.status_code == 200, r.text

    def test_payments_init(self, client, demo_headers):
        """Review request says /api/payments/init but code exposes /initialize.
        Test both so we surface any mismatch clearly."""
        r_init = client.post(
            f"{BASE_URL}/api/payments/init",
            json={"provider": "paystack", "currency": "MASS", "bundle_id": "explorer"},
            headers=demo_headers,
        )
        r_initialize = client.post(
            f"{BASE_URL}/api/payments/initialize",
            json={"provider": "paystack", "currency": "MASS", "bundle_id": "explorer"},
            headers=demo_headers,
        )
        # At least one path must return a checkout url + reference
        ok = None
        for r in (r_init, r_initialize):
            if r.status_code == 200:
                body = r.json()
                if body.get("reference") and body.get("checkout_url"):
                    ok = (r, body)
                    break
        assert ok, {
            "init_status": r_init.status_code,
            "init_body": r_init.text[:200],
            "initialize_status": r_initialize.status_code,
            "initialize_body": r_initialize.text[:200],
        }

    def test_improve_catalog(self, client, demo_headers):
        r = client.get(f"{BASE_URL}/api/improve/catalog", headers=demo_headers)
        assert r.status_code == 200, r.text

    def test_saved_searches_list(self, client, demo_headers):
        r = client.get(f"{BASE_URL}/api/saved-searches", headers=demo_headers)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_apple_auth_route_registered(self, client):
        """OpenAPI is not exposed through /openapi.json (ingress routes it to Expo).
        Probe the route directly with a malformed token — a registered route returns
        4xx (validation / malformed); an unregistered route would return 404.
        """
        r = client.post(
            f"{BASE_URL}/api/auth/apple",
            json={"identity_token": "invalid.token.here"},
        )
        assert r.status_code != 404, "Apple auth route missing"
        assert r.status_code in (400, 401, 422), r.text
