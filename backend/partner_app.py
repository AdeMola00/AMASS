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

from fastapi import APIRouter, Depends, HTTPException, Request
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


class ListingEditIn(BaseModel):
    price: float | None = Field(default=None, gt=0, le=1e12)
    images: list[str] | None = Field(default=None, max_length=12)


class TtsIn(BaseModel):
    text: str = Field(min_length=1, max_length=1500)
    lang: Literal["en", "pcm", "yo", "ha", "ig"] = "en"


class VoiceNoteIn(BaseModel):
    data_url: str
    duration_ms: int = Field(ge=300, le=120_000)


class AvatarIn(BaseModel):
    url: str = Field(min_length=8, max_length=1000)


class StageIn(BaseModel):
    stage: Literal["on_the_way", "working", "finished"]


class PaidIn(BaseModel):
    amount: int = Field(gt=0, le=100_000_000)


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
            # Finished jobs with no price yet → home reminder so no earnings are missed.
            unpaid = await db.fixa_bookings.find({"item_id": fixa["id"], "$or": [{"job_stage": "finished"}, {"status": "completed"}], "amount_paid": {"$in": [None, 0]}}, {"_id": 0, "id": 1}).sort("job_stage_at", -1).to_list(50)
            counts["fixa_jobs_unpaid"] = len(unpaid)
            counts["fixa_unpaid_first"] = unpaid[0]["id"] if unpaid else None
        from chat import _unread_count_for

        conv_ids = [c["id"] async for c in db.conversations.find({"participant_ids": uid}, {"_id": 0, "id": 1}).limit(200)]
        counts["unread_messages"] = sum([await _unread_count_for(db, cid, uid) for cid in conv_ids])
        counts["unread_alerts"] = await db.notifications.count_documents({"user_id": uid, "read": False})
        return {
            "user": {"id": uid, "full_name": user.get("full_name"), "email": user.get("email"), "phone": user.get("phone"), "avatar_url": user.get("avatar_url"), "is_agent": bool(user.get("is_agent")), "identity_verified": bool(user.get("identity_verified")), "face_verified": bool(user.get("face_verified"))},
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

    @router.patch("/listings/{property_id}")
    async def edit_listing(property_id: str, body: ListingEditIn, user: dict = Depends(get_current_user)):
        p = await db.properties.find_one({"id": property_id}, {"_id": 0, "agent_id": 1, "price": 1})
        if not p or p.get("agent_id") != user["id"]:
            raise HTTPException(404, "Listing not found")
        changes: dict = {"updated_at": _now()}
        if body.price is not None:
            body.price = int(body.price) if float(body.price).is_integer() else body.price
            changes["price"] = body.price
        if body.images is not None:
            if not body.images:
                raise HTTPException(400, "Add at least one photo")
            changes.update({"images": body.images, "image": body.images[0], "image_count": len(body.images)})
        push = {"price_history": {"price": body.price, "old_price": p.get("price"), "at": _iso(_now())}} if body.price is not None and body.price != p.get("price") else None
        await db.properties.update_one({"id": property_id}, {"$set": changes, **({"$push": push} if push else {})})
        return {"ok": True, "price": changes.get("price", p.get("price")), "images": changes.get("images")}

    def _ts(v):
        if not v:
            return None
        if isinstance(v, datetime):
            return v if v.tzinfo else v.replace(tzinfo=timezone.utc)
        try:
            d = datetime.fromisoformat(str(v).replace("Z", "+00:00"))
            return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
        except ValueError:
            return None

    @router.get("/summary")
    async def summary(user: dict = Depends(get_current_user)):
        """This week vs last week, plus a 7-day bar series for each partner type."""
        uid = user["id"]
        now = _now()
        week0 = now - timedelta(days=7)
        prev0 = now - timedelta(days=14)
        days = [(now - timedelta(days=6 - i)).date() for i in range(7)]

        ts = _ts

        def bucket(stamps: list):
            out = {d: 0 for d in days}
            for s in stamps:
                if s and s >= week0 and s.date() in out:
                    out[s.date()] += 1
            return [{"day": d.isoformat(), "n": out[d]} for d in days]

        def split(stamps: list):
            return sum(1 for s in stamps if s and s >= week0), sum(1 for s in stamps if s and prev0 <= s < week0)

        res: dict = {}
        # Agent: homes sold, new interested people, visits
        props = await db.properties.find({"agent_id": uid}, {"_id": 0, "id": 1, "status": 1, "status_changed_at": 1}).to_list(1000)
        if props or user.get("is_agent"):
            pids = [p["id"] for p in props]
            sold = [ts(p.get("status_changed_at")) for p in props if p.get("status") == "sold"]
            convs = await db.conversations.find({"property_id": {"$in": pids}}, {"_id": 0, "created_at": 1}).to_list(2000)
            views = await db.viewings.find({"agent_id": uid}, {"_id": 0, "created_at": 1, "status": 1}).to_list(2000)
            leads = [ts(c.get("created_at")) for c in convs] + [ts(v.get("created_at")) for v in views]
            s_now, s_prev = split(sold)
            l_now, l_prev = split(leads)
            v_now, v_prev = split([ts(v.get("created_at")) for v in views if v.get("status") == "confirmed"])
            res["agent"] = {"metrics": [{"key": "homes_sold", "now": s_now, "prev": s_prev}, {"key": "new_leads", "now": l_now, "prev": l_prev}, {"key": "visits_confirmed", "now": v_now, "prev": v_prev}], "series_key": "new_leads", "series": bucket(leads)}
        # Seller: offers won + money
        offers = await db.marketplace_offers.find({"seller_id": uid}, {"_id": 0, "status": 1, "updated_at": 1, "created_at": 1, "amount": 1, "agreed_amount": 1}).to_list(2000)
        if offers or "seller" in (user.get("partner_roles") or []):
            won = [o for o in offers if o.get("status") == "accepted"]
            w_now, w_prev = split([ts(o.get("updated_at")) for o in won])
            money_now = sum(int(o.get("agreed_amount") or o.get("amount") or 0) for o in won if (ts(o.get("updated_at")) or prev0) >= week0)
            money_prev = sum(int(o.get("agreed_amount") or o.get("amount") or 0) for o in won if prev0 <= (ts(o.get("updated_at")) or now) < week0)
            o_now, o_prev = split([ts(o.get("created_at")) for o in offers])
            res["seller"] = {"metrics": [{"key": "offers_won", "now": w_now, "prev": w_prev}, {"key": "money_won", "now": money_now, "prev": money_prev, "money": True}, {"key": "offers_received", "now": o_now, "prev": o_prev}], "series_key": "offers_received", "series": bucket([ts(o.get("created_at")) for o in offers])}
        # FIXA: jobs done
        prof = await _fixa_profile(uid)
        if prof:
            jobs = await db.fixa_bookings.find({"item_id": prof["id"]}, {"_id": 0, "status": 1, "job_stage": 1, "job_stage_at": 1, "completed_at": 1, "confirmed_at": 1, "rating": 1, "amount_paid": 1, "paid_at": 1}).to_list(2000)
            done = [ts(j.get("completed_at")) or ts(j.get("job_stage_at")) for j in jobs if j.get("status") == "completed" or j.get("job_stage") == "finished"]
            d_now, d_prev = split(done)
            paid = [(ts(j.get("paid_at")), int(j.get("amount_paid") or 0)) for j in jobs if j.get("amount_paid")]
            m_now = sum(v for s, v in paid if s and s >= week0)
            m_prev = sum(v for s, v in paid if s and prev0 <= s < week0)
            ratings = [j["rating"] for j in jobs if j.get("rating")]
            res["fixa"] = {"metrics": [{"key": "jobs_done", "now": d_now, "prev": d_prev}, {"key": "money_earned", "now": m_now, "prev": m_prev, "money": True}, {"key": "rating", "now": round(sum(ratings) / len(ratings), 1) if ratings else 0, "prev": None}], "series_key": "jobs_done", "series": bucket(done)}
        return res

    @router.get("/trends")
    async def trends(user: dict = Depends(get_current_user)):
        """Last 8 weeks (oldest first, this week last) for each partner type."""
        uid = user["id"]
        now = _now()
        W = 8
        starts = [now - timedelta(days=7 * (W - i)) for i in range(W)]

        def weekly(items: list):
            out = [0] * W
            for s, v in items:
                if not s:
                    continue
                k = int((now - s).total_seconds() // (7 * 86400))
                if 0 <= k < W:
                    out[W - 1 - k] += v
            return [{"start": starts[i].date().isoformat(), "n": out[i]} for i in range(W)]

        res: dict = {}
        props = await db.properties.find({"agent_id": uid}, {"_id": 0, "id": 1, "status": 1, "status_changed_at": 1, "price": 1}).to_list(1000)
        if props or user.get("is_agent"):
            pids = [p["id"] for p in props]
            convs = await db.conversations.find({"property_id": {"$in": pids}}, {"_id": 0, "created_at": 1}).to_list(5000)
            views = await db.viewings.find({"agent_id": uid}, {"_id": 0, "created_at": 1, "status": 1}).to_list(5000)
            sold = [(_ts(p.get("status_changed_at")), int(p.get("price") or 0)) for p in props if p.get("status") == "sold"]
            res["agent"] = {"charts": [
                {"key": "money_sold", "money": True, "weeks": weekly(sold)},
                {"key": "new_leads", "weeks": weekly([(_ts(c.get("created_at")), 1) for c in convs] + [(_ts(v.get("created_at")), 1) for v in views])},
                {"key": "visits_confirmed", "weeks": weekly([(_ts(v.get("created_at")), 1) for v in views if v.get("status") == "confirmed"])},
            ]}
        offers = await db.marketplace_offers.find({"seller_id": uid}, {"_id": 0, "status": 1, "updated_at": 1, "created_at": 1, "amount": 1, "agreed_amount": 1}).to_list(5000)
        if offers or "seller" in (user.get("partner_roles") or []):
            won = [o for o in offers if o.get("status") == "accepted"]
            res["seller"] = {"charts": [
                {"key": "money_won", "money": True, "weeks": weekly([(_ts(o.get("updated_at")), int(o.get("agreed_amount") or o.get("amount") or 0)) for o in won])},
                {"key": "offers_won", "weeks": weekly([(_ts(o.get("updated_at")), 1) for o in won])},
                {"key": "offers_received", "weeks": weekly([(_ts(o.get("created_at")), 1) for o in offers])},
            ]}
        prof = await _fixa_profile(uid)
        if prof:
            jobs = await db.fixa_bookings.find({"item_id": prof["id"]}, {"_id": 0, "status": 1, "job_stage": 1, "job_stage_at": 1, "completed_at": 1, "confirmed_at": 1, "amount_paid": 1, "paid_at": 1}).to_list(5000)
            res["fixa"] = {"charts": [
                {"key": "money_earned", "money": True, "weeks": weekly([(_ts(j.get("paid_at")), int(j.get("amount_paid") or 0)) for j in jobs if j.get("amount_paid")])},
                {"key": "jobs_done", "weeks": weekly([(_ts(j.get("completed_at")) or _ts(j.get("job_stage_at")), 1) for j in jobs if j.get("status") == "completed" or j.get("job_stage") == "finished"])},
                {"key": "jobs_accepted", "weeks": weekly([(_ts(j.get("confirmed_at")), 1) for j in jobs])},
            ]}
        return res

    @router.post("/fixa/jobs/{job_id}/paid")
    async def job_paid(job_id: str, body: PaidIn, user: dict = Depends(get_current_user)):
        """Pro records what the customer paid (feeds the earnings card + chart). Can be corrected later."""
        prof = await _fixa_profile(user["id"])
        b = await db.fixa_bookings.find_one({"id": job_id}, {"_id": 0, "item_id": 1, "status": 1, "job_stage": 1, "paid_at": 1})
        if not prof or not b or b.get("item_id") != prof["id"]:
            raise HTTPException(404, "Job not found")
        if b.get("status") != "completed" and b.get("job_stage") != "finished":
            raise HTTPException(409, "Finish the job first")
        # Keep the first payment date so a later correction doesn't move money to another week.
        paid_at = b.get("paid_at") or _iso(_now())
        await db.fixa_bookings.update_one({"id": job_id}, {"$set": {"amount_paid": body.amount, "paid_at": paid_at}})
        return {"ok": True, "amount_paid": body.amount, "paid_at": paid_at}

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

    # --- Natural AI voice (OpenAI TTS via Emergent key), cached per phrase ---
    TTS_MODEL, TTS_VOICE, TTS_SPEED = "tts-1-hd", "coral", 0.9
    SPITCH_VOICES = {"yo": "sade", "ha": "amina", "ig": "ngozi"}  # native Nigerian voices

    async def _public_put(raw: bytes, content_type: str, ext: str, owner: str) -> str:
        from object_storage import APP_NAME, put_object
        from public_url import public_api_base

        path = f"{APP_NAME}/public/{owner}/{uuid.uuid4().hex}.{ext}"
        await put_object(path, raw, content_type)
        return f"{public_api_base()}/api/public-files/{path}"

    @router.post("/tts")
    async def tts(body: TtsIn, user: dict = Depends(get_current_user)):
        return await _tts(body)

    _public_hits: dict = {}

    @router.post("/tts-public")
    async def tts_public(body: TtsIn, request: Request):
        """Signed-out screens (login) — short text only, rate limited per IP."""
        if len(body.text) > 300:
            raise HTTPException(413, "Too long")
        # Real client IP: Cloudflare's header, else the hop before the CDN + ingress entries.
        xff = [x.strip() for x in (request.headers.get("x-forwarded-for") or "").split(",") if x.strip()]
        ip = request.headers.get("cf-connecting-ip") or (xff[-3] if len(xff) >= 3 else (xff[0] if xff else (request.client.host if request.client else "?")))
        hour = int(_now().timestamp() // 3600)
        k, g = f"{ip}:{hour}", f"*:{hour}"
        if len(_public_hits) > 5000:
            _public_hits.clear()
        _public_hits[k] = _public_hits.get(k, 0) + 1
        _public_hits[g] = _public_hits.get(g, 0) + 1
        if _public_hits[k] > 40 or _public_hits[g] > 600:
            raise HTTPException(429, "Too many requests")
        return await _tts(body)

    async def _tts(body: TtsIn):
        import hashlib
        import os
        import re

        text = re.sub(r"https?://\S+", "", body.text)
        text = re.sub(r"[*_#>~|★]", "", text)
        text = re.sub(r"\s+", " ", text).strip()
        if not text:
            raise HTTPException(400, "Nothing to read")
        key = hashlib.sha256(f"{text}|{TTS_VOICE}|{TTS_SPEED}|{TTS_MODEL}|mp3".encode()).hexdigest()
        spitch_key = os.environ.get("SPITCH_API_KEY", "").strip()
        native = body.lang in SPITCH_VOICES and bool(spitch_key)
        if native:
            key = hashlib.sha256(f"{text}|spitch|{body.lang}|{SPITCH_VOICES[body.lang]}|mp3".encode()).hexdigest()
        hit = await db.partner_tts_cache.find_one({"key": key}, {"_id": 0, "url": 1})
        if hit:
            return {"url": hit["url"], "cached": True, "native": native}
        if native:
            import httpx

            try:
                async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=10.0)) as client:
                    up = await client.post("https://api.spitch.app/v1/speech", headers={"Authorization": f"Bearer {spitch_key}", "Content-Type": "application/json"}, json={"text": text, "language": body.lang, "voice": SPITCH_VOICES[body.lang], "format": "mp3"})
                if up.status_code == 200 and up.content:
                    url = await _public_put(up.content, "audio/mpeg", "mp3", "tts")
                    await db.partner_tts_cache.update_one({"key": key}, {"$set": {"key": key, "url": url, "lang": body.lang, "provider": "spitch", "created_at": _now()}}, upsert=True)
                    return {"url": url, "cached": False, "native": True}
                logger.warning("spitch tts failed: HTTP %s", up.status_code)
            except httpx.HTTPError as e:
                logger.warning("spitch tts error: %s", type(e).__name__)
            # fall back to the OpenAI voice below (different cache key)
            key = hashlib.sha256(f"{text}|{TTS_VOICE}|{TTS_SPEED}|{TTS_MODEL}|mp3".encode()).hexdigest()
            native = False
        from emergentintegrations.llm.openai import OpenAITextToSpeech

        engine = OpenAITextToSpeech(api_key=os.environ["EMERGENT_LLM_KEY"])
        try:
            audio = await engine.generate_speech(text=text, model=TTS_MODEL, voice=TTS_VOICE, speed=TTS_SPEED, response_format="mp3")
        except Exception as e:  # noqa: BLE001 - one fallback to the fast fixed-delivery model
            logger.warning("tts primary failed: %s", e)
            try:
                audio = await engine.generate_speech(text=text, model="tts-1", voice="nova", speed=0.9, response_format="mp3")
            except Exception as e2:  # noqa: BLE001
                logger.error("tts fallback failed: %s", e2)
                raise HTTPException(502, "Voice is not available right now")
        url = await _public_put(audio, "audio/mpeg", "mp3", "tts")
        await db.partner_tts_cache.update_one({"key": key}, {"$set": {"key": key, "url": url, "lang": body.lang, "created_at": _now()}}, upsert=True)
        return {"url": url, "cached": False}

    # --- Voice notes: public audio so the other person can play it in either app ---
    @router.post("/chat/{conv_id}/voice", status_code=201)
    async def voice_note(conv_id: str, body: VoiceNoteIn, user: dict = Depends(get_current_user)):
        import base64

        from chat import _assert_participant

        await _assert_participant(db, conv_id, user["id"])
        if not body.data_url.startswith("data:audio/") or ";base64," not in body.data_url:
            raise HTTPException(415, "Only audio can be sent")
        header, b64 = body.data_url.split(",", 1)
        mime = header[5:].split(";", 1)[0]
        try:
            raw = base64.b64decode(b64)
        except Exception:
            raise HTTPException(400, "Invalid audio")
        if len(raw) > 8 * 1024 * 1024:
            raise HTTPException(413, "Voice note too long")
        ext = {"audio/mp4": "m4a", "audio/m4a": "m4a", "audio/x-m4a": "m4a", "audio/aac": "aac", "audio/webm": "webm", "audio/mpeg": "mp3", "audio/ogg": "ogg", "audio/wav": "wav"}.get(mime, "m4a")
        url = await _public_put(raw, mime, ext, user["id"])
        return {"url": url, "duration_ms": body.duration_ms, "mime": mime}

    # --- Profile photo (shown to customers in AMASS, incl. market & FIXA cards) ---
    _avatar_hits: dict = {}

    @router.post("/avatar")
    async def set_avatar(body: AvatarIn, user: dict = Depends(get_current_user)):
        from public_url import public_api_base

        hk = f"{user['id']}:{int(_now().timestamp() // 3600)}"
        _avatar_hits[hk] = _avatar_hits.get(hk, 0) + 1
        if len(_avatar_hits) > 5000:
            _avatar_hits.clear()
        if _avatar_hits[hk] > 10:  # each try runs an AI photo check
            raise HTTPException(429, "Too many photo changes. Try again later.")
        if not body.url.startswith(f"{public_api_base()}/api/public-files/"):
            raise HTTPException(400, "Upload the photo first")
        face = await _check_face(body.url)
        uid = user["id"]
        if face is None:  # checker unavailable: keep the old photo + badge, ask to retry
            raise HTTPException(503, "Could not check the photo right now. Please try again.")
        await db.users.update_one({"id": uid}, {"$set": {"avatar_url": body.url, "face_verified": face, "face_checked_at": _now()}})
        await db.marketplace.update_many({"seller_id": uid}, {"$set": {"seller_avatar": body.url, "seller_face_verified": face}})
        await db.properties.update_many({"agent_id": uid}, {"$set": {"agent_avatar": body.url, "agent_face_verified": face}})
        # FIXA cards in AMASS already render fixa_badges
        if face:
            await db.marketplace.update_many({"seller_id": uid, "category": "services"}, {"$addToSet": {"fixa_badges": "Verified face"}})
        else:
            await db.marketplace.update_many({"seller_id": uid, "category": "services"}, {"$pull": {"fixa_badges": "Verified face"}})
        return {"ok": True, "avatar_url": body.url, "face_verified": face}

    async def _check_face(url: str) -> bool | None:
        """One clear, real human face (not a logo, cartoon, group or photo-of-a-screen)."""
        import base64
        import os

        import httpx
        from emergentintegrations.llm.chat import ImageContent, LlmChat, StreamDone, TextDelta, UserMessage

        try:
            async with httpx.AsyncClient(timeout=20) as client:
                r = await client.get(url)
            if r.status_code != 200:
                return None
            chat = LlmChat(api_key=os.environ["EMERGENT_LLM_KEY"], session_id=f"face-{uuid.uuid4().hex}", system_message="You verify marketplace profile photos. Reply with exactly YES or NO.").with_model("openai", "gpt-5.4")
            msg = UserMessage(text="Does this photo clearly show exactly one real human face (a real person, not a cartoon, logo, object, group, or a photo of a screen), with the face visible enough for a customer to recognise them? Answer YES or NO.", file_contents=[ImageContent(image_base64=base64.b64encode(r.content).decode())])
            out = ""
            async for ev in chat.stream_message(msg):
                if isinstance(ev, TextDelta):
                    out += ev.content
                elif isinstance(ev, StreamDone):
                    break
            out = out.strip().upper()
            return True if out.startswith("YES") else False if out.startswith("NO") else None
        except Exception as e:  # noqa: BLE001 — unknown, not "no face"
            logger.warning("face check failed: %s", type(e).__name__)
            return None

    # --- How many people opened each shared link ---
    @router.get("/share-stats")
    async def share_stats(user: dict = Depends(get_current_user)):
        uid = user["id"]
        props = {p["id"]: int(p.get("smart_link_clicks") or 0) async for p in db.properties.find({"agent_id": uid}, {"_id": 0, "id": 1, "smart_link_clicks": 1})}
        items = {i["id"]: int(i.get("share_clicks") or 0) async for i in db.marketplace.find({"seller_id": uid, "category": {"$ne": "services"}}, {"_id": 0, "id": 1, "share_clicks": 1})}
        return {"properties": props, "items": items, "total": sum(props.values()) + sum(items.values())}

    # --- Market item sharing (WhatsApp) ---
    @router.get("/share/item/{item_id}")
    async def share_item(item_id: str):
        from urllib.parse import quote

        from public_url import public_api_base

        it = await db.marketplace.find_one({"id": item_id}, {"_id": 0})
        if not it or it.get("category") == "services" or (it.get("status") or "active") != "active":
            raise HTTPException(404, "Item not found")
        link = f"{public_api_base()}/api/partner/go/item/{item_id}"
        where = ", ".join([x for x in [it.get("location"), it.get("city")] if x and (x != it.get("location") or x != it.get("city"))])
        text = f"*{it.get('name')}*\n₦{int(it.get('price') or 0):,}{' · ' + where if where else ''}\nOn AMASS Market 👉 {link}"
        return {"link": link, "text": text, "whatsapp_url": f"https://api.whatsapp.com/send?text={quote(text)}"}

    return router


def register_partner_public_routes(db) -> APIRouter:
    from fastapi.responses import HTMLResponse

    pub = APIRouter(tags=["partner-public"])

    @pub.get("/api/partner/go/item/{item_id}", response_class=HTMLResponse)
    async def go_item(item_id: str, request: Request):
        import html

        from social_publishing import BOT_UA, _store_links, get_settings

        it = await db.marketplace.find_one({"id": item_id, "status": {"$ne": "removed"}}, {"_id": 0})
        if not it:
            return HTMLResponse("<h1>Item not found</h1>", status_code=404)
        if not BOT_UA.search(request.headers.get("user-agent") or ""):
            await db.marketplace.update_one({"id": item_id}, {"$inc": {"share_clicks": 1}})
        ios, android = _store_links(await get_settings(db))
        stores = "".join(f'<a class="s" href="{html.escape(u)}">{lbl}</a>' for u, lbl in ((android, "Get AMASS on Android"), (ios, "Get AMASS on iPhone")) if u)
        phone = "".join(ch for ch in (it.get("seller_whatsapp") or it.get("seller_phone") or "") if ch.isdigit())
        if phone:  # works for buyers who don't have the app yet
            stores += f'<a class="s" href="https://wa.me/{phone}">Chat with the seller on WhatsApp</a>'
        name = html.escape(it.get("name") or "AMASS Market")
        img = html.escape(it.get("image") or "")
        price = f"₦{int(it.get('price') or 0):,}"
        city = html.escape(it.get("city") or "")
        app_url = f"amass://marketplace/{item_id}"
        page = f"""<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{name} - AMASS Market</title><meta property="og:title" content="{name} - {price}"><meta property="og:description" content="For sale in {city} on AMASS Market"><meta property="og:image" content="{img}">
<style>body{{font-family:system-ui,sans-serif;background:#F7F6F3;margin:0;color:#111}}main{{max-width:480px;margin:auto;padding:20px}}img{{width:100%;border-radius:18px;background:#EAE8E3}}a.b{{display:block;text-align:center;background:#E11B22;color:#fff;padding:18px;border-radius:14px;font-weight:700;text-decoration:none;font-size:18px;margin-top:16px}}a.s{{display:block;text-align:center;border:2px solid #111;color:#111;padding:16px;border-radius:14px;font-weight:700;text-decoration:none;margin-top:12px}}</style></head>
<body><main><img src="{img}" alt=""><h1>{name}</h1><h2>{price}</h2><p>{city}</p><a class="b" href="{app_url}">Open in AMASS</a>{stores}</main></body></html>"""
        return HTMLResponse(page, headers={"Cache-Control": "no-store"})

    return pub


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
