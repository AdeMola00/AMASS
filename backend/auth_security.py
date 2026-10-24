"""AMASS — auth security: password reset (email code) + brute-force lockout.

Follows the Emergent managed-email (Resend) playbook. The reset flow is
account-enumeration-safe: /forgot-password always returns the same response
whether or not the email exists. Reset codes are random 6-digit, hashed at rest
(sha256), single-use, time-limited, and attempt-limited. Login failures are
throttled with a temporary lockout.

Exposes helpers (imported by server.login) + a router (forgot/reset).
"""
from __future__ import annotations

import os
import re
import ipaddress
import hashlib
import secrets
import logging
from datetime import datetime, timedelta, timezone
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field
from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)

# ─── Email (Emergent managed Resend) ────────────────────────────
EMAIL_BASE_URL = "https://integrations.emergentagent.com"  # constant — survives deploy
EMAIL_KEY = os.environ.get("EMERGENT_EMAIL_KEY", "")
EMAIL_FROM_NAME = os.environ.get("EMAIL_FROM_NAME", "AMASS")
EMAIL_REPLY_TO = os.environ.get("EMAIL_REPLY_TO")

# ─── Policy constants ───────────────────────────────────────────
RESET_CODE_TTL_MIN = 15
RESET_MAX_VERIFY_ATTEMPTS = 5
RESET_RESEND_WINDOW_SEC = 60      # min seconds between code emails
RESET_MAX_SENDS_PER_HOUR = 5
LOGIN_MAX_FAILS = 6
LOGIN_LOCK_MINUTES = 15
LOGIN_FAIL_WINDOW_MIN = 15


# ─── Email guardrail gate (from playbook, trimmed; call on every send) ──
_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "goo.gl", "rebrand.ly")
_CRED_ASK = ("reply with your password", "reply with the code", "send your password",
             "send us your password", "enter your password below", "cvv", "seed phrase")


def _host_ok(host: str) -> bool:
    if not host or "xn--" in host:
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)


class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls = set(), []

    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]


def _assert_safe_email(subject: str, html: str) -> None:
    scan = _EmailScan()
    scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms or input fields in email (G2)")
    body = f"{subject}\n{html}".lower()
    for p in _CRED_ASK:
        if p in body:
            raise ValueError(f"Email asks the recipient for credentials: {p!r} (G2)")
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")):
            continue
        if not low.startswith("https://"):
            raise ValueError(f"Email links/assets must be absolute https: {url!r} (G3)")
        host = urlparse(low).hostname or ""
        if not _host_ok(host) or urlparse(low).username is not None:
            raise ValueError(f"Shortened/numeric-host/credential URL: {url!r} (G3)")


async def send_email(*, to: str, subject: str, html: str) -> str | None:
    _assert_safe_email(subject, html)
    payload = {"to": [to], "subject": subject, "html": html, "from_name": EMAIL_FROM_NAME}
    if EMAIL_REPLY_TO:
        payload["contact_email"] = EMAIL_REPLY_TO
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{EMAIL_BASE_URL}/api/v1/email/send",
                headers={"X-Email-Key": EMAIL_KEY},
                json=payload,
            )
        resp.raise_for_status()
        return resp.json().get("id")
    except httpx.HTTPStatusError as e:
        try:
            code = e.response.json().get("code", "")
        except ValueError:
            code = ""
        if code in ("insufficient_credits", "integration_disabled", "daily_limit_reached"):
            logger.warning(f"Email paused: {code} ({e.response.status_code})")
            raise HTTPException(503, "Email is temporarily unavailable")
        if code == "undeliverable_recipient":
            logger.warning(f"Email blocked as undeliverable: {to}")
            raise HTTPException(400, f"{to} can't receive email right now. Check the address on your profile.")
        logger.error(f"Email send failed: {e.response.status_code} {e.response.text}")
        raise HTTPException(502, "Failed to send email")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Email send error: {e}")
        raise HTTPException(500, "Failed to send email")


# ─── Brute-force lockout helpers (keyed by email) ───────────────
def _now() -> datetime:
    return datetime.now(timezone.utc)


async def check_login_locked(db: AsyncIOMotorDatabase, email: str) -> int:
    """Return seconds remaining if the account is temporarily locked, else 0."""
    doc = await db.login_attempts.find_one({"email": email.lower()})
    if not doc:
        return 0
    lu = doc.get("locked_until")
    if lu:
        if lu.tzinfo is None:
            lu = lu.replace(tzinfo=timezone.utc)
        if lu > _now():
            return int((lu - _now()).total_seconds())
    return 0


async def record_login_failure(db: AsyncIOMotorDatabase, email: str) -> None:
    email = email.lower()
    now = _now()
    doc = await db.login_attempts.find_one({"email": email})
    window_start = now - timedelta(minutes=LOGIN_FAIL_WINDOW_MIN)
    if not doc or (doc.get("first_fail_at") and _aware(doc["first_fail_at"]) < window_start):
        await db.login_attempts.update_one(
            {"email": email},
            {"$set": {"email": email, "fails": 1, "first_fail_at": now, "locked_until": None}},
            upsert=True,
        )
        return
    fails = int(doc.get("fails", 0)) + 1
    update = {"fails": fails}
    if fails >= LOGIN_MAX_FAILS:
        update["locked_until"] = now + timedelta(minutes=LOGIN_LOCK_MINUTES)
        update["fails"] = 0  # reset counter; lock window governs
    await db.login_attempts.update_one({"email": email}, {"$set": update})


async def clear_login_failures(db: AsyncIOMotorDatabase, email: str) -> None:
    await db.login_attempts.delete_one({"email": email.lower()})


def _aware(dt: datetime) -> datetime:
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


def _hash_code(code: str) -> str:
    return hashlib.sha256(code.encode("utf-8")).hexdigest()


# ─── Request models ─────────────────────────────────────────────
class ForgotIn(BaseModel):
    email: EmailStr


class ResetIn(BaseModel):
    email: EmailStr
    code: str = Field(min_length=4, max_length=10)
    new_password: str = Field(min_length=6)


GENERIC_FORGOT_MSG = (
    "If an account exists for that email, a reset code is on its way. "
    "Check your inbox (and spam) for a 6-digit code."
)


def register_auth_security_routes(db: AsyncIOMotorDatabase, hash_password) -> APIRouter:
    router = APIRouter(prefix="/api", tags=["auth-security"])

    @router.post("/auth/forgot-password")
    async def forgot_password(data: ForgotIn, request: Request):
        email = data.email.lower().strip()
        user = await db.users.find_one({"email": email}, {"_id": 0, "id": 1, "full_name": 1})
        # Enumeration-safe: identical response regardless of account existence.
        if not user:
            return {"ok": True, "message": GENERIC_FORGOT_MSG}

        now = _now()
        existing = await db.password_resets.find_one({"email": email})
        # Throttle resends.
        if existing:
            last = existing.get("last_sent_at")
            if last and (now - _aware(last)).total_seconds() < RESET_RESEND_WINDOW_SEC:
                return {"ok": True, "message": GENERIC_FORGOT_MSG}
            sends = int(existing.get("sends", 0))
            win = existing.get("window_start")
            if win and (now - _aware(win)).total_seconds() < 3600 and sends >= RESET_MAX_SENDS_PER_HOUR:
                return {"ok": True, "message": GENERIC_FORGOT_MSG}

        code = f"{secrets.randbelow(1_000_000):06d}"
        window_start = existing.get("window_start") if existing and existing.get("window_start") and (now - _aware(existing["window_start"])).total_seconds() < 3600 else now
        sends_next = (int(existing.get("sends", 0)) + 1) if (existing and existing.get("window_start") and (now - _aware(existing["window_start"])).total_seconds() < 3600) else 1
        await db.password_resets.update_one(
            {"email": email},
            {"$set": {
                "email": email,
                "code_hash": _hash_code(code),
                "expires_at": now + timedelta(minutes=RESET_CODE_TTL_MIN),
                "attempts": 0,
                "last_sent_at": now,
                "window_start": window_start,
                "sends": sends_next,
            }},
            upsert=True,
        )
        name = escape((user.get("full_name") or "there").split(" ")[0])
        subject = "Your AMASS password reset code"
        html = (
            '<table role="presentation" width="100%" style="max-width:480px;margin:0 auto;'
            'font-family:Arial,Helvetica,sans-serif"><tr><td style="padding:24px">'
            f'<p style="font-size:16px;color:#111">Hi {name},</p>'
            '<p style="font-size:15px;color:#333">Use this code to reset your AMASS password. '
            f'It expires in {RESET_CODE_TTL_MIN} minutes.</p>'
            f'<p style="font-size:34px;font-weight:800;letter-spacing:8px;color:#111;'
            f'margin:20px 0">{code}</p>'
            '<p style="font-size:13px;color:#666">If you did not request this, you can safely '
            'ignore this email — your password will not change.</p>'
            '<p style="font-size:12px;color:#999;margin-top:24px">Sent by AMASS. For your '
            'security, AMASS will never ask you to share this code by reply.</p>'
            '</td></tr></table>'
        )
        try:
            await send_email(to=email, subject=subject, html=html)
        except HTTPException:
            # Still return the generic message so we never leak provider/account state.
            return {"ok": True, "message": GENERIC_FORGOT_MSG}
        return {"ok": True, "message": GENERIC_FORGOT_MSG}

    @router.post("/auth/reset-password")
    async def reset_password(data: ResetIn):
        email = data.email.lower().strip()
        rec = await db.password_resets.find_one({"email": email})
        invalid = HTTPException(400, "That code is invalid or has expired. Request a new one.")
        if not rec:
            raise invalid
        if _aware(rec["expires_at"]) < _now():
            await db.password_resets.delete_one({"email": email})
            raise invalid
        if int(rec.get("attempts", 0)) >= RESET_MAX_VERIFY_ATTEMPTS:
            await db.password_resets.delete_one({"email": email})
            raise HTTPException(429, "Too many attempts. Please request a new code.")
        if _hash_code(data.code.strip()) != rec.get("code_hash"):
            await db.password_resets.update_one({"email": email}, {"$inc": {"attempts": 1}})
            raise invalid
        user = await db.users.find_one({"email": email}, {"_id": 0, "id": 1})
        if not user:
            await db.password_resets.delete_one({"email": email})
            raise invalid
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {"password_hash": hash_password(data.new_password)}},
        )
        await db.password_resets.delete_one({"email": email})
        await clear_login_failures(db, email)
        return {"ok": True, "message": "Your password has been reset. You can now sign in."}

    return router
