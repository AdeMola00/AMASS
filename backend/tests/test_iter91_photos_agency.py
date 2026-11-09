# Iter91: FIXA work photos (A1/A2 API) + Agency teams review flows (B1-B3, B5-B7 API)
import os
import uuid
import pytest
import requests

BASE = os.environ.get("EXPO_BACKEND_URL").rstrip("/")
API = f"{BASE}/api"
DEMO = ("demo@amass.africa", "amass2026")
ADAEZE = ("adaeze.okoye@amass.africa", "Agent2026!")
PHOTOS = [f"https://picsum.photos/seed/qa{i}/600/400" for i in range(6)]


def H(t):
    return {"Authorization": f"Bearer {t}"}


def login(e, p):
    r = requests.post(f"{API}/auth/login", json={"email": e, "password": p})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def register(tag):
    email = f"qa91_{tag}_{uuid.uuid4().hex[:6]}@amass-qa.africa"
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": "Test1234!", "full_name": f"QA91 {tag.title()}"})
    assert r.status_code in (200, 201), r.text
    tok = r.json()["access_token"]
    me = requests.get(f"{API}/auth/me", headers=H(tok)).json()
    return {"email": email, "tok": tok, "id": me["id"]}


@pytest.fixture(scope="module")
def demo():
    return login(*DEMO)


@pytest.fixture(scope="module")
def ada():
    return login(*ADAEZE)


def apply_body(n):
    return {"business_name": "QA91 Fixers", "categories": ["Plumbing"], "city": "Lagos", "phone": "08031234567",
            "bio": "QA test pro", "image": PHOTOS[0], "work_photos": PHOTOS[:n]}


# A1: work photos via apply / me / put
def test_fixa_work_photos_apply_me_put(demo):
    u = register("pro")
    r = requests.post(f"{API}/fixa/apply", headers=H(u["tok"]), json=apply_body(6))
    assert r.status_code == 422, r.text
    r = requests.post(f"{API}/fixa/apply", headers=H(u["tok"]), json=apply_body(5))
    assert r.status_code == 201, r.text
    pid = r.json()["id"]
    me = requests.get(f"{API}/fixa/me", headers=H(u["tok"])).json()
    assert len(me["profile"]["work_photos"]) == 5
    body = apply_body(2); body["image"] = None
    r = requests.put(f"{API}/fixa/me", headers=H(u["tok"]), json=body)
    assert r.status_code == 200, r.text
    prof = r.json()["profile"]
    assert len(prof["work_photos"]) == 2 and prof["image"] == PHOTOS[0]
    # A2: approve -> public profile exposes work_photos
    r = requests.post(f"{API}/admin/fixa/applications/{pid}/approve", headers=H(demo), json={})
    assert r.status_code == 200, r.text
    pub = requests.get(f"{API}/fixa/providers/{pid}", headers=H(demo)).json()
    print("PUBLIC_PROVIDER_ID", pid, "USER_EMAIL", u["email"])
    flat = pub.get("provider", pub)
    assert len(flat["work_photos"]) == 2


# B2 + B1: admin create agency rules
def test_admin_agency_create_rules(demo, ada):
    owner = register("owner")
    r = requests.post(f"{API}/admin/agencies", headers=H(ada), json={"name": "Nope", "owner_email": owner["email"]})
    assert r.status_code == 403
    r = requests.post(f"{API}/admin/agencies", headers=H(demo), json={"name": "QA91 Realty", "owner_email": f"ghost_{uuid.uuid4().hex[:5]}@amass-qa.africa"})
    assert r.status_code == 404
    r = requests.post(f"{API}/admin/agencies", headers=H(demo), json={"name": "QA91 Realty", "owner_email": owner["email"]})
    assert r.status_code in (200, 201), r.text
    aid = r.json().get("id") or r.json().get("agency", {}).get("id")
    r = requests.post(f"{API}/admin/agencies", headers=H(demo), json={"name": "QA91 Dup", "owner_email": owner["email"]})
    assert r.status_code == 409
    # rename + deactivate + reactivate
    assert requests.patch(f"{API}/admin/agencies/{aid}", headers=H(demo), json={"name": "QA91 Realty Renamed"}).status_code == 200
    r = requests.patch(f"{API}/admin/agencies/{aid}", headers=H(demo), json={"status": "inactive"})
    print("deactivate", r.status_code, r.text[:200])
    assert r.status_code == 200
    assert requests.get(f"{API}/agency/me", headers=H(owner["tok"])).json()["agency"] is None
    assert requests.patch(f"{API}/admin/agencies/{aid}", headers=H(demo), json={"status": "active"}).status_code == 200
    items = requests.get(f"{API}/admin/agencies", headers=H(demo)).json()["items"]
    demo_ag = [a for a in items if a["name"] == "AMASS Demo Realty"]
    print("DEMO_AGENCY", demo_ag)
    assert demo_ag
    # leaving agency on team: no-team user GET leads -> 404
    stranger = register("stranger")
    assert requests.get(f"{API}/agency/leads", headers=H(stranger["tok"])).status_code == 404


# B3 + B6: invites + permissions
def test_invites_and_permissions(demo, ada):
    me = requests.get(f"{API}/agency/me", headers=H(demo)).json()
    assert me["membership"]["role"] == "owner"
    ex = register("invitee")
    r = requests.post(f"{API}/agency/invites", headers=H(demo), json={"email": ex["email"], "role": "agent"})
    assert r.status_code == 201, r.text
    inv_id = r.json()["id"]
    mine = requests.get(f"{API}/agency/me", headers=H(ex["tok"])).json()
    assert any(i["id"] == inv_id for i in mine["my_invites"])
    c = requests.get(f"{API}/notifications/center", headers=H(ex["tok"])).json()
    rows = c.get("items") or c.get("notifications") or []
    assert any(n.get("kind", n.get("type")) == "AGENCY_INVITE" and n.get("action_url") == "/agency" for n in rows), str(rows)[:400]
    # unknown email then register
    unk = f"qa91_unk_{uuid.uuid4().hex[:6]}@amass-qa.africa"
    r = requests.post(f"{API}/agency/invites", headers=H(demo), json={"email": unk, "role": "agent"})
    assert r.status_code == 201
    unk_id = r.json()["id"]
    rr = requests.post(f"{API}/auth/register", json={"email": unk, "password": "Test1234!", "full_name": "QA91 Unknown"})
    t2 = rr.json()["access_token"]
    m2 = requests.get(f"{API}/agency/me", headers=H(t2)).json()
    assert any(i["id"] == unk_id for i in m2["my_invites"])
    # cancel both
    assert requests.delete(f"{API}/agency/invites/{inv_id}", headers=H(demo)).status_code == 200
    assert requests.delete(f"{API}/agency/invites/{unk_id}", headers=H(demo)).status_code == 200
    # permissions
    assert requests.post(f"{API}/agency/invites", headers=H(ada), json={"email": ex["email"], "role": "agent"}).status_code == 403
    assert requests.post(f"{API}/agency/leave", headers=H(demo)).status_code == 400
    leads = requests.get(f"{API}/agency/leads", headers=H(demo)).json()["items"]
    assert leads
    lid = leads[0]["id"]
    assert requests.patch(f"{API}/agency/leads/{lid}/assign", headers=H(ada), json={"assigned_to": ex["id"]}).status_code == 403
    assert requests.patch(f"{API}/agency/leads/{lid}/assign", headers=H(demo), json={"assigned_to": ex["id"]}).status_code == 400


# B5 API: assign to adaeze -> visible to her, hidden from demo personal CRM, then restore
def test_assign_visibility_roundtrip(demo, ada):
    dm = requests.get(f"{API}/agency/me", headers=H(demo)).json()
    ada_id = [m for m in dm["members"] if m["role"] == "agent"][0]["user_id"]
    demo_id = dm["membership"]["user_id"]
    leads = requests.get(f"{API}/agency/leads", headers=H(demo)).json()["items"]
    print("TEAM_LEADS", len(leads))
    lid = leads[0]["id"]
    before_ada = requests.get(f"{API}/agency/leads", headers=H(ada)).json()["items"]
    r = requests.patch(f"{API}/agency/leads/{lid}/assign", headers=H(demo), json={"assigned_to": ada_id})
    assert r.status_code == 200
    try:
        ada_leads = requests.get(f"{API}/agency/leads", headers=H(ada)).json()["items"]
        assert lid in [l["id"] for l in ada_leads] and len(ada_leads) == len(before_ada) + 1
        crm_ada = requests.get(f"{API}/crm/leads", headers=H(ada)).json()
        crm_ada_items = crm_ada if isinstance(crm_ada, list) else crm_ada.get("items", [])
        assert lid in [l["id"] for l in crm_ada_items]
        crm_demo = requests.get(f"{API}/crm/leads", headers=H(demo)).json()
        assert lid not in [l["id"] for l in (crm_demo if isinstance(crm_demo, list) else crm_demo.get("items", []))]
        flt = requests.get(f"{API}/agency/leads", params={"assignee": ada_id}, headers=H(demo)).json()["items"]
        assert lid in [l["id"] for l in flt]
        # agent can update status/note on assigned lead
        assert requests.post(f"{API}/crm/leads/{lid}/note", headers=H(ada), json={"text": "QA91 note"}).status_code in (200, 201)
    finally:
        r = requests.patch(f"{API}/agency/leads/{lid}/assign", headers=H(demo), json={"assigned_to": demo_id})
        assert r.status_code == 200
    assert lid in [l["id"] for l in requests.get(f"{API}/crm/leads", headers=H(demo)).json()]
