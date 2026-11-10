"""Iteration 105 — AMASS Home Protect: rate card → quote → MASS payment → policy → add-on → claim → admin decision → payout."""
import os
import uuid

import pytest
import requests
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv("/app/frontend/.env")
load_dotenv("/app/backend/.env")
BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
DEMO = {"email": "demo@amass.africa", "password": "amass2026"}
_mongo = MongoClient(os.environ.get("MONGO_URL"))[os.environ.get("DB_NAME")]


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def ctx():
    """A throw-away home with three valued appliances for the demo (admin) user; existing policies are left alone."""
    tok = _login(DEMO)
    h = _h(tok)
    home = requests.post(f"{API}/home/homes", json={"name": f"Protect test {uuid.uuid4().hex[:4]}", "kind": "house", "ownership": "owner"}, headers=h, timeout=20)
    assert home.status_code == 201, home.text
    hid = home.json()["id"]
    items = []
    for name, cat, val in (("Test TV", "tv", 400000), ("Test fridge", "fridge", 250000), ("Test shelf", "other", 50000)):
        r = requests.post(f"{API}/home/items", json={"home_id": hid, "name": name, "room": "Living room", "category": cat, "value": val}, headers=h, timeout=20)
        assert r.status_code == 201, r.text
        items.append(r.json())
    yield {"tok": tok, "h": h, "home_id": hid, "items": items, "user_id": _mongo.users.find_one({"email": DEMO["email"]})["id"]}
    # cleanup: cancel policies created for this home, remove the test home + items (test data only)
    _mongo.hp_policies.update_many({"home_id": hid}, {"$set": {"status": "cancelled"}})
    requests.delete(f"{API}/home/homes/{hid}?force=true", headers=h, timeout=20)


def _wallet(h):
    return requests.get(f"{API}/wallet/me", headers=h, timeout=20).json()["spendable"]


def test_catalog_has_live_rate_card(ctx):
    r = requests.get(f"{API}/home/protect/catalog", headers=ctx["h"], timeout=20)
    assert r.status_code == 200
    d = r.json()
    assert d["open"] is True and d["rate_card"]["plans"] and "tv" in d["insurable_categories"] and "other" not in d["insurable_categories"]
    assert d["rate_card"]["perils"]["surge"] == "Power surge"


def test_quote_prices_building_contents_and_items(ctx):
    h = ctx["h"]
    ids = [i["id"] for i in ctx["items"]]
    r = requests.post(f"{API}/home/protect/quote", json={"home_id": ctx["home_id"], "plan_key": "standard", "include_building": True, "item_ids": ids}, headers=h, timeout=20)
    assert r.status_code == 201, r.text
    q = r.json()
    assert q["kind"] == "new" and q["include_building"] is True
    assert q["breakdown"]["building_ngn"] == 25000 and q["breakdown"]["contents_ngn"] == 12000
    # TV 400k * 3% = 12,000 → 10% off = 10,800 ; fridge 250k * 2.5% = 6,250 → 5,625
    lines = {l["name"]: l["premium_ngn"] for l in q["items"]}
    assert lines == {"Test TV": 10800, "Test fridge": 5625}
    assert [s["name"] for s in q["skipped"]] == ["Test shelf"]
    assert q["total_ngn"] == 25000 + 12000 + 10800 + 5625 and q["total_mass"] == -(-q["total_ngn"] // 100)
    assert "wallet" in q and q["wallet"]["shortfall"] >= 0
    ctx["quote"] = q


def test_quote_requires_plan(ctx):
    r = requests.post(f"{API}/home/protect/quote", json={"home_id": ctx["home_id"], "plan_key": "nope", "item_ids": []}, headers=ctx["h"], timeout=20)
    assert r.status_code == 422


def test_pay_debits_mass_and_creates_policy(ctx):
    h = ctx["h"]
    q = ctx["quote"]
    before = _wallet(h)
    r = requests.post(f"{API}/home/protect/quotes/{q['id']}/pay", headers=h, timeout=30)
    assert r.status_code == 200, r.text
    p = r.json()
    assert p["policy_no"].startswith("HP") and p["state"] == "active" and p["insured_items"] == 2
    assert p["cover"]["include_building"] is True and "surge" in p["cover"]["perils"]
    assert _wallet(h) == before - q["total_mass"]
    assert p["receipt_no"]
    ctx["policy"] = p
    # idempotent: paying again returns the same policy, no second debit
    r2 = requests.post(f"{API}/home/protect/quotes/{q['id']}/pay", headers=h, timeout=30)
    assert r2.status_code == 200 and r2.json()["id"] == p["id"]
    assert _wallet(h) == before - q["total_mass"]
    tx = _mongo.token_transactions.find_one({"user_id": ctx["user_id"], "meta.quote_id": q["id"]})
    assert tx and tx["kind"] == "spend_insurance" and tx["amount"] == -q["total_mass"]


def test_items_and_overview_show_protection(ctx):
    h = ctx["h"]
    d = requests.get(f"{API}/home/items?home_id={ctx['home_id']}", headers=h, timeout=20).json()
    prot = {i["name"]: i["protection"]["status"] for i in d["items"]}
    assert prot == {"Test TV": "active", "Test fridge": "active", "Test shelf": "none"} and d["protected"] == 2
    tv = requests.get(f"{API}/home/items/{ctx['items'][0]['id']}", headers=h, timeout=20).json()
    assert tv["protection"]["policy_id"] == ctx["policy"]["id"] and tv["protection"]["policy_no"] == ctx["policy"]["policy_no"]
    ov = requests.get(f"{API}/home/overview?home_id={ctx['home_id']}", headers=h, timeout=20).json()
    assert ov["protection"]["status"] == "active" and ov["protection"]["insured_items"] == 2 and ov["protection"]["policy_id"] == ctx["policy"]["id"]
    st = requests.get(f"{API}/home/protect/status?home_id={ctx['home_id']}", headers=h, timeout=20).json()
    assert st["live"]["id"] == ctx["policy"]["id"] and st["items_protected"] == 2 and st["unprotected_insurable"] == []


def test_second_policy_for_same_home_is_refused(ctx):
    r = requests.post(f"{API}/home/protect/quote", json={"home_id": ctx["home_id"], "plan_key": "basic", "item_ids": []}, headers=ctx["h"], timeout=20)
    assert r.status_code == 409 and r.json()["detail"]["code"] == "already_covered"


def test_addon_quote_is_prorated_and_appends_items(ctx):
    h = ctx["h"]
    r = requests.post(f"{API}/home/items", json={"home_id": ctx["home_id"], "name": "Test AC", "room": "Bedroom", "category": "ac", "value": 300000}, headers=h, timeout=20)
    assert r.status_code == 201
    ac = r.json()
    r = requests.post(f"{API}/home/protect/quote", json={"home_id": ctx["home_id"], "policy_id": ctx["policy"]["id"], "item_ids": [ac["id"], ctx["items"][0]["id"]]}, headers=h, timeout=20)
    assert r.status_code == 201, r.text
    q = r.json()
    assert q["kind"] == "addon" and [l["name"] for l in q["items"]] == ["Test AC"] and q["already_covered"][0]["name"] == "Test TV"
    assert 0 < q["breakdown"]["prorate_factor"] <= 1 and q["total_ngn"] == round(q["breakdown"]["appliances_annual_ngn"] * q["breakdown"]["prorate_factor"])
    before = _wallet(h)
    r = requests.post(f"{API}/home/protect/quotes/{q['id']}/pay", headers=h, timeout=30)
    assert r.status_code == 200, r.text
    p = r.json()
    assert p["id"] == ctx["policy"]["id"] and p["insured_items"] == 3 and p["added_items"] == 1
    assert _wallet(h) == before - q["total_mass"]
    ctx["ac"] = ac


def test_insurance_shows_in_spending(ctx):
    d = requests.get(f"{API}/home/spending?home_id={ctx['home_id']}", headers=ctx["h"], timeout=20).json()
    ins = [x for x in d["recent"] if x["type"] == "insurance"]
    assert len(ins) == 2 and d["totals"]["insurance"] == sum(x["amount"] for x in ins)
    assert ins[0]["path"].startswith("/home/protect/policy/")


def test_claim_validation(ctx):
    h = ctx["h"]
    pid = ctx["policy"]["id"]
    today = requests.get(f"{API}/home/protect/status", headers=h, timeout=20).json()["today"]
    base = {"policy_id": pid, "scope": "appliance", "item_id": ctx["items"][0]["id"], "incident_type": "surge", "incident_date": today, "description": "The TV popped during a surge and is dead.", "photos": []}
    # future date
    r = requests.post(f"{API}/home/protect/claims", json={**base, "incident_date": "2099-01-01"}, headers=h, timeout=20)
    assert r.status_code == 422
    # item not on policy (the shelf)
    r = requests.post(f"{API}/home/protect/claims", json={**base, "item_id": ctx["items"][2]["id"]}, headers=h, timeout=20)
    assert r.status_code == 422
    # photo path not owned
    r = requests.post(f"{API}/home/protect/claims", json={**base, "photos": [{"path": "amass/uploads/someone-else/x.jpg", "url": "/api/files/x"}]}, headers=h, timeout=20)
    assert r.status_code == 403
    # unknown incident
    r = requests.post(f"{API}/home/protect/claims", json={**base, "incident_type": "meteor"}, headers=h, timeout=20)
    assert r.status_code == 422


def test_claim_lifecycle_to_payout(ctx):
    h = ctx["h"]
    pid = ctx["policy"]["id"]
    today = requests.get(f"{API}/home/protect/status", headers=h, timeout=20).json()["today"]
    cid = str(uuid.uuid4())
    body = {"id": cid, "policy_id": pid, "scope": "appliance", "item_id": ctx["items"][0]["id"], "incident_type": "accident", "incident_date": today, "description": "Knocked off the wall mount while cleaning; the screen cracked.", "amount_claimed_ngn": 120000, "photos": []}
    r = requests.post(f"{API}/home/protect/claims", json=body, headers=h, timeout=20)
    assert r.status_code == 201, r.text
    c = r.json()
    assert c["claim_no"].startswith("CLM-") and c["status"] == "submitted" and c["is_open"] is True
    assert c["coverage_warning"] and "Accidental damage" in c["coverage_warning"]  # standard plan has no accident peril
    # idempotent create with the same client id
    assert requests.post(f"{API}/home/protect/claims", json=body, headers=h, timeout=20).json()["id"] == cid
    # admin queue
    q = requests.get(f"{API}/home/protect/admin/claims?status=open", headers=h, timeout=20).json()
    assert any(x["id"] == cid and x["user"]["email"] == DEMO["email"] for x in q["items"])
    # review → more info → customer reply → approved → paid
    r = requests.post(f"{API}/home/protect/admin/claims/{cid}/decide", json={"status": "under_review"}, headers=h, timeout=20)
    assert r.status_code == 200 and r.json()["status"] == "under_review"
    r = requests.post(f"{API}/home/protect/admin/claims/{cid}/decide", json={"status": "more_info", "note": "Please add a photo of the crack"}, headers=h, timeout=20)
    assert r.json()["status"] == "more_info"
    r = requests.post(f"{API}/home/protect/claims/{cid}/reply", json={"message": "Here you go", "photos": []}, headers=h, timeout=20)
    assert r.status_code == 200 and r.json()["status"] == "under_review"
    # approve needs a payout
    assert requests.post(f"{API}/home/protect/admin/claims/{cid}/decide", json={"status": "approved"}, headers=h, timeout=20).status_code == 422
    r = requests.post(f"{API}/home/protect/admin/claims/{cid}/decide", json={"status": "approved", "payout_ngn": 100000, "note": "Approved less excess"}, headers=h, timeout=20)
    assert r.status_code == 200 and r.json()["payout_mass"] == 1000
    before = _wallet(h)
    r = requests.post(f"{API}/home/protect/admin/claims/{cid}/decide", json={"status": "paid"}, headers=h, timeout=20)
    assert r.status_code == 200 and r.json()["status"] == "paid" and r.json()["is_open"] is False
    assert _wallet(h) == before + 1000
    tx = _mongo.token_transactions.find_one({"user_id": ctx["user_id"], "meta.claim_id": cid})
    assert tx and tx["kind"] == "insurance_payout" and tx["amount"] == 1000
    # closed claims can't be touched again
    assert requests.post(f"{API}/home/protect/admin/claims/{cid}/decide", json={"status": "rejected", "note": "x"}, headers=h, timeout=20).status_code == 409
    assert requests.post(f"{API}/home/protect/claims/{cid}/reply", json={"message": "late", "photos": []}, headers=h, timeout=20).status_code == 409
    # notifications reached the customer
    n = requests.get(f"{API}/notifications/center?audience=consumer", headers=h, timeout=20).json()
    kinds = [x for x in n.get("items", []) if x["kind"] == "HOME_PROTECT_CLAIM" and x.get("meta", {}).get("claim_id") == cid]
    assert len(kinds) >= 4
    # policy detail lists the claim
    p = requests.get(f"{API}/home/protect/policies/{pid}", headers=h, timeout=20).json()
    assert any(x["id"] == cid for x in p["claims"]) and p["partner"]["claims_phone"]


def test_admin_rate_card_roundtrip(ctx):
    h = ctx["h"]
    cards = requests.get(f"{API}/home/protect/admin/rate-cards", headers=h, timeout=20).json()
    live = next(c for c in cards["items"] if c["active"])
    body = {k: v for k, v in live.items() if k not in ("id", "created_at", "updated_at", "updated_by")}
    body["partner_name"] = "Draft Partner (test)"
    body["active"] = False
    r = requests.post(f"{API}/home/protect/admin/rate-cards", json=body, headers=h, timeout=20)
    assert r.status_code == 201, r.text
    draft = r.json()
    assert draft["active"] is False
    # live card untouched
    assert requests.get(f"{API}/home/protect/catalog", headers=h, timeout=20).json()["rate_card"]["id"] == live["id"]
    # duplicate plan keys rejected
    bad = {**body, "plans": [body["plans"][0], body["plans"][0]]}
    assert requests.post(f"{API}/home/protect/admin/rate-cards", json=bad, headers=h, timeout=20).status_code == 422
    # unknown peril rejected
    bad = {**body, "plans": [{**body["plans"][0], "perils": ["meteor"]}]}
    assert requests.post(f"{API}/home/protect/admin/rate-cards", json=bad, headers=h, timeout=20).status_code == 422
    # update draft
    r = requests.put(f"{API}/home/protect/admin/rate-cards/{draft['id']}", json={**body, "notes": "edited"}, headers=h, timeout=20)
    assert r.status_code == 200 and r.json()["notes"] == "edited"
    s = requests.get(f"{API}/home/protect/admin/summary", headers=h, timeout=20).json()
    assert s["rate_card_active"] is True and s["policies_live"] >= 1
    _mongo.hp_rate_cards.delete_one({"id": draft["id"], "partner_name": "Draft Partner (test)"})


def test_admin_endpoints_need_admin():
    tok = _login(DEMO)
    # make a throw-away non-admin user
    email = f"hp-{uuid.uuid4().hex[:8]}@amass-qa.africa"
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": "Passw0rd!x", "full_name": "HP Tester"}, timeout=20)
    assert r.status_code in (200, 201), r.text
    t2 = r.json()["access_token"]
    assert requests.get(f"{API}/home/protect/admin/summary", headers=_h(t2), timeout=20).status_code == 403
    assert requests.get(f"{API}/home/protect/admin/claims", headers=_h(t2), timeout=20).status_code == 403
    assert requests.get(f"{API}/home/protect/catalog", headers=_h(t2), timeout=20).status_code == 200
    assert requests.get(f"{API}/home/protect/admin/summary", headers=_h(tok), timeout=20).status_code == 200
