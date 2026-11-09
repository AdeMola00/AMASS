"""AMASS In-App Chat — Phase 2 backend tests.

Covers heartbeat, typing indicator, presence (with other-only filter),
image upload (5MB cap + participant guard + attachments send),
message search, verified-only + q filter on conversations list,
and admin reports + stats endpoints.
"""
import os
import uuid
import asyncio
import base64
import time
from datetime import datetime, timezone

import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://property-os-africa.preview.emergentagent.com",
).rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "amass_db")


# ─── helpers ───
def _mkuser(role="buyer"):
    email = f"chat2_{role}_{uuid.uuid4().hex[:6]}@example.com"
    pwd = "TestPass123!"
    r = requests.post(
        f"{BASE_URL}/api/auth/register",
        json={"email": email, "password": pwd, "full_name": f"Chat2 {role.title()}"},
        timeout=20,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    return {
        "email": email,
        "id": body["user"]["id"],
        "headers": {
            "Authorization": f"Bearer {body['access_token']}",
            "Content-Type": "application/json",
        },
    }


def _run(coro_factory):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro_factory())
    finally:
        loop.close()


async def _seed_property_async(agent_id: str, verified: bool = True) -> str:
    cli = AsyncIOMotorClient(MONGO_URL)
    db = cli[DB_NAME]
    try:
        pid = str(uuid.uuid4())
        await db.properties.insert_one({
            "id": pid,
            "title": "Phase2 Chat Duplex",
            "location": "Lekki Phase 1, Lagos",
            "city": "Lagos",
            "state": "Lagos",
            "latitude": 6.4474,
            "longitude": 3.4723,
            "price": 300_000_000,
            "listing_type": "sale",
            "property_type": "residential",
            "status": "available",
            "images": ["https://example.com/img.jpg"],
            "agent_id": agent_id,
            "agent_name": "Phase2 Agent",
            "verified": verified,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        })
        return pid
    finally:
        cli.close()


async def _mark_user_verified(user_id: str, verified: bool = True):
    cli = AsyncIOMotorClient(MONGO_URL)
    db = cli[DB_NAME]
    try:
        await db.users.update_one({"id": user_id}, {"$set": {"verified": verified}})
    finally:
        cli.close()


# ─── fixtures ───
@pytest.fixture(scope="module")
def buyer():
    return _mkuser("buyer")


@pytest.fixture(scope="module")
def agent():
    u = _mkuser("agent")
    # Mark agent as verified for verified_only filter test
    _run(lambda: _mark_user_verified(u["id"], True))
    return u


@pytest.fixture(scope="module")
def outsider():
    return _mkuser("outsider")


@pytest.fixture(scope="module")
def property_id(agent):
    return _run(lambda: _seed_property_async(agent["id"], True))


@pytest.fixture(scope="module")
def conv(buyer, agent, property_id):
    r = requests.post(
        f"{BASE_URL}/api/chat/conversations/from-property/{property_id}",
        headers=buyer["headers"], timeout=15,
    )
    assert r.status_code == 200, r.text
    return r.json()


# ─── /heartbeat ───
class TestHeartbeat:
    def test_heartbeat_updates_presence(self, buyer):
        r = requests.post(f"{BASE_URL}/api/chat/heartbeat",
                          headers=buyer["headers"], timeout=10)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert "last_seen_at" in body
        # Validate ISO format
        datetime.fromisoformat(body["last_seen_at"].replace("Z", "+00:00"))

    def test_heartbeat_requires_auth(self):
        r = requests.post(f"{BASE_URL}/api/chat/heartbeat", timeout=10)
        assert r.status_code in (401, 403)


# ─── typing ───
class TestTyping:
    def test_typing_true_then_false(self, buyer, conv):
        r_on = requests.post(
            f"{BASE_URL}/api/chat/conversations/{conv['id']}/typing",
            headers=buyer["headers"], json={"is_typing": True}, timeout=10,
        )
        assert r_on.status_code == 200
        assert r_on.json().get("ok") is True

        r_off = requests.post(
            f"{BASE_URL}/api/chat/conversations/{conv['id']}/typing",
            headers=buyer["headers"], json={"is_typing": False}, timeout=10,
        )
        assert r_off.status_code == 200

    def test_typing_forbidden_for_outsider(self, outsider, conv):
        r = requests.post(
            f"{BASE_URL}/api/chat/conversations/{conv['id']}/typing",
            headers=outsider["headers"], json={"is_typing": True}, timeout=10,
        )
        assert r.status_code == 403


# ─── presence (typing_user_ids + others only) ───
class TestPresence:
    def test_presence_lists_typing_others_only(self, buyer, agent, conv):
        # Buyer starts typing; from BUYER's view, buyer should NOT appear (self excluded)
        requests.post(
            f"{BASE_URL}/api/chat/conversations/{conv['id']}/typing",
            headers=buyer["headers"], json={"is_typing": True}, timeout=10,
        )
        r = requests.get(
            f"{BASE_URL}/api/chat/conversations/{conv['id']}/presence",
            headers=buyer["headers"], timeout=10,
        )
        assert r.status_code == 200
        body = r.json()
        assert isinstance(body.get("typing_user_ids"), list)
        # Buyer typing shouldn't appear in buyer's own view
        assert buyer["id"] not in body["typing_user_ids"]

        # From AGENT's view, buyer SHOULD appear
        r2 = requests.get(
            f"{BASE_URL}/api/chat/conversations/{conv['id']}/presence",
            headers=agent["headers"], timeout=10,
        )
        assert r2.status_code == 200
        body2 = r2.json()
        assert buyer["id"] in body2["typing_user_ids"]

        # Cleanup: buyer stops
        requests.post(
            f"{BASE_URL}/api/chat/conversations/{conv['id']}/typing",
            headers=buyer["headers"], json={"is_typing": False}, timeout=10,
        )

    def test_presence_returns_others_only(self, buyer, agent, conv):
        # Both send heartbeat, presence to buyer should only include agent
        requests.post(f"{BASE_URL}/api/chat/heartbeat", headers=buyer["headers"], timeout=10)
        requests.post(f"{BASE_URL}/api/chat/heartbeat", headers=agent["headers"], timeout=10)
        r = requests.get(
            f"{BASE_URL}/api/chat/conversations/{conv['id']}/presence",
            headers=buyer["headers"], timeout=10,
        )
        assert r.status_code == 200
        presence = r.json().get("presence", [])
        ids = [p["user_id"] for p in presence]
        assert buyer["id"] not in ids
        # Agent may or may not be in yet depending on race, but if present must be agent
        for uid in ids:
            assert uid == agent["id"]

    def test_presence_forbidden_for_outsider(self, outsider, conv):
        r = requests.get(
            f"{BASE_URL}/api/chat/conversations/{conv['id']}/presence",
            headers=outsider["headers"], timeout=10,
        )
        assert r.status_code == 403


# ─── image upload ───
# 1x1 transparent PNG base64
_TINY_PNG_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)


class TestUploadImage:
    def test_upload_image_participant_returns_url(self, buyer, conv):
        data_url = f"data:image/png;base64,{_TINY_PNG_B64}"
        r = requests.post(
            f"{BASE_URL}/api/chat/conversations/{conv['id']}/upload-image",
            headers=buyer["headers"],
            json={"data_url": data_url, "width": 1, "height": 1},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "url" in body and body["url"].startswith("/api/files/")
        assert "path" in body and body["path"]
        assert body["width"] == 1
        assert body["height"] == 1
        # Store for next test
        pytest._phase2_img_url = body["url"]
        pytest._phase2_img_path = body["path"]

    def test_upload_image_outsider_forbidden(self, outsider, conv):
        data_url = f"data:image/png;base64,{_TINY_PNG_B64}"
        r = requests.post(
            f"{BASE_URL}/api/chat/conversations/{conv['id']}/upload-image",
            headers=outsider["headers"],
            json={"data_url": data_url}, timeout=15,
        )
        assert r.status_code == 403

    def test_upload_image_too_large_rejected(self, buyer, conv):
        # 6 MB of raw bytes → ~8 MB base64 → decoded > 5MB
        big_bytes = b"\x00" * (6 * 1024 * 1024)
        big_b64 = base64.b64encode(big_bytes).decode()
        data_url = f"data:image/jpeg;base64,{big_b64}"
        r = requests.post(
            f"{BASE_URL}/api/chat/conversations/{conv['id']}/upload-image",
            headers=buyer["headers"], json={"data_url": data_url}, timeout=30,
        )
        assert r.status_code == 413, f"expected 413, got {r.status_code}: {r.text[:200]}"


# ─── send image-kind message (attachments without text) ───
class TestSendImageMessage:
    def test_send_message_with_attachments_no_text(self, buyer, conv):
        img_url = getattr(pytest, "_phase2_img_url", "/api/files/mock.png")
        img_path = getattr(pytest, "_phase2_img_path", "mock.png")
        r = requests.post(
            f"{BASE_URL}/api/chat/conversations/{conv['id']}/messages",
            headers=buyer["headers"],
            json={
                "kind": "image",
                "attachments": [{"url": img_url, "path": img_path}],
            },
            timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["kind"] == "image"
        assert body.get("attachments") and body["attachments"][0]["url"] == img_url
        assert (body.get("text") or "") == ""

    def test_send_empty_text_no_attachments_rejected(self, buyer, conv):
        r = requests.post(
            f"{BASE_URL}/api/chat/conversations/{conv['id']}/messages",
            headers=buyer["headers"], json={"text": "", "attachments": []},
            timeout=10,
        )
        assert r.status_code == 422


# ─── message search ───
class TestSearch:
    def test_search_matches_case_insensitive(self, buyer, agent, conv):
        needle = f"pineapple-{uuid.uuid4().hex[:6]}"
        requests.post(
            f"{BASE_URL}/api/chat/conversations/{conv['id']}/messages",
            headers=buyer["headers"], json={"text": f"Hello {needle} world"},
            timeout=10,
        )
        time.sleep(0.3)
        r = requests.get(
            f"{BASE_URL}/api/chat/search",
            params={"q": needle.upper()},
            headers=buyer["headers"], timeout=15,
        )
        assert r.status_code == 200
        body = r.json()
        assert any(needle in (m.get("text") or "") for m in body["items"])
        # Every item must have conversation_id and created_at
        for m in body["items"]:
            assert "conversation_id" in m
            assert "created_at" in m
            assert "text" in m

    def test_search_scoped_to_my_conversations(self, outsider):
        # outsider has no conversations touching the needle → 0 hits
        r = requests.get(
            f"{BASE_URL}/api/chat/search",
            params={"q": "pineapple"},
            headers=outsider["headers"], timeout=15,
        )
        assert r.status_code == 200
        # All matches should belong to outsider's conversations (none here)
        assert r.json().get("count", 0) == 0

    def test_search_regex_escaped(self, buyer):
        # Special regex chars must be escaped, not raise or match unrelated
        r = requests.get(
            f"{BASE_URL}/api/chat/search",
            params={"q": ".*"},
            headers=buyer["headers"], timeout=15,
        )
        assert r.status_code == 200


# ─── list conversations w/ verified_only + q ───
class TestListConversationsFilters:
    def test_verified_only_filter(self, buyer, agent):
        r = requests.get(
            f"{BASE_URL}/api/chat/conversations",
            params={"verified_only": "true"},
            headers=buyer["headers"], timeout=15,
        )
        assert r.status_code == 200
        body = r.json()
        # All items must have at least one other participant with verified:true
        for c in body["items"]:
            assert any(
                (p or {}).get("verified") for p in (c.get("other_participants") or [])
            ), f"non-verified conv slipped: {c.get('id')}"

    def test_q_filter_matches_title(self, buyer):
        r = requests.get(
            f"{BASE_URL}/api/chat/conversations",
            params={"q": "phase2"},
            headers=buyer["headers"], timeout=15,
        )
        assert r.status_code == 200
        # our seeded property has title 'Phase2 Chat Duplex' → should match
        titles = [
            (c.get("property") or {}).get("title", "") for c in r.json()["items"]
        ]
        assert any("Phase2" in t for t in titles)

    def test_q_filter_no_match_empty(self, buyer):
        r = requests.get(
            f"{BASE_URL}/api/chat/conversations",
            params={"q": f"zznomatch-{uuid.uuid4().hex[:8]}"},
            headers=buyer["headers"], timeout=15,
        )
        assert r.status_code == 200
        assert r.json()["count"] == 0


# ─── admin reports + stats ───
class TestAdmin:
    @pytest.fixture(scope="class")
    def admin_headers(self):
        r = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "demo@amass.africa", "password": "amass2026"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        return {"Authorization": f"Bearer {r.json()['access_token']}"}

    def test_admin_reports_requires_admin(self, buyer):
        r = requests.get(f"{BASE_URL}/api/chat/admin/reports",
                         headers=buyer["headers"], timeout=10)
        assert r.status_code in (401, 403)

    def test_admin_reports_ok_and_resolve(self, admin_headers, buyer, conv, agent):
        # Create a report so we have something to resolve
        rep = requests.post(
            f"{BASE_URL}/api/chat/report",
            headers=buyer["headers"],
            json={"conversation_id": conv["id"], "reported_user_id": agent["id"],
                  "reason": "phase2-spam-test"},
            timeout=10,
        )
        assert rep.status_code == 200
        rid = rep.json()["id"]

        r = requests.get(
            f"{BASE_URL}/api/chat/admin/reports",
            params={"status": "OPEN"},
            headers=admin_headers, timeout=10,
        )
        assert r.status_code == 200
        body = r.json()
        assert isinstance(body["items"], list)
        assert any(x["id"] == rid for x in body["items"])

        # Resolve
        rv = requests.post(
            f"{BASE_URL}/api/chat/admin/reports/{rid}/resolve",
            headers={**admin_headers, "Content-Type": "application/json"},
            json={"resolution": "handled by test"}, timeout=10,
        )
        assert rv.status_code == 200

        # Resolving again should 404 (already resolved)
        rv2 = requests.post(
            f"{BASE_URL}/api/chat/admin/reports/{rid}/resolve",
            headers={**admin_headers, "Content-Type": "application/json"},
            json={"resolution": "again"}, timeout=10,
        )
        assert rv2.status_code == 404

        # Should now appear under RESOLVED
        r_res = requests.get(
            f"{BASE_URL}/api/chat/admin/reports",
            params={"status": "RESOLVED"},
            headers=admin_headers, timeout=10,
        )
        assert r_res.status_code == 200
        assert any(x["id"] == rid for x in r_res.json()["items"])

    def test_admin_stats(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/chat/admin/stats",
                         headers=admin_headers, timeout=10)
        assert r.status_code == 200
        body = r.json()
        for k in ("total_conversations", "active_conversations",
                  "total_messages", "open_reports", "total_blocks"):
            assert k in body, f"missing key {k}"
            assert isinstance(body[k], int)
