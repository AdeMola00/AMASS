"""AMASS backend API tests — admin API-key auth, CMS, and leads flows."""
import os
import uuid
import pytest
import requests
from pathlib import Path

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL')
if not BASE_URL:
    # Fallback: read from frontend .env
    envp = Path('/app/frontend/.env')
    for line in envp.read_text().splitlines():
        if line.startswith('REACT_APP_BACKEND_URL='):
            BASE_URL = line.split('=', 1)[1].strip()
BASE_URL = BASE_URL.rstrip('/')

# Read ADMIN_API_KEY from backend .env
ADMIN_API_KEY = None
for line in Path('/app/backend/.env').read_text().splitlines():
    if line.startswith('ADMIN_API_KEY='):
        ADMIN_API_KEY = line.split('=', 1)[1].strip()

API = f"{BASE_URL}/api"
HDR = {"X-API-Key": ADMIN_API_KEY}
HDR_BEARER = {"Authorization": f"Bearer {ADMIN_API_KEY}"}


# ---------- Public content ----------
def test_public_content_no_key():
    r = requests.get(f"{API}/content", timeout=15)
    assert r.status_code == 200
    d = r.json()
    for k in ["hero", "trust", "stats", "africanCities", "testimonials", "faqs", "sections"]:
        assert k in d, f"missing {k}"
    assert d["hero"]["line1"] == "Discover Africa's"


# ---------- Admin auth ----------
def test_admin_leads_without_key_401():
    r = requests.get(f"{API}/admin/leads", timeout=15)
    assert r.status_code == 401


def test_admin_leads_with_xkey_200():
    r = requests.get(f"{API}/admin/leads", headers=HDR, timeout=15)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_admin_leads_with_bearer_200():
    r = requests.get(f"{API}/admin/leads", headers=HDR_BEARER, timeout=15)
    assert r.status_code == 200


# ---------- Stats ----------
def test_admin_stats():
    r = requests.get(f"{API}/admin/stats", headers=HDR, timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert "total_leads" in d and isinstance(d["total_leads"], int)
    for ft in ["become_agent", "list_property", "contact", "book_demo", "partner", "waiting_list", "newsletter"]:
        assert ft in d["by_form_type"]
    for st in ["new", "contacted", "closed"]:
        assert st in d["by_status"]
    assert isinstance(d["recent"], list)


# ---------- Leads create + filter + patch ----------
@pytest.fixture(scope="module")
def created_lead():
    payload = {
        "form_type": "contact",
        "name": "TEST_User",
        "email": f"test_{uuid.uuid4().hex[:8]}@example.com",
        "message": "backend test",
    }
    r = requests.post(f"{API}/leads", json=payload, timeout=15)
    assert r.status_code == 201, r.text
    return r.json()


def test_admin_filter_contact(created_lead):
    r = requests.get(f"{API}/admin/leads?form_type=contact", headers=HDR, timeout=15)
    assert r.status_code == 200
    leads = r.json()
    assert all(l["form_type"] == "contact" for l in leads)
    assert any(l["id"] == created_lead["id"] for l in leads)


def test_admin_filter_status_new(created_lead):
    r = requests.get(f"{API}/admin/leads?status=new", headers=HDR, timeout=15)
    assert r.status_code == 200
    assert all(l["status"] == "new" for l in r.json())


def test_admin_newsletter_only():
    email = f"nl_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{API}/newsletter", json={"email": email}, timeout=15)
    assert r.status_code == 201
    r = requests.get(f"{API}/admin/newsletter", headers=HDR, timeout=15)
    assert r.status_code == 200
    nls = r.json()
    assert all(l["form_type"] == "newsletter" for l in nls)
    assert any(l["email"] == email for l in nls)


def test_patch_lead_status_valid(created_lead):
    r = requests.patch(f"{API}/admin/leads/{created_lead['id']}",
                       json={"status": "contacted"}, headers=HDR, timeout=15)
    assert r.status_code == 200
    assert r.json()["status"] == "contacted"
    # verify persisted
    r2 = requests.get(f"{API}/admin/leads?status=contacted", headers=HDR, timeout=15)
    assert any(l["id"] == created_lead["id"] for l in r2.json())


def test_patch_lead_invalid_status(created_lead):
    r = requests.patch(f"{API}/admin/leads/{created_lead['id']}",
                       json={"status": "bogus"}, headers=HDR, timeout=15)
    assert r.status_code == 400


def test_patch_lead_unknown_id():
    r = requests.patch(f"{API}/admin/leads/does-not-exist-xyz",
                       json={"status": "new"}, headers=HDR, timeout=15)
    assert r.status_code == 404


# ---------- CMS update + reset ----------
def test_cms_update_hero_and_reset():
    # PUT change
    r = requests.put(f"{API}/admin/content",
                     json={"hero": {"line1": "CMS TEST HEADLINE"}},
                     headers=HDR, timeout=15)
    assert r.status_code == 200
    # GET public
    r = requests.get(f"{API}/content", timeout=15)
    assert r.json()["hero"]["line1"] == "CMS TEST HEADLINE"
    # Reset
    r = requests.post(f"{API}/admin/content/reset", headers=HDR, timeout=15)
    assert r.status_code == 200
    r = requests.get(f"{API}/content", timeout=15)
    assert r.json()["hero"]["line1"] == "Discover Africa's"


def test_cms_toggle_testimonials_then_reset():
    r = requests.put(f"{API}/admin/content",
                     json={"sections": {"testimonials": False}},
                     headers=HDR, timeout=15)
    assert r.status_code == 200
    r = requests.get(f"{API}/content", timeout=15)
    assert r.json()["sections"]["testimonials"] is False
    # IMPORTANT: reset so frontend returns to default
    r = requests.post(f"{API}/admin/content/reset", headers=HDR, timeout=15)
    assert r.status_code == 200
    r = requests.get(f"{API}/content", timeout=15)
    assert r.json()["sections"]["testimonials"] is True
