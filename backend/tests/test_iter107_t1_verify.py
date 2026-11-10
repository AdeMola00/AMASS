# T1 independent verification of iter107 Home Protect fixes: pay race, admin paid race, ownership gate,
# force delete cancels cover, friendly notification dates, item.home_policy_id.
import os
import re
import threading
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


@pytest.fixture(scope="module")
def H():
    r = requests.post(f"{API}/auth/login", json={"email": "demo@amass.africa", "password": "amass2026"}, timeout=20)
    assert r.status_code == 200
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _mk_home(H, ownership=None):
    body = {"name": f"TEST_t1_{uuid.uuid4().hex[:5]}", "kind": "flat"}
    if ownership:
        body["ownership"] = ownership
    r = requests.post(f"{API}/home/homes", headers=H, json=body, timeout=20)
    assert r.status_code == 201, r.text
    h = r.json()
    return h.get("home", h)


def _bal(H):
    return requests.get(f"{API}/wallet/me", headers=H, timeout=20).json()["balance"]


def _burst(n, fn):
    bar = threading.Barrier(n)

    def run(_):
        bar.wait()
        return fn()
    with ThreadPoolExecutor(n) as ex:
        return list(ex.map(run, range(n)))


# Pay race: wallet debited once, single policy, every 200 returns the same policy
def test_pay_race_debits_once(H):
    h = _mk_home(H, "renting")
    try:
        q = requests.post(f"{API}/home/protect/quote", headers=H, json={"home_id": h["id"], "plan_key": "basic"}, timeout=20).json()
        b0 = _bal(H)
        res = _burst(4, lambda: requests.post(f"{API}/home/protect/quotes/{q['id']}/pay", headers=H, timeout=30))
        codes = [r.status_code for r in res]
        print("pay codes", codes)
        assert all(c in (200, 409) for c in codes)
        for r in res:
            if r.status_code == 409:
                assert r.json()["detail"]["code"] == "payment_in_progress"
        ids = {r.json()["id"] for r in res if r.status_code == 200}
        assert len(ids) == 1
        assert b0 - _bal(H) == q["total_mass"]
        pols = requests.get(f"{API}/home/protect/admin/policies", headers=H, timeout=20).json()["items"]
        assert sum(1 for p in pols if p.get("home_id") == h["id"]) == 1
    finally:
        requests.delete(f"{API}/home/homes/{h['id']}?force=true", headers=H, timeout=20)


# Ownership gate + building only for owner
def test_ownership_gate(H):
    h = _mk_home(H)
    try:
        r = requests.post(f"{API}/home/protect/quote", headers=H, json={"home_id": h["id"], "plan_key": "basic"}, timeout=20)
        assert r.status_code == 422 and r.json()["detail"]["code"] == "ownership_required"
        for own, building in (("renting", False), ("owner", True), ("family", True), ("other", False)):
            assert requests.put(f"{API}/home/homes/{h['id']}", headers=H, json={"name": h["name"], "kind": "flat", "ownership": own}, timeout=20).status_code == 200
            q = requests.post(f"{API}/home/protect/quote", headers=H, json={"home_id": h["id"], "plan_key": "basic", "include_building": True}, timeout=20).json()
            assert q["include_building"] is building, (own, q["include_building"])
            assert (q["breakdown"]["building_ngn"] > 0) is building
    finally:
        requests.delete(f"{API}/home/homes/{h['id']}?force=true", headers=H, timeout=20)


# Delete home with live cover, notification dates, item home_policy_id
def test_delete_flow_and_dates(H):
    h = _mk_home(H, "renting")
    try:
        q = requests.post(f"{API}/home/protect/quote", headers=H, json={"home_id": h["id"], "plan_key": "basic"}, timeout=20).json()
        pol = requests.post(f"{API}/home/protect/quotes/{q['id']}/pay", headers=H, timeout=30).json()
        n = requests.get(f"{API}/notifications/center?audience=consumer", headers=H, timeout=20).json()
        mine = [x for x in n.get("items", []) if x["kind"] == "HOME_PROTECT_POLICY" and (x.get("meta") or {}).get("policy_id") == pol["id"]]
        assert mine
        body = mine[0].get("body") or mine[0].get("message") or ""
        print("notif body:", body)
        assert not re.search(r"\d{4}-\d{2}-\d{2}", body)
        assert re.search(r"\d{1,2} [A-Z][a-z]{2} \d{4}", body)
        it = requests.post(f"{API}/home/items", headers=H, json={"home_id": h["id"], "name": "TEST_ TV", "category": "tv", "value": 100000}, timeout=20).json()
        it = it.get("item", it)
        d = requests.get(f"{API}/home/items/{it['id']}", headers=H, timeout=20).json()
        assert d["home_policy_id"] == pol["id"]
        r = requests.delete(f"{API}/home/homes/{h['id']}", headers=H, timeout=20)
        assert r.status_code == 409 and r.json()["detail"]["code"] == "HOME_NOT_EMPTY" and r.json()["detail"]["live_cover"] >= 1
        r = requests.delete(f"{API}/home/homes/{h['id']}?force=true", headers=H, timeout=20)
        assert r.status_code == 200 and r.json()["ok"] and r.json()["policies_cancelled"] == 1
        p = requests.get(f"{API}/home/protect/policies/{pol['id']}", headers=H, timeout=20).json()
        assert p["status"] == "cancelled" and p["cancel_reason"] == "home_deleted"
        assert requests.get(f"{API}/home/protect/status?home_id={h['id']}", headers=H, timeout=20).json()["live"] is None
        adm = requests.get(f"{API}/home/protect/admin/policies", headers=H, timeout=20).json()["items"]
        assert all(x["state"] != "active" for x in adm if x["id"] == pol["id"])
    finally:
        requests.delete(f"{API}/home/homes/{h['id']}?force=true", headers=H, timeout=20)


# Item on a home with no live cover → home_policy_id null
def test_item_home_policy_null_without_cover(H):
    h = _mk_home(H, "renting")
    try:
        it = requests.post(f"{API}/home/items", headers=H, json={"home_id": h["id"], "name": "TEST_ Fridge", "category": "fridge", "value": 100000}, timeout=20).json()
        it = it.get("item", it)
        d = requests.get(f"{API}/home/items/{it['id']}", headers=H, timeout=20).json()
        assert "home_policy_id" in d and d["home_policy_id"] is None
    finally:
        requests.delete(f"{API}/home/homes/{h['id']}?force=true", headers=H, timeout=20)


# Admin paid race (barrier-synchronised)
def test_admin_paid_race(H):
    h = _mk_home(H, "renting")
    try:
        q = requests.post(f"{API}/home/protect/quote", headers=H, json={"home_id": h["id"], "plan_key": "basic"}, timeout=20).json()
        pol = requests.post(f"{API}/home/protect/quotes/{q['id']}/pay", headers=H, timeout=30).json()
        c = requests.post(f"{API}/home/protect/claims", headers=H, json={"policy_id": pol["id"], "scope": "contents", "incident_type": "theft", "incident_date": date.today().isoformat(), "description": "TEST_ t1 burglary took the TV and laptop"}, timeout=20)
        assert c.status_code == 201, c.text
        cid = c.json()["id"]
        assert requests.post(f"{API}/home/protect/admin/claims/{cid}/decide", headers=H, json={"status": "approved", "payout_ngn": 30000}, timeout=20).status_code == 200
        b0 = _bal(H)
        res = _burst(4, lambda: requests.post(f"{API}/home/protect/admin/claims/{cid}/decide", headers=H, json={"status": "paid"}, timeout=30))
        codes = sorted(r.status_code for r in res)
        print("decide codes", codes)
        assert codes.count(200) == 1 and codes.count(409) == 3
        assert _bal(H) - b0 == 300
        cl = requests.get(f"{API}/home/protect/claims/{cid}", headers=H, timeout=20).json()
        assert sum(1 for t in cl["timeline"] if t["status"] == "paid") == 1
    finally:
        requests.delete(f"{API}/home/homes/{h['id']}?force=true", headers=H, timeout=20)
