# AMASS Partner app – iteration 7: Verified face badge (AI check), share-stats, native-voice TTS fallback (yo/ha/ig)
import base64
import json
import os
import time
import uuid

import pytest
import requests
from dotenv import dotenv_values
from pymongo import MongoClient

BASE_URL = (os.environ.get("EXPO_BACKEND_URL") or os.environ.get("EXPO_PUBLIC_BACKEND_URL")).rstrip("/")
_env = dotenv_values("/app/backend/.env")
mdb = MongoClient(_env["MONGO_URL"])[_env["DB_NAME"]]
FACE = "/tmp/face.jpg"   # real portrait (Unsplash photo-1507003211169)
SOFA = "/tmp/sofa.jpg"   # sofa product photo (Unsplash photo-1555041469)
BROWSER_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1"
SNAP = "/tmp/iter7_counter_snapshot.json"


def login(email, pw):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw}, timeout=30)
    assert r.status_code == 200, r.text
    s = requests.Session()
    s.headers["Authorization"] = f"Bearer {r.json()['access_token']}"
    s.uid = r.json()["user"]["id"]
    return s


def _data_url(path):
    with open(path, "rb") as f:
        return "data:image/jpeg;base64," + base64.b64encode(f.read()).decode()


@pytest.fixture(scope="module")
def fixa():
    return login("fixa.demo@amass.africa", "Partner2026!")


@pytest.fixture(scope="module")
def agent():
    return login("adaeze.okoye@amass.africa", "Agent2026!")


@pytest.fixture(scope="module")
def seller():
    return login("seller.demo@amass.africa", "Partner2026!")


# --- Verified face badge ---
class TestFaceVerify:
    @pytest.fixture(scope="class", autouse=True)
    def restore(self, fixa):
        u = mdb.users.find_one({"id": fixa.uid}, {"_id": 0, "avatar_url": 1, "face_verified": 1, "face_checked_at": 1})
        items = list(mdb.marketplace.find({"seller_id": fixa.uid}, {"_id": 0, "id": 1, "seller_avatar": 1, "seller_face_verified": 1, "fixa_badges": 1}))
        yield
        mdb.users.update_one({"id": fixa.uid}, {"$set": {"avatar_url": u.get("avatar_url")}})
        for k in ("face_verified", "face_checked_at"):
            if k in u:
                mdb.users.update_one({"id": fixa.uid}, {"$set": {k: u[k]}})
            else:
                mdb.users.update_one({"id": fixa.uid}, {"$unset": {k: ""}})
        for it in items:
            st = {k: it[k] for k in ("seller_avatar", "seller_face_verified", "fixa_badges") if k in it}
            uns = {k: "" for k in ("seller_avatar", "seller_face_verified", "fixa_badges") if k not in it}
            upd = {}
            if st:
                upd["$set"] = st
            if uns:
                upd["$unset"] = uns
            if upd:
                mdb.marketplace.update_one({"id": it["id"]}, upd)

    def _set(self, s, path):
        up = s.post(f"{BASE_URL}/api/partner/upload", json={"data_url": _data_url(path)}, timeout=60)
        assert up.status_code == 201, up.text
        t = time.time()
        r = s.post(f"{BASE_URL}/api/partner/avatar", json={"url": up.json()["url"]}, timeout=90)
        print(f"avatar {path}: {r.status_code} {r.text[:200]} in {time.time()-t:.1f}s")
        assert r.status_code == 200, r.text
        return r.json(), up.json()["url"]

    def test_real_face_verified(self, fixa):
        d, url = self._set(fixa, FACE)
        assert d["face_verified"] is True
        me = fixa.get(f"{BASE_URL}/api/partner/me", timeout=30).json()
        assert me["user"]["face_verified"] is True and me["user"]["avatar_url"] == url
        svc = list(mdb.marketplace.find({"seller_id": fixa.uid, "category": "services"}, {"_id": 0, "fixa_badges": 1, "seller_face_verified": 1}))
        assert svc, "fixa.demo has no FIXA service item"
        assert all("Verified face" in (x.get("fixa_badges") or []) for x in svc)
        assert all(x.get("seller_face_verified") is True for x in svc)

    def test_non_face_unverified_badge_removed(self, fixa):
        d, _ = self._set(fixa, SOFA)
        assert d["face_verified"] is False
        me = fixa.get(f"{BASE_URL}/api/partner/me", timeout=30).json()
        assert me["user"]["face_verified"] is False
        svc = list(mdb.marketplace.find({"seller_id": fixa.uid, "category": "services"}, {"_id": 0, "fixa_badges": 1}))
        assert all("Verified face" not in (x.get("fixa_badges") or []) for x in svc)

    def test_agent_properties_flag(self, agent):
        # agent_face_verified propagates to the agent's properties (restore after)
        u = mdb.users.find_one({"id": agent.uid}, {"_id": 0, "avatar_url": 1, "face_verified": 1})
        props = list(mdb.properties.find({"agent_id": agent.uid}, {"_id": 0, "id": 1, "agent_avatar": 1, "agent_face_verified": 1}))
        try:
            d, _ = self._set(agent, FACE)
            assert d["face_verified"] is True
            assert mdb.properties.count_documents({"agent_id": agent.uid, "agent_face_verified": {"$ne": True}}) == 0
        finally:
            mdb.users.update_one({"id": agent.uid}, {"$set": {"avatar_url": u.get("avatar_url"), "face_verified": bool(u.get("face_verified"))}})
            for p in props:
                st = {k: p[k] for k in ("agent_avatar", "agent_face_verified") if k in p}
                uns = {k: "" for k in ("agent_avatar", "agent_face_verified") if k not in p}
                upd = {}
                if st:
                    upd["$set"] = st
                if uns:
                    upd["$unset"] = uns
                mdb.properties.update_one({"id": p["id"]}, upd)


# --- Share stats ---
class TestShareStats:
    def test_requires_auth(self):
        assert requests.get(f"{BASE_URL}/api/partner/share-stats", timeout=30).status_code in (401, 403)

    def test_counts_increase(self, agent, seller):
        props = list(mdb.properties.find({"agent_id": agent.uid}, {"_id": 0, "id": 1, "smart_link_clicks": 1}).limit(1))
        items = list(mdb.marketplace.find({"seller_id": seller.uid, "category": {"$ne": "services"}, "status": {"$ne": "removed"}}, {"_id": 0, "id": 1, "share_clicks": 1}).limit(1))
        assert props and items
        pid, iid = props[0]["id"], items[0]["id"]
        # snapshot originals so a helper can restore after frontend checks
        if not os.path.exists(SNAP):
            json.dump({"pid": pid, "iid": iid, "p": props[0].get("smart_link_clicks"), "i": items[0].get("share_clicks"), "t": time.time()}, open(SNAP, "w"))
        s0a = agent.get(f"{BASE_URL}/api/partner/share-stats", timeout=30).json()
        s0s = seller.get(f"{BASE_URL}/api/partner/share-stats", timeout=30).json()
        assert set(s0a) >= {"properties", "items", "total"}
        p0, i0 = s0a["properties"].get(pid, 0), s0s["items"].get(iid, 0)
        for _ in range(2):
            requests.get(f"{BASE_URL}/api/go/{pid}", headers={"User-Agent": BROWSER_UA}, allow_redirects=False, timeout=30)
            r = requests.get(f"{BASE_URL}/api/partner/go/item/{iid}", headers={"User-Agent": BROWSER_UA}, timeout=30)
            assert r.status_code == 200
        # bots don't count
        requests.get(f"{BASE_URL}/api/partner/go/item/{iid}", headers={"User-Agent": "WhatsApp/2.23.20.0 A"}, timeout=30)
        requests.get(f"{BASE_URL}/api/go/{pid}", headers={"User-Agent": "WhatsApp/2.23.20.0 A"}, allow_redirects=False, timeout=30)
        s1a = agent.get(f"{BASE_URL}/api/partner/share-stats", timeout=30).json()
        s1s = seller.get(f"{BASE_URL}/api/partner/share-stats", timeout=30).json()
        assert s1a["properties"][pid] == p0 + 2
        assert s1s["items"][iid] == i0 + 2
        assert s1a["total"] == sum(s1a["properties"].values()) + sum(s1a["items"].values())

    def test_services_excluded(self, fixa):
        d = fixa.get(f"{BASE_URL}/api/partner/share-stats", timeout=30).json()
        svc_ids = {x["id"] for x in mdb.marketplace.find({"seller_id": fixa.uid, "category": "services"}, {"_id": 0, "id": 1})}
        assert not (svc_ids & set(d["items"]))


# --- TTS native langs fall back to OpenAI without SPITCH_API_KEY ---
@pytest.mark.parametrize("lang,text", [("yo", "Ẹ kú àárọ̀, ilé yìí dára"), ("ha", "Sannu, gidan nan yana da kyau"), ("ig", "Ndewo, ụlọ a mara mma")])
def test_tts_native_fallback(agent, lang, text):
    r = agent.post(f"{BASE_URL}/api/partner/tts", json={"text": f"{text} {uuid.uuid4().hex[:4]}", "lang": lang}, timeout=120)
    assert r.status_code == 200, r.text
    a = requests.get(r.json()["url"], timeout=60)
    assert a.status_code == 200 and "audio" in a.headers.get("content-type", "") and len(a.content) > 1000
