"""Iteration 73 — live spot-checks for MASS-only property access (₦100/MASS), receipts,
mock top-up once-only, webhook hardening and FIXA (FIX) regression."""
import os
import uuid

import pytest
import requests

BASE = (os.environ.get("EXPO_BACKEND_URL") or os.environ.get("EXPO_PUBLIC_BACKEND_URL")).rstrip("/")
TABLE = {"A": (12, 10), "B": (9, 8), "C": (7, 6), "D": (6, 5)}  # zone → (rent, sale)


def H(tok, **kw):
    return {"Authorization": f"Bearer {tok}", **kw}


def login(e, p):
    r = requests.post(f"{BASE}/api/auth/login", json={"email": e, "password": p})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def new_user():
    email = f"TEST_iter73_{uuid.uuid4().hex[:8]}@amass-qa.africa"
    r = requests.post(f"{BASE}/api/auth/register", json={"email": email, "password": "Test1234!", "full_name": "Iter73 QA"})
    assert r.status_code == 200, r.text
    tok = r.json()["access_token"]
    return tok, requests.get(f"{BASE}/api/auth/me", headers=H(tok)).json()["id"]


def bal(tok, cur="MASS"):
    return requests.get(f"{BASE}/api/wallet/{cur.lower()}", headers=H(tok)).json()["spendable"]


def quote(tok, tid, fk="property"):
    r = requests.get(f"{BASE}/api/unlocks/quote", headers=H(tok), params={"featureKey": fk, "targetId": tid})
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def admin():
    return login("demo@amass.africa", "amass2026")


@pytest.fixture(scope="module")
def rental(admin):
    items = requests.get(f"{BASE}/api/properties?limit=100", headers=H(admin)).json()
    rents = [p for p in items if p.get("token_cost", 0) > 0 and (p.get("listing_type") or "").lower() == "rent"]
    assert rents
    return rents[0]["id"]


# Config / price table / bundles
def test_config_table_bundles(admin):
    c = requests.get(f"{BASE}/api/monetization/config", headers=H(admin)).json()
    assert c["conversion"]["MASS_ngn"] == 100 and c["welcome_bonus"]["MASS"] == 30
    t = requests.get(f"{BASE}/api/monetization/price-table", headers=H(admin)).json()
    got = {z["zone"]: (z["rent"]["mass"], z["sale"]["mass"]) for z in t["zones"]}
    assert got == TABLE
    for z in t["zones"]:
        assert z["rent"]["ngn"] == z["rent"]["mass"] * 100 and z["sale"]["ngn"] == z["sale"]["mass"] * 100
        assert z["areas"]
    for b in requests.get(f"{BASE}/api/tokens/bundles").json():
        assert b["price_ngn"] == b["tokens"] * 100, b
    assert requests.get(f"{BASE}/api/settings/pricing", headers=H(admin)).json()["currency"] == "MASS"


# New user quote, access-info, no FIX
def test_new_user_quote_and_access_info(rental):
    tok, _ = new_user()
    assert bal(tok) == 30
    q = quote(tok, rental)
    s = str(q)
    assert q["currency"] == "MASS" and "FIX" not in s.replace("FIXA", "")
    assert q["fee"] in [v for pair in TABLE.values() for v in pair]
    assert q.get("fee_ngn") == q["fee"] * 100 and q.get("token_ngn") == 100
    ai = requests.get(f"{BASE}/api/properties/{rental}/access-info", headers=H(tok)).json()
    assert ai["currency"] == "MASS" and ai["mass_ngn"] == 100
    assert ai["access"]["fee_ngn"] == ai["access"]["fee"] * 100


# Insufficient → 402 no charge; cancel → no charge
def test_insufficient_and_cancel(admin, rental):
    tok, uid = new_user()
    fee = quote(tok, rental)["fee"]
    delta = (fee - 1) - bal(tok)
    if delta:
        r = requests.post(f"{BASE}/api/admin/wallet/{uid}/adjust", headers=H(admin), json={"amount": delta, "currency": "MASS", "reason": "iter73"})
        assert r.status_code == 200, r.text
    assert bal(tok) == fee - 1
    r = requests.post(f"{BASE}/api/unlocks", headers=H(tok, **{"Idempotency-Key": uuid.uuid4().hex}), json={"featureKey": "property", "targetId": rental})
    assert r.status_code == 402, r.text
    assert bal(tok) == fee - 1
    assert requests.get(f"{BASE}/api/properties/{rental}/details", headers=H(tok)).status_code == 403
    assert requests.get(f"{BASE}/api/receipts", headers=H(tok)).json()["items"] == []
    c = requests.post(f"{BASE}/api/unlocks/cancel", headers=H(tok), json={"featureKey": "property", "targetId": rental})
    assert c.status_code == 200, c.text
    assert bal(tok) == fee - 1
    assert requests.get(f"{BASE}/api/properties/{rental}/details", headers=H(tok)).status_code == 403


# Successful unlock once + receipts + ledger
def test_unlock_once_receipt_ledger(admin, rental):
    tok, uid = new_user()
    fee = quote(tok, rental)["fee"]
    if fee > bal(tok):
        requests.post(f"{BASE}/api/admin/wallet/{uid}/adjust", headers=H(admin), json={"amount": fee - bal(tok) + 5, "currency": "MASS", "reason": "iter73"})
    b0 = bal(tok)
    key = uuid.uuid4().hex
    r1 = requests.post(f"{BASE}/api/unlocks", headers=H(tok, **{"Idempotency-Key": key}), json={"featureKey": "property", "targetId": rental})
    assert r1.status_code == 200, r1.text
    j1 = r1.json()
    ent = j1.get("entitlement") or {}
    assert ent.get("status") == "active"
    import re
    assert re.match(r"^AMS-\d{8}-[0-9A-F]{6}$", ent.get("receipt_no") or ""), j1
    assert bal(tok) == b0 - fee
    r2 = requests.post(f"{BASE}/api/unlocks", headers=H(tok, **{"Idempotency-Key": key}), json={"featureKey": "property", "targetId": rental})
    assert r2.status_code == 200 and bal(tok) == b0 - fee
    r3 = requests.post(f"{BASE}/api/unlocks", headers=H(tok, **{"Idempotency-Key": uuid.uuid4().hex}), json={"featureKey": "property", "targetId": rental}).json()
    assert r3.get("charged") == 0 and r3.get("free_reason") == "already_unlocked"
    assert bal(tok) == b0 - fee
    assert requests.get(f"{BASE}/api/properties/{rental}/details", headers=H(tok)).status_code == 200
    recs = [x for x in requests.get(f"{BASE}/api/receipts", headers=H(tok)).json()["items"] if x["kind"] == "property_access"]
    assert len(recs) == 1
    rc = recs[0]
    assert rc["tokens"] == fee and rc["amount_ngn"] == fee * 100 and rc["rate_ngn"] == 100
    assert any(i["label"] == "Zone" for i in rc["items"])
    assert rc["email_status"] in ("failed", "sent", "pending")
    other, _ = new_user()
    assert requests.get(f"{BASE}/api/receipts/{rc['receipt_no']}", headers=H(other)).status_code == 404
    tx = requests.get(f"{BASE}/api/wallet/transactions", headers=H(tok)).json()
    rows = tx if isinstance(tx, list) else tx.get("items", tx.get("transactions", []))
    spends = [t for t in rows if t.get("kind") == "spend_unlock"]
    assert len(spends) == 1, spends
    assert spends[0].get("receipt_no") == rc["receipt_no"]
    assert spends[0]["price_snapshot"]["token_ngn"] == 100


# Mock top-up once-only
def test_mock_topup_once():
    tok, _ = new_user()
    b0 = bal(tok)
    r = requests.post(f"{BASE}/api/payments/initialize", headers=H(tok), json={"bundle_id": "investor", "currency": "MASS", "provider": "paystack"})
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["mock"] is True
    ref = j["reference"]
    st = requests.get(f"{BASE}/api/payments/status/{ref}", headers=H(tok)).json()
    assert st["status"] == "initialized" and bal(tok) == b0
    for _ in range(2):
        requests.get(f"{BASE}/api/payments/mock/{ref}", allow_redirects=False)
    st = requests.get(f"{BASE}/api/payments/status/{ref}", headers=H(tok)).json()
    assert st["status"] == "paid" and st["receipt_no"]
    gained = bal(tok) - b0
    print("investor credits", st["credits"], "bonus", st["bonus"], "gained", gained)
    assert gained == st["credits"] + st["bonus"]
    tops = [x for x in requests.get(f"{BASE}/api/receipts", headers=H(tok)).json()["items"] if x["kind"] == "topup"]
    assert len(tops) == 1 and tops[0]["amount_ngn"] == 5000 and tops[0]["provider"] == "paystack"
    s = requests.post(f"{BASE}/api/payments/initialize", headers=H(tok), json={"bundle_id": "starter", "currency": "MASS", "provider": "paystack"})
    assert s.status_code == 422


# Webhook hardening
def test_webhooks_and_unknown_ref():
    body = {"event": "charge.success", "data": {"reference": "amass_bogus", "amount": 500000, "currency": "NGN"}}
    assert requests.post(f"{BASE}/api/payments/paystack/webhook", json=body).status_code in (401, 503)
    assert requests.post(f"{BASE}/api/payments/paystack/webhook", json=body, headers={"x-paystack-signature": "deadbeef"}).status_code in (401, 503)
    assert requests.post(f"{BASE}/api/payments/flutterwave/webhook", json=body, headers={"verif-hash": "wrong"}).status_code in (401, 503)
    assert requests.get(f"{BASE}/api/payments/mock/amass_unknown_{uuid.uuid4().hex}", allow_redirects=False).status_code == 404


# FIXA is free — no FIX wallet, contact public
def test_fixa_free_no_fix():
    tok, _ = new_user()
    assert requests.get(f"{BASE}/api/wallet/fix", headers=H(tok)).status_code == 404
    pr = requests.get(f"{BASE}/api/fixa/providers", headers=H(tok))
    assert pr.status_code == 200
    items = pr.json().get("items", [])
    assert items and items[0]["phone"]
    r = requests.get(f"{BASE}/api/unlocks/quote", headers=H(tok), params={"featureKey": "fixa_provider", "targetId": items[0]["id"]})
    assert r.status_code == 422
