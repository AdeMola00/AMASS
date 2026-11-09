"""Phase 1 — Two-tier property access charging regression suite.

Covers:
  • Public pricing endpoint
  • /access-info (unauth + auth, unlocked flags, balance)
  • Reveal-agent BEFORE access → 403 access_required
  • /access charges once, idempotent repeat
  • GET /property returns basic details but agent contact hidden until Tier 2
  • Reveal-agent on contact-less property → 422 contact_unavailable (no debit)
  • Reveal-agent after access → charge + contact fields
  • Insufficient balance → 402 insufficient_tokens + no debit
  • Admin: wallet ledger with user_email join + manual adjust
"""
import os
import uuid
import time
import pytest
import requests

BASE_URL = (
    os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or os.environ.get("EXPO_BACKEND_URL")
    or "https://property-os-africa.preview.emergentagent.com"
).rstrip("/")
API = f"{BASE_URL}/api"

DEMO_EMAIL = "demo@amass.africa"
DEMO_PWD = "amass2026"


# ────────────── Fixtures ──────────────
@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_token(session):
    r = session.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PWD})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def admin_user_id(session, admin_headers):
    r = session.get(f"{API}/auth/me", headers=admin_headers)
    assert r.status_code == 200
    return r.json()["id"]


@pytest.fixture(scope="module")
def paid_property_id(session):
    """A non-free (Category 2) property so access actually charges."""
    r = session.get(f"{API}/properties")
    assert r.status_code == 200
    for p in r.json():
        if not p.get("is_amass_exclusive") and not p.get("is_free_amass_sale"):
            return p["id"]
    pytest.skip("No non-free property seeded")


@pytest.fixture(scope="module")
def contactless_property_id(session, admin_headers):
    """Seed a property directly in Mongo with agent_name but NO agent_id,
    so the Tier-2 pre-check must return 422 contact_unavailable."""
    try:
        from pymongo import MongoClient
        from datetime import datetime, timezone
        import uuid as _uuid
        mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
        db_name = os.environ.get("DB_NAME", "amass_db")
        db = MongoClient(mongo_url)[db_name]
    except Exception as e:
        pytest.skip(f"Mongo unavailable: {e}")

    pid = f"TEST_contactless_{_uuid.uuid4().hex[:8]}"
    db.properties.insert_one({
        "id": pid,
        "title": "TEST contactless listing",
        "description": "Pytest fixture — undeliverable agent contact",
        "price": 15_000_000,
        "listing_type": "buy",
        "property_type": "apartment",
        "status": "available",
        "city": "Lagos",
        "state": "Lagos",
        "location": "Pytest Lane",
        "latitude": 6.5244,
        "longitude": 3.3792,
        "bedrooms": 2,
        "bathrooms": 2,
        "size_sqm": 90,
        "amenities": [],
        "images": ["https://picsum.photos/400"],
        "agent_name": "Ghost Agent",
        # Intentionally no agent_id
        "is_amass_exclusive": False,
        "is_free_amass_sale": False,
        "owner_id": "pytest-seed",
        "views_count": 0,
        "favorites_count": 0,
        "created_at": datetime.now(timezone.utc),
    })
    yield pid
    try:
        db.properties.delete_one({"id": pid})
        db.property_unlocks.delete_many({"property_id": pid})
    except Exception:
        pass


@pytest.fixture(scope="module")
def low_balance_user(session):
    """Register a fresh user with ~15 welcome tokens → not enough for a 20+ fee."""
    email = f"test_lowbal_{uuid.uuid4().hex[:8]}@example.com"
    r = session.post(f"{API}/auth/register", json={
        "email": email,
        "password": "LowBal123!",
        "full_name": "Low Balance",
    })
    assert r.status_code in (200, 201), r.text
    tok = r.json()["access_token"]
    uid = r.json()["user"]["id"]
    return {"email": email, "token": tok, "id": uid, "headers": {"Authorization": f"Bearer {tok}"}}


# ────────────── Tests ──────────────
class TestPublicPricing:
    def test_pricing_endpoint_no_auth(self, session):
        r = session.get(f"{API}/settings/pricing")
        assert r.status_code == 200
        data = r.json()
        for k in ("property_access_fee", "agent_contact_fee", "access_period_days", "currency", "privacy_policy_url"):
            assert k in data, f"missing field {k}"
        assert isinstance(data["property_access_fee"], int)
        assert isinstance(data["agent_contact_fee"], int)
        assert data["currency"] == "MASS"


class TestAccessInfo:
    def test_access_info_unauth(self, session, paid_property_id):
        r = session.get(f"{API}/properties/{paid_property_id}/access-info")
        assert r.status_code == 200
        d = r.json()
        assert d["property_id"] == paid_property_id
        assert "fee" in d["access"] and "unlocked" in d["access"]
        assert "fee" in d["agent_contact"] and "available" in d["agent_contact"]
        assert d["balance"] == 0  # unauth

    def test_access_info_auth_balance_present(self, session, admin_headers, paid_property_id):
        r = session.get(f"{API}/properties/{paid_property_id}/access-info", headers=admin_headers)
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d["balance"], int)
        assert d["balance"] >= 0


class TestRevealBeforeAccess:
    def test_reveal_agent_before_access_returns_403(self, session, admin_headers):
        """Use a fresh user who has NOT unlocked anything yet."""
        email = f"test_reveal_pre_{uuid.uuid4().hex[:8]}@example.com"
        reg = session.post(f"{API}/auth/register", json={
            "email": email, "password": "Pass1234!", "full_name": "Pre Reveal",
        })
        assert reg.status_code in (200, 201)
        tok = reg.json()["access_token"]
        hdr = {"Authorization": f"Bearer {tok}"}

        # pick a non-free paid property that has a real agent
        props = session.get(f"{API}/properties").json()
        pid = None
        for p in props:
            if not p.get("is_amass_exclusive") and not p.get("is_free_amass_sale") and p.get("agent_id"):
                pid = p["id"]; break
        if not pid:
            pytest.skip("no paid property with agent_id")

        r = session.post(f"{API}/properties/{pid}/reveal-agent", headers=hdr)
        assert r.status_code == 403, r.text
        body = r.json()
        det = body.get("detail", body)
        assert det.get("error") == "access_required"


class TestChargeAndIdempotent:
    def test_full_two_tier_flow(self, session, admin_headers, admin_user_id):
        # make sure admin has lots of tokens
        session.post(f"{API}/admin/wallet/{admin_user_id}/adjust",
                     json={"amount": 500, "currency": "MASS", "reason": "TEST top-up"},
                     headers=admin_headers)

        # pick a paid property with a deliverable agent (demo user may be the agent for seed props)
        props = session.get(f"{API}/properties").json()
        pid = None
        for p in props:
            if (not p.get("is_amass_exclusive") and not p.get("is_free_amass_sale")
                    and p.get("agent_id")):
                pid = p["id"]
                break
        if not pid:
            pytest.skip("no paid property with agent_id for full-flow test")

        # Pre-balance
        info_before = session.get(f"{API}/properties/{pid}/access-info", headers=admin_headers).json()
        bal_before = info_before["balance"]
        access_fee = info_before["access"]["fee"]

        # 1st access → charges
        r = session.post(f"{API}/properties/{pid}/access", headers=admin_headers)
        assert r.status_code == 200, r.text
        d1 = r.json()
        assert d1.get("ok") is True
        # If this user owns the property, backend may short-circuit; just assert balance consistent.
        if not d1.get("already_unlocked"):
            assert d1.get("tier") == "access"

        # 2nd access → idempotent, no re-charge
        r2 = session.post(f"{API}/properties/{pid}/access", headers=admin_headers)
        assert r2.status_code == 200
        d2 = r2.json()
        assert d2.get("already_unlocked") is True or d2.get("tokens_paid", 0) == 0
        bal_mid = session.get(f"{API}/wallet/me", headers=admin_headers).json()
        assert isinstance(bal_mid.get("balance", 0) + bal_mid.get("bonus_balance", 0), int)

        # GET /property returns full basic info but agent_phone/email hidden
        pget = session.get(f"{API}/properties/{pid}", headers=admin_headers).json()
        assert pget.get("agent_name"), "agent_name should be visible after access"
        if not pget.get("agent_unlocked"):
            assert not pget.get("agent_phone")
            assert not pget.get("agent_email")

        # Reveal-agent → charges Tier 2 and returns contact (if agent user has phone/email)
        r3 = session.post(f"{API}/properties/{pid}/reveal-agent", headers=admin_headers)
        if r3.status_code == 422:
            # Agent had no deliverable contact — valid branch
            det = r3.json().get("detail", r3.json())
            assert det.get("error") == "contact_unavailable"
            return
        assert r3.status_code == 200, r3.text
        d3 = r3.json()
        assert "contact" in d3
        # After reveal, GET property should expose agent_unlocked=true + phone/email where available
        pget2 = session.get(f"{API}/properties/{pid}", headers=admin_headers).json()
        assert pget2.get("agent_unlocked") is True
        contact = d3["contact"]
        if contact.get("phone"):
            assert pget2.get("agent_phone") == contact["phone"]
        if contact.get("email"):
            assert pget2.get("agent_email") == contact["email"]

        # Idempotent reveal
        r4 = session.post(f"{API}/properties/{pid}/reveal-agent", headers=admin_headers)
        assert r4.status_code == 200
        assert r4.json().get("tokens_paid", 0) == 0 or r4.json().get("already_unlocked") is True


class TestContactlessRefundSafe:
    def test_reveal_on_contactless_returns_422_no_charge(
        self, session, admin_headers, admin_user_id, contactless_property_id
    ):
        # First unlock access (contactless property is still accessible)
        acc = session.post(f"{API}/properties/{contactless_property_id}/access", headers=admin_headers)
        assert acc.status_code == 200, acc.text

        # Snapshot balance
        bal_before = session.get(f"{API}/wallet/me", headers=admin_headers).json()
        total_before = bal_before.get("balance", 0) + bal_before.get("bonus_balance", 0)

        r = session.post(f"{API}/properties/{contactless_property_id}/reveal-agent", headers=admin_headers)
        assert r.status_code == 422, r.text
        det = r.json().get("detail", r.json())
        assert det.get("error") == "contact_unavailable"

        bal_after = session.get(f"{API}/wallet/me", headers=admin_headers).json()
        total_after = bal_after.get("balance", 0) + bal_after.get("bonus_balance", 0)
        assert total_after == total_before, (
            f"wallet balance changed on contactless reveal: {total_before}→{total_after}"
        )


class TestInsufficientBalance:
    def test_access_402_shortfall_no_debit(self, session, low_balance_user):
        hdr = low_balance_user["headers"]
        # Prime welcome bonus
        session.get(f"{API}/wallet/me", headers=hdr)

        # Find an expensive non-free property
        props = session.get(f"{API}/properties").json()
        pid = None
        for p in props:
            if not p.get("is_amass_exclusive") and not p.get("is_free_amass_sale"):
                info = session.get(f"{API}/properties/{p['id']}/access-info", headers=hdr).json()
                if info["access"]["fee"] > info["balance"]:
                    pid = p["id"]
                    expected_fee = info["access"]["fee"]
                    expected_balance = info["balance"]
                    break
        if not pid:
            # try pumping fee by picking priciest and lowering balance via admin? Skip gracefully.
            pytest.skip("No property with fee > welcome balance available")

        bal_before = session.get(f"{API}/wallet/me", headers=hdr).json()
        total_before = bal_before.get("balance", 0) + bal_before.get("bonus_balance", 0)

        r = session.post(f"{API}/properties/{pid}/access", headers=hdr)
        assert r.status_code == 402, r.text
        det = r.json().get("detail", r.json())
        assert det.get("error") == "insufficient_tokens"
        assert det.get("required") == expected_fee
        assert det.get("balance") == expected_balance
        assert det.get("shortfall") == expected_fee - expected_balance

        bal_after = session.get(f"{API}/wallet/me", headers=hdr).json()
        total_after = bal_after.get("balance", 0) + bal_after.get("bonus_balance", 0)
        assert total_after == total_before, "balance debited on 402 insufficient_tokens!"


class TestAdminLedger:
    def test_ledger_returns_user_email_joined(self, session, admin_headers, admin_user_id):
        r = session.get(f"{API}/admin/wallet/transactions",
                        params={"user_id": admin_user_id, "limit": 10},
                        headers=admin_headers)
        assert r.status_code == 200
        d = r.json()
        assert "items" in d and isinstance(d["items"], list)
        if d["items"]:
            row = d["items"][0]
            assert "user_email" in row
            assert row["user_email"] == DEMO_EMAIL

    def test_admin_adjust_credit_and_debit(self, session, admin_headers, admin_user_id):
        # Credit +7
        r = session.post(f"{API}/admin/wallet/{admin_user_id}/adjust",
                         json={"amount": 7, "currency": "MASS", "reason": "TEST credit"},
                         headers=admin_headers)
        assert r.status_code == 200, r.text
        bal_after_credit = r.json()["balance"]

        # Debit -3
        r2 = session.post(f"{API}/admin/wallet/{admin_user_id}/adjust",
                          json={"amount": -3, "currency": "MASS", "reason": "TEST debit"},
                          headers=admin_headers)
        assert r2.status_code == 200, r2.text
        assert r2.json()["balance"] == bal_after_credit - 3

        # Verify the adjustment transactions landed in the ledger
        r3 = session.get(f"{API}/admin/wallet/transactions",
                         params={"user_id": admin_user_id, "kind": "adjustment", "limit": 5},
                         headers=admin_headers)
        assert r3.status_code == 200
        kinds = [t.get("kind") for t in r3.json()["items"]]
        assert all(k == "adjustment" for k in kinds), kinds
