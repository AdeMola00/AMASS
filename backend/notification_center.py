"""AMASS Notification Center — user-controlled notifications.

One funnel (`emit`) for every in-app notification. It applies the user's
preferences before anything is stored or pushed:

  • categories       — each notification kind maps to a category the user can
                       switch off (property_matches, nearby_listings,
                       brand_offers, marketplace, social, passport, receipts,
                       admin, messages, services).
  • frequency        — property / marketplace categories can be immediate,
                       daily or weekly. Non-immediate items are queued and
                       flushed as ONE digest notification per interval.
  • quiet hours      — the in-app centre always updates; the phone stays
                       silent between the chosen hours (push is skipped).
  • dedupe           — the same kind + target is never repeated inside a
                       24h window (7 days when an explicit dedupe_key is given).
  • push             — relayed through push_notifications.send_push (Emergent
                       managed) only when the user opted in; failures never
                       block the caller.

Matchers (`run_matchers`) generate the proactive categories: saved-search
matches, new listings near the user, offers from followed brands, relevant
Marketplace ads and Passport / mandate expiry reminders. They run hourly from
the server startup loop and can be triggered on demand by an admin.

Nothing here ever creates contact invitations or social requests — it only
notifies about ones the user (or a real counterpart) initiated.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import math
import os
import uuid
from datetime import datetime, timedelta, timezone
from html import escape
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field

from auth_security import send_email
from push_notifications import send_push

logger = logging.getLogger("amass.notifications")

# Public web origin used for links inside emails (G3: absolute https only).
APP_PUBLIC_URL = os.environ.get("APP_PUBLIC_URL", "https://amass.africa").rstrip("/")
EMAIL_DIGEST_FREQUENCIES = ("daily", "weekly")
EMAIL_TEST_COOLDOWN_S = 300

# ─── Categories ───────────────────────────────────────────────────────────
# `digest` categories support frequency control; the rest are always immediate.
CATEGORIES: dict[str, dict[str, Any]] = {
    "property_matches": {"label": "Saved-search matches", "caption": "New homes that match a search you saved", "icon": "search", "digest": True, "default_frequency": "immediate"},
    "nearby_listings": {"label": "New listings near you", "caption": "Homes added around your estate or city", "icon": "location", "digest": True, "default_frequency": "daily"},
    "brand_offers": {"label": "Offers from brands you follow", "caption": "Verified deals from stores you saved", "icon": "pricetag", "digest": True, "default_frequency": "weekly"},
    "marketplace": {"label": "Marketplace ads & offers", "caption": "Relevant ads and promos (bundled). Offers on your own listings always arrive instantly", "icon": "storefront", "digest": True, "default_frequency": "daily"},
    "social": {"label": "Social requests", "caption": "Friend requests, list invites, estate joins", "icon": "people", "digest": False, "default_frequency": "immediate"},
    "nearby_free": {"label": "Free items nearby", "caption": "Giveaways in categories you follow on Social", "icon": "gift", "digest": True, "default_frequency": "immediate"},
    "passport": {"label": "Passport reminders", "caption": "Mandate and Passport expiry", "icon": "document-text", "digest": False, "default_frequency": "immediate"},
    "receipts": {"label": "Receipts", "caption": "Top-ups, unlocks and payouts", "icon": "receipt", "digest": False, "default_frequency": "immediate"},
    "admin": {"label": "Admin decisions", "caption": "Approvals, rejections and moderation", "icon": "shield-checkmark", "digest": False, "default_frequency": "immediate"},
    "messages": {"label": "Messages", "caption": "Chats with agents, buyers and neighbours", "icon": "chatbubble", "digest": False, "default_frequency": "immediate"},
    "services": {"label": "Services & projects", "caption": "Viewings, inspections, FIXA bookings, renovations", "icon": "construct", "digest": False, "default_frequency": "immediate"},
    "home": {"label": "My Home reminders", "caption": "Bills due, maintenance, document and warranty expiry", "icon": "home", "digest": False, "default_frequency": "immediate"},
}
FREQUENCIES = ("immediate", "daily", "weekly")

# Existing notification kinds → category (anything unknown lands in "services").
KIND_CATEGORY: dict[str, str] = {
    "NEW_MESSAGE": "messages",
    "SAVED_SEARCH_MATCH": "property_matches",
    "BOOSTED_LISTING": "property_matches",
    "NEARBY_LISTINGS": "nearby_listings",
    "BRAND_OFFER": "brand_offers",
    "MARKET_AD": "marketplace",
    "MARKET_OFFER": "marketplace",
    "MARKET_MODERATION": "admin",
    "PASSPORT_EXPIRY": "passport",
    "RECEIPT": "receipts",
    "VERIFICATION_WIN": "admin",
    "FRAUD_FLAG_RAISED": "admin",
    "REPRESENTATION_DECISION": "admin",
    "ESTATE_APPROVED": "admin",
    "ESTATE_REJECTED": "admin",
    "VERIFICATION_TASK_ASSIGNED": "services",
    "CANDIDATE_PROMOTED": "admin",
    "ESTATE_REQUEST": "social",
    "CONNECTION_REQUEST": "social",
    "CONNECTION_ACCEPTED": "social",
    "COLLECTION_INVITE": "social",
    "COLLECTION_ACTIVITY": "social",
    "ESTATE_NOTICE": "social",
    "POST_REPLY": "social",
    "SOCIAL_POST_LIKE": "social",
    "SOCIAL_POST_COMMENT": "social",
    "SOCIAL_POST_REMOVED": "admin",
    "IDENTITY_SUBMITTED": "admin",
    "IDENTITY_VERIFIED": "admin",
    "IDENTITY_REJECTED": "admin",
    "DOCS_VERIFIED": "admin",
    "DOCS_REJECTED": "admin",
    "SOCIAL_NEARBY_FREE": "nearby_free",
    "QUESTION_ANSWERED": "social",
    "ANSWER_ACCEPTED": "social",
    "EVENT_REMINDER": "social",
    "EVENT_CANCELLED": "social",
    "SERVICE_REQUEST": "services",
    "SERVICE_REQUEST_UPDATE": "services",
    "inspection_requested": "services",
    "inspection_scheduled": "services",
    "VIEWING_REQUESTED": "services",
    "VIEWING_CONFIRMED": "services",
    "VIEWING_RESCHEDULED": "services",
    "VIEWING_DECLINED": "services",
    "VIEWING_CANCELLED": "services",
    "VIEWING_REMINDER": "services",
    "report_ready": "services",
    "loan_submitted": "receipts",
    "loan_status_change": "admin",
    "project_created": "services",
    "milestone_completed": "services",
    "project_completed": "services",
    "agent_referral_created": "receipts",
    # Legacy kinds written by the agent platform / reviews / wallet modules
    "subscription_activated": "receipts",
    "UNLOCK_RECEIPT": "receipts",
    "TOPUP_RECEIPT": "receipts",
    "PAYOUT_RECEIPT": "receipts",
    "verification_result": "admin",
    "account_status": "admin",
    "starter_kit_eligible": "admin",
    "starter_kit_status": "admin",
    "badge_update": "admin",
    "review_moderation": "admin",
    "review_received": "services",
    # My Home hub reminders
    "HOME_BILL_DUE": "home",
    "HOME_BILL_OVERDUE": "home",
    "HOME_REPAIR_DUE": "home",
    "HOME_REPAIR_OVERDUE": "home",
    "HOME_RECORD_EXPIRY": "home",
    "HOME_WARRANTY_EXPIRY": "home",
    # Agency teams
    "AGENCY_CREATED": "admin",
    "AGENCY_INVITE": "services",
    "AGENCY_JOINED": "services",
    "AGENCY_ROLE": "services",
    "AGENCY_REMOVED": "services",
    "LEAD_ASSIGNED": "services",
}


def kinds_for(category: str) -> list[str]:
    return [k for k, c in KIND_CATEGORY.items() if c == category]

# Written by the retired Neighbours module (estates, friends, shared lists, events, estate issues).
# Those screens no longer exist, so these rows have nowhere to go: hidden from lists and counts.
LEGACY_KINDS = (
    "ESTATE_REQUEST", "ESTATE_APPROVED", "ESTATE_REJECTED", "ESTATE_NOTICE",
    "CONNECTION_REQUEST", "CONNECTION_ACCEPTED", "COLLECTION_INVITE", "COLLECTION_ACTIVITY",
    "POST_REPLY", "QUESTION_ANSWERED", "ANSWER_ACCEPTED", "EVENT_REMINDER", "EVENT_CANCELLED",
    "SERVICE_REQUEST", "SERVICE_REQUEST_UPDATE",
)

# Only proactive discovery kinds are ever bundled; transactional kinds in the same
# category (e.g. an offer on YOUR listing) always arrive instantly.
DIGESTABLE_KINDS = {"SAVED_SEARCH_MATCH", "NEARBY_LISTINGS", "BRAND_OFFER", "MARKET_AD", "SOCIAL_NEARBY_FREE"}

DIGEST_KIND = {
    "property_matches": "SAVED_SEARCH_MATCH",
    "nearby_listings": "NEARBY_LISTINGS",
    "brand_offers": "BRAND_OFFER",
    "marketplace": "MARKET_AD",
    "nearby_free": "SOCIAL_NEARBY_FREE",
}
DIGEST_ROUTE = {
    "property_matches": "/saved-searches",
    "nearby_listings": "/(tabs)",
    "brand_offers": "/shop/saved",
    "marketplace": "/(tabs)/marketplace",
    "nearby_free": "/updates?tab=nearby",
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(d: datetime) -> str:
    return d.isoformat()


def category_for(kind: str) -> str:
    return KIND_CATEGORY.get(kind, "services")


def default_prefs(user_id: str) -> dict:
    return {
        "user_id": user_id,
        # Per category: on/off, bundling frequency, and which channels may carry it (in-app is always on).
        "categories": {k: {"enabled": True, "frequency": v["default_frequency"], "push": True, "email": True} for k, v in CATEGORIES.items()},
        "quiet_hours": {"enabled": False, "start": "22:00", "end": "07:00"},
        "push_enabled": False,
        # undetermined | granted | denied | dismissed | blocked
        "push_prompt": {"status": "undetermined", "last_prompted_at": None, "context": None},
        # Email digest is opt-in: one summary email per day/week at `hour` (Africa/Lagos), only categories with email on.
        "email_digest": {"enabled": False, "frequency": "daily", "hour": 8},
        "updated_at": _iso(_now()),
    }


async def get_prefs(db, user_id: str) -> dict:
    doc = await db.notification_prefs.find_one({"user_id": user_id}, {"_id": 0})
    base = default_prefs(user_id)
    if not doc:
        return base
    cats = dict(base["categories"])
    for k, v in (doc.get("categories") or {}).items():
        if k in cats and isinstance(v, dict):
            cats[k] = {
                "enabled": bool(v.get("enabled", True)),
                "frequency": v.get("frequency") if v.get("frequency") in FREQUENCIES else cats[k]["frequency"],
                "push": bool(v.get("push", True)),
                "email": bool(v.get("email", True)),
            }
    base.update({k: v for k, v in doc.items() if k not in ("categories", "email_digest")})
    base["categories"] = cats
    ed = dict(base["email_digest"])
    for k, v in (doc.get("email_digest") or {}).items():
        if k in ed:
            ed[k] = v
    if ed.get("frequency") not in EMAIL_DIGEST_FREQUENCIES:
        ed["frequency"] = "daily"
    base["email_digest"] = ed
    return base


def _parse_hhmm(s: str) -> int:
    try:
        h, m = s.split(":")
        return int(h) * 60 + int(m)
    except Exception:
        return 0


def in_quiet_hours(prefs: dict, at: Optional[datetime] = None) -> bool:
    q = prefs.get("quiet_hours") or {}
    if not q.get("enabled"):
        return False
    at = at or _now()
    # Quiet hours are evaluated in Africa/Lagos (UTC+1) — AMASS's home market.
    local = at + timedelta(hours=1)
    cur = local.hour * 60 + local.minute
    start, end = _parse_hhmm(q.get("start", "22:00")), _parse_hhmm(q.get("end", "07:00"))
    if start == end:
        return False
    if start < end:
        return start <= cur < end
    return cur >= start or cur < end  # overnight window


async def _push(db, prefs: dict, user_id: str, title: str, body: str, action_url: Optional[str], idem: str, category: Optional[str] = None) -> bool:
    if not prefs.get("push_enabled") or prefs.get("push_prompt", {}).get("status") != "granted":
        return False
    if category and not (prefs.get("categories", {}).get(category) or {}).get("push", True):
        return False  # the user keeps this category in-app / email only
    if in_quiet_hours(prefs):
        return False
    try:
        data = {"title": title[:80], "message": body[:160]}
        if action_url:
            data["action_url"] = action_url
        await send_push([user_id], data, idempotency_key=idem)
        return True
    except Exception as e:  # never block the caller
        logger.warning("push relay failed (non-blocking): %s", e)
        return False


async def emit(
    db,
    user_id: Optional[str],
    kind: str,
    title: str,
    body: str,
    meta: Optional[dict] = None,
    *,
    category: Optional[str] = None,
    dedupe_key: Optional[str] = None,
    action_url: Optional[str] = None,
    push: bool = True,
) -> Optional[dict]:
    """Store (and maybe push) one notification, honouring the user's preferences.

    Returns the stored document, or None when the user has the category off,
    the item was deduplicated, or it was queued for a digest.
    """
    if not user_id:
        return None
    category = category or category_for(kind)
    prefs = await get_prefs(db, user_id)
    cat_pref = prefs["categories"].get(category, {"enabled": True, "frequency": "immediate"})
    if not cat_pref.get("enabled", True):
        return None

    meta = meta or {}
    now = _now()
    # ── dedupe / collapse ──
    if dedupe_key:
        if await db.notifications.find_one({"user_id": user_id, "dedupe_key": dedupe_key}, {"_id": 0, "id": 1}):
            return None
        if await db.notification_queue.find_one({"user_id": user_id, "dedupe_key": dedupe_key}, {"_id": 0, "id": 1}):
            return None
    else:
        target = _target_of(meta)
        if target:
            since = _iso(now - timedelta(hours=24))
            existing = await db.notifications.find_one(
                {"user_id": user_id, "kind": kind, f"meta.{target[0]}": target[1], "read": False, "created_at": {"$gte": since}},
                {"_id": 0},
            )
            if existing:
                # Same unread thread/target → collapse into one row (bumped to the top) instead of stacking duplicates.
                count = int((existing.get("meta") or {}).get("count", 1)) + 1
                merged_meta = {**(existing.get("meta") or {}), **meta, "count": count}
                await db.notifications.update_one(
                    {"id": existing["id"]},
                    {"$set": {"title": title[:120], "body": (body or "")[:160], "meta": merged_meta, "created_at": _iso(now), "action_url": action_url or existing.get("action_url")}},
                )
                existing.update({"title": title[:120], "body": (body or "")[:160], "meta": merged_meta, "created_at": _iso(now), "action_url": action_url or existing.get("action_url")})
                if push:
                    existing["pushed"] = await _push(db, prefs, user_id, title, body, action_url, f"notif:{existing['id']}:{count}", category)
                return existing

    # ── frequency → digest queue ──
    if kind in DIGESTABLE_KINDS and CATEGORIES.get(category, {}).get("digest") and cat_pref.get("frequency", "immediate") != "immediate":
        await db.notification_queue.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "category": category,
            "kind": kind,
            "title": title[:120],
            "body": (body or "")[:160],
            "meta": meta,
            "action_url": action_url,
            "dedupe_key": dedupe_key,
            "created_at": _iso(now),
        })
        return None

    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "kind": kind,
        "category": category,
        "title": title[:120],
        "body": (body or "")[:160],
        "read": False,
        "meta": meta,
        "action_url": action_url,
        "dedupe_key": dedupe_key,
        "created_at": _iso(now),
    }
    await db.notifications.insert_one(dict(doc))
    if push:
        doc["pushed"] = await _push(db, prefs, user_id, title, body, action_url, f"notif:{doc['id']}", category)
    return doc


def _target_of(meta: dict) -> Optional[tuple[str, Any]]:
    # Most specific first — a chat about a property must collapse per conversation, not per property.
    for k in ("conversation_id", "viewing_id", "offer_id", "connection_id", "collection_id", "post_id", "event_id", "service_request_id", "representation_id", "reference", "ad_id", "saved_search_id", "review_id", "retailer_id", "estate_id", "item_id", "property_id"):
        if meta.get(k):
            return k, meta[k]
    return None


# ─── Digests ──────────────────────────────────────────────────────────────
def _interval(freq: str) -> timedelta:
    return timedelta(days=7) if freq == "weekly" else timedelta(days=1)


def _digest_copy(category: str, items: list[dict]) -> tuple[str, str]:
    n = len(items)
    if category == "property_matches":
        names = sorted({i["meta"].get("saved_search_name") for i in items if i["meta"].get("saved_search_name")})
        total = sum(int(i["meta"].get("count", 1)) for i in items)
        tail = f" for “{names[0]}”" if len(names) == 1 else f" across {len(names)} saved searches" if names else ""
        return (f"{total} new home{'s' if total != 1 else ''} match your searches", f"New listings{tail}. Tap to review them.")
    if category == "nearby_listings":
        total = sum(int(i["meta"].get("count", 1)) for i in items)
        area = items[-1]["meta"].get("area") or "your area"
        return (f"{total} new listing{'s' if total != 1 else ''} near {area}", "Fresh homes and land close to you this period.")
    if category == "brand_offers":
        stores = sorted({i["meta"].get("retailer_name") for i in items if i["meta"].get("retailer_name")})
        total = sum(int(i["meta"].get("count", 1)) for i in items)
        who = stores[0] if len(stores) == 1 else f"{len(stores)} brands you follow"
        return (f"{total} new offer{'s' if total != 1 else ''} from {who}", "Verified price drops and promotions — AMASS adds no fee.")
    if category == "nearby_free":
        total = sum(int(i["meta"].get("count", 1)) for i in items)
        cats = sorted({i["meta"].get("category_label") for i in items if i["meta"].get("category_label")})
        what = cats[0] if len(cats) == 1 else f"{len(cats)} categories you follow"
        return (f"{total} free item{'s' if total != 1 else ''} nearby · {what}", "Neighbours are giving these away. Tap to claim one.")
    # marketplace
    return (f"{n} Marketplace update{'s' if n != 1 else ''} for you", "Relevant ads and offers from the last period.")


async def flush_digests(db) -> int:
    """Turn queued items into one summary notification per user/category when the interval has elapsed."""
    sent = 0
    groups = await db.notification_queue.aggregate([
        {"$group": {"_id": {"user_id": "$user_id", "category": "$category"}, "n": {"$sum": 1}, "oldest": {"$min": "$created_at"}}},
    ]).to_list(5000)
    now = _now()
    for g in groups:
        user_id, category = g["_id"]["user_id"], g["_id"]["category"]
        prefs = await get_prefs(db, user_id)
        cat_pref = prefs["categories"].get(category) or {}
        if not cat_pref.get("enabled", True):
            await db.notification_queue.delete_many({"user_id": user_id, "category": category})
            continue
        freq = cat_pref.get("frequency", "daily")
        if freq == "immediate":
            freq = "daily"  # user switched back to immediate: flush queued items now as one digest
            due = True
        else:
            state = await db.notification_digest_state.find_one({"user_id": user_id, "category": category}, {"_id": 0})
            last = datetime.fromisoformat(state["last_sent_at"]) if state and state.get("last_sent_at") else None
            due = last is None or now - last >= _interval(freq)
        if not due:
            continue
        items = await db.notification_queue.find({"user_id": user_id, "category": category}, {"_id": 0}).sort("created_at", 1).to_list(200)
        if not items:
            continue
        title, body = _digest_copy(category, items)
        doc = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "kind": DIGEST_KIND.get(category, "DIGEST"),
            "category": category,
            "title": title[:120],
            "body": body[:160],
            "read": False,
            "meta": {"digest": True, "count": len(items), "frequency": freq, "items": [{"title": i["title"], "meta": i.get("meta", {}), "action_url": i.get("action_url")} for i in items[:10]]},
            "action_url": DIGEST_ROUTE.get(category),
            "created_at": _iso(now),
        }
        await db.notifications.insert_one(dict(doc))
        await _push(db, prefs, user_id, title, body, doc["action_url"], f"digest:{doc['id']}", category)
        await db.notification_queue.delete_many({"id": {"$in": [i["id"] for i in items]}})
        await db.notification_digest_state.update_one({"user_id": user_id, "category": category}, {"$set": {"last_sent_at": _iso(now)}}, upsert=True)
        sent += 1
    return sent


# ─── Email digests (opt-in; Emergent managed Resend via auth_security.send_email) ──
EMAIL_STATE_KEY = "__email_digest__"


def _secret() -> str:
    return os.environ.get("JWT_SECRET", "amass-dev-secret")


def unsubscribe_token(user_id: str) -> str:
    return hmac.new(_secret().encode(), f"email-digest:{user_id}".encode(), hashlib.sha256).hexdigest()[:32]


def _abs_link(path: Optional[str]) -> Optional[str]:
    if not path:
        return None
    if path.startswith("https://"):
        return path
    if not path.startswith("/"):
        return None
    return f"{APP_PUBLIC_URL}{path.replace('/(tabs)', '') or '/'}"


def _when(iso: str) -> str:
    try:
        d = datetime.fromisoformat(iso) + timedelta(hours=1)  # Africa/Lagos
        return d.strftime("%a %d %b · %H:%M")
    except Exception:
        return ""


async def email_digest_items(db, user_id: str, prefs: dict, since: Optional[str]) -> list[dict]:
    """Notifications since the last digest in categories the user keeps on email (unread first, newest first)."""
    cats = [k for k, v in prefs["categories"].items() if v.get("enabled", True) and v.get("email", True)]
    q: dict = {"user_id": user_id, "dismissed": {"$ne": True}, "meta.preview": {"$ne": True}}
    if since:
        q["created_at"] = {"$gt": since}
    docs = await db.notifications.find(q, {"_id": 0}).sort("created_at", -1).limit(60).to_list(60)
    docs = [d for d in docs if category_for_doc(d) in cats]
    # unread first; within each group newest first
    unread = [d for d in docs if not d.get("read")]
    read = [d for d in docs if d.get("read")]
    unread.sort(key=lambda d: d.get("created_at", ""), reverse=True)
    read.sort(key=lambda d: d.get("created_at", ""), reverse=True)
    return (unread + read)[:20]


def category_for_doc(d: dict) -> str:
    return d.get("category") or category_for(d.get("kind", ""))


def digest_email_html(user: dict, items: list[dict], *, frequency: str, unread_total: int) -> tuple[str, str]:
    """Returns (subject, html). Branded layout, inline styles, absolute https links only (G3), no forms (G2)."""
    from email_theme import INK, LINE, MUTED, RED, p, render_email

    name = (user.get("full_name") or "there").split(" ")[0]
    n = len(items)
    period = "today" if frequency == "daily" else "this week"
    subject = f"{n} new update{'s' if n != 1 else ''} on AMASS {period}" if n else "You're all caught up on AMASS"
    prefs_link = _abs_link("/notification-preferences")
    unsub_link = f"{APP_PUBLIC_URL}/api/notifications/email/unsubscribe?u={escape(user['id'])}&t={unsubscribe_token(user['id'])}"
    rows = []
    for d in items:
        cat = CATEGORIES.get(category_for_doc(d), {})
        link = _abs_link(d.get("action_url"))
        dot = f'<span style="display:inline-block;width:8px;height:8px;border-radius:4px;background:{RED};margin-right:8px;vertical-align:middle"></span>' if not d.get("read") else ""
        open_html = f'<a href="{escape(link)}" style="color:{RED};font-weight:700;text-decoration:none;font-size:13px">Open →</a>' if link else ""
        rows.append(
            f'<tr><td style="padding:14px 0;border-bottom:1px solid {LINE}">'
            f'<div style="font-size:11px;letter-spacing:.6px;text-transform:uppercase;color:{MUTED};margin-bottom:4px">{escape(cat.get("label", "Update"))} · {escape(_when(d.get("created_at", "")))}</div>'
            f'<div style="font-size:16px;font-weight:700;color:{INK}">{dot}{escape(d.get("title", ""))}</div>'
            + (f'<div style="font-size:14px;color:#444;margin-top:4px;line-height:20px">{escape(d.get("body", ""))}</div>' if d.get("body") else "")
            + (f'<div style="margin-top:6px">{open_html}</div>' if open_html else "")
            + "</td></tr>"
        )
    list_html = "".join(rows) if rows else (
        '<tr><td style="padding:20px 0;font-size:15px;color:#444">Nothing new since your last summary. '
        "Price drops, matches, messages and receipts will show up here as they happen.</td></tr>"
    )
    unread_line = f"You have {unread_total} unread update{'s' if unread_total != 1 else ''} waiting in the app." if unread_total else "Your Updates tab is clear."
    html = render_email(
        title=f"Your {frequency} updates",
        kicker=f"{frequency} digest",
        hero="city",
        greeting=f"Hi {name},",
        preheader=subject,
        body_html=p(unread_line, muted=True, size=14) + f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border-collapse:collapse">{list_html}</table>',
        cta=("Open Updates in AMASS", _abs_link("/updates") or APP_PUBLIC_URL),
        footer_links_html=(
            "You get this summary because email digests are on in your AMASS notification preferences. "
            f'<a href="{escape(prefs_link)}" style="color:#555">Manage preferences</a> · <a href="{escape(unsub_link)}" style="color:#555">Turn off email digests</a>.'
        ),
    )
    return subject, html


async def send_email_digest(db, user: dict, prefs: dict, *, force: bool = False) -> Optional[dict]:
    """Send one digest email to `user` (skips silently when nothing new unless `force`). Updates the per-user state."""
    if not user.get("email"):
        return None
    ed = prefs.get("email_digest") or {}
    state = await db.notification_digest_state.find_one({"user_id": user["id"], "category": EMAIL_STATE_KEY}, {"_id": 0})
    since = state.get("last_sent_at") if state else None
    if not since:
        since = _iso(_now() - _interval(ed.get("frequency", "daily")))
    items = await email_digest_items(db, user["id"], prefs, since)
    if not items and not force:
        return None
    if not items and force:
        items = await email_digest_items(db, user["id"], prefs, None)  # test send: show the latest updates instead of an empty page
    unread_total = await db.notifications.count_documents({"user_id": user["id"], "read": False, "dismissed": {"$ne": True}, "kind": {"$nin": list(LEGACY_KINDS)}})
    subject, html = digest_email_html(user, items, frequency=ed.get("frequency", "daily"), unread_total=unread_total)
    email_id = await send_email(to=user["email"], subject=subject, html=html)
    now = _iso(_now())
    await db.notification_digest_state.update_one(
        {"user_id": user["id"], "category": EMAIL_STATE_KEY},
        {"$set": {"last_sent_at": now, "last_count": len(items), "last_email_id": email_id}},
        upsert=True,
    )
    return {"sent": True, "to": user["email"], "count": len(items), "subject": subject, "email_id": email_id}


async def flush_email_digests(db) -> int:
    """Hourly: send due digests. Due = interval elapsed AND local (Lagos) hour reached the user's preferred hour."""
    sent = 0
    now = _now()
    local_hour = (now + timedelta(hours=1)).hour
    cursor = db.notification_prefs.find({"email_digest.enabled": True}, {"_id": 0, "user_id": 1})
    async for p in cursor:
        try:
            prefs = await get_prefs(db, p["user_id"])
            ed = prefs["email_digest"]
            if local_hour < int(ed.get("hour", 8)):
                continue
            state = await db.notification_digest_state.find_one({"user_id": p["user_id"], "category": EMAIL_STATE_KEY}, {"_id": 0})
            last = datetime.fromisoformat(state["last_sent_at"]) if state and state.get("last_sent_at") else None
            # Subtract an hour of slack so a digest sent at 08:05 is due again the next day at 08:00.
            if last is not None and now - last < _interval(ed["frequency"]) - timedelta(hours=1):
                continue
            user = await db.users.find_one({"id": p["user_id"]}, {"_id": 0, "id": 1, "email": 1, "full_name": 1})
            if not user or not user.get("email"):
                continue
            if await send_email_digest(db, user, prefs):
                sent += 1
        except Exception as e:  # one bad mailbox must not stop the sweep
            logger.warning("email digest failed for %s: %s", p.get("user_id"), e)
    return sent


# ─── Matchers ─────────────────────────────────────────────────────────────
def _km(lat1, lng1, lat2, lng2) -> float:
    p = math.pi / 180
    a = 0.5 - math.cos((lat2 - lat1) * p) / 2 + math.cos(lat1 * p) * math.cos(lat2 * p) * (1 - math.cos((lng2 - lng1) * p)) / 2
    return 12742 * math.asin(math.sqrt(a))


def _criteria_query(c: dict) -> dict:
    query: dict = {}
    if c.get("q"):
        query["$or"] = [{f: {"$regex": c["q"], "$options": "i"}} for f in ("title", "description", "location", "city")]
    for k in ("city", "listing_type", "property_type"):
        if c.get(k):
            query[k] = c[k]
    if c.get("min_price") is not None:
        query.setdefault("price", {})["$gte"] = float(c["min_price"])
    if c.get("max_price") is not None:
        query.setdefault("price", {})["$lte"] = float(c["max_price"])
    if c.get("min_beds") is not None:
        query["bedrooms"] = {"$gte": int(c["min_beds"])}
    if c.get("min_baths") is not None:
        query["bathrooms"] = {"$gte": int(c["min_baths"])}
    if c.get("verified"):
        query["verified"] = True
    b = c.get("bbox")
    if b and len(b) == 4:
        query["longitude"] = {"$gte": b[0], "$lte": b[2]}
        query["latitude"] = {"$gte": b[1], "$lte": b[3]}
    return query


async def _state(db, key: str) -> Optional[str]:
    doc = await db.notification_center_state.find_one({"key": key}, {"_id": 0})
    return (doc or {}).get("last_run_at")


async def _set_state(db, key: str, when: datetime) -> None:
    await db.notification_center_state.update_one({"key": key}, {"$set": {"last_run_at": _iso(when)}}, upsert=True)


async def match_saved_searches(db, since: str, now: datetime) -> int:
    n = 0
    async for s in db.saved_searches.find({"alerts_enabled": True}, {"_id": 0}):
        query = _criteria_query(s.get("criteria") or {})
        query["posted_at"] = {"$gt": s.get("last_alert_check_at") or since}
        query["agent_id"] = {"$ne": s["user_id"]}
        docs = await db.properties.find(query, {"_id": 0, "id": 1, "title": 1}).sort("posted_at", -1).limit(20).to_list(20)
        await db.saved_searches.update_one({"id": s["id"]}, {"$set": {"last_alert_check_at": _iso(now)}, **({"$inc": {"new_matches_since_seen": len(docs)}} if docs else {})})
        if not docs:
            continue
        count = len(docs)
        res = await emit(
            db, s["user_id"], "SAVED_SEARCH_MATCH",
            f"{count} new home{'s' if count != 1 else ''} match “{s['name']}”",
            docs[0]["title"] if count == 1 else f"{docs[0]['title']} and {count - 1} more",
            {"saved_search_id": s["id"], "saved_search_name": s["name"], "count": count, "property_ids": [d["id"] for d in docs], **({"property_id": docs[0]["id"]} if count == 1 else {})},
            dedupe_key=f"ss:{s['id']}:{docs[0]['id']}",
            action_url=f"/property/{docs[0]['id']}" if count == 1 else f"/saved-searches?open={s['id']}",
        )
        n += 1 if res else 0
    return n


async def _home_for(db, user: dict) -> Optional[dict]:
    """Where "near the user" is measured from: approved estate → profile city → last map area."""
    m = await db.estate_members.find_one({"user_id": user["id"], "status": "approved"}, {"_id": 0, "estate_id": 1})
    if m:
        est = await db.estates.find_one({"id": m["estate_id"]}, {"_id": 0, "name": 1, "latitude": 1, "longitude": 1, "city": 1})
        if est:
            return {"label": est.get("name"), "lat": est.get("latitude"), "lng": est.get("longitude"), "city": est.get("city")}
    if user.get("city"):
        return {"label": user["city"], "city": user["city"]}
    r = user.get("last_map_region")
    if r and r.get("latitude") is not None:
        return {"label": r.get("label") or "your last map area", "lat": r["latitude"], "lng": r["longitude"]}
    return None


async def match_nearby(db, since: str, now: datetime) -> int:
    n = 0
    new_props = await db.properties.find({"posted_at": {"$gt": since}}, {"_id": 0, "id": 1, "title": 1, "city": 1, "latitude": 1, "longitude": 1, "agent_id": 1}).to_list(500)
    if not new_props:
        return 0
    async for pref in db.notification_prefs.find({"categories.nearby_listings.enabled": {"$ne": False}}, {"_id": 0, "user_id": 1}):
        user = await db.users.find_one({"id": pref["user_id"]}, {"_id": 0, "id": 1, "city": 1, "last_map_region": 1})
        if not user:
            continue
        home = await _home_for(db, user)
        if not home:
            continue
        hits = []
        for p in new_props:
            if p.get("agent_id") == user["id"]:
                continue
            if home.get("lat") is not None and p.get("latitude") is not None and p.get("longitude") is not None:
                if _km(home["lat"], home["lng"], p["latitude"], p["longitude"]) <= 5:
                    hits.append(p)
            elif home.get("city") and p.get("city") and p["city"].lower() == str(home["city"]).lower():
                hits.append(p)
        if not hits:
            continue
        c = len(hits)
        res = await emit(
            db, user["id"], "NEARBY_LISTINGS",
            f"{c} new listing{'s' if c != 1 else ''} near {home['label']}",
            hits[0]["title"] if c == 1 else f"{hits[0]['title']} and {c - 1} more nearby",
            {"area": home["label"], "count": c, "property_ids": [h["id"] for h in hits[:20]], **({"property_id": hits[0]["id"]} if c == 1 else {})},
            dedupe_key=f"near:{user['id']}:{hits[0]['id']}",
            action_url=f"/property/{hits[0]['id']}" if c == 1 else "/(tabs)/discover",
        )
        n += 1 if res else 0
    return n


async def match_brand_offers(db, since: str, now: datetime) -> int:
    n = 0
    follows = await db.shop_saves.find({"kind": "store"}, {"_id": 0, "user_id": 1, "target_id": 1}).to_list(5000)
    if not follows:
        return 0
    by_store: dict[str, list[str]] = {}
    for f in follows:
        by_store.setdefault(f["target_id"], []).append(f["user_id"])
    for rid, users in by_store.items():
        promos = await db.shop_products.find({"retailer_id": rid, "published": True, "promo": {"$ne": None}, "$or": [{"promo.verified_at": {"$gt": since}}, {"updated_at": {"$gt": since}}]}, {"_id": 0, "id": 1, "name": 1, "promo": 1}).limit(20).to_list(20)
        if not promos:
            continue
        store = await db.shop_retailers.find_one({"id": rid}, {"_id": 0, "slug": 1, "short_name": 1, "name": 1})
        if not store:
            continue
        c = len(promos)
        for uid in users:
            res = await emit(
                db, uid, "BRAND_OFFER",
                f"{store['short_name']}: {c} new verified offer{'s' if c != 1 else ''}",
                f"{promos[0]['name']} — {promos[0]['promo'].get('label', 'offer')}" if c == 1 else f"{promos[0]['name']} and {c - 1} more",
                {"retailer_id": rid, "retailer_slug": store["slug"], "retailer_name": store["short_name"], "count": c, "product_ids": [p["id"] for p in promos]},
                dedupe_key=f"offer:{rid}:{promos[0]['id']}",
                action_url=f"/shop/product/{promos[0]['id']}" if c == 1 else f"/shop/store/{store['slug']}",
            )
            n += 1 if res else 0
    return n


async def match_marketplace_ads(db, since: str, now: datetime) -> int:
    n = 0
    ads = await db.ads.find({"status": "active", "created_at": {"$gt": since}}, {"_id": 0, "id": 1, "title": 1, "target_cities": 1, "targeting": 1, "advertiser_id": 1, "user_id": 1}).to_list(200)
    if not ads:
        return 0
    async for pref in db.notification_prefs.find({"categories.marketplace.enabled": {"$ne": False}}, {"_id": 0, "user_id": 1}):
        user = await db.users.find_one({"id": pref["user_id"]}, {"_id": 0, "id": 1, "city": 1})
        if not user:
            continue
        city = (user.get("city") or "").lower()
        hits = []
        for a in ads:
            if user["id"] in (a.get("advertiser_id"), a.get("user_id")):
                continue
            cities = [c.lower() for c in (a.get("target_cities") or (a.get("targeting") or {}).get("cities") or [])]
            if not cities or (city and city in cities):
                hits.append(a)
        if not hits:
            continue
        c = len(hits)
        res = await emit(
            db, user["id"], "MARKET_AD",
            hits[0]["title"] if c == 1 else f"{c} new offers in {user.get('city') or 'the Marketplace'}",
            "A relevant Marketplace ad for you" if c == 1 else f"{hits[0]['title']} and {c - 1} more",
            {"ad_id": hits[0]["id"], "count": c, "ad_ids": [h["id"] for h in hits[:20]]},
            dedupe_key=f"ad:{user['id']}:{hits[0]['id']}",
            action_url="/(tabs)/marketplace",
        )
        n += 1 if res else 0
    return n


async def match_passport_expiry(db, now: datetime) -> int:
    n = 0
    horizon = (now + timedelta(days=30)).date().isoformat()
    async for rep in db.property_representations.find({"status": "APPROVED", "mandate_expiry": {"$ne": None, "$lte": horizon}}, {"_id": 0, "id": 1, "user_id": 1, "amass_property_id": 1, "mandate_expiry": 1, "property_id": 1}):
        try:
            exp = datetime.fromisoformat(str(rep["mandate_expiry"])[:10]).date()
        except Exception:
            continue
        days = (exp - now.date()).days
        bucket = "expired" if days < 0 else "1d" if days <= 1 else "7d" if days <= 7 else "30d"
        when = "has expired" if days < 0 else "expires today" if days == 0 else f"expires in {days} day{'s' if days != 1 else ''}"
        res = await emit(
            db, rep["user_id"], "PASSPORT_EXPIRY",
            f"Your mandate {when}",
            "Renew the mandate on this Property Passport to keep your verified representation live.",
            {"representation_id": rep["id"], "amass_property_id": rep.get("amass_property_id"), "property_id": rep.get("property_id"), "days": days},
            dedupe_key=f"passport:{rep['id']}:{bucket}",
            action_url=f"/property-passport/{rep['amass_property_id']}" if rep.get("amass_property_id") else None,
        )
        n += 1 if res else 0
    return n


async def run_matchers(db) -> dict:
    now = _now()
    since = await _state(db, "matchers") or _iso(now - timedelta(hours=24))
    out = {"since": since}
    for name, fn in (("saved_searches", match_saved_searches), ("nearby", match_nearby), ("brand_offers", match_brand_offers), ("marketplace", match_marketplace_ads)):
        try:
            out[name] = await fn(db, since, now)
        except Exception as e:  # keep the sweep alive
            logger.warning("matcher %s failed: %s", name, e)
            out[name] = -1
    try:
        out["passport"] = await match_passport_expiry(db, now)
    except Exception as e:
        logger.warning("matcher passport failed: %s", e)
        out["passport"] = -1
    try:
        out["digests"] = await flush_digests(db)
    except Exception as e:
        logger.warning("digest flush failed: %s", e)
        out["digests"] = -1
    await _set_state(db, "matchers", now)
    return out


async def ensure_notification_indexes(db) -> None:
    await db.notification_prefs.create_index("user_id", unique=True)
    await db.notification_queue.create_index([("user_id", 1), ("category", 1), ("created_at", 1)])
    await db.notification_digest_state.create_index([("user_id", 1), ("category", 1)], unique=True)
    await db.notifications.create_index([("user_id", 1), ("dedupe_key", 1)], sparse=True)
    await db.notifications.create_index([("user_id", 1), ("read", 1)])
    await db.notifications.create_index([("user_id", 1), ("category", 1), ("created_at", -1)])
    await db.notification_prefs.create_index("email_digest.enabled")


async def start_notification_center(db, *, interval_s: int = 3600, first_delay_s: int = 90) -> None:
    """Indexes + the hourly matcher/digest sweep (runs for the life of the process)."""
    import asyncio

    try:
        await ensure_notification_indexes(db)
    except Exception as e:  # never block boot
        logger.warning("notification indexes failed: %s", e)

    async def _loop():
        await asyncio.sleep(first_delay_s)
        while True:
            try:
                out = await run_matchers(db)
                out["email_digests"] = await flush_email_digests(db)
                logger.info("notification matchers: %s", out)
            except Exception as e:
                logger.warning("notification matcher sweep failed: %s", e)
            await asyncio.sleep(interval_s)

    asyncio.create_task(_loop())


# ─── Routes ───────────────────────────────────────────────────────────────
class CategoryPrefIn(BaseModel):
    enabled: Optional[bool] = None
    frequency: Optional[str] = Field(None, pattern="^(immediate|daily|weekly)$")
    push: Optional[bool] = None
    email: Optional[bool] = None


class QuietHoursIn(BaseModel):
    enabled: Optional[bool] = None
    start: Optional[str] = Field(None, pattern=r"^\d{2}:\d{2}$")
    end: Optional[str] = Field(None, pattern=r"^\d{2}:\d{2}$")


class EmailDigestIn(BaseModel):
    enabled: Optional[bool] = None
    frequency: Optional[str] = Field(None, pattern="^(daily|weekly)$")
    hour: Optional[int] = Field(None, ge=0, le=23)


class PrefsIn(BaseModel):
    categories: Optional[dict[str, CategoryPrefIn]] = None
    quiet_hours: Optional[QuietHoursIn] = None
    push_enabled: Optional[bool] = None
    email_digest: Optional[EmailDigestIn] = None


class PushPromptIn(BaseModel):
    status: str = Field(..., pattern="^(undetermined|granted|denied|dismissed|blocked)$")
    context: Optional[str] = None


class ReadByTargetIn(BaseModel):
    target_type: str = Field(..., min_length=1)
    target_id: str = Field(..., min_length=1)


def register_notification_center_routes(db, require_auth, require_admin) -> APIRouter:
    router = APIRouter(prefix="/api/notifications", tags=["notification-center"])

    def _annotate(n: dict) -> dict:
        n.setdefault("category", category_for(n.get("kind", "")))
        return n

    LIVE = {"dismissed": {"$ne": True}, "kind": {"$nin": list(LEGACY_KINDS)}}  # swiped-away rows stay in the DB (undo) but leave every list and count; retired Neighbours kinds too

    async def _unread(user_id: str) -> int:
        return await db.notifications.count_documents({"user_id": user_id, "read": False, **LIVE})

    @router.get("/center")
    async def center(category: Optional[str] = None, before: Optional[str] = None, unread_only: bool = False, limit: int = Query(40, le=100), user: dict = Depends(require_auth)):
        q: dict = {"user_id": user["id"], **LIVE}
        if before:
            q["created_at"] = {"$lt": before}
        if unread_only:
            q["read"] = False
        if category and category != "all":
            if category not in CATEGORIES:
                raise HTTPException(400, f"Unknown category {category}")
            legacy = {"category": {"$exists": False}, "kind": {"$in": kinds_for(category)}}
            if category == "services":  # unknown kinds fall back to services
                legacy = {"category": {"$exists": False}, "kind": {"$nin": [k for k in KIND_CATEGORY if KIND_CATEGORY[k] != "services"]}}
            q["$or"] = [{"category": category}, legacy]
        docs = await db.notifications.find(q, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
        docs = [_annotate(d) for d in docs]
        all_unread = [_annotate(d) async for d in db.notifications.find({"user_id": user["id"], "read": False, **LIVE}, {"_id": 0, "kind": 1, "category": 1})]
        by_cat: dict[str, int] = {}
        for d in all_unread:
            by_cat[d["category"]] = by_cat.get(d["category"], 0) + 1
        read_count = await db.notifications.count_documents({"user_id": user["id"], "read": True, **LIVE, **({"$or": q["$or"]} if "$or" in q else {})})
        return {"items": docs, "unread": len(all_unread), "unread_by_category": by_cat, "read_count": read_count, "categories": CATEGORIES, "next_before": docs[-1]["created_at"] if len(docs) >= limit else None}

    @router.get("/unread-count")
    async def unread_count(user: dict = Depends(require_auth)):
        return {"unread": await _unread(user["id"])}

    @router.get("/prefs")
    async def prefs(user: dict = Depends(require_auth)):
        p = await get_prefs(db, user["id"])
        return {**p, "catalog": CATEGORIES, "frequencies": list(FREQUENCIES), "email": user.get("email")}

    @router.put("/prefs")
    async def update_prefs(data: PrefsIn, user: dict = Depends(require_auth)):
        p = await get_prefs(db, user["id"])
        if data.categories:
            for k, v in data.categories.items():
                if k not in CATEGORIES:
                    raise HTTPException(400, f"Unknown category {k}")
                cur = p["categories"][k]
                if v.enabled is not None:
                    cur["enabled"] = v.enabled
                if v.frequency is not None:
                    cur["frequency"] = v.frequency if CATEGORIES[k]["digest"] else "immediate"
                if v.push is not None:
                    cur["push"] = v.push
                if v.email is not None:
                    cur["email"] = v.email
        if data.quiet_hours:
            qh = dict(p.get("quiet_hours") or {})
            for f in ("enabled", "start", "end"):
                val = getattr(data.quiet_hours, f)
                if val is not None:
                    qh[f] = val
            p["quiet_hours"] = qh
        if data.push_enabled is not None:
            p["push_enabled"] = data.push_enabled
        if data.email_digest:
            ed = dict(p.get("email_digest") or {})
            for f in ("enabled", "frequency", "hour"):
                val = getattr(data.email_digest, f)
                if val is not None:
                    ed[f] = val
            if ed.get("enabled") and not user.get("email"):
                raise HTTPException(400, "Add an email address to your account to receive digests")
            p["email_digest"] = ed
        p["updated_at"] = _iso(_now())
        await db.notification_prefs.update_one({"user_id": user["id"]}, {"$set": p}, upsert=True)
        return {**p, "catalog": CATEGORIES, "frequencies": list(FREQUENCIES), "email": user.get("email")}

    @router.post("/email/test")
    async def email_test(user: dict = Depends(require_auth)):
        """Send the digest right now (even when nothing is new) so the user can see what it looks like."""
        if not user.get("email"):
            raise HTTPException(400, "Add an email address to your account first")
        state = await db.notification_digest_state.find_one({"user_id": user["id"], "category": EMAIL_STATE_KEY}, {"_id": 0, "last_test_at": 1})
        last_test = state.get("last_test_at") if state else None
        if last_test and (_now() - datetime.fromisoformat(last_test)).total_seconds() < EMAIL_TEST_COOLDOWN_S:
            raise HTTPException(429, "A test email was sent a moment ago — check your inbox (and spam) before sending another")
        p = await get_prefs(db, user["id"])
        full = await db.users.find_one({"id": user["id"]}, {"_id": 0, "id": 1, "email": 1, "full_name": 1})
        out = await send_email_digest(db, full or user, p, force=True)
        await db.notification_digest_state.update_one({"user_id": user["id"], "category": EMAIL_STATE_KEY}, {"$set": {"last_test_at": _iso(_now())}}, upsert=True)
        return {"ok": True, **(out or {})}

    @router.get("/email/unsubscribe", response_class=HTMLResponse)
    async def email_unsubscribe(u: str, t: str):
        """One-click link from the email footer — signed, no login needed; only ever turns digests OFF."""
        if not u or not hmac.compare_digest(t or "", unsubscribe_token(u)):
            return HTMLResponse(_unsub_page("This link isn't valid", "The unsubscribe link has expired or was altered. Open AMASS → Profile → Notifications to change your email settings."), status_code=400)
        await db.notification_prefs.update_one({"user_id": u}, {"$set": {"email_digest.enabled": False, "updated_at": _iso(_now())}}, upsert=True)
        return HTMLResponse(_unsub_page("Email digests are off", "You won't get summary emails from AMASS anymore. Everything still shows in the Updates tab, and you can turn digests back on anytime in Notification preferences."))

    @router.post("/push-prompt")
    async def push_prompt(data: PushPromptIn, user: dict = Depends(require_auth)):
        """Record the outcome of the contextual permission prompt so we never nag."""
        p = await get_prefs(db, user["id"])
        p["push_prompt"] = {"status": data.status, "last_prompted_at": _iso(_now()), "context": data.context}
        if data.status == "granted":
            p["push_enabled"] = True
        elif data.status in ("denied", "blocked"):
            p["push_enabled"] = False
        p["updated_at"] = _iso(_now())
        await db.notification_prefs.update_one({"user_id": user["id"]}, {"$set": p}, upsert=True)
        return {"ok": True, "push_prompt": p["push_prompt"], "push_enabled": p["push_enabled"]}

    @router.post("/dismiss-read")
    async def dismiss_read(category: Optional[str] = None, user: dict = Depends(require_auth)):
        """'Clear read' — tuck every already-read row away (bulk; no undo, the rows stay in the DB)."""
        q: dict = {"user_id": user["id"], "read": True, **LIVE}
        if category and category != "all":
            if category not in CATEGORIES:
                raise HTTPException(400, "Unknown category")
            q["$or"] = [{"category": category}, {"category": {"$exists": False}, "kind": {"$in": kinds_for(category)}}]
        res = await db.notifications.update_many(q, {"$set": {"dismissed": True, "dismissed_at": _iso(_now()), "was_read": True}})
        return {"ok": True, "marked": res.modified_count, "unread": await _unread(user["id"])}

    @router.post("/{notification_id}/read")
    async def mark_one_read(notification_id: str, user: dict = Depends(require_auth)):
        res = await db.notifications.update_one({"id": notification_id, "user_id": user["id"]}, {"$set": {"read": True, "read_at": _iso(_now())}})
        if res.matched_count == 0:
            raise HTTPException(404, "Notification not found")
        return {"ok": True, "unread": await _unread(user["id"])}

    @router.post("/{notification_id}/unread")
    async def mark_one_unread(notification_id: str, user: dict = Depends(require_auth)):
        res = await db.notifications.update_one({"id": notification_id, "user_id": user["id"]}, {"$set": {"read": False}, "$unset": {"read_at": ""}})
        if res.matched_count == 0:
            raise HTTPException(404, "Notification not found")
        return {"ok": True, "unread": await _unread(user["id"])}

    @router.post("/{notification_id}/dismiss")
    async def dismiss_one(notification_id: str, user: dict = Depends(require_auth)):
        """Swipe-away. Remembers whether it was read so Undo (restore) brings it back exactly as it was."""
        doc = await db.notifications.find_one({"id": notification_id, "user_id": user["id"]}, {"_id": 0, "read": 1})
        if not doc:
            raise HTTPException(404, "Notification not found")
        await db.notifications.update_one({"id": notification_id}, {"$set": {"dismissed": True, "dismissed_at": _iso(_now()), "was_read": bool(doc.get("read"))}})
        return {"ok": True, "unread": await _unread(user["id"])}

    @router.post("/{notification_id}/restore")
    async def restore_one(notification_id: str, user: dict = Depends(require_auth)):
        doc = await db.notifications.find_one({"id": notification_id, "user_id": user["id"]}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Notification not found")
        await db.notifications.update_one({"id": notification_id}, {"$set": {"dismissed": False, "read": bool(doc.get("was_read", doc.get("read")))}, "$unset": {"dismissed_at": "", "was_read": ""}})
        doc = _annotate(await db.notifications.find_one({"id": notification_id}, {"_id": 0}))
        return {"ok": True, "notification": doc, "unread": await _unread(user["id"])}

    @router.post("/read-by-target")
    async def read_by_target(data: ReadByTargetIn, user: dict = Depends(require_auth)):
        """Destination screens call this on open so the centre stays in sync.

        target_type may be a logical entity (property, conversation, store …), a
        whole `category`, or a specific `kind`.
        """
        base = {"user_id": user["id"], "read": False}
        if data.target_type == "category":
            if data.target_id not in CATEGORIES:
                raise HTTPException(400, "Unknown category")
            base["$or"] = [{"category": data.target_id}, {"category": {"$exists": False}, "kind": {"$in": kinds_for(data.target_id)}}]
        elif data.target_type == "kind":
            base["kind"] = data.target_id
        else:
            key = {
                "property": "property_id", "listing": "item_id", "offer": "offer_id", "receipt": "reference",
                "connection": "connection_id", "collection": "collection_id", "estate": "estate_id",
                "representation": "representation_id", "passport": "amass_property_id", "store": "retailer_slug",
                "conversation": "conversation_id", "saved_search": "saved_search_id", "ad": "ad_id",
                "post": "post_id", "event": "event_id", "service_request": "service_request_id",
            }.get(data.target_type, data.target_type)
            base["$or"] = [{f"meta.{key}": data.target_id}, {f"meta.{key}s": data.target_id}]
        res = await db.notifications.update_many(base, {"$set": {"read": True, "read_at": _iso(_now())}})
        return {"ok": True, "marked": res.modified_count, "unread": await _unread(user["id"])}

    @router.post("/read-all")
    async def read_all(category: Optional[str] = None, user: dict = Depends(require_auth)):
        q: dict = {"user_id": user["id"], "read": False}
        if category and category != "all":
            if category not in CATEGORIES:
                raise HTTPException(400, "Unknown category")
            q["$or"] = [{"category": category}, {"category": {"$exists": False}, "kind": {"$in": kinds_for(category)}}]
        res = await db.notifications.update_many(q, {"$set": {"read": True, "read_at": _iso(_now())}})
        return {"ok": True, "marked": res.modified_count, "unread": await _unread(user["id"])}

    @router.post("/preview")
    async def preview(user: dict = Depends(require_auth)):
        """In-app sample so users can see how alerts look (never pushed)."""
        doc = await emit(db, user["id"], "SAVED_SEARCH_MATCH", "This is how a match looks", "A 3-bed in Lekki Phase 1 just matched one of your searches.", {"preview": True, "saved_search_id": f"preview-{uuid.uuid4().hex[:6]}"}, category="property_matches", push=False, dedupe_key=f"preview:{uuid.uuid4().hex}")
        if not doc:
            # Category switched off or digest mode: still show something in the centre
            doc = {
                "id": str(uuid.uuid4()), "user_id": user["id"], "kind": "SAVED_SEARCH_MATCH", "category": "property_matches",
                "title": "This is how a match looks", "body": "A 3-bed in Lekki Phase 1 just matched one of your searches.",
                "read": False, "meta": {"preview": True}, "action_url": None, "created_at": _iso(_now()),
            }
            await db.notifications.insert_one(dict(doc))
        return {"ok": True, "notification": doc}

    @router.post("/admin/run-matchers")
    async def admin_run(_: dict = Depends(require_admin)):
        out = await run_matchers(db)
        out["email_digests"] = await flush_email_digests(db)
        return out

    return router


def _unsub_page(title: str, body: str) -> str:
    return (
        '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        f"<title>{escape(title)} · AMASS</title></head>"
        '<body style="margin:0;background:#F6F4F0;font-family:Arial,Helvetica,sans-serif">'
        '<div style="max-width:480px;margin:48px auto;background:#fff;border-radius:16px;overflow:hidden">'
        '<div style="background:#111;padding:20px 24px;color:#fff;font-size:22px;font-weight:900;letter-spacing:-.5px">AMASS</div>'
        f'<div style="padding:24px"><h1 style="font-size:20px;margin:0 0 8px;color:#111">{escape(title)}</h1>'
        f'<p style="font-size:15px;line-height:22px;color:#444;margin:0 0 20px">{escape(body)}</p>'
        f'<a href="{APP_PUBLIC_URL}/updates" style="display:inline-block;background:#E11B22;color:#fff;font-weight:700;padding:12px 18px;border-radius:999px;text-decoration:none">Open AMASS</a>'
        "</div></div></body></html>"
    )
