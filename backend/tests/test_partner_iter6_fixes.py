# AMASS Partner app – iteration 6 retest: TTS model fix, tts-public rate limit, avatar URL guard, item share/go fixes
import asyncio
import base64
import os
import sys
import time
import uuid

import pytest
import requests
from dotenv import dotenv_values
from pymongo import MongoClient

BASE_URL = (os.environ.get("EXPO_BACKEND_URL") or os.environ.get("EXPO_PUBLIC_BACKEND_URL")).rstrip("/")
_env = dotenv_values("/app/backend/.env")
mdb = MongoClient(_env["MONGO_URL"])[_env["DB_NAME"]]
ERR_LOG = "/var/log/supervisor/backend.err.log"
PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="


def login(email, pw):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw}, timeout=30)
    assert r.status_code == 200, r.text
    s = requests.Session()
    s.headers["Authorization"] = f"Bearer {r.json()['access_token']}"
    s.uid = r.json()["user"]["id"]
    return s


def _log_count(needle):
    with open(ERR_LOG, errors="ignore") as f:
        return f.read().count(needle)


@pytest.fixture(scope="module")
def agent():
    return login("adaeze.okoye@amass.africa", "Agent2026!")


@pytest.fixture(scope="module")
def seller():
    return login("seller.demo@amass.africa", "Partner2026!")


# --- TTS: tts-1-hd / coral must succeed on the primary call (no fallback warning) ---
class TestTtsPrimary:
    def test_auth_tts_uncached_no_fallback(self, agent):
        before = _log_count("tts primary failed")
        r = agent.post(f"{BASE_URL}/api/partner/tts", json={"text": f"TEST check {uuid.uuid4().hex[:6]}. Your listing is live.", "lang": "en"}, timeout=120)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["cached"] is False and d["url"].startswith(f"{BASE_URL}/api/public-files/")
        a = requests.get(d["url"], timeout=60)
        assert a.status_code == 200 and "audio" in a.headers.get("content-type", "") and len(a.content) > 1000
        time.sleep(1)
        assert _log_count("tts primary failed") == before, "primary TTS model failed -> fallback used"

    def test_public_tts_uncached_no_fallback(self):
        before = _log_count("tts primary failed")
        r = requests.post(f"{BASE_URL}/api/partner/tts-public", json={"text": f"TEST hello {uuid.uuid4().hex[:6]}", "lang": "en"}, timeout=120)
        assert r.status_code == 200, r.text
        assert r.json()["cached"] is False
        time.sleep(1)
        assert _log_count("tts primary failed") == before


# --- tts-public rate limit (in-process, cache hit so no LLM calls) ---
class _Coll:
    async def find_one(self, *a, **k):
        return {"url": "https://x/cached.mp3"}


class _DB:
    partner_tts_cache = _Coll()


@pytest.fixture()
def local_client():
    sys.path.insert(0, "/app/backend")
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from partner_app import register_partner_routes

    app = FastAPI()
    app.include_router(register_partner_routes(_DB(), lambda: {"id": "u"}))
    return TestClient(app)


class TestTtsPublicRateLimit:
    def test_forged_first_hop_ignored(self, local_client):
        codes = [local_client.post("/api/partner/tts-public", json={"text": "hi"}, headers={"x-forwarded-for": f"{i}.1.1.1, 5.5.5.5"}).status_code for i in range(41)]
        assert codes[:40] == [200] * 40 and codes[40] == 429

    def test_global_cap_600(self, local_client):
        codes = [local_client.post("/api/partner/tts-public", json={"text": "hi"}, headers={"x-forwarded-for": f"7.7.{i // 250}.{i % 250}"}).status_code for i in range(601)]
        assert codes[:600].count(200) == 600 and codes[600] == 429


# --- Avatar URL guard ---
class TestAvatarGuard:
    @pytest.mark.parametrize("url", ["https://example.com/a.jpg", f"https://evil.com/?{BASE_URL}/api/public-files/x.jpg", f"{BASE_URL}/api/files/x.jpg", f"{BASE_URL}.evil.com/api/public-files/x.jpg"])
    def test_rejects(self, seller, url):
        r = seller.post(f"{BASE_URL}/api/partner/avatar", json={"url": url}, timeout=30)
        assert r.status_code == 400, r.text

    def test_upload_then_set(self, seller):
        old = mdb.users.find_one({"id": seller.uid}, {"_id": 0, "avatar_url": 1}).get("avatar_url")
        old_items = {d["id"]: d.get("seller_avatar") for d in mdb.marketplace.find({"seller_id": seller.uid}, {"_id": 0, "id": 1, "seller_avatar": 1})}
        up = seller.post(f"{BASE_URL}/api/partner/upload", json={"data_url": f"data:image/png;base64,{PNG}"}, timeout=60)
        assert up.status_code == 201, up.text
        try:
            r = seller.post(f"{BASE_URL}/api/partner/avatar", json={"url": up.json()["url"]}, timeout=30)
            assert r.status_code == 200, r.text
            assert seller.get(f"{BASE_URL}/api/partner/me", timeout=30).json()["user"]["avatar_url"] == up.json()["url"]
        finally:
            mdb.users.update_one({"id": seller.uid}, {"$set": {"avatar_url": old}})
            for iid, av in old_items.items():
                mdb.marketplace.update_one({"id": iid}, {"$set": {"seller_avatar": av}})


# --- Item share / go page ---
@pytest.fixture(scope="module")
def items(seller):
    ids = {}
    for st in ("active", "paused", "sold", "removed"):
        iid = f"TEST_{uuid.uuid4().hex}"
        mdb.marketplace.insert_one({"id": iid, "name": f"TEST_ item {st}", "price": 1000, "category": "furniture", "status": st, "seller_id": seller.uid, "city": "Lagos", "location": "Yaba", "image": "", "share_clicks": 0})
        ids[st] = iid
    yield ids
    mdb.marketplace.delete_many({"id": {"$in": list(ids.values())}})


class TestShareGo:
    def test_share_active_ok(self, items):
        r = requests.get(f"{BASE_URL}/api/partner/share/item/{items['active']}", timeout=30)
        assert r.status_code == 200 and r.json()["whatsapp_url"].startswith("https://api.whatsapp.com/send?text=")

    @pytest.mark.parametrize("st", ["paused", "sold", "removed"])
    def test_share_inactive_404(self, items, st):
        assert requests.get(f"{BASE_URL}/api/partner/share/item/{items[st]}", timeout=30).status_code == 404

    def test_go_removed_404(self, items):
        assert requests.get(f"{BASE_URL}/api/partner/go/item/{items['removed']}", timeout=30).status_code == 404

    def test_go_clicks_human_vs_bot(self, items):
        iid = items["active"]
        requests.get(f"{BASE_URL}/api/partner/go/item/{iid}", headers={"User-Agent": "WhatsApp/2.23.20.0 A"}, timeout=30)
        assert mdb.marketplace.find_one({"id": iid})["share_clicks"] == 0
        r = requests.get(f"{BASE_URL}/api/partner/go/item/{iid}", headers={"User-Agent": "Mozilla/5.0 (iPhone)"}, timeout=30)
        assert r.status_code == 200 and "amass://marketplace/" in r.text
        assert mdb.marketplace.find_one({"id": iid})["share_clicks"] == 1

    def test_go_store_links(self, items):
        existing = mdb.app_settings.find_one({"key": "social_publishing"})
        if existing:
            pytest.skip("social_publishing settings exist; not modifying user data")
        ins = mdb.app_settings.insert_one({"key": "social_publishing", "value": {"ios_store_url": "https://apps.apple.com/app/TEST", "android_store_url": "https://play.google.com/store/apps/TEST"}})
        try:
            r = requests.get(f"{BASE_URL}/api/partner/go/item/{items['active']}", headers={"User-Agent": "Mozilla/5.0"}, timeout=30)
            assert "Get AMASS on Android" in r.text and "Get AMASS on iPhone" in r.text and "play.google.com/store/apps/TEST" in r.text
        finally:
            mdb.app_settings.delete_one({"_id": ins.inserted_id})
        r2 = requests.get(f"{BASE_URL}/api/partner/go/item/{items['active']}", headers={"User-Agent": "Mozilla/5.0"}, timeout=30)
        assert "Get AMASS on" not in r2.text
