# AMASS Partner app – iteration 5: AI TTS (auth + public), chat voice notes, partner avatar, WhatsApp item share
import base64
import os
import uuid

import pytest
import requests
from dotenv import dotenv_values
from pymongo import MongoClient

BASE_URL = (os.environ.get("EXPO_BACKEND_URL") or os.environ.get("EXPO_PUBLIC_BACKEND_URL")).rstrip("/")
_env = dotenv_values("/app/backend/.env")
mdb = MongoClient(_env["MONGO_URL"])[_env["DB_NAME"]]
STATE: dict = {}


def login(email, pw):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw}, timeout=30)
    assert r.status_code == 200, r.text
    s = requests.Session()
    s.headers["Authorization"] = f"Bearer {r.json()['access_token']}"
    s.uid = r.json()["user"]["id"]
    return s


@pytest.fixture(scope="module")
def agent():
    return login("adaeze.okoye@amass.africa", "Agent2026!")


@pytest.fixture(scope="module")
def buyer():
    return login("buyer.demo@amass.africa", "Partner2026!")


@pytest.fixture(scope="module")
def seller():
    return login("seller.demo@amass.africa", "Partner2026!")


@pytest.fixture(scope="module")
def tunde():
    return login("tunde.bakare@amass.africa", "Agent2026!")


@pytest.fixture(scope="module")
def conv_id(agent, buyer):
    c = mdb.conversations.find_one({"participant_ids": {"$all": [agent.uid, buyer.uid]}}, {"_id": 0, "id": 1})
    if not c:
        pytest.skip("seeded agent<->Kemi chat not found")
    return c["id"]


# --- TTS ---
class TestTts:
    def test_tts_auth_and_cache(self, agent):
        text = f"TEST_ hello partner {uuid.uuid4().hex[:6]}"
        r1 = agent.post(f"{BASE_URL}/api/partner/tts", json={"text": text, "lang": "en"}, timeout=90)
        assert r1.status_code == 200, r1.text
        d1 = r1.json()
        assert d1["cached"] is False and "/api/public-files/" in d1["url"]
        r2 = agent.post(f"{BASE_URL}/api/partner/tts", json={"text": text, "lang": "en"}, timeout=60)
        assert r2.status_code == 200 and r2.json()["cached"] is True and r2.json()["url"] == d1["url"]
        a = requests.get(d1["url"], timeout=30)
        assert a.status_code == 200
        assert "audio/mpeg" in a.headers.get("content-type", "")
        assert len(a.content) > 1000
        STATE["tts_url"] = d1["url"]

    def test_tts_requires_auth(self):
        r = requests.post(f"{BASE_URL}/api/partner/tts", json={"text": "hi"}, timeout=30)
        assert r.status_code in (401, 403)

    def test_tts_bad_lang(self, agent):
        r = agent.post(f"{BASE_URL}/api/partner/tts", json={"text": "hi", "lang": "fr"}, timeout=30)
        assert r.status_code == 422

    def test_tts_public_ok_and_413(self):
        r = requests.post(f"{BASE_URL}/api/partner/tts-public", json={"text": "Welcome to AMASS Partner", "lang": "en"}, timeout=90)
        assert r.status_code == 200, r.text
        assert r.json()["url"].startswith("http")
        r2 = requests.post(f"{BASE_URL}/api/partner/tts-public", json={"text": "a" * 301, "lang": "en"}, timeout=30)
        assert r2.status_code == 413


# --- Voice notes ---
AUDIO_B64 = base64.b64encode(b"\x00\x00\x00\x18ftypM4A " + os.urandom(2000)).decode()


class TestVoiceNotes:
    def test_voice_upload_and_send(self, buyer, agent, conv_id):
        r = buyer.post(f"{BASE_URL}/api/partner/chat/{conv_id}/voice", json={"data_url": f"data:audio/mp4;base64,{AUDIO_B64}", "duration_ms": 4200}, timeout=60)
        assert r.status_code == 201, r.text
        d = r.json()
        assert d["mime"] == "audio/mp4" and d["duration_ms"] == 4200 and d["url"].endswith(".m4a")
        pub = requests.get(d["url"], timeout=30)
        assert pub.status_code == 200 and len(pub.content) > 1000
        m = buyer.post(f"{BASE_URL}/api/chat/conversations/{conv_id}/messages", json={"kind": "audio", "text": "", "attachments": [{"type": "audio", "url": d["url"], "duration_ms": 4200, "mime": "audio/mp4"}]}, timeout=30)
        assert m.status_code in (200, 201), m.text
        mid = m.json().get("id") or m.json().get("message", {}).get("id")
        STATE["voice_msg_id"] = mid
        g = agent.get(f"{BASE_URL}/api/chat/conversations/{conv_id}/messages", params={"limit": 50}, timeout=30)
        assert g.status_code == 200
        hit = [x for x in g.json()["items"] if x["id"] == mid]
        assert hit and hit[0]["kind"] == "audio" and hit[0]["attachments"][0]["url"] == d["url"]

    def test_voice_non_participant_403(self, tunde, conv_id):
        r = tunde.post(f"{BASE_URL}/api/partner/chat/{conv_id}/voice", json={"data_url": f"data:audio/mp4;base64,{AUDIO_B64}", "duration_ms": 1000}, timeout=30)
        assert r.status_code == 403

    def test_voice_non_audio_415(self, buyer, conv_id):
        r = buyer.post(f"{BASE_URL}/api/partner/chat/{conv_id}/voice", json={"data_url": f"data:image/png;base64,{AUDIO_B64}", "duration_ms": 1000}, timeout=30)
        assert r.status_code == 415

    def test_voice_short_422(self, buyer, conv_id):
        r = buyer.post(f"{BASE_URL}/api/partner/chat/{conv_id}/voice", json={"data_url": f"data:audio/mp4;base64,{AUDIO_B64}", "duration_ms": 200}, timeout=30)
        assert r.status_code == 422


# --- Avatar ---
class TestAvatar:
    def test_avatar_rejects_external(self, seller):
        r = seller.post(f"{BASE_URL}/api/partner/avatar", json={"url": "https://example.com/a.jpg"}, timeout=30)
        assert r.status_code == 400

    def test_avatar_set_and_propagate(self, seller):
        before = mdb.users.find_one({"id": seller.uid}, {"_id": 0, "avatar_url": 1}) or {}
        items_before = {x["id"]: x.get("seller_avatar") for x in mdb.marketplace.find({"seller_id": seller.uid}, {"_id": 0, "id": 1, "seller_avatar": 1})}
        url = f"{BASE_URL}/api/public-files/amass/public/TEST_/{uuid.uuid4().hex}.jpg"
        try:
            r = seller.post(f"{BASE_URL}/api/partner/avatar", json={"url": url}, timeout=30)
            assert r.status_code == 200 and r.json()["avatar_url"] == url
            me = seller.get(f"{BASE_URL}/api/partner/me", timeout=30).json()
            assert me["user"]["avatar_url"] == url
            assert items_before, "seller has no items"
            for it in mdb.marketplace.find({"seller_id": seller.uid}, {"_id": 0, "seller_avatar": 1}):
                assert it["seller_avatar"] == url
        finally:
            mdb.users.update_one({"id": seller.uid}, {"$set": {"avatar_url": before.get("avatar_url")}})
            for iid, av in items_before.items():
                mdb.marketplace.update_one({"id": iid}, {"$set": {"seller_avatar": av}})


# --- Share ---
class TestShare:
    def test_share_item_whatsapp(self, seller):
        it = mdb.marketplace.find_one({"seller_id": seller.uid, "status": "active", "category": {"$ne": "services"}}, {"_id": 0})
        assert it, "no live seller item"
        r = requests.get(f"{BASE_URL}/api/partner/share/item/{it['id']}", timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["whatsapp_url"].startswith("https://api.whatsapp.com/send?text=")
        assert it["name"] in d["text"] and f"{int(it['price']):,}" in d["text"] and d["link"] in d["text"]
        STATE["item"] = it

    def test_share_unknown_404(self):
        assert requests.get(f"{BASE_URL}/api/partner/share/item/nope-{uuid.uuid4().hex}", timeout=30).status_code == 404

    def test_share_service_404(self):
        svc = mdb.marketplace.find_one({"category": "services"}, {"_id": 0, "id": 1})
        if not svc:
            pytest.skip("no services item")
        assert requests.get(f"{BASE_URL}/api/partner/share/item/{svc['id']}", timeout=30).status_code == 404

    def test_go_item_html(self):
        it = STATE.get("item") or pytest.skip("no item")
        before = (mdb.marketplace.find_one({"id": it["id"]}, {"_id": 0, "share_clicks": 1}) or {}).get("share_clicks", 0)
        r = requests.get(f"{BASE_URL}/api/partner/go/item/{it['id']}", timeout=30)
        assert r.status_code == 200 and "text/html" in r.headers["content-type"]
        assert 'property="og:title"' in r.text and "Open in AMASS" in r.text and "og:image" in r.text
        after = mdb.marketplace.find_one({"id": it["id"]}, {"_id": 0, "share_clicks": 1}).get("share_clicks", 0)
        assert after == before + 1
        assert requests.get(f"{BASE_URL}/api/partner/go/item/nope", timeout=30).status_code == 404
