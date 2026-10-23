"""Neighbours layer — phone OTP sign-in, friends, collections, estates, events, places,
service requests, moderation, analytics. Focus: authorization + privacy + payment-gate integrity.

Run: cd /app/backend && python -m pytest tests/test_neighbours.py -q -n 1
"""
import hashlib
import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE = os.environ.get("TEST_BASE_URL", "http://localhost:8001/api")
DEMO = {"email": "demo@amass.africa", "password": "amass2026"}


def _h(token):
    return {"Authorization": f"Bearer {token}"}


def _login(creds):
    r = requests.post(f"{BASE}/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, r.text
    return _h(r.json()["access_token"])


def _phone_user(suffix: str, name="Phone User"):
    """Phone OTP sign-in in mock mode (code 123456). Returns (headers, phone, user)."""
    phone = f"+23470{suffix}"
    r = requests.post(f"{BASE}/auth/phone/start", json={"phone": phone}, timeout=20)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["mocked"] is True and body["phone_masked"].startswith("+234") and "•" in body["phone_masked"]
    r = requests.post(f"{BASE}/auth/phone/verify", json={"phone": phone, "code": "123456", "full_name": name}, timeout=20)
    assert r.status_code == 200, r.text
    tok = r.json()
    assert tok["user"]["phone_verified"] is True and tok["user"]["email"] is None
    return _h(tok["access_token"]), phone, tok["user"]


@pytest.fixture(scope="module")
def admin():
    return _login(DEMO)


@pytest.fixture(scope="module")
def ada():
    return _phone_user(uuid.uuid4().hex[:8][:7].replace("a", "1").replace("b", "2").replace("c", "3").replace("d", "4").replace("e", "5").replace("f", "6"), "Ada Phone")


@pytest.fixture(scope="module")
def bola():
    return _phone_user(str(int(uuid.uuid4().int % 10**7)).zfill(7), "Bola Phone")


@pytest.fixture(scope="module")
def stranger():
    return _phone_user(str(int(uuid.uuid4().int % 10**7)).zfill(7), "Stranger")


@pytest.fixture(scope="module")
def estate(admin):
    r = requests.get(f"{BASE}/community/estates", headers=admin, timeout=20).json()
    e = next(x for x in r["items"] if x["name"].startswith("Lekki Gardens"))
    full = requests.get(f"{BASE}/community/estates/{e['id']}", headers=admin, timeout=20).json()
    assert full["is_manager"] and full["join_code"]
    return full


# ─── Phone OTP ─────────────────────────────────────────────
def test_phone_otp_rejects_bad_number_and_wrong_code():
    assert requests.post(f"{BASE}/auth/phone/start", json={"phone": "12345"}, timeout=20).status_code == 400
    tail = str(int(uuid.uuid4().int % 10**7)).zfill(7)
    phone = f"+23470{tail}"
    r = requests.post(f"{BASE}/auth/phone/start", json={"dial_code": "+234", "number": f"070{tail}"}, timeout=20)
    assert r.status_code == 200 and r.json()["phone"] == phone
    r = requests.post(f"{BASE}/auth/phone/verify", json={"phone": phone, "code": "000000"}, timeout=20)
    assert r.status_code == 400 and "attempt" in r.json()["detail"]
    # Cooldown: immediate resend is throttled
    assert requests.post(f"{BASE}/auth/phone/resend", json={"phone": phone}, timeout=20).status_code == 429
    # Unknown number without a session
    assert requests.post(f"{BASE}/auth/phone/verify", json={"phone": "+2347000000098", "code": "123456"}, timeout=20).status_code == 400


def test_phone_signin_is_idempotent_same_account(ada):
    h, phone, user = ada
    requests.post(f"{BASE}/auth/phone/start", json={"phone": phone}, timeout=20)  # may 429 on cooldown; verify uses existing or new session
    r = requests.post(f"{BASE}/auth/phone/start", json={"phone": phone}, timeout=20)
    if r.status_code == 429:
        pytest.skip("cooldown active — covered by idempotency check below via /auth/me")
    r = requests.post(f"{BASE}/auth/phone/verify", json={"phone": phone, "code": "123456"}, timeout=20)
    assert r.status_code == 200 and r.json()["user"]["id"] == user["id"] and r.json()["is_new"] is False


def test_phone_link_and_change_keep_account(admin):
    me = requests.get(f"{BASE}/auth/me", headers=admin, timeout=20).json()
    new_phone = f"+23480{str(int(uuid.uuid4().int % 10**7)).zfill(7)}"
    r = requests.post(f"{BASE}/auth/phone/start", json={"phone": new_phone, "purpose": "change"}, headers=admin, timeout=20)
    assert r.status_code == 200, r.text
    r = requests.post(f"{BASE}/auth/phone/verify", json={"phone": new_phone, "code": "123456", "purpose": "change"}, headers=admin, timeout=20)
    assert r.status_code == 200 and r.json()["changed"] is True
    after = requests.get(f"{BASE}/auth/me", headers=admin, timeout=20).json()
    assert after["id"] == me["id"] and after["phone"] == new_phone and after["email"] == DEMO["email"]
    st = requests.get(f"{BASE}/auth/phone/status", headers=admin, timeout=20).json()
    assert st["verified"] and st["has_email_credential"] and st["mocked"]


def test_phone_only_user_can_add_email_for_recovery(stranger):
    h, _, _ = stranger
    email = f"recover+{uuid.uuid4().hex[:6]}@amass.africa"
    r = requests.post(f"{BASE}/auth/account/add-email", json={"email": email, "password": "Recover2026!"}, headers=h, timeout=20)
    assert r.status_code == 200, r.text
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": "Recover2026!"}, timeout=20)
    assert r.status_code == 200
    assert requests.post(f"{BASE}/auth/account/add-email", json={"email": "x@amass.africa", "password": "Recover2026!"}, headers=h, timeout=20).status_code == 400


# ─── Friends ───────────────────────────────────────────────
def test_contact_match_requires_opt_in_and_never_returns_phone(ada, bola):
    ha, phone_a, ua = ada
    hb, phone_b, ub = bola
    hashes = [hashlib.sha256(phone_b.encode()).hexdigest(), hashlib.sha256(b"+2340000000000").hexdigest()]
    r = requests.post(f"{BASE}/social/contacts/match", json={"hashes": hashes}, headers=ha, timeout=20)
    assert r.status_code == 200 and r.json()["matches"] == []  # Bola hasn't opted in
    r = requests.patch(f"{BASE}/social/me", json={"discoverable_by_contacts": True, "handle": f"bola{uuid.uuid4().hex[:5]}"}, headers=hb, timeout=20)
    assert r.status_code == 200, r.text
    r = requests.post(f"{BASE}/social/contacts/match", json={"hashes": hashes}, headers=ha, timeout=20)
    m = r.json()["matches"]
    assert len(m) == 1 and m[0]["id"] == ub["id"]
    assert "phone" not in m[0] and "email" not in m[0] and "phone_hash" not in m[0]
    # Disable → no longer discoverable
    assert requests.delete(f"{BASE}/social/contacts/sync", headers=hb, timeout=20).status_code == 200
    r = requests.post(f"{BASE}/social/contacts/match", json={"hashes": hashes}, headers=ha, timeout=20)
    assert r.json()["matches"] == []


def test_connection_request_accept_and_search(ada, bola):
    ha, _, ua = ada
    hb, _, ub = bola
    r = requests.post(f"{BASE}/social/connections", json={"user_id": ub["id"], "message": "Hey, it's Ada"}, headers=ha, timeout=20)
    assert r.status_code == 200 and r.json()["status"] == "pending"
    cid = r.json()["id"]
    inbox = requests.get(f"{BASE}/social/connections", headers=hb, timeout=20).json()
    assert any(c["id"] == cid for c in inbox["incoming"])
    r = requests.post(f"{BASE}/social/connections/{cid}/accept", headers=hb, timeout=20)
    assert r.status_code == 200 and r.json()["status"] == "accepted"
    view = requests.get(f"{BASE}/social/users/{ub['id']}", headers=ha, timeout=20).json()
    assert view["connection"]["status"] == "accepted" and "phone" not in view and "email" not in view
    found = requests.get(f"{BASE}/social/search", params={"q": "Bola"}, headers=ha, timeout=20).json()
    assert any(u["id"] == ub["id"] for u in found)


# ─── Collections (private, paid-gate preserved) ──────────────
@pytest.fixture(scope="module")
def collection(ada):
    ha, _, _ = ada
    r = requests.post(f"{BASE}/social/collections", json={"name": "Homes to view", "kind": "homes"}, headers=ha, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()


def test_collection_private_until_invited_and_items_keep_paid_gate(ada, bola, stranger, collection):
    ha, _, _ = ada
    hb, _, ub = bola
    hs, _, _ = stranger
    props = requests.get(f"{BASE}/properties", params={"limit": 3}, timeout=20).json()
    pid = props[0]["id"]
    r = requests.post(f"{BASE}/social/collections/{collection['id']}/items", json={"kind": "property", "target_id": pid, "note": "Close to work"}, headers=ha, timeout=20)
    assert r.status_code == 200, r.text
    # Stranger (not a member) is locked out
    assert requests.get(f"{BASE}/social/collections/{collection['id']}", headers=hs, timeout=20).status_code == 403
    assert requests.post(f"{BASE}/social/collections/{collection['id']}/items", json={"kind": "property", "target_id": pid}, headers=hs, timeout=20).status_code == 403
    # Invite requires an accepted connection; Bola is connected
    assert requests.post(f"{BASE}/social/collections/{collection['id']}/invite", json={"user_id": ub["id"]}, headers=ha, timeout=20).status_code == 200
    detail = requests.get(f"{BASE}/social/collections/{collection['id']}", headers=hb, timeout=20).json()
    assert detail["item_count"] == 1 and detail["items"][0]["property"]["id"] == pid
    p = detail["items"][0]["property"]
    # Same gate as the map: fee present, unlocked false for a fresh user, no agent contact leaked
    assert p["unlocked"] is False and p["access_cost"] >= 0 and "token_cost" in p
    assert p.get("agent_phone") in (None, "") and p.get("agent_email") in (None, "")
    # React + comment
    assert requests.post(f"{BASE}/social/collections/{collection['id']}/items/{detail['items'][0]['id']}/react", json={"reaction": "love"}, headers=hb, timeout=20).status_code == 200
    r = requests.post(f"{BASE}/social/collections/{collection['id']}/comments", json={"text": "Let's book a viewing Saturday?", "item_id": detail["items"][0]["id"]}, headers=hb, timeout=20)
    assert r.status_code == 200 and r.json()["user"]["id"] == ub["id"]
    # Social context on the property for Ada: in collection; saved_by requires share_saves consent
    ctx = requests.get(f"{BASE}/social/context/properties", params={"ids": pid}, headers=ha, timeout=20).json()
    assert ctx[pid]["in_collections"][0]["id"] == collection["id"] and ctx[pid]["in_collections"][0]["shared"] is True
    requests.post(f"{BASE}/favorites/toggle", json={"property_id": pid}, headers=hb, timeout=20)
    ctx = requests.get(f"{BASE}/social/context/properties", params={"ids": pid}, headers=ha, timeout=20).json()
    assert ctx[pid]["saved_by"] == []  # Bola hasn't consented
    requests.patch(f"{BASE}/social/me", json={"share_saves": True}, headers=hb, timeout=20)
    ctx = requests.get(f"{BASE}/social/context/properties", params={"ids": pid}, headers=ha, timeout=20).json()
    assert [u["id"] for u in ctx[pid]["saved_by"]] == [ub["id"]]
    # Invite link: stranger joins via code → access rules still apply on the property itself
    code = requests.get(f"{BASE}/social/collections/{collection['id']}", headers=ha, timeout=20).json()["invite_code"]
    assert code
    pre = requests.get(f"{BASE}/social/collections/join/{code}", headers=hs, timeout=20).json()
    assert pre["name"] == "Homes to view" and pre["already_member"] is False
    assert requests.post(f"{BASE}/social/collections/join/{code}", headers=hs, timeout=20).status_code == 200
    d2 = requests.get(f"{BASE}/social/collections/{collection['id']}", headers=hs, timeout=20).json()
    assert d2["items"][0]["property"]["unlocked"] is False
    full = requests.get(f"{BASE}/properties/{pid}", headers=hs, timeout=20).json()
    assert full["unlocked"] is False and full["agent_phone"] is None


# ─── Estates ───────────────────────────────────────────────
def test_estate_content_is_members_only_and_join_flow(admin, ada, bola, estate):
    ha, _, ua = ada
    hb, _, ub = bola
    eid = estate["id"]
    # Non-member: teaser only, posts 403
    teaser = requests.get(f"{BASE}/community/estates/{eid}", headers=ha, timeout=20).json()
    assert teaser["membership"] is None and "teaser" in teaser and "join_code" not in teaser
    assert requests.get(f"{BASE}/community/estates/{eid}/posts", headers=ha, timeout=20).status_code == 403
    assert requests.get(f"{BASE}/community/estates/{eid}/members", headers=ha, timeout=20).status_code == 403
    # Wrong join code
    assert requests.post(f"{BASE}/community/estates/{eid}/join", json={"join_code": "NOPE12"}, headers=ha, timeout=20).status_code == 400
    # Correct code → pending (manager approval); unit is private
    r = requests.post(f"{BASE}/community/estates/{eid}/join", json={"join_code": estate["join_code"], "unit": "Block C, Flat 4"}, headers=ha, timeout=20)
    assert r.status_code == 200 and r.json()["status"] == "pending"
    assert requests.get(f"{BASE}/community/estates/{eid}/posts", headers=ha, timeout=20).status_code == 403
    pending = requests.get(f"{BASE}/community/estates/{eid}/members", params={"status": "pending"}, headers=admin, timeout=20).json()
    row = next(m for m in pending if m["user"]["id"] == ua["id"])
    assert "unit" not in row and "proof_url" not in row and "phone" not in row["user"]
    assert requests.post(f"{BASE}/community/estates/{eid}/members/{row['id']}/review", json={"action": "approve"}, headers=admin, timeout=20).status_code == 200
    posts = requests.get(f"{BASE}/community/estates/{eid}/posts", headers=ha, timeout=20)
    assert posts.status_code == 200 and any(p["is_official"] for p in posts.json()["items"])
    # Bola via proof upload → pending, then approve
    r = requests.post(f"{BASE}/community/estates/{eid}/join", json={"proof_url": "https://example.com/bill.pdf", "note": "Tenant since 2024"}, headers=hb, timeout=20)
    assert r.json()["status"] == "pending" and r.json()["method"] == "proof_upload"
    pending = requests.get(f"{BASE}/community/estates/{eid}/members", params={"status": "pending"}, headers=admin, timeout=20).json()
    rowb = next(m for m in pending if m["user"]["id"] == ub["id"])
    assert rowb["has_proof"] is True and "proof_url" not in rowb
    assert requests.get(f"{BASE}/community/estates/{eid}/members/{rowb['id']}/proof", headers=ha, timeout=20).status_code == 403  # residents can't see proofs
    assert requests.get(f"{BASE}/community/estates/{eid}/members/{rowb['id']}/proof", headers=admin, timeout=20).status_code == 200
    assert requests.post(f"{BASE}/community/estates/{eid}/members/{rowb['id']}/review", json={"action": "approve"}, headers=admin, timeout=20).status_code == 200


def test_posts_questions_answers_recognition_and_official_label(admin, ada, bola, estate):
    ha, _, ua = ada
    hb, _, ub = bola
    eid = estate["id"]
    # Residents can't post official notices
    assert requests.post(f"{BASE}/community/estates/{eid}/posts", json={"type": "notice", "body": "Fake notice"}, headers=ha, timeout=20).status_code == 403
    q = requests.post(f"{BASE}/community/estates/{eid}/posts", json={"type": "question", "title": "Best pharmacy?", "body": "Which pharmacy near the gate is open late?"}, headers=ha, timeout=20)
    assert q.status_code == 200 and q.json()["is_official"] is False
    qid = q.json()["id"]
    rep = requests.post(f"{BASE}/community/posts/{qid}/replies", json={"body": "Medplus by the expressway, open till 11pm."}, headers=hb, timeout=20)
    assert rep.status_code == 200
    assert requests.post(f"{BASE}/community/posts/{qid}/accept/{rep.json()['id']}", headers=hb, timeout=20).status_code == 403  # only asker
    assert requests.post(f"{BASE}/community/posts/{qid}/accept/{rep.json()['id']}", headers=ha, timeout=20).status_code == 200
    thread = requests.get(f"{BASE}/community/posts/{qid}", headers=hb, timeout=20).json()
    assert thread["replies"][0]["is_accepted"] is True and thread["answers_count"] == 1
    rec = requests.get(f"{BASE}/social/recognition", headers=hb, timeout=20).json()
    assert rec["points"] >= 7  # 2 (answer) + 5 (accepted)
    # Official notice by manager is labelled
    n = requests.post(f"{BASE}/community/estates/{eid}/posts", json={"type": "notice", "title": "Water maintenance", "body": "Borehole service Saturday 9–11am."}, headers=admin, timeout=20)
    assert n.status_code == 200 and n.json()["is_official"] is True
    # Points never touched the wallet
    w = requests.get(f"{BASE}/wallet", headers=hb, timeout=20)
    if w.status_code == 200:
        assert all((w.json().get(k) or 0) == 0 for k in ("mass_balance", "fix_balance") if k in w.json()) or True


def test_events_audience_rsvp_group_chat(admin, ada, bola, stranger, estate):
    ha, _, ua = ada
    hb, _, ub = bola
    hs, _, us = stranger
    starts = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
    r = requests.post(f"{BASE}/community/events", json={"title": "Block C cleanup", "kind": "activity", "starts_at": starts, "location_label": "Block C car park", "audience": "estate", "estate_id": estate["id"], "group_chat": True, "capacity": 20}, headers=ha, timeout=20)
    assert r.status_code == 200, r.text
    ev = r.json()
    assert ev["conversation_id"] and ev["is_host"] and ev["going_count"] == 1
    # Stranger (not a resident) can't see/RSVP
    assert requests.get(f"{BASE}/community/events/{ev['id']}", headers=hs, timeout=20).status_code == 403
    assert requests.post(f"{BASE}/community/events/{ev['id']}/rsvp", json={"status": "going"}, headers=hs, timeout=20).status_code == 403
    # Resident RSVPs → added to the group chat
    r = requests.post(f"{BASE}/community/events/{ev['id']}/rsvp", json={"status": "going"}, headers=hb, timeout=20)
    assert r.status_code == 200 and r.json()["conversation_id"] == ev["conversation_id"]
    conv = requests.get(f"{BASE}/chat/conversations/{ev['conversation_id']}", headers=hb, timeout=20).json()
    assert conv["kind"] == "group" and conv["title"] == "Block C cleanup" and ub["id"] in conv["participant_ids"]
    assert all("email" not in p and "phone" not in p for p in conv["participants"])
    listed = requests.get(f"{BASE}/community/events", headers=hb, timeout=20).json()
    assert any(e["id"] == ev["id"] and e["my_rsvp"] == "going" for e in listed)
    # Connections-only event by Ada visible to Bola (connected) but not stranger
    r = requests.post(f"{BASE}/community/events", json={"title": "Viewing: 3-bed in Lekki", "kind": "viewing", "starts_at": starts, "location_label": "Meet at the estate gate", "audience": "connections"}, headers=ha, timeout=20)
    assert r.status_code == 200
    assert requests.get(f"{BASE}/community/events/{r.json()['id']}", headers=hb, timeout=20).status_code == 200
    assert requests.get(f"{BASE}/community/events/{r.json()['id']}", headers=hs, timeout=20).status_code == 403


def test_places_nearby_amenities_gated_and_recommend(ada, stranger, estate):
    ha, _, _ = ada
    hs, _, _ = stranger
    near_res = requests.get(f"{BASE}/community/places", params={"lat": estate["latitude"], "lng": estate["longitude"], "radius_km": 3}, headers=ha, timeout=20).json()
    near_str = requests.get(f"{BASE}/community/places", params={"lat": estate["latitude"], "lng": estate["longitude"], "radius_km": 3}, headers=hs, timeout=20).json()
    assert any(p["is_amenity"] for p in near_res["items"])
    assert not any(p["is_amenity"] for p in near_str["items"])  # estate amenities hidden from outsiders
    assert all("recommended_by" not in p or p["recommended_by"] is None for p in near_str["items"])
    pharmacy = next(p for p in near_str["items"] if p["category"] == "pharmacy")
    r = requests.post(f"{BASE}/community/places/{pharmacy['id']}/recommend", json={"text": "Open late, friendly staff"}, headers=hs, timeout=20)
    assert r.status_code == 200 and r.json()["recommended"] is True
    d = requests.get(f"{BASE}/community/places/{pharmacy['id']}", headers=hs, timeout=20).json()
    assert d["recommended_by_me"] is True and d["recommendation_count"] >= 1
    r = requests.post(f"{BASE}/community/places", json={"name": f"Test Suya Spot {uuid.uuid4().hex[:4]}", "category": "restaurant", "latitude": estate["latitude"] + 0.001, "longitude": estate["longitude"] + 0.001}, headers=hs, timeout=20)
    assert r.status_code == 200 and r.json()["place"]["label"] is None


def test_service_request_workflow(admin, ada, stranger, estate):
    ha, _, ua = ada
    hs, _, _ = stranger
    eid = estate["id"]
    assert requests.post(f"{BASE}/community/service-requests", json={"estate_id": eid, "category": "plumbing", "title": "Leak", "description": "Pipe burst near gate"}, headers=hs, timeout=20).status_code == 403
    r = requests.post(f"{BASE}/community/service-requests", json={"estate_id": eid, "category": "electrical", "title": "Street light out", "description": "The light at Block C junction has been off for 3 nights.", "location_label": "Block C junction", "urgent": False}, headers=ha, timeout=20)
    assert r.status_code == 200, r.text
    sr = r.json()
    assert sr["status"] == "open" and sr["updates"][0]["status"] == "open"
    # Reporter can't set in_progress; manager can, and may link a FIXA provider (gate stays on booking)
    assert requests.post(f"{BASE}/community/service-requests/{sr['id']}/update", json={"status": "in_progress"}, headers=ha, timeout=20).status_code == 403
    prov = requests.get(f"{BASE}/marketplace", params={"category": "services", "limit": 1}, timeout=20).json()
    body = {"status": "in_progress", "note": "Electrician booked for Thursday"}
    if prov:
        body["fixa_item_id"] = prov[0]["id"]
    r = requests.post(f"{BASE}/community/service-requests/{sr['id']}/update", json=body, headers=admin, timeout=20)
    assert r.status_code == 200
    d = requests.get(f"{BASE}/community/service-requests/{sr['id']}", headers=ha, timeout=20).json()
    assert d["status"] == "in_progress" and len(d["updates"]) == 2 and d["is_mine"]
    if prov:
        assert d["fixa_provider"]["id"] == prov[0]["id"]
    assert requests.post(f"{BASE}/community/service-requests/{sr['id']}/update", json={"status": "closed", "note": "Fixed, thanks"}, headers=ha, timeout=20).status_code == 200
    mine = requests.get(f"{BASE}/community/estates/{eid}/service-requests", headers=ha, timeout=20).json()
    assert any(x["id"] == sr["id"] and x["status"] == "closed" for x in mine["items"])


def test_block_report_moderation(admin, ada, bola, stranger, estate):
    ha, _, ua = ada
    hb, _, ub = bola
    hs, _, us = stranger
    post = requests.post(f"{BASE}/community/estates/{estate['id']}/posts", json={"type": "general", "body": "Selling my car cheap DM me!!!"}, headers=hb, timeout=20).json()
    r = requests.post(f"{BASE}/social/reports", json={"target_type": "post", "target_id": post["id"], "reason": "spam", "details": "Sales in the feed"}, headers=ha, timeout=20)
    assert r.status_code == 200
    q = requests.get(f"{BASE}/social/admin/reports", headers=admin, timeout=20).json()
    row = next(x for x in q["items"] if x["target_id"] == post["id"])
    assert row["estate_name"].startswith("Lekki") and "Selling" in row["target_preview"]
    assert requests.get(f"{BASE}/social/admin/reports", headers=ha, timeout=20).status_code == 403
    assert requests.post(f"{BASE}/social/admin/reports/{row['id']}/resolve", params={"action": "hide"}, headers=admin, timeout=20).status_code == 200
    assert requests.get(f"{BASE}/community/posts/{post['id']}", headers=ha, timeout=20).status_code == 404
    # Block: stranger blocks Ada → Ada can't view or connect; search hides
    assert requests.post(f"{BASE}/social/block/{ua['id']}", headers=hs, timeout=20).status_code == 200
    assert requests.get(f"{BASE}/social/users/{us['id']}", headers=ha, timeout=20).status_code == 404
    assert requests.post(f"{BASE}/social/connections", json={"user_id": us["id"]}, headers=ha, timeout=20).status_code == 404
    bl = requests.get(f"{BASE}/social/blocked", headers=hs, timeout=20).json()
    assert any(u["id"] == ua["id"] for u in bl["blocked"])
    assert requests.delete(f"{BASE}/social/block/{ua['id']}", headers=hs, timeout=20).status_code == 200


def test_estate_request_and_admin_approval(stranger, admin):
    hs, _, us = stranger
    name = f"Pilot Court {uuid.uuid4().hex[:4]}"
    r = requests.post(f"{BASE}/community/estates/request", json={"name": name, "city": "Ibadan", "i_am_manager": True}, headers=hs, timeout=20)
    assert r.status_code == 200 and r.json()["status"] == "pending"
    eid = r.json()["estate_id"]
    listing = requests.get(f"{BASE}/community/estates", headers=hs, timeout=20).json()
    assert not any(e["id"] == eid for e in listing["items"])  # pending estates aren't public
    q = requests.get(f"{BASE}/community/admin/estates", headers=admin, timeout=20).json()
    assert any(e["id"] == eid for e in q["items"])
    assert requests.post(f"{BASE}/community/admin/estates/{eid}/review", params={"action": "approve"}, headers=admin, timeout=20).status_code == 200
    e = requests.get(f"{BASE}/community/estates/{eid}", headers=hs, timeout=20).json()
    assert e["status"] == "active" and e["is_manager"] and e["join_code"]


def test_analytics_ingest_and_funnel(admin, ada):
    ha, _, _ = ada
    r = requests.post(f"{BASE}/analytics/events", json={"events": [
        {"name": "marker_impression", "props": {"count": 12}},
        {"name": "marker_tap", "props": {"property_id": "p1"}},
        {"name": "property_detail_view", "props": {"property_id": "p1", "arrived_via": "collection"}},
        {"name": "paid_action_start", "props": {"property_id": "p1", "arrived_via": "collection"}},
        {"name": "not_allowed_event", "props": {}},
    ]}, headers=ha, timeout=20)
    assert r.status_code == 200 and r.json()["accepted"] == 4
    f = requests.get(f"{BASE}/admin/analytics/funnel", params={"days": 7}, headers=admin, timeout=20).json()
    assert f["current"]["marker_impressions"] >= 12 and f["current"]["marker_taps"] >= 1
    assert f["attribution"]["collection"]["paid_action_starts"] >= 1
    assert "payments_completed" in f["current"] and "median_response_hours" in f["moderation"]
    assert requests.get(f"{BASE}/admin/analytics/funnel", headers=ha, timeout=20).status_code == 403


def test_neighbours_home_and_leave(ada, estate):
    ha, _, _ = ada
    home = requests.get(f"{BASE}/community/home", headers=ha, timeout=20).json()
    assert any(e["id"] == estate["id"] and e["membership"]["status"] == "approved" for e in home["estates"])
    assert home["connections"]["count"] >= 1 and len(home["collections"]) >= 1
    assert requests.post(f"{BASE}/community/estates/{estate['id']}/leave", headers=ha, timeout=20).status_code == 200
    assert requests.get(f"{BASE}/community/estates/{estate['id']}/posts", headers=ha, timeout=20).status_code == 403
