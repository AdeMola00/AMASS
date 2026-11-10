"""AMASS Feed — moderation, admin & portal controls.

  • `screen_post`: AI looks at every new/edited post (text + first photo) and returns a JSON verdict.
    Any flag hides the post pending review and tells the author (with an appeal path); unflagged posts with a
    score ≥ settings.review_score are queued for a human glance while they stay visible.
  • Admin actions are plain functions (`admin_*`) so the in-app admin (`/api/feed/admin/*`, is_admin) and the
    Admin Control Portal (`/api/portal/feed/*`, role matrix) behave identically and share one audit log
    (`feed_audit_log`).
"""
from __future__ import annotations

import base64
import json
import logging
import os
import re
import uuid
from datetime import timedelta
from typing import Any, Literal, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from social_common import new_id, notify, now, public_users

logger = logging.getLogger("amass.feed.moderation")
LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")
PROVIDER, MODEL = "openai", "gpt-5.4"
LABELS = ["scam", "fraud", "misleading", "prohibited_item", "adult", "violence", "hate", "harassment", "spam", "personal_data", "other"]

SYSTEM = (
    "You are the content-safety reviewer for AMASS, a Nigerian property, home-services and neighbourhood marketplace app. "
    "Review ONE user post (text and, when given, its first photo). Decide whether it is likely to be harmful, fraudulent, misleading, "
    "sexually explicit, violent, hateful, harassing, spam, or selling prohibited items (weapons, drugs, counterfeit goods, stolen property, "
    "wildlife, government documents). Ordinary second-hand items, services, property adverts, promotions and everyday posts are FINE. "
    "Be proportionate: only flag when a reasonable moderator would want to look. Return STRICT JSON only."
)
PROMPT = (
    "Post type: {ptype}\nTitle: {title}\nText: {body}\nPrice: {price}\n\n"
    'Respond with JSON: {{"flag": true|false, "score": 0.0-1.0 (confidence that this needs moderation), '
    '"labels": [subset of {labels}], "summary": "one short sentence for the moderator", "safe_summary": "one short neutral sentence"}}'
)


def _strip_json(text: str) -> dict:
    s = re.sub(r"^```(?:json)?\s*|\s*```$", "", (text or "").strip(), flags=re.S)
    try:
        return json.loads(s)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", s, flags=re.S)
        if not m:
            raise
        return json.loads(m.group(0))


async def _image_b64(url: str) -> Optional[str]:
    try:
        if "/api/public-files/" in url:
            from object_storage import get_object

            path = url.split("/api/public-files/", 1)[1].split("?")[0]
            data, _ct = await get_object(path)
        elif url.startswith("http"):
            async with httpx.AsyncClient(timeout=12) as c:
                r = await c.get(url)
                r.raise_for_status()
                data = r.content
        else:
            return None
        if len(data) > 6 * 1024 * 1024:
            return None
        return base64.b64encode(data).decode()
    except Exception as e:  # noqa: BLE001
        logger.info("moderation image fetch skipped: %s", e)
        return None


async def ai_verdict(post: dict) -> dict:
    """Ask the model. Never raises — a failure returns a 'clear, unchecked' verdict so posting is never blocked."""
    if not LLM_KEY:
        return {"flag": False, "score": 0.0, "labels": [], "summary": "AI moderation not configured", "checked": False}
    from feed import post_type_of

    try:
        from emergentintegrations.llm.chat import ImageContent, LlmChat, UserMessage

        chat = LlmChat(api_key=LLM_KEY, session_id=f"feed-mod-{uuid.uuid4().hex}", system_message=SYSTEM).with_model(PROVIDER, MODEL)
        prompt = PROMPT.format(ptype=post_type_of(post), title=(post.get("title") or "")[:200], body=(post.get("body") or "")[:1500], price=post.get("price") or "—", labels=", ".join(LABELS))
        img = await _image_b64((post.get("photos") or [None])[0]) if post.get("photos") else None
        msg = UserMessage(text=prompt, file_contents=[ImageContent(image_base64=img)]) if img else UserMessage(text=prompt)
        raw = await chat.send_message(msg)
        v = _strip_json(raw or "")
        labels = [str(x) for x in (v.get("labels") or []) if str(x) in LABELS]
        return {"flag": bool(v.get("flag")), "score": max(0.0, min(1.0, float(v.get("score") or 0))), "labels": labels, "summary": str(v.get("summary") or "")[:200], "checked": True, "model": f"{PROVIDER}/{MODEL}"}
    except Exception as e:  # noqa: BLE001
        logger.warning("feed moderation failed: %s", e)
        return {"flag": False, "score": 0.0, "labels": [], "summary": f"AI check failed ({e.__class__.__name__})", "checked": False}


async def _audit(db, actor_id: Optional[str], action: str, target: str, **meta) -> None:
    await db.feed_audit_log.insert_one({"id": new_id(), "actor_id": actor_id, "action": action, "target": target, "meta": meta, "created_at": now()})


async def screen_post(db, post_id: str) -> Optional[dict]:
    from feed import get_settings, market_sync

    p = await db.social_posts.find_one({"id": post_id}, {"_id": 0})
    if not p or p.get("status") == "removed":
        return None
    settings = await get_settings(db)
    v = await ai_verdict(p)
    mod: dict[str, Any] = {"status": "clear", "score": v["score"], "labels": v["labels"], "summary": v["summary"], "checked_at": now(), "model": v.get("model"), "ai_checked": v["checked"]}
    sets: dict[str, Any] = {}
    if v["flag"]:
        # Product rule: anything the AI flags is hidden until a moderator approves it (never silently published).
        mod["status"] = "flagged"
        sets["status"] = "hidden_review"
        if p.get("status") in ("active", "reserved", "paused"):
            sets["status_before_removal"] = p["status"]
    elif v["checked"] and v["score"] >= float(settings["review_score"]):
        mod["status"] = "review"  # not flagged, but worth a human glance — stays visible
    sets["moderation"] = mod
    await db.social_posts.update_one({"id": post_id}, {"$set": sets})
    if mod["status"] == "flagged":
        await market_sync(db, {**p, "status": "hidden_review"}, {"id": p["author_id"], "full_name": p.get("author_name")})
        try:
            await notify(db, p["author_id"], "SOCIAL_MODERATION", "Your post is being reviewed", "Our safety check flagged it, so it's hidden for now. A moderator will look shortly — you can add context from My posts.", {"post_id": post_id, "status": "flagged"})
        except Exception:  # noqa: BLE001
            pass
    await _audit(db, None, "ai_screen", post_id, verdict=mod["status"], score=v["score"], labels=v["labels"])
    return mod


# ─── Admin actions (shared by in-app admin + portal) ─────────────────────────
async def admin_overview(db) -> dict:
    since = now() - timedelta(days=7)
    live = await db.social_posts.count_documents({"status": {"$in": ["active", "reserved"]}})
    return {
        "posts_live": live,
        "posts_7d": await db.social_posts.count_documents({"created_at": {"$gte": since}, "status": {"$ne": "removed"}}),
        "flagged": await db.social_posts.count_documents({"moderation.status": "flagged", "status": {"$ne": "removed"}}),
        "review": await db.social_posts.count_documents({"moderation.status": "review", "status": {"$ne": "removed"}}),
        "appeals": await db.social_appeals.count_documents({"status": "open"}),
        "reports_open": await db.social_post_reports.count_documents({"status": "open"}),
        "stories_live": await db.social_stories.count_documents({"expires_at": {"$gt": now()}, "status": {"$ne": "removed"}}),
        "reactions_7d": await db.social_post_reactions.count_documents({"created_at": {"$gte": since}}),
        "comments_7d": await db.social_post_comments.count_documents({"created_at": {"$gte": since}}),
        "follows_7d": await db.social_follows.count_documents({"created_at": {"$gte": since}}),
        "sponsored_live": await db.social_posts.count_documents({"sponsored": True, "status": {"$in": ["active", "reserved"]}}),
        "verified_creators": await db.social_profiles.count_documents({"creator_verified": True}),
        "suspended": await db.social_profiles.count_documents({"feed_suspended": True}),
        "settings": await _settings(db),
    }


async def _settings(db) -> dict:
    from feed import get_settings

    return await get_settings(db)


async def _shape_admin_post(db, p: dict, viewer: dict) -> dict:
    from feed import shape_post

    a = (await public_users(db, [p["author_id"]])).get(p["author_id"])
    out = shape_post(p, viewer.get("id", ""), None, False, False, a, {"estate_ids": []})
    out["moderation"] = {**(p.get("moderation") or {}), "checked_at": (p.get("moderation") or {}).get("checked_at").isoformat() if hasattr((p.get("moderation") or {}).get("checked_at"), "isoformat") else (p.get("moderation") or {}).get("checked_at")}
    out["status"] = p.get("status")
    out["reports"] = await db.social_post_reports.count_documents({"post_id": p["id"], "status": "open"})
    out["appeal"] = await db.social_appeals.find_one({"post_id": p["id"], "status": "open"}, {"_id": 0})
    if out["appeal"]:
        out["appeal"]["created_at"] = out["appeal"]["created_at"].isoformat()
    prof = await db.social_profiles.find_one({"user_id": p["author_id"]}, {"_id": 0, "feed_suspended": 1, "creator_verified": 1, "strikes": 1}) or {}
    out["author"] = {**(out["author"] or {}), "suspended": bool(prof.get("feed_suspended")), "verified": bool(prof.get("creator_verified") or (out["author"] or {}).get("verified")), "strikes": int(prof.get("strikes") or 0)}
    return out


async def admin_queue(db, viewer: dict, status: str, limit: int = 60) -> dict:
    q: dict[str, Any] = {"status": {"$ne": "removed"}}
    if status == "flagged":
        q["moderation.status"] = "flagged"
    elif status == "review":
        q["moderation.status"] = "review"
    elif status == "appealed":
        q = {"moderation.status": "appealed"}  # includes posts a moderator removed — that's what most appeals are about
    elif status == "reported":
        ids = await db.social_post_reports.distinct("post_id", {"status": "open"})
        q["id"] = {"$in": ids}
    elif status == "sponsored":
        q["sponsored"] = True
    elif status == "removed":
        q = {"status": "removed", "moderation.decided_by": {"$exists": True}}
    rows = await db.social_posts.find(q, {"_id": 0}).sort("updated_at", -1).limit(limit).to_list(limit)
    return {"items": [await _shape_admin_post(db, p, viewer) for p in rows], "count": len(rows)}


async def admin_post(db, viewer: dict, post_id: str) -> dict:
    p = await db.social_posts.find_one({"id": post_id}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Post not found")
    out = await _shape_admin_post(db, p, viewer)
    reps = await db.social_post_reports.find({"post_id": post_id}, {"_id": 0}).sort("created_at", -1).to_list(50)
    users = await public_users(db, [r["reporter_id"] for r in reps])
    out["report_list"] = [{**r, "created_at": r["created_at"].isoformat(), "reporter": users.get(r["reporter_id"])} for r in reps]
    comments = await db.social_post_comments.find({"post_id": post_id, "status": "active"}, {"_id": 0}).sort("created_at", -1).limit(20).to_list(20)
    out["recent_comments"] = [{"id": c["id"], "body": c["body"], "author_id": c["author_id"], "created_at": c["created_at"].isoformat()} for c in comments]
    out["audit"] = [{**a, "created_at": a["created_at"].isoformat()} for a in await db.feed_audit_log.find({"target": post_id}, {"_id": 0}).sort("created_at", -1).limit(20).to_list(20)]
    return out


async def admin_decide(db, actor: dict, post_id: str, action: str, note: Optional[str]) -> dict:
    from feed import market_sync

    p = await db.social_posts.find_one({"id": post_id}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Post not found")
    n = now()
    mod = {**(p.get("moderation") or {}), "decided_by": actor.get("email") or actor.get("id"), "decided_at": n, "decision_note": note}
    if action == "approve":
        mod["status"] = "clear"
        new_status = (p.get("status_before_removal") or "active") if p.get("status") in ("hidden_review", "removed") else p.get("status", "active")
        title, body = "Your post is back", "A moderator reviewed it and it's live again."
    elif action == "remove":
        mod["status"] = "removed"
        new_status = "removed"
        title, body = "Your post was removed", (note or "It didn't meet the AMASS community rules.") + " You can appeal from My posts."
        if p.get("status") != "removed":  # one strike per removal, never for re-confirming a removal
            await db.social_profiles.update_one({"user_id": p["author_id"]}, {"$inc": {"strikes": 1}, "$setOnInsert": {"user_id": p["author_id"], "created_at": n}}, upsert=True)
    elif action == "hide":
        mod["status"] = "flagged"
        new_status = "hidden_review"
        title, body = "Your post is hidden pending review", note or "A moderator is taking a closer look."
    else:
        raise HTTPException(422, "Unknown action")
    sets: dict[str, Any] = {"status": new_status, "moderation": mod, "updated_at": n}
    if action in ("remove", "hide") and p.get("status") in ("active", "reserved", "paused", "gone"):
        sets["status_before_removal"] = p["status"]  # so approve brings a Reserved item back as Reserved
    await db.social_posts.update_one({"id": post_id}, {"$set": sets})
    await db.social_post_reports.update_many({"post_id": post_id, "status": "open"}, {"$set": {"status": "resolved", "action": action, "note": note, "resolved_by": actor.get("id"), "resolved_at": n}})
    await db.social_appeals.update_many({"post_id": post_id, "status": "open"}, {"$set": {"status": "accepted" if action == "approve" else "rejected", "decided_by": actor.get("id"), "note": note, "decided_at": n}})
    await market_sync(db, {**p, "status": new_status}, {"id": p["author_id"], "full_name": p.get("author_name")})
    try:
        await notify(db, p["author_id"], "SOCIAL_MODERATION", title, body, {"post_id": post_id, "status": mod["status"]})
    except Exception:  # noqa: BLE001
        pass
    await _audit(db, actor.get("id"), f"post_{action}", post_id, note=note, author_id=p["author_id"])
    return {"ok": True, "status": new_status, "moderation_status": mod["status"]}


async def admin_reports(db, status: str = "open") -> dict:
    rows = await db.social_post_reports.find({"status": status}, {"_id": 0}).sort("created_at", -1).to_list(200)
    users = await public_users(db, [r["reporter_id"] for r in rows] + [r["author_id"] for r in rows])
    for r in rows:
        r["reporter"], r["author"], r["created_at"] = users.get(r["reporter_id"]), users.get(r["author_id"]), r["created_at"].isoformat()
        if r.get("resolved_at"):
            r["resolved_at"] = r["resolved_at"].isoformat()
    return {"items": rows}


async def admin_appeals(db, status: str = "open") -> dict:
    rows = await db.social_appeals.find({"status": status}, {"_id": 0}).sort("created_at", -1).to_list(200)
    users = await public_users(db, [r["user_id"] for r in rows])
    posts = {p["id"]: p for p in await db.social_posts.find({"id": {"$in": [r["post_id"] for r in rows]}}, {"_id": 0, "id": 1, "title": 1, "body": 1, "photos": 1, "status": 1, "moderation": 1}).to_list(200)}
    out = []
    for r in rows:
        p = posts.get(r["post_id"]) or {}
        out.append({**r, "created_at": r["created_at"].isoformat(), "user": users.get(r["user_id"]), "post": {"id": p.get("id"), "title": p.get("title"), "body": (p.get("body") or "")[:160], "cover": (p.get("photos") or [None])[0], "status": p.get("status"), "moderation_summary": (p.get("moderation") or {}).get("summary"), "labels": (p.get("moderation") or {}).get("labels")}})
    return {"items": out}


async def admin_user_action(db, actor: dict, user_id: str, action: str, note: Optional[str]) -> dict:
    u = await db.users.find_one({"id": user_id}, {"_id": 0, "id": 1, "full_name": 1})
    if not u:
        raise HTTPException(404, "Member not found")
    n = now()
    if action == "verify":
        sets = {"creator_verified": True, "creator_verified_at": n}
        msg = ("You're a verified creator", "Your AMASS Feed profile now carries the verified badge.")
    elif action == "unverify":
        sets = {"creator_verified": False}
        msg = None
    elif action == "clear_strikes":
        sets = {"strikes": 0}
        msg = None
    elif action == "warn":
        # A formal warning: adds a strike and tells the member why; nothing is hidden.
        sets = {"last_warned_at": n, "last_warning_note": note}
        await db.social_profiles.update_one({"user_id": user_id}, {"$inc": {"strikes": 1}, "$setOnInsert": {"user_id": user_id, "created_at": n}}, upsert=True)
        msg = ("A warning from AMASS moderators", note or "A recent post broke the community rules. Further breaches may pause your Feed account.")
    elif action == "suspend":
        sets = {"feed_suspended": True, "feed_suspended_at": n, "feed_suspended_note": note}
        # Remember each post's status so a restore brings Reserved items back as Reserved, not Live.
        await db.social_posts.update_many({"author_id": user_id, "status": {"$in": ["active", "reserved"]}}, [{"$set": {"status_before_suspend": "$status", "status": "paused", "paused_by_admin": True, "updated_at": n}}])
        msg = ("Your Feed posting is paused", note or "A moderator restricted your account. Reply to any notice to appeal.")
    elif action == "restore":
        sets = {"feed_suspended": False}
        await db.social_posts.update_many({"author_id": user_id, "paused_by_admin": True}, [{"$set": {"status": {"$ifNull": ["$status_before_suspend", "active"]}, "updated_at": n}}, {"$unset": ["paused_by_admin", "status_before_suspend"]}])
        msg = ("Your Feed account is restored", "You can post again.")
    else:
        raise HTTPException(422, "Unknown action")
    await db.social_profiles.update_one({"user_id": user_id}, {"$set": sets, "$setOnInsert": {"user_id": user_id, "created_at": n}}, upsert=True)
    if msg:
        try:
            await notify(db, user_id, "SOCIAL_MODERATION", msg[0], msg[1], {"user_id": user_id, "action": action})
        except Exception:  # noqa: BLE001
            pass
    await _audit(db, actor.get("id"), f"user_{action}", user_id, note=note)
    return {"ok": True}


async def admin_users(db, q: str = "", only: Optional[str] = None) -> dict:
    query: dict[str, Any] = {}
    if only == "verified":
        query["creator_verified"] = True
    elif only == "suspended":
        query["feed_suspended"] = True
    profs = await db.social_profiles.find(query, {"_id": 0, "user_id": 1, "handle": 1, "creator_verified": 1, "feed_suspended": 1, "follower_count": 1, "post_count": 1, "strikes": 1, "is_business": 1, "business_name": 1}).sort("follower_count", -1).limit(300).to_list(300)
    ids = [p["user_id"] for p in profs]
    if q.strip():
        rx = {"$regex": re.escape(q.strip()), "$options": "i"}
        hits = await db.users.find({"$or": [{"full_name": rx}, {"email": rx}]}, {"_id": 0, "id": 1}).limit(40).to_list(40)
        hit_ids = {h["id"] for h in hits}
        ids = [i for i in ids if i in hit_ids] if only else list(hit_ids)
        profs = {p["user_id"]: p for p in profs}
        profs = [profs.get(i, {"user_id": i}) for i in ids]
    users = await public_users(db, ids)
    return {"items": [{**users.get(p["user_id"], {"id": p["user_id"], "full_name": "Member"}), "handle": p.get("handle"), "verified": bool(p.get("creator_verified")), "suspended": bool(p.get("feed_suspended")), "followers": int(p.get("follower_count") or 0), "posts": int(p.get("post_count") or 0), "strikes": int(p.get("strikes") or 0), "is_business": bool(p.get("is_business")), "business_name": p.get("business_name")} for p in profs if p.get("user_id") in users][:100]}


async def admin_set_sponsored(db, actor: dict, post_id: str, sponsored: bool, note: Optional[str]) -> dict:
    r = await db.social_posts.update_one({"id": post_id}, {"$set": {"sponsored": sponsored, "updated_at": now()}})
    if not r.matched_count:
        raise HTTPException(404, "Post not found")
    await _audit(db, actor.get("id"), "sponsored_on" if sponsored else "sponsored_off", post_id, note=note)
    return {"ok": True, "sponsored": sponsored}


class SettingsIn(BaseModel):
    discovery_every: Optional[int] = Field(None, ge=0, le=50)  # FIXA pros / Brands columns alternate after every N posts (0 = off)
    homes_every: Optional[int] = Field(None, ge=0, le=60)
    story_expiry_hours: Optional[int] = Field(None, ge=1, le=168)
    ai_moderation: Optional[bool] = None
    review_score: Optional[float] = Field(None, ge=0.1, le=1.0)
    max_posts_per_day: Optional[int] = Field(None, ge=1, le=200)
    max_comments_per_hour: Optional[int] = Field(None, ge=5, le=500)
    sponsored_per_page: Optional[int] = Field(None, ge=0, le=10)


async def admin_update_settings(db, actor: dict, body: SettingsIn) -> dict:
    ch = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if ch:
        await db.feed_settings.update_one({"key": "feed"}, {"$set": {**ch, "updated_at": now(), "updated_by": actor.get("email") or actor.get("id")}}, upsert=True)
        await _audit(db, actor.get("id"), "settings", "feed", **ch)
    return await _settings(db)


async def admin_audit(db, limit: int = 100) -> dict:
    rows = await db.feed_audit_log.find({}, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    users = await public_users(db, [r["actor_id"] for r in rows if r.get("actor_id")])
    return {"items": [{**r, "created_at": r["created_at"].isoformat(), "actor": users.get(r.get("actor_id")) if r.get("actor_id") else {"full_name": "AI screen"}} for r in rows]}


class DecideIn(BaseModel):
    action: Literal["approve", "remove", "hide"]
    note: Optional[str] = Field(None, max_length=600)


class UserActionIn(BaseModel):
    action: Literal["verify", "unverify", "warn", "suspend", "restore", "clear_strikes"]
    note: Optional[str] = Field(None, max_length=600)


class SponsoredIn(BaseModel):
    sponsored: bool
    note: Optional[str] = Field(None, max_length=300)


# Machine-readable contract for the external AMASS Admin Portal (same shape as /api/portal/market/schema).
SCHEMA = [
    {"group": "overview", "permission": "feed", "endpoints": [
        ["GET", "/feed/overview", "KPIs: live posts, posts 7d, flagged, review, appeals, open reports, live stories, reactions/comments/follows 7d, sponsored, verified creators, suspended + current settings"],
        ["GET", "/feed/schema", "This list"],
    ]},
    {"group": "moderation queue", "permission": "feed", "endpoints": [
        ["GET", "/feed/queue?status=flagged|review|appealed|reported|sponsored|removed", "Posts needing attention. `flagged` = hidden by AI until approved; `review` = visible, AI score above the review threshold; `appealed` = author asked for a second look; `reported` = open member reports; `removed` = moderator-removed posts"],
        ["GET", "/feed/posts/{id}", "Full post + moderation verdict (score, labels, summary, decided_by/at, note) + report_list + recent_comments + audit"],
        ["POST", "/feed/posts/{id}/decide", "{action: approve|remove|hide, note?} — approve publishes a hidden post; remove takes it down permanently (+1 strike, author notified, can appeal); hide pulls a live post pending review"],
        ["POST", "/feed/posts/{id}/rescreen", "Run the AI safety check again (text + first photo)"],
        ["POST", "/feed/posts/{id}/sponsored", "{sponsored, note?} — mark/unmark a post as sponsored"],
    ]},
    {"group": "reports & appeals", "permission": "feed", "endpoints": [
        ["GET", "/feed/reports?status=open|resolved", "Member reports with reporter + author"],
        ["GET", "/feed/appeals?status=open|accepted|rejected", "Author appeals with the post excerpt + AI summary/labels; resolved automatically by the next decide on the post"],
    ]},
    {"group": "creators", "permission": "feed", "endpoints": [
        ["GET", "/feed/users?q=&only=verified|suspended", "Creators with handle, followers, posts, strikes, suspended/verified flags"],
        ["POST", "/feed/users/{id}/action", "{action: verify|unverify|warn|suspend|restore|clear_strikes, note?} — warn adds a strike + notifies; suspend pauses every live post + blocks posting; restore undoes it; clear_strikes resets the counter"],
    ]},
    {"group": "settings & audit", "permission": "feed", "endpoints": [
        ["GET", "/feed/settings", "discovery_every (FIXA pros / Brands columns alternate after N posts), homes_every, story_expiry_hours, ai_moderation, review_score, max_posts_per_day, max_comments_per_hour, sponsored_per_page"],
        ["PUT", "/feed/settings", "Partial update of the same keys"],
        ["GET", "/feed/audit?limit=", "Every AI verdict and moderator action, newest first"],
    ]},
]


def _routes(router: APIRouter, db, view, edit) -> APIRouter:
    """Bind the shared admin functions to a router with two dependencies (view / edit)."""

    @router.get("/overview")
    async def overview(acc: dict = Depends(view)):
        return await admin_overview(db)

    @router.get("/schema")
    async def schema(acc: dict = Depends(view)):
        return {"base": "/api/portal", "groups": SCHEMA}

    @router.get("/queue")
    async def queue(status: str = Query("flagged", pattern=r"^(flagged|review|appealed|reported|sponsored|removed)$"), acc: dict = Depends(view)):
        return await admin_queue(db, acc, status)

    @router.get("/posts/{post_id}")
    async def post(post_id: str, acc: dict = Depends(view)):
        return await admin_post(db, acc, post_id)

    @router.post("/posts/{post_id}/decide")
    async def decide(post_id: str, body: DecideIn, acc: dict = Depends(edit)):
        return await admin_decide(db, acc, post_id, body.action, body.note)

    @router.post("/posts/{post_id}/sponsored")
    async def sponsored(post_id: str, body: SponsoredIn, acc: dict = Depends(edit)):
        return await admin_set_sponsored(db, acc, post_id, body.sponsored, body.note)

    @router.post("/posts/{post_id}/rescreen")
    async def rescreen(post_id: str, acc: dict = Depends(edit)):
        mod = await screen_post(db, post_id)
        if mod is None:
            raise HTTPException(404, "Post not found")
        return {"ok": True, "moderation": {**mod, "checked_at": mod["checked_at"].isoformat()}}

    @router.get("/reports")
    async def reports(status: str = Query("open", pattern=r"^(open|resolved)$"), acc: dict = Depends(view)):
        return await admin_reports(db, status)

    @router.get("/appeals")
    async def appeals(status: str = Query("open", pattern=r"^(open|accepted|rejected)$"), acc: dict = Depends(view)):
        return await admin_appeals(db, status)

    @router.get("/users")
    async def users(q: str = "", only: Optional[str] = Query(None, pattern=r"^(verified|suspended)$"), acc: dict = Depends(view)):
        return await admin_users(db, q, only)

    @router.post("/users/{user_id}/action")
    async def user_action(user_id: str, body: UserActionIn, acc: dict = Depends(edit)):
        return await admin_user_action(db, acc, user_id, body.action, body.note)

    @router.get("/settings")
    async def settings(acc: dict = Depends(view)):
        return await _settings(db)

    @router.put("/settings")
    async def update_settings(body: SettingsIn, acc: dict = Depends(edit)):
        return await admin_update_settings(db, acc, body)

    @router.get("/audit")
    async def audit(limit: int = Query(100, ge=1, le=500), acc: dict = Depends(view)):
        return await admin_audit(db, limit)

    return router


def register_feed_admin_routes(db, require_admin) -> APIRouter:
    """In-app admin (`is_admin` members) — /api/feed/admin/*."""
    return _routes(APIRouter(prefix="/api/feed/admin", tags=["feed-admin"]), db, require_admin, require_admin)


def register_feed_portal_routes(db, require) -> APIRouter:
    """Admin Control Portal — /api/portal/feed/* (gated by the portal's `feed` permission module)."""
    return _routes(APIRouter(prefix="/feed", tags=["portal-feed"]), db, require("feed", "view"), require("feed", "edit"))
