import os
import hmac
import asyncio
import logging
from datetime import datetime, timedelta
from html import escape
from typing import List
from zoneinfo import ZoneInfo
from fastapi import Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator

from server import api, db, require, log_activity, now_iso, new_id
from website_ext import _call, _ts, _label
from email_service import send_email, EMAIL_FROM_NAME, email_logo

logger = logging.getLogger("amass")
CRON_SECRET = os.environ["WEBHOOK_CRON_SECRET"]
DIGEST_TO = os.environ["DIGEST_TO_EMAIL"]
LAGOS = ZoneInfo("Africa/Lagos")
SLOW_HOURS = 24


async def _first_replies() -> dict:
    rows = await db.website_lead_replies.aggregate(
        [{"$group": {"_id": "$lead_id", "first": {"$min": "$sent_at"}, "count": {"$sum": 1}}}]).to_list(10000)
    return {r["_id"]: {"first": r["first"], "count": r["count"]} for r in rows}


def _hours(a: str, b) -> float:
    end = b if isinstance(b, datetime) else _ts(b)
    return max(0.0, (end - _ts(a)).total_seconds() / 3600)


def _fmt_hours(h) -> str:
    if h is None:
        return "-"
    if h < 1:
        return f"{max(1, round(h * 60))} min"
    return f"{round(h)}h" if h < 48 else f"{round(h / 24)}d"


def _tracking(leads: list, first: dict) -> dict:
    now = datetime.now(LAGOS)
    real = [l for l in leads if l.get("form_type") != "newsletter"]
    waiting = sorted([{**l, "waited": _hours(l.get("created_at"), now)} for l in real
                      if l.get("status") == "new" and l["id"] not in first], key=lambda l: -l["waited"])
    week_ago = now - timedelta(days=7)
    recent = [_hours(l.get("created_at"), first[l["id"]]["first"]) for l in real
              if l["id"] in first and _ts(first[l["id"]]["first"]) >= week_ago]
    return {"overdue": [w for w in waiting if w["waited"] > SLOW_HOURS],
            "avg_7d": sum(recent) / len(recent) if recent else None,
            "replies_7d": len(recent), "slow_7d": sum(1 for h in recent if h > SLOW_HOURS)}

DEFAULT_TEMPLATES = [
    {"name": "Agent sign-up", "form_types": ["become_agent"], "body":
        "Thank you for applying to become an AMASS agent. We've received your details and our team is reviewing your application.\n\n"
        "We'll be in touch shortly with the next steps for verification. In the meantime, feel free to reply to this email with any questions."},
    {"name": "Demo booking", "form_types": ["book_demo"], "body":
        "Thank you for booking a demo of AMASS. We'd love to show you around.\n\n"
        "Please reply with two or three days and times that suit you, and we'll confirm a slot."},
    {"name": "Property listing", "form_types": ["list_property"], "body":
        "Thank you for submitting your property to AMASS. Our team will review the details you shared.\n\n"
        "We may get in touch for photos or documents needed for verification before the listing goes live."},
]


class TemplateInput(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    form_types: List[str] = []
    body: str = Field(min_length=1, max_length=5000)

    @field_validator("name", "body")
    @classmethod
    def not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Cannot be empty")
        return v.strip()


async def _seed_templates():
    res = await db.meta.update_one({"key": "reply_templates_seeded"},
                                   {"$setOnInsert": {"key": "reply_templates_seeded", "at": now_iso()}}, upsert=True)
    if res.upserted_id is None:
        return
    await db.website_reply_templates.insert_many(
        [{"id": new_id(), **t, "builtin": True, "created_at": now_iso()} for t in DEFAULT_TEMPLATES])


@api.get("/website/reply-templates")
async def list_templates(user: dict = Depends(require("leads"))):
    await _seed_templates()
    return await db.website_reply_templates.find({}, {"_id": 0}).sort("created_at", 1).to_list(200)


@api.post("/website/reply-templates")
async def create_template(body: TemplateInput, user: dict = Depends(require("leads", "edit"))):
    doc = {"id": new_id(), **body.model_dump(), "builtin": False, "created_at": now_iso()}
    await db.website_reply_templates.insert_one(dict(doc))
    await log_activity("Created reply template", "reply_template", user, body.name)
    return doc


@api.put("/website/reply-templates/{tid}")
async def update_template(tid: str, body: TemplateInput, user: dict = Depends(require("leads", "edit"))):
    res = await db.website_reply_templates.update_one({"id": tid}, {"$set": body.model_dump()})
    if not res.matched_count:
        raise HTTPException(status_code=404, detail="Template not found")
    await log_activity("Updated reply template", "reply_template", user, body.name)
    return await db.website_reply_templates.find_one({"id": tid}, {"_id": 0})


@api.delete("/website/reply-templates/{tid}")
async def delete_template(tid: str, user: dict = Depends(require("leads", "edit"))):
    res = await db.website_reply_templates.delete_one({"id": tid})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="Template not found")
    await log_activity("Deleted reply template", "reply_template", user, tid)
    return {"success": True}


def _box(label: str, value, red: bool = False) -> str:
    bg, color = ("#fdecec", "#E11414") if red else ("#f6f6f6", "#1a1a1a")
    return (f'<td style="background:{bg};padding:16px;border-radius:8px;width:50%"><div style="font-size:12px;color:#666">{escape(label)}</div>'
            f'<div style="font-size:26px;font-weight:bold;color:{color}">{escape(str(value))}</div></td>')


def _box_row(a: str, b: str) -> str:
    return f'<table role="presentation" width="100%" style="margin-bottom:12px"><tr>{a}<td style="width:12px"></td>{b}</tr></table>'


def _tracking_html(t: dict) -> str:
    rows = "".join(
        f'<tr><td style="padding:6px 0;border-top:1px solid #eee">{escape(l.get("name") or l.get("email") or "-")}<br>'
        f'<span style="color:#888;font-size:12px">{escape(_label(l.get("form_type")).title())}</span></td>'
        f'<td style="padding:6px 0;border-top:1px solid #eee;text-align:right;color:#E11414;font-weight:bold">waiting {_fmt_hours(l["waited"])}</td></tr>'
        for l in t["overdue"][:10])
    more = (f'<p style="color:#888;font-size:12px">and {len(t["overdue"]) - 10} more waiting in the dashboard.</p>'
            if len(t["overdue"]) > 10 else "")
    return (f'<h3 style="margin:24px 0 10px;font-size:16px">Reply times</h3>'
            + _box_row(_box("Avg first reply (last 7 days)", _fmt_hours(t["avg_7d"]), (t["avg_7d"] or 0) > SLOW_HOURS),
                       _box(f"Leads waiting over {SLOW_HOURS}h (not newsletter)", len(t["overdue"]), bool(t["overdue"])))
            + f'<p style="font-size:13px;color:#666;margin:0 0 10px">{t["replies_7d"]} replies sent in the last 7 days, {t["slow_7d"]} took over {SLOW_HOURS}h.</p>'
            + (f'<table role="presentation" width="100%">{rows}</table>{more}' if rows else ""))


def _digest_html(day_label: str, yesterday: list, pending: int, tracking: dict, first: dict) -> str:
    counts = {}
    for l in yesterday:
        counts[_label(l.get("form_type"))] = counts.get(_label(l.get("form_type")), 0) + 1
    count_rows = "".join(f'<tr><td style="padding:4px 0">{escape(k.title())}</td><td style="padding:4px 0;text-align:right"><strong>{v}</strong></td></tr>'
                         for k, v in sorted(counts.items()))
    lead_rows = "".join(
        f'<tr><td style="padding:6px 0;border-top:1px solid #eee">{escape(l.get("name") or "-")}<br>'
        f'<span style="color:#888;font-size:12px">{escape(l.get("email") or "")}</span></td>'
        f'<td style="padding:6px 0;border-top:1px solid #eee;text-align:right;font-size:13px">{escape(_label(l.get("form_type")).title())}<br>'
        f'<span style="color:#888;font-size:12px">{escape(l.get("status") or "")}'
        f'{" · replied in " + _fmt_hours(_hours(l.get("created_at"), first[l["id"]]["first"])) if l["id"] in first else ""}</span></td></tr>' for l in yesterday[:25])
    more = f'<p style="color:#888;font-size:12px">and {len(yesterday) - 25} more in the dashboard.</p>' if len(yesterday) > 25 else ""
    return (f'<table role="presentation" width="100%"><tr><td style="padding:24px;font-family:Arial,sans-serif;color:#1a1a1a;font-size:15px">'
            f'{email_logo()}<h2 style="margin:0 0 4px;color:#E11414">Daily website leads</h2>'
            f'<p style="margin:0 0 20px;color:#666">{escape(day_label)}</p>'
            f'<table role="presentation" width="100%" style="margin-bottom:20px"><tr>'
            f'<td style="background:#f6f6f6;padding:16px;border-radius:8px"><div style="font-size:12px;color:#666">New yesterday</div><div style="font-size:28px;font-weight:bold">{len(yesterday)}</div></td>'
            f'<td style="width:12px"></td>'
            f'<td style="background:#fdecec;padding:16px;border-radius:8px"><div style="font-size:12px;color:#666">Still need a reply</div><div style="font-size:28px;font-weight:bold;color:#E11414">{pending}</div></td>'
            f'</tr></table>'
            + (f'<table role="presentation" width="100%" style="margin-bottom:20px">{count_rows}</table>' if count_rows else '<p>No new leads yesterday.</p>')
            + (f'<table role="presentation" width="100%">{lead_rows}</table>{more}' if lead_rows else "")
            + _tracking_html(tracking)
            + f'<p style="font-size:12px;color:#888;border-top:1px solid #eee;padding-top:12px;margin-top:20px">'
              f'Sent by {escape(EMAIL_FROM_NAME)} Admin Portal. "Still need a reply" counts every website lead still marked New. '
              f'Reply times count emails sent from the dashboard; newsletter sign-ups are left out.</p>'
            f'</td></tr></table>')


async def build_and_send_digest() -> dict:
    leads = await _call("GET", "/admin/leads")
    today = datetime.now(LAGOS).replace(hour=0, minute=0, second=0, microsecond=0)
    start = today - timedelta(days=1)
    yesterday = sorted([l for l in leads if start <= _ts(l.get("created_at")).astimezone(LAGOS) < today],
                       key=lambda l: l.get("created_at") or "", reverse=True)
    pending = sum(1 for l in leads if l.get("status") == "new")
    day_label = start.strftime("%A, %d %B %Y")
    first = await _first_replies()
    tracking = _tracking(leads, first)
    subject = f"{EMAIL_FROM_NAME} leads for {start.strftime('%d %b')}: {len(yesterday)} new, {pending} need a reply"
    email_id = await send_email(to=DIGEST_TO, subject=subject, html=_digest_html(day_label, yesterday, pending, tracking, first))
    result = {"sent_at": now_iso(), "to": DIGEST_TO, "day": start.date().isoformat(),
              "new_yesterday": len(yesterday), "pending": pending, "overdue": len(tracking["overdue"]),
              "avg_reply_hours_7d": tracking["avg_7d"], "email_id": email_id}
    await db.meta.update_one({"key": "last_lead_digest"}, {"$set": {"key": "last_lead_digest", **result}}, upsert=True)
    return result


def _week_stats(leads: list, first: dict, start: datetime, end: datetime) -> dict:
    rows = [l for l in leads if start <= _ts(l.get("created_at")).astimezone(LAGOS) < end]
    by_type = {}
    for l in rows:
        by_type[l.get("form_type") or "other"] = by_type.get(l.get("form_type") or "other", 0) + 1
    replied = [_hours(l.get("created_at"), first[l["id"]]["first"]) for l in rows
               if l.get("form_type") != "newsletter" and l["id"] in first]
    return {"total": len(rows), "by_type": by_type, "replied": len(replied),
            "avg_reply": sum(replied) / len(replied) if replied else None}


def _change(cur: int, prev: int) -> str:
    if cur == prev:
        return '<span style="color:#888">no change</span>'
    color = "#15803d" if cur > prev else "#E11414"
    arrow = "&#9650;" if cur > prev else "&#9660;"
    pct = f" ({round((cur - prev) / prev * 100):+d}%)" if prev else ""
    return f'<span style="color:{color}">{arrow} {abs(cur - prev)}{pct}</span>'


def _weekly_html(label: str, cur: dict, prev: dict) -> str:
    types = sorted(set(cur["by_type"]) | set(prev["by_type"]))
    cell = 'style="padding:8px 6px;border-top:1px solid #eee"'
    rows = "".join(
        f'<tr><td {cell}>{escape(_label(t).title())}</td><td {cell} align="right">{prev["by_type"].get(t, 0)}</td>'
        f'<td {cell} align="right"><strong>{cur["by_type"].get(t, 0)}</strong></td>'
        f'<td {cell} align="right">{_change(cur["by_type"].get(t, 0), prev["by_type"].get(t, 0))}</td></tr>' for t in types)
    head = '<tr style="font-size:12px;color:#666"><td>Form</td><td align="right">Week before</td><td align="right">Last week</td><td align="right">Change</td></tr>'
    total = (f'<tr><td {cell}><strong>Total</strong></td><td {cell} align="right">{prev["total"]}</td>'
             f'<td {cell} align="right"><strong>{cur["total"]}</strong></td><td {cell} align="right">{_change(cur["total"], prev["total"])}</td></tr>')
    return (f'<table role="presentation" width="100%"><tr><td style="padding:24px;font-family:Arial,sans-serif;color:#1a1a1a;font-size:15px">'
            f'{email_logo()}<h2 style="margin:0 0 4px;color:#E11414">Weekly website lead trends</h2>'
            f'<p style="margin:0 0 20px;color:#666">{escape(label)}</p>'
            + _box_row(_box("Leads last week", cur["total"]), _box("Week before", prev["total"]))
            + (f'<table role="presentation" width="100%" style="font-size:14px;margin:12px 0 20px">{head}{rows}{total}</table>' if types
               else '<p>No website leads in either week.</p>')
            + _box_row(_box("Avg first reply, last week", _fmt_hours(cur["avg_reply"]), (cur["avg_reply"] or 0) > SLOW_HOURS),
                       _box("Avg first reply, week before", _fmt_hours(prev["avg_reply"]), (prev["avg_reply"] or 0) > SLOW_HOURS))
            + f'<p style="font-size:12px;color:#888;border-top:1px solid #eee;padding-top:12px;margin-top:20px">'
              f'Sent by {escape(EMAIL_FROM_NAME)} Admin Portal. Weeks run Monday to Sunday, Lagos time. Reply times count emails sent from the dashboard.</p>'
            f'</td></tr></table>')


async def build_and_send_weekly() -> dict:
    leads = await _call("GET", "/admin/leads")
    first = await _first_replies()
    today = datetime.now(LAGOS).replace(hour=0, minute=0, second=0, microsecond=0)
    this_monday = today - timedelta(days=today.weekday())
    last_start, prev_start = this_monday - timedelta(days=7), this_monday - timedelta(days=14)
    cur = _week_stats(leads, first, last_start, this_monday)
    prev = _week_stats(leads, first, prev_start, last_start)
    label = f"Week of {last_start.strftime('%d %b')} - {(this_monday - timedelta(days=1)).strftime('%d %b %Y')} vs the week before"
    diff = cur["total"] - prev["total"]
    subject = f"{EMAIL_FROM_NAME} weekly leads: {cur['total']} last week ({diff:+d} vs week before)"
    email_id = await send_email(to=DIGEST_TO, subject=subject, html=_weekly_html(label, cur, prev))
    result = {"sent_at": now_iso(), "to": DIGEST_TO, "week_start": last_start.date().isoformat(),
              "last_week": cur["total"], "week_before": prev["total"], "email_id": email_id}
    await db.meta.update_one({"key": "last_weekly_trends"}, {"$set": {"key": "last_weekly_trends", **result}}, upsert=True)
    return result


JOBS = {"lead-digest": build_and_send_digest, "weekly-trends": build_and_send_weekly}


async def _run_job(job: str, run_id: str):
    try:
        res = await JOBS[job]()
        await db.cron_runs.update_one({"run_id": run_id}, {"$set": {"status": "done", "result": res}})
    except Exception as e:
        logger.error(f"Cron job {job} failed: {e}")
        await db.cron_runs.update_one({"run_id": run_id}, {"$set": {"status": "failed", "error": str(e)[:300]}})


async def _accept_cron(request: Request, job: str) -> dict:
    auth = request.headers.get("Authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else ""
    if not token or not hmac.compare_digest(token, CRON_SECRET):
        raise HTTPException(status_code=401, detail="Unauthorized")
    try:
        envelope = await request.json()
    except ValueError:
        envelope = None
    if envelope is not None and not isinstance(envelope, dict):
        raise HTTPException(status_code=400, detail="Invalid body")
    run_id = request.headers.get("X-Webhook-Id") or (envelope or {}).get("run_id") or new_id()
    if await db.cron_runs.find_one({"run_id": run_id}):
        return {"accepted": True, "duplicate": True}
    await db.cron_runs.insert_one({"run_id": run_id, "job": job, "status": "queued", "created_at": now_iso()})
    asyncio.create_task(_run_job(job, run_id))
    return {"accepted": True}


@api.post("/cron/lead-digest", status_code=202)
async def cron_lead_digest(request: Request):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    return await _accept_cron(request, "lead-digest")


@api.post("/cron/weekly-trends", status_code=202)
async def cron_weekly_trends(request: Request):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    return await _accept_cron(request, "weekly-trends")


@api.get("/website/reply-times")
async def reply_times(user: dict = Depends(require("leads"))):
    first = await _first_replies()
    return {"slow_hours": SLOW_HOURS, "replies": first}


@api.get("/website/leads/overdue")
async def overdue_leads(user: dict = Depends(require("leads"))):
    leads = await _call("GET", "/admin/leads")
    overdue = _tracking(leads, await _first_replies())["overdue"]
    return {"slow_hours": SLOW_HOURS, "count": len(overdue),
            "oldest_hours": overdue[0]["waited"] if overdue else None,
            "ids": [l["id"] for l in overdue]}


@api.get("/website/digest")
async def digest_status(user: dict = Depends(require("leads"))):
    last = await db.meta.find_one({"key": "last_lead_digest"}, {"_id": 0})
    weekly = await db.meta.find_one({"key": "last_weekly_trends"}, {"_id": 0})
    return {"to": DIGEST_TO, "schedule": "Every day at 8:00 am Lagos time", "last": last,
            "weekly_schedule": "Mondays at 8:00 am Lagos time", "last_weekly": weekly}


async def _send_now(key: str, fn, user: dict, what: str) -> dict:
    last = await db.meta.find_one({"key": key}, {"_id": 0})
    if last and _ts(last.get("sent_at")) > datetime.now(LAGOS) - timedelta(minutes=2):
        raise HTTPException(status_code=429, detail=f"A {what} was just sent. Please wait a couple of minutes.")
    res = await fn()
    await log_activity(f"Sent {what}", key, user, DIGEST_TO)
    return res


@api.post("/website/digest/send-now")
async def digest_send_now(user: dict = Depends(require("leads", "edit"))):
    return await _send_now("last_lead_digest", build_and_send_digest, user, "digest")


@api.post("/website/weekly-trends/send-now")
async def weekly_send_now(user: dict = Depends(require("leads", "edit"))):
    return await _send_now("last_weekly_trends", build_and_send_weekly, user, "weekly trends email")
