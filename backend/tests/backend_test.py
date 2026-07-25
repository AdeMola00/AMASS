"""AMASS Admin Portal - Backend API tests."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/") or "https://amass-control.preview.emergentagent.com"

SUPER = {"email": "admin@amass.africa", "password": "ya0y9os77F@c8TXXh5@A"}
CONTENT = {"email": "content@amass.africa", "password": "Amass@2026"}
FINANCE = {"email": "finance@amass.africa", "password": "Amass@2026"}
SUPPORT = {"email": "support@amass.africa", "password": "Amass@2026"}


def _login(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, f"login failed for {creds['email']}: {r.status_code} {r.text}"
    return r.json()


@pytest.fixture(scope="session")
def super_token():
    return _login(SUPER)["token"]


@pytest.fixture(scope="session")
def content_token():
    return _login(CONTENT)["token"]


@pytest.fixture(scope="session")
def finance_token():
    return _login(FINANCE)["token"]


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


# ------------------- Auth -------------------
class TestAuth:
    def test_login_success_super(self):
        data = _login(SUPER)
        assert "token" in data and data["user"]["role"] == "super_admin"
        assert "permissions" in data["user"]

    def test_login_invalid(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "admin@amass.africa", "password": "wrong"})
        assert r.status_code == 401

    def test_me(self, super_token):
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=_h(super_token))
        assert r.status_code == 200
        assert r.json()["email"] == SUPER["email"]

    def test_me_no_token(self):
        r = requests.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 401


# ------------------- Dashboard -------------------
class TestDashboard:
    def test_stats(self, super_token):
        r = requests.get(f"{BASE_URL}/api/dashboard/stats", headers=_h(super_token))
        assert r.status_code == 200
        j = r.json()
        for k in ["total_leads", "new_leads_today", "registered_agents", "registered_users",
                  "total_properties", "pending_property_approvals", "newsletter_subscribers"]:
            assert k in j
            assert isinstance(j[k], int)
        assert j["total_leads"] > 0

    def test_leads_trend(self, super_token):
        r = requests.get(f"{BASE_URL}/api/dashboard/leads-trend", headers=_h(super_token))
        assert r.status_code == 200
        assert len(r.json()) == 14

    def test_lead_sources(self, super_token):
        r = requests.get(f"{BASE_URL}/api/dashboard/lead-sources", headers=_h(super_token))
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_activities(self, super_token):
        r = requests.get(f"{BASE_URL}/api/dashboard/activities", headers=_h(super_token))
        assert r.status_code == 200


# ------------------- Leads CRUD -------------------
class TestLeads:
    def test_list_leads(self, super_token):
        r = requests.get(f"{BASE_URL}/api/leads", headers=_h(super_token))
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) > 0
        assert "id" in rows[0]

    def test_filter_by_type(self, super_token):
        r = requests.get(f"{BASE_URL}/api/leads?type=demo", headers=_h(super_token))
        assert r.status_code == 200
        for l in r.json():
            assert l["type"] == "demo"

    def test_search(self, super_token):
        r = requests.get(f"{BASE_URL}/api/leads?search=example.com", headers=_h(super_token))
        assert r.status_code == 200
        assert len(r.json()) >= 1

    def test_status_update_and_persist(self, super_token):
        rows = requests.get(f"{BASE_URL}/api/leads", headers=_h(super_token)).json()
        lid = rows[0]["id"]
        r = requests.patch(f"{BASE_URL}/api/leads/{lid}/status", headers=_h(super_token), json={"status": "Contacted"})
        assert r.status_code == 200
        got = requests.get(f"{BASE_URL}/api/leads/{lid}", headers=_h(super_token)).json()
        assert got["status"] == "Contacted"

    def test_invalid_status(self, super_token):
        rows = requests.get(f"{BASE_URL}/api/leads", headers=_h(super_token)).json()
        r = requests.patch(f"{BASE_URL}/api/leads/{rows[0]['id']}/status", headers=_h(super_token), json={"status": "Bogus"})
        assert r.status_code == 400

    def test_export_csv(self, super_token):
        r = requests.get(f"{BASE_URL}/api/leads-export/csv", headers=_h(super_token))
        assert r.status_code == 200
        assert "text/csv" in r.headers.get("content-type", "")
        assert "Name" in r.text.splitlines()[0]

    def test_public_lead_create_and_delete(self, super_token):
        payload = {"type": "contact", "name": "TEST_User", "email": "test_user@example.com",
                   "phone": "+234123", "message": "hello from test"}
        r = requests.post(f"{BASE_URL}/api/public/leads", json=payload)
        assert r.status_code == 200
        # search back
        rows = requests.get(f"{BASE_URL}/api/leads?search=TEST_User", headers=_h(super_token)).json()
        assert len(rows) >= 1
        lid = rows[0]["id"]
        d = requests.delete(f"{BASE_URL}/api/leads/{lid}", headers=_h(super_token))
        assert d.status_code == 200
        g = requests.get(f"{BASE_URL}/api/leads/{lid}", headers=_h(super_token))
        assert g.status_code == 404


# ------------------- CMS -------------------
class TestCMS:
    def test_list(self, super_token):
        r = requests.get(f"{BASE_URL}/api/cms/sections", headers=_h(super_token))
        assert r.status_code == 200
        keys = [s["key"] for s in r.json()]
        for expected in ["hero", "statistics", "categories", "showcase", "testimonials",
                         "faq", "partners", "contact", "social", "footer", "seo"]:
            assert expected in keys

    def test_update_and_public(self, super_token):
        # fetch hero
        cur = requests.get(f"{BASE_URL}/api/cms/sections/hero", headers=_h(super_token)).json()
        new_data = dict(cur["data"])
        new_data["headline"] = "TEST_Headline_XYZ"
        r = requests.put(f"{BASE_URL}/api/cms/sections/hero", headers=_h(super_token),
                         json={"data": new_data, "visible": True})
        assert r.status_code == 200
        pub = requests.get(f"{BASE_URL}/api/public/landing").json()
        assert pub["hero"]["headline"] == "TEST_Headline_XYZ"
        # restore
        requests.put(f"{BASE_URL}/api/cms/sections/hero", headers=_h(super_token),
                     json={"data": cur["data"], "visible": True})

    def test_visibility_toggle(self, super_token):
        r = requests.put(f"{BASE_URL}/api/cms/sections/partners", headers=_h(super_token), json={"visible": False})
        assert r.status_code == 200
        pub = requests.get(f"{BASE_URL}/api/public/landing").json()
        assert "partners" not in pub
        requests.put(f"{BASE_URL}/api/cms/sections/partners", headers=_h(super_token), json={"visible": True})


# ------------------- Roles -------------------
class TestRoles:
    def test_list_roles(self, super_token):
        r = requests.get(f"{BASE_URL}/api/roles", headers=_h(super_token))
        assert r.status_code == 200
        j = r.json()
        assert "roles" in j and len(j["roles"]) >= 8
        assert "modules" in j and "actions" in j

    def test_super_admin_locked(self, super_token):
        r = requests.put(f"{BASE_URL}/api/roles/super_admin", headers=_h(super_token),
                         json={"permissions": {"dashboard": {"view": False}}})
        assert r.status_code == 400

    def test_update_role(self, super_token):
        # get current
        j = requests.get(f"{BASE_URL}/api/roles", headers=_h(super_token)).json()
        marketing = next(r for r in j["roles"] if r["name"] == "marketing")
        perms = marketing["permissions"]
        # toggle a value
        orig = perms["analytics"]["edit"]
        perms["analytics"]["edit"] = not orig
        r = requests.put(f"{BASE_URL}/api/roles/marketing", headers=_h(super_token), json={"permissions": perms})
        assert r.status_code == 200
        j2 = requests.get(f"{BASE_URL}/api/roles", headers=_h(super_token)).json()
        marketing2 = next(r for r in j2["roles"] if r["name"] == "marketing")
        assert marketing2["permissions"]["analytics"]["edit"] == (not orig)
        # restore
        perms["analytics"]["edit"] = orig
        requests.put(f"{BASE_URL}/api/roles/marketing", headers=_h(super_token), json={"permissions": perms})


# ------------------- RBAC enforcement -------------------
class TestRBAC:
    def test_content_manager_cms_ok(self, content_token):
        r = requests.get(f"{BASE_URL}/api/cms/sections", headers=_h(content_token))
        assert r.status_code == 200

    def test_content_manager_leads_forbidden(self, content_token):
        r = requests.get(f"{BASE_URL}/api/leads", headers=_h(content_token))
        assert r.status_code == 403

    def test_content_manager_roles_forbidden(self, content_token):
        r = requests.get(f"{BASE_URL}/api/roles", headers=_h(content_token))
        assert r.status_code == 403

    def test_finance_cms_forbidden(self, finance_token):
        r = requests.get(f"{BASE_URL}/api/cms/sections", headers=_h(finance_token))
        assert r.status_code == 403

    def test_finance_dashboard_ok(self, finance_token):
        r = requests.get(f"{BASE_URL}/api/dashboard/stats", headers=_h(finance_token))
        assert r.status_code == 200


# ------------------- Admin Users (Team) -------------------
class TestTeam:
    def test_list(self, super_token):
        r = requests.get(f"{BASE_URL}/api/admin-users", headers=_h(super_token))
        assert r.status_code == 200
        emails = [u["email"] for u in r.json()]
        assert SUPER["email"] in emails

    def test_create_and_delete(self, super_token):
        payload = {"name": "TEST Member", "email": "test_member_xyz@amass.africa",
                   "password": "Test@12345", "role": "marketing"}
        # cleanup if exists
        existing = requests.get(f"{BASE_URL}/api/admin-users", headers=_h(super_token)).json()
        for u in existing:
            if u["email"] == payload["email"]:
                requests.delete(f"{BASE_URL}/api/admin-users/{u['id']}", headers=_h(super_token))
        r = requests.post(f"{BASE_URL}/api/admin-users", headers=_h(super_token), json=payload)
        assert r.status_code == 200, r.text
        # find
        users = requests.get(f"{BASE_URL}/api/admin-users", headers=_h(super_token)).json()
        u = next(x for x in users if x["email"] == payload["email"])
        # delete
        d = requests.delete(f"{BASE_URL}/api/admin-users/{u['id']}", headers=_h(super_token))
        assert d.status_code == 200

    def test_cannot_delete_super_admin(self, super_token):
        users = requests.get(f"{BASE_URL}/api/admin-users", headers=_h(super_token)).json()
        sa = next(u for u in users if u["role"] == "super_admin")
        r = requests.delete(f"{BASE_URL}/api/admin-users/{sa['id']}", headers=_h(super_token))
        assert r.status_code == 400


# ------------------- Profile / Password -------------------
class TestProfile:
    def test_profile_update(self, super_token):
        # get current
        me = requests.get(f"{BASE_URL}/api/auth/me", headers=_h(super_token)).json()
        orig = me["name"]
        r = requests.patch(f"{BASE_URL}/api/auth/profile", headers=_h(super_token), json={"name": "TEST_Name"})
        assert r.status_code == 200
        me2 = requests.get(f"{BASE_URL}/api/auth/me", headers=_h(super_token)).json()
        assert me2["name"] == "TEST_Name"
        # restore
        requests.patch(f"{BASE_URL}/api/auth/profile", headers=_h(super_token), json={"name": orig})

    def test_change_password_wrong(self, super_token):
        r = requests.post(f"{BASE_URL}/api/auth/change-password", headers=_h(super_token),
                          json={"current_password": "wrong", "new_password": "NewP@ss123"})
        assert r.status_code == 400
