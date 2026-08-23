"""AMASS Phase D-9 + D-10 — Property Type Colours + Notifications.

D-9 is mostly a frontend concern (the palette lives in property_types + is
resolved in `usePropertyTypes`), so we only guard the backend contract here:
the /api/property-types endpoint still returns colors matching the D-1 spec.

D-10 covers notifications:
  • verification-win notification → agent's inbox
  • fraud-flag notification → admin(s) inbox
  • task-assigned notification → agents in matching territory (via territory)
"""
import os
import uuid
import asyncio
from datetime import datetime, timezone

import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient

BASE_URL = os.environ.get(
    "EXPO_BACKEND_URL", "https://property-os-africa.preview.emergentagent.com"
).rstrip("/")
DEMO_EMAIL = "demo@amass.africa"
DEMO_PASSWORD = "amass2026"
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "amass_db")


@pytest.fixture(scope="module")
def admin_headers():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}",
            "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def agent_headers():
    email = f"d10_agent_{uuid.uuid4().hex[:6]}@example.com"
    pwd = "TestPass123!"
    rr = requests.post(f"{BASE_URL}/api/auth/register",
                       json={"email": email, "password": pwd, "full_name": "D10 Agent"})
    assert rr.status_code == 200
    return {"Authorization": f"Bearer {rr.json()['access_token']}",
            "Content-Type": "application/json"}


# ─── D-9 palette contract ───────────────────────────────────────
def test_property_types_expose_hex_colors():
    r = requests.get(f"{BASE_URL}/api/property-types")
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, list) and len(body) >= 5
    for t in body:
        assert "slug" in t and "color" in t and "icon" in t
        assert isinstance(t["color"], str) and t["color"].startswith("#")
        assert len(t["color"]) == 7


# ─── D-10 notification helpers ──────────────────────────────────
def _run(coro_factory):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro_factory())
    finally:
        loop.close()


async def _seed_candidate() -> str:
    cli = AsyncIOMotorClient(MONGO_URL)
    db = cli[DB_NAME]
    try:
        cid = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        await db.property_candidates.insert_one({
            "id": cid, "source_type": "GOOGLE_PLACES",
            "google_place_id": f"synth_{cid[:12]}",
            "candidate_type": "PROPERTY", "status": "UNVERIFIED",
            "name": f"D10 {cid[:6]}", "address": "Test Ave, Lagos",
            "latitude": 6.44, "longitude": 3.475,
            "location": {"type": "Point", "coordinates": [3.475, 6.44]},
            "google_types": ["premise"], "duplicate_score": 0,
            "duplicate_matches": [],
            "created_at": now, "updated_at": now, "discovered_at": now,
        })
        return cid
    finally:
        cli.close()


def _seed() -> str:
    return _run(_seed_candidate)


def _promote(admin_headers, cid):
    r = requests.post(
        f"{BASE_URL}/api/admin/discovery/candidates/{cid}/promote",
        headers=admin_headers,
        json={"force_new": True, "verified_address": {"state": "Lagos", "lga": "Eti-Osa"}},
    )
    assert r.status_code == 200
    return r.json()


def _get_task(admin_headers, amass_id):
    rr = requests.get(f"{BASE_URL}/api/admin/verification-tasks?limit=200",
                      headers=admin_headers)
    assert rr.status_code == 200
    for t in rr.json()["items"]:
        if t["amass_property_id"] == amass_id and t["status"] != "CANCELLED":
            return t
    raise AssertionError("task not found")


def _set_territory(headers, state="Lagos", lgas=("Eti-Osa",)):
    r = requests.put(
        f"{BASE_URL}/api/agent/territory/me", headers=headers,
        json={"state": state, "lgas": list(lgas), "is_active": True},
    )
    assert r.status_code == 200


def _notifications(headers, kind_filter=None):
    r = requests.get(f"{BASE_URL}/api/notifications", headers=headers)
    assert r.status_code == 200, r.text
    items = r.json().get("items", [])
    if kind_filter:
        items = [n for n in items if n.get("kind") == kind_filter]
    return items


# ─── D-10 tests ──────────────────────────────────────────────────
def test_verification_win_notification(admin_headers, agent_headers):
    _set_territory(agent_headers)
    amass_id = _promote(admin_headers, _seed())["amass_property_id"]
    task = _get_task(admin_headers, amass_id)
    # Claim + verify
    c = requests.post(
        f"{BASE_URL}/api/agent/verification-tasks/{task['id']}/claim",
        headers=agent_headers,
    )
    assert c.status_code == 200
    v = requests.post(
        f"{BASE_URL}/api/agent/verification-tasks/{task['id']}/verify",
        headers=agent_headers,
        json={"verdict": "PROPERTY_EXISTS", "latitude": 6.44, "longitude": 3.475,
              "accuracy_meters": 8, "notes": "d10 wins",
              "photo_data_url": "data:image/jpeg;base64,/9j/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AKmgD/9k="},
    )
    assert v.status_code == 200
    # Agent should have a VERIFICATION_WIN in their inbox
    wins = _notifications(agent_headers, kind_filter="VERIFICATION_WIN")
    assert wins, "agent did not receive VERIFICATION_WIN"
    assert any(n["meta"].get("amass_property_id") == amass_id for n in wins)


def test_fraud_flag_notification_reaches_admin(admin_headers, agent_headers):
    _set_territory(agent_headers)
    amass_id = _promote(admin_headers, _seed())["amass_property_id"]
    task = _get_task(admin_headers, amass_id)
    requests.post(
        f"{BASE_URL}/api/agent/verification-tasks/{task['id']}/claim",
        headers=agent_headers,
    )
    # Verify with high drift + no photo → 2 flags raised
    requests.post(
        f"{BASE_URL}/api/agent/verification-tasks/{task['id']}/verify",
        headers=agent_headers,
        json={"verdict": "PROPERTY_EXISTS",
              "latitude": 6.4460, "longitude": 3.475,   # 600m north
              "accuracy_meters": 80,                     # LOW_GPS_ACCURACY too
              "notes": "d10 fraud"},
    )
    # Admin should have received a FRAUD_FLAG_RAISED notification
    admin_notes = _notifications(admin_headers, kind_filter="FRAUD_FLAG_RAISED")
    assert admin_notes, "admin did not receive FRAUD_FLAG_RAISED"
    assert any(n["meta"].get("amass_property_id") == amass_id for n in admin_notes)


def test_task_assigned_notification_reaches_matching_agent(admin_headers, agent_headers):
    # Agent has territory Lagos/Eti-Osa
    _set_territory(agent_headers)
    # Promote a new candidate — auto-creates task in Lagos/Eti-Osa
    amass_id = _promote(admin_headers, _seed())["amass_property_id"]
    # Agent should have received a VERIFICATION_TASK_ASSIGNED note
    notes = _notifications(agent_headers, kind_filter="VERIFICATION_TASK_ASSIGNED")
    assert notes, "agent did not receive VERIFICATION_TASK_ASSIGNED"
    assert any(n["meta"].get("amass_property_id") == amass_id for n in notes)


def test_task_assigned_skipped_for_wrong_territory(admin_headers, agent_headers):
    # Agent sets territory in Kano → new Lagos task should NOT notify
    _set_territory(agent_headers, state="Kano", lgas=("Nassarawa",))
    before = _notifications(agent_headers, kind_filter="VERIFICATION_TASK_ASSIGNED")
    _promote(admin_headers, _seed())  # creates task in Lagos
    after = _notifications(agent_headers, kind_filter="VERIFICATION_TASK_ASSIGNED")
    assert len(after) == len(before), "agent got a task assignment for wrong state"
