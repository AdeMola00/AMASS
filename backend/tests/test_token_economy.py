"""Legacy wallet / unlock surface — regression against the unified monetization spec.

- welcome bonus = admin-editable `monetization.welcome_bonus.MASS`
- legacy purchase / subscribe endpoints are 410 GONE (payments go through /api/payments/initialize)
- legacy POST /api/properties/unlock is an alias of POST /api/unlocks (zone pricing, one charge, idempotent)
- locked vs full property view, 402 on insufficient MASS, unlock listing, daily-login earn
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


def _welcome_mass() -> int:
    cfg = requests.get(f"{BASE_URL}/api/monetization/config", timeout=15).json()
    return int(cfg["welcome_bonus"]["MASS"])


def _props(headers=None):
    r = requests.get(f"{BASE_URL}/api/properties?limit=100", headers=headers, timeout=15)
    assert r.status_code == 200
    return r.json()


def _gated(headers=None, max_cost=None):
    """A token-gated property (optionally affordable with `max_cost`)."""
    for p in _props(headers):
        cost = int(p.get("token_cost") or 0)
        if cost > 0 and not p.get("unlocked") and (max_cost is None or cost <= max_cost):
            return p
    return None


# ── Wallet basics ──────────────────────────────────────────────
class TestWalletInit:
    def test_new_user_gets_configured_welcome_mass(self, fresh_headers):
        welcome = _welcome_mass()
        r = requests.get(f"{BASE_URL}/api/wallet/me", headers=fresh_headers, timeout=15)
        assert r.status_code == 200, r.text
        w = r.json()
        assert w["bonus_balance"] == welcome
        assert w["balance"] == 0
        assert w["spendable"] == welcome
        assert w["lifetime_earned"] == welcome

    def test_wallet_me_requires_auth(self):
        assert requests.get(f"{BASE_URL}/api/wallet/me", timeout=15).status_code == 401


# ── Legacy purchase surface is gone ───────────────────────────
class TestLegacyPurchaseGone:
    def test_tokens_purchase_is_410(self, fresh_headers):
        r = requests.post(f"{BASE_URL}/api/tokens/purchase", json={"bundle_id": "hunter", "provider": "paystack"}, headers=fresh_headers, timeout=15)
        assert r.status_code == 410
        assert r.json()["detail"]["redirect"] == "/api/payments/initialize"


# ── Property unlock & views ───────────────────────────────────
class TestPropertyUnlock:
    def test_list_items_carry_pricing_fields(self):
        docs = _props()
        assert docs
        for p in docs:
            assert "token_cost" in p and "access_cost" in p and "unlocked" in p
            assert p["zone_tier"] in ("A", "B", "C", "D")
            assert p["token_cost"] == p["access_cost"]
            # Contact never leaks on the list for locked items
            if not p["unlocked"]:
                assert "agent_phone" not in p and "agent_email" not in p

    def test_locked_view_before_unlock(self, fresh_headers):
        gated = _gated(fresh_headers)
        assert gated is not None
        detail = requests.get(f"{BASE_URL}/api/properties/{gated['id']}", headers=fresh_headers, timeout=15).json()
        assert detail["unlocked"] is False
        assert detail["agent_name"] is None
        assert detail["agent_id"] is None
        assert detail["mandate"] is None
        assert len(detail["images"]) <= 1
        assert detail["location"] == detail.get("city", "")
        # Same fee as the list (single source of truth)
        assert detail["token_cost"] == gated["token_cost"]

    def test_legacy_unlock_alias_charges_zone_fee_once(self, fresh_headers):
        welcome = _welcome_mass()
        gated = _gated(fresh_headers, max_cost=welcome)
        if gated is None:
            pytest.skip("no property affordable with the welcome bonus")
        cost = gated["token_cost"]
        r = requests.post(f"{BASE_URL}/api/properties/unlock", json={"property_id": gated["id"]}, headers=fresh_headers, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["ok"] is True
        assert data["tokens_paid"] == cost
        assert data["balance"] == welcome - cost
        # Entitlement is the shared one used by POST /api/unlocks
        assert data["unlock"]["feature_key"] == "property"
        assert data["unlock"]["status"] == "active"

        # Second call → free repeat, no second charge
        r2 = requests.post(f"{BASE_URL}/api/properties/unlock", json={"property_id": gated["id"]}, headers=fresh_headers, timeout=15)
        assert r2.status_code == 200
        assert r2.json()["already_unlocked"] is True
        assert r2.json()["tokens_paid"] == 0
        w = requests.get(f"{BASE_URL}/api/wallet/me", headers=fresh_headers, timeout=15).json()
        assert w["spendable"] == welcome - cost

        # Full view afterwards + listed in both unlock surfaces
        detail = requests.get(f"{BASE_URL}/api/properties/{gated['id']}", headers=fresh_headers, timeout=15).json()
        assert detail["unlocked"] is True
        assert detail.get("agent_name") is not None
        mine = requests.get(f"{BASE_URL}/api/unlocks/mine?featureKey=property", headers=fresh_headers, timeout=15).json()
        assert any(i["property"]["id"] == gated["id"] for i in mine["items"])
        legacy = requests.get(f"{BASE_URL}/api/wallet/unlocks", headers=fresh_headers, timeout=15).json()
        assert any((d.get("property") or {}).get("id") == gated["id"] for d in legacy)

    def test_402_when_balance_insufficient(self, fresh_headers):
        welcome = _welcome_mass()
        expensive = next((p for p in _props(fresh_headers) if int(p.get("token_cost") or 0) > welcome), None)
        if expensive is None:
            pytest.skip("no property priced above the welcome bonus")
        r = requests.post(f"{BASE_URL}/api/properties/unlock", json={"property_id": expensive["id"]}, headers=fresh_headers, timeout=15)
        assert r.status_code == 402, r.text
        detail = r.json()["detail"]
        assert detail["error"] == "insufficient_tokens"
        assert detail["required"] == expensive["token_cost"]
        assert detail["balance"] == welcome
        assert detail["shortfall"] == expensive["token_cost"] - welcome
        # No debit happened
        w = requests.get(f"{BASE_URL}/api/wallet/me", headers=fresh_headers, timeout=15).json()
        assert w["spendable"] == welcome

    def test_free_amass_sale_follows_admin_switch(self, fresh_headers):
        cfg = requests.get(f"{BASE_URL}/api/settings/pricing", timeout=15).json()
        exclusive = next((p for p in _props(fresh_headers) if p.get("is_amass_exclusive") and (p.get("listing_type") in ("sale", "buy"))), None)
        if exclusive is None:
            pytest.skip("No AMASS Exclusive sale property in seed")
        if cfg.get("free_amass_sale"):
            assert exclusive["token_cost"] == 0 and exclusive["unlocked"] is True
        else:
            assert exclusive["token_cost"] > 0


# ── Earn ──────────────────────────────────────────────────────
class TestEarn:
    def test_daily_login_earn_and_already_claimed(self, fresh_headers):
        r1 = requests.post(f"{BASE_URL}/api/wallet/earn?task_id=daily_login", headers=fresh_headers, timeout=15)
        assert r1.status_code == 200, r1.text
        assert r1.json().get("credited") == 2
        r2 = requests.post(f"{BASE_URL}/api/wallet/earn?task_id=daily_login", headers=fresh_headers, timeout=15)
        assert r2.status_code == 200
        assert r2.json().get("ok") is False
        assert "already_claimed" in r2.json().get("reason", "")

    def test_unknown_earn_task_400(self, fresh_headers):
        assert requests.post(f"{BASE_URL}/api/wallet/earn?task_id=bogus", headers=fresh_headers, timeout=15).status_code == 400


# ── Regression ────────────────────────────────────────────────
class TestRegression:
    def test_auth_login_demo(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "demo@amass.africa", "password": "amass2026"}, timeout=15)
        assert r.status_code == 200
        assert "access_token" in r.json()

    def test_property_view_increments(self, fresh_headers):
        gated = _gated(fresh_headers)
        assert gated is not None
        r = requests.post(f"{BASE_URL}/api/properties/{gated['id']}/view", headers=fresh_headers, timeout=15)
        assert r.status_code == 200
        assert r.json().get("ok") is True
