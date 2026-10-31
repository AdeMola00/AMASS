import os
import hmac
import asyncio
import logging
from datetime import datetime, timedelta
from html import escape
from typing import List
from zoneinfo import ZoneInfo
from fastapi import Depends, HTTPException, Request
from pydantic import BaseModel, Field

from server import api, db, require, log_activity, now_iso, new_id
from website_ext import _call, _ts, _label
from email_service import send_email, EMAIL_FROM_NAME

logger = logging.getLogger("amass")
CRON_SECRET = os.environ["WEBHOOK_CRON_SECRET"]
DIGEST_TO = os.environ["DIGEST_TO_EMAIL"]
LAGOS = ZoneInfo("Africa/Lagos")

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


async def _seed_templates():
    if await db.meta.find_one({"key": "reply_templates_seeded"}):
        return
    await db.website_reply_templates.insert_many(
        [{"id": new_id(), **t, "builtin": True, "created_at": now_iso()} for t in DEFAULT_TEMPLATES])
    await db.meta.insert_one({"key": "reply_templates_seeded", "at": now_iso()})


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


def _digest_html(day_label: str, yesterday: list, pending: int) -> str:
    counts = {}
    for l in yesterday:
        counts[_label(l.get("form_type"))] = counts.get(_label(l.get("form_type")), 0) + 1
    count_rows = "".join(f'<tr><td style="padding:4px 0">{escape(k.title())}</td><td style="padding:4px 0;text-align:right"><strong>{v}</strong></td></tr>'
                         for k, v in sorted(counts.items()))
    lead_rows = "".join(
        f'<tr><td style="padding:6px 0;border-top:1px solid #eee">{escape(l.get("name") or "-")}<br>'
        f'<span style="color:#888;font-size:12px">{escape(l.get("email") or "")}</span></td>'
        f'<td style="padding:6px 0;border-top:1px solid #eee;text-align:right;font-size:13px">{escape(_label(l.get("form_type")).title())}<br>'
        f'<span style="color:#888;font-size:12px">{escape(l.get("status") or "")}</span></td></tr>' for l in yesterday[:25])
    more = f'<p style="color:#888;font-size:12px">and {len(yesterday) - 25} more in the dashboard.</p>' if len(yesterday) > 25 else ""
    return (f'<table role="presentation" width="100%"><tr><td style="padding:24px;font-family:Arial,sans-serif;color:#1a1a1a;font-size:15px">'
            f'<h2 style="margin:0 0 4px;color:#E11414">Daily website leads</h2>'
            f'<p style="margin:0 0 20px;color:#666">{escape(day_label)}</p>'
            f'<table role="presentation" width="100%" style="margin-bottom:20px"><tr>'
            f'<td style="background:#f6f6f6;padding:16px;border-radius:8px"><div style="font-size:12px;color:#666">New yesterday</div><div style="font-size:28px;font-weight:bold">{len(yesterday)}</div></td>'
            f'<td style="width:12px"></td>'
            f'<td style="background:#fdecec;padding:16px;border-radius:8px"><div style="font-size:12px;color:#666">Still need a reply</div><div style="font-size:28px;font-weight:bold;color:#E11414">{pending}</div></td>'
            f'</tr></table>'
            + (f'<table role="presentation" width="100%" style="margin-bottom:20px">{count_rows}</table>' if count_rows else '<p>No new leads yesterday.</p>')
            + (f'<table role="presentation" width="100%">{lead_rows}</table>{more}' if lead_rows else "")
            + f'<p style="font-size:12px;color:#888;border-top:1px solid #eee;padding-top:12px;margin-top:20px">'
              f'Sent by {escape(EMAIL_FROM_NAME)} Admin Portal. "Still need a reply" counts every website lead still marked New.</p>'
            f'</td></tr></table>')


async def build_and_send_digest() -> dict:
    leads = await _call("GET", "/admin/leads")
    today = datetime.now(LAGOS).replace(hour=0, minute=0, second=0, microsecond=0)
    start = today - timedelta(days=1)
    yesterday = sorted([l for l in leads if start <= _ts(l.get("created_at")).astimezone(LAGOS) < today],
                       key=lambda l: l.get("created_at") or "", reverse=True)
    pending = sum(1 for l in leads if l.get("status") == "new")
    day_label = start.strftime("%A, %d %B %Y")
    subject = f"{EMAIL_FROM_NAME} leads for {start.strftime('%d %b')}: {len(yesterday)} new, {pending} need a reply"
    email_id = await send_email(to=DIGEST_TO, subject=subject, html=_digest_html(day_label, yesterday, pending))
    result = {"sent_at": now_iso(), "to": DIGEST_TO, "day": start.date().isoformat(),
              "new_yesterday": len(yesterday), "pending": pending, "email_id": email_id}
    await db.meta.update_one({"key": "last_lead_digest"}, {"$set": {"key": "last_lead_digest", **result}}, upsert=True)
    return result


async def _run_digest(run_id: str):
    try:
        res = await build_and_send_digest()
        await db.cron_runs.update_one({"run_id": run_id}, {"$set": {"status": "done", "result": res}})
    except Exception as e:
        logger.error(f"Lead digest failed: {e}")
        await db.cron_runs.update_one({"run_id": run_id}, {"$set": {"status": "failed", "error": str(e)[:300]}})


@api.post("/cron/lead-digest", status_code=202)
async def cron_lead_digest(request: Request):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
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
    await db.cron_runs.insert_one({"run_id": run_id, "job": "lead-digest", "status": "queued", "created_at": now_iso()})
    asyncio.create_task(_run_digest(run_id))
    return {"accepted": True}


@api.get("/website/digest")
async def digest_status(user: dict = Depends(require("leads"))):
    last = await db.meta.find_one({"key": "last_lead_digest"}, {"_id": 0})
    return {"to": DIGEST_TO, "schedule": "Every day at 8:00 am Lagos time", "last": last}


@api.post("/website/digest/send-now")
async def digest_send_now(user: dict = Depends(require("leads", "edit"))):
    last = await db.meta.find_one({"key": "last_lead_digest"}, {"_id": 0})
    if last and _ts(last.get("sent_at")) > datetime.now(LAGOS) - timedelta(minutes=2):
        raise HTTPException(status_code=429, detail="A digest was just sent. Please wait a couple of minutes.")
    res = await build_and_send_digest()
    await log_activity("Sent lead digest", "lead_digest", user, DIGEST_TO)
    return res
