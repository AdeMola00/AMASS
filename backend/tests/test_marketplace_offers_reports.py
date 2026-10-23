"""Phase 3.6 — Marketplace sell-side: listing lifecycle, offers, reports, item chat.

Run: cd /app/backend && python -m pytest tests/test_marketplace_offers_reports.py -q
"""
import os
import uuid

import pytest
import requests

BASE = os.environ.get("TEST_BASE_URL", "http://localhost:8001/api")
DEMO = {"email": "demo@amass.africa", "password": "amass2026"}
IMG = "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800"


def _login(creds):
    r = requests.post(f"{BASE}/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _register():
    email = f"mkt.buyer+{uuid.uuid4().hex[:8]}@amass.africa"
    r = requests.post(f"{BASE}/auth/register", json={"email": email, "password": "Buyer2026!", "full_name": "Market Buyer"}, timeout=20)
    assert r.status_code in (200, 201), r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}, email


@pytest.fixture(scope="module")
def seller():
    return _login(DEMO)


@pytest.fixture(scope="module")
def buyer():
    return _register()[0]


@pytest.fixture(scope="module")
def listing(seller):
    body = {
        "name": f"Test sofa {uuid.uuid4().hex[:6]}",
        "description": "Three-seater fabric sofa in great condition, barely used.",
        "price": 120000,
        "category": "furniture",
        "subcategory": "sofas",
        "condition": "used",
        "image": IMG,
        "images": [IMG],
        "city": "Lagos - Lekki",
        "negotiable": True,
    }
    r = requests.post(f"{BASE}/marketplace/items", json=body, headers=seller, timeout=20)
    assert r.status_code == 200, r.text
    item = r.json()["item"]
    assert item["status"] == "active"
    yield item
    requests.delete(f"{BASE}/marketplace/items/{item['id']}", headers=seller, timeout=20)


def test_new_listing_visible_in_feed_and_my_listings(seller, listing):
    feed = requests.get(f"{BASE}/marketplace", params={"q": listing["name"]}, timeout=20).json()
    assert any(i["id"] == listing["id"] for i in feed)
    mine = requests.get(f"{BASE}/marketplace/my-listings", headers=seller, timeout=20).json()
    row = next(i for i in mine if i["id"] == listing["id"])
    assert row["open_offers"] == 0


def test_owner_can_edit_price_others_cannot(seller, buyer, listing):
    r = requests.patch(f"{BASE}/marketplace/items/{listing['id']}", json={"price": 110000}, headers=seller, timeout=20)
    assert r.status_code == 200 and r.json()["item"]["price"] == 110000
    r = requests.patch(f"{BASE}/marketplace/items/{listing['id']}", json={"price": 1}, headers=buyer, timeout=20)
    assert r.status_code == 403
    r = requests.patch(f"{BASE}/marketplace/items/{listing['id']}", json={}, headers=seller, timeout=20)
    assert r.status_code == 400


def test_seller_cannot_offer_on_own_listing(seller, listing):
    r = requests.post(f"{BASE}/marketplace/items/{listing['id']}/offer", json={"amount": 1000}, headers=seller, timeout=20)
    assert r.status_code == 400


def test_offer_counter_accept_flow_notifies_and_opens_chat(seller, buyer, listing):
    # Buyer offers → seller sees it in received + notification
    r = requests.post(f"{BASE}/marketplace/items/{listing['id']}/offer", json={"amount": 90000, "message": "Can do 90k cash today"}, headers=buyer, timeout=20)
    assert r.status_code == 200, r.text
    offer = r.json()["offer"]
    assert offer["status"] == "sent" and offer["asking_price"] == 110000

    received = requests.get(f"{BASE}/marketplace/offers/received", headers=seller, timeout=20).json()
    row = next(o for o in received if o["id"] == offer["id"])
    assert row["item"]["id"] == listing["id"] and row["buyer_name"] == "Market Buyer"

    mine = requests.get(f"{BASE}/marketplace/my-listings", headers=seller, timeout=20).json()
    assert next(i for i in mine if i["id"] == listing["id"])["open_offers"] == 1

    notes = requests.get(f"{BASE}/notifications", headers=seller, timeout=20).json()
    items = notes if isinstance(notes, list) else notes.get("items", [])
    assert any(n.get("kind") == "MARKET_OFFER" and (n.get("meta") or {}).get("offer_id") == offer["id"] for n in items)

    # Buyer cannot respond to their own un-countered offer
    r = requests.post(f"{BASE}/marketplace/offers/{offer['id']}/respond", json={"action": "accept"}, headers=buyer, timeout=20)
    assert r.status_code == 409

    # Seller counters
    r = requests.post(f"{BASE}/marketplace/offers/{offer['id']}/respond", json={"action": "counter", "counter_amount": 100000}, headers=seller, timeout=20)
    assert r.status_code == 200 and r.json()["offer"]["status"] == "countered"

    sent = requests.get(f"{BASE}/marketplace/offers/sent", headers=buyer, timeout=20).json()
    row = next(o for o in sent if o["id"] == offer["id"])
    assert row["counter_amount"] == 100000 and row["item"]["name"] == listing["name"]

    # Buyer accepts the counter → accepted + conversation created
    r = requests.post(f"{BASE}/marketplace/offers/{offer['id']}/respond", json={"action": "accept"}, headers=buyer, timeout=20)
    assert r.status_code == 200, r.text
    acc = r.json()["offer"]
    assert acc["status"] == "accepted" and acc["agreed_amount"] == 100000 and acc["conversation_id"]

    conv = requests.get(f"{BASE}/chat/conversations/{acc['conversation_id']}", headers=buyer, timeout=20).json()
    assert conv["kind"] == "marketplace" and conv["item"]["id"] == listing["id"]

    # Re-responding is rejected
    r = requests.post(f"{BASE}/marketplace/offers/{offer['id']}/respond", json={"action": "decline"}, headers=seller, timeout=20)
    assert r.status_code == 409


def test_new_offer_supersedes_open_one_and_withdraw(buyer, seller, listing):
    a = requests.post(f"{BASE}/marketplace/items/{listing['id']}/offer", json={"amount": 70000}, headers=buyer, timeout=20).json()["offer"]
    b = requests.post(f"{BASE}/marketplace/items/{listing['id']}/offer", json={"amount": 75000}, headers=buyer, timeout=20).json()["offer"]
    sent = requests.get(f"{BASE}/marketplace/offers/sent", headers=buyer, timeout=20).json()
    ids = {o["id"] for o in sent}
    assert b["id"] in ids and a["id"] not in ids  # superseded hidden
    r = requests.post(f"{BASE}/marketplace/offers/{b['id']}/withdraw", headers=buyer, timeout=20)
    assert r.status_code == 200 and r.json()["offer"]["status"] == "withdrawn"
    r = requests.post(f"{BASE}/marketplace/offers/{b['id']}/withdraw", headers=buyer, timeout=20)
    assert r.status_code == 409


def test_chat_from_item_is_idempotent_and_blocks_self(buyer, seller, listing):
    r1 = requests.post(f"{BASE}/chat/conversations/from-item/{listing['id']}", headers=buyer, timeout=20)
    r2 = requests.post(f"{BASE}/chat/conversations/from-item/{listing['id']}", headers=buyer, timeout=20)
    assert r1.status_code == 200 and r1.json()["id"] == r2.json()["id"]
    assert r1.json()["kind"] == "marketplace"
    r = requests.post(f"{BASE}/chat/conversations/from-item/{listing['id']}", headers=seller, timeout=20)
    assert r.status_code == 400
    inbox = requests.get(f"{BASE}/chat/conversations", headers=seller, timeout=20).json()["items"]
    row = next(c for c in inbox if c["id"] == r1.json()["id"])
    assert row["item"]["name"] == listing["name"]


def test_report_listing_dedupes_and_admin_resolves(buyer, seller, listing):
    r = requests.post(f"{BASE}/marketplace/items/{listing['id']}/report", json={"reason": "scam", "details": "Asked for deposit upfront"}, headers=buyer, timeout=20)
    assert r.status_code == 200 and r.json()["ok"]
    rid = r.json()["report_id"]
    r = requests.post(f"{BASE}/marketplace/items/{listing['id']}/report", json={"reason": "other"}, headers=buyer, timeout=20)
    assert r.json()["report_id"] == rid and r.json()["duplicate"]
    r = requests.post(f"{BASE}/marketplace/items/{listing['id']}/report", json={"reason": "scam"}, headers=seller, timeout=20)
    assert r.status_code == 400  # own listing

    # Admin queue (demo is admin); buyer is not
    r = requests.get(f"{BASE}/marketplace/admin/reports", headers=buyer, timeout=20)
    assert r.status_code == 403
    q = requests.get(f"{BASE}/marketplace/admin/reports", headers=seller, timeout=20).json()
    row = next(x for x in q["items"] if x["id"] == rid)
    assert row["item"]["id"] == listing["id"] and row["reason"] == "other"

    r = requests.post(f"{BASE}/marketplace/admin/reports/{rid}/resolve", json={"action": "dismiss", "note": "Looks fine"}, headers=seller, timeout=20)
    assert r.status_code == 200
    q = requests.get(f"{BASE}/marketplace/admin/reports", headers=seller, timeout=20).json()
    assert not any(x["id"] == rid for x in q["items"])


def test_mark_sold_hides_from_feed_closes_offers_but_detail_still_opens(buyer, seller, listing):
    off = requests.post(f"{BASE}/marketplace/items/{listing['id']}/offer", json={"amount": 80000}, headers=buyer, timeout=20).json()["offer"]
    r = requests.patch(f"{BASE}/marketplace/items/{listing['id']}", json={"status": "sold"}, headers=seller, timeout=20)
    assert r.status_code == 200 and r.json()["item"]["status"] == "sold"
    feed = requests.get(f"{BASE}/marketplace", params={"q": listing["name"]}, timeout=20).json()
    assert not any(i["id"] == listing["id"] for i in feed)
    detail = requests.get(f"{BASE}/marketplace/items/{listing['id']}", timeout=20)
    assert detail.status_code == 200 and detail.json()["item"]["status"] == "sold"
    sent = requests.get(f"{BASE}/marketplace/offers/sent", headers=buyer, timeout=20).json()
    assert next(o for o in sent if o["id"] == off["id"])["status"] == "declined"
    r = requests.post(f"{BASE}/marketplace/items/{listing['id']}/offer", json={"amount": 80000}, headers=buyer, timeout=20)
    assert r.status_code == 409
    seller_page = requests.get(f"{BASE}/marketplace/sellers/{listing['seller_id']}", timeout=20).json()
    assert any(i["id"] == listing["id"] and i["status"] == "sold" for i in seller_page["items"])


def test_delete_hides_everywhere(seller, listing):
    r = requests.delete(f"{BASE}/marketplace/items/{listing['id']}", headers=seller, timeout=20)
    assert r.status_code == 200
    assert requests.get(f"{BASE}/marketplace/items/{listing['id']}", timeout=20).status_code == 404
    mine = requests.get(f"{BASE}/marketplace/my-listings", headers=seller, timeout=20).json()
    assert not any(i["id"] == listing["id"] for i in mine)
