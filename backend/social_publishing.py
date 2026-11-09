"""Social publishing — post verified listings to AMASS's official Facebook Page, Instagram, X, LinkedIn Page and
TikTok, and give every post a *smart link* (`/api/go/{property_id}`) that opens the AMASS app when installed and
otherwise sends people to the store / web listing. Everything the platforms need (tokens, secrets) stays server-side.

Platform credentials
  • Facebook Page + Instagram — Meta Graph API with a long-lived Page token:  META_PAGE_ID, META_IG_USER_ID,
    META_PAGE_ACCESS_TOKEN (env, via the secrets card).
  • X (Twitter) — OAuth 1.0a user-context keys from the X developer portal (Read + Write):  X_API_KEY, X_API_SECRET,
    X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET.
  • LinkedIn Page — OAuth "Connect" flow (LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET, optional
    LINKEDIN_ORGANIZATION_ID) storing a 60-day token in `social_accounts`; or a pasted LINKEDIN_ACCESS_TOKEN.
  • TikTok — OAuth "Connect" flow (TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET); 24 h access token refreshed
    automatically with the 365-day refresh token. Unaudited apps can only publish SELF_ONLY.

Collections: social_publish_posts (one doc per listing post with a result per platform), social_publish_accounts (OAuth tokens,
encrypted), social_link_clicks (smart-link opens by source), social_publish_oauth_states. Settings live in app_settings under
`social_publishing`.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
import uuid
from datetime import timedelta
from html import escape
from typing import Optional
from urllib.parse import quote, urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel, Field

from social_publish_common import DEFAULT_SETTINGS, PLATFORM_ORDER, PLATFORMS, Platform, env, missing_keys, now
from social_platforms import (
    PublishError, facebook_publish, instagram_publish, linkedin_publish, linkedin_test, linkedin_token, meta_test, oauth_finish, oauth_redirect_uri, oauth_start,
    tiktok_publish, tiktok_status, tiktok_test, x_publish, x_test,
)

logger = logging.getLogger("amass.social")

BOT_UA = re.compile(r"facebookexternalhit|facebot|twitterbot|linkedinbot|bytespider|whatsapp/|telegrambot|slackbot|discordbot|pinterestbot|googlebot|bingbot|embedly|quora link preview|skypeuripreview|applebot", re.I)
LINK_LEN_X = 23  # t.co wraps every URL to 23 chars


# ─── property → caption ───
def fmt_price(prop: dict) -> str:
    try:
        amount = f"₦{int(prop.get('price') or 0):,}"
    except Exception:
        amount = f"₦{prop.get('price')}"
    lt = (prop.get("listing_type") or "").lower()
    if lt == "rent":
        return f"{amount}/year"
    if lt in ("shortlet", "short_let", "short-let"):
        return f"{amount}/night"
    return amount


def listing_word(prop: dict) -> str:
    lt = (prop.get("listing_type") or "").lower()
    return {"buy": "For sale", "sale": "For sale", "rent": "To let", "shortlet": "Shortlet", "short_let": "Shortlet"}.get(lt, "For sale")


def location_line(prop: dict) -> str:
    return ", ".join([x for x in (prop.get("city"), prop.get("state")) if x]) or (prop.get("location") or "Nigeria")


def specs_line(prop: dict) -> str:
    parts = []
    if prop.get("bedrooms"):
        parts.append(f"🛏 {prop['bedrooms']} bed")
    if prop.get("bathrooms"):
        parts.append(f"🛁 {prop['bathrooms']} bath")
    if prop.get("size_sqm"):
        parts.append(f"📐 {prop['size_sqm']} sqm")
    if prop.get("parking"):
        parts.append(f"🚗 {prop['parking']} parking")
    return " · ".join(parts)


def hashtags_for(prop: dict, settings: dict, max_tags: int = 8) -> str:
    tags: list[str] = []
    for t in settings.get("hashtags") or []:
        t = re.sub(r"[^A-Za-z0-9_]", "", str(t))
        if t and t not in tags:
            tags.append(t)
    for raw in (prop.get("city"), prop.get("state")):
        t = re.sub(r"[^A-Za-z0-9_]", "", str(raw or ""))
        if t and t not in tags and len(t) > 2:
            tags.append(f"{t}Homes" if t != "Lagos" else "LagosHomes")
    pt = re.sub(r"[^A-Za-z0-9_]", "", str(prop.get("property_type") or ""))
    if pt and pt.title() not in tags:
        tags.append(pt.title())
    return " ".join(f"#{t}" for t in tags[:max_tags])


def smart_link(property_id: str, src: str, post_id: Optional[str] = None) -> str:
    from public_url import public_api_base

    q = {"src": src}
    if post_id:
        q["post"] = post_id
    return f"{public_api_base()}/api/go/{property_id}?{urlencode(q)}"


def build_caption(prop: dict, platform: str, settings: dict, link: str) -> str:
    """Platform-aware caption. X is trimmed to 280 (link = 23 chars); Instagram/TikTok carry no link."""
    title = (prop.get("title") or "Property on AMASS").strip()
    head = f"{title}\n{listing_word(prop)} · {location_line(prop)}\n💰 {fmt_price(prop)}"
    specs = specs_line(prop)
    verified = "✅ Verified listing on AMASS" if prop.get("verified") else ""
    tags = hashtags_for(prop, settings)
    footer = settings.get("footer") or DEFAULT_SETTINGS["footer"]

    if platform == "x":
        body = head + (f"\n{specs}" if specs else "")
        tail = f"\n\n👉 {link}"
        budget = 280 - LINK_LEN_X - len("\n\n👉 ") - 1
        short_tags = " ".join(tags.split(" ")[:3])
        text = body
        if len(text) + len(short_tags) + 1 <= budget:
            text = f"{text}\n{short_tags}"
        if len(text) > budget:
            text = text[: budget - 1].rstrip() + "…"
        return text + tail

    if platform == "instagram":
        note = settings.get("instagram_bio_note") or DEFAULT_SETTINGS["instagram_bio_note"]
        parts = [head] + [x for x in (specs, verified) if x] + ["", f"👉 {note}", footer, "", ".\n.\n.", tags]
        return "\n".join(parts)[: PLATFORMS["instagram"]["limit"]]

    if platform == "tiktok":
        parts = [head] + [x for x in (specs, verified) if x] + ["", "📲 Search AMASS in the App Store / Play Store to view this home", tags]
        return "\n".join(parts)[: PLATFORMS["tiktok"]["limit"]]

    # facebook / linkedin
    parts = [head] + [x for x in (specs, verified) if x] + ["", f"👉 View it in the AMASS app: {link}", footer, "", tags]
    return "\n".join(parts)[: PLATFORMS[platform]["limit"]]


def tiktok_title(prop: dict) -> str:
    t = f"{prop.get('title') or 'Home on AMASS'} · {fmt_price(prop)}"
    return t[: PLATFORMS["tiktok"]["title_limit"]]


def public_image(prop: dict) -> Optional[str]:
    for u in prop.get("images") or []:
        if isinstance(u, str) and u.startswith("https://"):
            return u
    return None


# ═══════════════════════════════ status + engine ═══════════════════════════════
async def get_settings(db) -> dict:
    from app_settings import get_setting

    stored = await get_setting(db, "social_publishing", {}) or {}
    merged = {**DEFAULT_SETTINGS, **stored}
    merged["auto_post"] = {**DEFAULT_SETTINGS["auto_post"], **(stored.get("auto_post") or {})}
    return merged


async def platform_status(db, platform: str) -> dict:
    meta = PLATFORMS[platform]
    miss = missing_keys(platform)
    acc = None
    connected = False
    display = None
    expires_at = None
    needs_reauth = False
    if platform in ("facebook", "instagram", "x"):
        connected = not miss
    elif platform == "linkedin":
        token, org, acc = await linkedin_token(db)
        connected = bool(token and org)
        needs_reauth = bool(acc and acc.get("expired"))
        display = (acc or {}).get("display_name") or (f"Organization {org}" if org and env("LINKEDIN_ACCESS_TOKEN") else None)
        expires_at = (acc or {}).get("expires_at")
        if env("LINKEDIN_ACCESS_TOKEN") and env("LINKEDIN_ORGANIZATION_ID"):
            miss = []
    else:
        acc = await db.social_publish_accounts.find_one({"platform": "tiktok"}, {"_id": 0, "access_token": 0, "refresh_token": 0})
        connected = bool(acc) and not acc.get("needs_reauth") and not miss
        needs_reauth = bool(acc and acc.get("needs_reauth"))
        display = (acc or {}).get("display_name")
        expires_at = (acc or {}).get("refresh_expires_at")
    verified = await db.social_publish_accounts.find_one({"platform": platform}, {"_id": 0, "verified_at": 1, "verified_name": 1, "verified_url": 1, "last_error": 1})
    return {
        "platform": platform, "label": meta["label"], "icon": meta["icon"], "auth": meta["auth"], "limit": meta["limit"], "link_in_caption": meta["link_in_caption"],
        "configured": not miss, "connected": connected, "needs_reauth": needs_reauth, "missing_keys": miss, "keys": meta["keys"], "optional_keys": meta.get("optional_keys", []), "how": meta["how"],
        "display_name": display or (verified or {}).get("verified_name"), "profile_url": (verified or {}).get("verified_url"), "expires_at": expires_at,
        "verified_at": (verified or {}).get("verified_at"), "last_error": (verified or {}).get("last_error"),
        "redirect_uri": oauth_redirect_uri(platform) if meta["auth"] == "oauth" else None,
    }


async def all_status(db) -> list[dict]:
    return [await platform_status(db, p) for p in PLATFORM_ORDER]


async def test_platform(db, platform: str) -> dict:
    try:
        if platform in ("facebook", "instagram"):
            if missing_keys(platform):
                raise PublishError(f"Add {', '.join(missing_keys(platform))} first")
            res = await meta_test(platform)
        elif platform == "x":
            if missing_keys("x"):
                raise PublishError(f"Add {', '.join(missing_keys('x'))} first")
            res = await x_test()
        elif platform == "linkedin":
            res = await linkedin_test(db)
        else:
            res = await tiktok_test(db)
    except PublishError as e:
        await db.social_publish_accounts.update_one({"platform": platform}, {"$set": {"platform": platform, "last_error": str(e), "last_error_at": now()}}, upsert=True)
        raise HTTPException(400, str(e))
    except httpx.HTTPError as e:
        raise HTTPException(502, f"Couldn't reach {PLATFORMS[platform]['label']}: {e.__class__.__name__}")
    await db.social_publish_accounts.update_one({"platform": platform}, {"$set": {"platform": platform, "verified_at": now(), "verified_name": res.get("display_name"), "verified_url": res.get("url")}, "$unset": {"last_error": "", "last_error_at": ""}}, upsert=True)
    return {"ok": True, **res}


def post_public(p: dict) -> dict:
    return {k: v for k, v in p.items() if k != "_id"}


async def _publish_one(db, post: dict, platform: str, prop: dict, settings: dict) -> dict:
    link = smart_link(prop["id"], platform, post["id"])
    caption = (post.get("captions") or {}).get(platform) or build_caption(prop, platform, settings, link)
    image = post.get("image_url") or public_image(prop)
    if not image:
        return {"status": "failed", "error": "This listing has no public photo to post", "at": now()}
    try:
        if platform == "facebook":
            res = await facebook_publish(caption, image, link)
        elif platform == "instagram":
            res = await instagram_publish(caption, image, link)
        elif platform == "x":
            res = await x_publish(caption, image, link)
        elif platform == "linkedin":
            res = await linkedin_publish(db, caption, image, link, prop.get("title") or "Home on AMASS")
        else:
            res = await tiktok_publish(db, caption, [u for u in (prop.get("images") or []) if isinstance(u, str) and u.startswith("https://")][:10] or [image], tiktok_title(prop), settings)
        return {"status": "posted", "external_id": res.get("external_id"), "url": res.get("url"), "note": res.get("note"), "caption": caption, "link": link, "at": now()}
    except PublishError as e:
        return {"status": "failed", "error": str(e), "caption": caption, "link": link, "at": now()}
    except httpx.HTTPError as e:
        return {"status": "failed", "error": f"Network error reaching {PLATFORMS[platform]['label']} ({e.__class__.__name__})", "caption": caption, "link": link, "at": now()}
    except Exception as e:  # never let one platform break the batch
        logger.exception("social publish %s failed", platform)
        return {"status": "failed", "error": f"Unexpected error: {str(e)[:160]}", "caption": caption, "link": link, "at": now()}


async def publish_post(db, post_id: str, only: Optional[list[str]] = None) -> dict:
    post = await db.social_publish_posts.find_one({"id": post_id}, {"_id": 0})
    if not post:
        raise HTTPException(404, "Post not found")
    prop = await db.properties.find_one({"id": post["property_id"]}, {"_id": 0})
    if not prop:
        raise HTTPException(404, "Listing no longer exists")
    settings = await get_settings(db)
    statuses = await all_status(db)
    connected = {s["platform"]: s["connected"] for s in statuses}
    targets = [p for p in post["platforms"] if (not only or p in only) and (post.get("results") or {}).get(p, {}).get("status") != "posted"]
    results = dict(post.get("results") or {})
    todo = []
    for p in targets:
        if not connected.get(p):
            link = smart_link(prop["id"], p, post_id)
            results[p] = {"status": "queued", "error": f"{PLATFORMS[p]['label']} isn't connected yet", "caption": (post.get("captions") or {}).get(p) or build_caption(prop, p, settings, link), "link": link, "at": now()}
        else:
            todo.append(p)
    if todo:
        outs = await asyncio.gather(*[_publish_one(db, post, p, prop, settings) for p in todo])
        for p, out in zip(todo, outs):
            results[p] = out
    overall = "posted" if results and all(r["status"] == "posted" for r in results.values()) else ("partial" if any(r["status"] == "posted" for r in results.values()) else ("queued" if results and all(r["status"] == "queued" for r in results.values()) else "failed"))
    await db.social_publish_posts.update_one({"id": post_id}, {"$set": {"results": results, "status": overall, "updated_at": now(), "last_attempt_at": now()}})
    return post_public(await db.social_publish_posts.find_one({"id": post_id}, {"_id": 0}))


async def create_post(db, prop: dict, platforms: list[str], mode: str, actor: Optional[dict], captions: Optional[dict] = None, image_url: Optional[str] = None) -> dict:
    doc = {
        "id": str(uuid.uuid4()), "property_id": prop["id"], "property_title": prop.get("title"), "property_city": location_line(prop), "price_label": fmt_price(prop), "image_url": image_url or public_image(prop),
        "platforms": [p for p in PLATFORM_ORDER if p in platforms], "captions": {k: v for k, v in (captions or {}).items() if k in PLATFORMS and v}, "mode": mode, "status": "pending", "results": {},
        "created_by": (actor or {}).get("id"), "created_by_name": (actor or {}).get("full_name") or (actor or {}).get("name"), "created_at": now(), "updated_at": now(),
    }
    await db.social_publish_posts.insert_one({**doc})
    return doc


_background: set[asyncio.Task] = set()


async def auto_post_property(db, property_id: str, actor: Optional[dict] = None) -> Optional[dict]:
    """Called when a listing becomes verified: one automatic post per listing on every platform with auto-post on."""
    settings = await get_settings(db)
    platforms = [p for p in PLATFORM_ORDER if settings["auto_post"].get(p)]
    if not platforms:
        return None
    prop = await db.properties.find_one({"id": property_id}, {"_id": 0})
    if not prop or not public_image(prop) or prop.get("status") in ("sold", "archived", "hidden", "draft", "rejected"):
        return None
    # Atomic claim: exactly one auto post per listing even if two verifications race.
    claim = await db.social_publish_posts.update_one({"property_id": property_id, "mode": "auto"}, {"$setOnInsert": {"id": str(uuid.uuid4()), "property_id": property_id, "mode": "auto", "status": "pending", "platforms": [], "results": {}, "created_at": now()}}, upsert=True)
    if not claim.upserted_id:
        return None
    doc = await db.social_publish_posts.find_one({"property_id": property_id, "mode": "auto"}, {"_id": 0, "id": 1})
    await db.social_publish_posts.update_one({"id": doc["id"]}, {"$set": {
        "property_title": prop.get("title"), "property_city": location_line(prop), "price_label": fmt_price(prop), "image_url": public_image(prop), "platforms": platforms, "captions": {},
        "created_by": (actor or {}).get("id"), "created_by_name": (actor or {}).get("full_name") or (actor or {}).get("name"), "updated_at": now(),
    }})
    try:
        return await publish_post(db, doc["id"])
    except Exception:
        logger.exception("auto post failed for %s", property_id)
        return None


def schedule_auto_post(db, property_id: str, actor: Optional[dict] = None) -> None:
    """Fire-and-forget hook for verification paths (task kept referenced until it finishes)."""
    try:
        task = asyncio.get_running_loop().create_task(auto_post_property(db, property_id, actor))
    except RuntimeError:
        return
    _background.add(task)
    task.add_done_callback(_background.discard)


# ═══════════════════════════════ share kit for members / agents ═══════════════════════════════
def share_kit(prop: dict, settings: dict) -> dict:
    """Pre-written captions + open-in-app intents for the in-app share screen (no API keys needed)."""
    link = smart_link(prop["id"], "share")
    caps = {p: build_caption(prop, p, settings, smart_link(prop["id"], p)) for p in PLATFORM_ORDER}
    x_link = smart_link(prop["id"], "x")
    x_text = caps["x"].replace(f"\n\n👉 {x_link}", "")
    return {
        "smart_link": link,
        "captions": caps,
        "intents": {
            "facebook": f"https://www.facebook.com/sharer/sharer.php?u={quote(smart_link(prop['id'], 'facebook'), safe='')}&quote={quote(caps['facebook'], safe='')}",
            "x": f"https://twitter.com/intent/tweet?text={quote(x_text, safe='')}&url={quote(x_link, safe='')}",
            "linkedin": f"https://www.linkedin.com/sharing/share-offsite/?url={quote(smart_link(prop['id'], 'linkedin'), safe='')}",
            "instagram": "instagram://app",
            "tiktok": "snssdk1233://",
            "instagram_web": "https://www.instagram.com/",
            "tiktok_web": "https://www.tiktok.com/upload",
        },
    }


# ═══════════════════════════════ smart link landing page ═══════════════════════════════
def _store_links(settings: dict) -> tuple[str, str]:
    return settings.get("ios_store_url") or "", settings.get("android_store_url") or ""


def render_go_page(prop: dict, link: str, web_url: str, app_url: str, ios: str, android: str, src: str) -> str:
    title = escape(prop.get("title") or "Property on AMASS")
    desc = escape(f"{listing_word(prop)} · {location_line(prop)} · {fmt_price(prop)}" + (f" · {specs_line(prop)}" if specs_line(prop) else ""))
    image = escape(public_image(prop) or "")
    price = escape(fmt_price(prop))
    loc = escape(location_line(prop))
    specs = escape(specs_line(prop))
    ios_j, android_j, app_j, web_j = json.dumps(ios), json.dumps(android), json.dumps(app_url), json.dumps(web_url)
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title} · AMASS</title>
<meta name="description" content="{desc}">
<meta property="og:type" content="website"><meta property="og:site_name" content="AMASS"><meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}"><meta property="og:image" content="{image}"><meta property="og:url" content="{escape(link)}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="{title}"><meta name="twitter:description" content="{desc}"><meta name="twitter:image" content="{image}">
<meta name="apple-itunes-app" content="app-argument={escape(app_url)}">
<style>
:root{{--red:#E11B22;--ink:#111;--muted:#6b6b6b;--line:#eee}}*{{box-sizing:border-box}}body{{margin:0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#faf9f7;color:var(--ink)}}
.wrap{{max-width:440px;margin:0 auto;padding:20px}}.brand{{display:flex;align-items:center;gap:10px;margin:8px 0 18px}}.logo{{background:var(--ink);color:#fff;font-weight:800;letter-spacing:3px;padding:8px 12px;border-radius:10px;font-size:14px}}
.card{{background:#fff;border:1px solid var(--line);border-radius:18px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,.06)}}.img{{width:100%;aspect-ratio:4/3;object-fit:cover;background:#eee;display:block}}
.body{{padding:18px}}.k{{color:var(--red);font-weight:700;font-size:12px;letter-spacing:1px;text-transform:uppercase}}h1{{font-size:20px;margin:6px 0 4px;line-height:1.25}}.loc{{color:var(--muted);font-size:14px}}.price{{font-size:24px;font-weight:800;margin:12px 0 4px}}.specs{{color:var(--muted);font-size:13px}}
.btn{{display:block;text-align:center;text-decoration:none;font-weight:700;border-radius:999px;padding:14px 18px;margin-top:10px;font-size:15px}}.primary{{background:var(--red);color:#fff}}.secondary{{background:#fff;color:var(--ink);border:1px solid #ddd}}
.hint{{text-align:center;color:var(--muted);font-size:12px;margin-top:14px}}.spin{{display:inline-block;width:14px;height:14px;border:2px solid #ccc;border-top-color:var(--red);border-radius:50%;animation:s 1s linear infinite;vertical-align:-2px;margin-right:6px}}@keyframes s{{to{{transform:rotate(360deg)}}}}
</style></head><body><div class="wrap">
<div class="brand"><span class="logo">AMASS</span><span style="color:var(--muted);font-size:13px">Africa's Property Intelligence</span></div>
<div class="card">{f'<img class="img" src="{image}" alt="">' if image else ''}<div class="body">
<div class="k">{escape(listing_word(prop))}{' · Verified' if prop.get('verified') else ''}</div><h1>{title}</h1><div class="loc">{loc}</div><div class="price">{price}</div><div class="specs">{specs}</div>
<a class="btn primary" id="open" href="{escape(app_url)}">Open in the AMASS app</a>
<a class="btn secondary" id="get" href="{escape(web_url)}">Get the app / view on the web</a>
<div class="hint" id="hint"><span class="spin"></span>Opening the AMASS app…</div>
</div></div></div>
<script>
(function(){{var ua=navigator.userAgent||"";var ios=/iPhone|iPad|iPod/i.test(ua);var android=/Android/i.test(ua);var mobile=ios||android;
var ios_store={ios_j},android_store={android_j},app={app_j},web={web_j};var store=ios?ios_store:(android?android_store:"");var fallback=store||web;
var get=document.getElementById("get");if(store){{get.href=store;get.textContent="Get the app on the "+(ios?"App Store":"Play Store");}}
if(!mobile){{document.getElementById("hint").textContent="Open this link on your phone to launch the app.";setTimeout(function(){{location.replace(web);}},1200);return;}}
var left=false;function gone(){{left=true;}}window.addEventListener("pagehide",gone);window.addEventListener("blur",gone);document.addEventListener("visibilitychange",function(){{if(document.hidden)gone();}});
setTimeout(function(){{if(!left){{document.getElementById("hint").textContent=store?"Don't have AMASS yet? Get it from the store.":"Don't have AMASS yet? Continue on the web.";location.href=fallback;}}}},1800);
location.href=app;}})();
</script></body></html>"""


# ═══════════════════════════════ routers ═══════════════════════════════
class SettingsIn(BaseModel):
    auto_post: Optional[dict[str, bool]] = None
    hashtags: Optional[list[str]] = Field(default=None, max_length=20)
    ios_store_url: Optional[str] = Field(default=None, max_length=300)
    android_store_url: Optional[str] = Field(default=None, max_length=300)
    instagram_bio_note: Optional[str] = Field(default=None, max_length=200)
    tiktok_privacy: Optional[str] = None
    footer: Optional[str] = Field(default=None, max_length=160)


class PostIn(BaseModel):
    property_id: str
    platforms: list[str] = Field(min_length=1)
    captions: Optional[dict[str, str]] = None
    image_url: Optional[str] = None


def register_social_routes(db, require_admin) -> tuple[APIRouter, APIRouter]:
    admin = APIRouter(prefix="/api/admin/social", tags=["social-admin"])
    public = APIRouter(tags=["social-public"])

    async def _prop(property_id: str) -> dict:
        prop = await db.properties.find_one({"id": property_id}, {"_id": 0})
        if not prop:
            raise HTTPException(404, "Listing not found")
        return prop

    # ─── admin: overview ───
    @admin.get("/overview")
    async def overview(admin_user: dict = Depends(require_admin)):
        since = now() - timedelta(days=30)
        clicks: dict[str, int] = {}
        async for row in db.social_link_clicks.aggregate([{"$match": {"at": {"$gte": since}}}, {"$group": {"_id": "$src", "n": {"$sum": 1}}}]):
            clicks[row["_id"] or "other"] = row["n"]
        posts_30 = await db.social_publish_posts.count_documents({"created_at": {"$gte": since}})
        posted_30 = await db.social_publish_posts.count_documents({"created_at": {"$gte": since}, "status": {"$in": ["posted", "partial"]}})
        queued = await db.social_publish_posts.count_documents({"status": "queued"})
        recent = [post_public(p) async for p in db.social_publish_posts.find({}, {"_id": 0}).sort("created_at", -1).limit(25)]
        return {"platforms": await all_status(db), "settings": await get_settings(db), "stats": {"posts_30d": posts_30, "published_30d": posted_30, "queued": queued, "clicks_30d": sum(clicks.values()), "clicks_by_source": clicks}, "recent": recent}

    @admin.patch("/settings")
    async def patch_settings(body: SettingsIn, admin_user: dict = Depends(require_admin)):
        cur = await get_settings(db)
        upd = body.model_dump(exclude_none=True)
        if "auto_post" in upd:
            upd["auto_post"] = {**cur["auto_post"], **{k: bool(v) for k, v in upd["auto_post"].items() if k in PLATFORMS}}
        if "hashtags" in upd:
            upd["hashtags"] = [re.sub(r"[^A-Za-z0-9_]", "", t.lstrip("#")) for t in upd["hashtags"] if re.sub(r"[^A-Za-z0-9_]", "", t)]
        if "tiktok_privacy" in upd and upd["tiktok_privacy"] not in ("SELF_ONLY", "PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR"):
            raise HTTPException(400, "Unknown TikTok privacy level")
        for k in ("ios_store_url", "android_store_url"):
            if upd.get(k) and not upd[k].strip().startswith("https://"):
                raise HTTPException(400, "Store links must start with https://")
            if k in upd:
                upd[k] = upd[k].strip()
        merged = {**cur, **upd}
        await db.app_settings.update_one({"key": "social_publishing"}, {"$set": {"key": "social_publishing", "value": merged, "updated_at": now(), "updated_by": admin_user["id"]}, "$setOnInsert": {"created_at": now()}}, upsert=True)
        return merged

    @admin.post("/test/{platform}")
    async def test(platform: Platform, admin_user: dict = Depends(require_admin)):
        return await test_platform(db, platform)

    @admin.get("/connect/{platform}")
    async def connect(platform: Platform, admin_user: dict = Depends(require_admin)):
        if PLATFORMS[platform]["auth"] != "oauth":
            raise HTTPException(400, "This platform uses keys, not a sign-in")
        return {"authorize_url": await oauth_start(db, platform, admin_user), "redirect_uri": oauth_redirect_uri(platform)}

    @admin.delete("/accounts/{platform}")
    async def disconnect(platform: Platform, admin_user: dict = Depends(require_admin)):
        res = await db.social_publish_accounts.delete_one({"platform": platform})
        return {"ok": True, "removed": bool(res.deleted_count)}

    # ─── admin: compose + publish ───
    @admin.get("/listings")
    async def listings(search: Optional[str] = None, limit: int = Query(20, le=50), admin_user: dict = Depends(require_admin)):
        q: dict = {"verified": True, "images.0": {"$exists": True}, "status": {"$nin": ["sold", "archived", "hidden", "draft", "rejected"]}}
        if search and search.strip():
            rx = {"$regex": re.escape(search.strip()), "$options": "i"}
            q["$or"] = [{"title": rx}, {"city": rx}, {"state": rx}, {"location": rx}, {"agent_name": rx}]
        docs = await db.properties.find(q, {"_id": 0, "id": 1, "title": 1, "price": 1, "listing_type": 1, "city": 1, "state": 1, "location": 1, "images": {"$slice": 1}, "verified": 1, "bedrooms": 1, "bathrooms": 1}).sort("created_at", -1).limit(limit).to_list(limit)
        posted = {p["property_id"] async for p in db.social_publish_posts.find({"property_id": {"$in": [d["id"] for d in docs]}, "status": {"$in": ["posted", "partial"]}}, {"_id": 0, "property_id": 1})}
        return {"items": [{**d, "price_label": fmt_price(d), "location_label": location_line(d), "already_posted": d["id"] in posted} for d in docs]}

    @admin.get("/compose/{property_id}")
    async def compose(property_id: str, admin_user: dict = Depends(require_admin)):
        prop = await _prop(property_id)
        settings = await get_settings(db)
        statuses = await all_status(db)
        return {
            "property": {"id": prop["id"], "title": prop.get("title"), "price_label": fmt_price(prop), "location_label": location_line(prop), "specs": specs_line(prop), "verified": bool(prop.get("verified")), "images": [u for u in (prop.get("images") or []) if isinstance(u, str) and u.startswith("https://")][:10]},
            "image_url": public_image(prop), "link": smart_link(prop["id"], "preview"),
            "captions": {p: build_caption(prop, p, settings, smart_link(prop["id"], p)) for p in PLATFORM_ORDER},
            "tiktok_title": tiktok_title(prop),
            "platforms": [{"platform": s["platform"], "label": s["label"], "icon": s["icon"], "connected": s["connected"], "limit": s["limit"], "link_in_caption": s["link_in_caption"]} for s in statuses],
            "previous_posts": [post_public(p) async for p in db.social_publish_posts.find({"property_id": property_id}, {"_id": 0}).sort("created_at", -1).limit(5)],
        }

    @admin.post("/posts", status_code=201)
    async def create(body: PostIn, admin_user: dict = Depends(require_admin)):
        bad = [p for p in body.platforms if p not in PLATFORMS]
        if bad:
            raise HTTPException(400, f"Unknown platform: {', '.join(bad)}")
        prop = await _prop(body.property_id)
        if body.image_url and not body.image_url.startswith("https://"):
            raise HTTPException(400, "Photo must be a public https URL")
        for p, text in (body.captions or {}).items():
            if p in PLATFORMS and len(text) > PLATFORMS[p]["limit"]:
                raise HTTPException(400, f"{PLATFORMS[p]['label']} caption is over {PLATFORMS[p]['limit']} characters")
        post = await create_post(db, prop, body.platforms, "manual", admin_user, body.captions, body.image_url)
        out = await publish_post(db, post["id"])
        await db.audit_log.insert_one({"id": str(uuid.uuid4()), "source": "cockpit", "actor_id": admin_user["id"], "actor_name": admin_user.get("full_name"), "action": f"posted “{prop.get('title')}” to {', '.join(PLATFORMS[p]['label'] for p in out['platforms'])} ({out['status']})", "target": post["id"], "at": now()})
        return out

    @admin.get("/posts")
    async def posts(status: Optional[str] = None, limit: int = Query(50, le=200), admin_user: dict = Depends(require_admin)):
        q = {"status": status} if status else {}
        return {"items": [post_public(p) async for p in db.social_publish_posts.find(q, {"_id": 0}).sort("created_at", -1).limit(limit)]}

    @admin.post("/posts/{post_id}/retry")
    async def retry(post_id: str, platform: Optional[str] = None, admin_user: dict = Depends(require_admin)):
        return await publish_post(db, post_id, [platform] if platform else None)

    @admin.post("/posts/{post_id}/refresh")
    async def refresh(post_id: str, admin_user: dict = Depends(require_admin)):
        """Pull TikTok processing status for a submitted photo post."""
        post = await db.social_publish_posts.find_one({"id": post_id}, {"_id": 0})
        if not post:
            raise HTTPException(404, "Post not found")
        tt = (post.get("results") or {}).get("tiktok") or {}
        if tt.get("status") == "posted" and tt.get("external_id"):
            try:
                st = await tiktok_status(db, tt["external_id"])
                tt["tiktok_status"] = st.get("status")
                if st.get("status") == "FAILED":
                    tt["status"] = "failed"
                    tt["error"] = st.get("fail_reason") or "TikTok rejected the post"
                ids = st.get("publicaly_available_post_id") or st.get("publicly_available_post_id") or []
                if ids:
                    tt["url"] = f"https://www.tiktok.com/@/video/{ids[0]}"
                await db.social_publish_posts.update_one({"id": post_id}, {"$set": {"results.tiktok": tt, "updated_at": now()}})
            except PublishError as e:
                raise HTTPException(400, str(e))
        return post_public(await db.social_publish_posts.find_one({"id": post_id}, {"_id": 0}))

    @admin.delete("/posts/{post_id}")
    async def remove(post_id: str, admin_user: dict = Depends(require_admin)):
        res = await db.social_publish_posts.delete_one({"id": post_id, "status": {"$in": ["queued", "failed", "pending"]}})
        if not res.deleted_count:
            raise HTTPException(400, "Only queued or failed posts can be removed from the history")
        return {"ok": True}

    @admin.post("/publish-queued")
    async def publish_queued(admin_user: dict = Depends(require_admin)):
        ids = [p["id"] async for p in db.social_publish_posts.find({"status": {"$in": ["queued", "partial", "failed"]}, "results": {"$exists": True}}, {"_id": 0, "id": 1}).limit(20)]
        done = []
        for pid in ids:
            post = await db.social_publish_posts.find_one({"id": pid}, {"_id": 0, "results": 1})
            waiting = [p for p, r in (post.get("results") or {}).items() if r.get("status") == "queued"]
            if waiting:
                done.append(await publish_post(db, pid, waiting))
        return {"attempted": len(done), "items": done}

    # ─── public: OAuth callbacks ───
    @public.get("/api/social/oauth/{platform}/callback")
    async def oauth_callback(platform: str, code: Optional[str] = None, state: Optional[str] = None, error: Optional[str] = None, error_description: Optional[str] = None):
        from public_url import public_api_base

        if platform not in ("linkedin", "tiktok"):
            raise HTTPException(404, "Unknown platform")
        back = f"{public_api_base()}/admin/social"
        if error or not code or not state:
            return RedirectResponse(f"{back}?connect={platform}&error={quote(error_description or error or 'cancelled')}")
        try:
            doc = await oauth_finish(db, platform, code, state)
        except HTTPException as e:
            return RedirectResponse(f"{back}?connect={platform}&error={quote(str(e.detail))}")
        return RedirectResponse(f"{back}?connect={platform}&ok=1&name={quote(doc.get('display_name') or '')}")

    # ─── public: smart link ───
    @public.get("/api/go/{property_id}", response_class=HTMLResponse)
    async def go(property_id: str, request: Request, src: Optional[str] = None, post: Optional[str] = None):
        from public_url import public_api_base

        prop = await db.properties.find_one({"id": property_id}, {"_id": 0})
        base = public_api_base()
        if not prop:
            return RedirectResponse(f"{base}/" if base else "/")
        ua = request.headers.get("user-agent") or ""
        source = re.sub(r"[^a-z0-9_-]", "", (src or "direct").lower())[:24] or "direct"
        if not BOT_UA.search(ua):
            device = "ios" if re.search(r"iPhone|iPad|iPod", ua) else ("android" if "Android" in ua else "desktop")
            await db.social_link_clicks.insert_one({"id": str(uuid.uuid4()), "property_id": property_id, "src": source, "post_id": post, "device": device, "at": now(), "referer": (request.headers.get("referer") or "")[:200]})
            if post:
                await db.social_publish_posts.update_one({"id": post}, {"$inc": {"clicks": 1}})
            await db.properties.update_one({"id": property_id}, {"$inc": {"smart_link_clicks": 1, f"smart_link_by_source.{source}": 1}})
        settings = await get_settings(db)
        ios, android = _store_links(settings)
        link = f"{base}/api/go/{property_id}?src={source}"
        web_url = f"{base}/property/{property_id}?src={source}"
        app_url = f"amass://property/{property_id}?src={source}"
        return HTMLResponse(render_go_page(prop, link, web_url, app_url, ios, android, source), headers={"Cache-Control": "no-store"})

    return admin, public
