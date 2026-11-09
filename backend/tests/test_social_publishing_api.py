"""Iteration 94: Social publishing (admin cockpit), smart link /api/go, share bundle, auto-post hook."""
import os
import time

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL").rstrip("/")
IOS_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1"
DEFAULT_TAGS = ["AMASS", "AmassAfrica", "RealEstateNigeria", "LagosProperty", "PropertyNigeria", "HouseHunting"]
PLATS = ["facebook", "instagram", "x", "linkedin", "tiktok"]


def _url_len(text):
    import re
    return len(re.sub(r"https?://\S+", "x" * 23, text))


@pytest.fixture(scope="module")
def H():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "demo@amass.africa", "password": "amass2026"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def agent_H():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "adaeze.okoye@amass.africa", "password": "Agent2026!"})
    if r.status_code != 200:
        pytest.skip("agent login failed")
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def pid(H):
    r = requests.get(f"{BASE_URL}/api/admin/social/listings", headers=H)
    assert r.status_code == 200
    items = r.json()["items"]
    assert items
    return items[0]["id"]


created = []


@pytest.fixture(scope="module", autouse=True)
def cleanup(H):
    yield
    for i in created:
        requests.delete(f"{BASE_URL}/api/admin/social/posts/{i}", headers=H)
    requests.patch(f"{BASE_URL}/api/admin/social/settings", headers=H, json={"auto_post": {"tiktok": False}, "hashtags": DEFAULT_TAGS, "ios_store_url": "", "android_store_url": ""})


# ─── overview + auth ───
class TestOverview:
    def test_overview(self, H):
        r = requests.get(f"{BASE_URL}/api/admin/social/overview", headers=H)
        assert r.status_code == 200
        d = r.json()
        assert [p["platform"] for p in d["platforms"]] == PLATS
        for p in d["platforms"]:
            assert p["configured"] is False and p["connected"] is False
            assert p["missing_keys"] and p["how"] and p["keys"]
        assert isinstance(d["settings"]["auto_post"], dict) and isinstance(d["settings"]["hashtags"], list)
        assert "clicks_by_source" in d["stats"] and isinstance(d["recent"], list)

    def test_anon_and_non_admin(self, agent_H):
        assert requests.get(f"{BASE_URL}/api/admin/social/overview").status_code in (401, 403)
        assert requests.get(f"{BASE_URL}/api/admin/social/overview", headers=agent_H).status_code in (401, 403)


# ─── settings ───
class TestSettings:
    def test_patch(self, H):
        r = requests.patch(f"{BASE_URL}/api/admin/social/settings", headers=H, json={"auto_post": {"tiktok": True}, "hashtags": ["#AMASS", "Lagos Homes"], "ios_store_url": "https://apps.apple.com/app/id1"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["hashtags"] == ["AMASS", "LagosHomes"]
        assert d["auto_post"]["tiktok"] is True
        assert d["ios_store_url"] == "https://apps.apple.com/app/id1"

    def test_http_store_url_backend(self, H):
        r = requests.patch(f"{BASE_URL}/api/admin/social/settings", headers=H, json={"ios_store_url": "http://insecure.example"})
        print("http store url status", r.status_code)  # report only

    def test_bad_privacy(self, H):
        assert requests.patch(f"{BASE_URL}/api/admin/social/settings", headers=H, json={"tiktok_privacy": "BAD"}).status_code == 400

    def test_restore(self, H):
        r = requests.patch(f"{BASE_URL}/api/admin/social/settings", headers=H, json={"auto_post": {"tiktok": False}, "hashtags": DEFAULT_TAGS, "ios_store_url": ""})
        assert r.status_code == 200
        assert r.json()["auto_post"]["tiktok"] is False and r.json()["hashtags"] == DEFAULT_TAGS and r.json()["ios_store_url"] == ""


# ─── test / connect ───
class TestConnect:
    def test_x(self, H):
        r = requests.post(f"{BASE_URL}/api/admin/social/test/x", headers=H)
        assert r.status_code == 400 and "X_API_KEY" in r.json()["detail"]

    def test_linkedin(self, H):
        r = requests.get(f"{BASE_URL}/api/admin/social/connect/linkedin", headers=H)
        assert r.status_code == 400 and "LINKEDIN_CLIENT_ID" in r.json()["detail"]

    def test_fb_and_bogus(self, H):
        assert requests.get(f"{BASE_URL}/api/admin/social/connect/facebook", headers=H).status_code == 400
        assert requests.post(f"{BASE_URL}/api/admin/social/test/bogus", headers=H).status_code == 422


# ─── listings + compose ───
class TestCompose:
    def test_listings(self, H):
        d = requests.get(f"{BASE_URL}/api/admin/social/listings", headers=H).json()
        it = d["items"][0]
        assert it["verified"] is True and it["images"] and "price_label" in it and "location_label" in it and "already_posted" in it
        s = requests.get(f"{BASE_URL}/api/admin/social/listings", headers=H, params={"search": "Lekki"}).json()["items"]
        assert s and all("lekki" in str(x).lower() for x in s)

    def test_compose(self, H, pid):
        r = requests.get(f"{BASE_URL}/api/admin/social/compose/{pid}", headers=H)
        assert r.status_code == 200
        d = r.json()
        c = d["captions"]
        assert set(c) == set(PLATS)
        assert _url_len(c["x"]) <= 280, _url_len(c["x"])
        assert c["x"].rstrip().endswith(f"/api/go/{pid}?src=x")
        assert "http" not in c["instagram"] and "link in our bio" in c["instagram"].lower()
        assert f"/api/go/{pid}?src=facebook" in c["facebook"]
        assert f"/api/go/{pid}?src=linkedin" in c["linkedin"]
        assert d["image_url"] and d["link"] and len(d["platforms"]) == 5 and "previous_posts" in d
        assert all(p["connected"] is False for p in d["platforms"])

    def test_compose_404(self, H):
        assert requests.get(f"{BASE_URL}/api/admin/social/compose/nope-xyz", headers=H).status_code == 404


# ─── posts lifecycle + smart link ───
class TestPosts:
    def test_lifecycle(self, H, pid):
        r = requests.post(f"{BASE_URL}/api/admin/social/posts", headers=H, json={"property_id": pid, "platforms": ["facebook", "x"], "captions": {"x": "custom"}})
        assert r.status_code == 201, r.text
        p = r.json()
        created.append(p["id"])
        assert p["status"] == "queued"
        assert p["results"]["facebook"]["status"] == "queued" and "connected" in p["results"]["facebook"]["error"]
        assert p["captions"]["x"] == "custom"
        ids = [x["id"] for x in requests.get(f"{BASE_URL}/api/admin/social/posts", headers=H).json()["items"]]
        assert p["id"] in ids
        r = requests.post(f"{BASE_URL}/api/admin/social/posts/{p['id']}/retry", headers=H)
        assert r.status_code == 200 and r.json()["status"] == "queued"
        r = requests.post(f"{BASE_URL}/api/admin/social/publish-queued", headers=H)
        assert r.status_code == 200 and r.json()["attempted"] >= 1

        # smart link click counting
        before = requests.get(f"{BASE_URL}/api/admin/social/overview", headers=H).json()["stats"]["clicks_by_source"].get("instagram", 0)
        r = requests.get(f"{BASE_URL}/api/go/{pid}", params={"src": "instagram", "post": p["id"]}, headers={"User-Agent": IOS_UA}, allow_redirects=False)
        assert r.status_code == 200 and "text/html" in r.headers["content-type"]
        assert "no-store" in r.headers.get("cache-control", "")
        for s in ("og:title", "og:image", "twitter:card", f"amass://property/{pid}", f"/property/{pid}"):
            assert s in r.text, s
        r = requests.get(f"{BASE_URL}/api/go/{pid}", params={"src": "instagram", "post": p["id"]}, headers={"User-Agent": "facebookexternalhit/1.1"}, allow_redirects=False)
        assert r.status_code == 200
        after = requests.get(f"{BASE_URL}/api/admin/social/overview", headers=H).json()["stats"]["clicks_by_source"].get("instagram", 0)
        assert after == before + 1
        post = next(x for x in requests.get(f"{BASE_URL}/api/admin/social/posts", headers=H).json()["items"] if x["id"] == p["id"])
        assert post.get("clicks") == 1

        # sanitised src
        requests.get(f"{BASE_URL}/api/go/{pid}?src=Insta%20Gram!", headers={"User-Agent": IOS_UA})
        after2 = requests.get(f"{BASE_URL}/api/admin/social/overview", headers=H).json()["stats"]["clicks_by_source"].get("instagram", 0)
        assert after2 == after + 1

        assert requests.delete(f"{BASE_URL}/api/admin/social/posts/{p['id']}", headers=H).status_code == 200
        assert requests.delete(f"{BASE_URL}/api/admin/social/posts/{p['id']}", headers=H).status_code == 400

    def test_validation(self, H, pid):
        assert requests.post(f"{BASE_URL}/api/admin/social/posts", headers=H, json={"property_id": pid, "platforms": ["nope"]}).status_code == 400
        assert requests.post(f"{BASE_URL}/api/admin/social/posts", headers=H, json={"property_id": "nope-xyz", "platforms": ["x"]}).status_code == 404
        assert requests.post(f"{BASE_URL}/api/admin/social/posts", headers=H, json={"property_id": pid, "platforms": ["x"], "captions": {"x": "a" * 281}}).status_code == 400

    def test_go_missing(self):
        r = requests.get(f"{BASE_URL}/api/go/does-not-exist", allow_redirects=False)
        assert r.status_code == 307


# ─── share bundle ───
class TestShare:
    def test_bundle(self, H, pid):
        r = requests.get(f"{BASE_URL}/api/share/property/{pid}")
        assert r.status_code == 200
        d = r.json()
        assert f"/api/go/{pid}?src=share" in d["share_url"]
        assert f"/api/go/{pid}?src=whatsapp" in d["whatsapp_message"]
        assert len(d["social"]["captions"]) == 5
        i = d["social"]["intents"]
        assert i["facebook"].startswith("https://www.facebook.com/sharer/")
        assert i["x"].startswith("https://twitter.com/intent/tweet")
        assert "linkedin.com/sharing/share-offsite" in i["linkedin"]

    def test_events(self, H, pid):
        for ch in ("instagram", "copy_caption"):
            r = requests.post(f"{BASE_URL}/api/share/property/{pid}/event", headers=H, json={"channel": ch})
            assert r.status_code == 200, (ch, r.text)
        assert requests.post(f"{BASE_URL}/api/share/property/{pid}/event", json={"channel": "instagram"}).status_code in (401, 403)

    def test_story_and_feed(self, H, pid):
        assert requests.get(f"{BASE_URL}/api/share/property/{pid}/story", headers=H).status_code == 200
        assert requests.get(f"{BASE_URL}/api/social/feed", headers=H).status_code == 200


# ─── auto-post hook ───
class TestAutoPost:
    def test_verify_hook(self, H, pid):
        r = requests.post(f"{BASE_URL}/api/portal/auth/login", json={"email": "demo@amass.africa", "password": "amass2026"})
        assert r.status_code == 200, r.text
        tok = r.json().get("access_token") or r.json().get("token")
        PH = {"Authorization": f"Bearer {tok}"}
        # pick a verified listing with no auto post yet
        items = requests.get(f"{BASE_URL}/api/admin/social/listings", headers=H, params={"limit": 50}).json()["items"]
        posts = requests.get(f"{BASE_URL}/api/admin/social/posts", headers=H, params={"limit": 200}).json()["items"]
        auto_pids = {p["property_id"] for p in posts if p["mode"] == "auto"}
        target = next((i["id"] for i in items if i["id"] not in auto_pids), None)
        if not target:
            pytest.skip("no verified listing without auto post")
        r = requests.patch(f"{BASE_URL}/api/portal/properties/{target}/verify", headers=PH, json={"verified": True})
        assert r.status_code == 200, r.text
        time.sleep(3)
        autos = [p for p in requests.get(f"{BASE_URL}/api/admin/social/posts", headers=H).json()["items"] if p["property_id"] == target and p["mode"] == "auto"]
        assert len(autos) == 1, autos
        created.append(autos[0]["id"])
        assert autos[0]["status"] == "queued"
        assert "tiktok" not in autos[0]["platforms"] and autos[0]["platforms"]
        requests.patch(f"{BASE_URL}/api/portal/properties/{target}/verify", headers=PH, json={"verified": True})
        time.sleep(3)
        autos = [p for p in requests.get(f"{BASE_URL}/api/admin/social/posts", headers=H).json()["items"] if p["property_id"] == target and p["mode"] == "auto"]
        assert len(autos) == 1
        assert requests.delete(f"{BASE_URL}/api/admin/social/posts/{autos[0]['id']}", headers=H).status_code == 200
