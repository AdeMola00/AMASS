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
                         "faq", "contact", "social", "footer", "seo"]:
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
        r = requests.put(f"{BASE_URL}/api/cms/sections/faq", headers=_h(super_token), json={"visible": False})
        assert r.status_code == 200
        pub = requests.get(f"{BASE_URL}/api/public/landing").json()
        assert "faq" not in pub
        requests.put(f"{BASE_URL}/api/cms/sections/faq", headers=_h(super_token), json={"visible": True})


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


# ------------------- Admin Properties -------------------
class TestProperties:
    def test_list_properties(self, super_token):
        r = requests.get(f"{BASE_URL}/api/properties", headers=_h(super_token))
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) > 0
        p = rows[0]
        for k in ["id", "title", "type", "listing", "city", "price", "status", "verified", "agent_name"]:
            assert k in p, f"missing {k} in property doc"

    def test_filter_by_city_and_status(self, super_token):
        r = requests.get(f"{BASE_URL}/api/properties?city=Lagos&status=approved", headers=_h(super_token))
        assert r.status_code == 200
        for p in r.json():
            assert p["city"] == "Lagos"
            assert p["status"] == "approved"

    def test_search_and_type(self, super_token):
        # any type
        meta = requests.get(f"{BASE_URL}/api/properties-meta", headers=_h(super_token)).json()
        t = meta["types"][0]
        r = requests.get(f"{BASE_URL}/api/properties?type={t}", headers=_h(super_token))
        assert r.status_code == 200
        for p in r.json():
            assert p["type"] == t

    def test_create_defaults_pending_unverified(self, super_token):
        payload = {"title": "TEST_Prop_XYZ", "type": "Apartment", "listing": "Sale",
                   "city": "Lagos", "price": 12345678, "bedrooms": 2, "bathrooms": 2, "area_sqm": 80}
        r = requests.post(f"{BASE_URL}/api/properties", headers=_h(super_token), json=payload)
        assert r.status_code == 200, r.text
        pid = r.json()["id"]
        # GET back via list search
        rows = requests.get(f"{BASE_URL}/api/properties?search=TEST_Prop_XYZ", headers=_h(super_token)).json()
        p = next(x for x in rows if x["id"] == pid)
        assert p["status"] == "pending"
        assert p["verified"] is False
        assert p["title"] == "TEST_Prop_XYZ"
        # status change -> approved
        r2 = requests.patch(f"{BASE_URL}/api/properties/{pid}/status", headers=_h(super_token), json={"status": "approved"})
        assert r2.status_code == 200
        # verify toggle
        r3 = requests.patch(f"{BASE_URL}/api/properties/{pid}/verify", headers=_h(super_token), json={"verified": True})
        assert r3.status_code == 200
        rows = requests.get(f"{BASE_URL}/api/properties?search=TEST_Prop_XYZ", headers=_h(super_token)).json()
        p = next(x for x in rows if x["id"] == pid)
        assert p["status"] == "approved" and p["verified"] is True
        # invalid status
        rb = requests.patch(f"{BASE_URL}/api/properties/{pid}/status", headers=_h(super_token), json={"status": "bogus"})
        assert rb.status_code == 400
        # delete
        d = requests.delete(f"{BASE_URL}/api/properties/{pid}", headers=_h(super_token))
        assert d.status_code == 200
        rows = requests.get(f"{BASE_URL}/api/properties?search=TEST_Prop_XYZ", headers=_h(super_token)).json()
        assert not any(x["id"] == pid for x in rows)


# ------------------- Admin Agents -------------------
class TestAgents:
    def test_list_with_listings_count(self, super_token):
        r = requests.get(f"{BASE_URL}/api/agents", headers=_h(super_token))
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) > 0
        assert "listings_count" in rows[0]
        assert isinstance(rows[0]["listings_count"], int)

    def test_verified_filter(self, super_token):
        r = requests.get(f"{BASE_URL}/api/agents?verified=true", headers=_h(super_token))
        assert r.status_code == 200
        for a in r.json():
            assert a["verified"] is True

    def test_create_verify_delete(self, super_token):
        payload = {"name": "TEST_Agent", "email": "test_agent_xyz@example.com",
                   "phone": "+234800", "city": "Lagos", "agency": "TEST Agency"}
        # cleanup
        rows = requests.get(f"{BASE_URL}/api/agents?search=test_agent_xyz", headers=_h(super_token)).json()
        for a in rows:
            requests.delete(f"{BASE_URL}/api/agents/{a['id']}", headers=_h(super_token))
        r = requests.post(f"{BASE_URL}/api/agents", headers=_h(super_token), json=payload)
        assert r.status_code == 200, r.text
        aid = r.json()["id"]
        # duplicate email
        dup = requests.post(f"{BASE_URL}/api/agents", headers=_h(super_token), json=payload)
        assert dup.status_code == 400
        # verify toggle
        v = requests.patch(f"{BASE_URL}/api/agents/{aid}/verify", headers=_h(super_token), json={"verified": True})
        assert v.status_code == 200
        rows = requests.get(f"{BASE_URL}/api/agents?search=test_agent_xyz", headers=_h(super_token)).json()
        a = next(x for x in rows if x["id"] == aid)
        assert a["verified"] is True
        # delete
        d = requests.delete(f"{BASE_URL}/api/agents/{aid}", headers=_h(super_token))
        assert d.status_code == 200


# ------------------- Platform users -------------------
class TestPlatformUsers:
    def test_list(self, super_token):
        r = requests.get(f"{BASE_URL}/api/platform-users", headers=_h(super_token))
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) > 0
        assert "status" in rows[0]

    def test_suspend_and_reactivate(self, super_token):
        rows = requests.get(f"{BASE_URL}/api/platform-users", headers=_h(super_token)).json()
        uid = rows[0]["id"]
        orig_status = rows[0].get("status", "active")
        r = requests.patch(f"{BASE_URL}/api/platform-users/{uid}/status",
                           headers=_h(super_token), json={"status": "suspended"})
        assert r.status_code == 200
        rows2 = requests.get(f"{BASE_URL}/api/platform-users?search={rows[0]['email']}", headers=_h(super_token)).json()
        u = next(x for x in rows2 if x["id"] == uid)
        assert u["status"] == "suspended"
        # invalid
        rb = requests.patch(f"{BASE_URL}/api/platform-users/{uid}/status",
                            headers=_h(super_token), json={"status": "bogus"})
        assert rb.status_code == 400
        # restore
        rr = requests.patch(f"{BASE_URL}/api/platform-users/{uid}/status",
                            headers=_h(super_token), json={"status": orig_status})
        assert rr.status_code == 200


# ------------------- Public app endpoints -------------------
class TestPublicApp:
    def test_public_properties_only_approved(self):
        r = requests.get(f"{BASE_URL}/api/public/properties")
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) > 0
        for p in rows:
            assert p["status"] == "approved"

    def test_public_filters(self):
        r = requests.get(f"{BASE_URL}/api/public/properties?city=Lagos&listing=Sale&min_price=1&max_price=10000000000&bedrooms=1")
        assert r.status_code == 200
        for p in r.json():
            assert p["city"] == "Lagos"
            assert p["listing"] == "Sale"
            assert p["bedrooms"] >= 1

    def test_public_detail_404_for_non_approved(self, super_token):
        # create a pending property, GET public/{id} must 404
        payload = {"title": "TEST_PublicHidden", "type": "Apartment", "listing": "Sale",
                   "city": "Lagos", "price": 5000000}
        pid = requests.post(f"{BASE_URL}/api/properties", headers=_h(super_token), json=payload).json()["id"]
        r = requests.get(f"{BASE_URL}/api/public/properties/{pid}")
        assert r.status_code == 404
        # approve then public/{id} should return
        requests.patch(f"{BASE_URL}/api/properties/{pid}/status", headers=_h(super_token), json={"status": "approved"})
        r2 = requests.get(f"{BASE_URL}/api/public/properties/{pid}")
        assert r2.status_code == 200 and r2.json()["id"] == pid
        # cleanup
        requests.delete(f"{BASE_URL}/api/properties/{pid}", headers=_h(super_token))

    def test_public_submit_property_pending(self, super_token):
        payload = {"title": "TEST_PublicSubmit", "type": "Apartment", "listing": "Rent",
                   "city": "Abuja", "price": 900000}
        r = requests.post(f"{BASE_URL}/api/public/properties", json=payload)
        assert r.status_code == 200
        pid = r.json()["id"]
        assert r.json()["status"] == "pending"
        # verify via admin listing
        rows = requests.get(f"{BASE_URL}/api/properties?search=TEST_PublicSubmit", headers=_h(super_token)).json()
        p = next(x for x in rows if x["id"] == pid)
        assert p["status"] == "pending" and p["verified"] is False
        # cleanup
        requests.delete(f"{BASE_URL}/api/properties/{pid}", headers=_h(super_token))

    def test_public_agents_only_verified(self):
        r = requests.get(f"{BASE_URL}/api/public/agents")
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) > 0
        for a in rows:
            assert a["verified"] is True


# ------------------- RBAC on new modules -------------------
class TestRBACNew:
    def test_content_manager_properties_403(self, content_token):
        r = requests.get(f"{BASE_URL}/api/properties", headers=_h(content_token))
        assert r.status_code == 403

    def test_content_manager_agents_403(self, content_token):
        r = requests.get(f"{BASE_URL}/api/agents", headers=_h(content_token))
        assert r.status_code == 403

    def test_finance_properties_403(self, finance_token):
        r = requests.get(f"{BASE_URL}/api/properties", headers=_h(finance_token))
        assert r.status_code == 403

    def test_public_endpoints_no_auth(self):
        # No Authorization header -> still 200
        r1 = requests.get(f"{BASE_URL}/api/public/properties")
        r2 = requests.get(f"{BASE_URL}/api/public/agents")
        assert r1.status_code == 200 and r2.status_code == 200
