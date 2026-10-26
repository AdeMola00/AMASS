"""Agency teams — admin creates an agency and names the owner · owner invites by email (existing user → in-app
invite; unknown email → bound at sign-up) · accept in-app · one pooled CRM where owner/managers see every lead and
assign, agents see only leads assigned to them · remove/leave returns assigned leads to the pool.
Also: FIXA work photos (≤5) round-trip through apply / me / public profile.
Every row this module creates is removed at the end (session teardown)."""
import os
import uuid
from datetime import datetime, timezone

import pytest
import requests
from pymongo import MongoClient

BASE = os.environ.get("EXPO_BACKEND_URL", "http://localhost:8001").rstrip("/")
ADMIN = ("demo@amass.africa", "amass2026")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "amass_db")

_CREATED_USERS: list[str] = []
_CREATED_AGENCIES: list[str] = []
_CREATED_LEADS: list[str] = []


def _login(email, password):
    r = requests.post(f"{BASE}/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}"}


def _new_user(name):
    email = f"agency_{uuid.uuid4().hex[:10]}@amass-qa.africa"
    r = requests.post(f"{BASE}/api/auth/register", json={"email": email, "password": "Test1234!", "full_name": name})
    assert r.status_code == 200, r.text
    tok = r.json()["access_token"]
    me = requests.get(f"{BASE}/api/auth/me", headers=_hdr(tok)).json()
    _CREATED_USERS.append(me["id"])
    return {"tok": tok, "id": me["id"], "email": email, "name": name}


def _seed_lead(mongo, agent_id, buyer_id, status=None):
    doc = {"id": str(uuid.uuid4()), "agent_id": agent_id, "property_id": None, "favorite_user_id": buyer_id, "cost": 10, "created_at": datetime.now(timezone.utc)}
    if status:
        doc["crm_status"] = status
    mongo.lead_unlocks.insert_one(doc)
    _CREATED_LEADS.append(doc["id"])
    return doc["id"]


@pytest.fixture(scope="module")
def mongo():
    return MongoClient(MONGO_URL)[DB_NAME]


@pytest.fixture(scope="module")
def admin_tok():
    return _login(*ADMIN)


@pytest.fixture(scope="module")
def people():
    return {"owner": _new_user("Olu Owner"), "manager": _new_user("Mimi Manager"), "agent": _new_user("Ade Agent"), "buyer": _new_user("Bisi Buyer"), "outsider": _new_user("Olly Outsider")}


@pytest.fixture(scope="module")
def agency(admin_tok, people):
    r = requests.post(f"{BASE}/api/admin/agencies", headers=_hdr(admin_tok), json={"name": "QA Realty", "owner_email": people["owner"]["email"]})
    assert r.status_code == 201, r.text
    a = r.json()
    _CREATED_AGENCIES.append(a["id"])
    return a


@pytest.fixture(scope="module", autouse=True)
def _teardown(mongo):
    yield
    if _CREATED_AGENCIES:
        mongo.agencies.delete_many({"id": {"$in": _CREATED_AGENCIES}})
        mongo.agency_members.delete_many({"agency_id": {"$in": _CREATED_AGENCIES}})
    if _CREATED_LEADS:
        mongo.lead_unlocks.delete_many({"id": {"$in": _CREATED_LEADS}})
    if _CREATED_USERS:
        mongo.notifications.delete_many({"user_id": {"$in": _CREATED_USERS}})
        mongo.marketplace.delete_many({"seller_id": {"$in": _CREATED_USERS}, "category": "services"})
        mongo.users.delete_many({"id": {"$in": _CREATED_USERS}})


# ─── Admin creates the agency ────────────────────────────────────────────────
def test_only_admin_creates_and_owner_must_exist(admin_tok, people, agency):
    r = requests.post(f"{BASE}/api/admin/agencies", headers=_hdr(people["owner"]["tok"]), json={"name": "Nope", "owner_email": people["owner"]["email"]})
    assert r.status_code == 403
    r = requests.post(f"{BASE}/api/admin/agencies", headers=_hdr(admin_tok), json={"name": "Ghost", "owner_email": f"nobody_{uuid.uuid4().hex[:6]}@amass-qa.africa"})
    assert r.status_code == 404
    # owner already belongs to QA Realty → 409
    r = requests.post(f"{BASE}/api/admin/agencies", headers=_hdr(admin_tok), json={"name": "Second", "owner_email": people["owner"]["email"]})
    assert r.status_code == 409
    assert agency["owner"]["id"] == people["owner"]["id"] and agency["members"] == 1
    me = requests.get(f"{BASE}/api/agency/me", headers=_hdr(people["owner"]["tok"])).json()
    assert me["agency"]["id"] == agency["id"] and me["membership"]["role"] == "owner"
    listed = requests.get(f"{BASE}/api/admin/agencies", headers=_hdr(admin_tok)).json()["items"]
    assert any(a["id"] == agency["id"] for a in listed)


# ─── Invites ─────────────────────────────────────────────────────────────────
def test_invite_existing_user_notified_and_accepts(people, agency):
    o, m = people["owner"], people["manager"]
    r = requests.post(f"{BASE}/api/agency/invites", headers=_hdr(o["tok"]), json={"email": m["email"].upper(), "role": "manager"})
    assert r.status_code == 201, r.text
    inv = r.json()
    assert inv["status"] == "invited" and inv["user_id"] == m["id"]
    # duplicate invite → 409
    assert requests.post(f"{BASE}/api/agency/invites", headers=_hdr(o["tok"]), json={"email": m["email"], "role": "agent"}).status_code == 409
    # the invitee sees it in /agency/me and in the notification centre
    mine = requests.get(f"{BASE}/api/agency/me", headers=_hdr(m["tok"])).json()
    assert mine["agency"] is None and [i["id"] for i in mine["my_invites"]] == [inv["id"]]
    assert mine["my_invites"][0]["agency"]["name"] == "QA Realty" and mine["my_invites"][0]["inviter"]["id"] == o["id"]
    c = requests.get(f"{BASE}/api/notifications/center", headers=_hdr(m["tok"])).json()
    assert any(n["kind"] == "AGENCY_INVITE" and n["action_url"] == "/agency" for n in c["items"])
    # an outsider can't accept someone else's invite
    assert requests.post(f"{BASE}/api/agency/invites/{inv['id']}/accept", headers=_hdr(people["outsider"]["tok"])).status_code == 404
    r = requests.post(f"{BASE}/api/agency/invites/{inv['id']}/accept", headers=_hdr(m["tok"]))
    assert r.status_code == 200 and r.json()["role"] == "manager"
    me = requests.get(f"{BASE}/api/agency/me", headers=_hdr(m["tok"])).json()
    assert me["membership"]["role"] == "manager" and me["membership"]["status"] == "active"
    # owner got the joined notification
    c = requests.get(f"{BASE}/api/notifications/center", headers=_hdr(o["tok"])).json()
    assert any(n["kind"] == "AGENCY_JOINED" for n in c["items"])


def test_manager_invites_agent_but_not_manager(people, agency):
    m, a = people["manager"], people["agent"]
    assert requests.post(f"{BASE}/api/agency/invites", headers=_hdr(m["tok"]), json={"email": a["email"], "role": "manager"}).status_code == 403
    r = requests.post(f"{BASE}/api/agency/invites", headers=_hdr(m["tok"]), json={"email": a["email"], "role": "agent"})
    assert r.status_code == 201, r.text
    assert requests.post(f"{BASE}/api/agency/invites/{r.json()['id']}/accept", headers=_hdr(a["tok"])).status_code == 200
    me = requests.get(f"{BASE}/api/agency/me", headers=_hdr(a["tok"])).json()
    assert me["membership"]["role"] == "agent"
    assert me["stats"]["members"] == 3
    # agents can't invite
    assert requests.post(f"{BASE}/api/agency/invites", headers=_hdr(a["tok"]), json={"email": people["outsider"]["email"], "role": "agent"}).status_code == 403


def test_invite_unknown_email_binds_at_signup(people, agency):
    o = people["owner"]
    email = f"agency_new_{uuid.uuid4().hex[:8]}@amass-qa.africa"
    r = requests.post(f"{BASE}/api/agency/invites", headers=_hdr(o["tok"]), json={"email": email, "role": "agent"})
    assert r.status_code == 201, r.text
    assert r.json()["user_id"] is None and r.json()["user"] is None
    # they sign up with that email → the invite is theirs
    reg = requests.post(f"{BASE}/api/auth/register", json={"email": email, "password": "Test1234!", "full_name": "Nora New"})
    assert reg.status_code == 200, reg.text
    tok = reg.json()["access_token"]
    uid = requests.get(f"{BASE}/api/auth/me", headers=_hdr(tok)).json()["id"]
    _CREATED_USERS.append(uid)
    mine = requests.get(f"{BASE}/api/agency/me", headers=_hdr(tok)).json()
    assert len(mine["my_invites"]) == 1 and mine["my_invites"][0]["id"] == r.json()["id"]
    # decline → gone, not a member
    assert requests.post(f"{BASE}/api/agency/invites/{r.json()['id']}/decline", headers=_hdr(tok)).status_code == 200
    mine = requests.get(f"{BASE}/api/agency/me", headers=_hdr(tok)).json()
    assert mine["my_invites"] == [] and mine["agency"] is None


# ─── Shared CRM ──────────────────────────────────────────────────────────────
def test_team_pool_visibility_and_assignment(mongo, people, agency):
    o, m, a, buyer = people["owner"], people["manager"], people["agent"], people["buyer"]
    lead_owner = _seed_lead(mongo, o["id"], buyer["id"])
    lead_mgr = _seed_lead(mongo, m["id"], buyer["id"], status="contacted")
    lead_agent = _seed_lead(mongo, a["id"], buyer["id"])
    # owner sees all three, buyer contact hydrated, assignee defaults to the unlocking agent
    r = requests.get(f"{BASE}/api/agency/leads", headers=_hdr(o["tok"])).json()
    assert r["role"] == "owner"
    ids = {l["id"]: l for l in r["items"]}
    assert {lead_owner, lead_mgr, lead_agent} <= set(ids)
    assert ids[lead_agent]["assignee"]["id"] == a["id"] and ids[lead_agent]["contact_name"] == buyer["name"]
    # agent sees only their own
    r = requests.get(f"{BASE}/api/agency/leads", headers=_hdr(a["tok"])).json()
    assert r["role"] == "agent" and {l["id"] for l in r["items"]} == {lead_agent}
    # agent can't assign
    assert requests.patch(f"{BASE}/api/agency/leads/{lead_owner}/assign", headers=_hdr(a["tok"]), json={"assigned_to": a["id"]}).status_code == 403
    # manager assigns the owner's lead to the agent → agent sees it, gets notified, can update + note it
    r = requests.patch(f"{BASE}/api/agency/leads/{lead_owner}/assign", headers=_hdr(m["tok"]), json={"assigned_to": a["id"]})
    assert r.status_code == 200, r.text
    assert r.json()["lead"]["assignee"]["id"] == a["id"] and r.json()["lead"]["agent"]["id"] == o["id"]
    r = requests.get(f"{BASE}/api/agency/leads", headers=_hdr(a["tok"])).json()
    assert {l["id"] for l in r["items"]} == {lead_agent, lead_owner}
    c = requests.get(f"{BASE}/api/notifications/center", headers=_hdr(a["tok"])).json()
    assert any(n["kind"] == "LEAD_ASSIGNED" and n["action_url"] == f"/agency/leads?lead={lead_owner}" for n in c["items"])
    assert requests.patch(f"{BASE}/api/crm/leads/{lead_owner}", headers=_hdr(a["tok"]), json={"status": "contacted"}).status_code == 200
    assert requests.post(f"{BASE}/api/crm/leads/{lead_owner}/note", headers=_hdr(a["tok"]), json={"text": "Called, viewing Saturday"}).status_code == 200
    # the personal CRM follows the assignment: agent has it, owner no longer does
    assert lead_owner in {l["id"] for l in requests.get(f"{BASE}/api/crm/leads", headers=_hdr(a["tok"])).json()}
    assert lead_owner not in {l["id"] for l in requests.get(f"{BASE}/api/crm/leads", headers=_hdr(o["tok"])).json()}
    # but the owner can still update it as a manager of the team
    assert requests.patch(f"{BASE}/api/crm/leads/{lead_owner}", headers=_hdr(o["tok"]), json={"status": "negotiating"}).status_code == 200
    # outsider can't touch team leads
    assert requests.patch(f"{BASE}/api/crm/leads/{lead_owner}", headers=_hdr(people["outsider"]["tok"]), json={"status": "won"}).status_code == 403
    # assignee filter + status filter
    r = requests.get(f"{BASE}/api/agency/leads?assignee={a['id']}", headers=_hdr(o["tok"])).json()
    assert {l["id"] for l in r["items"]} == {lead_agent, lead_owner}
    r = requests.get(f"{BASE}/api/agency/leads?status=contacted", headers=_hdr(o["tok"])).json()
    assert lead_mgr in {l["id"] for l in r["items"]}
    # assigning to someone off the team → 400
    assert requests.patch(f"{BASE}/api/agency/leads/{lead_owner}/assign", headers=_hdr(o["tok"]), json={"assigned_to": people["outsider"]["id"]}).status_code == 400


def test_remove_member_returns_assigned_leads_to_pool(mongo, people, agency):
    o, m, a = people["owner"], people["manager"], people["agent"]
    me = requests.get(f"{BASE}/api/agency/me", headers=_hdr(o["tok"])).json()
    agent_member = next(x for x in me["members"] if x["user_id"] == a["id"])
    mgr_member = next(x for x in me["members"] if x["user_id"] == m["id"])
    # Pool the agent's own unlock by assigning it around (owner → back to agent); it now carries agency_id.
    team = requests.get(f"{BASE}/api/agency/leads", headers=_hdr(o["tok"])).json()["items"]
    lead_agent = next(l["id"] for l in team if l["agent"]["id"] == a["id"])
    lead_owner = next(l["id"] for l in team if l["agent"]["id"] == o["id"])
    assert requests.patch(f"{BASE}/api/agency/leads/{lead_agent}/assign", headers=_hdr(o["tok"]), json={"assigned_to": o["id"]}).status_code == 200
    assert requests.patch(f"{BASE}/api/agency/leads/{lead_agent}/assign", headers=_hdr(o["tok"]), json={"assigned_to": a["id"]}).status_code == 200
    # self-removal → use leave; a manager may remove an agent
    assert requests.delete(f"{BASE}/api/agency/members/{mgr_member['id']}", headers=_hdr(m["tok"])).status_code == 400
    assert requests.delete(f"{BASE}/api/agency/members/{agent_member['id']}", headers=_hdr(m["tok"])).status_code == 200
    # the owner's lead reverts to the owner; the agent's pooled lead is now unassigned (its unlocker left)
    team = {l["id"]: l for l in requests.get(f"{BASE}/api/agency/leads", headers=_hdr(o["tok"])).json()["items"]}
    assert team[lead_owner]["assignee"]["id"] == o["id"]
    assert team[lead_agent]["assignee"] is None
    unassigned = {l["id"] for l in requests.get(f"{BASE}/api/agency/leads?assignee=unassigned", headers=_hdr(o["tok"])).json()["items"]}
    assert unassigned == {lead_agent}
    assert requests.get(f"{BASE}/api/agency/me", headers=_hdr(a["tok"])).json()["agency"] is None
    assert requests.get(f"{BASE}/api/agency/leads", headers=_hdr(a["tok"])).status_code == 404
    # the removed agent keeps that lead in their personal CRM (they unlocked it) but can no longer see the owner's
    mine = {l["id"] for l in requests.get(f"{BASE}/api/crm/leads", headers=_hdr(a["tok"])).json()}
    assert lead_agent in mine and lead_owner not in mine
    stats = requests.get(f"{BASE}/api/agency/me", headers=_hdr(o["tok"])).json()["stats"]
    assert stats["unassigned"] == 1 and stats["members"] == 2
    # owner can't leave; manager can
    assert requests.post(f"{BASE}/api/agency/leave", headers=_hdr(o["tok"])).status_code == 400
    assert requests.post(f"{BASE}/api/agency/leave", headers=_hdr(m["tok"])).status_code == 200


def test_admin_handover_and_deactivate(admin_tok, people, agency):
    o, m = people["owner"], people["manager"]
    r = requests.patch(f"{BASE}/api/admin/agencies/{agency['id']}", headers=_hdr(admin_tok), json={"owner_email": m["email"], "name": "QA Realty Group"})
    assert r.status_code == 200, r.text
    assert r.json()["owner"]["id"] == m["id"] and r.json()["name"] == "QA Realty Group"
    assert requests.get(f"{BASE}/api/agency/me", headers=_hdr(m["tok"])).json()["membership"]["role"] == "owner"
    assert requests.get(f"{BASE}/api/agency/me", headers=_hdr(o["tok"])).json()["membership"]["role"] == "manager"
    r = requests.patch(f"{BASE}/api/admin/agencies/{agency['id']}", headers=_hdr(admin_tok), json={"status": "inactive"})
    assert r.status_code == 200 and r.json()["status"] == "inactive"
    assert requests.get(f"{BASE}/api/agency/me", headers=_hdr(m["tok"])).json()["agency"] is None


# ─── FIXA work photos ────────────────────────────────────────────────────────
def test_fixa_work_photos_round_trip(admin_tok):
    pro = _new_user("Photo Pro")
    photos = [f"https://images.amass-qa.africa/work-{i}.jpg" for i in range(7)]
    body = {"business_name": "Photo Pro Tiling", "categories": ["Tiling"], "city": "Lagos", "service_areas": ["Yaba"], "phone": "0803 555 0202", "years_experience": 3, "bio": "Tiles.", "work_photos": photos}
    assert requests.post(f"{BASE}/api/fixa/apply", headers=_hdr(pro["tok"]), json=body).status_code == 422  # max 5
    body["work_photos"] = photos[:5] + [photos[0]]  # dupes collapse
    assert requests.post(f"{BASE}/api/fixa/apply", headers=_hdr(pro["tok"]), json={**body, "work_photos": photos[:5]}).status_code == 201
    me = requests.get(f"{BASE}/api/fixa/me", headers=_hdr(pro["tok"])).json()
    assert me["profile"]["work_photos"] == photos[:5]
    pid = me["profile"]["id"]
    # edit: swap to 2 photos without resending the profile image → images = work photos only
    body["work_photos"] = photos[:2]
    r = requests.put(f"{BASE}/api/fixa/me", headers=_hdr(pro["tok"]), json=body)
    assert r.status_code == 200 and r.json()["profile"]["work_photos"] == photos[:2]
    # verify → public profile carries the gallery
    assert requests.post(f"{BASE}/api/admin/fixa/applications/{pid}/approve", headers=_hdr(admin_tok), json={}).status_code == 200
    pub = requests.get(f"{BASE}/api/fixa/providers/{pid}", headers=_hdr(pro["tok"])).json()
    assert pub["work_photos"] == photos[:2]
