"""Iter 84 — Map time metering (1 MASS/hour, 0 MASS gate), admin config, viewing hardening. Runs against the PUBLIC URL."""
import asyncio
import os
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

import pytest
import requests
from dotenv import dotenv_values

BASE = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or dotenv_values("/app/frontend/.env")["EXPO_PUBLIC_BACKEND_URL"]).rstrip("/")
ADMIN = ("demo@amass.africa", "amass2026")
AGENT = ("adaeze.okoye@amass.africa", "Agent2026!")


def H(t):
    return {"Authorization": f"Bearer {t}"}


def login(e, p):
    r = requests.post(f"{BASE}/api/auth/login", json={"email": e, "password": p}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def new_user():
    r = requests.post(f"{BASE}/api/auth/register", json={"email": f"test_mt84_{uuid.uuid4().hex[:8]}@amass-qa.africa", "password": "Test1234!", "full_name": "TEST Map84"}, timeout=30)
    assert r.status_code in (200, 201), r.text
    tok = r.json()["access_token"]
    return tok, requests.get(f"{BASE}/api/auth/me", headers=H(tok), timeout=30).json()["id"]


def bal(tok):
    return requests.get(f"{BASE}/api/wallet/me", headers=H(tok), timeout=30).json()["spendable"]


def set_bal(admin, uid, tok, target):
    d = target - bal(tok)
    if d:
        r = requests.post(f"{BASE}/api/admin/wallet/{uid}/adjust", headers=H(admin), json={"amount": d, "currency": "MASS", "reason": "TEST iter84"}, timeout=30)
        assert r.status_code == 200, r.text
    assert bal(tok) == target


def mongo(fn):
    from motor.motor_asyncio import AsyncIOMotorClient
    env = dotenv_values("/app/backend/.env")

    async def go():
        db = AsyncIOMotorClient(env["MONGO_URL"])[env["DB_NAME"]]
        return await fn(db)
    return asyncio.run(go())


def backdate(uid, used=None, ago=None):
    upd = {}
    if used is not None:
        upd["used_seconds"] = used
    if ago is not None:
        upd["last_tick_at"] = (datetime.now(timezone.utc) - timedelta(seconds=ago)).isoformat()
    return mongo(lambda db: db.map_time.update_one({"user_id": uid}, {"$set": upd}))


def markers(tok):
    r = requests.get(f"{BASE}/api/map/markers", headers=H(tok), timeout=60)
    assert r.status_code == 200, r.text
    return r.json()


def tick(tok):
    r = requests.post(f"{BASE}/api/map/time/tick", headers=H(tok), timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def admin():
    return login(*ADMIN)


# --- zero MASS gate
def test_zero_mass_gate(admin):
    tok, uid = new_user()
    set_bal(admin, uid, tok, 0)
    d = markers(tok)
    assert d["markers"] == [] and d["count"] == 0 and d["access"] is False
    assert d["map_time"]["remaining_seconds"] == 0 and d["map_time"]["charged_now"] is False
    t = tick(tok)
    assert t["access"] is False and t["hourly_cost"] == 1


# --- first hour charged once, ledger row, status read-only
def test_first_hour_and_ledger(admin):
    tok, uid = new_user()
    set_bal(admin, uid, tok, 3)
    d = markers(tok)
    mt = d["map_time"]
    assert d["access"] is True and d["count"] > 0 and len(d["markers"]) > 0
    assert mt["charged_now"] is True and mt["hours_charged"] == 1 and 3500 <= mt["remaining_seconds"] <= 3600
    assert bal(tok) == 2
    for _ in range(2):
        assert markers(tok)["map_time"]["charged_now"] is False
        assert tick(tok)["charged_now"] is False
    s = requests.get(f"{BASE}/api/map/time", headers=H(tok), timeout=30).json()
    assert s["charged_now"] is False and s["access"] is True
    assert bal(tok) == 2
    tx = requests.get(f"{BASE}/api/wallet/transactions", params={"currency": "MASS"}, headers=H(tok), timeout=30).json()
    rows = tx if isinstance(tx, list) else (tx.get("items") or tx.get("transactions") or [])
    mrows = [r for r in rows if (r.get("meta") or {}).get("feature_key") == "map_time"]
    assert len(mrows) == 1, rows
    assert mrows[0]["kind"] == "spend_feature" and mrows[0]["amount"] == -1


# --- hour runs out → next hour charged; empty wallet → gated; top-up → buys again; gap > 150s accrues nothing
def test_metering_rollover_empty_topup_gap(admin):
    tok, uid = new_user()
    set_bal(admin, uid, tok, 2)
    assert markers(tok)["map_time"]["hours_charged"] == 1 and bal(tok) == 1
    # gap > GRACE accrues nothing
    backdate(uid, used=100, ago=400)
    before = requests.get(f"{BASE}/api/map/time", headers=H(tok), timeout=30).json()["remaining_seconds"]
    t = tick(tok)
    assert t["remaining_seconds"] == before and t["charged_now"] is False
    # 90s gap within grace near the end of the hour → rollover
    backdate(uid, used=3560, ago=90)
    t = tick(tok)
    assert t["charged_now"] is True and t["hours_charged"] == 2 and bal(tok) == 0
    # use it up with an empty wallet → gated
    paid = mongo(lambda db: db.map_time.find_one({"user_id": uid}, {"_id": 0}))["paid_seconds"]
    backdate(uid, used=paid - 30, ago=90)
    t = tick(tok)
    assert t["access"] is False and t["charged_now"] is False
    d = markers(tok)
    assert d["access"] is False and d["markers"] == []
    # top up 1 → next markers call buys the hour
    set_bal(admin, uid, tok, 1)
    d = markers(tok)
    assert d["access"] is True and d["map_time"]["charged_now"] is True and d["map_time"]["hours_charged"] == 3 and bal(tok) == 0


# --- concurrency: initial load fires several markers/tick in parallel — must charge only ONE hour
def test_concurrent_first_load_charges_once(admin):
    tok, uid = new_user()
    set_bal(admin, uid, tok, 5)

    def call(i):
        if i % 2:
            return requests.post(f"{BASE}/api/map/time/tick", headers=H(tok), timeout=30).json()
        return requests.get(f"{BASE}/api/map/markers", headers=H(tok), timeout=60).json().get("map_time")
    with ThreadPoolExecutor(6) as ex:
        res = list(ex.map(call, range(6)))
    charged = sum(1 for r in res if r and r.get("charged_now"))
    b = bal(tok)
    print("concurrent charged_now count:", charged, "balance:", b)
    assert b == 4, f"double charge on concurrent first load: balance {b} (expected 4), charged_now x{charged}"


# --- admin config map_hour_mass
@pytest.mark.skip(reason="Flips the GLOBAL map_hour_mass setting — covered by tests/test_map_time.py::test_free_map_when_hourly_price_is_zero, which lives in the same xdist scope as the 0-MASS checks it would otherwise race with.")
def test_admin_config_free_map(admin):
    cfg = requests.get(f"{BASE}/api/admin/monetization/config", headers=H(admin), timeout=30).json()
    c = cfg.get("config", cfg)
    assert c.get("map_hour_mass") == 1, cfg
    tok, uid = new_user()
    set_bal(admin, uid, tok, 0)
    try:
        r = requests.put(f"{BASE}/api/admin/monetization/config", headers=H(admin), json={"map_hour_mass": 0}, timeout=30)
        assert r.status_code == 200, r.text
        d = markers(tok)
        assert d["access"] is True and d["map_time"]["metered"] is False and d["count"] > 0
        bad = requests.put(f"{BASE}/api/admin/monetization/config", headers=H(admin), json={"map_hour_mass": -1}, timeout=30)
        assert bad.status_code == 422
    finally:
        r = requests.put(f"{BASE}/api/admin/monetization/config", headers=H(admin), json={"map_hour_mass": 1}, timeout=30)
        assert r.status_code == 200
    assert markers(tok)["access"] is False


# --- viewing availability hardening
def test_availability_validation_and_restore():
    tok = login(*AGENT)
    url = f"{BASE}/api/viewings/availability/me"
    try:
        assert requests.put(url, headers=H(tok), json={"hours": [{"weekday": 0, "start": "09:00", "end": "99:99"}]}, timeout=30).status_code == 400
        assert requests.put(url, headers=H(tok), json={"hours": [{"weekday": 0, "start": "09:00", "end": "13:00"}, {"weekday": 0, "start": "12:00", "end": "14:00"}]}, timeout=30).status_code == 400
        assert requests.put(url, headers=H(tok), json={"hours": [{"weekday": 0, "start": "12:00", "end": "11:00"}]}, timeout=30).status_code == 400
        r = requests.put(url, headers=H(tok), json={"hours": [{"weekday": 0, "start": "09:00", "end": "12:00"}, {"weekday": 0, "start": "12:00", "end": "14:00"}]}, timeout=30)
        assert r.status_code == 200, r.text
    finally:
        r = requests.put(url, headers=H(tok), json={"hours": [{"weekday": d, "start": "09:00", "end": "17:00"} for d in range(7)], "slot_minutes": 60}, timeout=30)
        assert r.status_code == 200
    got = requests.get(url, headers=H(tok), timeout=30).json()
    assert len(got["hours"]) == 7 and got.get("slot_minutes") == 60
