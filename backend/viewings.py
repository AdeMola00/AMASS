"""
Property viewings — a buyer who has unlocked a home books a viewing with the listing agent.

Flow
  • Agents may publish weekly viewing hours (optional). With hours set, buyers only see open slots; without them a
    buyer proposes any day/time and the agent decides.
  • Buyer → POST /viewings (status `requested`). Agent → confirm / propose another time / decline. Either side can
    cancel. A proposal flips the ball to the other side, who confirms (or counter-proposes).
  • Both sides get an in-app notification + email for every change, and a reminder ~24 h before a confirmed slot.

Access rule: booking requires an active `property` entitlement for the home (or the home is a free AMASS sale /
the listing is the user's own) — the agent's identity stays behind the MASS unlock, exactly like chat & contact.
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone
from html import escape
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field
from pymongo.errors import DuplicateKeyError

logger = logging.getLogger("amass.viewings")

SLOT_MINUTES = 60
MAX_DAYS_AHEAD = 30
LAGOS = timezone(timedelta(hours=1))  # Africa/Lagos has no DST

Status = Literal["requested", "confirmed", "rescheduled", "declined", "cancelled", "completed"]
OPEN_STATUSES = ("requested", "confirmed", "rescheduled")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()


def _parse(ts: str) -> datetime:
    try:
        dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(400, "Invalid date/time")
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _when(dt: datetime) -> str:
    """'Sat 14 Jun · 10:00' in Lagos time — used in notifications and emails."""
    local = dt.astimezone(LAGOS)
    return f"{local.strftime('%a %d %b')} · {local.strftime('%H:%M')}"


# ─── Models ──────────────────────────────────────────────────────────────────
class HoursWindow(BaseModel):
    weekday: int = Field(ge=0, le=6)  # 0 = Monday … 6 = Sunday
    start: str = Field(pattern=r"^\d{2}:\d{2}$")  # Lagos time
    end: str = Field(pattern=r"^\d{2}:\d{2}$")


class AvailabilityIn(BaseModel):
    hours: list[HoursWindow] = Field(default_factory=list, max_length=21)
    slot_minutes: int = Field(default=SLOT_MINUTES, ge=30, le=120)


class ViewingCreate(BaseModel):
    property_id: str
    start: str  # ISO datetime
    note: Optional[str] = Field(default=None, max_length=400)


class ProposeIn(BaseModel):
    start: str
    note: Optional[str] = Field(default=None, max_length=400)


class NoteIn(BaseModel):
    note: Optional[str] = Field(default=None, max_length=400)


# ─── Email (link-free HTML: passes the email guardrails) ─────────────────────
def _email_html(heading: str, lines: list[str], footer: str = "Open the AMASS app → My Amass → Viewings to respond.") -> str:
    body = "".join(f"<p style='margin:0 0 10px;color:#333;font-size:15px;line-height:1.5'>{escape(l)}</p>" for l in lines)
    return (
        "<div style='font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px'>"
        "<p style='margin:0 0 4px;font-size:12px;letter-spacing:1px;color:#8A6D14;font-weight:700'>AMASS · VIEWINGS</p>"
        f"<h2 style='margin:0 0 16px;font-size:22px;color:#111'>{escape(heading)}</h2>"
        f"{body}"
        f"<p style='margin:18px 0 0;color:#777;font-size:13px'>{escape(footer)}</p>"
        "</div>"
    )


async def _email_user(db, user_id: str, subject: str, heading: str, lines: list[str]) -> None:
    """Best-effort email copy — never raises, never blocks the request."""
    from auth_security import send_email

    u = await db.users.find_one({"id": user_id}, {"_id": 0, "email": 1})
    if not u or not u.get("email"):
        return
    try:
        await send_email(to=u["email"], subject=subject, html=_email_html(heading, lines))
    except Exception as e:  # noqa: BLE001
        logger.warning("viewing email to %s failed: %s", user_id, e)


async def _tell(db, user_id: str, kind: str, title: str, body: str, viewing: dict, *, email_heading: Optional[str] = None, email_lines: Optional[list[str]] = None):
    """In-app notification now (deep-links to the viewing) + email in the background."""
    from notification_center import emit

    await emit(db, user_id, kind, title, body, {"viewing_id": viewing["id"], "property_id": viewing["property_id"]}, action_url=f"/viewings/{viewing['id']}")
    asyncio.create_task(_email_user(db, user_id, f"AMASS · {title}", email_heading or title, email_lines or [body]))


# ─── Router ──────────────────────────────────────────────────────────────────
def register_viewing_routes(db: AsyncIOMotorDatabase, require_auth) -> APIRouter:
    router = APIRouter(prefix="/api/viewings", tags=["viewings"])

    async def _prop(property_id: str) -> dict:
        p = await db.properties.find_one({"id": property_id}, {"_id": 0, "id": 1, "title": 1, "agent_id": 1, "city": 1, "location": 1, "image": 1, "images": 1, "listing_type": 1, "is_amass_exclusive": 1, "listing_source": 1, "listed_by": 1, "status": 1})
        if not p:
            raise HTTPException(404, "Property not found")
        return p

    async def _has_access(user: dict, prop: dict) -> bool:
        from tokens import is_free_amass_sale

        if prop.get("agent_id") == user["id"] or user.get("is_admin") or is_free_amass_sale(prop):
            return True
        return await db.entitlements.find_one({"user_id": user["id"], "feature_key": "property", "target_id": prop["id"], "status": "active"}, {"_id": 0, "id": 1}) is not None

    async def _get(viewing_id: str, user: dict) -> dict:
        v = await db.viewings.find_one({"id": viewing_id}, {"_id": 0})
        if not v:
            raise HTTPException(404, "Viewing not found")
        if user["id"] not in (v["buyer_id"], v["agent_id"]) and not user.get("is_admin"):
            raise HTTPException(403, "Not your viewing")
        return v

    def _role(v: dict, user: dict) -> str:
        return "agent" if user["id"] == v["agent_id"] else "buyer"

    async def _conflict(agent_id: str, start: datetime, minutes: int, exclude_id: Optional[str] = None) -> bool:
        """Another confirmed viewing for this agent overlapping the slot."""
        end = start + timedelta(minutes=minutes)
        q: dict[str, Any] = {"agent_id": agent_id, "status": "confirmed", "start": {"$lt": _iso(end)}, "end": {"$gt": _iso(start)}}
        if exclude_id:
            q["id"] = {"$ne": exclude_id}
        return await db.viewings.find_one(q, {"_id": 0, "id": 1}) is not None

    async def _availability(agent_id: str) -> dict:
        a = await db.viewing_availability.find_one({"agent_id": agent_id}, {"_id": 0}) or {}
        return {"hours": a.get("hours", []), "slot_minutes": int(a.get("slot_minutes") or SLOT_MINUTES), "has_hours": bool(a.get("hours"))}

    def _inside_hours(av: dict, start: datetime, minutes: int) -> bool:
        if not av["has_hours"]:
            return True
        local = start.astimezone(LAGOS)
        end_local = local + timedelta(minutes=minutes)
        for w in av["hours"]:
            if w["weekday"] != local.weekday():
                continue
            ws = local.replace(hour=int(w["start"][:2]), minute=int(w["start"][3:]), second=0, microsecond=0)
            we = local.replace(hour=int(w["end"][:2]), minute=int(w["end"][3:]), second=0, microsecond=0)
            if ws <= local and end_local <= we:
                return True
        return False

    def _validate_start(start: datetime):
        now = _now()
        if start < now + timedelta(hours=1):
            raise HTTPException(400, "Pick a time at least an hour from now")
        if start > now + timedelta(days=MAX_DAYS_AHEAD):
            raise HTTPException(400, f"Viewings can be booked up to {MAX_DAYS_AHEAD} days ahead")

    async def _enrich(v: dict, user: dict) -> dict:
        """Attach the counterpart's public identity. Buyers only ever see the agent after unlocking (enforced at booking)."""
        from social_common import public_users

        people = await public_users(db, [v["buyer_id"], v["agent_id"]])
        out = dict(v)
        out["buyer"] = people.get(v["buyer_id"])
        out["agent"] = people.get(v["agent_id"])
        out["role"] = _role(v, user)
        out["can_confirm"] = v["status"] in ("requested", "rescheduled") and v.get("awaiting") == out["role"]
        out["can_propose"] = v["status"] in OPEN_STATUSES
        out["can_cancel"] = v["status"] in OPEN_STATUSES
        out["can_decline"] = out["role"] == "agent" and v["status"] in ("requested", "rescheduled")
        out["can_complete"] = out["role"] == "agent" and v["status"] == "confirmed" and _parse(v["start"]) <= _now()
        return out

    # ── Availability ─────────────────────────────────────────────────────────
    @router.get("/availability/me")
    async def my_availability(user=Depends(require_auth)):
        return await _availability(user["id"])

    @router.put("/availability/me")
    async def set_availability(body: AvailabilityIn, user=Depends(require_auth)):
        def _mins(hhmm: str) -> int:
            h, m = int(hhmm[:2]), int(hhmm[3:])
            if h > 23 or m > 59:
                raise HTTPException(400, f"{hhmm} isn't a valid time of day")
            return h * 60 + m

        by_day: dict[int, list[tuple[int, int]]] = {}
        for w in body.hours:
            s, e = _mins(w.start), _mins(w.end)
            if s >= e:
                raise HTTPException(400, "Each window must end after it starts")
            if any(s < oe and e > os_ for os_, oe in by_day.get(w.weekday, [])):
                raise HTTPException(400, "Viewing windows on the same day can't overlap")
            by_day.setdefault(w.weekday, []).append((s, e))
        await db.viewing_availability.update_one(
            {"agent_id": user["id"]},
            {"$set": {"agent_id": user["id"], "hours": [w.model_dump() for w in body.hours], "slot_minutes": body.slot_minutes, "updated_at": _iso(_now())}},
            upsert=True,
        )
        return await _availability(user["id"])

    @router.get("/availability/{agent_id}")
    async def agent_availability(agent_id: str, property_id: str = Query(...), user=Depends(require_auth)):
        """Hours + taken slots for the booking sheet. Requires access to the home so the agent's calendar never leaks."""
        prop = await _prop(property_id)
        if prop.get("agent_id") != agent_id:
            raise HTTPException(400, "Agent does not list this property")
        if not await _has_access(user, prop):
            raise HTTPException(402, "Unlock this home to book a viewing")
        av = await _availability(agent_id)
        since = _iso(_now())
        taken = await db.viewings.find({"agent_id": agent_id, "status": "confirmed", "start": {"$gte": since}}, {"_id": 0, "start": 1, "end": 1}).to_list(500)
        mine = await db.viewings.find_one({"buyer_id": user["id"], "property_id": property_id, "status": {"$in": list(OPEN_STATUSES)}}, {"_id": 0})
        return {**av, "taken": [{"start": t["start"], "end": t["end"]} for t in taken], "max_days_ahead": MAX_DAYS_AHEAD, "existing": await _enrich(mine, user) if mine else None}

    # ── Booking ──────────────────────────────────────────────────────────────
    @router.post("", status_code=201)
    async def request_viewing(body: ViewingCreate, user=Depends(require_auth)):
        prop = await _prop(body.property_id)
        agent_id = prop.get("agent_id")
        if not agent_id:
            raise HTTPException(400, "This home has no listing agent to book with")
        if agent_id == user["id"]:
            raise HTTPException(400, "You can't book a viewing of your own listing")
        if prop.get("status") in ("sold", "withdrawn"):
            raise HTTPException(400, "This home is no longer available")
        if not await _has_access(user, prop):
            raise HTTPException(402, "Unlock this home to book a viewing")
        existing = await db.viewings.find_one({"buyer_id": user["id"], "property_id": prop["id"], "status": {"$in": list(OPEN_STATUSES)}}, {"_id": 0})
        if existing:
            raise HTTPException(409, "You already have a viewing in progress for this home")
        start = _parse(body.start)
        _validate_start(start)
        av = await _availability(agent_id)
        minutes = av["slot_minutes"]
        if not _inside_hours(av, start, minutes):
            raise HTTPException(400, "That time is outside the agent's viewing hours")
        if await _conflict(agent_id, start, minutes):
            raise HTTPException(409, "The agent already has a viewing at that time")
        now = _now()
        v = {
            "id": str(uuid.uuid4()),
            "property_id": prop["id"],
            "property_title": prop.get("title"),
            "property_city": prop.get("city"),
            "property_image": (prop.get("images") or [None])[0] or prop.get("image"),
            "agent_id": agent_id,
            "buyer_id": user["id"],
            "start": _iso(start),
            "end": _iso(start + timedelta(minutes=minutes)),
            "slot_minutes": minutes,
            "status": "requested",
            "awaiting": "agent",
            "note": (body.note or "").strip() or None,
            "history": [{"at": _iso(now), "by": "buyer", "action": "requested", "start": _iso(start), "note": (body.note or "").strip() or None}],
            "reminder_sent_at": None,
            "created_at": _iso(now),
            "updated_at": _iso(now),
        }
        try:
            await db.viewings.insert_one(dict(v))
        except DuplicateKeyError:
            # Parallel requests for the same home — the partial unique index lets exactly one through.
            raise HTTPException(409, "You already have a viewing in progress for this home")
        buyer_name = user.get("full_name") or "A buyer"
        await _tell(
            db, agent_id, "VIEWING_REQUESTED",
            "New viewing request",
            f"{buyer_name} wants to view {prop.get('title')} on {_when(start)}.",
            v,
            email_heading="New viewing request",
            email_lines=[f"{buyer_name} would like to view {prop.get('title')} ({prop.get('city') or ''}).", f"Proposed time: {_when(start)} (Lagos time).", "Confirm, suggest another time or decline in the app."],
        )
        return await _enrich(v, user)

    @router.get("/mine")
    async def my_viewings(role: Literal["buyer", "agent", "all"] = "all", user=Depends(require_auth)):
        q: dict[str, Any]
        if role == "buyer":
            q = {"buyer_id": user["id"]}
        elif role == "agent":
            q = {"agent_id": user["id"]}
        else:
            q = {"$or": [{"buyer_id": user["id"]}, {"agent_id": user["id"]}]}
        rows = await db.viewings.find(q, {"_id": 0}).sort("start", 1).to_list(300)
        out = [await _enrich(r, user) for r in rows]
        now = _iso(_now())
        upcoming = [r for r in out if r["status"] in OPEN_STATUSES and r["start"] >= now]
        past = [r for r in out if r not in upcoming]
        past.sort(key=lambda r: r["start"], reverse=True)
        pending_for_me = sum(1 for r in upcoming if r["can_confirm"])
        return {"upcoming": upcoming, "past": past, "pending_for_me": pending_for_me}

    @router.get("/{viewing_id}")
    async def get_viewing(viewing_id: str, user=Depends(require_auth)):
        return await _enrich(await _get(viewing_id, user), user)

    async def _transition(v: dict, user: dict, status: str, action: str, *, start: Optional[datetime] = None, note: Optional[str] = None, awaiting: Optional[str] = None) -> dict:
        now = _now()
        role = _role(v, user)
        upd: dict[str, Any] = {"status": status, "awaiting": awaiting, "updated_at": _iso(now)}
        if start is not None:
            upd["start"] = _iso(start)
            upd["end"] = _iso(start + timedelta(minutes=int(v.get("slot_minutes") or SLOT_MINUTES)))
            upd["reminder_sent_at"] = None
        entry = {"at": _iso(now), "by": role, "action": action, "start": upd.get("start"), "note": (note or "").strip() or None}
        # Precondition on the state we validated against — two near-simultaneous actions can't both win.
        res = await db.viewings.update_one({"id": v["id"], "status": v["status"], "awaiting": v.get("awaiting")}, {"$set": upd, "$push": {"history": entry}})
        if not res.modified_count:
            raise HTTPException(409, "This viewing just changed — pull to refresh and try again")
        return await db.viewings.find_one({"id": v["id"]}, {"_id": 0})

    @router.post("/{viewing_id}/confirm")
    async def confirm_viewing(viewing_id: str, body: NoteIn | None = None, user=Depends(require_auth)):
        v = await _get(viewing_id, user)
        role = _role(v, user)
        if v["status"] not in ("requested", "rescheduled") or v.get("awaiting") != role:
            raise HTTPException(409, "Nothing to confirm on your side right now")
        start = _parse(v["start"])
        if start < _now():
            raise HTTPException(409, "That time has passed — suggest a new one")
        if await _conflict(v["agent_id"], start, int(v.get("slot_minutes") or SLOT_MINUTES), exclude_id=v["id"]):
            raise HTTPException(409, "The agent now has another viewing at that time — suggest a new one")
        v2 = await _transition(v, user, "confirmed", "confirmed", note=body.note if body else None, awaiting=None)
        other = v["buyer_id"] if role == "agent" else v["agent_id"]
        await _tell(
            db, other, "VIEWING_CONFIRMED",
            "Viewing confirmed",
            f"{v.get('property_title')} · {_when(start)}. See you there!",
            v2,
            email_heading="Your viewing is confirmed",
            email_lines=[f"{v.get('property_title')} ({v.get('property_city') or ''}).", f"When: {_when(start)} (Lagos time).", "We'll remind you a day before."],
        )
        return await _enrich(v2, user)

    @router.post("/{viewing_id}/propose")
    async def propose_time(viewing_id: str, body: ProposeIn, user=Depends(require_auth)):
        v = await _get(viewing_id, user)
        if v["status"] not in OPEN_STATUSES:
            raise HTTPException(409, "This viewing is closed")
        role = _role(v, user)
        start = _parse(body.start)
        _validate_start(start)
        if role == "buyer":
            av = await _availability(v["agent_id"])
            if not _inside_hours(av, start, av["slot_minutes"]):
                raise HTTPException(400, "That time is outside the agent's viewing hours")
        if await _conflict(v["agent_id"], start, int(v.get("slot_minutes") or SLOT_MINUTES), exclude_id=v["id"]):
            raise HTTPException(409, "The agent already has a viewing at that time")
        other_role = "buyer" if role == "agent" else "agent"
        v2 = await _transition(v, user, "rescheduled", "proposed", start=start, note=body.note, awaiting=other_role)
        other = v["buyer_id"] if role == "agent" else v["agent_id"]
        who = user.get("full_name") or ("The agent" if role == "agent" else "The buyer")
        await _tell(
            db, other, "VIEWING_RESCHEDULED",
            "New time suggested",
            f"{who} suggests {_when(start)} for {v.get('property_title')}. Tap to confirm.",
            v2,
            email_heading="A new viewing time was suggested",
            email_lines=[f"{who} suggests {_when(start)} (Lagos time) for {v.get('property_title')}.", (body.note or "").strip() or "Confirm it or suggest another time in the app."],
        )
        return await _enrich(v2, user)

    @router.post("/{viewing_id}/decline")
    async def decline_viewing(viewing_id: str, body: NoteIn | None = None, user=Depends(require_auth)):
        v = await _get(viewing_id, user)
        if _role(v, user) != "agent":
            raise HTTPException(403, "Only the agent can decline — buyers cancel instead")
        if v["status"] not in ("requested", "rescheduled"):
            raise HTTPException(409, "This viewing can't be declined now")
        v2 = await _transition(v, user, "declined", "declined", note=body.note if body else None, awaiting=None)
        note = (body.note or "").strip() if body else ""
        await _tell(
            db, v["buyer_id"], "VIEWING_DECLINED",
            "Viewing declined",
            f"The agent can't do {v.get('property_title')} on {_when(_parse(v['start']))}.{' ' + note if note else ''}",
            v2,
            email_heading="Your viewing request was declined",
            email_lines=[f"The agent can't make {_when(_parse(v['start']))} for {v.get('property_title')}.", note or "You can request another time from the property page."],
        )
        return await _enrich(v2, user)

    @router.post("/{viewing_id}/cancel")
    async def cancel_viewing(viewing_id: str, body: NoteIn | None = None, user=Depends(require_auth)):
        v = await _get(viewing_id, user)
        if v["status"] not in OPEN_STATUSES:
            raise HTTPException(409, "This viewing is already closed")
        role = _role(v, user)
        v2 = await _transition(v, user, "cancelled", "cancelled", note=body.note if body else None, awaiting=None)
        other = v["buyer_id"] if role == "agent" else v["agent_id"]
        who = user.get("full_name") or ("The agent" if role == "agent" else "The buyer")
        await _tell(
            db, other, "VIEWING_CANCELLED",
            "Viewing cancelled",
            f"{who} cancelled the viewing of {v.get('property_title')} on {_when(_parse(v['start']))}.",
            v2,
            email_heading="A viewing was cancelled",
            email_lines=[f"{who} cancelled the viewing of {v.get('property_title')} on {_when(_parse(v['start']))} (Lagos time)."],
        )
        return await _enrich(v2, user)

    @router.post("/{viewing_id}/complete")
    async def complete_viewing(viewing_id: str, user=Depends(require_auth)):
        v = await _get(viewing_id, user)
        if _role(v, user) != "agent" or v["status"] != "confirmed":
            raise HTTPException(409, "Only a confirmed viewing can be marked as done by the agent")
        if _parse(v["start"]) > _now():
            raise HTTPException(409, "This viewing hasn't happened yet — mark it done after the visit")
        v2 = await _transition(v, user, "completed", "completed", awaiting=None)
        return await _enrich(v2, user)

    return router


# ─── Startup: indexes + reminder sweep ───────────────────────────────────────
async def start_viewings(db: AsyncIOMotorDatabase) -> None:
    try:
        await db.viewings.create_index("id", unique=True)
        await db.viewings.create_index([("agent_id", 1), ("status", 1), ("start", 1)])
        await db.viewings.create_index([("buyer_id", 1), ("status", 1), ("start", 1)])
        await db.viewing_availability.create_index("agent_id", unique=True)
        # One OPEN viewing per buyer and home — enforced in the database so parallel requests can't slip through.
        # Earlier duplicates (from before the index) are cancelled, keeping the first one, so the index can build.
        dupes = await db.viewings.aggregate([
            {"$match": {"status": {"$in": list(OPEN_STATUSES)}}},
            {"$sort": {"created_at": 1}},
            {"$group": {"_id": {"b": "$buyer_id", "p": "$property_id"}, "ids": {"$push": "$id"}, "n": {"$sum": 1}}},
            {"$match": {"n": {"$gt": 1}}},
        ]).to_list(1000)
        extra = [i for d in dupes for i in d["ids"][1:]]
        if extra:
            now = _iso(_now())
            await db.viewings.update_many({"id": {"$in": extra}}, {"$set": {"status": "cancelled", "awaiting": None, "updated_at": now}, "$push": {"history": {"at": now, "by": "system", "action": "cancelled", "start": None, "note": "Duplicate request removed"}}})
            logger.info("viewings: cancelled %d duplicate open requests", len(extra))
        await db.viewings.create_index(
            [("buyer_id", 1), ("property_id", 1)],
            unique=True,
            partialFilterExpression={"status": {"$in": list(OPEN_STATUSES)}},
            name="uniq_open_viewing_per_home",
        )
    except Exception as e:  # never block boot
        logger.warning("viewing indexes failed: %s", e)

    async def _loop():
        while True:
            try:
                await send_reminders(db)
            except Exception as e:  # noqa: BLE001
                logger.warning("viewing reminders failed: %s", e)
            await asyncio.sleep(900)

    asyncio.create_task(_loop())


async def send_reminders(db: AsyncIOMotorDatabase) -> int:
    """Confirmed viewings starting within the next 24 h get one reminder to both sides (idempotent)."""
    now = _now()
    window_end = _iso(now + timedelta(hours=24))
    rows = await db.viewings.find({"status": "confirmed", "reminder_sent_at": None, "start": {"$gte": _iso(now), "$lte": window_end}}, {"_id": 0}).to_list(200)
    sent = 0
    for v in rows:
        claimed = await db.viewings.update_one({"id": v["id"], "reminder_sent_at": None}, {"$set": {"reminder_sent_at": _iso(now)}})
        if not claimed.modified_count:
            continue
        when = _when(_parse(v["start"]))
        for uid in (v["buyer_id"], v["agent_id"]):
            await _tell(
                db, uid, "VIEWING_REMINDER",
                "Viewing tomorrow",
                f"{v.get('property_title')} · {when}.",
                v,
                email_heading="Reminder: viewing tomorrow",
                email_lines=[f"{v.get('property_title')} ({v.get('property_city') or ''}).", f"When: {when} (Lagos time)."],
            )
        sent += 1
    return sent
