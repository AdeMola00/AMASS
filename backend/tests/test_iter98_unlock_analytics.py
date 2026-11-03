"""Iter 98: homes-unlocked analytics event + map meter state for the last-hour banner."""
import os
import pytest
import requests
from dotenv import dotenv_values

BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or dotenv_values("/app/frontend/.env")["EXPO_PUBLIC_BACKEND_URL"]).rstrip("/")


@pytest.fixture(scope="module")
def demo_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "demo@amass.africa", "password": "amass2026"}, timeout=20)
    if r.status_code != 200:
        pytest.skip("demo login failed")
    return r.json()["access_token"]


# Analytics: map_homes_unlocked accepted for authed user
def test_map_homes_unlocked_event_accepted(demo_token):
    r = requests.post(f"{BASE_URL}/api/analytics/events", headers={"Authorization": f"Bearer {demo_token}"},
                      json={"events": [{"name": "map_homes_unlocked", "props": {"homes": 61, "hour": 1, "cost": 1}}]}, timeout=20)
    assert r.status_code == 200
    assert r.json() == {"ok": True, "accepted": 1}


# Analytics: unknown event names are dropped, not stored
def test_unknown_event_dropped(demo_token):
    r = requests.post(f"{BASE_URL}/api/analytics/events", headers={"Authorization": f"Bearer {demo_token}"},
                      json={"events": [{"name": "TEST_not_allowed", "props": {}}]}, timeout=20)
    assert r.status_code == 200
    assert r.json()["accepted"] == 0


# Map meter: paying user markers response carries map_time with access + balance fields used by last-hour logic
def test_demo_markers_map_time_fields(demo_token):
    r = requests.get(f"{BASE_URL}/api/map/markers?limit=400", headers={"Authorization": f"Bearer {demo_token}"}, timeout=30)
    assert r.status_code == 200
    data = r.json()
    mt = data.get("map_time")
    assert mt is not None
    for k in ("access", "metered", "balance", "hourly_cost", "hours_charged"):
        assert k in mt, k
    assert mt["access"] is True
