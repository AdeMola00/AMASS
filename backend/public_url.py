"""Public HTTPS origin of this API — for links and images inside emails.

Most emails go out from background tasks (receipts, reminders, digests) where there is no request to read the
origin from. Resolution order:
  1. PUBLIC_API_BASE / EXPO_BACKEND_URL env (explicit override)
  2. the origin seen on the first real inbound request (ingress forwards X-Forwarded-Host), remembered in memory
     and in `runtime_state` so it survives restarts and is ready before the first request after a deploy.
Always https — email guardrails reject http assets, and every public ingress terminates TLS.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone

logger = logging.getLogger("amass.public_url")

_KEY = "public_api_base"
_remembered = ""
_LOCAL = ("localhost", "127.0.0.1", "0.0.0.0", "[::1]")


def public_api_base() -> str:
    env = (os.getenv("PUBLIC_API_BASE") or os.getenv("EXPO_BACKEND_URL") or "").strip().rstrip("/")
    return env or _remembered


def _origin_from(headers) -> str:
    host = (headers.get("x-forwarded-host") or headers.get("host") or "").split(",")[0].strip()
    if not host or host.split(":")[0] in _LOCAL or host.startswith(_LOCAL):
        return ""
    return f"https://{host}"


async def load_remembered(db) -> None:
    global _remembered
    try:
        doc = await db.runtime_state.find_one({"key": _KEY}, {"_id": 0, "value": 1})
        if doc and doc.get("value"):
            _remembered = str(doc["value"]).rstrip("/")
    except Exception as e:  # never block boot
        logger.warning("public base load failed: %s", e)


async def remember_from_request(db, request) -> None:
    """Called by the HTTP middleware; a no-op once an origin is known."""
    global _remembered
    if _remembered:
        return
    origin = _origin_from(request.headers)
    if not origin:
        return
    _remembered = origin
    logger.info("public API base learned from request: %s", origin)
    try:
        await db.runtime_state.update_one({"key": _KEY}, {"$set": {"key": _KEY, "value": origin, "updated_at": datetime.now(timezone.utc)}}, upsert=True)
    except Exception as e:
        logger.warning("public base persist failed: %s", e)
