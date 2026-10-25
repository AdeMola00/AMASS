"""Iter85 — focused retest of the two iter84 race fixes (map-time double charge, duplicate viewings), via the PUBLIC URL."""
import asyncio
import os
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

import pytest
import requests
from dotenv import dotenv_values

BASE = dotenv_values("/app/frontend/.env")["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
BENV = dotenv_values("/app/backend/.env")
ADMIN = ("demo@amass.africa", "amass2026")
TUNDE_YABA = "bf3a95a5-be78-4c55-a8b8-210580ec7aa0"


def H(t):
    return {"Authorization": f"Bearer {t}"}


def login(e, p):
    r = requests.post(f"{BASE}/api/auth/login", json={"email": e, "password": p}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def new_user(admin, target):
    r = requests.post(f"{BASE}/api/auth/register", json={"email": f"TEST_it85_{uuid.uuid4().hex[:8]}@amass-qa.africa".lower(), "password": "Test1234!", "full_name": "Iter85 Racer"}, timeout=30)
    assert r.status_code in (200, 201), r.text
    tok = r.json()["access_token"]
    uid = requests.get(f"{BASE}/api/auth/me", headers=H(tok), timeout=30).json()["id"]
    delta = target - bal(tok)
    if delta:
        a = requests.post(f"{BASE}/api/admin/wallet/{uid}/adjust", headers=H(admin), json={"amount": delta, "currency": "MASS", "reason": "TEST iter85"}, timeout=30)
        assert a.status_code == 200, a.text
    assert bal(tok) == target
    return tok, uid


def bal(tok):
    return requests.get(f"{BASE}/api/wallet/me", headers=H(tok), timeout=30).json()["spendable"]


def mongo(fn):
    from motor.motor_asyncio import AsyncIOMotorClient

    async def go():
        db = AsyncIOMotorClient(BENV["MONGO_URL"])[BENV["DB_NAME"]]
        return await fn(db)
    return asyncio.run(go())


def fire6(tok):
    def one(i):
        if i % 2:
            r = requests.post(f"{BASE}/api/map/time/tick", headers=H(tok), timeout=60)
            assert r.status_code == 200, r.text
            return r.json()
        r = requests.get(f"{BASE}/api/map/markers", headers=H(tok), params={"limit": 5}, timeout=60)
        assert r.status_code == 200, r.text
        return r.json()["map_time"]
    with ThreadPoolExecutor(6) as ex:
        return list(ex.map(one, range(6)))


@pytest.fixture(scope="module")
def admin():
    return login(*ADMIN)


# --- Race fix 1: map time never charges the same hour twice
def test_parallel_first_hour_and_rewound_second_hour(admin):
    cfg = mongo(lambda db: db.app_settings.find_one({"key": "monetization"}, {"_id": 0}))
    assert cfg["value"].get("map_hour_mass", 1) == 1
    tok, uid = new_user(admin, 5)
    rs = fire6(tok)
    print("round1", [(r["charged_now"], r["hours_charged"]) for r in rs])
    assert sum(1 for r in rs if r["charged_now"]) == 1
    assert all(r["hours_charged"] == 1 for r in rs)
    assert bal(tok) == 4
    # rewind: 3590 s used, last heartbeat 60 s ago → hour 2 is due
    last = (datetime.now(timezone.utc) - timedelta(seconds=60)).isoformat()
    mongo(lambda db: db.map_time.update_one({"user_id": uid}, {"$set": {"used_seconds": 3590, "last_tick_at": last}}))
    rs = fire6(tok)
    print("round2", [(r["charged_now"], r["hours_charged"], r["remaining_seconds"]) for r in rs])
    assert sum(1 for r in rs if r["charged_now"]) == 1
    assert all(r["hours_charged"] == 2 for r in rs)
    assert bal(tok) == 3
    doc = mongo(lambda db: db.map_time.find_one({"user_id": uid}, {"_id": 0}))
    assert doc["hours_charged"] == 2 and doc["paid_seconds"] >= 3600 + 3590
    txs = mongo(lambda db: db.token_transactions.count_documents({"user_id": uid, "meta.feature_key": "map_time"}))
    print("map_time txs", txs)


def test_sequential_flow_charges_once(admin):
    tok, _ = new_user(admin, 3)
    first = requests.get(f"{BASE}/api/map/markers", headers=H(tok), params={"limit": 5}, timeout=30).json()
    assert first["access"] is True and first["map_time"]["charged_now"] is True and first["map_time"]["hours_charged"] == 1
    for _ in range(3):
        t = requests.post(f"{BASE}/api/map/time/tick", headers=H(tok), timeout=30).json()
        assert t["charged_now"] is False and t["hours_charged"] == 1 and t["access"] is True
    m = requests.get(f"{BASE}/api/map/markers", headers=H(tok), params={"limit": 5}, timeout=30).json()
    assert m["map_time"]["charged_now"] is False and m["count"] > 0
    assert bal(tok) == 2


# --- Race fix 2: duplicate viewing requests
def test_viewing_index_exists():
    idx = mongo(lambda db: db.viewings.index_information())
    u = idx.get("uniq_open_viewing_per_home")
    assert u and u.get("unique") is True
    assert [k for k, _ in u["key"]] == ["buyer_id", "property_id"]
    assert set(u["partialFilterExpression"]["status"]["$in"]) == {"requested", "confirmed", "rescheduled"}


def _start(days):
    lagos = timezone(timedelta(hours=1))
    return (datetime.now(lagos) + timedelta(days=days)).replace(hour=11, minute=0, second=0, microsecond=0).isoformat()


def test_parallel_viewings_one_201_rest_409(admin):
    h = H(admin)
    start = _start(6)
    with ThreadPoolExecutor(6) as ex:
        rs = list(ex.map(lambda _: requests.post(f"{BASE}/api/viewings", headers=h, json={"property_id": TUNDE_YABA, "start": start, "note": "TEST_it85_race"}, timeout=60), range(6)))
    codes = [r.status_code for r in rs]
    print("viewing statuses", codes, [r.text[:120] for r in rs if r.status_code != 201][:1])
    created = [r.json()["id"] for r in rs if r.status_code == 201]
    for vid in created:
        requests.post(f"{BASE}/api/viewings/{vid}/cancel", headers=h, json={"note": "TEST_cleanup"}, timeout=30)
    assert codes.count(201) == 1 and codes.count(409) == 5, codes


def test_sequential_viewing_201_then_409_then_cancel(admin):
    h = H(admin)
    r1 = requests.post(f"{BASE}/api/viewings", headers=h, json={"property_id": TUNDE_YABA, "start": _start(7), "note": "TEST_it85_seq"}, timeout=30)
    assert r1.status_code == 201, r1.text
    vid = r1.json()["id"]
    try:
        r2 = requests.post(f"{BASE}/api/viewings", headers=h, json={"property_id": TUNDE_YABA, "start": _start(8), "note": "TEST_it85_seq2"}, timeout=30)
        assert r2.status_code == 409, r2.text
    finally:
        c = requests.post(f"{BASE}/api/viewings/{vid}/cancel", headers=h, json={"note": "TEST_cleanup"}, timeout=30)
        assert c.status_code == 200, c.text
    g = requests.get(f"{BASE}/api/viewings/{vid}", headers=h, timeout=30)
    assert g.status_code == 200 and g.json()["status"] in ("cancelled", "canceled")
    # after cancel, a new request is allowed again
    r3 = requests.post(f"{BASE}/api/viewings", headers=h, json={"property_id": TUNDE_YABA, "start": _start(7), "note": "TEST_it85_seq3"}, timeout=30)
    assert r3.status_code == 201, r3.text
    requests.post(f"{BASE}/api/viewings/{r3.json()['id']}/cancel", headers=h, json={"note": "TEST_cleanup"}, timeout=30)
