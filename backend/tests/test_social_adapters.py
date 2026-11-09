"""Adapter contract tests for social_publishing — platform HTTP calls are mocked so we can verify request shapes
(endpoints, auth, payloads) before real keys exist. Run: cd /app/backend && python -m pytest tests/test_social_adapters.py -q
"""
import asyncio
import json
import os
from datetime import datetime, timedelta, timezone

import httpx
import pytest
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

import social_publishing as sp
import social_platforms as spl
import social_publish_common as spc

load_dotenv("/app/backend/.env")

PROP = {"id": "prop-1", "title": "Sunny 3-Bed Terrace, Lekki", "price": 85000000, "listing_type": "buy", "bedrooms": 3, "bathrooms": 3, "size_sqm": 210, "city": "Lekki", "state": "Lagos", "verified": True, "property_type": "terrace", "images": ["https://img.example.com/a.jpg", "https://img.example.com/b.jpg"]}
SETTINGS = dict(sp.DEFAULT_SETTINGS)


def _db():
    return AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ.get("DB_NAME", "amass_db")]


class Recorder:
    def __init__(self, routes):
        self.routes = routes  # list of (method, url_prefix, response_factory)
        self.calls = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.calls.append(request)
        for method, prefix, make in self.routes:
            if request.method == method and str(request.url).startswith(prefix):
                return make(request)
        return httpx.Response(404, json={"error": f"unexpected {request.method} {request.url}"})


def patch_client(monkeypatch, rec: Recorder):
    real = httpx.AsyncClient

    class Patched(real):
        def __init__(self, *a, **kw):
            kw["transport"] = httpx.MockTransport(rec.handler)
            super().__init__(*a, **kw)

    monkeypatch.setattr(spl.httpx, "AsyncClient", Patched)


def test_captions_respect_limits_and_links():
    link = "https://example.com/api/go/prop-1?src=x"
    x = sp.build_caption(PROP, "x", SETTINGS, link)
    assert x.endswith(link) and len(x.replace(link, "x" * 23)) <= 280
    ig = sp.build_caption(PROP, "instagram", SETTINGS, link)
    assert "http" not in ig and "link in our bio" in ig and "#LekkiHomes" in ig
    fb = sp.build_caption(PROP, "facebook", SETTINGS, link)
    assert link in fb and "✅ Verified listing on AMASS" in fb
    tt = sp.build_caption(PROP, "tiktok", SETTINGS, link)
    assert "http" not in tt and len(sp.tiktok_title(PROP)) <= 90


def test_facebook_and_instagram_calls(monkeypatch):
    monkeypatch.setenv("META_PAGE_ID", "111")
    monkeypatch.setenv("META_IG_USER_ID", "222")
    monkeypatch.setenv("META_PAGE_ACCESS_TOKEN", "tok")
    rec = Recorder([
        ("POST", f"{spl.GRAPH}/111/photos", lambda r: httpx.Response(200, json={"id": "p1", "post_id": "111_999"})),
        ("POST", f"{spl.GRAPH}/222/media_publish", lambda r: httpx.Response(200, json={"id": "ig-1"})),
        ("POST", f"{spl.GRAPH}/222/media", lambda r: httpx.Response(200, json={"id": "container-1"})),
        ("GET", f"{spl.GRAPH}/container-1", lambda r: httpx.Response(200, json={"status_code": "FINISHED"})),
        ("GET", f"{spl.GRAPH}/ig-1", lambda r: httpx.Response(200, json={"permalink": "https://instagram.com/p/abc"})),
    ])
    patch_client(monkeypatch, rec)
    fb = asyncio.run(spl.facebook_publish("hello", "https://img/a.jpg", "https://l"))
    assert fb["external_id"] == "111_999" and "facebook.com/111_999" in fb["url"]
    body = dict(httpx.QueryParams(rec.calls[0].content.decode()))
    assert body["url"] == "https://img/a.jpg" and body["message"] == "hello" and body["access_token"] == "tok"
    ig = asyncio.run(spl.instagram_publish("cap", "https://img/a.jpg", "https://l"))
    assert ig["external_id"] == "ig-1" and ig["url"].endswith("/p/abc")
    media_call = [c for c in rec.calls if str(c.url).endswith("/222/media")][0]
    mb = dict(httpx.QueryParams(media_call.content.decode()))
    assert mb["image_url"] == "https://img/a.jpg" and mb["caption"] == "cap"
    publish_call = [c for c in rec.calls if "media_publish" in str(c.url)][0]
    assert dict(httpx.QueryParams(publish_call.content.decode()))["creation_id"] == "container-1"


def test_meta_error_surfaces_message(monkeypatch):
    monkeypatch.setenv("META_PAGE_ID", "111")
    monkeypatch.setenv("META_PAGE_ACCESS_TOKEN", "tok")
    rec = Recorder([("POST", f"{spl.GRAPH}/111/photos", lambda r: httpx.Response(400, json={"error": {"message": "Invalid OAuth access token", "code": 190}}))])
    patch_client(monkeypatch, rec)
    with pytest.raises(spl.PublishError) as e:
        asyncio.run(spl.facebook_publish("x", "https://img/a.jpg", "https://l"))
    assert "Invalid OAuth access token" in str(e.value)


def test_x_upload_and_tweet_are_oauth1_signed(monkeypatch):
    for k in ("X_API_KEY", "X_API_SECRET", "X_ACCESS_TOKEN", "X_ACCESS_TOKEN_SECRET"):
        monkeypatch.setenv(k, f"{k.lower()}-value")
    rec = Recorder([
        ("GET", "https://img/", lambda r: httpx.Response(200, content=b"\xff\xd8jpegbytes", headers={"content-type": "image/jpeg"})),
        ("POST", "https://api.x.com/2/media/upload", lambda r: httpx.Response(200, json={"data": {"id": "m-77", "media_key": "3_77"}})),
        ("POST", "https://api.x.com/2/tweets", lambda r: httpx.Response(201, json={"data": {"id": "17000", "text": "t"}})),
        ("GET", "https://api.x.com/2/users/me", lambda r: httpx.Response(200, json={"data": {"id": "u1", "username": "amassafrica"}})),
    ])
    patch_client(monkeypatch, rec)
    out = asyncio.run(spl.x_publish("Nice home https://l", "https://img/a.jpg", "https://l"))
    assert out["external_id"] == "17000" and out["url"].endswith("/status/17000")
    upload = [c for c in rec.calls if "media/upload" in str(c.url)][0]
    assert upload.headers["Authorization"].startswith("OAuth ") and 'oauth_consumer_key="x_api_key-value"' in upload.headers["Authorization"]
    assert upload.headers["Content-Type"].startswith("multipart/form-data") and b'name="media_category"' in upload.content and b"tweet_image" in upload.content
    tweet = [c for c in rec.calls if str(c.url).endswith("/2/tweets")][0]
    assert tweet.headers["Authorization"].startswith("OAuth ") and json.loads(tweet.content) == {"text": "Nice home https://l", "media": {"media_ids": ["m-77"]}}
    me = asyncio.run(spl.x_test())
    assert me["display_name"] == "@amassafrica"


def test_linkedin_three_step_flow(monkeypatch):
    monkeypatch.setenv("LINKEDIN_ACCESS_TOKEN", "li-token")
    monkeypatch.setenv("LINKEDIN_ORGANIZATION_ID", "4242")
    rec = Recorder([
        ("GET", "https://img/", lambda r: httpx.Response(200, content=b"png", headers={"content-type": "image/png"})),
        ("POST", "https://api.linkedin.com/rest/images?action=initializeUpload", lambda r: httpx.Response(200, json={"value": {"uploadUrl": "https://upload.linkedin.test/abc", "image": "urn:li:image:C123"}})),
        ("PUT", "https://upload.linkedin.test/abc", lambda r: httpx.Response(201)),
        ("POST", "https://api.linkedin.com/rest/posts", lambda r: httpx.Response(201, headers={"x-restli-id": "urn:li:share:9"})),
        ("GET", "https://api.linkedin.com/rest/organizations/4242", lambda r: httpx.Response(200, json={"localizedName": "AMASS Africa"})),
    ])
    patch_client(monkeypatch, rec)

    async def run():
        db = _db()
        await db.social_publish_accounts.delete_many({"platform": "linkedin"})
        out = await spl.linkedin_publish(db, "Commentary https://l", "https://img/a.png", "https://l", "Sunny 3-Bed")
        return out, await spl.linkedin_test(db)

    out, t = asyncio.run(run())
    assert out["external_id"] == "urn:li:share:9" and "urn:li:share:9" in out["url"]
    init = rec.calls[1]
    assert init.headers["LinkedIn-Version"] == spl.LI_VERSION and init.headers["X-Restli-Protocol-Version"] == "2.0.0" and init.headers["Authorization"] == "Bearer li-token"
    assert json.loads(init.content) == {"initializeUploadRequest": {"owner": "urn:li:organization:4242"}}
    post = json.loads(rec.calls[3].content)
    assert post["author"] == "urn:li:organization:4242" and post["content"]["article"]["source"] == "https://l" and post["content"]["article"]["thumbnail"] == "urn:li:image:C123" and post["lifecycleState"] == "PUBLISHED"
    assert t["display_name"] == "AMASS Africa"


def test_tiktok_photo_post_uses_creator_info_privacy(monkeypatch):
    monkeypatch.setenv("TIKTOK_CLIENT_KEY", "ck")
    monkeypatch.setenv("TIKTOK_CLIENT_SECRET", "cs")
    rec = Recorder([
        ("POST", f"{spl.TT}/post/publish/creator_info/query/", lambda r: httpx.Response(200, json={"error": {"code": "ok"}, "data": {"creator_username": "amass", "privacy_level_options": ["SELF_ONLY", "PUBLIC_TO_EVERYONE"]}})),
        ("POST", f"{spl.TT}/post/publish/content/init/", lambda r: httpx.Response(200, json={"error": {"code": "ok"}, "data": {"publish_id": "p_123"}})),
    ])
    patch_client(monkeypatch, rec)

    async def run():
        db = _db()
        await db.social_publish_accounts.replace_one({"platform": "tiktok"}, {"platform": "tiktok", "access_token": spc.enc("tt-access"), "refresh_token": spc.enc("tt-refresh"), "expires_at": datetime.now(timezone.utc) + timedelta(hours=5), "display_name": "@amass"}, upsert=True)
        out = await spl.tiktok_publish(db, "desc", ["https://img/a.jpg", "https://img/b.jpg"], "title", {**SETTINGS, "tiktok_privacy": "PUBLIC_TO_EVERYONE"})
        first = json.loads(rec.calls[1].content), rec.calls[1].headers["Authorization"]
        # privacy not offered → falls back to SELF_ONLY
        rec.calls.clear()
        rec.routes[0] = ("POST", f"{spl.TT}/post/publish/creator_info/query/", lambda r: httpx.Response(200, json={"error": {"code": "ok"}, "data": {"privacy_level_options": ["SELF_ONLY"]}}))
        await spl.tiktok_publish(db, "desc", ["https://img/a.jpg"], "title", {**SETTINGS, "tiktok_privacy": "PUBLIC_TO_EVERYONE"})
        second = json.loads(rec.calls[1].content)
        await db.social_publish_accounts.delete_many({"platform": "tiktok"})
        return out, first, second

    out, (init, auth), second = asyncio.run(run())
    assert out["external_id"] == "p_123" and "Public To Everyone" in out["note"]
    assert init["media_type"] == "PHOTO" and init["post_mode"] == "DIRECT_POST" and init["post_info"]["privacy_level"] == "PUBLIC_TO_EVERYONE" and init["source_info"] == {"source": "PULL_FROM_URL", "photo_cover_index": 0, "photo_images": ["https://img/a.jpg", "https://img/b.jpg"]}
    assert auth == "Bearer tt-access"
    assert second["post_info"]["privacy_level"] == "SELF_ONLY"


def test_tiktok_refreshes_expired_token(monkeypatch):
    monkeypatch.setenv("TIKTOK_CLIENT_KEY", "ck")
    monkeypatch.setenv("TIKTOK_CLIENT_SECRET", "cs")
    rec = Recorder([("POST", f"{spl.TT}/oauth/token/", lambda r: httpx.Response(200, json={"access_token": "new-access", "refresh_token": "new-refresh", "expires_in": 86400, "refresh_expires_in": 31536000}))])
    patch_client(monkeypatch, rec)

    async def run():
        db = _db()
        await db.social_publish_accounts.replace_one({"platform": "tiktok"}, {"platform": "tiktok", "access_token": spc.enc("old"), "refresh_token": spc.enc("tt-refresh"), "expires_at": datetime.now(timezone.utc) - timedelta(minutes=1)}, upsert=True)
        token, _ = await spl.tiktok_token(db)
        acc = await db.social_publish_accounts.find_one({"platform": "tiktok"})
        await db.social_publish_accounts.delete_many({"platform": "tiktok"})
        return token, acc

    token, acc = asyncio.run(run())
    assert token == "new-access"
    form = dict(httpx.QueryParams(rec.calls[0].content.decode()))
    assert form == {"client_key": "ck", "client_secret": "cs", "grant_type": "refresh_token", "refresh_token": "tt-refresh"}
    assert spc.dec(acc["refresh_token"]) == "new-refresh"


def test_token_encryption_roundtrip():
    assert spc.dec(spc.enc("secret-token")) == "secret-token"
    assert spc.dec("garbage") is None and spc.enc(None) is None
