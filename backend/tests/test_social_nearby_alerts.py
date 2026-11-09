"""Nearby Alerts — follow a Social category and get notified when a FREE item is posted nearby.

Routes: GET/PUT /api/social/alerts, POST /api/social/alerts/toggle. Fan-out happens on
POST /api/social/posts (kind=give) → SOCIAL_NEARBY_FREE notifications (category `nearby_free`).

Assertions are per-recipient (who actually received what) — never on the aggregate `alerted`
count, which includes followers created by other suites. Everything created here is cleaned up.
"""
from __future__ import annotations

import os
import time
import uuid

import pytest
import requests

BASE = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL") or "http://localhost:8001").rstrip("/")
API = f"{BASE}/api"


def _register(tag: str):
    email = f"TEST_alerts.{tag}.{uuid.uuid4().hex[:8]}@amass.africa"
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": "Alerts2026!", "full_name": f"Alert {tag.title()}"}, timeout=30)
    assert r.status_code in (200, 201), r.text
    body = r.json()
    return {"Authorization": f"Bearer {body['access_token']}"}, body["user"]


@pytest.fixture(scope="module")
def poster():
    return _register("poster")


@pytest.fixture(scope="module")
def follower():
    return _register("follower")


@pytest.fixture(scope="module")
def bystander():
    return _register("bystander")


@pytest.fixture(scope="module", autouse=True)
def _cleanup(poster, follower, bystander):
    created: list[str] = []
    yield created
    ph, _ = poster
    for pid in created:
        requests.delete(f"{API}/social/posts/{pid}", headers=ph, timeout=30)
    for h, _ in (poster, follower, bystander):
        requests.put(f"{API}/social/alerts", json={"categories": []}, headers=h, timeout=30)


def _post(headers: dict, created: list[str], **body) -> dict:
    payload = {"title": f"TEST_alert {uuid.uuid4().hex[:6]}", "kind": "give", "category": "furniture", "condition": "good", "visibility": "city", **body}
    r = requests.post(f"{API}/social/posts", json=payload, headers=headers, timeout=30)
    assert r.status_code == 200, r.text
    out = r.json()
    created.append(out["post"]["id"])
    return out


def _wait_for_alert(headers: dict, post_id: str, timeout_s: float = 6.0):
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        r = requests.get(f"{API}/notifications/center", params={"category": "nearby_free"}, headers=headers, timeout=30)
        assert r.status_code == 200, r.text
        hit = next((n for n in r.json()["items"] if (n.get("meta") or {}).get("post_id") == post_id), None)
        if hit:
            return hit
        time.sleep(0.4)
    return None


class TestAlertsSurface:
    def test_defaults(self, follower):
        h, _ = follower
        r = requests.get(f"{API}/social/alerts", headers=h, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["following"] == []
        keys = {c["key"] for c in d["categories"]}
        assert {"furniture", "electronics", "kids"} <= keys
        assert all("following" in c and "nearby_free" in c for c in d["categories"])
        assert d["prefs"]["frequency"] in ("immediate", "daily", "weekly")
        assert d["prefs"]["enabled"] is True
        assert d["scope_label"] and d["home_label"] and "alerts_7d" in d

    def test_toggle_follow_and_unfollow(self, follower):
        h, _ = follower
        r = requests.post(f"{API}/social/alerts/toggle", json={"category": "electronics"}, headers=h, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["now_following"] is True and "electronics" in r.json()["following"]
        r = requests.post(f"{API}/social/alerts/toggle", json={"category": "electronics"}, headers=h, timeout=30)
        assert r.json()["now_following"] is False and "electronics" not in r.json()["following"]

    def test_toggle_rejects_unknown(self, follower):
        h, _ = follower
        r = requests.post(f"{API}/social/alerts/toggle", json={"category": "spaceships"}, headers=h, timeout=30)
        assert r.status_code == 422

    def test_put_replaces_set_and_dedupes(self, follower):
        h, _ = follower
        r = requests.put(f"{API}/social/alerts", json={"categories": ["furniture", "kids", "furniture"]}, headers=h, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["following"] == ["furniture", "kids"]
        r = requests.put(f"{API}/social/alerts", json={"categories": ["furniture"]}, headers=h, timeout=30)
        assert r.json()["following"] == ["furniture"]

    def test_put_rejects_unknown(self, follower):
        h, _ = follower
        r = requests.put(f"{API}/social/alerts", json={"categories": ["furniture", "nope"]}, headers=h, timeout=30)
        assert r.status_code == 422

    def test_follow_switches_category_back_on(self, follower):
        h, _ = follower
        r = requests.put(f"{API}/notifications/prefs", json={"categories": {"nearby_free": {"enabled": False}}}, headers=h, timeout=30)
        assert r.status_code == 200 and r.json()["categories"]["nearby_free"]["enabled"] is False
        r = requests.post(f"{API}/social/alerts/toggle", json={"category": "garden"}, headers=h, timeout=30)
        assert r.json()["prefs"]["enabled"] is True
        requests.put(f"{API}/social/alerts", json={"categories": ["furniture"]}, headers=h, timeout=30)

    def test_unauthenticated_rejected(self):
        assert requests.get(f"{API}/social/alerts", timeout=30).status_code in (401, 403)


class TestFanOut:
    def test_free_post_alerts_follower_not_bystander_or_author(self, poster, follower, bystander, _cleanup):
        ph, _ = poster
        fh, _ = follower
        bh, _ = bystander
        assert requests.put(f"{API}/social/alerts", json={"categories": ["furniture"]}, headers=fh, timeout=30).status_code == 200
        # author also follows furniture — must never be alerted about their own post
        assert requests.put(f"{API}/social/alerts", json={"categories": ["furniture"]}, headers=ph, timeout=30).status_code == 200
        title = f"TEST_alert free sofa {uuid.uuid4().hex[:6]}"
        body = _post(ph, _cleanup, title=title)
        post_id = body["post"]["id"]
        assert body["alerted"] >= 1
        hit = _wait_for_alert(fh, post_id)
        assert hit is not None, "follower should receive a SOCIAL_NEARBY_FREE alert"
        assert hit["kind"] == "SOCIAL_NEARBY_FREE" and hit["category"] == "nearby_free"
        assert hit["action_url"] == f"/social/post/{post_id}"
        assert "furniture" in hit["title"].lower() and title in hit["body"]
        assert hit["meta"]["category_label"] == "Furniture"
        assert _wait_for_alert(bh, post_id, timeout_s=1.0) is None
        assert _wait_for_alert(ph, post_id, timeout_s=1.0) is None
        d = requests.get(f"{API}/social/alerts", headers=fh, timeout=30).json()
        assert d["alerts_7d"] >= 1

    def test_sale_post_does_not_alert(self, poster, follower, _cleanup):
        ph, _ = poster
        fh, _ = follower
        body = _post(ph, _cleanup, kind="sell", price=15000)
        assert body["alerted"] == 0
        assert _wait_for_alert(fh, body["post"]["id"], timeout_s=1.5) is None

    def test_other_category_does_not_alert_this_follower(self, poster, follower, _cleanup):
        ph, _ = poster
        fh, _ = follower
        body = _post(ph, _cleanup, category="kitchen")
        assert _wait_for_alert(fh, body["post"]["id"], timeout_s=1.5) is None

    def test_digest_frequency_queues_instead_of_instant(self, poster, follower, _cleanup):
        ph, _ = poster
        fh, _ = follower
        assert requests.put(f"{API}/notifications/prefs", json={"categories": {"nearby_free": {"frequency": "daily"}}}, headers=fh, timeout=30).status_code == 200
        body = _post(ph, _cleanup)
        assert _wait_for_alert(fh, body["post"]["id"], timeout_s=2.0) is None  # queued for the daily digest, not stored instantly
        requests.put(f"{API}/notifications/prefs", json={"categories": {"nearby_free": {"frequency": "immediate"}}}, headers=fh, timeout=30)

    def test_category_switched_off_is_skipped(self, poster, follower, _cleanup):
        ph, _ = poster
        fh, _ = follower
        assert requests.put(f"{API}/notifications/prefs", json={"categories": {"nearby_free": {"enabled": False}}}, headers=fh, timeout=30).status_code == 200
        body = _post(ph, _cleanup)
        assert _wait_for_alert(fh, body["post"]["id"], timeout_s=1.5) is None
        requests.put(f"{API}/notifications/prefs", json={"categories": {"nearby_free": {"enabled": True}}}, headers=fh, timeout=30)

    def test_blocked_follower_is_skipped(self, poster, follower, _cleanup):
        ph, _ = poster
        fh, fuser = follower
        assert requests.post(f"{API}/chat/block/{fuser['id']}", headers=ph, timeout=30).status_code in (200, 201)
        try:
            body = _post(ph, _cleanup)
            assert _wait_for_alert(fh, body["post"]["id"], timeout_s=1.5) is None
        finally:
            requests.delete(f"{API}/chat/block/{fuser['id']}", headers=ph, timeout=30)

    def test_muted_author_is_skipped(self, poster, follower, _cleanup):
        ph, puser = poster
        fh, _ = follower
        assert requests.post(f"{API}/social/mute/{puser['id']}", headers=fh, timeout=30).status_code in (200, 201)
        try:
            body = _post(ph, _cleanup)
            assert _wait_for_alert(fh, body["post"]["id"], timeout_s=1.5) is None
        finally:
            requests.delete(f"{API}/social/mute/{puser['id']}", headers=fh, timeout=30)
        # sanity: alerts flow again once un-muted
        body = _post(ph, _cleanup)
        assert _wait_for_alert(fh, body["post"]["id"]) is not None
