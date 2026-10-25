"""Monetization spec tests — shared unlock service, entitlements, FIX gate,
zone pricing, concurrency, idempotency, auto-credit, admin pricing.

Runs against the live backend (EXPO_BACKEND_URL or localhost:8001) and uses
the admin wallet-adjust endpoint to shape balances deterministically.
"""
import os
import time
import uuid
from concurrent.futures import ThreadPoolExecutor

import pytest
import requests

BASE = os.environ.get("EXPO_BACKEND_URL", "http://localhost:8001").rstrip("/")
ADMIN = ("demo@amass.africa", "amass2026")


def _login(email, password):
    r = requests.post(f"{BASE}/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _hdr(tok, **extra):
    return {"Authorization": f"Bearer {tok}", **extra}


def _new_user():
    email = f"mono_{uuid.uuid4().hex[:10]}@amass-qa.africa"
    r = requests.post(f"{BASE}/api/auth/register", json={"email": email, "password": "Test1234!", "full_name": "Mono Tester"})
    assert r.status_code == 200, r.text
    tok = r.json()["access_token"]
    me = requests.get(f"{BASE}/api/auth/me", headers=_hdr(tok)).json()
    return tok, me["id"]


def _balance(tok, cur="MASS"):
    r = requests.get(f"{BASE}/api/wallet/{cur.lower()}", headers=_hdr(tok))
    assert r.status_code == 200, r.text
    return r.json()["spendable"]


def _set_balance(admin_tok, user_id, tok, cur, target):
    cur_bal = _balance(tok, cur)
    delta = target - cur_bal
    if delta != 0:
        r = requests.post(f"{BASE}/api/admin/wallet/{user_id}/adjust", headers=_hdr(admin_tok), json={"amount": delta, "currency": cur, "reason": "test setup"})
        assert r.status_code == 200, r.text
    assert _balance(tok, cur) == target


def _unlock(tok, fk, tid, key=None, extra_body=None):
    body = {"featureKey": fk, "targetId": tid, **(extra_body or {})}
    return requests.post(f"{BASE}/api/unlocks", headers=_hdr(tok, **{"Idempotency-Key": key or uuid.uuid4().hex}), json=body)


@pytest.fixture(scope="module")
def admin_tok():
    return _login(*ADMIN)


@pytest.fixture(scope="module")
def props(admin_tok):
    r = requests.get(f"{BASE}/api/properties?limit=100", headers=_hdr(admin_tok))
    assert r.status_code == 200
    items = r.json()
    assert len(items) >= 3
    return items


@pytest.fixture(scope="module")
def providers(admin_tok):
    r = requests.get(f"{BASE}/api/fixa/providers", headers=_hdr(admin_tok))
    assert r.status_code == 200, r.text
    items = r.json()["items"]
    assert len(items) >= 2
    return items


def _find_prop(props, pred):
    for p in props:
        if pred(p):
            return p
    return props[0]


# ─── Welcome bonus & config ─────────────────────────────────────────────
def test_welcome_bonus_from_config():
    tok, _ = _new_user()
    assert _balance(tok, "MASS") == 30  # ₦3,000 at ₦100/MASS
    cfg = requests.get(f"{BASE}/api/monetization/config").json()
    assert cfg["conversion"] == {"MASS_ngn": 100}  # MASS is the only token — no FIX anywhere
    assert "FIX" not in cfg["welcome_bonus"]
    assert cfg["topup_min_ngn"] == 1000
    assert requests.get(f"{BASE}/api/wallet/fix", headers=_hdr(tok)).status_code == 404
    assert requests.get(f"{BASE}/api/wallet/dual", headers=_hdr(tok)).status_code == 404


# ─── Zone fees ──────────────────────────────────────────────────────────
def test_fees_per_zone_and_rent_above_sale(admin_tok):
    """Location sets the fee (5 → 12 MASS); rent/lease is always dearer than sale; no FIXA fee rows remain."""
    r = requests.get(f"{BASE}/api/admin/pricing", headers=_hdr(admin_tok))
    assert r.status_code == 200
    prices = {(p["feature_key"], p["category"], p["zone_tier"]): p["amount"] for p in r.json()["prices"]}
    assert prices[("property", "rent", "A")] == 12 and prices[("property", "sale", "A")] == 10
    assert prices[("property", "rent", "D")] == 6 and prices[("property", "sale", "D")] == 5
    for z in "ABCD":
        assert prices[("property", "rent", z)] > prices[("property", "sale", z)]
        assert 5 <= prices[("property", "sale", z)] <= 12 and 5 <= prices[("property", "rent", z)] <= 12
    assert not [k for k in prices if k[0] == "fixa_provider"]


def test_quote_zone_resolution(admin_tok, props):
    tok, uid = _new_user()
    ikoyi = _find_prop(props, lambda p: "ikoyi" in (p.get("city", "") + p.get("location", "")).lower())
    q = requests.get(f"{BASE}/api/unlocks/quote", headers=_hdr(tok), params={"featureKey": "property", "targetId": ikoyi["id"]}).json()
    assert q["zone_tier"] == "A"
    assert q["fee"] in (10, 12)
    assert q["fee_ngn"] == q["fee"] * 100
    assert q["currency"] == "MASS"


# ─── Zero / insufficient MASS ───────────────────────────────────────────
def test_zero_mass_blocked_and_map_markers_hidden(admin_tok, props):
    tok, uid = _new_user()
    _set_balance(admin_tok, uid, tok, "MASS", 0)
    # 0 MASS → the map shows no homes at all (map time costs 1 MASS / hour).
    m = requests.get(f"{BASE}/api/map/markers", headers=_hdr(tok), params={"limit": 50})
    assert m.status_code == 200
    assert m.json()["markers"] == [] and m.json()["access"] is False
    # With MASS the teaser tier comes back: never the street address, gallery or agent.
    _set_balance(admin_tok, uid, tok, "MASS", 1)
    mk = requests.get(f"{BASE}/api/map/markers", headers=_hdr(tok), params={"limit": 50}).json()["markers"]
    assert len(mk) > 0
    assert _balance(tok) == 0  # the hour on the map took the single MASS
    assert {"id", "category", "type", "lat", "lng", "unlocked", "verified", "approx"} <= set(mk[0].keys())
    assert not ({"location", "agent_phone", "agent_email", "agent_name"} & set(mk[0].keys()))
    assert all(x["images"] is None for x in mk if not x["unlocked"])
    assert all(x["approx"] for x in mk)  # jittered until unlocked
    r = _unlock(tok, "property", props[0]["id"])
    assert r.status_code == 402
    assert _balance(tok) == 0
    d = requests.get(f"{BASE}/api/properties/{props[0]['id']}/details", headers=_hdr(tok))
    assert d.status_code == 403


def test_insufficient_mass_no_charge(admin_tok, props):
    tok, uid = _new_user()
    p = props[0]
    q = requests.get(f"{BASE}/api/unlocks/quote", headers=_hdr(tok), params={"featureKey": "property", "targetId": p["id"]}).json()
    _set_balance(admin_tok, uid, tok, "MASS", max(1, q["fee"] - 1))
    r = _unlock(tok, "property", p["id"])
    assert r.status_code == 402
    assert _balance(tok) == max(1, q["fee"] - 1)


# ─── Cancel / confirm / repeat / idempotency / forged fee ───────────────
def test_cancel_confirm_repeat_idempotent_forged(admin_tok, props):
    tok, uid = _new_user()
    p = props[1]
    q = requests.get(f"{BASE}/api/unlocks/quote", headers=_hdr(tok), params={"featureKey": "property", "targetId": p["id"]}).json()
    fee = q["fee"]
    _set_balance(admin_tok, uid, tok, "MASS", fee + 50)
    # cancel → no charge
    c = requests.post(f"{BASE}/api/unlocks/cancel", headers=_hdr(tok), json={"featureKey": "property", "targetId": p["id"]})
    assert c.status_code == 200 and _balance(tok) == fee + 50
    # forged fee is ignored (client never sets fees)
    key = uuid.uuid4().hex
    r = _unlock(tok, "property", p["id"], key=key, extra_body={"fee": 1, "amount": 1})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["charged"] == fee and body["balance_after"] == 50
    assert body["details"]["agent_phone"] is not None or body["details"]["unlocked"] is True
    assert _balance(tok) == 50
    # same idempotency key (network drop after payment) → same result, no second charge
    r2 = _unlock(tok, "property", p["id"], key=key)
    assert r2.status_code == 200 and r2.json()["charged"] == fee and _balance(tok) == 50
    # reopen with new key → free
    r3 = _unlock(tok, "property", p["id"])
    assert r3.status_code == 200 and r3.json()["charged"] == 0 and r3.json()["free_reason"] == "already_unlocked"
    assert _balance(tok) == 50
    # details API now 200; and still viewable at zero balance
    _set_balance(admin_tok, uid, tok, "MASS", 0)
    d = requests.get(f"{BASE}/api/properties/{p['id']}/details", headers=_hdr(tok))
    assert d.status_code == 200 and d.json()["unlocked"] is True
    # ledger has exactly one spend row with full snapshot
    tx = requests.get(f"{BASE}/api/wallet/transactions", headers=_hdr(tok), params={"currency": "MASS", "limit": 50}).json()
    spends = [t for t in tx if t.get("kind") == "spend_unlock"]
    assert len(spends) == 1
    t = spends[0]
    assert t["feature_key"] == "property" and t["target_id"] == p["id"] and t["status"] == "completed"
    assert t["balance_before"] == fee + 50 and t["balance_after"] == 50 and t["price_snapshot"]["amount"] == fee
    # my unlocks lists it
    mine = requests.get(f"{BASE}/api/unlocks/mine", headers=_hdr(tok), params={"featureKey": "property"}).json()
    assert mine["count"] == 1 and mine["items"][0]["property"]["id"] == p["id"]
    # legacy alias is free now
    a = requests.post(f"{BASE}/api/properties/{p['id']}/access", headers=_hdr(tok))
    assert a.status_code == 200 and a.json()["tokens_paid"] == 0


def test_concurrent_property_unlock_single_charge(admin_tok, props):
    tok, uid = _new_user()
    p = props[2]
    q = requests.get(f"{BASE}/api/unlocks/quote", headers=_hdr(tok), params={"featureKey": "property", "targetId": p["id"]}).json()
    fee = q["fee"]
    _set_balance(admin_tok, uid, tok, "MASS", fee * 3)
    with ThreadPoolExecutor(max_workers=6) as ex:
        results = list(ex.map(lambda _: _unlock(tok, "property", p["id"]), range(6)))
    codes = [r.status_code for r in results]
    charged = [r.json()["charged"] for r in results if r.status_code == 200]
    assert sum(1 for c in charged if c > 0) == 1, (codes, charged)
    assert _balance(tok) == fee * 2
    tx = requests.get(f"{BASE}/api/wallet/transactions", headers=_hdr(tok), params={"currency": "MASS", "limit": 50}).json()
    assert len([t for t in tx if t.get("kind") == "spend_unlock"]) == 1


# ─── FIXA is free — no gate, no unlock, contact always visible ───────────
def test_fixa_free_for_zero_mass_user(admin_tok, providers):
    tok, uid = _new_user()
    _set_balance(admin_tok, uid, tok, "MASS", 0)
    pid = providers[0]["id"]
    r = requests.get(f"{BASE}/api/fixa/providers", headers=_hdr(tok))
    assert r.status_code == 200, r.text
    item = next(i for i in r.json()["items"] if i["id"] == pid)
    assert item["phone"] and item["whatsapp"]  # contact is public — no booking or payment needed
    d = requests.get(f"{BASE}/api/fixa/providers/{pid}", headers=_hdr(tok))
    assert d.status_code == 200 and d.json()["phone"] and "reviews_list" in d.json()
    assert requests.get(f"{BASE}/api/fixa/access", headers=_hdr(tok)).status_code == 404
    assert requests.get(f"{BASE}/api/fixa/providers/{pid}/details", headers=_hdr(tok)).status_code == 404
    # fixa_provider is no longer a paid feature
    assert requests.get(f"{BASE}/api/unlocks/quote", headers=_hdr(tok), params={"featureKey": "fixa_provider", "targetId": pid}).status_code == 422
    assert _unlock(tok, "fixa_provider", pid).status_code == 422
    # booking is free and never touches the wallet
    b = requests.post(f"{BASE}/api/marketplace/fixa/book", headers=_hdr(tok), json={"item_id": pid, "customer_name": "T", "customer_phone": "080", "address": "x", "scheduled_date": "2026-07-01", "scheduled_time": "Morning"})
    assert b.status_code == 200, b.text
    assert b.json()["booking"]["status"] == "pending" and b.json()["booking"]["provider_phone"]
    assert _balance(tok, "MASS") == 0
    # one open booking per provider
    b2 = requests.post(f"{BASE}/api/marketplace/fixa/book", headers=_hdr(tok), json={"item_id": pid, "customer_name": "T", "customer_phone": "080", "address": "x", "scheduled_date": "2026-07-02", "scheduled_time": "Morning"})
    assert b2.status_code == 409
    c = requests.post(f"{BASE}/api/marketplace/fixa/bookings/{b.json()['booking']['id']}/cancel", headers=_hdr(tok), json={"note": "changed plans"})
    assert c.status_code == 200 and c.json()["status"] == "cancelled"


def test_marketplace_services_expose_contact(providers):
    mk = requests.get(f"{BASE}/api/marketplace", params={"category": "services"}).json()
    assert mk and all("contact_locked" not in d for d in mk)
    it = requests.get(f"{BASE}/api/marketplace/items/{providers[0]['id']}").json()["item"]
    assert it.get("seller_phone")


# ─── Pricing admin ───────────────────────────────────────────────────────
def test_price_change_future_only_and_validation(admin_tok, props):
    tok, uid = _new_user()
    p = _find_prop(props, lambda x: "ikoyi" not in (x.get("city", "") + x.get("location", "")).lower())
    q = requests.get(f"{BASE}/api/unlocks/quote", headers=_hdr(tok), params={"featureKey": "property", "targetId": p["id"]}).json()
    fee, cat, zone = q["fee"], q["category"], q["zone_tier"]
    _set_balance(admin_tok, uid, tok, "MASS", fee)
    r = _unlock(tok, "property", p["id"])
    assert r.status_code == 200 and r.json()["charged"] == fee
    # invalid prices rejected
    assert requests.post(f"{BASE}/api/admin/pricing", headers=_hdr(admin_tok), json={"featureKey": "property", "category": cat, "zoneTier": zone, "amount": 0}).status_code == 422
    sale = requests.get(f"{BASE}/api/admin/pricing", headers=_hdr(admin_tok)).json()["prices"]
    sale_amt = next(x["amount"] for x in sale if x["feature_key"] == "property" and x["category"] == "sale" and x["zone_tier"] == zone)
    rent_amt = next(x["amount"] for x in sale if x["feature_key"] == "property" and x["category"] == "rent" and x["zone_tier"] == zone)
    # rent/lease must stay above sale, and every fee stays within 5–12 MASS
    assert requests.post(f"{BASE}/api/admin/pricing", headers=_hdr(admin_tok), json={"featureKey": "property", "category": "rent", "zoneTier": zone, "amount": sale_amt - 1}).status_code == 422
    assert requests.post(f"{BASE}/api/admin/pricing", headers=_hdr(admin_tok), json={"featureKey": "property", "category": "sale", "zoneTier": zone, "amount": rent_amt + 1}).status_code == 422
    assert requests.post(f"{BASE}/api/admin/pricing", headers=_hdr(admin_tok), json={"featureKey": "property", "category": "sale", "zoneTier": zone, "amount": 4}).status_code == 422
    assert requests.post(f"{BASE}/api/admin/pricing", headers=_hdr(admin_tok), json={"featureKey": "property", "category": "rent", "zoneTier": zone, "amount": 13}).status_code == 422
    # valid change → future quotes only; past entitlement untouched
    restore_rent = None
    if cat == "rent":
        new_fee = fee - 1 if fee - 1 > sale_amt else fee + 1
    else:
        new_fee = next((x for x in (fee - 1, fee + 1) if 5 <= x < rent_amt), None)
        if new_fee is None:  # e.g. zone D sale 5 / rent 6 — lift rent first so sale has room
            restore_rent = rent_amt
            assert requests.post(f"{BASE}/api/admin/pricing", headers=_hdr(admin_tok), json={"featureKey": "property", "category": "rent", "zoneTier": zone, "amount": rent_amt + 1, "note": "test"}).status_code == 200
            new_fee = fee + 1
    r2 = requests.post(f"{BASE}/api/admin/pricing", headers=_hdr(admin_tok), json={"featureKey": "property", "category": cat, "zoneTier": zone, "amount": new_fee, "note": "test"})
    assert r2.status_code == 200, r2.text
    try:
        hist = requests.get(f"{BASE}/api/admin/pricing/history", headers=_hdr(admin_tok), params={"featureKey": "property", "zoneTier": zone, "category": cat}).json()["history"]
        assert len(hist) >= 2 and hist[0]["active"] is True and hist[1]["active"] is False and hist[1]["effective_to"]
        tok2, uid2 = _new_user()
        q2 = requests.get(f"{BASE}/api/unlocks/quote", headers=_hdr(tok2), params={"featureKey": "property", "targetId": p["id"]}).json()
        assert q2["fee"] == new_fee
        mine = requests.get(f"{BASE}/api/unlocks/mine", headers=_hdr(tok), params={"featureKey": "property"}).json()
        assert mine["items"][0]["entitlement"]["amount_paid"] == fee
    finally:
        requests.post(f"{BASE}/api/admin/pricing", headers=_hdr(admin_tok), json={"featureKey": "property", "category": cat, "zoneTier": zone, "amount": fee, "note": "restore"})
        if restore_rent is not None:
            requests.post(f"{BASE}/api/admin/pricing", headers=_hdr(admin_tok), json={"featureKey": "property", "category": "rent", "zoneTier": zone, "amount": restore_rent, "note": "restore"})


# ─── Auto-credit ─────────────────────────────────────────────────────────
def test_auto_credit_on_unavailable_listing(admin_tok, props):
    tok, uid = _new_user()
    p = props[3] if len(props) > 3 else props[0]
    q = requests.get(f"{BASE}/api/unlocks/quote", headers=_hdr(tok), params={"featureKey": "property", "targetId": p["id"]}).json()
    fee = q["fee"]
    _set_balance(admin_tok, uid, tok, "MASS", fee)
    r = _unlock(tok, "property", p["id"])
    assert r.status_code == 200 and r.json()["charged"] == fee and _balance(tok) == 0
    ent_id = r.json()["entitlement"]["id"]
    # user reports the listing unavailable within 24h → ledger auto-credit, exactly once
    rep = requests.post(f"{BASE}/api/unlocks/{ent_id}/report", headers=_hdr(tok), json={"reason": "unavailable"})
    assert rep.status_code == 200 and rep.json()["credited"] == fee
    assert _balance(tok) == fee
    assert requests.post(f"{BASE}/api/unlocks/{ent_id}/report", headers=_hdr(tok), json={"reason": "unavailable"}).status_code == 409
    tx = requests.get(f"{BASE}/api/wallet/transactions", headers=_hdr(tok), params={"currency": "MASS", "limit": 50}).json()
    refunds = [t for t in tx if t.get("kind") == "refund"]
    assert len(refunds) == 1 and refunds[0].get("auto_credit") is True and refunds[0]["status"] == "completed"
    # report → appears in monetization report
    rpt = requests.get(f"{BASE}/api/admin/monetization/report", headers=_hdr(admin_tok)).json()
    assert rpt["paid_unlocks"] >= 1 and rpt["auto_credits"] >= 1 and "tokens_collected" in rpt and "revenue_by_date" in rpt


# ─── Marketplace checkout & regression ─────────────────────────────────
def test_marketplace_checkout_and_regression(admin_tok):
    tok, uid = _new_user()
    items = requests.get(f"{BASE}/api/marketplace", params={"limit": 20}).json()
    goods = [i for i in items if i.get("category") != "services"]
    assert goods
    a = requests.post(f"{BASE}/api/cart/add", headers=_hdr(tok), json={"item_id": goods[0]["id"], "quantity": 1})
    assert a.status_code == 200, a.text
    c = requests.post(f"{BASE}/api/checkout", headers=_hdr(tok))
    assert c.status_code in (200, 201), c.text
    # top-up minimum enforced + bonus tiers via mock payments
    init = requests.post(f"{BASE}/api/payments/initialize", headers=_hdr(tok), json={"bundle_id": "starter", "currency": "MASS", "provider": "paystack"})
    assert init.status_code == 422  # ₦500 < ₦1,000 minimum
    init = requests.post(f"{BASE}/api/payments/initialize", headers=_hdr(tok), json={"bundle_id": "investor", "currency": "MASS", "provider": "paystack"})
    assert init.status_code == 200, init.text
    # agent/admin tools still reachable
    assert requests.get(f"{BASE}/api/admin/pricing/zones", headers=_hdr(admin_tok)).status_code == 200
    assert requests.get(f"{BASE}/api/agent/score", headers=_hdr(admin_tok)).status_code == 200
    assert requests.get(f"{BASE}/api/properties", headers=_hdr(admin_tok)).status_code == 200
