"""Spot-check for iteration-57 review: endpoints explicitly called out in the request."""
from __future__ import annotations

import os
import uuid

import pytest
import requests

BASE = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "http://localhost:8001").rstrip("/")
API = f"{BASE}/api"


def _register(tag: str):
    email = f"review57.{tag}.{uuid.uuid4().hex[:8]}@amass.africa"
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": "Review2026!", "full_name": f"Rev {tag}"}, timeout=30)
    assert r.status_code in (200, 201), r.text
    body = r.json()
    return {"Authorization": f"Bearer {body['access_token']}"}, body["user"]


@pytest.fixture(scope="module")
def demo():
    r = requests.post(f"{API}/auth/login", json={"email": "demo@amass.africa", "password": "amass2026"}, timeout=30)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


class TestReviewSpotcheck:
    def test_center_shape(self, demo):
        r = requests.get(f"{API}/notifications/center", headers=demo, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        for k in ("items", "unread", "unread_by_category", "categories", "next_before"):
            assert k in body, f"missing key {k}"
        assert isinstance(body["categories"], dict) and "messages" in body["categories"]

    def test_center_category_filter_and_bad(self, demo):
        r = requests.get(f"{API}/notifications/center?category=messages", headers=demo, timeout=30)
        assert r.status_code == 200
        for i in r.json()["items"]:
            assert i["category"] == "messages"
        assert requests.get(f"{API}/notifications/center?category=bogus", headers=demo, timeout=30).status_code == 400

    def test_unread_count(self, demo):
        r = requests.get(f"{API}/notifications/unread-count", headers=demo, timeout=30)
        assert r.status_code == 200 and isinstance(r.json()["unread"], int)

    def test_prefs_messages_forced_immediate_and_quiet(self, demo):
        r = requests.put(f"{API}/notifications/prefs", headers=demo, json={
            "categories": {"brand_offers": {"frequency": "weekly"}, "messages": {"frequency": "weekly"}},
            "quiet_hours": {"enabled": True, "start": "23:00", "end": "06:30"},
        }, timeout=30)
        assert r.status_code == 200
        p = r.json()
        assert p["categories"]["messages"]["frequency"] == "immediate"
        assert p["categories"]["brand_offers"]["frequency"] == "weekly"
        assert p["quiet_hours"] == {"enabled": True, "start": "23:00", "end": "06:30"}

    def test_prefs_unknown_category(self, demo):
        assert requests.put(f"{API}/notifications/prefs", headers=demo, json={"categories": {"nope": {"enabled": False}}}, timeout=30).status_code == 400

    def test_push_prompt_contexts(self, demo):
        for st in ("granted", "dismissed", "blocked"):
            r = requests.post(f"{API}/notifications/push-prompt", headers=demo, json={"status": st, "context": "spotcheck"}, timeout=30)
            assert r.status_code == 200, r.text

    def test_preview_then_read_404_other_user(self, demo):
        h2, _ = _register("other")
        n = requests.post(f"{API}/notifications/preview", headers=demo, timeout=30).json()["notification"]
        assert requests.post(f"{API}/notifications/{n['id']}/read", headers=h2, timeout=30).status_code == 404
        assert requests.post(f"{API}/notifications/{uuid.uuid4()}/read", headers=demo, timeout=30).status_code == 404
        assert requests.post(f"{API}/notifications/{n['id']}/read", headers=demo, timeout=30).status_code == 200

    def test_read_by_target_category_and_read_all(self, demo):
        requests.post(f"{API}/notifications/preview", headers=demo, timeout=30)
        r = requests.post(f"{API}/notifications/read-by-target", headers=demo, json={"target_type": "category", "target_id": "property_matches"}, timeout=30)
        assert r.status_code == 200 and r.json()["marked"] >= 0
        r = requests.post(f"{API}/notifications/read-all", headers=demo, timeout=30)
        assert r.status_code == 200 and r.json()["unread"] == 0

    def test_legacy_list_endpoint(self, demo):
        r = requests.get(f"{API}/notifications", headers=demo, timeout=30)
        assert r.status_code == 200
        body = r.json()
        assert "items" in body

    def test_admin_run_matchers_gate(self, demo):
        h2, _ = _register("nonadmin")
        assert requests.post(f"{API}/notifications/admin/run-matchers", headers=h2, timeout=60).status_code in (401, 403)
        r = requests.post(f"{API}/notifications/admin/run-matchers", headers=demo, timeout=120)
        assert r.status_code == 200
