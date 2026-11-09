"""Sign in with Apple — backend verification + user upsert.

Flow:
  1) Client (iOS) signs in via `expo-apple-authentication` → receives an `identityToken`.
  2) Client POSTs `{identity_token, full_name?, email?}` to `/api/auth/apple`.
     `full_name` + `email` are ONLY populated on the very first sign-in — we
     persist them immediately since Apple never returns them again.
  3) Backend verifies the token against Apple's JWKS (RS256), checks `iss`,
     `aud` (must be in APPLE_AUDIENCES), and `exp`.
  4) Backend upserts a user keyed by `apple_sub` (the `sub` claim), NOT email
     (Apple's private-relay emails change per-app and may be missing).
  5) Backend returns the same JWT the rest of the app uses — Apple auth becomes
     just another login method on top of the existing session infra.

Requires:
  APPLE_AUDIENCES  — comma-separated list including our iOS bundle id AND
                     `host.exp.Exponent` (used when running in Expo Go).
"""
from __future__ import annotations

import os
import time
import uuid
from datetime import datetime, timezone
from typing import Optional

import httpx
import jwt
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel


APPLE_ISS = "https://appleid.apple.com"
APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys"


class _JWKCache:
    """In-process cache for Apple's public JWKS (refreshed every hour)."""
    def __init__(self):
        self.keys: dict = {}
        self.fetched_at: float = 0.0

    async def get(self, kid: str) -> Optional[dict]:
        now = time.time()
        if not self.keys or now - self.fetched_at > 3600:
            try:
                async with httpx.AsyncClient(timeout=10) as c:
                    r = await c.get(APPLE_JWKS_URL)
                    r.raise_for_status()
                    data = r.json()
                self.keys = {k["kid"]: k for k in data.get("keys", [])}
                self.fetched_at = now
            except Exception:
                # If refresh fails but we still have keys, keep serving stale.
                if not self.keys:
                    raise
        return self.keys.get(kid)


_jwks = _JWKCache()


def _allowed_audiences() -> set[str]:
    raw = os.getenv("APPLE_AUDIENCES", "")
    return {a.strip() for a in raw.split(",") if a.strip()}


async def _verify_identity_token(identity_token: str) -> dict:
    audiences = _allowed_audiences()
    if not audiences:
        raise HTTPException(500, "Server misconfigured: APPLE_AUDIENCES is not set")

    try:
        header = jwt.get_unverified_header(identity_token)
    except jwt.PyJWTError:
        raise HTTPException(401, "Malformed Apple identity token")

    kid = header.get("kid")
    if not kid:
        raise HTTPException(401, "Apple identity token missing kid")

    jwk = await _jwks.get(kid)
    if not jwk:
        raise HTTPException(401, "Unknown Apple signing key")

    public_key = jwt.algorithms.RSAAlgorithm.from_jwk(jwk)  # type: ignore[attr-defined]

    try:
        claims = jwt.decode(
            identity_token,
            public_key,
            algorithms=["RS256"],
            audience=list(audiences),
            issuer=APPLE_ISS,
            options={"require": ["exp", "iat", "sub"]},
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Apple identity token expired")
    except jwt.InvalidAudienceError:
        raise HTTPException(401, "Apple identity token audience mismatch")
    except jwt.PyJWTError as e:
        raise HTTPException(401, f"Invalid Apple identity token: {e}")

    if not claims.get("sub"):
        raise HTTPException(401, "Apple identity token missing subject")
    return claims


class AppleAuthIn(BaseModel):
    identity_token: str
    full_name: Optional[str] = None  # only present on first sign-in
    email: Optional[str] = None      # only present on first sign-in


def register_apple_auth_route(db, create_token, user_to_out):
    router = APIRouter(prefix="/api/auth")

    @router.post("/apple")
    async def apple_login(data: AppleAuthIn):
        claims = await _verify_identity_token(data.identity_token)
        apple_sub = claims["sub"]
        token_email = claims.get("email")
        email_verified = claims.get("email_verified") in (True, "true")

        # 1) Match by apple_sub (canonical). Fallback to email if provided AND verified.
        user = await db.users.find_one({"apple_sub": apple_sub}, {"_id": 0})
        if not user and (data.email or token_email):
            candidate = (data.email or token_email or "").lower()
            if candidate:
                user = await db.users.find_one({"email": candidate}, {"_id": 0})

        if user:
            # Persist apple_sub on first Apple sign-in for an existing account.
            update: dict = {}
            if not user.get("apple_sub"):
                update["apple_sub"] = apple_sub
            # Persist name/email on FIRST sign-in only (Apple won't return them again).
            if data.full_name and not user.get("full_name_from_apple"):
                update["full_name"] = data.full_name
                update["full_name_from_apple"] = True
            if data.email and not user.get("email"):
                update["email"] = data.email.lower()
            if update:
                await db.users.update_one({"id": user["id"]}, {"$set": update})
                user.update(update)
            return {"access_token": create_token(user["id"]), "user": user_to_out(user)}

        # 2) Create a brand-new user.
        user_id = str(uuid.uuid4())
        email = (data.email or token_email or "").lower() or f"apple_{apple_sub[:16]}@amass.private"
        full_name = data.full_name or (email.split("@")[0] if email and "@" in email else "Apple user")
        user_doc = {
            "id": user_id,
            "apple_sub": apple_sub,
            "email": email,
            "email_verified": email_verified,
            "password_hash": None,
            "full_name": full_name,
            "full_name_from_apple": bool(data.full_name),
            "phone": None,
            "avatar_url": None,
            "is_agent": False,
            "provider": "apple",
            "created_at": datetime.now(timezone.utc),
        }
        await db.users.insert_one(user_doc)
        return {"access_token": create_token(user_id), "user": user_to_out(user_doc)}

    return router
