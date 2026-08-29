"""AMASS In-App Chat — Phase 1 backend tests."""
import os, uuid, asyncio, time
from datetime import datetime, timezone
import pytest, requests
from motor.motor_asyncio import AsyncIOMotorClient

BASE_URL = os.environ.get(
    "EXPO_BACKEND_URL", "https://property-os-africa.preview.emergentagent.com"
).rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "amass_db")


def _mkuser(role="buyer"):
    email = f"chat_{role}_{uuid.uuid4().hex[:6]}@example.com"
    pwd = "TestPass123!"
    r = requests.post(f"{BASE_URL}/api/auth/register",
                      json={"email": email, "password": pwd, "full_name": f"Chat {role.title()}"})
    assert r.status_code == 200, r.text
    return {
        "email": email,
        "id": r.json()["user"]["id"],
        "headers": {"Authorization": f"Bearer {r.json()['access_token']}",
                    "Content-Type": "application/json"},
    }


@pytest.fixture(scope="module")
def buyer(): return _mkuser("buyer")


@pytest.fixture(scope="module")
def agent(): return _mkuser("agent")


@pytest.fixture(scope="module")
def outsider(): return _mkuser("outsider")


def _run(f):
    loop = asyncio.new_event_loop()
    try: return loop.run_until_complete(f())
    finally: loop.close()


async def _seed_property_async(agent_id: str) -> str:
    cli = AsyncIOMotorClient(MONGO_URL)
    db = cli[DB_NAME]
    try:
        pid = str(uuid.uuid4())
        await db.properties.insert_one({
            "id": pid, "title": "Chat Test Duplex",
            "location": "Victoria Island, Lagos", "price": 250_000_000,
            "listing_type": "sale", "property_type": "residential",
            "images": ["https://example.com/img.jpg"], "agent_id": agent_id,
            "agent_name": "Test Agent", "verified": True,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        })
        return pid
    finally: cli.close()


@pytest.fixture(scope="module")
def property_id(agent):
    return _run(lambda: _seed_property_async(agent["id"]))


# ─── Start / duplicate handling ───
def test_start_from_property_creates_thread(buyer, agent, property_id):
    r = requests.post(
        f"{BASE_URL}/api/chat/conversations/from-property/{property_id}",
        headers=buyer["headers"],
    )
    assert r.status_code == 200, r.text
    c = r.json()
    assert c["property_id"] == property_id
    assert set(c["participant_ids"]) == {buyer["id"], agent["id"]}


def test_start_from_property_is_idempotent(buyer, property_id):
    r1 = requests.post(f"{BASE_URL}/api/chat/conversations/from-property/{property_id}",
                       headers=buyer["headers"])
    r2 = requests.post(f"{BASE_URL}/api/chat/conversations/from-property/{property_id}",
                       headers=buyer["headers"])
    assert r1.json()["id"] == r2.json()["id"]


def test_agent_cannot_start_chat_with_themselves(agent, property_id):
    r = requests.post(f"{BASE_URL}/api/chat/conversations/from-property/{property_id}",
                      headers=agent["headers"])
    assert r.status_code == 400


# ─── Auth + participant scoping ───
def test_outsider_cannot_access_conversation(buyer, outsider, property_id):
    c = requests.post(f"{BASE_URL}/api/chat/conversations/from-property/{property_id}",
                      headers=buyer["headers"]).json()
    r = requests.get(f"{BASE_URL}/api/chat/conversations/{c['id']}",
                     headers=outsider["headers"])
    assert r.status_code == 403


def test_outsider_cannot_send(buyer, outsider, property_id):
    c = requests.post(f"{BASE_URL}/api/chat/conversations/from-property/{property_id}",
                      headers=buyer["headers"]).json()
    r = requests.post(f"{BASE_URL}/api/chat/conversations/{c['id']}/messages",
                     headers=outsider["headers"], json={"text": "hi"})
    assert r.status_code == 403


# ─── Send + idempotency ───
def test_send_and_list_messages(buyer, agent, property_id):
    c = requests.post(f"{BASE_URL}/api/chat/conversations/from-property/{property_id}",
                      headers=buyer["headers"]).json()
    r = requests.post(f"{BASE_URL}/api/chat/conversations/{c['id']}/messages",
                     headers=buyer["headers"],
                     json={"text": "Hello from buyer", "client_msg_id": "cid-1"})
    assert r.status_code == 200
    msg1 = r.json()
    # Second send with same client_msg_id — should return same message id
    r2 = requests.post(f"{BASE_URL}/api/chat/conversations/{c['id']}/messages",
                       headers=buyer["headers"],
                       json={"text": "Hello from buyer (dupe)", "client_msg_id": "cid-1"})
    assert r2.json()["id"] == msg1["id"]

    # Agent replies + both see both messages
    requests.post(f"{BASE_URL}/api/chat/conversations/{c['id']}/messages",
                  headers=agent["headers"], json={"text": "Hi buyer 👋"})
    msgs = requests.get(f"{BASE_URL}/api/chat/conversations/{c['id']}/messages",
                        headers=buyer["headers"]).json()["items"]
    assert len(msgs) >= 2
    assert any(m["text"] == "Hello from buyer" for m in msgs)
    assert any(m["text"] == "Hi buyer 👋" for m in msgs)


# ─── Unread + mark-read ───
def test_unread_count_flow(buyer, agent, property_id):
    c = requests.post(f"{BASE_URL}/api/chat/conversations/from-property/{property_id}",
                      headers=buyer["headers"]).json()
    # Buyer marks read to zero their side
    requests.post(f"{BASE_URL}/api/chat/conversations/{c['id']}/read", headers=buyer["headers"])
    time.sleep(0.1)  # ensure agent's message timestamp > last_read
    # Agent sends
    requests.post(f"{BASE_URL}/api/chat/conversations/{c['id']}/messages",
                  headers=agent["headers"], json={"text": "buyer, unread me"})
    unread = requests.get(f"{BASE_URL}/api/chat/unread-count", headers=buyer["headers"]).json()
    assert unread["unread_count"] >= 1
    # Read
    requests.post(f"{BASE_URL}/api/chat/conversations/{c['id']}/read", headers=buyer["headers"])
    time.sleep(0.4)
    zeroed = requests.get(f"{BASE_URL}/api/chat/unread-count", headers=buyer["headers"]).json()
    # Some background messages from other tests may leak — assert this one is zero
    conv = requests.get(f"{BASE_URL}/api/chat/conversations/{c['id']}", headers=buyer["headers"]).json()
    assert conv["unread_count"] == 0


# ─── Notifications ───
def test_recipient_gets_notification(buyer, agent, property_id):
    c = requests.post(f"{BASE_URL}/api/chat/conversations/from-property/{property_id}",
                      headers=buyer["headers"]).json()
    unique = f"unique-{uuid.uuid4().hex[:6]}"
    requests.post(f"{BASE_URL}/api/chat/conversations/{c['id']}/messages",
                  headers=buyer["headers"], json={"text": unique})
    time.sleep(0.5)
    notes = requests.get(f"{BASE_URL}/api/notifications", headers=agent["headers"]).json()
    items = notes.get("items", [])
    assert any(n.get("kind") == "NEW_MESSAGE" and unique in (n.get("body") or "") for n in items)


# ─── Block ───
def test_block_prevents_send(buyer, agent, property_id):
    c = requests.post(f"{BASE_URL}/api/chat/conversations/from-property/{property_id}",
                      headers=buyer["headers"]).json()
    # Buyer blocks agent
    b = requests.post(f"{BASE_URL}/api/chat/block/{agent['id']}", headers=buyer["headers"])
    assert b.status_code == 200
    r = requests.post(f"{BASE_URL}/api/chat/conversations/{c['id']}/messages",
                     headers=agent["headers"], json={"text": "should fail"})
    assert r.status_code == 403
    # Unblock and try again
    requests.delete(f"{BASE_URL}/api/chat/block/{agent['id']}", headers=buyer["headers"])
    r2 = requests.post(f"{BASE_URL}/api/chat/conversations/{c['id']}/messages",
                       headers=agent["headers"], json={"text": "after unblock"})
    assert r2.status_code == 200


# ─── Report ───
def test_report_conversation(buyer, agent, property_id):
    c = requests.post(f"{BASE_URL}/api/chat/conversations/from-property/{property_id}",
                      headers=buyer["headers"]).json()
    r = requests.post(f"{BASE_URL}/api/chat/report",
                     headers=buyer["headers"],
                     json={"conversation_id": c["id"], "reported_user_id": agent["id"],
                           "reason": "spam"})
    assert r.status_code == 200


# ─── Long-poll ───
def test_long_poll_returns_new_message(buyer, agent, property_id):
    c = requests.post(f"{BASE_URL}/api/chat/conversations/from-property/{property_id}",
                      headers=buyer["headers"]).json()
    after = datetime.now(timezone.utc).isoformat()
    from urllib.parse import quote
    after_q = quote(after, safe="")
    # Poll in a thread; send from another in parallel
    import threading
    result: dict = {}
    def _poll():
        try:
            r = requests.get(
                f"{BASE_URL}/api/chat/conversations/{c['id']}/updates?after={after_q}&wait_ms=5000",
                headers=buyer["headers"], timeout=15,
            )
            result["body"] = r.json()
        except Exception as e:
            result["err"] = str(e)
    t = threading.Thread(target=_poll); t.start()
    time.sleep(1.0)
    requests.post(f"{BASE_URL}/api/chat/conversations/{c['id']}/messages",
                  headers=agent["headers"], json={"text": "poll-me!"})
    t.join(timeout=10)
    assert result.get("body") is not None, f"long-poll didn't return json: {result}"
    body = result["body"]
    assert "items" in body, f"unexpected body: {body}"
    assert any(m["text"] == "poll-me!" for m in body["items"])


# ─── Invalid inputs ───
def test_empty_message_rejected(buyer, property_id):
    c = requests.post(f"{BASE_URL}/api/chat/conversations/from-property/{property_id}",
                      headers=buyer["headers"]).json()
    r = requests.post(f"{BASE_URL}/api/chat/conversations/{c['id']}/messages",
                     headers=buyer["headers"], json={"text": ""})
    assert r.status_code == 422


def test_property_not_found(buyer):
    r = requests.post(f"{BASE_URL}/api/chat/conversations/from-property/does-not-exist",
                     headers=buyer["headers"])
    assert r.status_code == 404


# ─── Admin ───
def test_admin_stats_and_reports_require_admin(buyer):
    r = requests.get(f"{BASE_URL}/api/chat/admin/stats", headers=buyer["headers"])
    assert r.status_code in (401, 403)
    r2 = requests.get(f"{BASE_URL}/api/chat/admin/reports", headers=buyer["headers"])
    assert r2.status_code in (401, 403)


def test_admin_stats_ok_for_admin():
    admin = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": "demo@amass.africa", "password": "amass2026"})
    h = {"Authorization": f"Bearer {admin.json()['access_token']}"}
    r = requests.get(f"{BASE_URL}/api/chat/admin/stats", headers=h)
    assert r.status_code == 200
    body = r.json()
    for k in ("total_conversations", "active_conversations", "total_messages",
              "open_reports", "total_blocks"):
        assert k in body
