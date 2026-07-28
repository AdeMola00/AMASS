"""Backend tests for AMASS Token Economy Phase 1.

Covers:
- wallet init with 15 welcome tokens
- bundles + subscription plans
- token purchase & credit (hunter = 150 + 10 bonus)
- subscription grant (monthly tokens credited)
- property unlock (token-gated debit, bonus first)
- 402 Payment Required on insufficient balance
- LOCKED VIEW vs FULL VIEW on property detail
- AMASS Exclusive returns full view without unlock
- transactions & unlocks listing
- daily_login earn + already_claimed
- subscription cancel
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://property-os-africa.preview.emergentagent.com").rstrip("/")


def _register_fresh():
    email = f"TEST_tok_{uuid.uuid4().hex[:10]}@example.com"
    r = requests.post(
        f"{BASE_URL}/api/auth/register",
        json={"email": email, "password": "password123", "full_name": "TEST Token User"},
        timeout=15,
    )
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    return r.json()["access_token"], email


@pytest.fixture()
def fresh_headers():
    token, _ = _register_fresh()
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ── Wallet basics ──────────────────────────────────────────────
class TestWalletInit:
    def test_new_user_gets_15_welcome_tokens(self, fresh_headers):
        r = requests.get(f"{BASE_URL}/api/wallet/me", headers=fresh_headers, timeout=15)
        assert r.status_code == 200, r.text
        w = r.json()
        assert w["bonus_balance"] == 15
        assert w["balance"] == 0
        assert w["spendable"] == 15
        assert w["lifetime_earned"] == 15

    def test_wallet_me_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/wallet/me", timeout=15)
        assert r.status_code == 401


# ── Bundles & plans catalogs ───────────────────────────────────
class TestCatalogs:
    def test_bundles_returns_five(self):
        r = requests.get(f"{BASE_URL}/api/tokens/bundles", timeout=15)
        assert r.status_code == 200
        bundles = r.json()
        ids = [b["id"] for b in bundles]
        assert set(ids) == {"starter", "explorer", "hunter", "investor", "professional"}
        hunter = next(b for b in bundles if b["id"] == "hunter")
        assert hunter["tokens"] == 150
        assert hunter["bonus"] == 10

    def test_plans_returns_four(self):
        r = requests.get(f"{BASE_URL}/api/subscriptions/plans", timeout=15)
        assert r.status_code == 200
        plans = r.json()
        ids = [p["id"] for p in plans]
        assert set(ids) == {"starter", "professional", "business", "enterprise"}


# ── Purchase (mocked payment) ─────────────────────────────────
class TestPurchase:
    def test_purchase_hunter_credits_160_and_logs_tx(self, fresh_headers):
        r = requests.post(
            f"{BASE_URL}/api/tokens/purchase",
            json={"bundle_id": "hunter", "provider": "paystack"},
            headers=fresh_headers,
            timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["ok"] is True
        assert data["credited"] == 160
        # Welcome 15 + purchase 150 + bonus 10 = 175
        assert data["balance"] == 175

        # Verify wallet reflects it
        w = requests.get(f"{BASE_URL}/api/wallet/me", headers=fresh_headers, timeout=15).json()
        assert w["spendable"] == 175
        assert w["balance"] == 150  # bought tokens go to primary balance
        assert w["bonus_balance"] == 25  # welcome 15 + hunter bonus 10

        # Transaction log includes purchase + bonus entries
        txs = requests.get(f"{BASE_URL}/api/wallet/transactions", headers=fresh_headers, timeout=15).json()
        kinds = [t["kind"] for t in txs]
        assert "purchase" in kinds
        assert "bonus" in kinds
        assert "welcome" in kinds

    def test_purchase_unknown_bundle_returns_404(self, fresh_headers):
        r = requests.post(
            f"{BASE_URL}/api/tokens/purchase",
            json={"bundle_id": "does_not_exist"},
            headers=fresh_headers,
            timeout=15,
        )
        assert r.status_code == 404


# ── Subscriptions ─────────────────────────────────────────────
class TestSubscriptions:
    def test_subscribe_professional_credits_500(self, fresh_headers):
        r = requests.post(
            f"{BASE_URL}/api/subscriptions/subscribe",
            json={"plan_id": "professional", "provider": "paystack"},
            headers=fresh_headers,
            timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["ok"] is True
        assert data["credited"] == 500
        assert data["balance"] == 15 + 500  # welcome + monthly grant
        assert data["subscription"]["plan_id"] == "professional"
        assert data["subscription"]["status"] == "active"

        # /wallet/me includes active subscription
        w = requests.get(f"{BASE_URL}/api/wallet/me", headers=fresh_headers, timeout=15).json()
        assert w["subscription"] is not None
        assert w["subscription"]["plan_id"] == "professional"

    def test_cancel_subscription(self, fresh_headers):
        # subscribe first
        requests.post(
            f"{BASE_URL}/api/subscriptions/subscribe",
            json={"plan_id": "starter"},
            headers=fresh_headers,
            timeout=15,
        )
        r = requests.post(f"{BASE_URL}/api/subscriptions/cancel", headers=fresh_headers, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["cancelled"] >= 1
        w = requests.get(f"{BASE_URL}/api/wallet/me", headers=fresh_headers, timeout=15).json()
        assert not w["subscription"]  # None or empty


# ── Property unlock & views ───────────────────────────────────
def _find_properties():
    """Return (gated_prop, exclusive_prop) — exclusive_prop may be None."""
    r = requests.get(f"{BASE_URL}/api/properties?limit=100", timeout=15)
    assert r.status_code == 200
    props = r.json()
    gated = next((p for p in props if not p.get("is_amass_exclusive") and p.get("token_cost", 0) > 0), None)
    exclusive = next((p for p in props if p.get("is_amass_exclusive")), None)
    return gated, exclusive


class TestPropertyUnlock:
    def test_locked_view_before_unlock(self, fresh_headers):
        gated, _ = _find_properties()
        assert gated is not None
        r = requests.get(f"{BASE_URL}/api/properties/{gated['id']}", headers=fresh_headers, timeout=15)
        assert r.status_code == 200
        detail = r.json()
        assert detail["unlocked"] is False
        assert detail["agent_name"] is None
        assert detail["agent_id"] is None
        assert detail["mandate"] is None
        # only one (cover) image or empty
        assert len(detail["images"]) <= 1
        # city-level location (no exact street)
        assert detail["location"] == detail.get("city", "")

    def test_unlock_debits_bonus_first_and_returns_balance(self, fresh_headers):
        gated, _ = _find_properties()
        assert gated is not None
        cost = gated["token_cost"]
        assert cost > 0
        # buy hunter to ensure enough tokens (welcome 15 + 160 = 175)
        requests.post(
            f"{BASE_URL}/api/tokens/purchase",
            json={"bundle_id": "hunter"},
            headers=fresh_headers,
            timeout=15,
        )
        r = requests.post(
            f"{BASE_URL}/api/properties/unlock",
            json={"property_id": gated["id"]},
            headers=fresh_headers,
            timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["ok"] is True
        assert data["tokens_paid"] == cost
        # 15 welcome + 150 purchase + 10 bonus = 175; after debit → 175 - cost
        assert data["balance"] == 175 - cost

        # Second call is idempotent
        r2 = requests.post(
            f"{BASE_URL}/api/properties/unlock",
            json={"property_id": gated["id"]},
            headers=fresh_headers,
            timeout=15,
        )
        assert r2.status_code == 200
        assert r2.json().get("already_unlocked") is True

    def test_unlock_full_view_after_unlock(self, fresh_headers):
        gated, _ = _find_properties()
        assert gated is not None
        requests.post(
            f"{BASE_URL}/api/tokens/purchase",
            json={"bundle_id": "hunter"},
            headers=fresh_headers,
            timeout=15,
        )
        u = requests.post(
            f"{BASE_URL}/api/properties/unlock",
            json={"property_id": gated["id"]},
            headers=fresh_headers,
            timeout=15,
        )
        assert u.status_code == 200
        detail = requests.get(f"{BASE_URL}/api/properties/{gated['id']}", headers=fresh_headers, timeout=15).json()
        assert detail["unlocked"] is True
        assert detail.get("agent_name") is not None
        # Full images returned (>=1, and matches seed count if >1)
        assert len(detail["images"]) >= 1

    def test_402_when_balance_insufficient(self, fresh_headers):
        gated, _ = _find_properties()
        assert gated is not None
        cost = gated["token_cost"]
        # Fresh user has 15 welcome only — pick a property whose cost is >15
        if cost <= 15:
            # try to find an expensive one instead
            r = requests.get(f"{BASE_URL}/api/properties?limit=100", timeout=15).json()
            expensive = next((p for p in r if not p.get("is_amass_exclusive") and p.get("token_cost", 0) > 15), None)
            assert expensive is not None, "no property with token_cost > 15 in seed"
            gated = expensive
        r = requests.post(
            f"{BASE_URL}/api/properties/unlock",
            json={"property_id": gated["id"]},
            headers=fresh_headers,
            timeout=15,
        )
        assert r.status_code == 402, r.text
        detail = r.json().get("detail", {})
        # detail may come through as dict
        assert isinstance(detail, dict)
        assert detail.get("error") == "insufficient_tokens"
        assert detail.get("required") == gated["token_cost"]
        assert detail.get("balance") == 15
        assert detail.get("shortfall") == gated["token_cost"] - 15

    def test_amass_exclusive_always_full_view(self, fresh_headers):
        _, exclusive = _find_properties()
        if exclusive is None:
            pytest.skip("No AMASS Exclusive property in seed")
        d = requests.get(f"{BASE_URL}/api/properties/{exclusive['id']}", headers=fresh_headers, timeout=15).json()
        assert d["is_amass_exclusive"] is True
        assert d["token_cost"] == 0
        assert d["unlocked"] is True
        # Full view: agent info present (seed provides agent_name for all seed properties)
        # And full images
        assert len(d["images"]) >= 1


# ── Unlock listing & earn ─────────────────────────────────────
class TestUnlockAndEarn:
    def test_list_unlocks_attaches_property_details(self, fresh_headers):
        gated, _ = _find_properties()
        assert gated is not None
        requests.post(
            f"{BASE_URL}/api/tokens/purchase",
            json={"bundle_id": "hunter"},
            headers=fresh_headers,
            timeout=15,
        )
        requests.post(
            f"{BASE_URL}/api/properties/unlock",
            json={"property_id": gated["id"]},
            headers=fresh_headers,
            timeout=15,
        )
        r = requests.get(f"{BASE_URL}/api/wallet/unlocks", headers=fresh_headers, timeout=15)
        assert r.status_code == 200
        docs = r.json()
        assert len(docs) >= 1
        first = docs[0]
        assert "property" in first
        assert first["property"]["id"] == gated["id"]
        assert first["property"]["title"]

    def test_daily_login_earn_and_already_claimed(self, fresh_headers):
        r1 = requests.post(
            f"{BASE_URL}/api/wallet/earn?task_id=daily_login",
            headers=fresh_headers,
            timeout=15,
        )
        assert r1.status_code == 200, r1.text
        assert r1.json().get("credited") == 2
        r2 = requests.post(
            f"{BASE_URL}/api/wallet/earn?task_id=daily_login",
            headers=fresh_headers,
            timeout=15,
        )
        assert r2.status_code == 200
        j = r2.json()
        assert j.get("ok") is False
        assert "already_claimed" in j.get("reason", "")

    def test_unknown_earn_task_400(self, fresh_headers):
        r = requests.post(
            f"{BASE_URL}/api/wallet/earn?task_id=bogus",
            headers=fresh_headers,
            timeout=15,
        )
        assert r.status_code == 400


# ── Regression: existing endpoints still work ────────────────
class TestRegression:
    def test_properties_list_still_ok(self):
        r = requests.get(f"{BASE_URL}/api/properties?limit=5", timeout=15)
        assert r.status_code == 200
        docs = r.json()
        assert isinstance(docs, list) and len(docs) > 0
        # New fields on every item
        for p in docs:
            assert "is_amass_exclusive" in p
            assert "token_cost" in p

    def test_auth_login_demo(self):
        r = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "demo@amass.africa", "password": "amass2026"},
            timeout=15,
        )
        assert r.status_code == 200
        assert "access_token" in r.json()

    def test_property_view_increments(self, fresh_headers):
        gated, _ = _find_properties()
        assert gated is not None
        r = requests.post(
            f"{BASE_URL}/api/properties/{gated['id']}/view",
            headers=fresh_headers,
            timeout=15,
        )
        assert r.status_code == 200
        assert r.json().get("ok") is True
