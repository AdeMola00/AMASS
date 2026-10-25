"""Map time — 0 MASS → no markers; with MASS, 1 MASS buys 60 min on the map; time only accrues between close heartbeats."""
import asyncio
import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE = os.getenv("API_BASE", "http://localhost:8001").rstrip("/")
ADMIN = ("demo@amass.africa", "amass2026")


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}"}


def _login(email, pw):
    r = requests.post(f"{BASE}/api/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _new_user():
    r = requests.post(f"{BASE}/api/auth/register", json={"email": f"maptime_{uuid.uuid4().hex[:8]}@amass-qa.africa", "password": "Test1234!", "full_name": "Map Timer"})
    assert r.status_code in (200, 201), r.text
    tok = r.json()["access_token"]
    uid = requests.get(f"{BASE}/api/auth/me", headers=_hdr(tok)).json()["id"]
    return tok, uid


def _balance(tok):
    return requests.get(f"{BASE}/api/wallet/me", headers=_hdr(tok)).json()["spendable"]


def _set_balance(admin_tok, uid, tok, target):
    delta = target - _balance(tok)
    if delta:
        r = requests.post(f"{BASE}/api/admin/wallet/{uid}/adjust", headers=_hdr(admin_tok), json={"amount": delta, "currency": "MASS", "reason": "map time test"})
        assert r.status_code == 200, r.text
    assert _balance(tok) == target


def _backdate(uid, *, used=None, last_tick_seconds_ago=None):
    """Rewind the meter in Mongo so the test doesn't have to wait an hour."""
    from dotenv import load_dotenv
    from motor.motor_asyncio import AsyncIOMotorClient

    load_dotenv("/app/backend/.env")

    async def go():
        db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
        upd = {}
        if used is not None:
            upd["used_seconds"] = used
        if last_tick_seconds_ago is not None:
            upd["last_tick_at"] = (datetime.now(timezone.utc) - timedelta(seconds=last_tick_seconds_ago)).isoformat()
        await db.map_time.update_one({"user_id": uid}, {"$set": upd})
        return await db.map_time.find_one({"user_id": uid}, {"_id": 0})

    return asyncio.run(go())


@pytest.fixture(scope="module")
def admin_tok():
    return _login(*ADMIN)


def test_zero_mass_hides_every_marker(admin_tok):
    tok, uid = _new_user()
    _set_balance(admin_tok, uid, tok, 0)
    m = requests.get(f"{BASE}/api/map/markers", headers=_hdr(tok), params={"limit": 50})
    assert m.status_code == 200, m.text
    body = m.json()
    assert body["markers"] == [] and body["count"] == 0 and body["access"] is False
    assert body["map_time"]["remaining_seconds"] == 0 and body["map_time"]["charged_now"] is False
    assert _balance(tok) == 0
    t = requests.post(f"{BASE}/api/map/time/tick", headers=_hdr(tok)).json()
    assert t["access"] is False and t["hourly_cost"] == 1


def test_first_hour_charged_once_then_metered(admin_tok):
    tok, uid = _new_user()
    _set_balance(admin_tok, uid, tok, 3)
    m = requests.get(f"{BASE}/api/map/markers", headers=_hdr(tok), params={"limit": 50}).json()
    assert m["access"] is True and len(m["markers"]) > 0
    assert m["map_time"]["charged_now"] is True and m["map_time"]["hours_charged"] == 1
    assert 3500 < m["map_time"]["remaining_seconds"] <= 3600
    assert _balance(tok) == 2
    # Repeat loads / heartbeats inside the hour never charge again
    for _ in range(3):
        t = requests.post(f"{BASE}/api/map/time/tick", headers=_hdr(tok)).json()
        assert t["access"] is True and t["charged_now"] is False
    assert requests.get(f"{BASE}/api/map/markers", headers=_hdr(tok), params={"limit": 20}).json()["map_time"]["charged_now"] is False
    assert _balance(tok) == 2
    # Ledger row for the wallet screen
    tx = requests.get(f"{BASE}/api/wallet/transactions", headers=_hdr(tok), params={"currency": "MASS"}).json()
    row = next(x for x in tx if x.get("kind") == "spend_feature" and (x.get("meta") or {}).get("feature_key") == "map_time")
    assert row["amount"] == -1 and "Map time" in row["description"]

    # A long gap (left the map) accrues nothing
    _backdate(uid, used=0, last_tick_seconds_ago=3000)
    t = requests.post(f"{BASE}/api/map/time/tick", headers=_hdr(tok)).json()
    assert t["remaining_seconds"] == 3600 and t["charged_now"] is False

    # Hour nearly used up, heartbeat 90 s after the last → crosses the hour → next hour charged automatically
    _backdate(uid, used=3560, last_tick_seconds_ago=90)
    t = requests.post(f"{BASE}/api/map/time/tick", headers=_hdr(tok)).json()
    assert t["charged_now"] is True and t["hours_charged"] == 2 and t["access"] is True
    assert 3500 < t["remaining_seconds"] <= 3600
    assert _balance(tok) == 1

    # Last MASS goes on hour 3; when hour 3 runs out with an empty wallet the markers switch off
    _backdate(uid, used=7300, last_tick_seconds_ago=60)
    t = requests.post(f"{BASE}/api/map/time/tick", headers=_hdr(tok)).json()
    assert t["charged_now"] is True and _balance(tok) == 0
    _backdate(uid, used=11000, last_tick_seconds_ago=60)
    t = requests.post(f"{BASE}/api/map/time/tick", headers=_hdr(tok)).json()
    assert t["access"] is False and t["charged_now"] is False and t["remaining_seconds"] == 0
    m = requests.get(f"{BASE}/api/map/markers", headers=_hdr(tok), params={"limit": 50}).json()
    assert m["access"] is False and m["markers"] == []
    # Top up → the very next heartbeat buys the next hour and the homes come back
    _set_balance(admin_tok, uid, tok, 1)
    m = requests.get(f"{BASE}/api/map/markers", headers=_hdr(tok), params={"limit": 50}).json()
    assert m["access"] is True and len(m["markers"]) > 0 and m["map_time"]["charged_now"] is True
    assert _balance(tok) == 0
    # Status read never charges or accrues
    s = requests.get(f"{BASE}/api/map/time", headers=_hdr(tok)).json()
    assert s["access"] is True and s["charged_now"] is False


def test_free_map_when_hourly_price_is_zero(admin_tok):
    """Admin sets map_hour_mass = 0 → the map is free for everyone (even with 0 MASS); restored afterwards."""
    cur = requests.get(f"{BASE}/api/admin/monetization/config", headers=_hdr(admin_tok)).json()
    assert cur.get("map_hour_mass", 1) == 1
    r = requests.put(f"{BASE}/api/admin/monetization/config", headers=_hdr(admin_tok), json={"map_hour_mass": 0})
    assert r.status_code == 200, r.text
    try:
        tok, uid = _new_user()
        _set_balance(admin_tok, uid, tok, 0)
        m = requests.get(f"{BASE}/api/map/markers", headers=_hdr(tok), params={"limit": 20}).json()
        assert m["access"] is True and m["map_time"]["metered"] is False and len(m["markers"]) > 0
        assert requests.put(f"{BASE}/api/admin/monetization/config", headers=_hdr(admin_tok), json={"map_hour_mass": -1}).status_code == 422
    finally:
        assert requests.put(f"{BASE}/api/admin/monetization/config", headers=_hdr(admin_tok), json={"map_hour_mass": 1}).status_code == 200


def test_parallel_heartbeats_buy_the_hour_once(admin_tok):
    """Markers load + heartbeat fire together when the tab comes back — the hour must be charged exactly once."""
    from concurrent.futures import ThreadPoolExecutor

    tok, uid = _new_user()
    _set_balance(admin_tok, uid, tok, 5)

    def hit(i):
        if i % 2:
            return requests.post(f"{BASE}/api/map/time/tick", headers=_hdr(tok)).json()
        return requests.get(f"{BASE}/api/map/markers", headers=_hdr(tok), params={"limit": 5}).json()["map_time"]

    with ThreadPoolExecutor(max_workers=6) as ex:
        results = list(ex.map(hit, range(6)))
    assert sum(1 for r in results if r["charged_now"]) == 1, results
    assert all(r["access"] and r["hours_charged"] == 1 for r in results)
    assert _balance(tok) == 4
    # Same when the second hour is due
    _backdate(uid, used=3590, last_tick_seconds_ago=60)
    with ThreadPoolExecutor(max_workers=6) as ex:
        results = list(ex.map(hit, range(6)))
    assert sum(1 for r in results if r["charged_now"]) == 1, results
    assert all(r["hours_charged"] == 2 for r in results)
    assert _balance(tok) == 3
