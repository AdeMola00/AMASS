# AMASS Partner app – iteration 2 retest: listing quota, FIXA finished/decline, offers accept/decline/counter, brand product create
import os
from datetime import date, timedelta

import pytest
import requests

BASE_URL = (os.environ.get("EXPO_BACKEND_URL") or os.environ.get("EXPO_PUBLIC_BACKEND_URL")).rstrip("/")


def login(email, pw):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw}, timeout=30)
    assert r.status_code == 200, r.text
    s = requests.Session()
    s.headers["Authorization"] = f"Bearer {r.json()['access_token']}"
    return s


@pytest.fixture(scope="module")
def adaeze():
    return login("adaeze.okoye@amass.africa", "Agent2026!")


@pytest.fixture(scope="module")
def agent_demo():
    return login("agent.demo@amass.africa", "Partner2026!")


@pytest.fixture(scope="module")
def seller():
    return login("seller.demo@amass.africa", "Partner2026!")


@pytest.fixture(scope="module")
def fixa():
    return login("fixa.demo@amass.africa", "Partner2026!")


@pytest.fixture(scope="module")
def buyer():
    return login("buyer.demo@amass.africa", "Partner2026!")


# --- (1) listing quota on /partner/me
def test_quota_adaeze_blocked(adaeze):
    q = adaeze.get(f"{BASE_URL}/api/partner/me").json()["listing_quota"]
    print("adaeze quota", q)
    assert set(q) >= {"plan_name", "limit", "used", "can_add"}
    assert q["can_add"] is False and q["used"] >= q["limit"]


def test_quota_agent_demo_free(agent_demo):
    d = agent_demo.get(f"{BASE_URL}/api/partner/me").json()
    print("agent.demo", d["roles"], d["listing_quota"])
    assert "agent" in d["roles"]
    assert d["listing_quota"]["can_add"] is True


def test_quota_matches_post_properties(adaeze):
    # Blocked user must really be refused by POST /api/properties (same rule)
    r = adaeze.post(f"{BASE_URL}/api/properties", json={"title": "TEST_quota", "description": "x", "price": 1, "listing_type": "rent", "property_type": "apartment", "bedrooms": 1, "bathrooms": 1, "size_sqm": 60, "location": "TEST", "city": "Lagos", "state": "Lagos", "latitude": 6.5, "longitude": 3.4, "images": []})
    print(r.status_code, r.text[:200])
    assert r.status_code in (402, 403, 409, 400)


def test_quota_absent_for_non_agent(seller):
    assert seller.get(f"{BASE_URL}/api/partner/me").json()["listing_quota"] is None


# --- (2) FIXA: book -> confirm -> finished leaves active count; book -> decline
def _fresh_buyer():
    import uuid
    r = requests.post(f"{BASE_URL}/api/auth/register", json={"email": f"test_partner_{uuid.uuid4().hex[:8]}@amass-qa.africa", "password": "TestPass2026!", "full_name": "TEST_ Buyer"}, timeout=30)
    assert r.status_code in (200, 201), r.text
    s = requests.Session()
    s.headers["Authorization"] = f"Bearer {r.json()['access_token']}"
    return s


def _book(_buyer, item_id, note):
    buyer = _fresh_buyer()  # one open booking per buyer+provider is allowed
    r = buyer.post(f"{BASE_URL}/api/marketplace/fixa/book", json={"item_id": item_id, "customer_name": "TEST_Kemi", "customer_phone": "+2348031000099", "address": "TEST_ 1 Test St, Yaba", "scheduled_date": (date.today() + timedelta(days=3)).isoformat(), "scheduled_time": "Morning", "notes": note})
    assert r.status_code in (200, 201), r.text
    d = r.json()
    return d.get("id") or d.get("booking", {}).get("id")


def test_fixa_finished_not_active(fixa, buyer):
    me = fixa.get(f"{BASE_URL}/api/partner/me").json()
    item_id = me["fixa"]["item_id"]
    bid = _book(buyer, item_id, "TEST_ finished flow")
    assert bid
    assert fixa.post(f"{BASE_URL}/api/fixa/jobs/{bid}/confirm", json={}).status_code == 200
    active_before = fixa.get(f"{BASE_URL}/api/partner/me").json()["counts"]["fixa_jobs_active"]
    for st in ("on_the_way", "working", "finished"):
        r = fixa.post(f"{BASE_URL}/api/partner/fixa/jobs/{bid}/stage", json={"stage": st})
        assert r.status_code == 200 and r.json()["job_stage"] == st
    active_after = fixa.get(f"{BASE_URL}/api/partner/me").json()["counts"]["fixa_jobs_active"]
    print("active before/after", active_before, active_after)
    assert active_after == active_before - 1
    job = next(j for j in fixa.get(f"{BASE_URL}/api/fixa/jobs").json()["items"] if j["id"] == bid)
    assert job["job_stage"] == "finished" and job["status"] == "confirmed"


def test_fixa_decline(fixa, buyer):
    item_id = fixa.get(f"{BASE_URL}/api/partner/me").json()["fixa"]["item_id"]
    new_before = fixa.get(f"{BASE_URL}/api/partner/me").json()["counts"]["fixa_jobs_new"]
    bid = _book(buyer, item_id, "TEST_ decline flow")
    assert fixa.get(f"{BASE_URL}/api/partner/me").json()["counts"]["fixa_jobs_new"] == new_before + 1
    r = fixa.post(f"{BASE_URL}/api/fixa/jobs/{bid}/decline", json={})
    assert r.status_code == 200, r.text
    job = next(j for j in fixa.get(f"{BASE_URL}/api/fixa/jobs").json()["items"] if j["id"] == bid)
    print("declined status", job["status"])
    assert job["status"] not in ("pending", "confirmed")
    assert fixa.get(f"{BASE_URL}/api/partner/me").json()["counts"]["fixa_jobs_new"] == new_before
    # stage on declined job must be refused
    assert fixa.post(f"{BASE_URL}/api/partner/fixa/jobs/{bid}/stage", json={"stage": "working"}).status_code == 409


# --- (5) seller offers: accept + decline + counter (counter_amount persisted)
def _seller_item(seller):
    items = seller.get(f"{BASE_URL}/api/marketplace/my-listings").json()
    return next(i for i in items if i.get("status", "active") == "active")


@pytest.mark.parametrize("action", ["decline", "counter", "accept"])
def test_offer_respond(seller, buyer, action):
    it = _seller_item(seller)
    r = buyer.post(f"{BASE_URL}/api/marketplace/items/{it['id']}/offer", json={"amount": 1000 + len(action), "message": f"TEST_ offer {action}"})
    assert r.status_code in (200, 201), r.text
    oid = r.json().get("id") or r.json().get("offer", {}).get("id")
    body = {"action": action}
    if action == "counter":
        body["counter_amount"] = 175000
    resp = seller.post(f"{BASE_URL}/api/marketplace/offers/{oid}/respond", json=body)
    assert resp.status_code == 200, resp.text
    o = next(x for x in seller.get(f"{BASE_URL}/api/marketplace/offers/received").json() if x["id"] == oid)
    expected = {"decline": "declined", "counter": "countered", "accept": "accepted"}[action]
    print(action, o["status"], o.get("counter_amount"))
    assert o["status"] == expected
    if action == "counter":
        assert o["counter_amount"] == 175000
    if action != "accept":
        buyer.post(f"{BASE_URL}/api/marketplace/offers/{oid}/withdraw", json={})


# --- (3) upload validation
def test_upload_too_large(seller):
    big = "data:image/png;base64," + "A" * (12 * 1024 * 1024)
    assert seller.post(f"{BASE_URL}/api/partner/upload", json={"data_url": big}).status_code == 413


# --- brand: create product -> GET -> delete
def test_brand_product_create_and_delete():
    r = requests.post(f"{BASE_URL}/api/brand/auth/login", json={"email": "brand.demo@amass.africa", "password": "Partner2026!"}, timeout=30)
    h = {"Authorization": f"Bearer {r.json()['token']}"}
    cats = requests.get(f"{BASE_URL}/api/shop/categories", timeout=30)
    cat = None
    if cats.status_code == 200:
        j = cats.json()
        lst = j if isinstance(j, list) else j.get("items") or j.get("categories") or []
        cat = lst[0]["key"] if lst else None
    if not cat:
        existing = requests.get(f"{BASE_URL}/api/brand/products", headers=h).json()["items"]
        cat = existing[0]["category"] if existing else "groceries"
    c = requests.post(f"{BASE_URL}/api/brand/products", headers=h, json={"name": "TEST_ Partner product", "category": cat, "price": 4500, "images": [], "published": False})
    assert c.status_code == 201, c.text
    pid = c.json()["id"]
    lst = requests.get(f"{BASE_URL}/api/brand/products", headers=h).json()["items"]
    assert any(p["id"] == pid and p["name"] == "TEST_ Partner product" for p in lst)
    assert requests.delete(f"{BASE_URL}/api/brand/products/{pid}", headers=h).status_code in (200, 204)
