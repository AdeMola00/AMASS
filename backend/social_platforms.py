"""Platform adapters for social publishing — Meta (Facebook Page + Instagram), X, LinkedIn Page, TikTok — plus the
OAuth "Connect" flows for LinkedIn and TikTok. Pure HTTP contracts; the engine, settings and routes live in
social_publishing.py. Each publish_* returns {external_id, url[, note]} or raises PublishError with a human message.
"""
from __future__ import annotations

import asyncio
import json
import logging
import secrets
import uuid
from datetime import timedelta, timezone
from typing import Optional
from urllib.parse import urlencode

import httpx
from fastapi import HTTPException

from social_publish_common import PLATFORMS, dec, enc, env, missing_keys, now

logger = logging.getLogger("amass.social")

# ─── HTTP helpers ───
def _trim(text: str, n: int = 400) -> str:
    return text if len(text) <= n else text[:n] + "…"


class PublishError(Exception):
    pass


async def _fetch_bytes(url: str) -> tuple[bytes, str]:
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as c:
        r = await c.get(url)
    if r.is_error:
        raise PublishError(f"Couldn't download the listing photo ({r.status_code})")
    return r.content, (r.headers.get("content-type") or "image/jpeg").split(";")[0]


# ═══════════════════════════════ Meta (Facebook Page + Instagram) ═══════════════════════════════
GRAPH = f"https://graph.facebook.com/{env('META_GRAPH_VERSION') or 'v21.0'}"


async def _meta(method: str, path: str, **data) -> dict:
    async with httpx.AsyncClient(timeout=httpx.Timeout(40.0, connect=10.0)) as c:
        r = await c.request(method, f"{GRAPH}{path}", data={**data, "access_token": env("META_PAGE_ACCESS_TOKEN")} if method != "GET" else None, params={**data, "access_token": env("META_PAGE_ACCESS_TOKEN")} if method == "GET" else None)
    try:
        body = r.json()
    except ValueError:
        body = {"raw": r.text[:300]}
    if r.is_error or "error" in body:
        err = (body.get("error") or {})
        raise PublishError(err.get("message") or f"Meta error {r.status_code}: {_trim(json.dumps(body))}")
    return body


async def meta_test(platform: str) -> dict:
    if platform == "facebook":
        page = await _meta("GET", f"/{env('META_PAGE_ID')}", fields="id,name")
        me = await _meta("GET", "/me", fields="id,name")
        if me.get("id") != page.get("id"):
            raise PublishError("The token isn't a Page token for this Page — generate the Page access token from /me/accounts")
        return {"display_name": page.get("name"), "external_id": page.get("id"), "url": f"https://facebook.com/{page.get('id')}"}
    ig = await _meta("GET", f"/{env('META_IG_USER_ID')}", fields="id,username")
    return {"display_name": f"@{ig.get('username')}", "external_id": ig.get("id"), "url": f"https://instagram.com/{ig.get('username')}"}


async def facebook_publish(caption: str, image_url: str, link: str) -> dict:
    res = await _meta("POST", f"/{env('META_PAGE_ID')}/photos", url=image_url, message=caption)
    post_id = res.get("post_id") or res.get("id")
    return {"external_id": post_id, "url": f"https://www.facebook.com/{post_id}" if post_id else None}


async def instagram_publish(caption: str, image_url: str, link: str) -> dict:
    ig = env("META_IG_USER_ID")
    container = await _meta("POST", f"/{ig}/media", image_url=image_url, caption=caption)
    cid = container.get("id")
    for _ in range(10):  # containers are processed asynchronously
        st = await _meta("GET", f"/{cid}", fields="status_code")
        if st.get("status_code") in (None, "FINISHED"):
            break
        if st.get("status_code") == "ERROR":
            raise PublishError("Instagram rejected the image (must be a public JPEG under 8 MB, 4:5–1.91:1)")
        await asyncio.sleep(2)
    pub = await _meta("POST", f"/{ig}/media_publish", creation_id=cid)
    media_id = pub.get("id")
    url = None
    if media_id:
        try:
            info = await _meta("GET", f"/{media_id}", fields="permalink")
            url = info.get("permalink")
        except PublishError:
            url = None
    return {"external_id": media_id, "url": url}


# ═══════════════════════════════ X (Twitter) — OAuth 1.0a user context ═══════════════════════════════
def _x_client():
    from oauthlib.oauth1 import Client

    return Client(env("X_API_KEY"), client_secret=env("X_API_SECRET"), resource_owner_key=env("X_ACCESS_TOKEN"), resource_owner_secret=env("X_ACCESS_TOKEN_SECRET"))


def _x_error(r: httpx.Response) -> str:
    try:
        b = r.json()
    except ValueError:
        return f"X error {r.status_code}"
    if isinstance(b, dict):
        if b.get("errors"):
            return "; ".join(str(e.get("message") or e.get("detail") or e) for e in b["errors"])
        return str(b.get("detail") or b.get("title") or b.get("error") or _trim(json.dumps(b), 200))
    return f"X error {r.status_code}"


async def x_test() -> dict:
    url = "https://api.x.com/2/users/me?user.fields=username"
    uri, headers, _ = _x_client().sign(url, http_method="GET")
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get(uri, headers=headers)
    if r.is_error:
        raise PublishError(_x_error(r))
    d = r.json().get("data") or {}
    return {"display_name": f"@{d.get('username')}", "external_id": d.get("id"), "url": f"https://x.com/{d.get('username')}"}


async def x_publish(caption: str, image_url: str, link: str) -> dict:
    content, mime = await _fetch_bytes(image_url)
    client = _x_client()
    media_id = None
    if content:
        up_url = "https://api.x.com/2/media/upload"
        uri, headers, _ = client.sign(up_url, http_method="POST", headers={"Content-Type": "multipart/form-data"})
        headers.pop("Content-Type", None)
        async with httpx.AsyncClient(timeout=60) as c:
            r = await c.post(uri, headers=headers, data={"media_category": "tweet_image", "media_type": mime}, files={"media": ("photo.jpg", content, mime)})
        if r.is_error:
            logger.warning("X media upload failed: %s", r.text[:300])
        else:
            d = r.json().get("data") or r.json()
            media_id = d.get("id") or d.get("media_id_string") or d.get("media_id")
    body = {"text": caption}
    if media_id:
        body["media"] = {"media_ids": [str(media_id)]}
    tweet_url = "https://api.x.com/2/tweets"
    payload = json.dumps(body)
    uri, headers, _ = client.sign(tweet_url, http_method="POST", body=payload, headers={"Content-Type": "application/json"})
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(uri, headers=headers, content=payload)
    if r.is_error:
        raise PublishError(_x_error(r))
    d = r.json().get("data") or {}
    return {"external_id": d.get("id"), "url": f"https://x.com/i/web/status/{d.get('id')}" if d.get("id") else None}


# ═══════════════════════════════ LinkedIn Page ═══════════════════════════════
LI_VERSION = env("LINKEDIN_VERSION") or "202506"


def _li_headers(token: str, json_body: bool = False) -> dict:
    h = {"Authorization": f"Bearer {token}", "LinkedIn-Version": LI_VERSION, "X-Restli-Protocol-Version": "2.0.0"}
    if json_body:
        h["Content-Type"] = "application/json"
    return h


def _li_error(r: httpx.Response) -> str:
    try:
        b = r.json()
        return str(b.get("message") or b.get("error_description") or b.get("error") or _trim(json.dumps(b), 200))
    except ValueError:
        return f"LinkedIn error {r.status_code}"


async def linkedin_token(db) -> tuple[Optional[str], Optional[str], Optional[dict]]:
    """(access_token, organization_id, account_doc) from the connected account or env fallback."""
    acc = await db.social_publish_accounts.find_one({"platform": "linkedin"}, {"_id": 0})
    if acc and dec(acc.get("access_token")):
        exp = acc.get("expires_at")
        if exp and exp.replace(tzinfo=exp.tzinfo or timezone.utc) < now():
            return None, acc.get("external_id") or env("LINKEDIN_ORGANIZATION_ID"), {**acc, "expired": True}
        return dec(acc["access_token"]), acc.get("external_id") or env("LINKEDIN_ORGANIZATION_ID"), acc
    if env("LINKEDIN_ACCESS_TOKEN") and env("LINKEDIN_ORGANIZATION_ID"):
        return env("LINKEDIN_ACCESS_TOKEN"), env("LINKEDIN_ORGANIZATION_ID"), None
    return None, env("LINKEDIN_ORGANIZATION_ID") or None, acc


async def linkedin_test(db) -> dict:
    token, org, _ = await linkedin_token(db)
    if not token or not org:
        raise PublishError("LinkedIn isn't connected")
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get(f"https://api.linkedin.com/rest/organizations/{org}", headers=_li_headers(token))
    if r.is_error:
        raise PublishError(_li_error(r))
    d = r.json()
    name = d.get("localizedName") or d.get("name") or f"Organization {org}"
    return {"display_name": name, "external_id": str(org), "url": f"https://www.linkedin.com/company/{org}/"}


async def linkedin_publish(db, caption: str, image_url: str, link: str, title: str) -> dict:
    token, org, _ = await linkedin_token(db)
    if not token or not org:
        raise PublishError("LinkedIn isn't connected")
    owner = f"urn:li:organization:{org}"
    content, mime = await _fetch_bytes(image_url)
    async with httpx.AsyncClient(timeout=60) as c:
        init = await c.post("https://api.linkedin.com/rest/images?action=initializeUpload", headers=_li_headers(token, True), json={"initializeUploadRequest": {"owner": owner}})
        if init.is_error:
            raise PublishError(_li_error(init))
        value = init.json()["value"]
        up = await c.put(value["uploadUrl"], content=content, headers={"Content-Type": mime if mime in ("image/jpeg", "image/png", "image/gif") else "image/jpeg"})
        if up.is_error:
            raise PublishError(f"LinkedIn image upload failed ({up.status_code})")
        post = {
            "author": owner, "commentary": caption, "visibility": "PUBLIC",
            "distribution": {"feedDistribution": "MAIN_FEED", "targetEntities": [], "thirdPartyDistributionChannels": []},
            "content": {"article": {"source": link, "thumbnail": value["image"], "title": title[:200], "description": "Open this listing in the AMASS app"[:300]}},
            "lifecycleState": "PUBLISHED", "isReshareDisabledByAuthor": False,
        }
        created = await c.post("https://api.linkedin.com/rest/posts", headers=_li_headers(token, True), json=post)
    if created.is_error:
        raise PublishError(_li_error(created))
    urn = created.headers.get("x-restli-id") or created.headers.get("x-linkedin-id")
    return {"external_id": urn, "url": f"https://www.linkedin.com/feed/update/{urn}/" if urn else f"https://www.linkedin.com/company/{org}/posts/"}


# ═══════════════════════════════ TikTok ═══════════════════════════════
TT = "https://open.tiktokapis.com/v2"


async def _tiktok_refresh(db, acc: dict) -> Optional[str]:
    rt = dec(acc.get("refresh_token"))
    if not rt:
        return None
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(f"{TT}/oauth/token/", data={"client_key": env("TIKTOK_CLIENT_KEY"), "client_secret": env("TIKTOK_CLIENT_SECRET"), "grant_type": "refresh_token", "refresh_token": rt})
    tok = r.json() if r.content else {}
    if r.is_error or "access_token" not in tok:
        await db.social_publish_accounts.update_one({"platform": "tiktok"}, {"$set": {"needs_reauth": True, "last_error": str(tok.get("error_description") or tok.get("error") or r.status_code)}})
        return None
    t = now()
    await db.social_publish_accounts.update_one({"platform": "tiktok"}, {"$set": {"access_token": enc(tok["access_token"]), "refresh_token": enc(tok.get("refresh_token") or rt), "expires_at": t + timedelta(seconds=int(tok.get("expires_in", 86400))), "refresh_expires_at": t + timedelta(seconds=int(tok.get("refresh_expires_in", 31536000))), "needs_reauth": False}, "$unset": {"last_error": ""}})
    return tok["access_token"]


async def tiktok_token(db) -> tuple[Optional[str], Optional[dict]]:
    acc = await db.social_publish_accounts.find_one({"platform": "tiktok"}, {"_id": 0})
    if not acc:
        return None, None
    exp = acc.get("expires_at")
    if exp and exp.replace(tzinfo=exp.tzinfo or timezone.utc) <= now() + timedelta(minutes=2):
        return await _tiktok_refresh(db, acc), acc
    return dec(acc.get("access_token")), acc


async def _tiktok_post(token: str, path: str, body: Optional[dict] = None) -> dict:
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(f"{TT}{path}", headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json; charset=UTF-8"}, json=body or {})
    data = r.json() if r.content else {}
    err = (data.get("error") or {})
    if r.is_error or (err.get("code") not in (None, "ok")):
        raise PublishError(err.get("message") or f"TikTok error {r.status_code}")
    return data


async def tiktok_test(db) -> dict:
    token, acc = await tiktok_token(db)
    if not token:
        raise PublishError("TikTok isn't connected")
    info = (await _tiktok_post(token, "/post/publish/creator_info/query/")).get("data") or {}
    return {"display_name": f"@{info.get('creator_username') or (acc or {}).get('display_name') or 'tiktok'}", "external_id": (acc or {}).get("external_id"), "url": f"https://www.tiktok.com/@{info.get('creator_username')}" if info.get("creator_username") else None, "privacy_level_options": info.get("privacy_level_options") or []}


async def tiktok_publish(db, caption: str, image_urls: list[str], title: str, settings: dict) -> dict:
    token, _ = await tiktok_token(db)
    if not token:
        raise PublishError("TikTok isn't connected")
    info = (await _tiktok_post(token, "/post/publish/creator_info/query/")).get("data") or {}
    options = info.get("privacy_level_options") or ["SELF_ONLY"]
    wanted = settings.get("tiktok_privacy") or "SELF_ONLY"
    privacy = wanted if wanted in options else ("SELF_ONLY" if "SELF_ONLY" in options else options[0])
    body = {
        "media_type": "PHOTO", "post_mode": "DIRECT_POST",
        "post_info": {"title": title, "description": caption, "privacy_level": privacy, "disable_comment": False, "brand_content_toggle": False, "brand_organic_toggle": False},
        "source_info": {"source": "PULL_FROM_URL", "photo_cover_index": 0, "photo_images": image_urls[:35]},
    }
    data = await _tiktok_post(token, "/post/publish/content/init/", body)
    pid = (data.get("data") or {}).get("publish_id")
    return {"external_id": pid, "url": None, "note": f"Submitted to TikTok as {privacy.replace('_', ' ').title()} — processing"}


async def tiktok_status(db, publish_id: str) -> dict:
    token, _ = await tiktok_token(db)
    if not token:
        raise PublishError("TikTok isn't connected")
    data = (await _tiktok_post(token, "/post/publish/status/fetch/", {"publish_id": publish_id})).get("data") or {}
    return data


# ═══════════════════════════════ OAuth connect (LinkedIn, TikTok) ═══════════════════════════════
def oauth_redirect_uri(platform: str) -> str:
    from public_url import public_api_base

    return f"{public_api_base()}/api/social/oauth/{platform}/callback"


async def oauth_start(db, platform: str, admin: dict) -> str:
    if missing_keys(platform):
        raise HTTPException(400, f"Add {', '.join(missing_keys(platform))} first")
    state = secrets.token_urlsafe(24)
    await db.social_publish_oauth_states.insert_one({"state": state, "platform": platform, "admin_id": admin["id"], "created_at": now(), "expires_at": now() + timedelta(minutes=10)})
    redirect = oauth_redirect_uri(platform)
    if platform == "linkedin":
        return "https://www.linkedin.com/oauth/v2/authorization?" + urlencode({"response_type": "code", "client_id": env("LINKEDIN_CLIENT_ID"), "redirect_uri": redirect, "state": state, "scope": "w_organization_social r_organization_social"})
    return "https://www.tiktok.com/v2/auth/authorize/?" + urlencode({"client_key": env("TIKTOK_CLIENT_KEY"), "response_type": "code", "scope": "video.publish,user.info.basic", "redirect_uri": redirect, "state": state})


async def oauth_finish(db, platform: str, code: str, state: str) -> dict:
    st = await db.social_publish_oauth_states.find_one_and_delete({"state": state, "platform": platform})
    if not st or st["expires_at"].replace(tzinfo=timezone.utc) < now():
        raise HTTPException(400, "This connect link has expired — start again from the Cockpit")
    redirect = oauth_redirect_uri(platform)
    t = now()
    async with httpx.AsyncClient(timeout=30) as c:
        if platform == "linkedin":
            r = await c.post("https://www.linkedin.com/oauth/v2/accessToken", data={"grant_type": "authorization_code", "code": code, "client_id": env("LINKEDIN_CLIENT_ID"), "client_secret": env("LINKEDIN_CLIENT_SECRET"), "redirect_uri": redirect})
            tok = r.json() if r.content else {}
            if r.is_error or "access_token" not in tok:
                raise HTTPException(400, f"LinkedIn didn't accept the sign-in: {tok.get('error_description') or tok.get('error') or r.status_code}")
            org = env("LINKEDIN_ORGANIZATION_ID")
            name = None
            if not org:  # first page the member administers
                acl = await c.get("https://api.linkedin.com/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED", headers=_li_headers(tok["access_token"]))
                if not acl.is_error:
                    for el in (acl.json().get("elements") or []):
                        urn = el.get("organization") or ""
                        if urn.startswith("urn:li:organization:"):
                            org = urn.split(":")[-1]
                            break
            if org:
                info = await c.get(f"https://api.linkedin.com/rest/organizations/{org}", headers=_li_headers(tok["access_token"]))
                if not info.is_error:
                    name = info.json().get("localizedName")
            doc = {"platform": "linkedin", "access_token": enc(tok["access_token"]), "refresh_token": enc(tok.get("refresh_token")), "expires_at": t + timedelta(seconds=int(tok.get("expires_in", 5184000))), "external_id": org, "display_name": name or (f"Organization {org}" if org else "LinkedIn (no Page found — set LINKEDIN_ORGANIZATION_ID)"), "scope": tok.get("scope"), "connected_at": t, "connected_by": st["admin_id"], "needs_reauth": False}
        else:
            r = await c.post(f"{TT}/oauth/token/", data={"client_key": env("TIKTOK_CLIENT_KEY"), "client_secret": env("TIKTOK_CLIENT_SECRET"), "code": code, "grant_type": "authorization_code", "redirect_uri": redirect})
            tok = r.json() if r.content else {}
            if r.is_error or "access_token" not in tok:
                raise HTTPException(400, f"TikTok didn't accept the sign-in: {tok.get('error_description') or tok.get('error') or r.status_code}")
            name = None
            try:
                ui = await c.get(f"{TT}/user/info/?fields=open_id,display_name,username", headers={"Authorization": f"Bearer {tok['access_token']}"})
                u = ((ui.json().get("data") or {}).get("user") or {}) if ui.content else {}
                name = u.get("username") or u.get("display_name")
            except Exception:
                name = None
            doc = {"platform": "tiktok", "access_token": enc(tok["access_token"]), "refresh_token": enc(tok.get("refresh_token")), "expires_at": t + timedelta(seconds=int(tok.get("expires_in", 86400))), "refresh_expires_at": t + timedelta(seconds=int(tok.get("refresh_expires_in", 31536000))), "external_id": tok.get("open_id"), "display_name": f"@{name}" if name else "TikTok account", "scope": tok.get("scope"), "connected_at": t, "connected_by": st["admin_id"], "needs_reauth": False}
    await db.social_publish_accounts.replace_one({"platform": platform}, doc, upsert=True)
    await db.audit_log.insert_one({"id": str(uuid.uuid4()), "source": "cockpit", "actor_id": st["admin_id"], "actor_name": None, "action": f"connected {PLATFORMS[platform]['label']} ({doc['display_name']}) for social publishing", "target": platform, "at": t})
    return doc
