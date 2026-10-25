"""MASS-only property payments — approved Lagos price table, ₦100/MASS disclosure,
no-charge guarantees, server-side payment verification, one-shot references and receipts.

Runs against the live backend (EXPO_BACKEND_URL or localhost:8001). MOCK_PAYMENT=true is
assumed for the top-up flow (hosted checkout is simulated by GET /api/payments/mock/{ref}).
"""
import hashlib
import hmac
import json
import os
import sys
import uuid

import pytest
import requests

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

BASE = os.environ.get("EXPO_BACKEND_URL", "http://localhost:8001").rstrip("/")
ADMIN = ("demo@amass.africa", "amass2026")
MASS_NGN = 100
TABLE = {"A": (12, 10), "B": (9, 8), "C": (7, 6), "D": (6, 5)}  # zone → (rent, sale) in MASS — 5 → 12, rent above sale


def _login(email, password):
    r = requests.post(f"{BASE}/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _hdr(tok, **extra):
    return {"Authorization": f"Bearer {tok}", **extra}


def _new_user():
    email = f"massqa_{uuid.uuid4().hex[:10]}@amass-qa.africa"
    r = requests.post(f"{BASE}/api/auth/register", json={"email": email, "password": "Test1234!", "full_name": "MASS Tester"})
    assert r.status_code == 200, r.text
    tok = r.json()["access_token"]
    me = requests.get(f"{BASE}/api/auth/me", headers=_hdr(tok)).json()
    return tok, me["id"]


def _balance(tok, cur="MASS"):
    r = requests.get(f"{BASE}/api/wallet/{cur.lower()}", headers=_hdr(tok))
    assert r.status_code == 200, r.text
    return r.json()["spendable"]


def _set_balance(admin_tok, user_id, tok, target, cur="MASS"):
    delta = target - _balance(tok, cur)
    if delta:
        r = requests.post(f"{BASE}/api/admin/wallet/{user_id}/adjust", headers=_hdr(admin_tok), json={"amount": delta, "currency": cur, "reason": "test setup"})
        assert r.status_code == 200, r.text
    assert _balance(tok, cur) == target


def _unlock(tok, tid, key=None):
    return requests.post(f"{BASE}/api/unlocks", headers=_hdr(tok, **{"Idempotency-Key": key or uuid.uuid4().hex}), json={"featureKey": "property", "targetId": tid})


def _quote(tok, tid):
    r = requests.get(f"{BASE}/api/unlocks/quote", headers=_hdr(tok), params={"featureKey": "property", "targetId": tid})
    assert r.status_code == 200, r.text
    return r.json()


def _receipts(tok):
    r = requests.get(f"{BASE}/api/receipts", headers=_hdr(tok))
    assert r.status_code == 200, r.text
    return r.json()["items"]


@pytest.fixture(scope="module")
def admin_tok():
    return _login(*ADMIN)


@pytest.fixture(scope="module")
def props(admin_tok):
    r = requests.get(f"{BASE}/api/properties?limit=100", headers=_hdr(admin_tok))
    assert r.status_code == 200
    items = [p for p in r.json() if p.get("token_cost", 0) > 0]
    assert len(items) >= 2
    # Rentals first: the admin "free AMASS sale" toggle (exercised by other suites running in
    # parallel) can zero a SALE fee mid-test, so charge/no-charge assertions use rentals.
    return sorted(items, key=lambda p: 0 if (p.get("listing_type") or "").lower() == "rent" else 1)


# ─── Pricing: ₦100 per MASS + approved Lagos table ──────────────────────
def test_mass_is_100_naira_and_welcome_bonus_rescaled():
    cfg = requests.get(f"{BASE}/api/monetization/config").json()
    assert cfg["conversion"]["MASS_ngn"] == MASS_NGN
    assert cfg["welcome_bonus"]["MASS"] == 30  # ₦3,000 of access, same value as before the rescale
    tok, _ = _new_user()
    assert _balance(tok) == 30


def test_lagos_price_table_is_the_fee_source():
    t = requests.get(f"{BASE}/api/monetization/price-table").json()
    assert t["currency"] == "MASS" and t["mass_ngn"] == MASS_NGN and t["city"] == "Lagos"
    zones = {z["zone"]: z for z in t["zones"]}
    assert list(zones) == ["A", "B", "C", "D"]
    for z, (rent, sale) in TABLE.items():
        assert zones[z]["rent"] == {"mass": rent, "ngn": rent * MASS_NGN}
        assert zones[z]["sale"] == {"mass": sale, "ngn": sale * MASS_NGN}
        assert zones[z]["areas"]
    assert "Ikoyi" in zones["A"]["areas"] and "Lekki" in zones["B"]["areas"]


def test_quote_discloses_exact_fee_in_mass_and_naira(props):
    tok, _ = _new_user()
    for p in props[:5]:
        q = _quote(tok, p["id"])
        assert q["currency"] == "MASS"
        rent, sale = TABLE[q["zone_tier"]]
        assert q["fee"] == (sale if q["category"] == "sale" else rent)
        assert q["fee_ngn"] == q["fee"] * MASS_NGN
        assert q["token_ngn"] == MASS_NGN
        assert q["fee"] == p["token_cost"] == p["access_cost"]


def test_mass_bundles_priced_at_100_naira_each():
    bundles = requests.get(f"{BASE}/api/tokens/bundles").json()
    assert bundles
    for b in bundles:
        assert b["price_ngn"] == b["tokens"] * MASS_NGN, b


def test_property_access_endpoints_are_mass_only(props):
    s = requests.get(f"{BASE}/api/settings/pricing").json()
    assert s["currency"] == "MASS" and s["conversion"]["MASS_ngn"] == MASS_NGN
    tok, _ = _new_user()
    info = requests.get(f"{BASE}/api/properties/{props[0]['id']}/access-info", headers=_hdr(tok)).json()
    assert info["currency"] == "MASS" and info["mass_ngn"] == MASS_NGN
    assert info["access"]["fee_ngn"] == info["access"]["fee"] * MASS_NGN
    # FIX balance never helps with property access
    r = requests.get(f"{BASE}/api/unlocks/quote", headers=_hdr(tok), params={"featureKey": "property", "targetId": props[0]["id"]}).json()
    assert r["currency"] == "MASS"
    assert "FIX" not in json.dumps(r)


# ─── No charge on cancel / insufficient balance ─────────────────────────
def test_insufficient_mass_does_not_charge_or_unlock(admin_tok, props):
    tok, uid = _new_user()
    p = props[0]
    fee = _quote(tok, p["id"])["fee"]
    _set_balance(admin_tok, uid, tok, fee - 1)
    r = _unlock(tok, p["id"])
    assert r.status_code == 402, r.text
    assert _balance(tok) == fee - 1
    d = requests.get(f"{BASE}/api/properties/{p['id']}/details", headers=_hdr(tok))
    assert d.status_code == 403
    assert _receipts(tok) == []
    mine = requests.get(f"{BASE}/api/unlocks/mine", headers=_hdr(tok), params={"featureKey": "property"}).json()
    assert mine["count"] == 0


def test_cancel_does_not_charge(admin_tok, props):
    tok, uid = _new_user()
    p = props[0]
    fee = _quote(tok, p["id"])["fee"]
    _set_balance(admin_tok, uid, tok, fee + 5)
    r = requests.post(f"{BASE}/api/unlocks/cancel", headers=_hdr(tok), json={"featureKey": "property", "targetId": p["id"], "reason": "user_cancelled"})
    assert r.status_code == 200
    assert _balance(tok) == fee + 5
    assert requests.get(f"{BASE}/api/properties/{p['id']}/details", headers=_hdr(tok)).status_code == 403
    assert _receipts(tok) == []


# ─── Successful unlock: exact charge, single entitlement, receipt ────────
def test_unlock_charges_exactly_once_and_issues_receipt(admin_tok, props):
    tok, uid = _new_user()
    p = props[0]
    q = _quote(tok, p["id"])
    fee = q["fee"]
    _set_balance(admin_tok, uid, tok, fee + 7)
    key = uuid.uuid4().hex
    r1 = _unlock(tok, p["id"], key)
    assert r1.status_code == 200, r1.text
    b1 = r1.json()
    assert b1["charged"] == fee and b1["currency"] == "MASS" and b1["balance_after"] == 7
    ent = b1["entitlement"]
    assert ent["status"] == "active" and ent.get("receipt_no", "").startswith("AMS-")
    assert _balance(tok) == 7
    # idempotent retry (same key) + repeat (new key) → no second charge
    assert _unlock(tok, p["id"], key).json()["charged"] == fee
    r3 = _unlock(tok, p["id"]).json()
    assert r3["charged"] == 0 and r3["free_reason"] == "already_unlocked"
    assert _balance(tok) == 7
    # exactly one receipt, in naira AND MASS at ₦100/MASS
    recs = _receipts(tok)
    assert len(recs) == 1
    rec = recs[0]
    assert rec["kind"] == "property_access" and rec["receipt_no"] == ent["receipt_no"]
    assert rec["tokens"] == fee and rec["amount_ngn"] == fee * MASS_NGN and rec["rate_ngn"] == MASS_NGN
    assert rec["currency"] == "MASS" and rec["balance_after"] == 7
    assert any(i["label"] == "Zone" for i in rec["items"])
    one = requests.get(f"{BASE}/api/receipts/{rec['receipt_no']}", headers=_hdr(tok))
    assert one.status_code == 200 and one.json()["reference"] == rec["reference"]
    # ledger row carries the receipt number
    txs = requests.get(f"{BASE}/api/wallet/transactions", headers=_hdr(tok), params={"currency": "MASS", "limit": 20}).json()
    txs = txs if isinstance(txs, list) else txs.get("items", [])
    spend = [t for t in txs if t.get("kind") == "spend_unlock"]
    assert len(spend) == 1 and spend[0].get("receipt_no") == rec["receipt_no"]
    assert spend[0]["price_snapshot"]["token_ngn"] == MASS_NGN and spend[0]["price_snapshot"]["ngn"] == fee * MASS_NGN
    # receipts are private
    other_tok, _ = _new_user()
    assert requests.get(f"{BASE}/api/receipts/{rec['receipt_no']}", headers=_hdr(other_tok)).status_code == 404


# ─── Top-ups: server-created intent, verified fulfilment, single credit, receipt ──
def test_topup_fulfilled_once_with_receipt():
    tok, uid = _new_user()
    before = _balance(tok)
    init = requests.post(f"{BASE}/api/payments/initialize", headers=_hdr(tok), json={"bundle_id": "investor", "currency": "MASS", "provider": "paystack"})
    assert init.status_code == 200, init.text
    ref = init.json()["reference"]
    assert init.json()["mock"] is True
    st = requests.get(f"{BASE}/api/payments/status/{ref}", headers=_hdr(tok)).json()
    assert st["status"] == "initialized" and st["amount_ngn"] == 5000 and st["credits"] == 50
    assert _balance(tok) == before  # nothing credited before verification
    # simulated hosted checkout → fulfil (twice: retry must be a no-op)
    requests.get(f"{BASE}/api/payments/mock/{ref}", allow_redirects=False)
    requests.get(f"{BASE}/api/payments/mock/{ref}", allow_redirects=False)
    st = requests.get(f"{BASE}/api/payments/status/{ref}", headers=_hdr(tok)).json()
    assert st["status"] == "paid" and st["receipt_no"].startswith("AMS-")
    assert _balance(tok) == before + st["credits"] + st["bonus"]
    recs = [r for r in _receipts(tok) if r["kind"] == "topup"]
    assert len(recs) == 1
    rec = recs[0]
    assert rec["receipt_no"] == st["receipt_no"] and rec["reference"] == ref
    assert rec["amount_ngn"] == 5000 and rec["tokens"] == st["credits"] + st["bonus"] and rec["rate_ngn"] == MASS_NGN
    assert rec["provider"] == "paystack"
    # a second receipt cannot be minted for the same reference
    assert len([r for r in _receipts(tok) if r["reference"] == ref]) == 1


def test_webhook_rejects_unsigned_or_unverifiable_events():
    body = json.dumps({"event": "charge.success", "data": {"reference": "amass_doesnotexist", "status": "success", "amount": 500000, "currency": "NGN"}})
    r = requests.post(f"{BASE}/api/payments/paystack/webhook", data=body, headers={"Content-Type": "application/json"})
    assert r.status_code in (401, 503), r.text  # no/invalid signature or secret not configured → never processed
    r = requests.post(f"{BASE}/api/payments/paystack/webhook", data=body, headers={"Content-Type": "application/json", "x-paystack-signature": "deadbeef"})
    assert r.status_code in (401, 503), r.text
    r = requests.post(f"{BASE}/api/payments/flutterwave/webhook", json={"data": {"tx_ref": "amass_x", "status": "successful"}}, headers={"verif-hash": "nope"})
    assert r.status_code in (401, 503), r.text


def test_signature_and_amount_guards_unit():
    from dotenv import load_dotenv

    load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))
    import payments

    secret = "sk_test_unit"
    raw = b'{"event":"charge.success","data":{"reference":"amass_abc"}}'
    good = hmac.new(secret.encode(), raw, hashlib.sha512).hexdigest()
    assert payments.paystack_signature_ok(secret, raw, good)
    assert not payments.paystack_signature_ok(secret, raw, good[:-1] + "0")
    assert not payments.paystack_signature_ok(secret, raw, None)
    assert not payments.paystack_signature_ok("", raw, good)
    intent = {"amount_ngn": 5000}
    assert payments.payload_matches_intent("paystack", {"status": "success", "amount": 500000, "currency": "NGN"}, intent)
    assert not payments.payload_matches_intent("paystack", {"status": "success", "amount": 100, "currency": "NGN"}, intent)  # ₦1 for a ₦5,000 pack
    assert not payments.payload_matches_intent("paystack", {"status": "failed", "amount": 500000, "currency": "NGN"}, intent)
    assert not payments.payload_matches_intent("paystack", {"status": "success", "amount": 500000, "currency": "USD"}, intent)
    assert payments.payload_matches_intent("flutterwave", {"status": "successful", "amount": 5000, "currency": "NGN"}, intent)
    assert not payments.payload_matches_intent("flutterwave", {"status": "successful", "amount": 4999, "currency": "NGN"}, intent)
    assert payments.payload_matches_intent("paystack", {"status": "success", "mock": True}, intent)


def test_bundle_catalog_discloses_full_credit_before_payment():
    """What the catalog promises (tokens + bonus + tier bonus) is exactly what gets credited."""
    bundles = {b["id"]: b for b in requests.get(f"{BASE}/api/tokens/bundles").json()}
    inv = bundles["investor"]
    assert inv["total"] == inv["tokens"] + inv["bonus"] + inv["tier_bonus"]
    assert inv["tier_bonus"] >= 0
    tok, _ = _new_user()
    before = _balance(tok)
    ref = requests.post(f"{BASE}/api/payments/initialize", headers=_hdr(tok), json={"bundle_id": "investor", "currency": "MASS", "provider": "paystack"}).json()["reference"]
    requests.get(f"{BASE}/api/payments/mock/{ref}", allow_redirects=False)
    st = requests.get(f"{BASE}/api/payments/status/{ref}", headers=_hdr(tok)).json()
    assert st["credits"] + st["bonus"] == inv["total"]
    assert _balance(tok) == before + inv["total"]


def test_web_checkout_return_page_closes_itself_and_native_deep_links():
    tok, _ = _new_user()
    web = requests.post(f"{BASE}/api/payments/initialize", headers=_hdr(tok), json={"bundle_id": "explorer", "currency": "MASS", "provider": "paystack", "platform": "web"}).json()
    r = requests.get(f"{BASE}/api/payments/redirect", params={"ref": web["reference"], "status": "success"}, allow_redirects=False)
    assert r.status_code == 200 and "text/html" in r.headers.get("content-type", "") and "window.close" in r.text
    native = requests.post(f"{BASE}/api/payments/initialize", headers=_hdr(tok), json={"bundle_id": "explorer", "currency": "MASS", "provider": "paystack"}).json()
    r = requests.get(f"{BASE}/api/payments/redirect", params={"ref": native["reference"], "status": "success"}, allow_redirects=False)
    assert r.status_code in (302, 307) and r.headers["location"].startswith("amass://payment/callback?ref=")
    # neither redirect page credited anything — only verified fulfilment does
    assert _balance(tok) == 30
