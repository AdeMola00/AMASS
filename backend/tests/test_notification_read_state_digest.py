"""Notification Center — read-state polish + channels + email digests (Jun 2026).

Covers: per-category push/email channel prefs, email_digest prefs + validation,
unread_only listing, dismiss / restore (keeps read state), mark-unread, dismiss-read
(bulk clear), counts excluding dismissed rows, signed one-click unsubscribe, and the
test-email endpoint (deliverable inbox + undeliverable → clear 400 + cooldown).
"""
from __future__ import annotations

import os
import sys
import uuid

import pytest
import requests

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

BASE = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL") or "http://localhost:8001").rstrip("/")
API = f"{BASE}/api"


def _register(tag: str):
    email = f"notif2.{tag}.{uuid.uuid4().hex[:8]}@amass.africa"
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": "Notif2026!", "full_name": f"Notif {tag}"}, timeout=30)
    assert r.status_code in (200, 201), r.text
    body = r.json()
    return {"Authorization": f"Bearer {body['access_token']}"}, body["user"]


@pytest.fixture(scope="module")
def carol():
    return _register("carol")


def _preview(h) -> dict:
    r = requests.post(f"{API}/notifications/preview", headers=h, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["notification"]


def _center(h, **params) -> dict:
    r = requests.get(f"{API}/notifications/center", headers=h, params=params, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


class TestChannelsAndDigestPrefs:
    def test_defaults_include_channels_and_email_digest(self, carol):
        h, user = carol
        p = requests.get(f"{API}/notifications/prefs", headers=h, timeout=30).json()
        assert p["categories"]["messages"] == {"enabled": True, "frequency": "immediate", "push": True, "email": True}
        assert p["email_digest"] == {"enabled": False, "frequency": "daily", "hour": 8}
        assert p["email"] == user["email"]

    def test_update_channels_and_digest(self, carol):
        h, _ = carol
        r = requests.put(f"{API}/notifications/prefs", headers=h, json={"categories": {"marketplace": {"push": False, "email": False}}, "email_digest": {"enabled": True, "frequency": "weekly", "hour": 18}}, timeout=30)
        assert r.status_code == 200, r.text
        p = r.json()
        assert p["categories"]["marketplace"]["push"] is False and p["categories"]["marketplace"]["email"] is False
        assert p["categories"]["marketplace"]["enabled"] is True  # channel switches never flip the category itself
        assert p["email_digest"] == {"enabled": True, "frequency": "weekly", "hour": 18}
        # persisted
        p = requests.get(f"{API}/notifications/prefs", headers=h, timeout=30).json()
        assert p["email_digest"]["frequency"] == "weekly" and p["categories"]["marketplace"]["push"] is False

    def test_digest_validation(self, carol):
        h, _ = carol
        assert requests.put(f"{API}/notifications/prefs", headers=h, json={"email_digest": {"frequency": "hourly"}}, timeout=30).status_code == 422
        assert requests.put(f"{API}/notifications/prefs", headers=h, json={"email_digest": {"hour": 24}}, timeout=30).status_code == 422


class TestReadState:
    def test_unread_only_and_read_count(self, carol):
        h, _ = carol
        a = _preview(h)
        b = _preview(h)
        requests.post(f"{API}/notifications/{a['id']}/read", headers=h, timeout=30)
        page = _center(h)
        ids = {n["id"] for n in page["items"]}
        assert a["id"] in ids and b["id"] in ids
        assert page["read_count"] >= 1
        only = _center(h, unread_only="true")
        only_ids = {n["id"] for n in only["items"]}
        assert b["id"] in only_ids and a["id"] not in only_ids
        assert all(not n["read"] for n in only["items"])

    def test_mark_unread(self, carol):
        h, _ = carol
        n = _preview(h)
        requests.post(f"{API}/notifications/{n['id']}/read", headers=h, timeout=30)
        before = requests.get(f"{API}/notifications/unread-count", headers=h, timeout=30).json()["unread"]
        r = requests.post(f"{API}/notifications/{n['id']}/unread", headers=h, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["unread"] == before + 1
        assert requests.post(f"{API}/notifications/{uuid.uuid4()}/unread", headers=h, timeout=30).status_code == 404

    def test_dismiss_restore_keeps_read_state(self, carol):
        h, _ = carol
        n = _preview(h)  # unread
        before = requests.get(f"{API}/notifications/unread-count", headers=h, timeout=30).json()["unread"]
        r = requests.post(f"{API}/notifications/{n['id']}/dismiss", headers=h, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["unread"] == before - 1  # dismissed rows leave the badge
        assert n["id"] not in {x["id"] for x in _center(h)["items"]}
        r = requests.post(f"{API}/notifications/{n['id']}/restore", headers=h, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["notification"]["read"] is False  # came back exactly as it was
        assert r.json()["unread"] == before
        assert n["id"] in {x["id"] for x in _center(h)["items"]}
        # a READ row dismissed + restored stays read
        m = _preview(h)
        requests.post(f"{API}/notifications/{m['id']}/read", headers=h, timeout=30)
        requests.post(f"{API}/notifications/{m['id']}/dismiss", headers=h, timeout=30)
        r = requests.post(f"{API}/notifications/{m['id']}/restore", headers=h, timeout=30)
        assert r.json()["notification"]["read"] is True
        assert requests.post(f"{API}/notifications/{uuid.uuid4()}/dismiss", headers=h, timeout=30).status_code == 404

    def test_dismiss_read_bulk(self, carol):
        h, _ = carol
        keep = _preview(h)  # unread, must survive
        gone = _preview(h)
        requests.post(f"{API}/notifications/{gone['id']}/read", headers=h, timeout=30)
        r = requests.post(f"{API}/notifications/dismiss-read", headers=h, params={"category": "property_matches"}, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["marked"] >= 1
        ids = {x["id"] for x in _center(h, category="property_matches")["items"]}
        assert keep["id"] in ids and gone["id"] not in ids
        assert _center(h, category="property_matches")["read_count"] == 0
        assert requests.post(f"{API}/notifications/dismiss-read", headers=h, params={"category": "nope"}, timeout=30).status_code == 400


class TestEmailDigest:
    def test_unsubscribe_link_is_signed(self, carol):
        from notification_center import unsubscribe_token

        h, user = carol
        requests.put(f"{API}/notifications/prefs", headers=h, json={"email_digest": {"enabled": True}}, timeout=30)
        bad = requests.get(f"{API}/notifications/email/unsubscribe", params={"u": user["id"], "t": "tampered"}, timeout=30)
        assert bad.status_code == 400 and "unsubscribe link" in bad.text.lower()
        assert requests.get(f"{API}/notifications/prefs", headers=h, timeout=30).json()["email_digest"]["enabled"] is True
        ok = requests.get(f"{API}/notifications/email/unsubscribe", params={"u": user["id"], "t": unsubscribe_token(user["id"])}, timeout=30)
        assert ok.status_code == 200 and "Email digests are off" in ok.text
        assert requests.get(f"{API}/notifications/prefs", headers=h, timeout=30).json()["email_digest"]["enabled"] is False

    def test_digest_html_is_guardrail_safe(self, carol):
        from auth_security import _assert_safe_email
        from notification_center import digest_email_html

        _, user = carol
        items = [
            {"id": "1", "kind": "SAVED_SEARCH_MATCH", "category": "property_matches", "title": "3-bed in <Lekki>", "body": "Matched \"Lekki homes\"", "read": False, "action_url": "/property/abc", "created_at": "2026-06-20T07:00:00+00:00"},
            {"id": "2", "kind": "MARKET_AD", "category": "marketplace", "title": "Sofa deal", "body": "", "read": True, "action_url": "/(tabs)/marketplace", "created_at": "2026-06-19T07:00:00+00:00"},
        ]
        subject, html = digest_email_html(user, items, frequency="daily", unread_total=1)
        assert subject == "2 new updates on AMASS today"
        _assert_safe_email(subject, html)  # raises on forms / non-https links / shorteners
        assert "https://amass.africa/property/abc" in html and "https://amass.africa/marketplace" in html
        assert "&lt;Lekki&gt;" in html  # escaped
        assert "email/unsubscribe?u=" in html

    def test_send_test_email_undeliverable_is_clear_400(self):
        r = requests.post(f"{API}/auth/login", json={"email": "demo@amass.africa", "password": "amass2026"}, timeout=30)
        h = {"Authorization": f"Bearer {r.json()['access_token']}"}
        r = requests.post(f"{API}/notifications/email/test", headers=h, timeout=90)
        assert r.status_code == 400, r.text
        assert "can't receive email" in r.json()["detail"]

    def test_send_test_email_to_deliverable_inbox(self):
        r = requests.post(f"{API}/auth/login", json={"email": "delivered@resend.dev", "password": "Digest2026!"}, timeout=30)
        if r.status_code != 200:
            r = requests.post(f"{API}/auth/register", json={"email": "delivered@resend.dev", "password": "Digest2026!", "full_name": "Digest Tester"}, timeout=30)
        assert r.status_code in (200, 201), r.text
        h = {"Authorization": f"Bearer {r.json()['access_token']}"}
        r = requests.post(f"{API}/notifications/email/test", headers=h, timeout=90)
        assert r.status_code in (200, 429), r.text  # 429 = cooldown from a previous run within 5 min
        if r.status_code == 200:
            body = r.json()
            assert body["sent"] is True and body["to"] == "delivered@resend.dev" and body.get("email_id")
            again = requests.post(f"{API}/notifications/email/test", headers=h, timeout=90)
            assert again.status_code == 429
