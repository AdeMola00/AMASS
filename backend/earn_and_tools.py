"""
AMASS Token Economy — Phase 2 (Earn) + Phase 3 (Agent Tools).

Earn:  Referrals, task completions (phone verify, profile, upload property),
       login streaks.

Agent: Promote / Feature / Boost listings, Lead unlock, AI Description Generator,
       Bulk upload.

MOCKED: Phone OTP verification (accepts "123456") — swap for Twilio/Termii when
        keys are provided.
"""
from __future__ import annotations

import json
import re
import os
import uuid
import secrets
import string
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

import jwt
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field

from motor.motor_asyncio import AsyncIOMotorDatabase

# We rely on the same JWT config & WalletService from tokens.py
from tokens import WalletService, TransactionKind

JWT_SECRET = os.environ.get("JWT_SECRET")
if not JWT_SECRET or len(JWT_SECRET) < 24:
    raise RuntimeError("JWT_SECRET is missing or too weak (see backend/.env)")
JWT_ALG = "HS256"

bearer = HTTPBearer(auto_error=False)

# ─── Config: task rewards ──────────────────────────────────────
TASK_REWARDS: dict = {
    "phone_verify": {"tokens": 5, "label": "Verify phone number", "icon": "phone-portrait", "one_time": True},
    "complete_profile": {"tokens": 10, "label": "Complete your profile", "icon": "person-circle", "one_time": True},
    "identity_verify": {"tokens": 25, "label": "Verify identity", "icon": "id-card", "one_time": True},
    "upload_property": {"tokens": 40, "label": "Upload a property", "icon": "home", "one_time": False},
    "refer_friend": {"tokens": 50, "label": "Refer a friend", "icon": "people", "one_time": False},
    "first_review": {"tokens": 15, "label": "Leave your first review", "icon": "star", "one_time": True},
    "share_listing": {"tokens": 5, "label": "Share a listing", "icon": "share-social", "one_time": False},
    "daily_login": {"tokens": 2, "label": "Daily login", "icon": "sunny", "one_time": False},
}

REFERRAL_BONUS = 50  # tokens for the referrer once referee completes signup

# ─── Agent tool prices ─────────────────────────────────────────

LEAD_UNLOCK_COST = 10  # tokens to see a lead's contact
AI_DESCRIPTION_COST = 5  # tokens per AI generation
BULK_UPLOAD_COST = 30  # tokens per bulk upload of up to 10 listings


# ─── Pydantic ──────────────────────────────────────────────────
class ClaimTaskIn(BaseModel):
    task_id: str


class PhoneVerifyStartIn(BaseModel):
    phone: str


class PhoneVerifyConfirmIn(BaseModel):
    phone: str
    code: str


class CompleteProfileIn(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    city: Optional[str] = None
    bio: Optional[str] = None
    avatar_url: Optional[str] = None


class ReferralApplyIn(BaseModel):
    code: str


class UnlockLeadIn(BaseModel):
    property_id: str
    favorite_user_id: str


class GenerateDescriptionIn(BaseModel):
    title: str
    property_type: Optional[str] = None
    bedrooms: Optional[int] = None
    bathrooms: Optional[int] = None
    size_sqm: Optional[int] = None
    location: Optional[str] = None
    amenities: Optional[list[str]] = None
    tone: Literal["luxurious", "family", "investor", "concise"] = "luxurious"


class ParseSearchIn(BaseModel):
    query: str


# ─── Auth helper ───────────────────────────────────────────────
async def _uid(creds: Optional[HTTPAuthorizationCredentials]) -> str:
    if not creds:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALG])
        return payload["sub"]
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid token")


# ─── Referral code helpers ─────────────────────────────────────
def generate_referral_code(user_name: str) -> str:
    base = re.sub(r"[^A-Za-z]", "", (user_name or "AMASS"))[:4].upper() or "AMAS"
    tail = "".join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(4))
    return f"{base}-{tail}"


# ─── Router ────────────────────────────────────────────────────
def register_earn_routes(db: AsyncIOMotorDatabase) -> APIRouter:
    router = APIRouter(prefix="/api", tags=["earn"])
    svc = WalletService(db)

    async def _has_task_completed(user_id: str, task_id: str) -> bool:
        found = await db.token_transactions.find_one(
            {
                "user_id": user_id,
                "kind": "earn_reward",
                "meta.task_id": task_id,
            }
        )
        return found is not None

    async def _award_task(user_id: str, task_id: str, meta: Optional[dict] = None) -> dict:
        """Award tokens for a task, respecting one-time constraint."""
        cfg = TASK_REWARDS.get(task_id)
        if not cfg:
            raise HTTPException(400, f"Unknown task {task_id}")
        if cfg.get("one_time") and await _has_task_completed(user_id, task_id):
            return {"ok": False, "reason": "already_awarded"}
        await svc.credit(
            user_id,
            cfg["tokens"],
            "earn_reward",
            f"Reward: {cfg['label']}",
            meta={"task_id": task_id, **(meta or {})},
        )
        return {"ok": True, "credited": cfg["tokens"], "task_id": task_id}

    # ─── Task catalog + progress ─────────────────────────────
    @router.get("/earn/tasks")
    async def earn_tasks(creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer)):
        user_id = await _uid(creds)
        # Determine which one-time tasks are completed
        completed_docs = db.token_transactions.find(
            {"user_id": user_id, "kind": "earn_reward"}, {"_id": 0, "meta.task_id": 1, "created_at": 1}
        )
        completed_ids: set = set()
        latest_daily: Optional[datetime] = None
        async for r in completed_docs:
            t = r.get("meta", {}).get("task_id")
            if t:
                completed_ids.add(t)
                if t == "daily_login":
                    ts = r.get("created_at")
                    if isinstance(ts, datetime) and (not latest_daily or ts > latest_daily):
                        latest_daily = ts
        tasks_out = []
        # Phone verified through sign-in (OTP) or the account screen counts as done even if the reward was never claimed.
        udoc = await db.users.find_one({"id": user_id}, {"_id": 0, "phone_verified": 1}) or {}
        if udoc.get("phone_verified"):
            completed_ids.add("phone_verify")
        for task_id, cfg in TASK_REWARDS.items():
            done = cfg.get("one_time") and task_id in completed_ids
            claimable_today = True
            if task_id == "daily_login" and latest_daily:
                claimable_today = latest_daily.date() < datetime.now(timezone.utc).date()
            tasks_out.append(
                {
                    "id": task_id,
                    "label": cfg["label"],
                    "tokens": cfg["tokens"],
                    "icon": cfg["icon"],
                    "one_time": cfg.get("one_time", False),
                    "completed": bool(done),
                    "claimable_today": bool(claimable_today),
                }
            )
        # Compute daily-login streak
        streak = 0
        cur = datetime.now(timezone.utc).date()
        # Look back for consecutive daily_login records
        cursor = db.token_transactions.find(
            {"user_id": user_id, "kind": "earn_reward", "meta.task_id": "daily_login"},
            {"_id": 0, "created_at": 1},
        ).sort("created_at", -1).limit(60)
        seen_dates: list = []
        async for r in cursor:
            ts = r.get("created_at")
            if isinstance(ts, datetime):
                seen_dates.append(ts.date())
        for i in range(60):
            check_date = cur - timedelta(days=i)
            if check_date in seen_dates:
                streak += 1
            else:
                # Only allow "today missed" not to break the streak
                if i == 0:
                    continue
                break
        return {"tasks": tasks_out, "streak": streak}

    # ─── Explicit task claim endpoints ──────────────────────
    @router.post("/earn/claim")
    async def claim_task(
        data: ClaimTaskIn,
        creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    ):
        user_id = await _uid(creds)
        # Only allow tasks that don't require a server-side verification via a
        # simple claim. Server-authorized tasks are:
        #   - daily_login (idempotent per day)
        #   - share_listing (repeatable)
        if data.task_id not in {"daily_login", "share_listing"}:
            raise HTTPException(400, "This task requires verification (use dedicated endpoint).")
        if data.task_id == "daily_login":
            today = datetime.now(timezone.utc).date().isoformat()
            already = await db.token_transactions.find_one(
                {
                    "user_id": user_id,
                    "kind": "earn_reward",
                    "meta.task_id": "daily_login",
                    "meta.date": today,
                }
            )
            if already:
                return {"ok": False, "reason": "already_claimed_today"}
            return await _award_task(user_id, "daily_login", {"date": today})
        # share_listing — rate-limit to 3 per day
        today = datetime.now(timezone.utc).date().isoformat()
        cnt = await db.token_transactions.count_documents(
            {
                "user_id": user_id,
                "kind": "earn_reward",
                "meta.task_id": "share_listing",
                "meta.date": today,
            }
        )
        if cnt >= 3:
            return {"ok": False, "reason": "daily_limit_reached"}
        return await _award_task(user_id, "share_listing", {"date": today})

    # ─── Phone verify (MOCKED) ───────────────────────────────
    @router.post("/earn/phone/start")
    async def phone_start(
        data: PhoneVerifyStartIn,
        creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    ):
        user_id = await _uid(creds)
        # MOCK: pretend an OTP was sent. Real Twilio/Termii integration goes here.
        await db.otp_sessions.update_one(
            {"user_id": user_id, "phone": data.phone},
            {
                "$set": {
                    "code": "123456",  # DEV code
                    "created_at": datetime.now(timezone.utc),
                    "attempts": 0,
                }
            },
            upsert=True,
        )
        return {"ok": True, "mocked": True, "hint": "Use code 123456 in dev/test"}

    @router.post("/earn/phone/confirm")
    async def phone_confirm(
        data: PhoneVerifyConfirmIn,
        creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    ):
        user_id = await _uid(creds)
        sess = await db.otp_sessions.find_one(
            {"user_id": user_id, "phone": data.phone}, {"_id": 0}
        )
        if not sess:
            raise HTTPException(400, "No OTP session — request a code first")
        if data.code != sess.get("code"):
            await db.otp_sessions.update_one(
                {"user_id": user_id, "phone": data.phone},
                {"$inc": {"attempts": 1}},
            )
            raise HTTPException(400, "Invalid code")
        # Save phone on user — a verified phone belongs to exactly one account.
        clash = await db.users.find_one({"phone": data.phone, "phone_verified": True, "id": {"$ne": user_id}}, {"_id": 0, "id": 1})
        if clash:
            raise HTTPException(409, "That phone number is already verified on another AMASS account.")
        await db.users.update_one(
            {"id": user_id},
            {"$set": {"phone": data.phone, "phone_verified": True}},
        )
        await db.otp_sessions.delete_many({"user_id": user_id, "phone": data.phone})
        result = await _award_task(user_id, "phone_verify", {"phone": data.phone})
        return {"ok": True, "reward": result}

    # ─── Complete profile ────────────────────────────────────
    @router.post("/earn/profile")
    async def complete_profile(
        data: CompleteProfileIn,
        creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    ):
        user_id = await _uid(creds)
        updates = {k: v for k, v in data.model_dump().items() if v is not None}
        if updates:
            await db.users.update_one({"id": user_id}, {"$set": updates})
        # Award only if profile now considered "complete" (>=3 fields on user)
        u = await db.users.find_one({"id": user_id}, {"_id": 0})
        filled = sum(
            1 for k in ["full_name", "phone", "city", "bio", "avatar_url"] if (u or {}).get(k)
        )
        if filled >= 3:
            result = await _award_task(user_id, "complete_profile")
            return {"ok": True, "reward": result, "filled": filled}
        return {"ok": True, "filled": filled, "needed": 3}

    # ─── Referral ────────────────────────────────────────────
    @router.get("/earn/referral/me")
    async def my_referral(creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer)):
        user_id = await _uid(creds)
        u = await db.users.find_one({"id": user_id}, {"_id": 0})
        if not u:
            raise HTTPException(404, "User not found")
        code = u.get("referral_code")
        if not code:
            code = generate_referral_code(u.get("full_name") or "AMASS")
            # Ensure unique
            for _ in range(5):
                exists = await db.users.find_one({"referral_code": code})
                if not exists:
                    break
                code = generate_referral_code(u.get("full_name") or "AMASS")
            await db.users.update_one({"id": user_id}, {"$set": {"referral_code": code}})
        # Referral count = distinct users who applied this code
        used_by = await db.referral_uses.count_documents({"referrer_id": user_id})
        return {
            "code": code,
            "share_url": f"https://amass.app/join?ref={code}",
            "referred_count": used_by,
            "tokens_per_referral": REFERRAL_BONUS,
        }

    @router.post("/earn/referral/apply")
    async def apply_referral(
        data: ReferralApplyIn,
        creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    ):
        user_id = await _uid(creds)
        code = data.code.upper().strip()
        # Cannot self-refer
        me = await db.users.find_one({"id": user_id}, {"_id": 0})
        if me and me.get("referral_code") == code:
            raise HTTPException(400, "You cannot use your own code")
        # Already applied?
        existing = await db.referral_uses.find_one({"referee_id": user_id})
        if existing:
            raise HTTPException(400, "You have already applied a referral code")
        referrer = await db.users.find_one({"referral_code": code}, {"_id": 0})
        if not referrer:
            raise HTTPException(404, "Referral code not found")
        # Record usage
        await db.referral_uses.insert_one(
            {
                "referrer_id": referrer["id"],
                "referee_id": user_id,
                "code": code,
                "created_at": datetime.now(timezone.utc),
            }
        )
        # Award both sides
        await svc.credit(
            referrer["id"],
            REFERRAL_BONUS,
            "earn_reward",
            "A friend joined AMASS with your referral code",
            meta={"task_id": "refer_friend", "referee_id": user_id},
        )
        await svc.credit(
            user_id,
            10,
            "earn_reward",
            f"Welcome bonus from {referrer.get('full_name', 'a friend')}",
            meta={"task_id": "referral_join", "referrer_id": referrer["id"]},
            is_bonus=True,
        )
        return {"ok": True, "you_get": 10, "referrer_gets": REFERRAL_BONUS}

    # ─── Award upload_property (called by property submission) ─
    @router.post("/earn/internal/property-uploaded")
    async def internal_property_uploaded(
        creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    ):
        user_id = await _uid(creds)
        # This task is NOT one-time — we award once per property upload event.
        # Rate-limit to prevent gaming: max 5 per day.
        today = datetime.now(timezone.utc).date().isoformat()
        cnt = await db.token_transactions.count_documents(
            {
                "user_id": user_id,
                "kind": "earn_reward",
                "meta.task_id": "upload_property",
                "meta.date": today,
            }
        )
        if cnt >= 5:
            return {"ok": False, "reason": "daily_limit"}
        await svc.credit(
            user_id,
            TASK_REWARDS["upload_property"]["tokens"],
            "earn_reward",
            "Reward: Uploaded a property",
            meta={"task_id": "upload_property", "date": today},
        )
        return {"ok": True, "credited": TASK_REWARDS["upload_property"]["tokens"]}

    return router


# ─── Agent Tools Router ────────────────────────────────────────
def register_agent_tool_routes(db: AsyncIOMotorDatabase, chat_factory) -> APIRouter:
    """chat_factory is a callable that returns an LlmChat configured with the
    Emergent LLM key. We inject it to avoid coupling this module to the
    integration library at import time."""
    router = APIRouter(prefix="/api", tags=["agent_tools"])
    svc = WalletService(db)

    # ─── Lead unlock ────────────────────────────────────────
    @router.get("/agent/leads/{property_id}")
    async def list_leads(
        property_id: str,
        creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    ):
        user_id = await _uid(creds)
        # Return favorites-based leads (users who liked this property).
        # Contact info is redacted unless the agent has unlocked the lead.
        unlocked = {
            r["favorite_user_id"]
            async for r in db.lead_unlocks.find(
                {"agent_id": user_id, "property_id": property_id}, {"_id": 0, "favorite_user_id": 1}
            )
        }
        favs = db.favorites.find({"property_id": property_id}, {"_id": 0})
        leads = []
        async for f in favs:
            uid = f.get("user_id")
            if not uid or uid == user_id:
                continue
            u = await db.users.find_one({"id": uid}, {"_id": 0}) or {}
            is_unlocked = uid in unlocked
            leads.append(
                {
                    "favorite_user_id": uid,
                    "name": u.get("full_name", "AMASS user"),
                    "avatar_url": u.get("avatar_url"),
                    "phone": u.get("phone") if is_unlocked else None,
                    "email": u.get("email") if is_unlocked else None,
                    "unlocked": is_unlocked,
                    "cost": LEAD_UNLOCK_COST,
                    "saved_at": f.get("created_at"),
                }
            )
        return {"leads": leads, "unlock_cost": LEAD_UNLOCK_COST}

    @router.post("/agent/leads/unlock")
    async def unlock_lead(
        data: UnlockLeadIn,
        creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    ):
        user_id = await _uid(creds)
        existing = await db.lead_unlocks.find_one(
            {
                "agent_id": user_id,
                "property_id": data.property_id,
                "favorite_user_id": data.favorite_user_id,
            }
        )
        if existing:
            return {"ok": True, "already_unlocked": True}
        try:
            await svc.debit(
                user_id,
                LEAD_UNLOCK_COST,
                "spend_unlock",
                "Unlocked a buyer lead",
                meta={"property_id": data.property_id, "favorite_user_id": data.favorite_user_id},
            )
        except HTTPException as e:
            if e.status_code == 402:
                wallet = await svc.get_or_create(user_id)
                raise HTTPException(
                    402,
                    {
                        "error": "insufficient_tokens",
                        "required": LEAD_UNLOCK_COST,
                        "balance": wallet["balance"] + wallet["bonus_balance"],
                        "shortfall": LEAD_UNLOCK_COST - (wallet["balance"] + wallet["bonus_balance"]),
                    },
                )
            raise
        await db.lead_unlocks.insert_one(
            {
                "agent_id": user_id,
                "property_id": data.property_id,
                "favorite_user_id": data.favorite_user_id,
                "cost": LEAD_UNLOCK_COST,
                "created_at": datetime.now(timezone.utc),
            }
        )
        # Return contact info now that it's unlocked
        u = await db.users.find_one({"id": data.favorite_user_id}, {"_id": 0}) or {}
        return {
            "ok": True,
            "cost": LEAD_UNLOCK_COST,
            "contact": {
                "name": u.get("full_name"),
                "phone": u.get("phone"),
                "email": u.get("email"),
            },
        }

    # ─── AI Description generator ───────────────────────────
    @router.post("/agent/ai/description")
    async def generate_description(
        data: GenerateDescriptionIn,
        creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    ):
        user_id = await _uid(creds)
        # Debit tokens first
        try:
            await svc.debit(
                user_id,
                AI_DESCRIPTION_COST,
                "spend_unlock",
                "AI Description generated",
                meta={"tool": "description_generator"},
            )
        except HTTPException as e:
            if e.status_code == 402:
                wallet = await svc.get_or_create(user_id)
                raise HTTPException(
                    402,
                    {
                        "error": "insufficient_tokens",
                        "required": AI_DESCRIPTION_COST,
                        "balance": wallet["balance"] + wallet["bonus_balance"],
                    },
                )
            raise
        prompt = (
            f"Write a compelling {data.tone} property listing description for AMASS "
            f"(Nigeria real estate). Focus on lifestyle, location, and standout features.\n"
            f"Title: {data.title}\n"
            f"Type: {data.property_type or 'residential'}\n"
            f"Bedrooms: {data.bedrooms or 'not specified'}\n"
            f"Bathrooms: {data.bathrooms or 'not specified'}\n"
            f"Size: {data.size_sqm or 'not specified'} sqm\n"
            f"Location: {data.location or 'Nigeria'}\n"
            f"Amenities: {', '.join(data.amenities or []) or 'standard'}\n\n"
            f"Return ONLY the description text — 3 short paragraphs, "
            f"about 130 words total. Do not include the title. "
            f"Use a warm, premium tone suitable for African buyers."
        )
        try:
            reply = await chat_factory(
                "You are AMASS AI, an expert real-estate copywriter for the Nigerian market. "
                "Write with warmth, clarity, and premium tone. Never invent facts.",
            ).ask(prompt)
        except Exception:
            # Refund tokens if AI call fails
            await svc.credit(
                user_id,
                AI_DESCRIPTION_COST,
                "refund",
                "Refund: AI description generation failed",
                meta={"tool": "description_generator"},
            )
            raise HTTPException(500, "AI generator temporarily unavailable")
        return {"description": reply.strip(), "cost": AI_DESCRIPTION_COST}

    # ─── AI Search — Natural language → filters ─────────────
    @router.post("/agent/ai/parse-search")
    async def parse_search(data: ParseSearchIn):
        """No token cost — this is a free UX helper. Uses Claude to convert
        natural language into structured filters."""
        schema = (
            "You are AMASS AI. Extract SEARCH FILTERS from a user's natural language "
            "property query. Output ONLY valid JSON with these optional keys:\n"
            "  listing_type: 'buy'|'rent'|'shortlet'\n"
            "  property_type: 'duplex'|'apartment'|'bungalow'|'penthouse'|'terrace'|'land'|'commercial'\n"
            "  min_price: integer NGN\n"
            "  max_price: integer NGN\n"
            "  bedrooms: integer\n"
            "  city: string (Lagos city area — Lekki, Ikoyi, Victoria Island, Ajah, Ikeja, Abuja, Abeokuta)\n"
            "  verified: boolean\n"
            "  keywords: string[]  (amenities/notable features)\n"
            "  summary: string (one-sentence human summary)\n"
            "Prices: '₦50m', '50 million', '50M' = 50000000. '2b' or '2 billion' = 2000000000. "
            "'150k/night' means shortlet. Return only the JSON object, no prose."
        )
        raw = await chat_factory(schema).ask(data.query)
        # Extract JSON (defensive against markdown code fences)
        raw = raw.strip()
        m = re.search(r"\{[\s\S]*\}", raw)
        if not m:
            return {"ok": False, "error": "parse_failed", "raw": raw}
        try:
            parsed = json.loads(m.group(0))
        except Exception:
            return {"ok": False, "error": "invalid_json", "raw": raw}
        return {"ok": True, "filters": parsed}

    return router
