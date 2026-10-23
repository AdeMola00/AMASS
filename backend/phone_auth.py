"""Phone number + one-time code sign-in (primary mobile sign-in).

Provider switch (env `SMS_PROVIDER`):
  • mock   — default. No SMS is sent; the code is always MOCK_OTP_CODE (123456) and the
             start response carries `mocked: true` + a dev hint. Used until real keys exist.
  • termii — Termii (Nigeria-first). Needs TERMII_API_KEY, TERMII_SENDER_ID.
  • twilio — Twilio Verify. Needs TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID.
             Twilio stores/validates the code itself, so we only keep the session + counters.

Security model
  • Codes are never stored in clear: sha256(code · phone · secret). 6 digits, 10-minute TTL.
  • Per-phone throttle: 60 s cooldown between sends, max 5 sends / hour.
  • Max 5 wrong attempts per session → session burned, phone locked for 15 min.
  • Purposes: signin (creates the account on first verify), link (attach a phone to the
    signed-in account), change (replace the phone on the signed-in account — same data,
    same user id). A verified phone can belong to exactly one account.
  • Recovery: phone-only users can add email+password later (POST /auth/account/add-email)
    so the existing forgot-password flow becomes a second recovery path. The phone itself
    is always a recovery path for accounts that have one.

Routes (all under /api/auth):
  POST /phone/start        {phone | dial_code+number, purpose}
  POST /phone/verify       {phone, code, full_name?}  → TokenOut (signin) | {ok} (link/change)
  POST /phone/resend       {phone, purpose}           → same throttle as start
  POST /account/add-email  {email, password}          (auth) phone-only → adds email credential
  GET  /phone/status                                  (auth) {phone_masked, verified, provider}
"""
from __future__ import annotations

import hashlib
import hmac
import os
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field

MOCK_OTP_CODE = "123456"
OTP_TTL_MIN = 10
SEND_COOLDOWN_S = 60
MAX_SENDS_PER_HOUR = 5
MAX_ATTEMPTS = 5
LOCK_MINUTES = 15

E164 = re.compile(r"^\+[1-9]\d{6,14}$")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: datetime) -> datetime:
    """Motor returns naive UTC datetimes; make them comparable with _now()."""
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def normalize_phone(phone: Optional[str], dial_code: Optional[str] = None, number: Optional[str] = None) -> str:
    """Return an E.164 string or raise 400. Accepts '+2348012345678', '08012345678'+'+234', '00234…'."""
    raw = (phone or "").strip()
    if not raw and dial_code and number:
        cc = re.sub(r"\D", "", dial_code)
        nat = re.sub(r"\D", "", number)
        if nat.startswith("0"):
            nat = nat[1:]
        raw = f"+{cc}{nat}"
    raw = re.sub(r"[\s\-().]", "", raw)
    if raw.startswith("00"):
        raw = "+" + raw[2:]
    if not E164.match(raw):
        raise HTTPException(400, "Enter a valid phone number with country code, e.g. +234 801 234 5678")
    return raw


def mask_phone(phone: Optional[str]) -> Optional[str]:
    if not phone:
        return None
    return phone[:4] + "•" * max(0, len(phone) - 7) + phone[-3:]


# ─── Providers ────────────────────────────────────────────
class SmsProvider:
    name = "mock"
    managed_codes = False  # True when the provider validates the code itself (Twilio Verify)

    async def send(self, phone: str, code: str) -> None:  # pragma: no cover - mock
        return None

    async def check(self, phone: str, code: str) -> bool:  # only for managed_codes providers
        raise NotImplementedError


class MockProvider(SmsProvider):
    name = "mock"


class TermiiProvider(SmsProvider):
    name = "termii"

    def __init__(self) -> None:
        self.api_key = os.environ["TERMII_API_KEY"]
        self.sender = os.environ.get("TERMII_SENDER_ID", "AMASS")
        self.base = os.environ.get("TERMII_BASE_URL", "https://api.ng.termii.com")

    async def send(self, phone: str, code: str) -> None:
        payload = {
            "to": phone.lstrip("+"),
            "from": self.sender,
            "sms": f"Your AMASS code is {code}. It expires in {OTP_TTL_MIN} minutes. Never share it.",
            "type": "plain",
            "channel": "dnd",
            "api_key": self.api_key,
        }
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(f"{self.base}/api/sms/send", json=payload)
        if r.status_code >= 400:
            raise HTTPException(502, "We couldn't send the code right now. Please try again in a moment.")


class TwilioVerifyProvider(SmsProvider):
    name = "twilio"
    managed_codes = True

    def __init__(self) -> None:
        self.sid = os.environ["TWILIO_ACCOUNT_SID"]
        self.token = os.environ["TWILIO_AUTH_TOKEN"]
        self.service = os.environ["TWILIO_VERIFY_SERVICE_SID"]
        self.base = f"https://verify.twilio.com/v2/Services/{self.service}"

    async def send(self, phone: str, code: str) -> None:
        async with httpx.AsyncClient(timeout=15, auth=(self.sid, self.token)) as client:
            r = await client.post(f"{self.base}/Verifications", data={"To": phone, "Channel": "sms"})
        if r.status_code >= 400:
            raise HTTPException(502, "We couldn't send the code right now. Please try again in a moment.")

    async def check(self, phone: str, code: str) -> bool:
        async with httpx.AsyncClient(timeout=15, auth=(self.sid, self.token)) as client:
            r = await client.post(f"{self.base}/VerificationCheck", data={"To": phone, "Code": code})
        return r.status_code < 400 and r.json().get("status") == "approved"


def build_provider() -> SmsProvider:
    kind = (os.environ.get("SMS_PROVIDER") or "mock").lower()
    try:
        if kind == "termii":
            return TermiiProvider()
        if kind == "twilio":
            return TwilioVerifyProvider()
    except KeyError:
        # Keys missing → fall back to mock rather than breaking sign-in.
        pass
    return MockProvider()


# ─── Schemas ──────────────────────────────────────────────
Purpose = Literal["signin", "link", "change"]


class PhoneStartIn(BaseModel):
    phone: Optional[str] = None
    dial_code: Optional[str] = None
    number: Optional[str] = None
    purpose: Purpose = "signin"


class PhoneVerifyIn(BaseModel):
    phone: str
    code: str = Field(min_length=4, max_length=8)
    purpose: Purpose = "signin"
    full_name: Optional[str] = Field(None, max_length=80)
    referral_code: Optional[str] = None


class AddEmailIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)


def register_phone_auth_routes(db, get_current_user, bearer, decode_user_id, create_token, user_to_out, hash_password):
    router = APIRouter(prefix="/api/auth", tags=["phone-auth"])
    provider = build_provider()
    secret = os.environ.get("JWT_SECRET", "amass-dev-secret")

    def _hash(code: str, phone: str) -> str:
        return hmac.new(secret.encode(), f"{code}·{phone}".encode(), hashlib.sha256).hexdigest()

    async def _optional_user(creds) -> Optional[dict]:
        if not creds:
            return None
        uid = decode_user_id(creds.credentials)
        if not uid:
            return None
        return await db.users.find_one({"id": uid}, {"_id": 0})

    async def _throttle(phone: str) -> None:
        lock = await db.phone_otp_locks.find_one({"phone": phone}, {"_id": 0})
        if lock and _aware(lock["until"]) > _now():
            mins = max(1, round((_aware(lock["until"]) - _now()).total_seconds() / 60))
            raise HTTPException(429, f"Too many attempts. Try again in about {mins} minute(s).")
        hour_ago = _now() - timedelta(hours=1)
        sends = await db.phone_otp_sends.count_documents({"phone": phone, "at": {"$gte": hour_ago}})
        if sends >= MAX_SENDS_PER_HOUR:
            raise HTTPException(429, "You've requested too many codes. Please wait an hour or sign in another way.")
        last = await db.phone_otp_sends.find_one({"phone": phone}, sort=[("at", -1)])
        if last and (_now() - _aware(last["at"])).total_seconds() < SEND_COOLDOWN_S:
            wait = SEND_COOLDOWN_S - int((_now() - _aware(last["at"])).total_seconds())
            raise HTTPException(429, f"Please wait {wait}s before requesting another code.")

    async def _start(phone: str, purpose: Purpose, user: Optional[dict]):
        if purpose in ("link", "change") and not user:
            raise HTTPException(401, "Sign in first to link a phone number")
        if purpose in ("link", "change"):
            other = await db.users.find_one({"phone": phone, "phone_verified": True, "id": {"$ne": user["id"]}}, {"_id": 0, "id": 1})
            if other:
                raise HTTPException(409, "That phone number is already linked to another AMASS account.")
        await _throttle(phone)
        code = MOCK_OTP_CODE if provider.name == "mock" else f"{secrets.randbelow(10**6):06d}"
        now = _now()
        await db.phone_otp_sessions.update_one(
            {"phone": phone},
            {"$set": {
                "phone": phone,
                "purpose": purpose,
                "code_hash": None if provider.managed_codes else _hash(code, phone),
                "attempts": 0,
                "user_id": user["id"] if user else None,
                "expires_at": now + timedelta(minutes=OTP_TTL_MIN),
                "created_at": now,
            }},
            upsert=True,
        )
        await db.phone_otp_sends.insert_one({"phone": phone, "at": now, "purpose": purpose})
        await provider.send(phone, code)
        out = {
            "ok": True,
            "phone": phone,
            "phone_masked": mask_phone(phone),
            "expires_in": OTP_TTL_MIN * 60,
            "cooldown_seconds": SEND_COOLDOWN_S,
            "provider": provider.name,
            "mocked": provider.name == "mock",
        }
        if provider.name == "mock":
            out["dev_hint"] = f"SMS is mocked — use code {MOCK_OTP_CODE}"
        return out

    @router.post("/phone/start")
    async def phone_start(data: PhoneStartIn, creds=Depends(bearer)):
        phone = normalize_phone(data.phone, data.dial_code, data.number)
        user = await _optional_user(creds)
        return await _start(phone, data.purpose, user)

    @router.post("/phone/resend")
    async def phone_resend(data: PhoneStartIn, creds=Depends(bearer)):
        phone = normalize_phone(data.phone, data.dial_code, data.number)
        user = await _optional_user(creds)
        return await _start(phone, data.purpose, user)

    @router.post("/phone/verify")
    async def phone_verify(data: PhoneVerifyIn, creds=Depends(bearer)):
        phone = normalize_phone(data.phone)
        lock = await db.phone_otp_locks.find_one({"phone": phone}, {"_id": 0})
        if lock and _aware(lock["until"]) > _now():
            raise HTTPException(429, "Too many wrong codes. Please wait a few minutes and request a new code.")
        sess = await db.phone_otp_sessions.find_one({"phone": phone}, {"_id": 0})
        if not sess:
            raise HTTPException(400, "No code was requested for this number. Tap “Send code” first.")
        if _aware(sess["expires_at"]) < _now():
            await db.phone_otp_sessions.delete_one({"phone": phone})
            raise HTTPException(400, "That code has expired. Request a new one.")
        if sess.get("purpose") != data.purpose:
            raise HTTPException(400, "This code was issued for a different action. Request a new one.")

        ok = (await provider.check(phone, data.code)) if provider.managed_codes else hmac.compare_digest(sess.get("code_hash") or "", _hash(data.code.strip(), phone))
        if not ok:
            attempts = int(sess.get("attempts", 0)) + 1
            if attempts >= MAX_ATTEMPTS:
                await db.phone_otp_sessions.delete_one({"phone": phone})
                await db.phone_otp_locks.update_one({"phone": phone}, {"$set": {"until": _now() + timedelta(minutes=LOCK_MINUTES)}}, upsert=True)
                raise HTTPException(429, f"Too many wrong codes. Try again in {LOCK_MINUTES} minutes.")
            await db.phone_otp_sessions.update_one({"phone": phone}, {"$set": {"attempts": attempts}})
            left = MAX_ATTEMPTS - attempts
            raise HTTPException(400, f"That code isn't right. {left} attempt{'s' if left != 1 else ''} left.")

        await db.phone_otp_sessions.delete_one({"phone": phone})
        await db.phone_otp_locks.delete_many({"phone": phone})
        now = _now()

        if data.purpose in ("link", "change"):
            user = await _optional_user(creds)
            if not user or user["id"] != sess.get("user_id"):
                raise HTTPException(401, "Sign in first to link a phone number")
            other = await db.users.find_one({"phone": phone, "phone_verified": True, "id": {"$ne": user["id"]}}, {"_id": 0, "id": 1})
            if other:
                raise HTTPException(409, "That phone number is already linked to another AMASS account.")
            await db.users.update_one({"id": user["id"]}, {"$set": {"phone": phone, "phone_verified": True, "phone_verified_at": now}})
            await db.social_profiles.update_one({"user_id": user["id"]}, {"$set": {"phone_hash": hashlib.sha256(phone.encode()).hexdigest()}}, upsert=False)
            return {"ok": True, "phone": phone, "phone_masked": mask_phone(phone), "changed": data.purpose == "change"}

        # signin → existing verified-phone account or a brand-new phone-only account
        user = await db.users.find_one({"phone": phone, "phone_verified": True}, {"_id": 0})
        is_new = False
        if not user:
            # Claim an unverified phone typed at email registration if it's unique.
            legacy = await db.users.find({"phone": phone}, {"_id": 0}).to_list(2)
            if len(legacy) == 1:
                user = legacy[0]
                await db.users.update_one({"id": user["id"]}, {"$set": {"phone_verified": True, "phone_verified_at": now}})
                user["phone_verified"] = True
            else:
                is_new = True
                user = {
                    "id": str(uuid.uuid4()),
                    "email": None,
                    "password_hash": None,
                    "full_name": (data.full_name or "").strip() or "AMASS neighbour",
                    "phone": phone,
                    "phone_verified": True,
                    "phone_verified_at": now,
                    "auth_provider": "phone",
                    "avatar_url": None,
                    "is_agent": False,
                    "created_at": now,
                }
                await db.users.insert_one(user.copy())
        elif data.full_name and (user.get("full_name") in (None, "", "AMASS neighbour")):
            await db.users.update_one({"id": user["id"]}, {"$set": {"full_name": data.full_name.strip()}})
            user["full_name"] = data.full_name.strip()
        await db.analytics_events.insert_one({"id": str(uuid.uuid4()), "name": "signin_complete", "user_id": user["id"], "props": {"method": "phone", "is_new": is_new}, "created_at": now})
        return {"access_token": create_token(user["id"]), "token_type": "bearer", "user": user_to_out(user).model_dump(mode="json"), "is_new": is_new}

    @router.get("/phone/status")
    async def phone_status(user: dict = Depends(get_current_user)):
        return {
            "phone_masked": mask_phone(user.get("phone")),
            "verified": bool(user.get("phone_verified")),
            "has_email_credential": bool(user.get("email")) and bool(user.get("password_hash")),
            "provider": provider.name,
            "mocked": provider.name == "mock",
        }

    @router.post("/account/add-email")
    async def add_email(data: AddEmailIn, user: dict = Depends(get_current_user)):
        """Phone-only accounts add an email + password so forgot-password works as recovery."""
        if user.get("email") and user.get("password_hash"):
            raise HTTPException(400, "This account already has an email sign-in. Use “Change password” instead.")
        email = data.email.lower()
        taken = await db.users.find_one({"email": email, "id": {"$ne": user["id"]}}, {"_id": 0, "id": 1})
        if taken:
            raise HTTPException(409, "That email is already used by another account.")
        await db.users.update_one({"id": user["id"]}, {"$set": {"email": email, "password_hash": hash_password(data.password)}})
        return {"ok": True, "email": email}

    return router


async def ensure_phone_auth_indexes(db) -> None:
    # users.email must allow many phone-only accounts (email: null) → partial unique index.
    info = await db.users.index_information()
    if "email_1" in info and not info["email_1"].get("partialFilterExpression"):
        await db.users.drop_index("email_1")
    await db.users.create_index("email", unique=True, partialFilterExpression={"email": {"$type": "string"}}, name="users_email_uniq")
    # Legacy mocked verifications may have left the same phone "verified" on several accounts;
    # keep the earliest, un-verify the rest so the uniqueness guarantee can be enforced.
    async for grp in db.users.aggregate([
        {"$match": {"phone": {"$type": "string"}, "phone_verified": True}},
        {"$sort": {"created_at": 1}},
        {"$group": {"_id": "$phone", "ids": {"$push": "$id"}, "n": {"$sum": 1}}},
        {"$match": {"n": {"$gt": 1}}},
    ]):
        await db.users.update_many({"id": {"$in": grp["ids"][1:]}}, {"$set": {"phone_verified": False, "phone_verified_revoked": "duplicate_cleanup"}})
    await db.users.create_index("phone", unique=True, partialFilterExpression={"phone": {"$type": "string"}, "phone_verified": True}, name="users_verified_phone_uniq")
    await db.phone_otp_sessions.create_index("phone", unique=True)
    await db.phone_otp_sessions.create_index("expires_at", expireAfterSeconds=0)
    await db.phone_otp_sends.create_index([("phone", 1), ("at", -1)])
    await db.phone_otp_sends.create_index("at", expireAfterSeconds=3600 * 2)
    await db.phone_otp_locks.create_index("phone", unique=True)
    await db.phone_otp_locks.create_index("until", expireAfterSeconds=0)
