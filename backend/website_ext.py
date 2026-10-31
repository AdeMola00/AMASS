import os
from datetime import datetime, timezone, timedelta
from html import escape
from typing import Any, Dict
import httpx
from fastapi import Depends, HTTPException
from pydantic import BaseModel, Field

from server import api, db, require, log_activity, now_iso, new_id
from email_service import send_email, EMAIL_FROM_NAME

WEBSITE_BASE = "https://discover-properties-1.emergent.host/api"
WEBSITE_KEY = os.environ["AMASS_WEBSITE_API_KEY"]
LEAD_STATUSES = {"new", "contacted", "closed"}

client = httpx.AsyncClient(timeout=30.0)


class WebsiteLeadStatus(BaseModel):
    status: str


class WebsiteLeadReply(BaseModel):
    message: str = Field(min_length=1, max_length=5000)


REPLIES_PER_HOUR = 30


def _ts(value: str) -> datetime:
    try:
        d = datetime.fromisoformat(value)
    except (TypeError, ValueError):
        return datetime.min.replace(tzinfo=timezone.utc)
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def _label(form_type: str) -> str:
    return (form_type or "website").replace("_", " ")


async def _call(method: str, path: str, json: Any = None):
    try:
        r = await client.request(method, f"{WEBSITE_BASE}{path}", json=json, headers={"X-API-Key": WEBSITE_KEY})
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="AMASS website is unreachable. Please try again.")
    if r.status_code >= 400:
        try:
            detail = r.json().get("detail", "Website request failed")
        except ValueError:
            detail = "Website request failed"
        raise HTTPException(status_code=r.status_code if r.status_code < 500 else 502, detail=detail)
    return r.json()


@api.get("/website/stats")
async def website_stats(user: dict = Depends(require("leads"))):
    return await _call("GET", "/admin/stats")


@api.get("/website/leads")
async def website_leads(user: dict = Depends(require("leads"))):
    return await _call("GET", "/admin/leads")


@api.get("/website/newsletter")
async def website_newsletter(user: dict = Depends(require("leads"))):
    return await _call("GET", "/admin/newsletter")


@api.get("/website/leads/unseen")
async def website_leads_unseen(user: dict = Depends(require("leads"))):
    seen_at = user.get("website_leads_seen_at")
    if not seen_at:
        seen_at = now_iso()
        await db.admin_users.update_one({"id": user["id"]}, {"$set": {"website_leads_seen_at": seen_at}})
    leads = await _call("GET", "/admin/leads")
    fresh = sorted([l for l in leads if _ts(l.get("created_at")) > _ts(seen_at)],
                   key=lambda l: l.get("created_at") or "", reverse=True)
    latest = [{"id": l["id"], "name": l.get("name"), "email": l.get("email"),
               "form_type": l.get("form_type"), "created_at": l.get("created_at")} for l in fresh[:5]]
    return {"count": len(fresh), "seen_at": seen_at, "latest": latest}


@api.post("/website/leads/mark-seen")
async def website_leads_mark_seen(user: dict = Depends(require("leads"))):
    previous = user.get("website_leads_seen_at")
    await db.admin_users.update_one({"id": user["id"]}, {"$set": {"website_leads_seen_at": now_iso()}})
    return {"previous_seen_at": previous}


@api.get("/website/leads/{lead_id}/replies")
async def website_lead_replies(lead_id: str, user: dict = Depends(require("leads"))):
    return await db.website_lead_replies.find({"lead_id": lead_id}, {"_id": 0}).sort("sent_at", -1).to_list(100)


@api.post("/website/leads/{lead_id}/reply")
async def website_lead_reply(lead_id: str, body: WebsiteLeadReply, user: dict = Depends(require("leads", "edit"))):
    since = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    if await db.website_lead_replies.count_documents({"admin_id": user["id"], "sent_at": {"$gt": since}}) >= REPLIES_PER_HOUR:
        raise HTTPException(status_code=429, detail="Reply limit reached. Please try again in a little while.")
    leads = await _call("GET", "/admin/leads")
    lead = next((l for l in leads if l.get("id") == lead_id), None)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    if not lead.get("email"):
        raise HTTPException(status_code=400, detail="This lead has no email address")
    greeting = f"Hi {escape(lead['name'])}," if lead.get("name") else "Hello,"
    text = escape(body.message.strip()).replace("\n", "<br>")
    subject = f"Re: your {EMAIL_FROM_NAME} {_label(lead.get('form_type'))} request"
    html = (f'<table role="presentation" width="100%"><tr><td style="padding:24px;font-family:Arial,sans-serif;'
            f'color:#1a1a1a;font-size:15px;line-height:1.6">'
            f'<p>{greeting}</p><p>{text}</p>'
            f'<p>Best regards,<br>{escape(user.get("name") or "The team")}<br>{escape(EMAIL_FROM_NAME)}</p>'
            f'<p style="font-size:12px;color:#888;border-top:1px solid #eee;padding-top:12px">'
            f'You are receiving this because you contacted {escape(EMAIL_FROM_NAME)} through our website. '
            f'Just reply to this email to continue the conversation. We never ask for your password or card details by email.</p>'
            f'</td></tr></table>')
    try:
        email_id = await send_email(to=lead["email"], subject=subject, html=html)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Reply blocked for safety: {e}")
    record = {"id": new_id(), "lead_id": lead_id, "to": lead["email"], "subject": subject,
              "message": body.message.strip(), "admin_id": user["id"], "admin_name": user.get("name"),
              "email_id": email_id, "sent_at": now_iso()}
    await db.website_lead_replies.insert_one(dict(record))
    status = lead.get("status")
    if status == "new":
        await _call("PATCH", f"/admin/leads/{lead_id}", {"status": "contacted"})
        status = "contacted"
    await log_activity("Replied to website lead", "website_lead", user, lead["email"])
    return {"reply": record, "status": status}


@api.patch("/website/leads/{lead_id}")
async def website_lead_status(lead_id: str, body: WebsiteLeadStatus, user: dict = Depends(require("leads", "edit"))):
    if body.status not in LEAD_STATUSES:
        raise HTTPException(status_code=400, detail="Status must be new, contacted or closed")
    res = await _call("PATCH", f"/admin/leads/{lead_id}", {"status": body.status})
    await log_activity(f"Website lead marked {body.status}", "website_lead", user, lead_id)
    return res


@api.get("/website/content")
async def website_content(user: dict = Depends(require("cms"))):
    return await _call("GET", "/admin/content")


@api.put("/website/content")
async def website_content_update(body: Dict[str, Any], user: dict = Depends(require("cms", "edit"))):
    body.pop("updated_at", None)
    body.pop("_id", None)
    res = await _call("PUT", "/admin/content", body)
    await log_activity("Updated website content", "website_content", user)
    return res
