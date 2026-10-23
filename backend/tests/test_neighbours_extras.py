"""Supplementary Neighbours API tests covering uploads, files, upvote, groups,
event cancellation, analytics name routing, and feedback — items from the
Jan-2026 review request that the base `test_neighbours.py` does not already exercise.

Run: cd /app/backend && TEST_BASE_URL="https://property-os-africa.preview.emergentagent.com/api" \
     python -m pytest tests/test_neighbours_extras.py -q -n 1
"""
import base64
import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE = os.environ.get("TEST_BASE_URL", "http://localhost:8001/api")
DEMO = {"email": "demo@amass.africa", "password": "amass2026"}

# Minimum valid 1×1 transparent PNG (base64)
TINY_PNG_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _login(creds: dict) -> dict:
    r = requests.post(f"{BASE}/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, r.text
    return _h(r.json()["access_token"])


def _phone_user(name: str = "Phone User"):
    phone = f"+2347{str(int(uuid.uuid4().int % 10**9)).zfill(9)}"
    r = requests.post(f"{BASE}/auth/phone/start", json={"phone": phone}, timeout=20)
    assert r.status_code == 200, r.text
    r = requests.post(
        f"{BASE}/auth/phone/verify",
        json={"phone": phone, "code": "123456", "full_name": name},
        timeout=20,
    )
    assert r.status_code == 200, r.text
    tok = r.json()
    return _h(tok["access_token"]), phone, tok["user"]


@pytest.fixture(scope="module")
def admin():
    return _login(DEMO)


@pytest.fixture(scope="module")
def resident(admin):
    """A fresh phone user who joins the Lekki estate as approved resident."""
    h, phone, user = _phone_user("Extras Resident")
    # Get Lekki estate
    r = requests.get(f"{BASE}/community/estates", headers=admin, timeout=20).json()
    e = next(x for x in r["items"] if x["name"].startswith("Lekki Gardens"))
    full = requests.get(f"{BASE}/community/estates/{e['id']}", headers=admin, timeout=20).json()
    jr = requests.post(
        f"{BASE}/community/estates/{e['id']}/join",
        json={"join_code": full["join_code"], "unit": "D-7"},
        headers=h,
        timeout=20,
    )
    assert jr.status_code == 200, jr.text
    pending = requests.get(
        f"{BASE}/community/estates/{e['id']}/members",
        params={"status": "pending"},
        headers=admin,
        timeout=20,
    ).json()
    row = next(m for m in pending if m["user"]["id"] == user["id"])
    assert requests.post(
        f"{BASE}/community/estates/{e['id']}/members/{row['id']}/review",
        json={"action": "approve"},
        headers=admin,
        timeout=20,
    ).status_code == 200
    return {"h": h, "user": user, "estate": full}


# ─── Uploads + Files auth ─────────────────────────────────
def test_upload_png_returns_url_and_uploader_can_fetch(resident):
    h = resident["h"]
    data_url = f"data:image/png;base64,{TINY_PNG_B64}"
    r = requests.post(f"{BASE}/community/uploads", json={"data_url": data_url}, headers=h, timeout=20)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "url" in body and "path" in body
    assert body["url"].startswith("/api/files/") and body["url"].endswith(body["path"])

    # Uploader can fetch the file through /api/files/<path>
    file_url = f"{BASE.rsplit('/api', 1)[0]}{body['url']}"
    rf = requests.get(file_url, headers=h, timeout=20)
    # Expect 200 (uploader) or 302 to a signed URL — both ok
    assert rf.status_code in (200, 302, 307), f"{rf.status_code} {rf.text[:200]}"
    if rf.status_code == 200:
        # The content should be non-empty bytes (PNG)
        assert len(rf.content) > 0


def test_upload_rejects_oversize(resident):
    h = resident["h"]
    # ~6 MB of A's → base64 encodes larger; the backend caps raw bytes at 5MB
    big_bytes = b"A" * (6 * 1024 * 1024)
    big_b64 = base64.b64encode(big_bytes).decode()
    data_url = f"data:image/png;base64,{big_b64}"
    r = requests.post(f"{BASE}/community/uploads", json={"data_url": data_url}, headers=h, timeout=30)
    # 413 from business logic or 422 from Pydantic string-length validator — both reject oversize
    assert r.status_code in (413, 422), f"expected 413/422, got {r.status_code} / {r.text[:200]}"


# ─── Post upvote ──────────────────────────────────────────
def test_post_upvote_toggles(admin, resident):
    eid = resident["estate"]["id"]
    # Resident creates a general post
    r = requests.post(
        f"{BASE}/community/estates/{eid}/posts",
        json={"type": "general", "body": "Who ordered pepper soup?"},
        headers=resident["h"],
        timeout=20,
    )
    assert r.status_code == 200, r.text
    pid = r.json()["id"]
    # Upvote (admin, as another member)
    r1 = requests.post(f"{BASE}/community/posts/{pid}/upvote", headers=admin, timeout=20)
    assert r1.status_code == 200
    body1 = r1.json()
    # Toggle again — should flip back / decrement
    r2 = requests.post(f"{BASE}/community/posts/{pid}/upvote", headers=admin, timeout=20)
    assert r2.status_code == 200
    body2 = r2.json()
    # If upvoted flag is returned, it should flip. Otherwise counts should differ.
    if "upvoted" in body1 and "upvoted" in body2:
        assert body1["upvoted"] != body2["upvoted"]
    elif "upvotes" in body1 and "upvotes" in body2:
        assert body1["upvotes"] != body2["upvotes"]


# ─── Groups create / join / leave ────────────────────────
def test_group_create_join_leave(admin, resident):
    eid = resident["estate"]["id"]
    # Resident (member) creates a group
    r = requests.post(
        f"{BASE}/community/estates/{eid}/groups",
        json={"name": f"Runners {uuid.uuid4().hex[:4]}", "description": "Morning jogs"},
        headers=resident["h"],
        timeout=20,
    )
    assert r.status_code == 200, r.text
    gid = r.json().get("id") or r.json().get("group", {}).get("id")
    assert gid, r.text
    # Admin joins
    r = requests.post(f"{BASE}/community/groups/{gid}/join", headers=admin, timeout=20)
    assert r.status_code == 200, r.text
    # Admin leaves
    r = requests.post(f"{BASE}/community/groups/{gid}/leave", headers=admin, timeout=20)
    assert r.status_code == 200, r.text
    # Non-member (new phone user) cannot join a members-only estate group
    stranger_h, _, _ = _phone_user("Group Stranger")
    r = requests.post(f"{BASE}/community/groups/{gid}/join", headers=stranger_h, timeout=20)
    assert r.status_code in (403, 404), r.text


# ─── Event host cancel ───────────────────────────────────
def test_event_host_cancel_only(admin, resident):
    eid = resident["estate"]["id"]
    starts = (datetime.now(timezone.utc) + timedelta(days=3)).isoformat()
    # Admin creates the event; resident (non-admin, non-host) should NOT be able to cancel
    r = requests.post(
        f"{BASE}/community/events",
        json={
            "title": "Admin-hosted cleanup",
            "kind": "activity",
            "starts_at": starts,
            "location_label": "Gate",
            "audience": "estate",
            "estate_id": eid,
            "group_chat": False,
        },
        headers=admin,
        timeout=20,
    )
    assert r.status_code == 200, r.text
    ev = r.json()
    # Resident (non-host, non-admin) cannot cancel
    r_nh = requests.post(f"{BASE}/community/events/{ev['id']}/cancel", headers=resident["h"], timeout=20)
    assert r_nh.status_code in (403, 404), r_nh.text
    # Host (admin) can cancel
    r_h = requests.post(f"{BASE}/community/events/{ev['id']}/cancel", headers=admin, timeout=20)
    assert r_h.status_code == 200, r_h.text


# ─── Analytics allowed + dropped names ───────────────────
def test_analytics_accepts_allowed_names_and_drops_unknown(resident):
    h = resident["h"]
    r = requests.post(
        f"{BASE}/analytics/events",
        json={
            "events": [
                {"name": "property_detail_view", "props": {"property_id": "p1", "arrived_via": "collection"}},
                {"name": "paid_action_start", "props": {"property_id": "p1", "arrived_via": "collection"}},
                {"name": "marker_tap", "props": {"property_id": "p1"}},
                {"name": "totally_bogus_event", "props": {}},
                {"name": "another_bad_name", "props": {}},
            ]
        },
        headers=h,
        timeout=20,
    )
    assert r.status_code == 200
    j = r.json()
    assert j["accepted"] == 3, f"expected 3 accepted, got {j}"


# ─── Social feedback ────────────────────────────────────
def test_social_feedback_submission(resident):
    r = requests.post(
        f"{BASE}/social/feedback",
        json={"text": "Love the Neighbours tab!", "area": "neighbours", "rating": 5},
        headers=resident["h"],
        timeout=20,
    )
    # Accept several shapes — 200 OK or 201 created
    assert r.status_code in (200, 201), f"{r.status_code} {r.text[:200]}"
    body = r.json() if r.content else {}
    assert body.get("ok") in (True, None) or "id" in body


# ─── Social settings persistence ────────────────────────
def test_social_me_patch_persists(resident):
    h = resident["h"]
    new_handle = f"res{uuid.uuid4().hex[:6]}"
    r = requests.patch(
        f"{BASE}/social/me",
        json={"handle": new_handle, "bio": "Test bio", "show_handle": True, "share_saves": True},
        headers=h,
        timeout=20,
    )
    assert r.status_code == 200, r.text
    me = requests.get(f"{BASE}/social/me", headers=h, timeout=20).json()
    assert me.get("handle") == new_handle
    assert me.get("bio") == "Test bio"


# ─── Managers-only pending members 403 for non-manager ──
def test_members_pending_requires_manager(resident):
    eid = resident["estate"]["id"]
    r = requests.get(
        f"{BASE}/community/estates/{eid}/members",
        params={"status": "pending"},
        headers=resident["h"],
        timeout=20,
    )
    # resident is a plain approved member, not manager
    assert r.status_code == 403, f"expected 403, got {r.status_code}"


# ─── Places nearby around Lekki coords ───────────────────
def test_places_nearby_lekki(resident):
    r = requests.get(
        f"{BASE}/community/places",
        params={"lat": 6.4494, "lng": 3.4739, "radius_km": 5},
        headers=resident["h"],
        timeout=20,
    )
    assert r.status_code == 200, r.text
    assert "items" in r.json()


# ─── Collection invite preview + join ───────────────────
def test_collection_invite_code_preview_and_join():
    # Create new owner + stranger
    h_owner, _, _ = _phone_user("Owner X")
    h_other, _, u_other = _phone_user("Stranger Y")

    r = requests.post(
        f"{BASE}/social/collections",
        json={"name": "My shortlist", "kind": "homes"},
        headers=h_owner,
        timeout=20,
    )
    assert r.status_code == 200, r.text
    cid = r.json()["id"]
    detail = requests.get(f"{BASE}/social/collections/{cid}", headers=h_owner, timeout=20).json()
    code = detail["invite_code"]
    assert code

    pre = requests.get(f"{BASE}/social/collections/join/{code}", headers=h_other, timeout=20)
    assert pre.status_code == 200, pre.text
    j = pre.json()
    assert j["name"] == "My shortlist" and j["already_member"] is False

    assert requests.post(f"{BASE}/social/collections/join/{code}", headers=h_other, timeout=20).status_code == 200
    pre2 = requests.get(f"{BASE}/social/collections/join/{code}", headers=h_other, timeout=20).json()
    assert pre2["already_member"] is True
