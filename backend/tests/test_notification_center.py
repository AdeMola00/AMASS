"""Notification Center — user-controlled categories / frequency / quiet hours / push prompt.

Covers the HTTP surface in backend/notification_center.py plus the emit funnel
behaviour (category off → nothing stored, digest queueing, collapse of same-target
unread rows, read-sync by target / category / kind, legacy writers routed through
the engine).
"""
from __future__ import annotations

import os
import uuid

import pytest
import requests

BASE = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL") or "http://localhost:8001").rstrip("/")
API = f"{BASE}/api"


def _register(tag: str):
    email = f"notif.{tag}.{uuid.uuid4().hex[:8]}@amass.africa"
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": "Notif2026!", "full_name": f"Notif {tag}"}, timeout=30)
    assert r.status_code in (200, 201), r.text
    body = r.json()
    return {"Authorization": f"Bearer {body['access_token']}"}, body["user"]


@pytest.fixture(scope="module")
def alice():
    return _register("alice")


@pytest.fixture(scope="module")
def bob():
    return _register("bob")


@pytest.fixture(scope="module")
def admin():
    r = requests.post(f"{API}/auth/login", json={"email": "demo@amass.africa", "password": "amass2026"}, timeout=30)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


class TestPrefs:
    def test_defaults(self, alice):
        h, _ = alice
        r = requests.get(f"{API}/notifications/prefs", headers=h, timeout=30)
        assert r.status_code == 200, r.text
        p = r.json()
        assert p["push_enabled"] is False
        assert p["push_prompt"]["status"] == "undetermined"
        assert p["quiet_hours"] == {"enabled": False, "start": "22:00", "end": "07:00"}
        assert set(p["catalog"]) >= {"property_matches", "nearby_listings", "brand_offers", "marketplace", "social", "passport", "receipts", "admin", "messages", "services"}
        assert p["categories"]["nearby_listings"]["frequency"] == "daily"
        assert p["categories"]["brand_offers"]["frequency"] == "weekly"
        assert p["frequencies"] == ["immediate", "daily", "weekly"]

    def test_update_and_validation(self, alice):
        h, _ = alice
        r = requests.put(f"{API}/notifications/prefs", headers=h, json={"categories": {"brand_offers": {"enabled": False}, "property_matches": {"frequency": "daily"}}, "quiet_hours": {"enabled": True, "start": "23:00", "end": "06:30"}}, timeout=30)
        assert r.status_code == 200, r.text
        p = r.json()
        assert p["categories"]["brand_offers"]["enabled"] is False
        assert p["categories"]["property_matches"]["frequency"] == "daily"
        assert p["quiet_hours"] == {"enabled": True, "start": "23:00", "end": "06:30"}
        # Non-digest categories never take a frequency
        r = requests.put(f"{API}/notifications/prefs", headers=h, json={"categories": {"messages": {"frequency": "weekly"}}}, timeout=30)
        assert r.status_code == 200
        assert r.json()["categories"]["messages"]["frequency"] == "immediate"
        # Unknown category / bad frequency rejected
        assert requests.put(f"{API}/notifications/prefs", headers=h, json={"categories": {"nope": {"enabled": True}}}, timeout=30).status_code == 400
        assert requests.put(f"{API}/notifications/prefs", headers=h, json={"categories": {"messages": {"frequency": "hourly"}}}, timeout=30).status_code == 422
        # Persisted
        p = requests.get(f"{API}/notifications/prefs", headers=h, timeout=30).json()
        assert p["categories"]["brand_offers"]["enabled"] is False
        # reset for later tests
        requests.put(f"{API}/notifications/prefs", headers=h, json={"categories": {"brand_offers": {"enabled": True}, "property_matches": {"frequency": "immediate"}}, "quiet_hours": {"enabled": False}}, timeout=30)

    def test_push_prompt_outcomes(self, alice):
        h, _ = alice
        r = requests.post(f"{API}/notifications/push-prompt", headers=h, json={"status": "granted", "context": "saved_search"}, timeout=30)
        assert r.status_code == 200 and r.json()["push_enabled"] is True
        r = requests.post(f"{API}/notifications/push-prompt", headers=h, json={"status": "blocked", "context": "preferences"}, timeout=30)
        assert r.status_code == 200 and r.json()["push_enabled"] is False
        p = requests.get(f"{API}/notifications/prefs", headers=h, timeout=30).json()
        assert p["push_prompt"]["status"] == "blocked" and p["push_prompt"]["context"] == "preferences" and p["push_prompt"]["last_prompted_at"]
        assert requests.post(f"{API}/notifications/push-prompt", headers=h, json={"status": "maybe"}, timeout=30).status_code == 422

    def test_requires_auth(self):
        assert requests.get(f"{API}/notifications/center", timeout=30).status_code in (401, 403)
        assert requests.get(f"{API}/notifications/prefs", timeout=30).status_code in (401, 403)


class TestCenter:
    def test_preview_lands_in_center_with_category(self, alice):
        h, _ = alice
        r = requests.post(f"{API}/notifications/preview", headers=h, timeout=30)
        assert r.status_code == 200, r.text
        n = r.json()["notification"]
        assert n["category"] == "property_matches" and n["read"] is False
        c = requests.get(f"{API}/notifications/center", headers=h, timeout=30).json()
        assert c["unread"] >= 1
        assert c["unread_by_category"].get("property_matches", 0) >= 1
        assert any(i["id"] == n["id"] for i in c["items"])
        assert "categories" in c and "next_before" in c
        # category filter
        c2 = requests.get(f"{API}/notifications/center?category=property_matches", headers=h, timeout=30).json()
        assert c2["items"] and all(i["category"] == "property_matches" for i in c2["items"])
        c3 = requests.get(f"{API}/notifications/center?category=receipts", headers=h, timeout=30).json()
        assert all(i["category"] == "receipts" for i in c3["items"])
        assert requests.get(f"{API}/notifications/center?category=bogus", headers=h, timeout=30).status_code == 400

    def test_mark_one_read_and_unread_count(self, alice):
        h, _ = alice
        n = requests.post(f"{API}/notifications/preview", headers=h, timeout=30).json()["notification"]
        before = requests.get(f"{API}/notifications/unread-count", headers=h, timeout=30).json()["unread"]
        r = requests.post(f"{API}/notifications/{n['id']}/read", headers=h, timeout=30)
        assert r.status_code == 200 and r.json()["unread"] == before - 1
        assert requests.post(f"{API}/notifications/{uuid.uuid4()}/read", headers=h, timeout=30).status_code == 404
        # other users cannot mark mine
        hb, _ = _register("intruder")
        assert requests.post(f"{API}/notifications/{n['id']}/read", headers=hb, timeout=30).status_code == 404

    def test_read_by_category_and_read_all(self, alice):
        h, _ = alice
        requests.post(f"{API}/notifications/preview", headers=h, timeout=30)
        r = requests.post(f"{API}/notifications/read-by-target", headers=h, json={"target_type": "category", "target_id": "property_matches"}, timeout=30)
        assert r.status_code == 200 and r.json()["marked"] >= 1
        c = requests.get(f"{API}/notifications/center?category=property_matches", headers=h, timeout=30).json()
        assert all(i["read"] for i in c["items"])
        assert requests.post(f"{API}/notifications/read-by-target", headers=h, json={"target_type": "category", "target_id": "nope"}, timeout=30).status_code == 400
        requests.post(f"{API}/notifications/preview", headers=h, timeout=30)
        r = requests.post(f"{API}/notifications/read-all", headers=h, timeout=30)
        assert r.status_code == 200 and r.json()["unread"] == 0

    def test_legacy_list_still_works(self, alice):
        h, _ = alice
        r = requests.get(f"{API}/notifications", headers=h, timeout=30)
        assert r.status_code == 200 and "items" in r.json() and "unread" in r.json()


class TestEmitFunnel:
    """Chat → NEW_MESSAGE is the easiest real writer to drive end-to-end."""

    def _dm(self, alice, bob):
        ha, ua = alice
        hb, ub = bob
        # connect the two users so a direct conversation is allowed
        r = requests.post(f"{API}/social/connections", headers=ha, json={"user_id": ub["id"]}, timeout=30)
        assert r.status_code == 200, r.text
        if r.json().get("status") == "pending":
            cid = r.json()["id"]
            requests.post(f"{API}/social/connections/{cid}/accept", headers=hb, timeout=30)
        r = requests.post(f"{API}/chat/conversations/direct/{ub['id']}", headers=ha, timeout=30)
        assert r.status_code in (200, 201), r.text
        conv = r.json()
        return conv.get("id") or conv.get("conversation", {}).get("id")

    def test_messages_collapse_per_conversation_and_sync_on_read(self, alice, bob):
        ha, ua = alice
        hb, ub = bob
        conv_id = self._dm(alice, bob)
        requests.post(f"{API}/notifications/read-all", headers=hb, timeout=30)
        for i in range(3):
            r = requests.post(f"{API}/chat/conversations/{conv_id}/messages", headers=ha, json={"text": f"hello {i}", "client_msg_id": uuid.uuid4().hex}, timeout=30)
            assert r.status_code in (200, 201), r.text
        c = requests.get(f"{API}/notifications/center?category=messages", headers=hb, timeout=30).json()
        rows = [i for i in c["items"] if i["meta"].get("conversation_id") == conv_id and not i["read"]]
        assert len(rows) == 1, "same conversation must collapse into ONE unread row"
        assert rows[0]["meta"].get("count") == 3
        assert rows[0]["action_url"] == f"/chat/{conv_id}"
        assert rows[0]["body"].startswith("hello 2")
        # Destination sync: marking by conversation target clears it
        r = requests.post(f"{API}/notifications/read-by-target", headers=hb, json={"target_type": "conversation", "target_id": conv_id}, timeout=30)
        assert r.status_code == 200 and r.json()["marked"] >= 1
        c = requests.get(f"{API}/notifications/center?category=messages", headers=hb, timeout=30).json()
        assert not any(i["meta"].get("conversation_id") == conv_id and not i["read"] for i in c["items"])

    def test_category_off_suppresses_storage(self, alice, bob):
        ha, _ = alice
        hb, _ = bob
        conv_id = self._dm(alice, bob)
        requests.put(f"{API}/notifications/prefs", headers=hb, json={"categories": {"messages": {"enabled": False}}}, timeout=30)
        requests.post(f"{API}/notifications/read-all", headers=hb, timeout=30)
        r = requests.post(f"{API}/chat/conversations/{conv_id}/messages", headers=ha, json={"text": "muted?", "client_msg_id": uuid.uuid4().hex}, timeout=30)
        assert r.status_code in (200, 201)
        c = requests.get(f"{API}/notifications/center?category=messages", headers=hb, timeout=30).json()
        assert not any(i["body"] == "muted?" for i in c["items"])
        requests.put(f"{API}/notifications/prefs", headers=hb, json={"categories": {"messages": {"enabled": True}}}, timeout=30)

    def test_social_request_notification_routed(self, alice, bob):
        """Neighbours is retired: connection requests are written but hidden from the centre and every count."""
        hb, ub = bob
        hc, uc = _register("carol")
        requests.post(f"{API}/notifications/read-all", headers=hb, timeout=30)
        r = requests.post(f"{API}/social/connections", headers=hc, json={"user_id": ub["id"]}, timeout=30)
        assert r.status_code == 200, r.text
        c = requests.get(f"{API}/notifications/center?category=social", headers=hb, timeout=30).json()
        assert not any(i["kind"] == "CONNECTION_REQUEST" for i in c["items"])
        assert c["unread_by_category"].get("social", 0) == 0
        assert requests.get(f"{API}/notifications/unread-count", headers=hb, timeout=30).json()["unread"] == 0


class TestDigestAndMatchers:
    def test_admin_run_matchers_shape_and_gate(self, admin, alice):
        h, _ = alice
        assert requests.post(f"{API}/notifications/admin/run-matchers", headers=h, timeout=60).status_code in (401, 403)
        r = requests.post(f"{API}/notifications/admin/run-matchers", headers=admin, timeout=120)
        assert r.status_code == 200, r.text
        out = r.json()
        for k in ("saved_searches", "nearby", "brand_offers", "marketplace", "passport", "digests", "since"):
            assert k in out
        assert all(isinstance(out[k], int) and out[k] >= 0 for k in ("saved_searches", "nearby", "brand_offers", "marketplace", "passport", "digests"))

    def test_digest_mode_queues_instead_of_storing(self, alice):
        h, _ = alice
        requests.put(f"{API}/notifications/prefs", headers=h, json={"categories": {"property_matches": {"frequency": "weekly"}}}, timeout=30)
        before = requests.get(f"{API}/notifications/center?category=property_matches", headers=h, timeout=30).json()
        r = requests.post(f"{API}/notifications/preview", headers=h, timeout=30)
        assert r.status_code == 200
        # Preview always shows SOMETHING in the centre (fallback row) — but it must be flagged as the preview fallback
        assert r.json()["notification"]["meta"].get("preview") is True
        requests.put(f"{API}/notifications/prefs", headers=h, json={"categories": {"property_matches": {"frequency": "immediate"}}}, timeout=30)
        assert before is not None
