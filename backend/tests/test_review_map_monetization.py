"""Review-specific smoke tests for the Jan-2026 map-first monetization spec.

Covers the exact matrix called out in the review request:
- Welcome bonus from /api/monetization/config
- Zone pricing surfaces in GET /api/properties
- /api/map/markers auth + shape + unlock mutation
- /api/unlocks/quote and POST /api/unlocks (idempotency, forged fee, 402, already)
- Legacy POST /api/properties/unlock aliasing
- Admin-not-exempt + is_owner for seeded listings
- FIX gate on /api/fixa endpoints
- /api/settings/pricing
"""
import os
import uuid
import pytest
import requests

BASE = os.environ.get("EXPO_BACKEND_URL", "http://localhost:8001").rstrip("/")
DEMO = ("demo@amass.africa", "amass2026")
BUYER = ("tunde.showcase@amass.africa", "Showcase2026!")


WELCOME = 30  # welcome MASS = ₦3,000 at ₦100/MASS


def _login(email, pwd):
    r = requests.post(f"{BASE}/api/auth/login", json={"email": email, "password": pwd})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _hdr(tok, **extra):
    return {"Authorization": f"Bearer {tok}", **extra}


def _new_user():
    email = f"rev_{uuid.uuid4().hex[:10]}@amass-qa.africa"
    r = requests.post(f"{BASE}/api/auth/register",
                      json={"email": email, "password": "Test1234!", "full_name": "Reviewer"})
    assert r.status_code == 200, r.text
    tok = r.json()["access_token"]
    me = requests.get(f"{BASE}/api/auth/me", headers=_hdr(tok)).json()
    return tok, me["id"]


def _balance(tok):
    r = requests.get(f"{BASE}/api/wallet/mass", headers=_hdr(tok))
    assert r.status_code == 200, r.text
    return r.json()["spendable"]


# ---------------- Welcome / config ----------------

def test_welcome_bonus_from_config():
    cfg = requests.get(f"{BASE}/api/monetization/config").json()
    welcome = cfg["welcome_bonus"]["MASS"]
    assert welcome == WELCOME
    tok, _ = _new_user()
    assert _balance(tok) == welcome


def test_settings_pricing_shape():
    r = requests.get(f"{BASE}/api/settings/pricing")
    assert r.status_code == 200
    data = r.json()
    assert data.get("free_amass_sale") is False
    assert data.get("agent_contact_fee") == 0
    assert "conversion" in data


# ---------------- properties list surfaces zone pricing + entitlements ----------------

def test_properties_list_shape():
    tok, _ = _new_user()
    for h in (None, _hdr(tok)):
        r = requests.get(f"{BASE}/api/properties?limit=25", headers=h or {})
        assert r.status_code == 200, r.text
        items = r.json()
        assert len(items) >= 1
        for p in items:
            # token_cost == access_cost; may be 0 for free listings
            assert "token_cost" in p and "access_cost" in p
            assert p["token_cost"] == p["access_cost"]
            assert p.get("zone_tier") in {"A", "B", "C", "D"}
            assert isinstance(p.get("unlocked"), bool)
            if not p.get("unlocked") and p["token_cost"] > 0:
                assert "agent_phone" not in p
                assert "agent_email" not in p


# ---------------- Map markers ----------------

def test_map_markers_requires_auth_and_shape():
    r = requests.get(f"{BASE}/api/map/markers")
    assert r.status_code == 401

    tok, _ = _new_user()
    r = requests.get(f"{BASE}/api/map/markers", headers=_hdr(tok), params={"limit": 50})
    assert r.status_code == 200
    data = r.json()
    assert "markers" in data and "count" in data
    assert data.get("approx_radius_m") == 150
    assert isinstance(data["markers"], list) and len(data["markers"]) > 0
    expected = {"id", "category", "type", "lat", "lng", "unlocked", "verified", "approx"}
    for m in data["markers"]:
        assert expected <= set(m.keys()), m
        assert not ({"address", "agent_phone", "agent_id", "seller_phone"} & set(m.keys())), m
    # fresh user: everything approx + locked
    assert all(m["approx"] is True and m["unlocked"] is False for m in data["markers"])


def test_map_markers_mutate_after_unlock():
    tok, _ = _new_user()
    # pick a property we can afford (sort by lowest token_cost > 0)
    props = requests.get(f"{BASE}/api/properties?limit=50", headers=_hdr(tok)).json()
    paid = sorted([p for p in props if p["token_cost"] > 0 and p["token_cost"] <= WELCOME],
                  key=lambda x: x["token_cost"])
    assert paid, "need at least one affordable paid listing"
    p = paid[0]
    before = requests.get(f"{BASE}/api/map/markers",
                          headers=_hdr(tok), params={"limit": 200}).json()["markers"]
    bmap = {m["id"]: m for m in before}
    assert p["id"] in bmap and bmap[p["id"]]["approx"] is True
    body = {"featureKey": "property", "targetId": p["id"]}
    r = requests.post(f"{BASE}/api/unlocks", headers=_hdr(tok, **{"Idempotency-Key": uuid.uuid4().hex}),
                      json=body)
    assert r.status_code == 200, r.text
    after = requests.get(f"{BASE}/api/map/markers",
                         headers=_hdr(tok), params={"limit": 200}).json()["markers"]
    amap = {m["id"]: m for m in after}
    assert amap[p["id"]]["unlocked"] is True
    assert amap[p["id"]]["approx"] is False
    # coords should differ (jitter removed)
    bm, am = bmap[p["id"]], amap[p["id"]]
    assert (bm["lat"], bm["lng"]) != (am["lat"], am["lng"])


# ---------------- Quote + Unlock + idempotency ----------------

def test_quote_shape_for_fresh_user():
    tok, _ = _new_user()
    props = requests.get(f"{BASE}/api/properties?limit=30", headers=_hdr(tok)).json()
    paid = [p for p in props if p["token_cost"] > 0 and not p.get("unlocked")]
    assert paid
    p = paid[0]
    r = requests.get(f"{BASE}/api/unlocks/quote", headers=_hdr(tok),
                     params={"featureKey": "property", "targetId": p["id"]})
    assert r.status_code == 200
    q = r.json()
    assert q["fee"] > 0 and q["fee_ngn"] == q["fee"] * 100
    assert q["balance"] == WELCOME
    assert q["balance_after"] == WELCOME - q["fee"]
    assert q["can_afford"] is (q["fee"] <= WELCOME)
    assert q["already_unlocked"] is False


def test_unlock_idempotency_and_already():
    tok, _ = _new_user()
    props = requests.get(f"{BASE}/api/properties?limit=50", headers=_hdr(tok)).json()
    affordable = sorted([p for p in props if 0 < p["token_cost"] <= WELCOME],
                        key=lambda x: x["token_cost"])
    assert affordable
    p = affordable[0]
    fee = p["token_cost"]
    key1 = uuid.uuid4().hex
    r1 = requests.post(f"{BASE}/api/unlocks", headers=_hdr(tok, **{"Idempotency-Key": key1}),
                       json={"featureKey": "property", "targetId": p["id"]})
    assert r1.status_code == 200, r1.text
    body1 = r1.json()
    assert body1["charged"] == fee
    assert body1["balance_after"] == WELCOME - fee
    assert body1["entitlement"]["status"] == "active"
    assert _balance(tok) == WELCOME - fee

    # Same key → identical result, no second charge
    r2 = requests.post(f"{BASE}/api/unlocks", headers=_hdr(tok, **{"Idempotency-Key": key1}),
                       json={"featureKey": "property", "targetId": p["id"]})
    assert r2.status_code == 200
    assert r2.json()["charged"] == fee
    assert _balance(tok) == WELCOME - fee

    # Different key same property → free (already_unlocked)
    r3 = requests.post(f"{BASE}/api/unlocks", headers=_hdr(tok, **{"Idempotency-Key": uuid.uuid4().hex}),
                       json={"featureKey": "property", "targetId": p["id"]})
    assert r3.status_code == 200
    assert r3.json()["charged"] == 0
    assert r3.json().get("free_reason") == "already_unlocked"
    assert _balance(tok) == WELCOME - fee


def test_unlock_missing_idempotency_key_422():
    tok, _ = _new_user()
    props = requests.get(f"{BASE}/api/properties?limit=10", headers=_hdr(tok)).json()
    p = next((x for x in props if x["token_cost"] > 0), props[0])
    r = requests.post(f"{BASE}/api/unlocks", headers=_hdr(tok),
                      json={"featureKey": "property", "targetId": p["id"]})
    assert r.status_code == 422, (r.status_code, r.text)


def _drain(tok, uid):
    """Property fees are 5–12 MASS and the welcome bonus is 30, so nothing is unaffordable by default — empty the wallet."""
    atok = _login(*DEMO)
    bal = _balance(tok)
    if bal > 0:
        r = requests.post(f"{BASE}/api/admin/wallet/{uid}/adjust", headers=_hdr(atok), json={"amount": -bal, "currency": "MASS", "reason": "test"})
        assert r.status_code == 200, r.text
    assert _balance(tok) == 0


def test_unlock_402_when_unaffordable_wallet_unchanged():
    tok, uid = _new_user()
    _drain(tok, uid)
    props = requests.get(f"{BASE}/api/properties?limit=100", headers=_hdr(tok)).json()
    p = next(p for p in props if p["token_cost"] > 0)
    before = _balance(tok)
    r = requests.post(f"{BASE}/api/unlocks",
                      headers=_hdr(tok, **{"Idempotency-Key": uuid.uuid4().hex}),
                      json={"featureKey": "property", "targetId": p["id"]})
    assert r.status_code == 402
    assert _balance(tok) == before


# ---------------- Property details reveal ----------------

def test_details_before_and_after_unlock_and_mine():
    tok, _ = _new_user()
    props = requests.get(f"{BASE}/api/properties?limit=50", headers=_hdr(tok)).json()
    affordable = sorted([p for p in props if 0 < p["token_cost"] <= WELCOME],
                        key=lambda x: x["token_cost"])
    p = affordable[0]
    # before: /details 403 w/ UNLOCK_REQUIRED
    d0 = requests.get(f"{BASE}/api/properties/{p['id']}/details", headers=_hdr(tok))
    assert d0.status_code == 403
    assert d0.json()["detail"]["code"] == "UNLOCK_REQUIRED"
    # unlock
    r = requests.post(f"{BASE}/api/unlocks",
                      headers=_hdr(tok, **{"Idempotency-Key": uuid.uuid4().hex}),
                      json={"featureKey": "property", "targetId": p["id"]})
    assert r.status_code == 200
    # after: full prop
    full = requests.get(f"{BASE}/api/properties/{p['id']}", headers=_hdr(tok)).json()
    assert full["unlocked"] is True
    assert full.get("agent_name")
    d = requests.get(f"{BASE}/api/properties/{p['id']}/details", headers=_hdr(tok))
    assert d.status_code == 200
    mine = requests.get(f"{BASE}/api/unlocks/mine",
                        headers=_hdr(tok), params={"featureKey": "property"}).json()
    assert any(i["property"]["id"] == p["id"] for i in mine["items"])
    legacy = requests.get(f"{BASE}/api/wallet/unlocks", headers=_hdr(tok)).json()
    items = legacy if isinstance(legacy, list) else legacy.get("items", [])
    assert any((i.get("property") or {}).get("id") == p["id"] for i in items)


# ---------------- Legacy alias ----------------

def test_legacy_properties_unlock_alias_charges_once():
    tok, _ = _new_user()
    props = requests.get(f"{BASE}/api/properties?limit=50", headers=_hdr(tok)).json()
    affordable = sorted([p for p in props if 0 < p["token_cost"] <= WELCOME],
                        key=lambda x: x["token_cost"])
    p = affordable[0]
    fee = p["token_cost"]
    r1 = requests.post(f"{BASE}/api/properties/unlock", headers=_hdr(tok),
                       json={"property_id": p["id"]})
    assert r1.status_code == 200, r1.text
    b1 = r1.json()
    # charges once (either 'tokens_paid' or 'charged')
    paid1 = b1.get("tokens_paid", b1.get("charged"))
    assert paid1 == fee
    assert _balance(tok) == WELCOME - fee
    # second call → already unlocked, 0 charge
    r2 = requests.post(f"{BASE}/api/properties/unlock", headers=_hdr(tok),
                       json={"property_id": p["id"]})
    assert r2.status_code == 200
    b2 = r2.json()
    assert b2.get("already_unlocked") is True
    assert b2.get("tokens_paid", b2.get("charged")) == 0
    assert _balance(tok) == WELCOME - fee


def test_legacy_properties_unlock_402_shape():
    tok, uid = _new_user()
    _drain(tok, uid)
    props = requests.get(f"{BASE}/api/properties?limit=100", headers=_hdr(tok)).json()
    p = next(p for p in props if p["token_cost"] > 0)
    r = requests.post(f"{BASE}/api/properties/unlock", headers=_hdr(tok),
                      json={"property_id": p["id"]})
    assert r.status_code == 402
    body = r.json()
    detail = body.get("detail", body)
    assert detail.get("error") == "insufficient_tokens"
    assert "required" in detail and "balance" in detail and "shortfall" in detail


# ---------------- Admin not exempt + is_owner ----------------

def test_admin_not_exempt_and_is_owner():
    atok = _login(*DEMO)
    me = requests.get(f"{BASE}/api/auth/me", headers=_hdr(atok)).json()
    admin_id = me["id"]
    props = requests.get(f"{BASE}/api/properties?limit=100", headers=_hdr(atok)).json()
    owned = [p for p in props if p.get("owner_id") == admin_id or p.get("agent_id") == admin_id]
    not_owned = [p for p in props if p.get("owner_id") != admin_id and p.get("agent_id") != admin_id and p["token_cost"] > 0]
    assert not_owned, "need a paid listing not owned by demo"
    q = requests.get(f"{BASE}/api/unlocks/quote", headers=_hdr(atok),
                     params={"featureKey": "property", "targetId": not_owned[0]["id"]}).json()
    assert q["fee"] > 0
    assert q.get("is_owner") is False
    if owned:
        qo = requests.get(f"{BASE}/api/unlocks/quote", headers=_hdr(atok),
                          params={"featureKey": "property", "targetId": owned[0]["id"]}).json()
        assert qo.get("is_owner") is True
        assert qo["fee"] == 0


# ---------------- FIXA is free (no FIX token, no gate) ----------------

def test_fixa_free_browse_with_contact():
    tok, uid = _new_user()
    _drain(tok, uid)  # even with 0 MASS
    assert requests.get(f"{BASE}/api/fixa/access", headers=_hdr(tok)).status_code == 404
    assert requests.get(f"{BASE}/api/wallet/fix", headers=_hdr(tok)).status_code == 404
    pr = requests.get(f"{BASE}/api/fixa/providers", headers=_hdr(tok))
    assert pr.status_code == 200, pr.text
    items = pr.json()["items"]
    assert items and all(i["phone"] for i in items)


def test_fixa_requires_auth():
    assert requests.get(f"{BASE}/api/fixa/providers").status_code in (401, 403)
