# Iteration 103: Declutter promotion results + ad→chat attribution (ads/mine, ads/track, chat from-item)
import os
import uuid
import pytest
import requests
from pymongo import MongoClient
from dotenv import load_dotenv

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


@pytest.fixture(scope="module")
def ctx():
    demo_tok = _login(DEMO)
    listings = requests.get(f"{BASE_URL}/api/marketplace/my-listings", headers=_h(demo_tok), timeout=20).json()
    listings = listings.get("items", listings) if isinstance(listings, dict) else listings
    sofa = next(i for i in listings if i.get("name") == "Grey 3-seater sofa (demo)")
    shelf = next(i for i in listings if i.get("name") == "Oak bookshelf (demo)")
    email = f"TEST_iter103_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{BASE_URL}/api/auth/register", json={"email": email, "password": "Test12345!", "full_name": "TEST_ Buyer 103"}, timeout=20)
    assert r.status_code in (200, 201), r.text
    test_tok = r.json()["access_token"]
    test_uid = r.json()["user"]["id"]
    ads = requests.get(f"{BASE_URL}/api/ads/mine", headers=_h(demo_tok), timeout=20).json()
    sofa_ad = next(a for a in ads if a.get("marketplace_item_id") == sofa["id"])
    baseline = {k: sofa_ad.get(k, 0) for k in ("clicks", "chats", "impressions", "total_spent_tokens", "daily_spent_tokens")}
    c = {"demo": demo_tok, "test": test_tok, "test_uid": test_uid, "sofa": sofa, "shelf": shelf, "ad": sofa_ad, "baseline": baseline, "ads": ads}
    yield c
    # Cleanup: restore counters on the demo campaign, delete only what this run created (by ids)
    cur = _mongo.advertisements.find_one({"id": sofa_ad["id"]}, {"_id": 0})
    if cur:
        _mongo.advertisements.update_one({"id": sofa_ad["id"]}, {"$set": {k: baseline[k] for k in baseline}})
    for col in ("ad_clicks", "ad_feedback", "ad_impressions"):
        _mongo[col].delete_many({"user_id": test_uid, "ad_id": sofa_ad["id"]})
    _mongo.ad_feedback.delete_many({"ad_id": "does-not-exist", "event": "chat"})
    _mongo.ad_clicks.delete_many({"ad_id": sofa_ad["id"], "context": "test_iter103_self"})
    convs = list(_mongo.conversations.find({"participant_ids": test_uid}, {"_id": 0, "id": 1}))
    ids = [x["id"] for x in convs if "id" in x]
    if ids:
        _mongo.messages.delete_many({"conversation_id": {"$in": ids}})
        _mongo.conversations.delete_many({"id": {"$in": ids}})
    _mongo.users.delete_one({"id": test_uid})


def _ad(ctx):
    ads = requests.get(f"{BASE_URL}/api/ads/mine", headers=_h(ctx["demo"]), timeout=20).json()
    return next(a for a in ads if a["id"] == ctx["ad"]["id"])


class TestPromoResults:
    def test_sofa_has_campaign_with_counters(self, ctx):
        a = ctx["ad"]
        assert a.get("status") in ("active", "paused", "expired")
        for k in ("clicks", "chats", "impressions"):
            assert isinstance(a.get(k, 0), int)

    def test_bookshelf_has_no_campaign(self, ctx):
        assert not any(a.get("marketplace_item_id") == ctx["shelf"]["id"] for a in ctx["ads"])

    def test_ads_mine_no_mongo_id(self, ctx):
        assert all("_id" not in a for a in ctx["ads"])


class TestAttribution:
    def test_click_increments_views(self, ctx):
        before = _ad(ctx)["clicks"]
        r = requests.post(f"{BASE_URL}/api/ads/track", headers=_h(ctx["test"]), json={"ad_id": ctx["ad"]["id"], "event": "click", "context": "test"}, timeout=20)
        assert r.status_code == 200 and r.json().get("ok") is True
        assert _ad(ctx)["clicks"] == before + 1

    def test_chat_without_ad_does_not_increment(self, ctx):
        before = _ad(ctx).get("chats", 0)
        r = requests.post(f"{BASE_URL}/api/chat/conversations/from-item/{ctx['sofa']['id']}", headers=_h(ctx["test"]), timeout=20)
        assert r.status_code in (200, 201), r.text
        assert r.json().get("id")
        assert _ad(ctx).get("chats", 0) == before

    def test_chat_track_increments_chats(self, ctx):
        before = _ad(ctx).get("chats", 0)
        r = requests.post(f"{BASE_URL}/api/ads/track", headers=_h(ctx["test"]), json={"ad_id": ctx["ad"]["id"], "event": "chat", "context": "listing"}, timeout=20)
        assert r.status_code == 200
        assert _ad(ctx).get("chats", 0) == before + 1

    def test_track_unknown_ad_rejected(self, ctx):
        r = requests.post(f"{BASE_URL}/api/ads/track", json={"ad_id": "does-not-exist", "event": "chat"}, timeout=20)
        # Expectation: unknown ad → 404 (currently returns 200 ok and writes a feedback row)
        assert r.status_code == 404, f"got {r.status_code} {r.text}"

    def test_repeat_chat_track_same_user_is_deduped(self, ctx):
        before = _ad(ctx).get("chats", 0)
        requests.post(f"{BASE_URL}/api/ads/track", headers=_h(ctx["test"]), json={"ad_id": ctx["ad"]["id"], "event": "chat", "context": "listing"}, timeout=20)
        # Same buyer re-opening the same conversation should not count as a new chat
        assert _ad(ctx).get("chats", 0) == before, "chat counter not deduped per buyer"

    def test_seller_self_click_not_counted(self, ctx):
        before = _ad(ctx)["clicks"]
        requests.post(f"{BASE_URL}/api/ads/track", headers=_h(ctx["demo"]), json={"ad_id": ctx["ad"]["id"], "event": "click", "context": "test_iter103_self"}, timeout=20)
        after = _ad(ctx)["clicks"]
        assert after == before, "seller's own click inflated campaign views"
