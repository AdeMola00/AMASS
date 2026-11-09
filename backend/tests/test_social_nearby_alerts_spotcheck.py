"""Nearby Alerts spot-checks (hermetic: assert per-recipient outcomes, not the global `alerted` count).

Covers: GET/PUT/toggle shape, fan-out to follower, other category / sell / blocked / author not notified,
daily frequency queues instead of instant, E2E demo -> fresh follower.
"""
from __future__ import annotations

import os
import time
import uuid

import pytest
import requests

BASE = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")).rstrip("/")
API = f"{BASE}/api"


def _register(tag):
    email = f"TEST_spot.{tag}.{uuid.uuid4().hex[:8]}@amass.africa"
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": "Alerts2026!", "full_name": f"Spot {tag.title()}"}, timeout=30)
    assert r.status_code in (200, 201), r.text
    b = r.json()
    return {"Authorization": f"Bearer {b['access_token']}"}, b["user"], email


def _wait(h, post_id, t=4.0):
    end = time.time() + t
    while time.time() < end:
        r = requests.get(f"{API}/notifications/center", params={"category": "nearby_free"}, headers=h, timeout=30)
        assert r.status_code == 200
        hit = next((n for n in r.json()["items"] if (n.get("meta") or {}).get("post_id") == post_id), None)
        if hit:
            return hit
        time.sleep(0.4)
    return None


def _post(h, title, kind="give", category="furniture", visibility="city", **kw):
    body = {"title": title, "kind": kind, "category": category, "condition": "good", "visibility": visibility, **kw}
    r = requests.post(f"{API}/social/posts", json=body, headers=h, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def demo():
    r = requests.post(f"{API}/auth/login", json={"email": "demo@amass.africa", "password": "amass2026"}, timeout=30)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}, r.json()["user"]


@pytest.fixture(scope="module")
def follower():
    h, u, e = _register("b")
    assert requests.put(f"{API}/social/alerts", json={"categories": ["furniture"]}, headers=h, timeout=30).status_code == 200
    yield h, u, e
    requests.put(f"{API}/social/alerts", json={"categories": []}, headers=h, timeout=30)


created_posts: list = []


@pytest.fixture(scope="module", autouse=True)
def cleanup(demo):
    yield
    h, _ = demo
    for pid in created_posts:
        requests.delete(f"{API}/social/posts/{pid}", headers=h, timeout=30)


# Alerts surface shape
def test_alerts_shape(follower):
    h, _, _ = follower
    d = requests.get(f"{API}/social/alerts", headers=h, timeout=30).json()
    keys = [c["key"] for c in d["categories"]]
    assert keys == ["furniture", "electronics", "appliances", "kitchen", "kids", "clothing", "books", "garden", "decor", "other"] or set(keys) == {"furniture", "electronics", "appliances", "kitchen", "kids", "clothing", "books", "garden", "decor", "other"}
    assert d["following"] == ["furniture"]
    for k in ("enabled", "frequency", "push_enabled", "push_status"):
        assert k in d["prefs"]
    assert isinstance(d["alerts_7d"], int) and "scopes" in d and d["scope_label"]


def test_put_empty_clears(follower):
    h, _, _ = follower
    r = requests.put(f"{API}/social/alerts", json={"categories": []}, headers=h, timeout=30)
    assert r.status_code == 200 and r.json()["following"] == []
    r = requests.put(f"{API}/social/alerts", json={"categories": ["furniture"]}, headers=h, timeout=30)
    assert r.json()["following"] == ["furniture"]


def test_unauth_rejected():
    assert requests.get(f"{API}/social/alerts", timeout=30).status_code in (401, 403)


# E2E: demo posts free furniture -> fresh follower notified with action_url
def test_e2e_demo_free_furniture_alerts_follower(demo, follower):
    dh, _ = demo
    fh, _, _ = follower
    title = f"TEST_spot free sofa {uuid.uuid4().hex[:6]}"
    out = _post(dh, title)
    pid = out["post"]["id"]
    created_posts.append(pid)
    assert out["alerted"] >= 1
    hit = _wait(fh, pid)
    assert hit, "follower did not receive SOCIAL_NEARBY_FREE"
    assert hit["title"] == "Free furniture near you"
    assert hit["action_url"] == f"/social/post/{pid}"
    assert _wait(dh, pid, 1.0) is None  # author (also follows furniture) never alerted


def test_kitchen_post_does_not_notify_furniture_follower(demo, follower):
    dh, _ = demo
    fh, _, _ = follower
    out = _post(dh, f"TEST_spot free blender {uuid.uuid4().hex[:6]}", category="kitchen")
    created_posts.append(out["post"]["id"])
    assert _wait(fh, out["post"]["id"], 1.5) is None


def test_sell_post_does_not_notify(demo, follower):
    dh, _ = demo
    fh, _, _ = follower
    out = _post(dh, f"TEST_spot sell chair {uuid.uuid4().hex[:6]}", kind="sell", price=10000)
    created_posts.append(out["post"]["id"])
    assert out["alerted"] == 0
    assert _wait(fh, out["post"]["id"], 1.5) is None


def test_blocked_follower_not_notified(follower):
    ph, _, _ = _register("p")
    fh, fu, _ = follower
    assert requests.post(f"{API}/chat/block/{fu['id']}", headers=ph, timeout=30).status_code in (200, 201)
    out = _post(ph, f"TEST_spot free desk {uuid.uuid4().hex[:6]}")
    assert _wait(fh, out["post"]["id"], 2.0) is None
    requests.delete(f"{API}/chat/block/{fu['id']}", headers=ph, timeout=30)


def test_daily_frequency_queues(demo, follower):
    dh, _ = demo
    fh, _, _ = follower
    assert requests.put(f"{API}/notifications/prefs", json={"categories": {"nearby_free": {"frequency": "daily"}}}, headers=fh, timeout=30).status_code == 200
    try:
        d = requests.get(f"{API}/social/alerts", headers=fh, timeout=30).json()
        assert d["prefs"]["frequency"] == "daily"
        out = _post(dh, f"TEST_spot free shelf {uuid.uuid4().hex[:6]}")
        created_posts.append(out["post"]["id"])
        assert _wait(fh, out["post"]["id"], 2.0) is None
    finally:
        requests.put(f"{API}/notifications/prefs", json={"categories": {"nearby_free": {"frequency": "immediate"}}}, headers=fh, timeout=30)


def test_estate_post_not_visible_to_non_member(follower):
    # Demo is in Lekki Gardens Phase 2; fresh follower is not a member -> estate-only post must not alert.
    r = requests.post(f"{API}/auth/login", json={"email": "demo@amass.africa", "password": "amass2026"}, timeout=30)
    dh = {"Authorization": f"Bearer {r.json()['access_token']}"}
    fh, _, _ = follower
    resp = requests.post(f"{API}/social/posts", json={"title": f"TEST_spot estate lamp {uuid.uuid4().hex[:6]}", "kind": "give", "category": "furniture", "condition": "good", "visibility": "estate"}, headers=dh, timeout=30)
    if resp.status_code != 200:
        pytest.skip(f"estate post not allowed: {resp.text}")
    created_posts.append(resp.json()["post"]["id"])
    assert _wait(fh, resp.json()["post"]["id"], 1.5) is None
