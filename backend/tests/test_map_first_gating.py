"""Map-first discovery — paywall gate on every property list (favorites, public agent listings,
/properties) + saved-search `verified` criterion.

Saving a home or browsing an agent's public listings must never reveal what the MASS unlock sells:
the street address, the gallery or the agent's contact. Only the teaser tier (front photo, price,
specs, city, approximate pin) is public.
"""
import os
import uuid

import pytest
import requests

BASE = os.getenv("API_BASE", "http://localhost:8001").rstrip("/")


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def fresh_user():
    email = f"mapfirst+{uuid.uuid4().hex[:8]}@amass.africa"
    r = requests.post(f"{BASE}/api/auth/register", json={"email": email, "password": "Map2026!x", "full_name": "Map First"})
    assert r.status_code in (200, 201), r.text
    tok = r.json().get("access_token") or r.json().get("token")
    return tok


@pytest.fixture(scope="module")
def locked_property(fresh_user):
    r = requests.get(f"{BASE}/api/map/markers", headers=_hdr(fresh_user), params={"limit": 50})
    assert r.status_code == 200
    locked = [m for m in r.json()["markers"] if not m["unlocked"]]
    assert locked, "need at least one locked listing"
    return locked[0]


def test_favorites_are_teaser_tier(fresh_user, locked_property):
    pid = locked_property["id"]
    t = requests.post(f"{BASE}/api/favorites/toggle", headers=_hdr(fresh_user), json={"property_id": pid})
    assert t.status_code == 200 and t.json()["favorited"] is True
    r = requests.get(f"{BASE}/api/favorites", headers=_hdr(fresh_user))
    assert r.status_code == 200
    fav = next(p for p in r.json() if p["id"] == pid)
    assert fav["unlocked"] is False and fav["approx"] is True
    assert fav["location"] == fav["city"]  # city-level only
    assert len(fav["images"]) <= 1 and fav.get("image_count", 0) >= len(fav["images"])
    for k in ("agent_phone", "agent_email", "agent_name", "agent_avatar"):
        assert k not in fav
    # Approximate pin — never the exact spot.
    assert (fav["latitude"], fav["longitude"]) == (locked_property["lat"], locked_property["lng"])
    # clean up
    requests.post(f"{BASE}/api/favorites/toggle", headers=_hdr(fresh_user), json={"property_id": pid})


@pytest.fixture(scope="module")
def agent_user():
    r = requests.post(f"{BASE}/api/auth/login", json={"email": "adaeze.okoye@amass.africa", "password": "Agent2026!"})
    assert r.status_code == 200, r.text
    tok = r.json().get("access_token") or r.json().get("token")
    me = requests.get(f"{BASE}/api/auth/me", headers=_hdr(tok)).json()
    return tok, me["id"]


def test_public_agent_listings_are_teaser_tier(fresh_user, agent_user):
    _, agent_id = agent_user
    r = requests.get(f"{BASE}/api/agents/{agent_id}/listings", headers=_hdr(fresh_user))
    assert r.status_code == 200 and r.json()
    for p in r.json():
        if p["unlocked"]:
            continue
        assert p["approx"] is True and p["location"] == p["city"]
        assert len(p["images"]) <= 1
        assert "agent_phone" not in p and "agent_email" not in p and "agent_name" not in p
    # Anonymous callers get the same gate.
    anon = requests.get(f"{BASE}/api/agents/{agent_id}/listings")
    assert anon.status_code == 200
    assert all(p["unlocked"] is False and p["location"] == p["city"] for p in anon.json())
    # …and so does the agent-platform public profile route (slug or user id).
    pub = requests.get(f"{BASE}/api/agent-platform/public/{agent_id}/listings")
    assert pub.status_code == 200
    assert all(p["unlocked"] is False and p["location"] == p["city"] and len(p["images"]) <= 1 for p in pub.json())
    # The owner sees everything on their own listings.
    own = requests.get(f"{BASE}/api/agents/{agent_id}/listings", headers=_hdr(agent_user[0]))
    assert all(p["unlocked"] for p in own.json())


def test_properties_list_is_teaser_tier_when_locked(fresh_user):
    r = requests.get(f"{BASE}/api/properties", headers=_hdr(fresh_user), params={"limit": 20})
    assert r.status_code == 200
    for p in r.json():
        if p["unlocked"]:
            continue
        assert p["approx"] is True and p["location"] == p["city"] and len(p["images"]) <= 1


def test_saved_search_accepts_verified(fresh_user):
    r = requests.post(
        f"{BASE}/api/saved-searches",
        headers=_hdr(fresh_user),
        json={"name": "verified lekki", "criteria": {"q": "Lekki", "verified": True}, "alerts_enabled": False},
    )
    assert r.status_code in (200, 201), r.text
    sid = r.json()["id"]
    assert r.json()["criteria"]["verified"] is True
    run = requests.post(f"{BASE}/api/saved-searches/{sid}/run", headers=_hdr(fresh_user))
    assert run.status_code == 200
    items = run.json()["matches"]
    assert all(p.get("verified") for p in items)
    requests.delete(f"{BASE}/api/saved-searches/{sid}", headers=_hdr(fresh_user))


def test_saved_search_run_is_teaser_gated(fresh_user):
    r = requests.post(
        f"{BASE}/api/saved-searches",
        headers=_hdr(fresh_user),
        json={"name": "everything", "criteria": {}, "alerts_enabled": False},
    )
    assert r.status_code in (200, 201), r.text
    sid = r.json()["id"]
    run = requests.post(f"{BASE}/api/saved-searches/{sid}/run", headers=_hdr(fresh_user), params={"limit": 30})
    assert run.status_code == 200
    items = run.json()["matches"]
    assert items
    for p in items:
        assert "unlocked" in p and "access_cost" in p  # gate ran
        if not p["unlocked"]:
            assert p["approx"] is True and p["location"] == p["city"] and len(p["images"]) <= 1
            assert "agent_phone" not in p and "agent_name" not in p
    requests.delete(f"{BASE}/api/saved-searches/{sid}", headers=_hdr(fresh_user))
