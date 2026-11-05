import logging
from datetime import datetime, timedelta, timezone
from html import escape
from typing import Optional
import httpx
from fastapi import Depends, HTTPException, Request, Query
from pydantic import BaseModel, EmailStr, Field

from server import api, app, db, require, log_activity, now_iso, new_id
from portal_proxy import PORTAL_BASE, PORTAL_KEY
from digest_ext import JOBS, LAGOS, _accept_cron, _ts
from email_service import send_email, EMAIL_FROM_NAME, EMAIL_REPLY_TO

logger = logging.getLogger("amass")
client = httpx.AsyncClient(timeout=60.0)


@app.on_event("startup")
async def _retail_indexes():
    await db.stock_state.create_index("product_id", unique=True)
    await db.retailer_contacts.create_index("retailer_id", unique=True)


class ContactInput(BaseModel):
    retailer_id: str = Field(min_length=1, max_length=200)
    retailer_name: str = Field(min_length=1, max_length=200)
    email: Optional[EmailStr] = None


class ReminderInput(BaseModel):
    retailer_id: str = Field(min_length=1, max_length=200)


def _rid(p: dict) -> str:
    return p.get("retailer_id") or (f"seller:{p['seller']}" if p.get("seller") else "unknown")


async def _products() -> list:
    try:
        r = await client.get(f"{PORTAL_BASE}/marketplace/products", headers={"X-AMASS-Portal-Key": PORTAL_KEY})
        r.raise_for_status()
        return r.json()
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="AMASS app is unreachable. Please try again.")


async def run_stock_check() -> dict:
    products = await _products()
    known = {s["product_id"]: s for s in await db.stock_state.find({}, {"_id": 0}).to_list(20000)}
    now, changes, added = now_iso(), 0, 0
    for p in products:
        status = p.get("stock_status") or "unknown"
        prev = known.get(p["id"])
        base = {"product_id": p["id"], "retailer_id": _rid(p), "seller": p.get("seller"), "title": p.get("title")}
        if not prev:
            await db.stock_state.update_one({"product_id": p["id"]}, {"$setOnInsert": {**base, "status": status, "since": now, "checked_at": now}}, upsert=True)
            added += 1
        elif prev["status"] != status:
            await db.stock_events.insert_one({"id": new_id(), **base, "from": prev["status"], "to": status, "at": now})
            await db.stock_state.update_one({"product_id": p["id"]}, {"$set": {**base, "status": status, "since": now, "checked_at": now}})
            changes += 1
        else:
            await db.stock_state.update_one({"product_id": p["id"]}, {"$set": {"checked_at": now, "title": p.get("title")}})
    result = {"checked_at": now, "products": len(products), "changes": changes, "new_products": added}
    await db.meta.update_one({"key": "last_stock_check"}, {"$set": {"key": "last_stock_check", **result}}, upsert=True)
    return result


def _reminder_html(name: str, items: list) -> str:
    cell = 'style="padding:8px 0;border-top:1px solid #eee"'
    rows = "".join(f'<tr><td {cell}>{escape(i["title"] or "Product")}</td>'
                   f'<td {cell} align="right" style="color:#888;font-size:13px">out since {escape(_ts(i["since"]).astimezone(LAGOS).strftime("%d %b %Y"))}</td></tr>'
                   for i in items)
    contact = f" or write to {escape(EMAIL_REPLY_TO)}" if EMAIL_REPLY_TO else ""
    return (f'<table role="presentation" width="100%"><tr><td style="padding:24px;font-family:Arial,sans-serif;color:#1a1a1a;font-size:15px;line-height:1.5">'
            f'<h2 style="margin:0 0 4px;color:#E11414">Restock reminder</h2>'
            f'<p>Hello {escape(name)} team,</p>'
            f'<p>These {len(items)} {"product is" if len(items) == 1 else "products are"} showing as out of stock on the {escape(EMAIL_FROM_NAME)} marketplace. '
            f'Customers can\'t buy them until they\'re back in stock.</p>'
            f'<table role="presentation" width="100%" style="margin:12px 0 20px">{rows}</table>'
            f'<p>Once they\'re restocked, update your stock as usual and the marketplace will pick it up. Questions? Just reply to this email{contact}.</p>'
            f'<p style="font-size:12px;color:#888;border-top:1px solid #eee;padding-top:12px">'
            f'You receive this weekly because you are a retailer on the {escape(EMAIL_FROM_NAME)} marketplace. '
            f'We never ask for passwords or payment details by email.</p></td></tr></table>')


async def _send_reminder(retailer_id: str, contact: dict, products: list) -> Optional[dict]:
    oos_ids = {p["id"] for p in products if _rid(p) == retailer_id and p.get("stock_status") == "out_of_stock"}
    if not oos_ids:
        return None
    state = {s["product_id"]: s for s in await db.stock_state.find({"product_id": {"$in": list(oos_ids)}}, {"_id": 0}).to_list(5000)}
    items = sorted([{"title": next(p["title"] for p in products if p["id"] == pid),
                     "since": state.get(pid, {}).get("since") or now_iso()} for pid in oos_ids], key=lambda i: i["since"])
    n = len(items)
    subject = f"{n} of your products {'is' if n == 1 else 'are'} out of stock on {EMAIL_FROM_NAME}"
    email_id = await send_email(to=contact["email"], subject=subject, html=_reminder_html(contact["retailer_name"], items))
    record = {"id": new_id(), "retailer_id": retailer_id, "to": contact["email"], "products": len(items),
              "email_id": email_id, "sent_at": now_iso()}
    await db.restock_reminders.insert_one(dict(record))
    return record


async def run_restock_reminders() -> dict:
    await run_stock_check()
    products = await _products()
    sent, skipped, failed = 0, 0, 0
    for c in await db.retailer_contacts.find({"email": {"$ne": None}}, {"_id": 0}).to_list(1000):
        try:
            rec = await _send_reminder(c["retailer_id"], c, products)
            sent, skipped = (sent + 1, skipped) if rec else (sent, skipped + 1)
        except HTTPException as e:
            failed += 1
            logger.error(f"Restock reminder to {c['retailer_id']} failed: {e.detail}")
    result = {"ran_at": now_iso(), "sent": sent, "skipped_no_oos": skipped, "failed": failed}
    await db.meta.update_one({"key": "last_restock_run"}, {"$set": {"key": "last_restock_run", **result}}, upsert=True)
    return result


JOBS["stock-check"] = run_stock_check
JOBS["restock-reminders"] = run_restock_reminders


@api.post("/cron/stock-check", status_code=202)
async def cron_stock_check(request: Request):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    return await _accept_cron(request, "stock-check")


@api.post("/cron/restock-reminders", status_code=202)
async def cron_restock_reminders(request: Request):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    return await _accept_cron(request, "restock-reminders")


@api.get("/retailers/contacts")
async def retailer_contacts(user: dict = Depends(require("marketplace"))):
    contacts = await db.retailer_contacts.find({}, {"_id": 0}).to_list(1000)
    last = {}
    for r in await db.restock_reminders.find({}, {"_id": 0}).sort("sent_at", 1).to_list(5000):
        last[r["retailer_id"]] = r
    run = await db.meta.find_one({"key": "last_restock_run"}, {"_id": 0})
    return {"contacts": {c["retailer_id"]: c for c in contacts}, "last_reminders": last, "last_run": run,
            "schedule": "Mondays at 9:00 am Lagos time"}


@api.put("/retailers/contact")
async def set_retailer_contact(body: ContactInput, user: dict = Depends(require("marketplace", "edit"))):
    doc = {"retailer_id": body.retailer_id, "retailer_name": body.retailer_name,
           "email": str(body.email).lower() if body.email else None, "updated_at": now_iso(), "updated_by": user.get("name")}
    await db.retailer_contacts.update_one({"retailer_id": body.retailer_id}, {"$set": doc}, upsert=True)
    await log_activity("Updated retailer contact", "retailer", user, body.retailer_name)
    return doc


@api.post("/retailers/restock-reminder")
async def send_restock_now(body: ReminderInput, user: dict = Depends(require("marketplace", "edit"))):
    contact = await db.retailer_contacts.find_one({"retailer_id": body.retailer_id}, {"_id": 0})
    if not contact or not contact.get("email"):
        raise HTTPException(status_code=400, detail="Add a contact email for this retailer first")
    recent = await db.restock_reminders.find_one({"retailer_id": body.retailer_id, "sent_at": {"$gt": (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()}})
    if recent:
        raise HTTPException(status_code=429, detail="A reminder was just sent to this retailer. Please wait 10 minutes.")
    rec = await _send_reminder(body.retailer_id, contact, await _products())
    if not rec:
        raise HTTPException(status_code=400, detail="This retailer has no out-of-stock products right now")
    await log_activity("Sent restock reminder", "retailer", user, contact["retailer_name"])
    return rec


@api.get("/retailers/stock-history")
async def stock_history(retailer_id: Optional[str] = Query(None), user: dict = Depends(require("marketplace"))):
    if not await db.stock_state.find_one({}):
        await run_stock_check()
    q = {"retailer_id": retailer_id} if retailer_id else {}
    events = await db.stock_events.find(q, {"_id": 0}).sort("at", -1).to_list(500)
    state = await db.stock_state.find(q, {"_id": 0}).to_list(5000)
    last = await db.meta.find_one({"key": "last_stock_check"}, {"_id": 0})
    first = await db.stock_state.find_one({}, {"_id": 0, "since": 1}, sort=[("since", 1)])
    return {"events": events, "state": {s["product_id"]: s for s in state}, "last_check": last,
            "tracking_since": first.get("since") if first else None, "schedule": "Every day at 7:00 am Lagos time"}


@api.post("/retailers/stock-check")
async def stock_check_now(user: dict = Depends(require("marketplace", "edit"))):
    last = await db.meta.find_one({"key": "last_stock_check"}, {"_id": 0})
    if last and _ts(last.get("checked_at")) > datetime.now(LAGOS) - timedelta(minutes=1):
        raise HTTPException(status_code=429, detail="Stock was just checked. Please wait a minute.")
    return await run_stock_check()
