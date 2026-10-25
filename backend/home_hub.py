"""
My Home hub — bills, records, items, repairs, calendar for one or more homes per user.

  • Everything is private to the owner (`user_id` on every row); files live in Emergent Object Storage under
    `amass/uploads/{user_id}/…` so the auth-checked `/api/files/{path}` route already enforces owner-only reads.
  • Bills are reminders only — AMASS never moves money here. `POST /bills/{id}/pay` records the payment, attaches
    an optional receipt (a Record in the "receipts" folder) and advances `next_due` by the bill's schedule.
  • Dates are plain `YYYY-MM-DD` strings in Africa/Lagos (the home market); "today" is computed in that zone.
  • Reminders: a background sweep (every 30 min) emits in-app + push through `notification_center.emit` and sends
    an email through `auth_security.send_email`, once per (entity, due date, offset) — logged in `hh_reminder_log`.
  • Uploads: small files arrive as a base64 data URL; bigger ones in chunks (start → chunks → complete) so a weak
    connection can retry a single chunk instead of the whole file.
  • Client-generated ids (`id` in the create body) make retries idempotent: the same id returns the existing row.
"""
from __future__ import annotations

import asyncio
import base64
import calendar
import logging
import os
import uuid
from datetime import date, datetime, timedelta, timezone
from html import escape
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

logger = logging.getLogger("amass.home")

LAGOS = timezone(timedelta(hours=1))
DUE_SOON_DAYS = 7
MAX_UPLOAD = 12 * 1024 * 1024
MAX_CHUNK_B64 = 1_100_000  # ~800 KB binary per chunk

HomeKind = Literal["flat", "house", "duplex", "land", "office", "shop", "other"]
Freq = Literal["once", "daily", "weekly", "monthly", "yearly", "custom"]
Unit = Literal["days", "weeks", "months"]

BILL_CATEGORIES: list[dict[str, str]] = [
    {"key": "rent", "label": "Rent", "icon": "home"},
    {"key": "electricity", "label": "Electricity", "icon": "flash"},
    {"key": "water", "label": "Water", "icon": "water"},
    {"key": "internet", "label": "Internet", "icon": "wifi"},
    {"key": "tv", "label": "TV / Cable", "icon": "tv"},
    {"key": "waste", "label": "Waste", "icon": "trash"},
    {"key": "security", "label": "Security", "icon": "shield"},
    {"key": "estate_dues", "label": "Estate dues", "icon": "business"},
    {"key": "gas", "label": "Gas", "icon": "flame"},
    {"key": "generator", "label": "Generator / Fuel", "icon": "battery-charging"},
    {"key": "insurance", "label": "Insurance", "icon": "umbrella"},
    {"key": "loan", "label": "Loan / Mortgage", "icon": "cash"},
    {"key": "phone", "label": "Phone", "icon": "call"},
    {"key": "subscription", "label": "Subscription", "icon": "repeat"},
    {"key": "school", "label": "School fees", "icon": "school"},
    {"key": "other", "label": "Other", "icon": "ellipsis-horizontal"},
]
RECORD_FOLDERS: list[dict[str, str]] = [
    {"key": "receipts", "label": "Receipts", "icon": "receipt"},
    {"key": "agreements", "label": "Agreements", "icon": "document-text"},
    {"key": "property", "label": "Property documents", "icon": "home"},
    {"key": "warranties", "label": "Warranties", "icon": "shield-checkmark"},
    {"key": "utility", "label": "Utility bills", "icon": "flash"},
    {"key": "other", "label": "Other", "icon": "folder"},
]
ROOMS = ["Living room", "Bedroom", "Kitchen", "Bathroom", "Dining", "Office", "Kids' room", "Balcony", "Garage", "Store", "Outdoor", "Other"]
REPAIR_TRADES = ["Plumbing", "Electrical", "AC Repair", "Generator", "Cleaning", "Pest Control", "Painting", "Carpentry", "Roofing", "Tiling", "CCTV & Security", "Solar", "Gardening", "Pool Maintenance", "Handyman", "Other"]
HOME_COLORS = ["#E11B22", "#F97316", "#D4AF37", "#2E8B57", "#14B8A6", "#4F46E5", "#111111"]
DEFAULT_BILL_REMINDERS = [3, 0]
DEFAULT_EXPIRY_REMINDERS = [30, 7, 0]
DEFAULT_WARRANTY_REMINDERS = [30, 7]


# ─── Dates ────────────────────────────────────────────────────────────────
def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso(d: datetime) -> str:
    return d.isoformat()


def today_local() -> date:
    return datetime.now(LAGOS).date()


def parse_day(s: Optional[str]) -> Optional[date]:
    if not s:
        return None
    try:
        return date.fromisoformat(str(s)[:10])
    except ValueError:
        raise HTTPException(400, f"Invalid date: {s!r} (use YYYY-MM-DD)")


def add_months(d: date, n: int, anchor_day: Optional[int] = None) -> date:
    m0 = d.month - 1 + n
    y = d.year + m0 // 12
    m = m0 % 12 + 1
    day = min(anchor_day or d.day, calendar.monthrange(y, m)[1])
    return date(y, m, day)


def advance(d: date, schedule: dict, anchor_day: Optional[int] = None) -> date:
    freq = schedule.get("freq", "once")
    n = max(1, int(schedule.get("interval") or 1))
    if freq == "daily":
        return d + timedelta(days=n)
    if freq == "weekly":
        return d + timedelta(weeks=n)
    if freq == "monthly":
        return add_months(d, n, anchor_day)
    if freq == "yearly":
        return add_months(d, 12 * n, anchor_day)
    if freq == "custom":
        unit = schedule.get("unit") or "months"
        if unit == "days":
            return d + timedelta(days=n)
        if unit == "weeks":
            return d + timedelta(weeks=n)
        return add_months(d, n, anchor_day)
    return d


def schedule_label(schedule: dict) -> str:
    freq = schedule.get("freq", "once")
    n = max(1, int(schedule.get("interval") or 1))
    if freq == "once":
        return "One-off"
    if freq == "custom":
        unit = schedule.get("unit") or "months"
        return f"Every {n} {unit if n != 1 else unit[:-1]}"
    if n == 1:
        return {"daily": "Daily", "weekly": "Weekly", "monthly": "Monthly", "yearly": "Yearly"}[freq]
    unit = {"daily": "days", "weekly": "weeks", "monthly": "months", "yearly": "years"}[freq]
    return f"Every {n} {unit}"


def status_for(due: Optional[date], today: date, *, paid_cycle: bool = False) -> str:
    if not due:
        return "none"
    delta = (due - today).days
    if delta < 0:
        return "overdue"
    if delta <= DUE_SOON_DAYS:
        return "due_soon"
    return "paid" if paid_cycle else "upcoming"


def naira(n: Optional[float]) -> str:
    if n is None:
        return ""
    return f"₦{int(round(n)):,}"


def clean(doc: Optional[dict]) -> Optional[dict]:
    if doc is None:
        return None
    doc.pop("_id", None)
    return doc


# ─── Models ───────────────────────────────────────────────────────────────
class Schedule(BaseModel):
    freq: Freq = "monthly"
    interval: int = Field(1, ge=1, le=365)
    unit: Unit = "months"


class FileRef(BaseModel):
    path: str = Field(..., min_length=1)
    url: str = Field(..., min_length=1)
    name: Optional[str] = None
    content_type: Optional[str] = None
    size: Optional[int] = None


class HomeIn(BaseModel):
    id: Optional[str] = None
    name: str = Field(..., min_length=1, max_length=60)
    address: Optional[str] = Field(None, max_length=160)
    kind: HomeKind = "flat"
    color: Optional[str] = None
    is_default: bool = False


class BillIn(BaseModel):
    id: Optional[str] = None
    home_id: str
    name: str = Field(..., min_length=1, max_length=80)
    category: str = "other"
    amount: float = Field(0, ge=0, le=1e12)
    due_date: str
    schedule: Schedule = Schedule()
    reminders: list[int] = Field(default_factory=lambda: list(DEFAULT_BILL_REMINDERS))
    payee: Optional[str] = Field(None, max_length=80)
    notes: Optional[str] = Field(None, max_length=600)


class PayIn(BaseModel):
    amount: Optional[float] = Field(None, ge=0, le=1e12)
    paid_at: Optional[str] = None
    note: Optional[str] = Field(None, max_length=300)
    receipt: Optional[FileRef] = None
    record_id: Optional[str] = None


class RecordIn(BaseModel):
    id: Optional[str] = None
    home_id: str
    title: str = Field(..., min_length=1, max_length=100)
    folder: str = "other"
    file: Optional[FileRef] = None
    notes: Optional[str] = Field(None, max_length=600)
    expires_at: Optional[str] = None
    expiry_reminders: list[int] = Field(default_factory=lambda: list(DEFAULT_EXPIRY_REMINDERS))
    bill_id: Optional[str] = None
    payment_id: Optional[str] = None
    item_id: Optional[str] = None
    repair_id: Optional[str] = None


class ItemIn(BaseModel):
    id: Optional[str] = None
    home_id: str
    name: str = Field(..., min_length=1, max_length=80)
    room: str = "Other"
    photo: Optional[FileRef] = None
    brand: Optional[str] = Field(None, max_length=60)
    model: Optional[str] = Field(None, max_length=60)
    serial: Optional[str] = Field(None, max_length=80)
    store: Optional[str] = Field(None, max_length=80)
    purchased_at: Optional[str] = None
    price: Optional[float] = Field(None, ge=0, le=1e12)
    value: Optional[float] = Field(None, ge=0, le=1e12)
    warranty_until: Optional[str] = None
    warranty_reminders: list[int] = Field(default_factory=lambda: list(DEFAULT_WARRANTY_REMINDERS))
    notes: Optional[str] = Field(None, max_length=600)


class RepairIn(BaseModel):
    id: Optional[str] = None
    home_id: str
    title: str = Field(..., min_length=1, max_length=80)
    trade: str = "Handyman"
    schedule: Schedule = Schedule(freq="once")
    next_due: Optional[str] = None
    reminders: list[int] = Field(default_factory=lambda: list(DEFAULT_BILL_REMINDERS))
    item_id: Optional[str] = None
    provider_id: Optional[str] = None
    notes: Optional[str] = Field(None, max_length=600)


class RepairDoneIn(BaseModel):
    date: Optional[str] = None
    cost: Optional[float] = Field(None, ge=0, le=1e12)
    notes: Optional[str] = Field(None, max_length=600)
    photos: list[FileRef] = Field(default_factory=list)
    provider_name: Optional[str] = Field(None, max_length=80)
    provider_id: Optional[str] = None
    fixa_booking_id: Optional[str] = None


class UploadStartIn(BaseModel):
    name: Optional[str] = None
    content_type: str = "application/octet-stream"
    size: int = Field(..., ge=1, le=MAX_UPLOAD)
    total_chunks: int = Field(..., ge=1, le=64)


class ChunkIn(BaseModel):
    data: str = Field(..., min_length=1, max_length=MAX_CHUNK_B64)


class DirectUploadIn(BaseModel):
    data_url: str = Field(..., min_length=16)
    name: Optional[str] = None


# ─── Indexes ─────────────────────────────────────────────────────────────
async def ensure_home_hub_indexes(db: AsyncIOMotorDatabase) -> None:
    await db.hh_homes.create_index("id", unique=True)
    await db.hh_homes.create_index([("user_id", 1), ("created_at", 1)])
    for coll in (db.hh_bills, db.hh_records, db.hh_items, db.hh_repairs):
        await coll.create_index("id", unique=True)
        await coll.create_index([("user_id", 1), ("home_id", 1)])
    await db.hh_payments.create_index("id", unique=True)
    await db.hh_payments.create_index([("user_id", 1), ("bill_id", 1), ("paid_at", -1)])
    await db.hh_repair_logs.create_index("id", unique=True)
    await db.hh_repair_logs.create_index([("user_id", 1), ("repair_id", 1), ("date", -1)])
    await db.hh_reminder_log.create_index("key", unique=True)
    await db.hh_upload_chunks.create_index([("upload_id", 1), ("index", 1)], unique=True)
    await db.hh_uploads.create_index("id", unique=True)
    await db.hh_uploads.create_index("created_at", expireAfterSeconds=24 * 3600)


# ─── Shaping ──────────────────────────────────────────────────────────────
def shape_bill(b: dict, today: date) -> dict:
    b = clean(dict(b)) or {}
    sched = b.get("schedule") or {"freq": "once"}
    once = sched.get("freq") == "once"
    due = parse_day(b.get("next_due"))
    if b.get("archived"):
        status = "archived"
    elif once and b.get("paid_at"):
        status = "paid"
    else:
        status = status_for(due, today, paid_cycle=bool(b.get("last_paid_at")) and not once)
    b["status"] = status
    b["days_until"] = (due - today).days if due else None
    b["schedule_label"] = schedule_label(sched)
    return b


def shape_repair(r: dict, today: date) -> dict:
    r = clean(dict(r)) or {}
    due = parse_day(r.get("next_due"))
    sched = r.get("schedule") or {"freq": "once"}
    if r.get("archived"):
        status = "archived"
    elif not due:
        status = "done" if r.get("last_done_at") else "none"
    else:
        status = status_for(due, today, paid_cycle=False)
        if status == "upcoming" and r.get("last_done_at"):
            status = "done"
    r["status"] = status
    r["days_until"] = (due - today).days if due else None
    r["schedule_label"] = "As needed" if sched.get("freq") == "once" else schedule_label(sched)
    return r


def shape_record(r: dict, today: date) -> dict:
    r = clean(dict(r)) or {}
    exp = parse_day(r.get("expires_at"))
    r["expiry_status"] = "none" if not exp else ("expired" if exp < today else ("expiring" if (exp - today).days <= 30 else "valid"))
    r["days_until_expiry"] = (exp - today).days if exp else None
    return r


def shape_item(i: dict, today: date) -> dict:
    i = clean(dict(i)) or {}
    w = parse_day(i.get("warranty_until"))
    i["warranty_status"] = "none" if not w else ("expired" if w < today else ("expiring" if (w - today).days <= 30 else "active"))
    i["warranty_days"] = (w - today).days if w else None
    return i


# ─── Reminders (shared by the sweep and the admin trigger) ───────────────
async def _email_reminder(db, user_id: str, subject: str, headline: str, body: str, path: str) -> bool:
    try:
        from notification_center import APP_PUBLIC_URL, get_prefs
        from auth_security import EMAIL_KEY, send_email
    except Exception:
        return False
    if not EMAIL_KEY:
        return False
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "email": 1, "full_name": 1})
    if not user or not user.get("email"):
        return False
    prefs = await get_prefs(db, user_id)
    cat = (prefs.get("categories") or {}).get("home") or {}
    if not cat.get("enabled", True) or not cat.get("email", True):
        return False
    link = f"{APP_PUBLIC_URL}{path}"
    name = escape((user.get("full_name") or "there").split(" ")[0])
    html = (
        '<div style="font-family:Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111">'
        f'<p style="margin:0 0 12px;font-size:14px;color:#5C5C59">Hi {name},</p>'
        f'<h1 style="margin:0 0 8px;font-size:22px">{escape(headline)}</h1>'
        f'<p style="margin:0 0 20px;font-size:15px;line-height:22px">{escape(body)}</p>'
        f'<p style="margin:0 0 24px"><a href="{link}" style="display:inline-block;background:#E11B22;color:#FFFFFF;font-weight:700;font-size:14px;padding:12px 18px;border-radius:999px;text-decoration:none">Open in My Home</a></p>'
        '<p style="margin:0;font-size:12px;color:#8A8A85">AMASS reminds you — it never takes payments for your bills. Manage reminders under My Home or Notification preferences.</p>'
        "</div>"
    )
    try:
        await send_email(to=user["email"], subject=subject, html=html)
        return True
    except Exception as e:  # never block the sweep
        logger.warning("home reminder email failed: %s", e)
        return False


async def _remind(db, *, key: str, user_id: str, kind: str, title: str, body: str, meta: dict, path: str, email_subject: str) -> bool:
    """One reminder per key across restarts: in-app + push via emit, plus email. Returns True when newly sent."""
    try:
        await db.hh_reminder_log.insert_one({"key": key, "user_id": user_id, "kind": kind, "sent_at": iso(now_utc())})
    except Exception:
        return False  # already sent
    try:
        from notification_center import emit

        await emit(db, user_id, kind, title, body, meta, category="home", dedupe_key=key, action_url=path)
    except Exception as e:
        logger.warning("home reminder emit failed: %s", e)
    await _email_reminder(db, user_id, email_subject, title, body, path)
    return True


def _when(due: date, today: date) -> str:
    d = (due - today).days
    if d == 0:
        return "today"
    if d == 1:
        return "tomorrow"
    if d == -1:
        return "yesterday"
    if d < 0:
        return f"{-d} days ago"
    return f"in {d} days ({due.strftime('%a %d %b')})"


async def run_home_reminders(db: AsyncIOMotorDatabase, today: Optional[date] = None) -> dict:
    today = today or today_local()
    sent = {"bills": 0, "repairs": 0, "records": 0, "items": 0}

    async for b in db.hh_bills.find({"archived": {"$ne": True}}, {"_id": 0}):
        due = parse_day(b.get("next_due"))
        if not due or ((b.get("schedule") or {}).get("freq") == "once" and b.get("paid_at")):
            continue
        amount = naira(b.get("amount")) if b.get("amount") else ""
        label = f"{b['name']}{' · ' + amount if amount else ''}"
        path = f"/home/bills/{b['id']}"
        meta = {"bill_id": b["id"], "home_id": b.get("home_id"), "due": b.get("next_due"), "target_type": "bill", "target_id": b["id"]}
        for off in sorted({int(x) for x in (b.get("reminders") or [])}):
            if due - timedelta(days=off) == today:
                title = f"{b['name']} is due {'today' if off == 0 else _when(due, today)}"
                if await _remind(db, key=f"home:bill:{b['id']}:{due.isoformat()}:{off}", user_id=b["user_id"], kind="HOME_BILL_DUE", title=title, body=f"{label}. Tap to mark it paid or attach the receipt.", meta=meta, path=path, email_subject=f"Reminder: {label} due {'today' if off == 0 else _when(due, today)}"):
                    sent["bills"] += 1
        if due < today and (today - due).days in (1, 7, 30):
            if await _remind(db, key=f"home:bill:{b['id']}:{due.isoformat()}:overdue{(today - due).days}", user_id=b["user_id"], kind="HOME_BILL_OVERDUE", title=f"Overdue: {b['name']}", body=f"{label} was due {_when(due, today)}. Mark it paid once you've settled it.", meta=meta, path=path, email_subject=f"Overdue: {label}"):
                sent["bills"] += 1

    async for r in db.hh_repairs.find({"archived": {"$ne": True}, "next_due": {"$ne": None}}, {"_id": 0}):
        due = parse_day(r.get("next_due"))
        if not due:
            continue
        path = f"/home/repairs/{r['id']}"
        meta = {"repair_id": r["id"], "home_id": r.get("home_id"), "due": r.get("next_due"), "target_type": "repair", "target_id": r["id"]}
        for off in sorted({int(x) for x in (r.get("reminders") or [])}):
            if due - timedelta(days=off) == today:
                if await _remind(db, key=f"home:repair:{r['id']}:{due.isoformat()}:{off}", user_id=r["user_id"], kind="HOME_REPAIR_DUE", title=f"Maintenance due {'today' if off == 0 else _when(due, today)}: {r['title']}", body=f"{r.get('trade') or 'Repair'} · book a FIXA pro or mark it done.", meta=meta, path=path, email_subject=f"Maintenance due: {r['title']}"):
                    sent["repairs"] += 1
        if due < today and (today - due).days in (1, 7, 30):
            if await _remind(db, key=f"home:repair:{r['id']}:{due.isoformat()}:overdue{(today - due).days}", user_id=r["user_id"], kind="HOME_REPAIR_OVERDUE", title=f"Overdue maintenance: {r['title']}", body=f"Was due {_when(due, today)}. Book a FIXA pro or mark it done.", meta=meta, path=path, email_subject=f"Overdue maintenance: {r['title']}"):
                sent["repairs"] += 1

    async for rec in db.hh_records.find({"expires_at": {"$ne": None}}, {"_id": 0}):
        exp = parse_day(rec.get("expires_at"))
        if not exp:
            continue
        for off in sorted({int(x) for x in (rec.get("expiry_reminders") or [])}):
            if exp - timedelta(days=off) == today:
                if await _remind(db, key=f"home:record:{rec['id']}:{exp.isoformat()}:{off}", user_id=rec["user_id"], kind="HOME_RECORD_EXPIRY", title=f"{rec['title']} expires {'today' if off == 0 else _when(exp, today)}", body="Renew it in time and upload the new copy to Records.", meta={"record_id": rec["id"], "home_id": rec.get("home_id"), "target_type": "record", "target_id": rec["id"]}, path=f"/home/records/{rec['id']}", email_subject=f"Expiring: {rec['title']}"):
                    sent["records"] += 1

    async for it in db.hh_items.find({"warranty_until": {"$ne": None}}, {"_id": 0}):
        w = parse_day(it.get("warranty_until"))
        if not w:
            continue
        for off in sorted({int(x) for x in (it.get("warranty_reminders") or [])}):
            if w - timedelta(days=off) == today:
                if await _remind(db, key=f"home:item:{it['id']}:{w.isoformat()}:{off}", user_id=it["user_id"], kind="HOME_WARRANTY_EXPIRY", title=f"Warranty on {it['name']} ends {'today' if off == 0 else _when(w, today)}", body="Check the item while the warranty still covers repairs or replacement.", meta={"item_id": it["id"], "home_id": it.get("home_id"), "target_type": "item", "target_id": it["id"]}, path=f"/home/items/{it['id']}", email_subject=f"Warranty ending: {it['name']}"):
                    sent["items"] += 1
    return sent


async def start_home_hub(db: AsyncIOMotorDatabase, *, interval_s: int = 1800, first_delay_s: int = 60) -> None:
    try:
        await ensure_home_hub_indexes(db)
    except Exception as e:
        logger.warning("home hub indexes failed: %s", e)

    async def _loop():
        await asyncio.sleep(first_delay_s)
        while True:
            try:
                out = await run_home_reminders(db)
                if any(out.values()):
                    logger.info("home reminders: %s", out)
            except Exception as e:
                logger.warning("home reminder sweep failed: %s", e)
            await asyncio.sleep(interval_s)

    asyncio.create_task(_loop())


# ─── Routes ───────────────────────────────────────────────────────────────
def register_home_hub_routes(db: AsyncIOMotorDatabase, get_current_user, require_admin) -> APIRouter:
    router = APIRouter(prefix="/api/home", tags=["home-hub"])

    def _uid(user: dict) -> str:
        return user["id"]

    async def _home_or_404(user: dict, home_id: str) -> dict:
        h = await db.hh_homes.find_one({"id": home_id, "user_id": _uid(user)}, {"_id": 0})
        if not h:
            raise HTTPException(404, "Home not found")
        return h

    async def _ensure_default_home(user: dict) -> list[dict]:
        homes = await db.hh_homes.find({"user_id": _uid(user)}, {"_id": 0}).sort("created_at", 1).to_list(50)
        if homes:
            return homes
        doc = {
            "id": str(uuid.uuid4()),
            "user_id": _uid(user),
            "name": "My home",
            "address": user.get("city") or None,
            "kind": "flat",
            "color": HOME_COLORS[0],
            "is_default": True,
            "created_at": iso(now_utc()),
        }
        await db.hh_homes.insert_one(dict(doc))
        return [doc]

    def _scope(user: dict, home_id: Optional[str]) -> dict:
        q: dict[str, Any] = {"user_id": _uid(user)}
        if home_id and home_id != "all":
            q["home_id"] = home_id
        return q

    async def _check_file(user: dict, f: Optional[FileRef]) -> Optional[dict]:
        if f is None:
            return None
        if not f.path.startswith(f"amass/uploads/{_uid(user)}/"):
            raise HTTPException(403, "That file doesn't belong to you")
        return f.model_dump()

    async def _existing(coll, user: dict, cid: Optional[str]) -> Optional[dict]:
        if not cid:
            return None
        row = await coll.find_one({"id": cid}, {"_id": 0})
        if row and row.get("user_id") != _uid(user):
            raise HTTPException(409, "Id already in use")
        return row

    # ── Catalog ──
    @router.get("/catalog")
    async def catalog(user: dict = Depends(get_current_user)):
        return {
            "bill_categories": BILL_CATEGORIES,
            "record_folders": RECORD_FOLDERS,
            "rooms": ROOMS,
            "repair_trades": REPAIR_TRADES,
            "home_colors": HOME_COLORS,
            "home_kinds": ["flat", "house", "duplex", "land", "office", "shop", "other"],
            "default_reminders": {"bill": DEFAULT_BILL_REMINDERS, "expiry": DEFAULT_EXPIRY_REMINDERS, "warranty": DEFAULT_WARRANTY_REMINDERS},
            "due_soon_days": DUE_SOON_DAYS,
            "today": today_local().isoformat(),
        }

    # ── Homes ──
    @router.get("/homes")
    async def list_homes(user: dict = Depends(get_current_user)):
        return {"items": await _ensure_default_home(user)}

    @router.post("/homes", status_code=201)
    async def create_home(body: HomeIn, user: dict = Depends(get_current_user)):
        if existing := await _existing(db.hh_homes, user, body.id):
            return existing
        count = await db.hh_homes.count_documents({"user_id": _uid(user)})
        if count >= 20:
            raise HTTPException(400, "You can track up to 20 homes")
        doc = {
            "id": body.id or str(uuid.uuid4()),
            "user_id": _uid(user),
            "name": body.name.strip(),
            "address": (body.address or "").strip() or None,
            "kind": body.kind,
            "color": body.color if body.color in HOME_COLORS else HOME_COLORS[count % len(HOME_COLORS)],
            "is_default": body.is_default or count == 0,
            "created_at": iso(now_utc()),
        }
        if doc["is_default"]:
            await db.hh_homes.update_many({"user_id": _uid(user)}, {"$set": {"is_default": False}})
        await db.hh_homes.insert_one(dict(doc))
        return doc

    @router.put("/homes/{home_id}")
    async def update_home(home_id: str, body: HomeIn, user: dict = Depends(get_current_user)):
        await _home_or_404(user, home_id)
        upd = {"name": body.name.strip(), "address": (body.address or "").strip() or None, "kind": body.kind}
        if body.color in HOME_COLORS:
            upd["color"] = body.color
        if body.is_default:
            await db.hh_homes.update_many({"user_id": _uid(user)}, {"$set": {"is_default": False}})
            upd["is_default"] = True
        await db.hh_homes.update_one({"id": home_id}, {"$set": upd})
        return clean(await db.hh_homes.find_one({"id": home_id}))

    @router.delete("/homes/{home_id}")
    async def delete_home(home_id: str, force: bool = False, user: dict = Depends(get_current_user)):
        h = await _home_or_404(user, home_id)
        q = {"user_id": _uid(user), "home_id": home_id}
        content = sum([await c.count_documents(q) for c in (db.hh_bills, db.hh_records, db.hh_items, db.hh_repairs)])
        if content and not force:
            raise HTTPException(409, {"code": "HOME_NOT_EMPTY", "count": content, "message": f"This home still has {content} saved things. Delete them too?"})
        for c in (db.hh_bills, db.hh_records, db.hh_items, db.hh_repairs, db.hh_payments, db.hh_repair_logs):
            await c.delete_many(q)
        await db.hh_homes.delete_one({"id": home_id})
        if h.get("is_default"):
            nxt = await db.hh_homes.find_one({"user_id": _uid(user)}, {"_id": 0, "id": 1}, sort=[("created_at", 1)])
            if nxt:
                await db.hh_homes.update_one({"id": nxt["id"]}, {"$set": {"is_default": True}})
        return {"ok": True}

    # ── Overview / badge / calendar ──
    async def _next_due(user: dict, home_id: Optional[str], today: date, limit: int = 3) -> list[dict]:
        out: list[dict] = []
        q = _scope(user, home_id)
        async for b in db.hh_bills.find({**q, "archived": {"$ne": True}}, {"_id": 0}):
            sb = shape_bill(b, today)
            if sb["status"] in ("paid", "archived") and (b.get("schedule") or {}).get("freq") == "once":
                continue
            out.append({"type": "bill", "id": b["id"], "title": b["name"], "subtitle": naira(b.get("amount")) or sb["schedule_label"], "date": b.get("next_due"), "status": sb["status"], "amount": b.get("amount"), "category": b.get("category"), "home_id": b.get("home_id"), "path": f"/home/bills/{b['id']}"})
        async for r in db.hh_repairs.find({**q, "archived": {"$ne": True}, "next_due": {"$ne": None}}, {"_id": 0}):
            sr = shape_repair(r, today)
            out.append({"type": "repair", "id": r["id"], "title": r["title"], "subtitle": r.get("trade") or "Maintenance", "date": r.get("next_due"), "status": sr["status"], "trade": r.get("trade"), "home_id": r.get("home_id"), "path": f"/home/repairs/{r['id']}"})
        async for rec in db.hh_records.find({**q, "expires_at": {"$ne": None}}, {"_id": 0}):
            exp = parse_day(rec.get("expires_at"))
            if exp and -7 <= (exp - today).days <= 60:
                out.append({"type": "record", "id": rec["id"], "title": f"{rec['title']} expires", "subtitle": "Document", "date": rec["expires_at"], "status": status_for(exp, today), "home_id": rec.get("home_id"), "path": f"/home/records/{rec['id']}"})
        async for it in db.hh_items.find({**q, "warranty_until": {"$ne": None}}, {"_id": 0}):
            w = parse_day(it.get("warranty_until"))
            if w and -7 <= (w - today).days <= 60:
                out.append({"type": "item", "id": it["id"], "title": f"{it['name']} warranty ends", "subtitle": it.get("room") or "Item", "date": it["warranty_until"], "status": status_for(w, today), "home_id": it.get("home_id"), "path": f"/home/items/{it['id']}"})
        rank = {"overdue": 0, "due_soon": 1, "upcoming": 2, "paid": 3, "done": 3}
        out.sort(key=lambda x: (x["date"] or "9999", rank.get(x["status"], 4)))
        return out[:limit]

    async def _month_totals(user: dict, home_id: Optional[str], today: date) -> dict:
        first = today.replace(day=1)
        last = today.replace(day=calendar.monthrange(today.year, today.month)[1])
        q = _scope(user, home_id)
        due_total = 0.0
        overdue_total = 0.0
        async for b in db.hh_bills.find({**q, "archived": {"$ne": True}}, {"_id": 0}):
            sched = b.get("schedule") or {"freq": "once"}
            if sched.get("freq") == "once" and b.get("paid_at"):
                continue
            d = parse_day(b.get("next_due"))
            if not d:
                continue
            amt = float(b.get("amount") or 0)
            if d < first:
                overdue_total += amt
                continue
            guard = 0
            while d <= last and guard < 62:
                due_total += amt
                guard += 1
                if sched.get("freq") == "once":
                    break
                d = advance(d, sched, b.get("anchor_day"))
        paid_total = 0.0
        async for p in db.hh_payments.find({**q, "paid_at": {"$gte": first.isoformat(), "$lte": last.isoformat() + "T23:59:59"}}, {"_id": 0, "amount": 1}):
            paid_total += float(p.get("amount") or 0)
        return {"label": today.strftime("%B %Y"), "due_total": due_total, "paid_total": paid_total, "overdue_total": overdue_total, "from": first.isoformat(), "to": last.isoformat()}

    @router.get("/overview")
    async def overview(home_id: Optional[str] = None, user: dict = Depends(get_current_user)):
        today = today_local()
        homes = await _ensure_default_home(user)
        ids = {h["id"] for h in homes}
        if home_id and home_id != "all" and home_id not in ids:
            home_id = None
        selected = home_id or next((h["id"] for h in homes if h.get("is_default")), homes[0]["id"])
        q = _scope(user, selected)
        counts = {
            "bills": await db.hh_bills.count_documents({**q, "archived": {"$ne": True}}),
            "records": await db.hh_records.count_documents(q),
            "items": await db.hh_items.count_documents(q),
            "repairs": await db.hh_repairs.count_documents({**q, "archived": {"$ne": True}}),
            "saved": await db.favorites.count_documents({"user_id": _uid(user)}),
        }
        overdue = 0
        due_soon = 0
        by_type = {"bills": {"overdue": 0, "due_soon": 0}, "repairs": {"overdue": 0, "due_soon": 0}}
        async for b in db.hh_bills.find({**q, "archived": {"$ne": True}}, {"_id": 0}):
            s = shape_bill(b, today)["status"]
            overdue += s == "overdue"
            due_soon += s == "due_soon"
            by_type["bills"]["overdue"] += s == "overdue"
            by_type["bills"]["due_soon"] += s == "due_soon"
        async for r in db.hh_repairs.find({**q, "archived": {"$ne": True}, "next_due": {"$ne": None}}, {"_id": 0}):
            s = shape_repair(r, today)["status"]
            overdue += s == "overdue"
            due_soon += s == "due_soon"
            by_type["repairs"]["overdue"] += s == "overdue"
            by_type["repairs"]["due_soon"] += s == "due_soon"
        return {
            "today": today.isoformat(),
            "homes": homes,
            "home_id": selected,
            "home": next((h for h in homes if h["id"] == selected), None),
            "next_due": await _next_due(user, selected, today),
            "counts": counts,
            "attention": {"overdue": overdue, "due_soon": due_soon, **by_type},
            "month": await _month_totals(user, selected, today),
        }

    @router.get("/badge")
    async def badge(user: dict = Depends(get_current_user)):
        today = today_local()
        n = 0
        async for b in db.hh_bills.find({"user_id": _uid(user), "archived": {"$ne": True}}, {"_id": 0}):
            s = shape_bill(b, today)
            if s["status"] == "overdue" or (s["status"] == "due_soon" and s["days_until"] == 0):
                n += 1
        async for r in db.hh_repairs.find({"user_id": _uid(user), "archived": {"$ne": True}, "next_due": {"$ne": None}}, {"_id": 0}):
            s = shape_repair(r, today)
            if s["status"] == "overdue" or (s["status"] == "due_soon" and s["days_until"] == 0):
                n += 1
        return {"count": n}

    @router.get("/calendar")
    async def calendar_view(month: Optional[str] = Query(None, pattern=r"^\d{4}-\d{2}$"), home_id: Optional[str] = None, user: dict = Depends(get_current_user)):
        today = today_local()
        if month:
            y, m = int(month[:4]), int(month[5:7])
        else:
            y, m = today.year, today.month
        first = date(y, m, 1)
        last = date(y, m, calendar.monthrange(y, m)[1])
        q = _scope(user, home_id)
        events: list[dict] = []

        async for b in db.hh_bills.find({**q, "archived": {"$ne": True}}, {"_id": 0}):
            sched = b.get("schedule") or {"freq": "once"}
            once = sched.get("freq") == "once"
            d = parse_day(b.get("next_due"))
            if not d or (once and b.get("paid_at")):
                continue
            if d < first and d < today and first <= today <= last:
                # still-overdue bill from an earlier month shows on today's cell so it isn't forgotten
                events.append({"type": "bill", "id": b["id"], "title": b["name"], "subtitle": f"Overdue · was due {d.strftime('%d %b')}", "date": today.isoformat(), "status": "overdue", "amount": b.get("amount"), "category": b.get("category"), "home_id": b.get("home_id"), "path": f"/home/bills/{b['id']}"})
            guard = 0
            while d <= last and guard < 62:
                if d >= first:
                    events.append({"type": "bill", "id": b["id"], "title": b["name"], "subtitle": naira(b.get("amount")) or schedule_label(sched), "date": d.isoformat(), "status": status_for(d, today, paid_cycle=bool(b.get("last_paid_at")) and not once and guard == 0), "amount": b.get("amount"), "category": b.get("category"), "home_id": b.get("home_id"), "path": f"/home/bills/{b['id']}"})
                if once:
                    break
                d = advance(d, sched, b.get("anchor_day"))
                guard += 1

        async for p in db.hh_payments.find({**q, "paid_at": {"$gte": first.isoformat(), "$lte": last.isoformat() + "T23:59:59"}}, {"_id": 0}):
            events.append({"type": "payment", "id": p["id"], "title": f"Paid · {p.get('bill_name') or 'Bill'}", "subtitle": naira(p.get("amount")), "date": str(p["paid_at"])[:10], "status": "paid", "amount": p.get("amount"), "bill_id": p.get("bill_id"), "home_id": p.get("home_id"), "path": f"/home/bills/{p.get('bill_id')}"})

        async for r in db.hh_repairs.find({**q, "archived": {"$ne": True}, "next_due": {"$ne": None}}, {"_id": 0}):
            sched = r.get("schedule") or {"freq": "once"}
            d = parse_day(r.get("next_due"))
            if not d:
                continue
            guard = 0
            while d <= last and guard < 62:
                if d >= first:
                    events.append({"type": "repair", "id": r["id"], "title": r["title"], "subtitle": r.get("trade") or "Maintenance", "date": d.isoformat(), "status": status_for(d, today), "trade": r.get("trade"), "home_id": r.get("home_id"), "path": f"/home/repairs/{r['id']}"})
                if sched.get("freq") == "once":
                    break
                d = advance(d, sched)
                guard += 1

        async for lg in db.hh_repair_logs.find({**q, "date": {"$gte": first.isoformat(), "$lte": last.isoformat()}}, {"_id": 0}):
            events.append({"type": "repair_done", "id": lg["id"], "title": f"Done · {lg.get('repair_title') or 'Repair'}", "subtitle": naira(lg.get("cost")) or "Completed", "date": lg["date"], "status": "done", "repair_id": lg.get("repair_id"), "home_id": lg.get("home_id"), "path": f"/home/repairs/{lg.get('repair_id')}"})

        async for rec in db.hh_records.find({**q, "expires_at": {"$gte": first.isoformat(), "$lte": last.isoformat()}}, {"_id": 0}):
            d = parse_day(rec["expires_at"])
            events.append({"type": "record", "id": rec["id"], "title": f"{rec['title']} expires", "subtitle": "Document", "date": rec["expires_at"], "status": status_for(d, today), "home_id": rec.get("home_id"), "path": f"/home/records/{rec['id']}"})

        async for it in db.hh_items.find({**q, "warranty_until": {"$gte": first.isoformat(), "$lte": last.isoformat()}}, {"_id": 0}):
            d = parse_day(it["warranty_until"])
            events.append({"type": "item", "id": it["id"], "title": f"{it['name']} warranty ends", "subtitle": it.get("room") or "Item", "date": it["warranty_until"], "status": status_for(d, today), "home_id": it.get("home_id"), "path": f"/home/items/{it['id']}"})

        rank = {"overdue": 0, "due_soon": 1, "upcoming": 2, "paid": 3, "done": 3}
        events.sort(key=lambda e: (e["date"], rank.get(e["status"], 4), e["title"]))
        days: dict[str, list[str]] = {}
        for e in events:
            days.setdefault(e["date"], [])
            if e["status"] not in days[e["date"]]:
                days[e["date"]].append(e["status"])
        return {"month": f"{y:04d}-{m:02d}", "today": today.isoformat(), "events": events, "days": days}

    # ── Bills ──
    @router.get("/bills")
    async def list_bills(home_id: Optional[str] = None, status: Optional[str] = None, include_archived: bool = False, user: dict = Depends(get_current_user)):
        today = today_local()
        q = _scope(user, home_id)
        if not include_archived:
            q["archived"] = {"$ne": True}
        rows = [shape_bill(b, today) for b in await db.hh_bills.find(q, {"_id": 0}).to_list(500)]
        if status:
            rows = [r for r in rows if r["status"] == status]
        rank = {"overdue": 0, "due_soon": 1, "upcoming": 2, "paid": 3, "archived": 4}
        rows.sort(key=lambda r: (rank.get(r["status"], 5), r.get("next_due") or "9999"))
        summary = {k: sum(1 for r in rows if r["status"] == k) for k in ("overdue", "due_soon", "upcoming", "paid")}
        return {"items": rows, "count": len(rows), "summary": summary, "today": today.isoformat()}

    def _bill_doc(user: dict, body: BillIn, existing: Optional[dict] = None) -> dict:
        due = parse_day(body.due_date)
        if body.category not in {c["key"] for c in BILL_CATEGORIES}:
            body.category = "other"
        reminders = sorted({int(x) for x in body.reminders if 0 <= int(x) <= 60}, reverse=True)
        doc = {
            "id": (existing or {}).get("id") or body.id or str(uuid.uuid4()),
            "user_id": _uid(user),
            "home_id": body.home_id,
            "name": body.name.strip(),
            "category": body.category,
            "amount": float(body.amount or 0),
            "currency": "NGN",
            "due_date": due.isoformat(),
            "next_due": due.isoformat(),
            "anchor_day": due.day,
            "schedule": body.schedule.model_dump(),
            "reminders": reminders,
            "payee": (body.payee or "").strip() or None,
            "notes": (body.notes or "").strip() or None,
            "archived": False,
            "paid_at": None,
            "last_paid_at": (existing or {}).get("last_paid_at"),
            "paid_count": (existing or {}).get("paid_count", 0),
            "created_at": (existing or {}).get("created_at") or iso(now_utc()),
            "updated_at": iso(now_utc()),
        }
        if existing:
            # Editing keeps the paid state and the current cycle unless the due date actually changed.
            if existing.get("due_date") == doc["due_date"]:
                doc["next_due"] = existing.get("next_due") or doc["next_due"]
            doc["paid_at"] = existing.get("paid_at") if existing.get("due_date") == doc["due_date"] else None
            doc["archived"] = bool(existing.get("archived"))
        return doc

    @router.post("/bills", status_code=201)
    async def create_bill(body: BillIn, user: dict = Depends(get_current_user)):
        await _home_or_404(user, body.home_id)
        if existing := await _existing(db.hh_bills, user, body.id):
            return shape_bill(existing, today_local())
        doc = _bill_doc(user, body)
        await db.hh_bills.insert_one(dict(doc))
        return shape_bill(doc, today_local())

    @router.get("/bills/{bill_id}")
    async def get_bill(bill_id: str, user: dict = Depends(get_current_user)):
        b = await db.hh_bills.find_one({"id": bill_id, "user_id": _uid(user)}, {"_id": 0})
        if not b:
            raise HTTPException(404, "Bill not found")
        today = today_local()
        payments = await db.hh_payments.find({"bill_id": bill_id, "user_id": _uid(user)}, {"_id": 0}).sort("paid_at", -1).to_list(200)
        records = [shape_record(r, today) for r in await db.hh_records.find({"bill_id": bill_id, "user_id": _uid(user)}, {"_id": 0}).sort("created_at", -1).to_list(200)]
        out = shape_bill(b, today)
        out["payments"] = payments
        out["records"] = records
        out["home"] = clean(await db.hh_homes.find_one({"id": b["home_id"]}))
        return out

    @router.put("/bills/{bill_id}")
    async def update_bill(bill_id: str, body: BillIn, user: dict = Depends(get_current_user)):
        b = await db.hh_bills.find_one({"id": bill_id, "user_id": _uid(user)}, {"_id": 0})
        if not b:
            raise HTTPException(404, "Bill not found")
        await _home_or_404(user, body.home_id)
        doc = _bill_doc(user, body, existing=b)
        await db.hh_bills.replace_one({"id": bill_id}, doc)
        return shape_bill(doc, today_local())

    @router.post("/bills/{bill_id}/archive")
    async def archive_bill(bill_id: str, restore: bool = False, user: dict = Depends(get_current_user)):
        r = await db.hh_bills.update_one({"id": bill_id, "user_id": _uid(user)}, {"$set": {"archived": not restore, "updated_at": iso(now_utc())}})
        if not r.matched_count:
            raise HTTPException(404, "Bill not found")
        return {"ok": True, "archived": not restore}

    @router.delete("/bills/{bill_id}")
    async def delete_bill(bill_id: str, user: dict = Depends(get_current_user)):
        r = await db.hh_bills.delete_one({"id": bill_id, "user_id": _uid(user)})
        if not r.deleted_count:
            raise HTTPException(404, "Bill not found")
        await db.hh_payments.delete_many({"bill_id": bill_id, "user_id": _uid(user)})
        await db.hh_records.update_many({"bill_id": bill_id, "user_id": _uid(user)}, {"$set": {"bill_id": None, "payment_id": None}})
        return {"ok": True}

    @router.post("/bills/{bill_id}/pay")
    async def pay_bill(bill_id: str, body: PayIn, user: dict = Depends(get_current_user)):
        b = await db.hh_bills.find_one({"id": bill_id, "user_id": _uid(user)}, {"_id": 0})
        if not b:
            raise HTTPException(404, "Bill not found")
        today = today_local()
        sched = b.get("schedule") or {"freq": "once"}
        once = sched.get("freq") == "once"
        if once and b.get("paid_at"):
            raise HTTPException(409, "This bill is already marked paid")
        paid_at = body.paid_at or iso(now_utc())
        period_due = b.get("next_due")
        payment = {
            "id": str(uuid.uuid4()),
            "user_id": _uid(user),
            "home_id": b["home_id"],
            "bill_id": bill_id,
            "bill_name": b["name"],
            "amount": float(body.amount if body.amount is not None else (b.get("amount") or 0)),
            "paid_at": paid_at,
            "period_due": period_due,
            "note": (body.note or "").strip() or None,
            "record_id": body.record_id,
            "created_at": iso(now_utc()),
        }
        receipt = None
        if body.receipt:
            f = await _check_file(user, body.receipt)
            receipt = {
                "id": str(uuid.uuid4()),
                "user_id": _uid(user),
                "home_id": b["home_id"],
                "title": f"{b['name']} receipt · {str(paid_at)[:10]}",
                "folder": "receipts",
                "file": f,
                "notes": None,
                "expires_at": None,
                "expiry_reminders": [],
                "bill_id": bill_id,
                "payment_id": payment["id"],
                "item_id": None,
                "repair_id": None,
                "created_at": iso(now_utc()),
                "updated_at": iso(now_utc()),
            }
            await db.hh_records.insert_one(dict(receipt))
            payment["record_id"] = receipt["id"]
        elif body.record_id:
            await db.hh_records.update_one({"id": body.record_id, "user_id": _uid(user)}, {"$set": {"bill_id": bill_id, "payment_id": payment["id"], "folder": "receipts"}})
        await db.hh_payments.insert_one(dict(payment))

        upd: dict[str, Any] = {"last_paid_at": paid_at, "updated_at": iso(now_utc())}
        if once:
            upd["paid_at"] = paid_at
        else:
            nd = parse_day(period_due) or today
            nd = advance(nd, sched, b.get("anchor_day"))
            guard = 0
            while nd < today and guard < 400:  # catching up a very late bill lands on the next real cycle
                nd = advance(nd, sched, b.get("anchor_day"))
                guard += 1
            upd["next_due"] = nd.isoformat()
        await db.hh_bills.update_one({"id": bill_id}, {"$set": upd, "$inc": {"paid_count": 1}})
        fresh = await db.hh_bills.find_one({"id": bill_id}, {"_id": 0})
        return {"ok": True, "bill": shape_bill(fresh, today), "payment": clean(payment), "receipt": clean(receipt) if receipt else None}

    @router.delete("/bills/{bill_id}/payments/{payment_id}")
    async def undo_payment(bill_id: str, payment_id: str, user: dict = Depends(get_current_user)):
        p = await db.hh_payments.find_one({"id": payment_id, "bill_id": bill_id, "user_id": _uid(user)}, {"_id": 0})
        if not p:
            raise HTTPException(404, "Payment not found")
        await db.hh_payments.delete_one({"id": payment_id})
        b = await db.hh_bills.find_one({"id": bill_id}, {"_id": 0})
        if b:
            upd: dict[str, Any] = {"updated_at": iso(now_utc())}
            sched = b.get("schedule") or {"freq": "once"}
            if sched.get("freq") == "once":
                upd["paid_at"] = None
            elif p.get("period_due") and p["period_due"] < (b.get("next_due") or "9999"):
                upd["next_due"] = p["period_due"]
            last = await db.hh_payments.find_one({"bill_id": bill_id}, {"_id": 0, "paid_at": 1}, sort=[("paid_at", -1)])
            upd["last_paid_at"] = last["paid_at"] if last else None
            await db.hh_bills.update_one({"id": bill_id}, {"$set": upd, "$inc": {"paid_count": -1}})
        await db.hh_records.update_many({"payment_id": payment_id}, {"$set": {"payment_id": None}})
        fresh = await db.hh_bills.find_one({"id": bill_id}, {"_id": 0})
        return {"ok": True, "bill": shape_bill(fresh, today_local()) if fresh else None}

    # ── Records ──
    @router.get("/records")
    async def list_records(home_id: Optional[str] = None, folder: Optional[str] = None, bill_id: Optional[str] = None, item_id: Optional[str] = None, repair_id: Optional[str] = None, q: Optional[str] = None, user: dict = Depends(get_current_user)):
        today = today_local()
        query = _scope(user, home_id)
        if folder:
            query["folder"] = folder
        if bill_id:
            query["bill_id"] = bill_id
        if item_id:
            query["item_id"] = item_id
        if repair_id:
            query["repair_id"] = repair_id
        rows = await db.hh_records.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
        if q:
            needle = q.strip().lower()
            rows = [r for r in rows if needle in (r.get("title") or "").lower() or needle in (r.get("notes") or "").lower()]
        folders: dict[str, int] = {}
        async for r in db.hh_records.find(_scope(user, home_id), {"_id": 0, "folder": 1}):
            folders[r.get("folder") or "other"] = folders.get(r.get("folder") or "other", 0) + 1
        return {"items": [shape_record(r, today) for r in rows], "count": len(rows), "folders": folders}

    def _record_doc(user: dict, body: RecordIn, file: Optional[dict], existing: Optional[dict] = None) -> dict:
        exp = parse_day(body.expires_at)
        folder = body.folder.strip() or "other"
        return {
            "id": (existing or {}).get("id") or body.id or str(uuid.uuid4()),
            "user_id": _uid(user),
            "home_id": body.home_id,
            "title": body.title.strip(),
            "folder": folder[:40],
            "file": file if file is not None else (existing or {}).get("file"),
            "notes": (body.notes or "").strip() or None,
            "expires_at": exp.isoformat() if exp else None,
            "expiry_reminders": sorted({int(x) for x in body.expiry_reminders if 0 <= int(x) <= 365}, reverse=True) if exp else [],
            "bill_id": body.bill_id,
            "payment_id": body.payment_id or (existing or {}).get("payment_id"),
            "item_id": body.item_id,
            "repair_id": body.repair_id,
            "created_at": (existing or {}).get("created_at") or iso(now_utc()),
            "updated_at": iso(now_utc()),
        }

    @router.post("/records", status_code=201)
    async def create_record(body: RecordIn, user: dict = Depends(get_current_user)):
        await _home_or_404(user, body.home_id)
        if existing := await _existing(db.hh_records, user, body.id):
            return shape_record(existing, today_local())
        doc = _record_doc(user, body, await _check_file(user, body.file))
        await db.hh_records.insert_one(dict(doc))
        return shape_record(doc, today_local())

    @router.get("/records/{record_id}")
    async def get_record(record_id: str, user: dict = Depends(get_current_user)):
        r = await db.hh_records.find_one({"id": record_id, "user_id": _uid(user)}, {"_id": 0})
        if not r:
            raise HTTPException(404, "Record not found")
        out = shape_record(r, today_local())
        if r.get("bill_id"):
            out["bill"] = clean(await db.hh_bills.find_one({"id": r["bill_id"]}, {"_id": 0, "id": 1, "name": 1, "amount": 1}))
        if r.get("item_id"):
            out["item"] = clean(await db.hh_items.find_one({"id": r["item_id"]}, {"_id": 0, "id": 1, "name": 1}))
        if r.get("repair_id"):
            out["repair"] = clean(await db.hh_repairs.find_one({"id": r["repair_id"]}, {"_id": 0, "id": 1, "title": 1}))
        return out

    @router.put("/records/{record_id}")
    async def update_record(record_id: str, body: RecordIn, user: dict = Depends(get_current_user)):
        r = await db.hh_records.find_one({"id": record_id, "user_id": _uid(user)}, {"_id": 0})
        if not r:
            raise HTTPException(404, "Record not found")
        await _home_or_404(user, body.home_id)
        doc = _record_doc(user, body, await _check_file(user, body.file), existing=r)
        await db.hh_records.replace_one({"id": record_id}, doc)
        return shape_record(doc, today_local())

    @router.delete("/records/{record_id}")
    async def delete_record(record_id: str, user: dict = Depends(get_current_user)):
        r = await db.hh_records.delete_one({"id": record_id, "user_id": _uid(user)})
        if not r.deleted_count:
            raise HTTPException(404, "Record not found")
        await db.hh_payments.update_many({"record_id": record_id}, {"$set": {"record_id": None}})
        return {"ok": True}

    # ── Items ──
    @router.get("/items")
    async def list_items(home_id: Optional[str] = None, room: Optional[str] = None, q: Optional[str] = None, user: dict = Depends(get_current_user)):
        today = today_local()
        query = _scope(user, home_id)
        if room:
            query["room"] = room
        rows = await db.hh_items.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
        if q:
            needle = q.strip().lower()
            rows = [r for r in rows if needle in (r.get("name") or "").lower() or needle in (r.get("brand") or "").lower()]
        total_value = sum(float(r.get("value") or r.get("price") or 0) for r in rows)
        rooms: dict[str, int] = {}
        for r in rows:
            rooms[r.get("room") or "Other"] = rooms.get(r.get("room") or "Other", 0) + 1
        return {"items": [shape_item(r, today) for r in rows], "count": len(rows), "total_value": total_value, "rooms": rooms}

    def _item_doc(user: dict, body: ItemIn, photo: Optional[dict], existing: Optional[dict] = None) -> dict:
        w = parse_day(body.warranty_until)
        p = parse_day(body.purchased_at)
        return {
            "id": (existing or {}).get("id") or body.id or str(uuid.uuid4()),
            "user_id": _uid(user),
            "home_id": body.home_id,
            "name": body.name.strip(),
            "room": body.room if body.room in ROOMS else (body.room.strip()[:40] or "Other"),
            "photo": photo if photo is not None else (existing or {}).get("photo"),
            "brand": (body.brand or "").strip() or None,
            "model": (body.model or "").strip() or None,
            "serial": (body.serial or "").strip() or None,
            "store": (body.store or "").strip() or None,
            "purchased_at": p.isoformat() if p else None,
            "price": body.price,
            "value": body.value if body.value is not None else body.price,
            "warranty_until": w.isoformat() if w else None,
            "warranty_reminders": sorted({int(x) for x in body.warranty_reminders if 0 <= int(x) <= 365}, reverse=True) if w else [],
            "notes": (body.notes or "").strip() or None,
            "created_at": (existing or {}).get("created_at") or iso(now_utc()),
            "updated_at": iso(now_utc()),
        }

    @router.post("/items", status_code=201)
    async def create_item(body: ItemIn, user: dict = Depends(get_current_user)):
        await _home_or_404(user, body.home_id)
        if existing := await _existing(db.hh_items, user, body.id):
            return shape_item(existing, today_local())
        doc = _item_doc(user, body, await _check_file(user, body.photo))
        await db.hh_items.insert_one(dict(doc))
        return shape_item(doc, today_local())

    @router.get("/items/{item_id}")
    async def get_item(item_id: str, user: dict = Depends(get_current_user)):
        it = await db.hh_items.find_one({"id": item_id, "user_id": _uid(user)}, {"_id": 0})
        if not it:
            raise HTTPException(404, "Item not found")
        today = today_local()
        out = shape_item(it, today)
        out["records"] = [shape_record(r, today) for r in await db.hh_records.find({"item_id": item_id, "user_id": _uid(user)}, {"_id": 0}).sort("created_at", -1).to_list(100)]
        out["repairs"] = [shape_repair(r, today) for r in await db.hh_repairs.find({"item_id": item_id, "user_id": _uid(user), "archived": {"$ne": True}}, {"_id": 0}).to_list(100)]
        return out

    @router.put("/items/{item_id}")
    async def update_item(item_id: str, body: ItemIn, user: dict = Depends(get_current_user)):
        it = await db.hh_items.find_one({"id": item_id, "user_id": _uid(user)}, {"_id": 0})
        if not it:
            raise HTTPException(404, "Item not found")
        await _home_or_404(user, body.home_id)
        doc = _item_doc(user, body, await _check_file(user, body.photo), existing=it)
        await db.hh_items.replace_one({"id": item_id}, doc)
        return shape_item(doc, today_local())

    @router.delete("/items/{item_id}")
    async def delete_item(item_id: str, user: dict = Depends(get_current_user)):
        r = await db.hh_items.delete_one({"id": item_id, "user_id": _uid(user)})
        if not r.deleted_count:
            raise HTTPException(404, "Item not found")
        await db.hh_records.update_many({"item_id": item_id, "user_id": _uid(user)}, {"$set": {"item_id": None}})
        await db.hh_repairs.update_many({"item_id": item_id, "user_id": _uid(user)}, {"$set": {"item_id": None}})
        return {"ok": True}

    # ── Repairs ──
    @router.get("/repairs")
    async def list_repairs(home_id: Optional[str] = None, status: Optional[str] = None, user: dict = Depends(get_current_user)):
        today = today_local()
        q = {**_scope(user, home_id), "archived": {"$ne": True}}
        rows = [shape_repair(r, today) for r in await db.hh_repairs.find(q, {"_id": 0}).to_list(500)]
        if status:
            rows = [r for r in rows if r["status"] == status]
        rank = {"overdue": 0, "due_soon": 1, "upcoming": 2, "done": 3, "none": 4}
        rows.sort(key=lambda r: (rank.get(r["status"], 5), r.get("next_due") or "9999"))
        summary = {k: sum(1 for r in rows if r["status"] == k) for k in ("overdue", "due_soon", "upcoming", "done", "none")}
        return {"items": rows, "count": len(rows), "summary": summary}

    def _repair_doc(user: dict, body: RepairIn, existing: Optional[dict] = None) -> dict:
        nd = parse_day(body.next_due)
        return {
            "id": (existing or {}).get("id") or body.id or str(uuid.uuid4()),
            "user_id": _uid(user),
            "home_id": body.home_id,
            "title": body.title.strip(),
            "trade": body.trade if body.trade in REPAIR_TRADES else (body.trade.strip()[:40] or "Handyman"),
            "schedule": body.schedule.model_dump(),
            "next_due": nd.isoformat() if nd else None,
            "reminders": sorted({int(x) for x in body.reminders if 0 <= int(x) <= 60}, reverse=True),
            "item_id": body.item_id,
            "provider_id": body.provider_id,
            "notes": (body.notes or "").strip() or None,
            "archived": bool((existing or {}).get("archived", False)),
            "last_done_at": (existing or {}).get("last_done_at"),
            "done_count": (existing or {}).get("done_count", 0),
            "total_cost": (existing or {}).get("total_cost", 0.0),
            "created_at": (existing or {}).get("created_at") or iso(now_utc()),
            "updated_at": iso(now_utc()),
        }

    @router.post("/repairs", status_code=201)
    async def create_repair(body: RepairIn, user: dict = Depends(get_current_user)):
        await _home_or_404(user, body.home_id)
        if existing := await _existing(db.hh_repairs, user, body.id):
            return shape_repair(existing, today_local())
        doc = _repair_doc(user, body)
        await db.hh_repairs.insert_one(dict(doc))
        return shape_repair(doc, today_local())

    @router.get("/repairs/{repair_id}")
    async def get_repair(repair_id: str, user: dict = Depends(get_current_user)):
        r = await db.hh_repairs.find_one({"id": repair_id, "user_id": _uid(user)}, {"_id": 0})
        if not r:
            raise HTTPException(404, "Repair not found")
        today = today_local()
        out = shape_repair(r, today)
        out["logs"] = await db.hh_repair_logs.find({"repair_id": repair_id, "user_id": _uid(user)}, {"_id": 0}).sort("date", -1).to_list(200)
        out["records"] = [shape_record(x, today) for x in await db.hh_records.find({"repair_id": repair_id, "user_id": _uid(user)}, {"_id": 0}).sort("created_at", -1).to_list(100)]
        if r.get("item_id"):
            out["item"] = clean(await db.hh_items.find_one({"id": r["item_id"]}, {"_id": 0, "id": 1, "name": 1, "room": 1, "photo": 1}))
        if r.get("provider_id"):
            out["provider"] = clean(await db.marketplace.find_one({"id": r["provider_id"]}, {"_id": 0, "id": 1, "name": 1, "seller_name": 1, "phone": 1, "whatsapp": 1, "subcategory": 1}))
        return out

    @router.put("/repairs/{repair_id}")
    async def update_repair(repair_id: str, body: RepairIn, user: dict = Depends(get_current_user)):
        r = await db.hh_repairs.find_one({"id": repair_id, "user_id": _uid(user)}, {"_id": 0})
        if not r:
            raise HTTPException(404, "Repair not found")
        await _home_or_404(user, body.home_id)
        doc = _repair_doc(user, body, existing=r)
        await db.hh_repairs.replace_one({"id": repair_id}, doc)
        return shape_repair(doc, today_local())

    @router.delete("/repairs/{repair_id}")
    async def delete_repair(repair_id: str, user: dict = Depends(get_current_user)):
        r = await db.hh_repairs.delete_one({"id": repair_id, "user_id": _uid(user)})
        if not r.deleted_count:
            raise HTTPException(404, "Repair not found")
        await db.hh_repair_logs.delete_many({"repair_id": repair_id, "user_id": _uid(user)})
        await db.hh_records.update_many({"repair_id": repair_id, "user_id": _uid(user)}, {"$set": {"repair_id": None}})
        return {"ok": True}

    @router.post("/repairs/{repair_id}/done")
    async def repair_done(repair_id: str, body: RepairDoneIn, user: dict = Depends(get_current_user)):
        r = await db.hh_repairs.find_one({"id": repair_id, "user_id": _uid(user)}, {"_id": 0})
        if not r:
            raise HTTPException(404, "Repair not found")
        today = today_local()
        done_on = parse_day(body.date) or today
        photos = [await _check_file(user, p) for p in body.photos[:6]]
        log = {
            "id": str(uuid.uuid4()),
            "user_id": _uid(user),
            "home_id": r["home_id"],
            "repair_id": repair_id,
            "repair_title": r["title"],
            "date": done_on.isoformat(),
            "cost": float(body.cost) if body.cost is not None else None,
            "notes": (body.notes or "").strip() or None,
            "photos": photos,
            "provider_name": (body.provider_name or "").strip() or None,
            "provider_id": body.provider_id or r.get("provider_id"),
            "fixa_booking_id": body.fixa_booking_id,
            "created_at": iso(now_utc()),
        }
        await db.hh_repair_logs.insert_one(dict(log))
        sched = r.get("schedule") or {"freq": "once"}
        upd: dict[str, Any] = {"last_done_at": done_on.isoformat(), "updated_at": iso(now_utc())}
        if sched.get("freq") == "once":
            upd["next_due"] = None
        else:
            # Maintenance intervals restart from the day the work was done.
            nd = advance(done_on, sched)
            guard = 0
            while nd <= today and guard < 400:
                nd = advance(nd, sched)
                guard += 1
            upd["next_due"] = nd.isoformat()
        await db.hh_repairs.update_one({"id": repair_id}, {"$set": upd, "$inc": {"done_count": 1, "total_cost": float(body.cost or 0)}})
        fresh = await db.hh_repairs.find_one({"id": repair_id}, {"_id": 0})
        return {"ok": True, "repair": shape_repair(fresh, today), "log": clean(log)}

    @router.delete("/repairs/{repair_id}/logs/{log_id}")
    async def delete_repair_log(repair_id: str, log_id: str, user: dict = Depends(get_current_user)):
        lg = await db.hh_repair_logs.find_one({"id": log_id, "repair_id": repair_id, "user_id": _uid(user)}, {"_id": 0})
        if not lg:
            raise HTTPException(404, "Entry not found")
        await db.hh_repair_logs.delete_one({"id": log_id})
        last = await db.hh_repair_logs.find_one({"repair_id": repair_id}, {"_id": 0, "date": 1}, sort=[("date", -1)])
        await db.hh_repairs.update_one({"id": repair_id}, {"$set": {"last_done_at": last["date"] if last else None}, "$inc": {"done_count": -1, "total_cost": -float(lg.get("cost") or 0)}})
        return {"ok": True}

    # ── Uploads (private; owner-only reads via /api/files) ──
    def _file_out(user: dict, path: str, name: Optional[str], content_type: str, size: int) -> dict:
        return {"path": path, "url": f"/api/files/{path}", "name": name, "content_type": content_type, "size": size}

    def _ext_for(content_type: str, name: Optional[str]) -> str:
        if name and "." in name:
            ext = name.rsplit(".", 1)[-1].lower()
            if 1 <= len(ext) <= 5 and ext.isalnum():
                return ext
        ct = (content_type or "").lower()
        return {"application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg", "image/webp": "webp", "image/heic": "heic"}.get(ct, "bin")

    @router.post("/uploads", status_code=201)
    async def upload_direct(body: DirectUploadIn, user: dict = Depends(get_current_user)):
        from object_storage import put_object

        s = body.data_url.strip()
        content_type = "application/octet-stream"
        if s.startswith("data:"):
            try:
                header, b64 = s.split(",", 1)
                content_type = header[len("data:"):].split(";", 1)[0] or content_type
                raw = base64.b64decode(b64)
            except Exception as e:
                raise HTTPException(400, f"Invalid data URL: {e}")
        else:
            try:
                raw = base64.b64decode(s)
            except Exception:
                raise HTTPException(400, "Invalid base64 payload")
        if len(raw) > MAX_UPLOAD:
            raise HTTPException(413, "File too large (max 12 MB)")
        path = f"amass/uploads/{_uid(user)}/home/{uuid.uuid4().hex}.{_ext_for(content_type, body.name)}"
        await put_object(path, raw, content_type)
        return _file_out(user, path, body.name, content_type, len(raw))

    @router.post("/uploads/start", status_code=201)
    async def upload_start(body: UploadStartIn, user: dict = Depends(get_current_user)):
        doc = {"id": str(uuid.uuid4()), "user_id": _uid(user), "name": body.name, "content_type": body.content_type, "size": body.size, "total_chunks": body.total_chunks, "created_at": now_utc()}
        await db.hh_uploads.insert_one(dict(doc))
        return {"upload_id": doc["id"], "received": []}

    @router.get("/uploads/{upload_id}")
    async def upload_status(upload_id: str, user: dict = Depends(get_current_user)):
        up = await db.hh_uploads.find_one({"id": upload_id, "user_id": _uid(user)}, {"_id": 0})
        if not up:
            raise HTTPException(404, "Upload not found or expired")
        received = [c["index"] async for c in db.hh_upload_chunks.find({"upload_id": upload_id}, {"_id": 0, "index": 1})]
        return {"upload_id": upload_id, "received": sorted(received), "total_chunks": up["total_chunks"]}

    @router.put("/uploads/{upload_id}/chunks/{index}")
    async def upload_chunk(upload_id: str, index: int, body: ChunkIn, user: dict = Depends(get_current_user)):
        up = await db.hh_uploads.find_one({"id": upload_id, "user_id": _uid(user)}, {"_id": 0})
        if not up:
            raise HTTPException(404, "Upload not found or expired")
        if not 0 <= index < up["total_chunks"]:
            raise HTTPException(400, "Chunk index out of range")
        await db.hh_upload_chunks.update_one({"upload_id": upload_id, "index": index}, {"$set": {"data": body.data, "at": now_utc()}}, upsert=True)
        received = await db.hh_upload_chunks.count_documents({"upload_id": upload_id})
        return {"ok": True, "received": received, "total_chunks": up["total_chunks"]}

    @router.post("/uploads/{upload_id}/complete")
    async def upload_complete(upload_id: str, user: dict = Depends(get_current_user)):
        from object_storage import put_object

        up = await db.hh_uploads.find_one({"id": upload_id, "user_id": _uid(user)}, {"_id": 0})
        if not up:
            raise HTTPException(404, "Upload not found or expired")
        chunks = await db.hh_upload_chunks.find({"upload_id": upload_id}, {"_id": 0}).sort("index", 1).to_list(100)
        if len(chunks) != up["total_chunks"]:
            missing = sorted(set(range(up["total_chunks"])) - {c["index"] for c in chunks})
            raise HTTPException(409, {"code": "CHUNKS_MISSING", "missing": missing})
        try:
            raw = b"".join(base64.b64decode(c["data"]) for c in chunks)
        except Exception:
            raise HTTPException(400, "Corrupt chunk data")
        if len(raw) > MAX_UPLOAD:
            raise HTTPException(413, "File too large (max 12 MB)")
        path = f"amass/uploads/{_uid(user)}/home/{uuid.uuid4().hex}.{_ext_for(up['content_type'], up.get('name'))}"
        await put_object(path, raw, up["content_type"] or "application/octet-stream")
        await db.hh_upload_chunks.delete_many({"upload_id": upload_id})
        await db.hh_uploads.delete_one({"id": upload_id})
        return _file_out(user, path, up.get("name"), up["content_type"], len(raw))

    # ── Admin / tests: run the reminder sweep now ──
    @router.post("/reminders/run")
    async def run_reminders_now(today: Optional[str] = None, user: dict = Depends(require_admin)):
        return await run_home_reminders(db, parse_day(today) if today else None)

    return router


# ─── Demo content (demo account only; idempotent) ─────────────────────────
async def seed_home_hub_demo(db: AsyncIOMotorDatabase, user: dict) -> None:
    if await db.hh_homes.count_documents({"user_id": user["id"]}):
        return
    today = today_local()
    home_id = str(uuid.uuid4())
    await db.hh_homes.insert_one({"id": home_id, "user_id": user["id"], "name": "Lekki flat", "address": "Admiralty Way, Lekki Phase 1, Lagos", "kind": "flat", "color": HOME_COLORS[0], "is_default": True, "created_at": iso(now_utc())})
    await db.hh_homes.insert_one({"id": str(uuid.uuid4()), "user_id": user["id"], "name": "Ikeja rental", "address": "Allen Avenue, Ikeja, Lagos", "kind": "house", "color": HOME_COLORS[5], "is_default": False, "created_at": iso(now_utc())})

    def bill(name: str, cat: str, amount: float, due: date, freq: str, reminders=None, last_paid: Optional[date] = None) -> dict:
        return {"id": str(uuid.uuid4()), "user_id": user["id"], "home_id": home_id, "name": name, "category": cat, "amount": amount, "currency": "NGN", "due_date": due.isoformat(), "next_due": due.isoformat(), "anchor_day": due.day, "schedule": {"freq": freq, "interval": 1, "unit": "months"}, "reminders": reminders or DEFAULT_BILL_REMINDERS, "payee": None, "notes": None, "archived": False, "paid_at": None, "last_paid_at": last_paid.isoformat() if last_paid else None, "paid_count": 1 if last_paid else 0, "created_at": iso(now_utc()), "updated_at": iso(now_utc())}

    bills = [
        bill("Electricity (EKEDC)", "electricity", 28000, today - timedelta(days=2), "monthly"),
        bill("Internet (Spectranet)", "internet", 19500, today + timedelta(days=3), "monthly"),
        bill("Estate dues", "estate_dues", 45000, today + timedelta(days=12), "monthly", last_paid=today - timedelta(days=18)),
        bill("Rent", "rent", 3_600_000, add_months(today, 4), "yearly", reminders=[30, 7, 0]),
        bill("Waste (LAWMA)", "waste", 4000, today + timedelta(days=20), "monthly"),
    ]
    await db.hh_bills.insert_many(bills)
    await db.hh_payments.insert_one({"id": str(uuid.uuid4()), "user_id": user["id"], "home_id": home_id, "bill_id": bills[2]["id"], "bill_name": "Estate dues", "amount": 45000, "paid_at": (today - timedelta(days=18)).isoformat() + "T10:00:00+00:00", "period_due": (today - timedelta(days=18)).isoformat(), "note": "Transfer to estate account", "record_id": None, "created_at": iso(now_utc())})

    items = [
        {"name": "Samsung 55\" TV", "room": "Living room", "brand": "Samsung", "price": 620000, "value": 450000, "purchased_at": add_months(today, -8).isoformat(), "warranty_until": add_months(today, 4).isoformat()},
        {"name": "LG Inverter AC (1.5HP)", "room": "Bedroom", "brand": "LG", "price": 480000, "value": 400000, "purchased_at": add_months(today, -14).isoformat(), "warranty_until": (today + timedelta(days=20)).isoformat()},
        {"name": "Hisense fridge", "room": "Kitchen", "brand": "Hisense", "price": 350000, "value": 300000, "purchased_at": add_months(today, -20).isoformat(), "warranty_until": None},
    ]
    await db.hh_items.insert_many([{"id": str(uuid.uuid4()), "user_id": user["id"], "home_id": home_id, "photo": None, "model": None, "serial": None, "store": None, "warranty_reminders": DEFAULT_WARRANTY_REMINDERS, "notes": None, "created_at": iso(now_utc()), "updated_at": iso(now_utc()), **i} for i in items])

    repairs = [
        {"title": "Service the AC", "trade": "AC Repair", "schedule": {"freq": "custom", "interval": 3, "unit": "months"}, "next_due": (today + timedelta(days=5)).isoformat(), "last_done_at": add_months(today, -3).isoformat(), "done_count": 1, "total_cost": 15000},
        {"title": "Generator oil change", "trade": "Generator", "schedule": {"freq": "monthly", "interval": 1, "unit": "months"}, "next_due": (today - timedelta(days=4)).isoformat(), "last_done_at": None, "done_count": 0, "total_cost": 0},
        {"title": "Fumigation", "trade": "Pest Control", "schedule": {"freq": "custom", "interval": 6, "unit": "months"}, "next_due": add_months(today, 2).isoformat(), "last_done_at": None, "done_count": 0, "total_cost": 0},
    ]
    await db.hh_repairs.insert_many([{"id": str(uuid.uuid4()), "user_id": user["id"], "home_id": home_id, "reminders": DEFAULT_BILL_REMINDERS, "item_id": None, "provider_id": None, "notes": None, "archived": False, "created_at": iso(now_utc()), "updated_at": iso(now_utc()), **r} for r in repairs])

    await db.hh_records.insert_one({"id": str(uuid.uuid4()), "user_id": user["id"], "home_id": home_id, "title": "Tenancy agreement 2026", "folder": "agreements", "file": None, "notes": "Signed copy with the landlord. Renewal due with the rent.", "expires_at": add_months(today, 4).isoformat(), "expiry_reminders": DEFAULT_EXPIRY_REMINDERS, "bill_id": bills[3]["id"], "payment_id": None, "item_id": None, "repair_id": None, "created_at": iso(now_utc()), "updated_at": iso(now_utc())})
