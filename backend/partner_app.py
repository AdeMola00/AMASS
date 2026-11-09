"""
AMASS Partner (Agent) App — thin layer over the existing AMASS data so agents, sellers and FIXA pros
can run their work from one app. Reuses the same users / properties / marketplace / fixa_bookings /
viewings / conversations collections, so everything shows up in the main AMASS app too.

Routes (prefix /api/partner):
  GET  /me                         roles + "what needs you now" counts
  POST /roles {roles}              opt in to agent / seller tools (FIXA uses /api/fixa/apply)
  POST /upload {data_url}          public photo for listings → {url}
  POST /fixa/jobs/{id}/stage       provider job progress: on_the_way → working → finished
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger("amass.partner")

PARTNER_ROLES = ("agent", "seller", "fixa")
STAGES = ("on_the_way", "working", "finished")
DEMO_PASSWORD = "Partner2026!"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(d: datetime) -> str:
    return d.astimezone(timezone.utc).isoformat()


class RolesIn(BaseModel):
    roles: list[Literal["agent", "seller"]] = Field(min_length=1, max_length=2)


class UploadIn(BaseModel):
    data_url: str


class StageIn(BaseModel):
    stage: Literal["on_the_way", "working", "finished"]


def register_partner_routes(db, get_current_user) -> APIRouter:
    router = APIRouter(prefix="/api/partner", tags=["partner-app"])

    async def _fixa_profile(uid: str):
        return await db.marketplace.find_one({"seller_id": uid, "category": "services", "status": {"$ne": "removed"}}, {"_id": 0})

    @router.get("/me")
    async def me(user: dict = Depends(get_current_user)):
        uid = user["id"]
        roles: list[str] = []
        listings = await db.properties.count_documents({"agent_id": uid})
        if user.get("is_agent") or listings or "agent" in (user.get("partner_roles") or []):
            roles.append("agent")
        fixa = await _fixa_profile(uid)
        if fixa:
            roles.append("fixa")
        items = await db.marketplace.count_documents({"seller_id": uid, "category": {"$ne": "services"}, "status": {"$ne": "removed"}})
        if items or "seller" in (user.get("partner_roles") or []):
            roles.append("seller")

        counts: dict = {}
        quota = None
        if "agent" in roles:
            counts["agent_listings"] = await db.properties.count_documents({"agent_id": uid, "status": {"$nin": ["sold", "withdrawn"]}})
            counts["agent_viewings_waiting"] = await db.viewings.count_documents({"agent_id": uid, "status": {"$in": ["requested", "rescheduled"]}, "awaiting": "agent"})
            counts["agent_viewings_upcoming"] = await db.viewings.count_documents({"agent_id": uid, "status": "confirmed", "start": {"$gte": _iso(_now())}})
            # Same rule as check_listing_quota (POST /api/properties) so the app can warn before the wizard.
            from agent_platform import get_effective_plan_for

            plan = await get_effective_plan_for(db, uid)
            limit = int(plan.get("listing_limit", 0) or 0)
            used = await db.properties.count_documents({"agent_id": uid, "status": {"$nin": ["archived", "sold", "rented"]}})
            quota = {"plan_name": plan.get("name"), "limit": limit, "used": used, "can_add": limit > 0 and used < limit}
        if "seller" in roles:
            counts["seller_items"] = items
            counts["seller_offers_open"] = await db.marketplace_offers.count_documents({"seller_id": uid, "status": {"$in": ["sent"]}})
        if fixa:
            counts["fixa_jobs_new"] = await db.fixa_bookings.count_documents({"item_id": fixa["id"], "status": "pending"})
            counts["fixa_jobs_active"] = await db.fixa_bookings.count_documents({"item_id": fixa["id"], "status": "confirmed", "job_stage": {"$ne": "finished"}})
        from chat import _unread_count_for

        conv_ids = [c["id"] async for c in db.conversations.find({"participant_ids": uid}, {"_id": 0, "id": 1}).limit(200)]
        counts["unread_messages"] = sum([await _unread_count_for(db, cid, uid) for cid in conv_ids])
        counts["unread_alerts"] = await db.notifications.count_documents({"user_id": uid, "read": False})
        return {
            "user": {"id": uid, "full_name": user.get("full_name"), "email": user.get("email"), "phone": user.get("phone"), "avatar_url": user.get("avatar_url"), "is_agent": bool(user.get("is_agent")), "identity_verified": bool(user.get("identity_verified"))},
            "roles": roles,
            "fixa": {"status": (fixa or {}).get("fixa_status") or ("verified" if fixa else None), "item_id": (fixa or {}).get("id"), "name": (fixa or {}).get("seller_name")} if fixa else None,
            "counts": counts,
            "listing_quota": quota,
        }

    @router.post("/roles")
    async def add_roles(body: RolesIn, user: dict = Depends(get_current_user)):
        await db.users.update_one({"id": user["id"]}, {"$addToSet": {"partner_roles": {"$each": list(body.roles)}}})
        return {"ok": True}

    @router.post("/upload", status_code=201)
    async def upload(body: UploadIn, user: dict = Depends(get_current_user)):
        from object_storage import upload_photo_base64
        from public_url import public_api_base

        if not body.data_url.startswith("data:image/"):
            raise HTTPException(415, "Only photos can be uploaded")
        b64 = body.data_url.split(",", 1)[1]
        if int(len(b64) * 0.75) > 8 * 1024 * 1024:
            raise HTTPException(413, "Photo too large (max 8 MB)")
        try:
            path = await upload_photo_base64(user["id"], body.data_url, public=True)
        except HTTPException:
            raise
        except Exception as e:  # noqa: BLE001 — storage hiccup: clear message, client can retry
            logger.warning("partner upload failed: %s", e)
            raise HTTPException(502, "Photo upload failed. Please try again.")
        return {"url": f"{public_api_base()}/api/public-files/{path}", "path": path}

    @router.post("/fixa/jobs/{job_id}/stage")
    async def job_stage(job_id: str, body: StageIn, user: dict = Depends(get_current_user)):
        prof = await _fixa_profile(user["id"])
        b = await db.fixa_bookings.find_one({"id": job_id}, {"_id": 0})
        if not prof or not b or b.get("item_id") != prof["id"]:
            raise HTTPException(404, "Job not found")
        if b.get("status") != "confirmed":
            raise HTTPException(409, "Accept the job first")
        now = _iso(_now())
        await db.fixa_bookings.update_one({"id": job_id}, {"$set": {"job_stage": body.stage, "job_stage_at": now}, "$push": {"stage_history": {"stage": body.stage, "at": now}}})
        msgs = {
            "on_the_way": ("Your pro is on the way", f"{prof.get('seller_name')} is on the way to you."),
            "working": ("Work has started", f"{prof.get('seller_name')} has started the job."),
            "finished": ("Job finished", f"{prof.get('seller_name')} says the job is finished. Tap to mark it done and rate."),
        }
        title, text = msgs[body.stage]
        if b.get("user_id"):
            try:
                from notification_center import emit

                await emit(db, b["user_id"], "FIXA_JOB_STAGE", title, text, {"booking_id": job_id, "stage": body.stage}, action_url="/fixa/bookings")
            except Exception as e:  # noqa: BLE001
                logger.warning("job stage notify failed: %s", e)
        return {"ok": True, "job_stage": body.stage}

    return router


# ─── Demo data so every partner type has something to do in preview ─────────
async def seed_partner_demo(db, hash_password) -> dict:
    created = 0

    async def ensure_user(email: str, name: str, phone: str, extra: dict | None = None) -> dict:
        nonlocal created
        u = await db.users.find_one({"email": email}, {"_id": 0})
        if u:
            return u
        u = {"id": str(uuid.uuid4()), "email": email, "password_hash": hash_password(DEMO_PASSWORD), "full_name": name, "phone": phone, "avatar_url": None, "is_agent": False, "created_at": _now(), "partner_demo": True, **(extra or {})}
        await db.users.insert_one(dict(u))
        created += 1
        return u

    buyer = await ensure_user("buyer.demo@amass.africa", "Kemi Adeyemi", "+2348031000099")
    seller = await ensure_user("seller.demo@amass.africa", "Musa Bello", "+2348031000097", {"partner_roles": ["seller"]})
    pro = await ensure_user("fixa.demo@amass.africa", "Chinedu Okafor", "+2348031000098")
    # A fresh agent with free listing slots, so the "Add a home" flow can be tried end to end.
    await ensure_user("agent.demo@amass.africa", "Bola Ade", "+2348031000096", {"is_agent": True, "partner_roles": ["agent"]})
    now = _now()

    # Agent: viewing request + chat enquiry on Adaeze's first listing
    agent = await db.users.find_one({"email": "adaeze.okoye@amass.africa"}, {"_id": 0})
    if agent:
        prop = await db.properties.find_one({"agent_id": agent["id"]}, {"_id": 0})
        if prop and not await db.viewings.find_one({"seed_key": "partner-demo-viewing"}):
            start = (now + timedelta(days=2)).replace(hour=10, minute=0, second=0, microsecond=0)
            await db.viewings.insert_one({"id": str(uuid.uuid4()), "seed_key": "partner-demo-viewing", "property_id": prop["id"], "property_title": prop.get("title"), "property_city": prop.get("city"), "property_image": (prop.get("images") or [None])[0] or prop.get("image"), "agent_id": agent["id"], "buyer_id": buyer["id"], "start": _iso(start), "end": _iso(start + timedelta(minutes=45)), "slot_minutes": 45, "status": "requested", "awaiting": "agent", "note": "Can I come with my husband?", "history": [{"at": _iso(now), "by": "buyer", "action": "requested", "start": _iso(start)}], "reminder_sent_at": None, "created_at": _iso(now), "updated_at": _iso(now)})
            created += 1
        if prop and not await db.conversations.find_one({"seed_key": "partner-demo-chat"}):
            cid = str(uuid.uuid4())
            await db.conversations.insert_one({"id": cid, "seed_key": "partner-demo-chat", "kind": "property", "property_id": prop["id"], "listing_id": None, "item_id": None, "participant_ids": sorted([buyer["id"], agent["id"]]), "created_by": buyer["id"], "last_message_preview": "Hello, is this house still available?", "last_message_at": now, "created_at": now, "updated_at": now})
            await db.chat_messages.insert_one({"id": str(uuid.uuid4()), "conversation_id": cid, "sender_id": buyer["id"], "sender_name": buyer["full_name"], "text": "Hello, is this house still available?", "kind": "text", "attachments": [], "client_msg_id": None, "status": "sent", "created_at": now})
            created += 1

    # Seller: two items + one open offer
    if not await db.marketplace.find_one({"seed_key": "partner-demo-item-1"}):
        base = {"currency": "NGN", "status": "active", "rating": 4.8, "reviews": 0, "verified": False, "delivery": False, "delivery_days": 0, "stock": 1, "popular": False, "on_sale": False, "views": 12, "saves": 3, "is_boosted": False, "is_featured": False, "vendor": seller["full_name"], "vendor_id": None, "seller_id": seller["id"], "seller_name": seller["full_name"], "seller_avatar": None, "seller_phone": seller["phone"], "seller_whatsapp": seller["phone"], "seller_type": "individual", "seller_verified": False, "seller_rating": 4.8, "seller_reviews": 0, "seller_joined_year": now.year, "seller_response_time_hours": 2, "seller_response_rate": 100, "city": "Lagos", "location": "Yaba", "negotiable": True, "contact_prefs": ["chat", "call", "whatsapp"], "specs": {}, "tags": [], "brand": None}
        sofa = {**base, "id": str(uuid.uuid4()), "seed_key": "partner-demo-item-1", "name": "3-seater fabric sofa", "description": "Grey fabric sofa, 2 years old, very clean.", "price": 180000, "category": "furniture", "subcategory": "Sofas", "condition": "used", "image": "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800", "images": ["https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800"], "posted_at": _iso(now - timedelta(days=3))}
        fridge = {**base, "id": str(uuid.uuid4()), "seed_key": "partner-demo-item-2", "name": "Double-door fridge", "description": "Working perfectly, moving abroad.", "price": 250000, "category": "appliances", "subcategory": "Fridges", "condition": "used", "image": "https://images.unsplash.com/photo-1571175443880-49e1d25b2bc5?w=800", "images": ["https://images.unsplash.com/photo-1571175443880-49e1d25b2bc5?w=800"], "posted_at": _iso(now - timedelta(days=1))}
        await db.marketplace.insert_many([dict(sofa), dict(fridge)])
        await db.marketplace_offers.insert_one({"id": str(uuid.uuid4()), "item_id": sofa["id"], "buyer_id": buyer["id"], "buyer_name": buyer["full_name"], "seller_id": seller["id"], "amount": 150000, "message": "I can pick it up tomorrow.", "status": "sent", "created_at": _iso(now), "updated_at": _iso(now)})
        created += 3

    # FIXA pro: verified profile + one new and one accepted job
    if not await db.marketplace.find_one({"seed_key": "partner-demo-fixa"}):
        fid = str(uuid.uuid4())
        await db.marketplace.insert_one({"id": fid, "seed_key": "partner-demo-fixa", "category": "services", "subcategory": "Plumbing", "name": "Chinedu Plumbing Works", "description": "Leaks, pipes, water heaters and bathroom fittings.", "seller_id": pro["id"], "seller_name": "Chinedu Okafor", "seller_phone": pro["phone"], "seller_whatsapp": pro["phone"], "seller_bio": "Plumber with 8 years experience in Lagos.", "provider_categories": ["Plumbing"], "provider_service_areas": ["Surulere", "Yaba", "Ikeja"], "provider_years_experience": 8, "provider_jobs_completed": 14, "city": "Lagos", "location": "Surulere", "status": "active", "fixa_status": "verified", "is_fixa_verified": True, "fixa_badges": ["AMASS Verified", "Rising"], "rating": 4.7, "reviews": 9, "price": 5000, "image": "https://images.unsplash.com/photo-1607472586893-edb57bdc0e39?w=600", "images": ["https://images.unsplash.com/photo-1607472586893-edb57bdc0e39?w=600"], "work_photos": [], "tags": ["fixa"], "posted_at": _iso(now), "created_at": _iso(now), "updated_at": _iso(now), "verified_at": _iso(now)})
        await db.users.update_one({"id": pro["id"]}, {"$set": {"is_fixa_provider": True}})
        common = {"user_id": buyer["id"], "item_id": fid, "provider_id": pro["id"], "provider_name": "Chinedu Okafor", "provider_phone": pro["phone"], "trade": "Plumbing", "customer_name": buyer["full_name"], "customer_phone": buyer["phone"]}
        await db.fixa_bookings.insert_many([
            {**common, "id": str(uuid.uuid4()), "address": "12 Adeniran Ogunsanya St, Surulere", "scheduled_date": (now + timedelta(days=1)).date().isoformat(), "scheduled_time": "Morning", "notes": "Kitchen sink is leaking.", "status": "pending", "created_at": _iso(now)},
            {**common, "id": str(uuid.uuid4()), "address": "4 Herbert Macaulay Way, Yaba", "scheduled_date": now.date().isoformat(), "scheduled_time": "Afternoon", "notes": "Fix the water heater.", "status": "confirmed", "confirmed_at": _iso(now), "created_at": _iso(now - timedelta(days=1))},
        ])
        created += 3

    # Brand: a password login for the first Market brand
    if not await db.brand_accounts.find_one({"email": "brand.demo@amass.africa"}):
        r = await db.shop_retailers.find_one({}, {"_id": 0, "id": 1})
        if r:
            await db.brand_accounts.insert_one({"id": str(uuid.uuid4()), "brand_id": r["id"], "name": "Brand Demo", "email": "brand.demo@amass.africa", "password_hash": hash_password(DEMO_PASSWORD), "disabled": False, "created_by": "partner-seed", "created_at": now})
            created += 1
    return {"created": created}
