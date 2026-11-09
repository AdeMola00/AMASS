"""AMASS — Emergent-managed Google Auth bridge (June 2026)

Bridges the Emergent hosted Google OAuth flow into the existing AMASS JWT
auth. Client sends the one-time `session_id` from the redirect URL; we call
Emergent's `session-data` endpoint, upsert-by-email in the `users` collection
(no duplicates), and return the same `{access_token, user}` shape as
`/api/auth/login` so the existing `AuthContext.signIn` flow can reuse it.

Idempotent: repeated calls with the same `session_id` return 401 (Emergent
rejects consumed IDs) — the frontend guards this via a Set.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel, Field


logger = logging.getLogger("amass.auth.google")

EMERGENT_SESSION_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"


class GoogleSessionIn(BaseModel):
    session_id: str = Field(..., min_length=8, max_length=512)


def register_google_auth_routes(
    db,
    create_token,           # (user_id) -> jwt
    user_to_out,            # (user_doc) -> UserOut
    hash_password,          # (raw) -> str  (for placeholder passwords)
) -> APIRouter:
    router = APIRouter(prefix="/api/auth", tags=["auth"])

    @router.post("/google-session")
    async def google_session(data: GoogleSessionIn = Body(...)):
        # 1. Exchange one-time session_id → user profile at Emergent
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    EMERGENT_SESSION_URL,
                    headers={"X-Session-ID": data.session_id},
                )
        except httpx.HTTPError as e:
            logger.warning("google session_id transport error: %s", e)
            raise HTTPException(502, "Google sign-in unavailable, try again")

        if resp.status_code != 200:
            # 401 / 404 / etc — invalid, expired, or already-used
            raise HTTPException(401, "Google sign-in expired — please retry")

        try:
            body = resp.json()
        except Exception:
            raise HTTPException(502, "Malformed Google session payload")

        email_raw = (body.get("email") or "").strip().lower()
        if not email_raw:
            raise HTTPException(400, "Google account did not return an email")

        full_name = (body.get("name") or "").strip() or email_raw.split("@")[0]
        avatar_url = body.get("picture") or None

        # 2. Upsert by email — link to existing account if password user exists
        existing = await db.users.find_one({"email": email_raw}, {"_id": 0})
        if existing:
            # Link Google provider metadata; never overwrite name/avatar unless empty
            patch: dict = {"$set": {"google_linked": True, "google_linked_at": datetime.now(timezone.utc)}}
            unset_needed = {}
            if not existing.get("avatar_url") and avatar_url:
                patch["$set"]["avatar_url"] = avatar_url
            if not existing.get("full_name"):
                patch["$set"]["full_name"] = full_name
            await db.users.update_one({"id": existing["id"]}, patch)
            user_doc = await db.users.find_one({"id": existing["id"]}, {"_id": 0})
        else:
            # New user — mint one with a random password hash so email/password
            # login won't accidentally succeed for this account without a reset.
            user_id = str(uuid.uuid4())
            user_doc = {
                "id": user_id,
                "email": email_raw,
                # opaque bcrypt hash of a strong random — user must use Google
                # OR go through password-reset to convert to password login.
                "password_hash": hash_password(uuid.uuid4().hex + uuid.uuid4().hex),
                "full_name": full_name,
                "phone": None,
                "avatar_url": avatar_url,
                "is_agent": False,
                "google_linked": True,
                "google_linked_at": datetime.now(timezone.utc),
                "created_at": datetime.now(timezone.utc),
            }
            await db.users.insert_one(user_doc)

        # 3. Mint AMASS JWT and return existing TokenOut shape
        token = create_token(user_doc["id"])
        return {"access_token": token, "user": user_to_out(user_doc)}

    return router
