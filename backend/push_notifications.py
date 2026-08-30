"""AMASS — Emergent-managed push notifications (June 2026)

Frontends register the native device token; backend relays event pushes to
SuprSend via the Emergent gateway. The `EMERGENT_PUSH_KEY` is injected by the
deployer at build time; local dev keeps the "placeholder" value so wiring
compiles without a real key.

DO NOT call the gateway directly from the frontend — this is a backend-only
proxy so the key never leaves the server.
"""
from __future__ import annotations

import logging
import os
from typing import Optional

import httpx
from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

load_dotenv()

logger = logging.getLogger("amass.push")

PUSH_BASE_URL = "https://integrations.emergentagent.com"
PUSH_KEY = os.environ.get("EMERGENT_PUSH_KEY", "placeholder")

# Shared async client. Timeout is intentionally short — push must never block
# the primary request path.
_client = httpx.AsyncClient(
    base_url=PUSH_BASE_URL,
    headers={"X-Push-Key": PUSH_KEY},
    timeout=10.0,
)


class RegisterPushBody(BaseModel):
    user_id: str = Field(..., min_length=1)
    platform: str = Field(..., pattern="^(android|ios|web)$")
    device_token: str = Field(..., min_length=4)


def register_push_routes() -> APIRouter:
    router = APIRouter(prefix="/api", tags=["push"])

    @router.post("/register-push", status_code=201)
    async def register_push(body: RegisterPushBody):
        # Web has no meaningful native push — swallow to keep clients simple.
        if body.platform == "web":
            return {"status": "skipped_web"}
        try:
            resp = await _client.post(
                "/api/v1/push/users/register",
                json=body.model_dump(),
            )
        except httpx.HTTPError as e:
            logger.warning("push register transport error: %s", e)
            raise HTTPException(502, "Push provider unreachable")
        if resp.status_code == 401:
            logger.error("EMERGENT_PUSH_KEY invalid or missing")
            raise HTTPException(500, "Push key not configured")
        if resp.status_code >= 500:
            raise HTTPException(502, "Push provider unavailable")
        try:
            resp.raise_for_status()
        except httpx.HTTPStatusError as e:
            logger.warning("push register 4xx: %s %s", resp.status_code, resp.text[:200])
            raise HTTPException(resp.status_code, "Push registration rejected") from e
        return {"status": "registered"}

    return router


async def send_push(
    recipients: list[str],
    data: dict,
    idempotency_key: Optional[str] = None,
) -> None:
    """Fire-and-forget style relay to the Emergent push gateway.

    Callers should ALWAYS wrap this in try/except — a push failure must never
    block a primary business operation like message-send.
    """
    if not recipients:
        return
    if len(recipients) > 100:
        raise ValueError("max 100 recipients per /trigger call; chunk before sending")
    if "title" not in data or "message" not in data:
        raise ValueError("data must include title and message")

    payload: dict = {"recipients": recipients, "data": data}
    if idempotency_key:
        payload["$idempotency_key"] = idempotency_key

    try:
        resp = await _client.post("/api/v1/push/trigger", json=payload)
    except httpx.HTTPError as e:
        logger.warning("push trigger transport error: %s", e)
        return

    if resp.status_code == 401:
        logger.error("EMERGENT_PUSH_KEY invalid or missing (push not delivered)")
        return
    if resp.status_code >= 500:
        logger.warning("push provider 5xx: %s", resp.status_code)
        return
    if resp.status_code >= 400:
        logger.warning("push trigger 4xx: %s %s", resp.status_code, resp.text[:200])
        return
