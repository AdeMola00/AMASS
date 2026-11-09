"""Neighbours follow-ups: friend nudges on map pins, estate join alerts, funnel CSV export.

Run: cd /app/backend && python -m pytest tests/test_neighbours_alerts_nudges.py -q
"""
import os
import uuid

import pytest
import requests

BASE = (os.environ.get("EXPO_BACKEND_URL") or "http://localhost:8001").rstrip("/") + "/api"
DEMO = {"email": "demo@amass.africa", "password": "amass2026"}
PILOT_ESTATE_SLUG = "lekki-gardens-phase-2"


def _login(email, password):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, r.text
    b = r.json()
    return {"Authorization": f"Bearer {b['access_token']}"}, b["user"]


def _fresh(name="Nudge Tester"):
    email = f"nudge+{uuid.uuid4().hex[:10]}@example.com"
    r = requests.post(f"{BASE}/auth/register", json={"email": email, "password": "test1234", "full_name": name}, timeout=20)
    assert r.status_code == 200, r.text
    b = r.json()
    return {"Authorization": f"Bearer {b['access_token']}"}, b["user"]


@pytest.fixture(scope="module")
def demo():
    return _login(**DEMO)


@pytest.fixture(scope="module")
def pilot_estate_id(demo):
    h, _ = demo
    r = requests.get(f"{BASE}/community/home", headers=h, timeout=20)
    assert r.status_code == 200, r.text
    managed = [e for e in r.json()["estates"] if e.get("membership", {}).get("role") == "manager"]
    assert managed, "demo must manage a pilot estate"
    return managed[0]["id"]


def _befriend(demo, friend_headers, friend_user):
    """friend → demo connection request, demo accepts."""
    h, me = demo
    r = requests.post(f"{BASE}/social/connections", headers=friend_headers, json={"user_id": me["id"]}, timeout=20)
    assert r.status_code == 200, r.text
    cid = r.json()["id"]
    r = requests.post(f"{BASE}/social/connections/{cid}/accept", headers=h, timeout=20)
    assert r.status_code == 200, r.text
    return cid


def _locked_marker_id(headers):
    r = requests.get(f"{BASE}/map/markers?limit=300", headers=headers, timeout=30)
    assert r.status_code == 200, r.text
    ms = [m for m in r.json()["markers"] if not m["unlocked"] and not m["friends_saved"] and not m["in_shared_list"]]
    assert ms, "need at least one locked marker without a nudge"
    return ms[0]["id"]


class TestMapNudges:
    def test_marker_shape_has_social_fields(self, demo):
        h, _ = demo
        r = requests.get(f"{BASE}/map/markers?limit=5", headers=h, timeout=30)
        assert r.status_code == 200, r.text
        for m in r.json()["markers"]:
            assert isinstance(m["friends_saved"], int)
            assert isinstance(m["in_shared_list"], bool)

    def test_friend_save_counts_only_when_shared(self, demo):
        h, _ = demo
        fh, fu = _fresh("Sharing Friend")
        _befriend(demo, fh, fu)
        pid = _locked_marker_id(h)
        # friend saves it but has NOT opted into sharing saves → 0
        requests.patch(f"{BASE}/social/me", headers=fh, json={"share_saves": False}, timeout=20)
        r = requests.post(f"{BASE}/favorites/toggle", headers=fh, json={"property_id": pid}, timeout=20)
        assert r.status_code == 200 and r.json().get("favorited") is True, r.text
        m = next(x for x in requests.get(f"{BASE}/map/markers?limit=300", headers=h, timeout=30).json()["markers"] if x["id"] == pid)
        assert m["friends_saved"] == 0
        # opt in → 1
        r = requests.patch(f"{BASE}/social/me", headers=fh, json={"share_saves": True}, timeout=20)
        assert r.status_code == 200, r.text
        m = next(x for x in requests.get(f"{BASE}/map/markers?limit=300", headers=h, timeout=30).json()["markers"] if x["id"] == pid)
        assert m["friends_saved"] == 1
        assert m["unlocked"] is False and m["approx"] is True  # nudge never unlocks anything

    def test_stranger_save_not_counted(self, demo):
        h, _ = demo
        sh, _ = _fresh("Stranger")
        requests.patch(f"{BASE}/social/me", headers=sh, json={"share_saves": True}, timeout=20)
        pid = _locked_marker_id(h)
        requests.post(f"{BASE}/favorites/toggle", headers=sh, json={"property_id": pid}, timeout=20)
        m = next(x for x in requests.get(f"{BASE}/map/markers?limit=300", headers=h, timeout=30).json()["markers"] if x["id"] == pid)
        assert m["friends_saved"] == 0

    def test_shared_list_flag(self, demo):
        h, me = demo
        fh, fu = _fresh("List Friend")
        _befriend(demo, fh, fu)
        pid = _locked_marker_id(h)
        r = requests.post(f"{BASE}/social/collections", headers=h, json={"name": f"Nudge list {uuid.uuid4().hex[:4]}", "kind": "homes"}, timeout=20)
        assert r.status_code == 200, r.text
        coll = r.json()
        r = requests.post(f"{BASE}/social/collections/{coll['id']}/items", headers=h, json={"kind": "property", "target_id": pid}, timeout=20)
        assert r.status_code == 200, r.text
        # solo list → not "shared" yet
        m = next(x for x in requests.get(f"{BASE}/map/markers?limit=300", headers=h, timeout=30).json()["markers"] if x["id"] == pid)
        assert m["in_shared_list"] is False
        r = requests.post(f"{BASE}/social/collections/{coll['id']}/invite", headers=h, json={"user_id": fu["id"]}, timeout=20)
        assert r.status_code == 200, r.text
        m = next(x for x in requests.get(f"{BASE}/map/markers?limit=300", headers=h, timeout=30).json()["markers"] if x["id"] == pid)
        assert m["in_shared_list"] is True


class TestJoinAlerts:
    def test_alerts_shape_and_auth(self, demo):
        h, _ = demo
        assert requests.get(f"{BASE}/community/alerts", timeout=20).status_code == 401
        r = requests.get(f"{BASE}/community/alerts", headers=h, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("join_requests", "connection_requests", "total"):
            assert isinstance(d[k], int)
        assert d["total"] == d["join_requests"] + d["connection_requests"]

    def test_join_request_raises_manager_alert_and_home_badge(self, demo, pilot_estate_id):
        h, _ = demo
        before = requests.get(f"{BASE}/community/alerts", headers=h, timeout=20).json()["join_requests"]
        nh, _ = _fresh("New Resident")
        r = requests.post(f"{BASE}/community/estates/{pilot_estate_id}/join", headers=nh, json={"unit": "Block Z, Flat 9", "note": "test"}, timeout=20)
        assert r.status_code == 200 and r.json()["status"] == "pending", r.text
        after = requests.get(f"{BASE}/community/alerts", headers=h, timeout=20).json()["join_requests"]
        assert after == before + 1
        home = requests.get(f"{BASE}/community/home", headers=h, timeout=20).json()
        est = next(e for e in home["estates"] if e["id"] == pilot_estate_id)
        assert est["is_manager"] is True
        assert est["pending_requests"] == after
        # manager got an ESTATE_REQUEST notification carrying the estate id
        notes = requests.get(f"{BASE}/notifications", headers=h, timeout=20).json()
        items = notes if isinstance(notes, list) else notes.get("items", [])
        assert any(n["kind"] == "ESTATE_REQUEST" and (n.get("meta") or {}).get("estate_id") == pilot_estate_id for n in items)
        # a plain resident sees no join alerts
        assert requests.get(f"{BASE}/community/alerts", headers=nh, timeout=20).json()["join_requests"] == 0


class TestFunnelCsv:
    def test_gated(self, demo):
        assert requests.get(f"{BASE}/admin/analytics/funnel.csv", timeout=20).status_code == 401
        uh, _ = _fresh()
        assert requests.get(f"{BASE}/admin/analytics/funnel.csv", headers=uh, timeout=20).status_code == 403

    def test_csv_matches_json(self, demo):
        h, _ = demo
        r = requests.get(f"{BASE}/admin/analytics/funnel.csv?days=30", headers=h, timeout=30)
        assert r.status_code == 200, r.text
        assert r.headers["content-type"].startswith("text/csv")
        assert 'filename="amass-neighbours-funnel-30d-' in r.headers.get("content-disposition", "")
        lines = r.text.splitlines()
        assert lines[2] == "section,metric,current,previous,change_pct"
        j = requests.get(f"{BASE}/admin/analytics/funnel?days=30", headers=h, timeout=30).json()
        row = next(l for l in lines if l.startswith("funnel,payments_completed,"))
        assert row.split(",")[2] == str(j["current"]["payments_completed"])
        assert any(l.startswith("attribution,friend.payments_completed,") for l in lines)
        assert any(l.startswith("social,collections_shared,") for l in lines)
        assert any(l.startswith("moderation,reports_open,") for l in lines)
