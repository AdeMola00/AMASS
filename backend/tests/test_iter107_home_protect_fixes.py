# Home Protect iter107 fixes: ownership gate, home deletion cancels cover, atomic claim payout,
# friendly dates in copy, item detail knows the home's live policy.
import os
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import date

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    for line in open("/app/frontend/.env"):
        if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")
API = f"{BASE_URL}/api"


def _login(email, pw):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=20)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def H():
    return _login("demo@amass.africa", "amass2026")


def _mk_home(H, ownership=None):
    body = {"name": f"TEST_fix_{uuid.uuid4().hex[:5]}", "kind": "flat"}
    if ownership:
        body["ownership"] = ownership
    r = requests.post(f"{API}/home/homes", headers=H, json=body, timeout=20)
    assert r.status_code == 201, r.text
    h = r.json()
    return h.get("home", h)


def _put_home(H, h, **changes):
    body = {"name": h["name"], "kind": h.get("kind", "flat"), **changes}
    r = requests.put(f"{API}/home/homes/{h['id']}", headers=H, json=body, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()


def _balance(H):
    return requests.get(f"{API}/wallet/me", headers=H, timeout=20).json()["balance"]


@pytest.fixture(scope="module")
def home(H):
    h = _mk_home(H)  # no ownership on purpose
    yield h
    requests.delete(f"{API}/home/homes/{h['id']}?force=true", headers=H, timeout=20)


def test_quote_needs_ownership(H, home):
    r = requests.post(f"{API}/home/protect/quote", headers=H, json={"home_id": home["id"], "plan_key": "basic"}, timeout=20)
    assert r.status_code == 422, r.text
    assert r.json()["detail"]["code"] == "ownership_required"


def test_owner_gets_building_renter_does_not(H, home):
    _put_home(H, home, ownership="renting")
    q = requests.post(f"{API}/home/protect/quote", headers=H, json={"home_id": home["id"], "plan_key": "basic", "include_building": True}, timeout=20).json()
    assert q["include_building"] is False and q["breakdown"]["building_ngn"] == 0
    _put_home(H, home, ownership="owner")
    q = requests.post(f"{API}/home/protect/quote", headers=H, json={"home_id": home["id"], "plan_key": "basic", "include_building": True}, timeout=20).json()
    assert q["include_building"] is True and q["breakdown"]["building_ngn"] > 0
    assert q["expires_at"] and q["total_mass"] > 0


def test_pay_once_then_delete_home_cancels_cover(H):
    h = _mk_home(H, ownership="renting")
    try:
        q = requests.post(f"{API}/home/protect/quote", headers=H, json={"home_id": h["id"], "plan_key": "basic"}, timeout=20).json()
        b0 = _balance(H)
        with ThreadPoolExecutor(4) as ex:
            res = list(ex.map(lambda _: requests.post(f"{API}/home/protect/quotes/{q['id']}/pay", headers=H, timeout=30), range(4)))
        codes = sorted(r.status_code for r in res)
        # Losers of the lock get 409; a request that lands after the winner finished gets the same policy back (idempotent 200).
        assert codes.count(200) >= 1 and all(c in (200, 409) for c in codes), codes
        assert len({r.json()["id"] for r in res if r.status_code == 200}) == 1
        assert b0 - _balance(H) == q["total_mass"]
        pol = next(r for r in res if r.status_code == 200).json()
        assert pol["state"] == "active"
        # An open claim on this cover → withdrawn when the home goes
        cl = requests.post(f"{API}/home/protect/claims", headers=H, json={"policy_id": pol["id"], "scope": "contents", "incident_type": "fire", "incident_date": date.today().isoformat(), "description": "TEST_ kitchen fire damaged the cupboards"}, timeout=20)
        assert cl.status_code == 201, cl.text
        claim_id = cl.json()["id"]
        # Friendly dates in the copy the customer reads
        n = requests.get(f"{API}/notifications/center?audience=consumer", headers=H, timeout=20).json()
        mine = [x for x in n.get("items", []) if x["kind"] == "HOME_PROTECT_POLICY" and (x.get("meta") or {}).get("policy_id") == pol["id"]]
        assert mine, "policy notification missing"
        body = mine[0].get("body") or mine[0].get("message") or ""
        assert "runs until" in body and "-" not in body.split("runs until", 1)[1][:12], body
        # An item on this home → detail knows the live policy so the UI can offer the add-on route
        it = requests.post(f"{API}/home/items", headers=H, json={"home_id": h["id"], "name": "TEST_ TV", "category": "tv", "value": 300000}, timeout=20)
        assert it.status_code == 201, it.text
        item = it.json()
        item = item.get("item", item)
        d = requests.get(f"{API}/home/items/{item['id']}", headers=H, timeout=20).json()
        assert d["home_policy_id"] == pol["id"] and d["protection"]["status"] == "none"
        # Delete without force → told about live cover
        r = requests.delete(f"{API}/home/homes/{h['id']}", headers=H, timeout=20)
        assert r.status_code == 409 and r.json()["detail"]["code"] == "HOME_NOT_EMPTY" and r.json()["detail"]["live_cover"] == 1, r.text
        # Force → home gone, cover cancelled, nothing live left on it
        r = requests.delete(f"{API}/home/homes/{h['id']}?force=true", headers=H, timeout=20)
        assert r.status_code == 200 and r.json()["policies_cancelled"] == 1, r.text
        p = requests.get(f"{API}/home/protect/policies/{pol['id']}", headers=H, timeout=20).json()
        assert p["status"] == "cancelled" and p["state"] == "cancelled" and p["cancel_reason"] == "home_deleted"
        c2 = requests.get(f"{API}/home/protect/claims/{claim_id}", headers=H, timeout=20).json()
        assert c2["status"] == "rejected" and not c2["is_open"] and "Withdrawn" in (c2.get("admin_note") or "")
        adm_open = requests.get(f"{API}/home/protect/admin/claims?status=open", headers=H, timeout=20).json()["items"]
        assert all(x["id"] != claim_id for x in adm_open)
        st = requests.get(f"{API}/home/protect/status?home_id={h['id']}", headers=H, timeout=20).json()
        assert st["live"] is None
        adm = requests.get(f"{API}/home/protect/admin/policies", headers=H, timeout=20).json()["items"]
        assert all(x["state"] != "active" for x in adm if x["id"] == pol["id"])
    finally:
        requests.delete(f"{API}/home/homes/{h['id']}?force=true", headers=H, timeout=20)


def test_admin_paid_credits_once_under_concurrency(H):
    h = _mk_home(H, ownership="renting")
    try:
        q = requests.post(f"{API}/home/protect/quote", headers=H, json={"home_id": h["id"], "plan_key": "basic"}, timeout=20).json()
        pol = requests.post(f"{API}/home/protect/quotes/{q['id']}/pay", headers=H, timeout=30).json()
        c = requests.post(f"{API}/home/protect/claims", headers=H, json={"policy_id": pol["id"], "scope": "contents", "incident_type": "theft", "incident_date": date.today().isoformat(), "description": "TEST_ burglary took the living room contents"}, timeout=20)
        assert c.status_code == 201, c.text
        cid = c.json()["id"]
        assert requests.post(f"{API}/home/protect/admin/claims/{cid}/decide", headers=H, json={"status": "approved", "payout_ngn": 50000}, timeout=20).status_code == 200
        b0 = _balance(H)
        with ThreadPoolExecutor(4) as ex:
            res = list(ex.map(lambda _: requests.post(f"{API}/home/protect/admin/claims/{cid}/decide", headers=H, json={"status": "paid"}, timeout=30), range(4)))
        codes = sorted(r.status_code for r in res)
        assert codes.count(200) == 1 and codes.count(409) == 3, codes
        assert _balance(H) - b0 == 500  # ₦50,000 at ₦100/MASS, credited exactly once
        cl = requests.get(f"{API}/home/protect/claims/{cid}", headers=H, timeout=20).json()
        assert cl["status"] == "paid" and cl["payout_balance_after"] is not None
        assert sum(1 for t in cl["timeline"] if t["status"] == "paid") == 1
    finally:
        requests.delete(f"{API}/home/homes/{h['id']}?force=true", headers=H, timeout=20)
