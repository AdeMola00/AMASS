"""Backend tests for AMASS API: /api/leads and /api/newsletter."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://discover-properties-1.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"

VALID_FORMS = ["become_agent", "list_property", "contact", "book_demo", "partner", "waiting_list"]


@pytest.fixture
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _unique_email(tag="t"):
    return f"TEST_{tag}_{uuid.uuid4().hex[:8]}@example.com"


# ---- /api/leads ----
@pytest.mark.parametrize("form_type", VALID_FORMS)
def test_create_lead_valid_forms(client, form_type):
    email = _unique_email(form_type)
    payload = {
        "form_type": form_type,
        "name": "Test User",
        "email": email,
        "phone": "+2348000000000",
        "message": "hello",
        "details": {"location": "Lagos", "budget": "1M"},
    }
    r = client.post(f"{API}/leads", json=payload)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["form_type"] == form_type
    assert body["email"] == email
    assert body["name"] == "Test User"
    assert body["phone"] == "+2348000000000"
    assert body["message"] == "hello"
    assert body["details"]["location"] == "Lagos"
    assert "id" in body and "created_at" in body

    # Verify persistence via GET filter
    g = client.get(f"{API}/leads", params={"form_type": form_type})
    assert g.status_code == 200
    emails = [l["email"] for l in g.json()]
    assert email in emails


def test_create_lead_invalid_form_type(client):
    r = client.post(f"{API}/leads", json={"form_type": "bogus_xyz", "email": _unique_email("bad")})
    assert r.status_code == 400


def test_create_lead_invalid_email(client):
    r = client.post(f"{API}/leads", json={"form_type": "contact", "email": "not-an-email"})
    assert r.status_code == 422


def test_list_leads_sorted_desc(client):
    # Create two leads
    e1 = _unique_email("sort1")
    e2 = _unique_email("sort2")
    client.post(f"{API}/leads", json={"form_type": "contact", "email": e1})
    client.post(f"{API}/leads", json={"form_type": "contact", "email": e2})
    r = client.get(f"{API}/leads")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list) and len(data) >= 2
    created_ats = [l["created_at"] for l in data]
    assert created_ats == sorted(created_ats, reverse=True)


def test_list_leads_filter(client):
    e = _unique_email("filter")
    client.post(f"{API}/leads", json={"form_type": "book_demo", "email": e})
    r = client.get(f"{API}/leads", params={"form_type": "book_demo"})
    assert r.status_code == 200
    assert all(l["form_type"] == "book_demo" for l in r.json())
    assert e in [l["email"] for l in r.json()]


# ---- /api/newsletter ----
def test_newsletter_subscribe_and_idempotent(client):
    email = _unique_email("news")
    r1 = client.post(f"{API}/newsletter", json={"email": email})
    assert r1.status_code == 201, r1.text
    b1 = r1.json()
    assert b1["email"] == email
    assert b1["form_type"] == "newsletter"

    r2 = client.post(f"{API}/newsletter", json={"email": email})
    # Idempotent: should return existing (still success). Accept 200 or 201.
    assert r2.status_code in (200, 201)
    b2 = r2.json()
    assert b2["email"] == email
    assert b2["id"] == b1["id"], "Duplicate newsletter subscription created new record"


def test_newsletter_invalid_email(client):
    r = client.post(f"{API}/newsletter", json={"email": "invalid"})
    assert r.status_code == 422
