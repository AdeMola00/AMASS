"""Scoped JWTs for the two non-app account types.

  typ="portal" — AMASS Admin Portal staff (admin_staff docs, or app users with is_admin as super_admin)
  typ="brand"  — brand-only logins created by an AMASS admin (brand_accounts docs)

Every token carries typ + aud and is checked for both, so a brand token can never act as a portal/app token and
vice-versa (server.get_current_user additionally rejects any token that carries a typ claim). Same HS256 secret as
the app, short expiry, jti for traceability. Login throttling reuses auth_security's Mongo-backed lockout with a
namespaced key so portal/brand lockouts never collide with app accounts.
"""
from __future__ import annotations

import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

JWT_SECRET = os.environ.get("JWT_SECRET")
JWT_ALG = "HS256"
TOKEN_HOURS = {"portal": 12, "brand": 12}
MIN_PASSWORD = 8

bearer = HTTPBearer(auto_error=False)
_DUMMY_HASH = bcrypt.hashpw(secrets.token_urlsafe(16).encode(), bcrypt.gensalt()).decode()


def now() -> datetime:
    return datetime.now(timezone.utc)


def norm_email(email: str) -> str:
    return (email or "").strip().lower()


def hash_password(pw: str) -> str:
    if len(pw or "") < MIN_PASSWORD:
        raise HTTPException(422, f"Password must be at least {MIN_PASSWORD} characters")
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(pw: str, hashed: Optional[str]) -> bool:
    """Constant-work verify: unknown accounts still cost one bcrypt check (no timing-based enumeration)."""
    try:
        return bcrypt.checkpw((pw or "").encode("utf-8"), (hashed or _DUMMY_HASH).encode("utf-8")) and bool(hashed)
    except Exception:
        return False


def issue_scoped_token(sub: str, typ: str, **extra) -> str:
    issued = now()
    payload = {"sub": sub, "typ": typ, "aud": f"{typ}-api", "iat": issued, "exp": issued + timedelta(hours=TOKEN_HOURS[typ]), "jti": secrets.token_urlsafe(12), **extra}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def decode_scoped(creds: Optional[HTTPAuthorizationCredentials], typ: str) -> dict:
    if not creds or creds.scheme.lower() != "bearer":
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALG], audience=f"{typ}-api", options={"require": ["sub", "typ", "aud", "exp"]})
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid or expired token")
    if payload.get("typ") != typ:
        raise HTTPException(403, f"{typ.title()} token required")
    return payload


async def throttle_check(db, typ: str, email: str) -> None:
    from auth_security import check_login_locked

    wait = await check_login_locked(db, f"{typ}:{email}")
    if wait:
        raise HTTPException(429, f"Too many attempts. Try again in {max(1, wait // 60)} min.")


async def throttle_fail(db, typ: str, email: str) -> None:
    from auth_security import record_login_failure

    await record_login_failure(db, f"{typ}:{email}")


async def throttle_clear(db, typ: str, email: str) -> None:
    from auth_security import clear_login_failures

    await clear_login_failures(db, f"{typ}:{email}")
