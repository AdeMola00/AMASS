# AMASS Partner app – iteration 3: PATCH /api/partner/listings/{id} (edit price/photos) + GET /api/partner/summary (weekly card) + share bundle
import os
import uuid

import pytest
import requests
from dotenv import dotenv_values
from pymongo import MongoClient

BASE_URL = (os.environ.get("EXPO_BACKEND_URL") or os.environ.get("EXPO_PUBLIC_BACKEND_URL")).rstrip("/")
_env = dotenv_values("/app/backend/.env")
mdb = MongoClient(_env["MONGO_URL"])[_env["DB_NAME"]]


def login(email, pw):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw}, timeout=30)
    assert r.status_code == 200, r.text
    s = requests.Session()
    s.headers["Authorization"] = f"Bearer {r.json()['access_token']}"
    return s


@pytest.fixture(scope="module")
def agent_demo():
    return login("agent.demo@amass.africa", "Partner2026!")


@pytest.fixture(scope="module")
def tunde():
    return login("tunde.bakare@amass.africa", "Agent2026!")


@pytest.fixture(scope="module")
def seller():
    return login("seller.demo@amass.africa", "Partner2026!")


@pytest.fixture(scope="module")
def fixa():
    return login("fixa.demo@amass.africa", "Partner2026!")


@pytest.fixture(scope="module")
def prop(agent_demo):
    r = agent_demo.post(f"{BASE_URL}/api/properties", json={"title": "TEST_iter3 edit home", "description": "TEST_ listing for partner edit", "price": 2500000, "listing_type": "rent", "property_type": "apartment", "bedrooms": 2, "bathrooms": 1, "size_sqm": 70, "location": "TEST Yaba", "city": "Lagos", "state": "Lagos", "latitude": 6.5, "longitude": 3.4, "images": ["https://example.com/a.jpg"]})
    assert r.status_code in (200, 201), r.text
    pid = r.json().get("id") or r.json().get("property", {}).get("id")
    yield pid
    mdb.properties.delete_one({"id": pid, "title": "TEST_iter3 edit home"})
    mdb.property_audit_logs.delete_many({"property_id": pid})


# --- edit listing
def test_edit_price_int_and_history(agent_demo, prop):
    r = agent_demo.patch(f"{BASE_URL}/api/partner/listings/{prop}", json={"price": 2750000.0})
    assert r.status_code == 200, r.text
    assert r.json()["price"] == 2750000
    doc = mdb.properties.find_one({"id": prop}, {"_id": 0, "price": 1, "price_history": 1})
    assert doc["price"] == 2750000 and isinstance(doc["price"], int)
    h = doc["price_history"][-1]
    print("price_history", h)
    assert h["old_price"] == 2500000 and h["price"] == 2750000
    g = requests.get(f"{BASE_URL}/api/properties/{prop}", headers=agent_demo.headers)
    print("GET property", g.status_code, g.json().get("price") if g.ok else g.text[:200])
    if g.ok:
        assert g.json()["price"] == 2750000


def test_edit_same_price_no_history(agent_demo, prop):
    before = len(mdb.properties.find_one({"id": prop})["price_history"])
    assert agent_demo.patch(f"{BASE_URL}/api/partner/listings/{prop}", json={"price": 2750000}).status_code == 200
    assert len(mdb.properties.find_one({"id": prop})["price_history"]) == before


def test_edit_images(agent_demo, prop):
    imgs = ["https://example.com/b.jpg", "https://example.com/c.jpg"]
    r = agent_demo.patch(f"{BASE_URL}/api/partner/listings/{prop}", json={"images": imgs})
    assert r.status_code == 200, r.text
    doc = mdb.properties.find_one({"id": prop})
    assert doc["images"] == imgs and doc["image"] == imgs[0] and doc["image_count"] == 2


def test_edit_images_empty_400(agent_demo, prop):
    r = agent_demo.patch(f"{BASE_URL}/api/partner/listings/{prop}", json={"images": []})
    assert r.status_code == 400 and "photo" in r.text.lower()


@pytest.mark.parametrize("price", [0, -5, "abc"])
def test_edit_bad_price_422(agent_demo, prop, price):
    assert agent_demo.patch(f"{BASE_URL}/api/partner/listings/{prop}", json={"price": price}).status_code == 422


def test_edit_other_agent_404(tunde, prop):
    r = tunde.patch(f"{BASE_URL}/api/partner/listings/{prop}", json={"price": 1})
    assert r.status_code == 404
    assert mdb.properties.find_one({"id": prop})["price"] == 2750000


def test_edit_nonexistent_404(agent_demo):
    assert agent_demo.patch(f"{BASE_URL}/api/partner/listings/nope-{uuid.uuid4().hex}", json={"price": 10}).status_code == 404


def test_edit_noauth_401(prop):
    assert requests.patch(f"{BASE_URL}/api/partner/listings/{prop}", json={"price": 10}).status_code in (401, 403)


# --- share bundle used by the WhatsApp button
def test_share_bundle(prop):
    r = requests.get(f"{BASE_URL}/api/share/property/{prop}")
    assert r.status_code == 200, r.text
    url = r.json()["whatsapp_url"]
    print("whatsapp_url", url[:200])
    assert "wa.me" in url


# --- weekly summary
def _metrics(block):
    return {m["key"]: m for m in block["metrics"]}


def _check_block(block, keys):
    assert set(_metrics(block)) == set(keys)
    assert len(block["series"]) == 7 and all("day" in s and isinstance(s["n"], int) for s in block["series"])


def test_summary_agent_sold_increments(agent_demo, prop):
    s0 = agent_demo.get(f"{BASE_URL}/api/partner/summary").json()
    _check_block(s0["agent"], ["homes_sold", "new_leads", "visits_confirmed"])
    before = _metrics(s0["agent"])["homes_sold"]["now"]
    r = agent_demo.patch(f"{BASE_URL}/api/agent/listings/{prop}/status", json={"status": "sold"})
    assert r.status_code == 200, r.text
    s1 = agent_demo.get(f"{BASE_URL}/api/partner/summary").json()
    assert _metrics(s1["agent"])["homes_sold"]["now"] == before + 1


def test_summary_seller_offer_won(seller):
    s0 = seller.get(f"{BASE_URL}/api/partner/summary").json()
    print("seller summary", s0)
    _check_block(s0["seller"], ["offers_won", "money_won", "offers_received"])
    assert "agent" not in s0
    m0 = _metrics(s0["seller"])
    items = [i for i in seller.get(f"{BASE_URL}/api/marketplace/my-listings").json() if i.get("status", "active") == "active"]
    if not items:
        pytest.skip("no active seller item")
    rb = requests.post(f"{BASE_URL}/api/auth/register", json={"email": f"test_partner_{uuid.uuid4().hex[:8]}@amass-qa.africa", "password": "TestPass2026!", "full_name": "TEST_ Buyer"}, timeout=30)
    tok = rb.json().get("access_token") or rb.json().get("token")
    buyer = requests.Session()
    buyer.headers["Authorization"] = f"Bearer {tok}"
    o = buyer.post(f"{BASE_URL}/api/marketplace/items/{items[0]['id']}/offer", json={"amount": 1234, "message": "TEST_ iter3 offer"})
    assert o.status_code in (200, 201), o.text
    oid = o.json().get("id") or o.json().get("offer", {}).get("id")
    s_mid = _metrics(seller.get(f"{BASE_URL}/api/partner/summary").json()["seller"])
    assert s_mid["offers_received"]["now"] == m0["offers_received"]["now"] + 1
    assert seller.post(f"{BASE_URL}/api/marketplace/offers/{oid}/respond", json={"action": "accept"}).status_code == 200
    m1 = _metrics(seller.get(f"{BASE_URL}/api/partner/summary").json()["seller"])
    assert m1["offers_won"]["now"] == m0["offers_won"]["now"] + 1
    assert m1["money_won"]["now"] == m0["money_won"]["now"] + 1234


def test_summary_fixa(fixa):
    s = fixa.get(f"{BASE_URL}/api/partner/summary").json()
    print("fixa summary keys", list(s), s.get("fixa"))
    _check_block(s["fixa"], ["jobs_done", "jobs_accepted", "rating"])


def test_summary_buyer_empty():
    b = login("buyer.demo@amass.africa", "Partner2026!")
    s = b.get(f"{BASE_URL}/api/partner/summary").json()
    print("buyer summary", s)
    assert "agent" not in s and "fixa" not in s


def test_summary_noauth():
    assert requests.get(f"{BASE_URL}/api/partner/summary").status_code in (401, 403)
