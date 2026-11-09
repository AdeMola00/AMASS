# AMASS Partner (Agent) App backend tests: /api/partner/* + existing endpoints used by the partner app
import os
import pytest
import requests

BASE_URL = (os.environ.get("EXPO_BACKEND_URL") or os.environ.get("EXPO_PUBLIC_BACKEND_URL")).rstrip("/")
PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="


def login(email, pw):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw}, timeout=30)
    assert r.status_code == 200, r.text
    s = requests.Session()
    s.headers["Authorization"] = f"Bearer {r.json()['access_token']}"
    return s


@pytest.fixture(scope="module")
def agent():
    return login("adaeze.okoye@amass.africa", "Agent2026!")


@pytest.fixture(scope="module")
def seller():
    return login("seller.demo@amass.africa", "Partner2026!")


@pytest.fixture(scope="module")
def fixa():
    return login("fixa.demo@amass.africa", "Partner2026!")


@pytest.fixture(scope="module")
def buyer():
    return login("buyer.demo@amass.africa", "Partner2026!")


# --- auth
def test_login_wrong_password():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "seller.demo@amass.africa", "password": "nope"}, timeout=30)
    assert r.status_code in (400, 401)


def test_partner_me_requires_auth():
    assert requests.get(f"{BASE_URL}/api/partner/me", timeout=30).status_code in (401, 403)


# --- /partner/me roles + counts
def test_me_agent(agent):
    d = agent.get(f"{BASE_URL}/api/partner/me").json()
    assert "agent" in d["roles"]
    assert d["counts"]["agent_listings"] >= 1
    assert "agent_viewings_waiting" in d["counts"] and "unread_messages" in d["counts"]


def test_me_seller(seller):
    d = seller.get(f"{BASE_URL}/api/partner/me").json()
    assert "seller" in d["roles"]
    assert d["counts"]["seller_items"] >= 1
    print("seller counts", d["counts"])


def test_me_fixa(fixa):
    d = fixa.get(f"{BASE_URL}/api/partner/me").json()
    assert "fixa" in d["roles"]
    assert d["fixa"]["item_id"]
    print("fixa roles/counts", d["roles"], d["counts"])


def test_me_buyer_no_roles(buyer):
    d = buyer.get(f"{BASE_URL}/api/partner/me").json()
    print("buyer roles", d["roles"])
    assert d["roles"] == []


def test_roles_validation(buyer):
    assert buyer.post(f"{BASE_URL}/api/partner/roles", json={"roles": ["fixa"]}).status_code == 422
    assert buyer.post(f"{BASE_URL}/api/partner/roles", json={"roles": []}).status_code == 422


def test_upload(seller):
    r = seller.post(f"{BASE_URL}/api/partner/upload", json={"data_url": PNG})
    assert r.status_code == 201, r.text
    url = r.json()["url"]
    assert url.startswith("http")
    g = requests.get(url, timeout=30)
    assert g.status_code == 200, f"uploaded url not fetchable {g.status_code}"


# --- FIXA stage
def test_fixa_jobs_and_stage(fixa, seller):
    r = fixa.get(f"{BASE_URL}/api/fixa/jobs")
    assert r.status_code == 200, r.text
    data = r.json()
    jobs = data if isinstance(data, list) else (data.get("jobs") or data.get("items") or [])
    print("job statuses", [(j.get("id"), j.get("status"), j.get("job_stage")) for j in jobs])
    confirmed = [j for j in jobs if j.get("status") == "confirmed"]
    pending = [j for j in jobs if j.get("status") == "pending"]
    if pending:
        assert fixa.post(f"{BASE_URL}/api/partner/fixa/jobs/{pending[0]['id']}/stage", json={"stage": "working"}).status_code == 409
    assert fixa.post(f"{BASE_URL}/api/partner/fixa/jobs/nonexistent/stage", json={"stage": "working"}).status_code == 404
    assert fixa.post(f"{BASE_URL}/api/partner/fixa/jobs/x/stage", json={"stage": "bad"}).status_code == 422
    if not confirmed:
        pytest.skip("no confirmed job")
    jid = confirmed[0]["id"]
    assert seller.post(f"{BASE_URL}/api/partner/fixa/jobs/{jid}/stage", json={"stage": "working"}).status_code == 404
    for st in ("on_the_way", "working"):
        r = fixa.post(f"{BASE_URL}/api/partner/fixa/jobs/{jid}/stage", json={"stage": st})
        assert r.status_code == 200 and r.json()["job_stage"] == st
    jobs2 = fixa.get(f"{BASE_URL}/api/fixa/jobs").json()
    jobs2 = jobs2 if isinstance(jobs2, list) else (jobs2.get("jobs") or jobs2.get("items") or [])
    assert [j for j in jobs2 if j["id"] == jid][0].get("job_stage") == "working"


# --- existing agent endpoints
def test_agent_manager_and_leads(agent):
    r = agent.get(f"{BASE_URL}/api/agent/manager")
    assert r.status_code == 200, r.text
    d = r.json()
    print("manager keys", list(d.keys()) if isinstance(d, dict) else type(d))
    lst = d if isinstance(d, list) else (d.get("listings") or d.get("items") or [])
    assert lst
    pid = lst[0].get("id") or lst[0].get("property_id")
    r = agent.get(f"{BASE_URL}/api/agent/listings/{pid}/leads")
    assert r.status_code == 200, r.text


def test_viewings_mine(agent):
    r = agent.get(f"{BASE_URL}/api/viewings/mine", params={"role": "agent"})
    assert r.status_code == 200, r.text
    print("viewings", str(r.json())[:300])


def test_seller_endpoints(seller):
    r = seller.get(f"{BASE_URL}/api/marketplace/my-listings")
    assert r.status_code == 200, r.text
    r2 = seller.get(f"{BASE_URL}/api/marketplace/offers/received")
    assert r2.status_code == 200, r2.text
    print("offers", str(r2.json())[:300])


def test_chat_conversations(agent):
    r = agent.get(f"{BASE_URL}/api/chat/conversations")
    assert r.status_code == 200, r.text
    d = r.json()
    convs = d if isinstance(d, list) else (d.get("conversations") or d.get("items") or [])
    assert convs
    cid = convs[0]["id"]
    m = agent.get(f"{BASE_URL}/api/chat/conversations/{cid}/messages")
    assert m.status_code == 200, m.text
    p = agent.post(f"{BASE_URL}/api/chat/conversations/{cid}/messages", json={"text": "TEST_ hello from pytest"})
    assert p.status_code in (200, 201), p.text


def test_brand_login_and_products():
    r = requests.post(f"{BASE_URL}/api/brand/auth/login", json={"email": "brand.demo@amass.africa", "password": "Partner2026!"}, timeout=30)
    assert r.status_code == 200, r.text
    h = {"Authorization": f"Bearer {r.json()['token']}"}
    assert requests.get(f"{BASE_URL}/api/brand/me", headers=h, timeout=30).status_code == 200
    p = requests.get(f"{BASE_URL}/api/brand/products", headers=h, timeout=30)
    assert p.status_code == 200, p.text
