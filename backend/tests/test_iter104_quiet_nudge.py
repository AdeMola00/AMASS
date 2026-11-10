"""Iteration 104 — quiet-listing nudge: my-listings exposes quiet_days, the sweep notifies once, promoted/viewed listings are skipped."""
import asyncio
import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import MongoClient

load_dotenv("/app/frontend/.env")
load_dotenv("/app/backend/.env")
BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL").rstrip("/")
DEMO = {"email": "demo@amass.africa", "password": "amass2026"}
_mongo = MongoClient(os.environ.get("MONGO_URL"))[os.environ.get("DB_NAME")]


def _login(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


def _sweep():
    import sys

    sys.path.insert(0, "/app/backend")
    from marketplace_v2 import quiet_listing_sweep

    async def run():
        adb = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
        return await quiet_listing_sweep(adb)

    return asyncio.run(run())


@pytest.fixture(scope="module")
def seller():
    tok = _login(DEMO)
    me = requests.get(f"{BASE_URL}/api/auth/me", headers=_h(tok), timeout=20).json()
    return tok, me["id"]


@pytest.fixture
def listing(seller):
    tok, uid = seller
    img = "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800"
    r = requests.post(
        f"{BASE_URL}/api/marketplace/items",
        headers=_h(tok),
        json={"name": f"TEST_ quiet {uuid.uuid4().hex[:6]}", "description": "Automated test listing for the quiet nudge.", "price": 1000, "category": "furniture", "subcategory": "shelves", "condition": "used", "image": img, "images": [img], "city": "Lagos - Lekki", "location": "Lekki", "negotiable": False, "contact_prefs": ["chat"]},
        timeout=20,
    )
    assert r.status_code == 200, r.text
    item = r.json()["item"]
    yield tok, uid, item["id"]
    _mongo.marketplace.delete_one({"id": item["id"]})
    _mongo.notifications.delete_many({"meta.item_id": item["id"]})
    _mongo.marketplace_views.delete_many({"item_id": item["id"]})
    _mongo.advertisements.delete_many({"marketplace_item_id": item["id"]})


def _age(item_id, days):
    _mongo.marketplace.update_one({"id": item_id}, {"$set": {"posted_at": (datetime.now(timezone.utc) - timedelta(days=days, hours=1)).isoformat()}, "$unset": {"quiet_nudged_at": ""}})


def _mine(tok, item_id):
    return next(d for d in requests.get(f"{BASE_URL}/api/marketplace/my-listings", headers=_h(tok), timeout=20).json() if d["id"] == item_id)


def test_fresh_listing_is_not_quiet(listing):
    tok, _, iid = listing
    d = _mine(tok, iid)
    assert d["quiet_days"] == 0 and d["last_viewed_at"] is None


def test_quiet_days_and_single_nudge(listing):
    tok, uid, iid = listing
    _age(iid, 4)
    assert _mine(tok, iid)["quiet_days"] == 4
    before = _mongo.notifications.count_documents({"user_id": uid, "kind": "MARKET_QUIET_LISTING", "meta.item_id": iid})
    _sweep()
    after = _mongo.notifications.count_documents({"user_id": uid, "kind": "MARKET_QUIET_LISTING", "meta.item_id": iid})
    assert after == before + 1
    n = _mongo.notifications.find_one({"user_id": uid, "kind": "MARKET_QUIET_LISTING", "meta.item_id": iid}, sort=[("created_at", -1)])
    assert n["action_url"] == f"/marketplace/my-listings?promote={iid}"
    assert "4 days" in n["body"]
    # cooldown: a second sweep must not nudge the same listing again
    _sweep()
    assert _mongo.notifications.count_documents({"user_id": uid, "kind": "MARKET_QUIET_LISTING", "meta.item_id": iid}) == after
    # consumer notification centre lists it (it's a marketplace kind, not a pro kind)
    c = requests.get(f"{BASE_URL}/api/notifications/center?audience=consumer&limit=50", headers=_h(tok), timeout=20).json()
    assert any(x["kind"] == "MARKET_QUIET_LISTING" and x.get("meta", {}).get("item_id") == iid for x in c["items"])


def test_recent_view_resets_quiet(listing):
    tok, uid, iid = listing
    _age(iid, 5)
    # a buyer viewed it yesterday
    _mongo.marketplace_views.insert_one({"item_id": iid, "user_id": "TEST_buyer", "last_viewed_at": datetime.now(timezone.utc) - timedelta(days=1)})
    d = _mine(tok, iid)
    assert d["quiet_days"] == 1 and d["last_viewed_at"] is not None
    before = _mongo.notifications.count_documents({"user_id": uid, "kind": "MARKET_QUIET_LISTING", "meta.item_id": iid})
    _sweep()
    assert _mongo.notifications.count_documents({"user_id": uid, "kind": "MARKET_QUIET_LISTING", "meta.item_id": iid}) == before


def test_promoted_listing_is_not_nudged(listing):
    tok, uid, iid = listing
    _age(iid, 6)
    _mongo.advertisements.insert_one({"id": f"TEST_ad_{uuid.uuid4().hex[:6]}", "seller_id": uid, "marketplace_item_id": iid, "status": "active", "tier": "basic"})
    before = _mongo.notifications.count_documents({"user_id": uid, "kind": "MARKET_QUIET_LISTING", "meta.item_id": iid})
    _sweep()
    assert _mongo.notifications.count_documents({"user_id": uid, "kind": "MARKET_QUIET_LISTING", "meta.item_id": iid}) == before


def test_sold_listing_has_no_quiet_days(listing):
    tok, _, iid = listing
    _age(iid, 6)
    r = requests.patch(f"{BASE_URL}/api/marketplace/items/{iid}", headers=_h(tok), json={"status": "sold"}, timeout=20)
    assert r.status_code == 200, r.text
    assert _mine(tok, iid)["quiet_days"] is None
