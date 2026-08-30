"""Emergent Object Storage integration — thin wrapper.

Backend-only. The Expo app never sees `EMERGENT_LLM_KEY`; it uploads
photos to us via `/api/uploads/verification-photo` (multipart or
base64) and we forward to storage, then hand back an internal file URL
(`/api/files/{path}`) that our auth-checked download route serves.

Path convention: `amass/uploads/{user_id}/{uuid}.{ext}`.
"""
from __future__ import annotations

import base64
import io
import os
import uuid
from typing import Optional, Tuple

import requests
from fastapi import HTTPException
from starlette.concurrency import run_in_threadpool

_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = _BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = "amass"

_storage_key: Optional[str] = None


def _init_sync() -> str:
    global _storage_key
    if _storage_key:
        return _storage_key
    if not EMERGENT_KEY:
        raise RuntimeError("EMERGENT_LLM_KEY missing from backend .env")
    r = requests.post(
        f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30
    )
    r.raise_for_status()
    _storage_key = r.json()["storage_key"]
    return _storage_key


def _put_sync(path: str, data: bytes, content_type: str) -> dict:
    global _storage_key
    key = _init_sync()
    r = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data,
        timeout=120,
    )
    if r.status_code == 503:
        # Stale key — re-init once and retry.
        _storage_key = None
        key = _init_sync()
        r = requests.put(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key, "Content-Type": content_type},
            data=data,
            timeout=120,
        )
    if r.status_code == 402:
        raise HTTPException(402, "Storage quota exhausted — try again later")
    r.raise_for_status()
    return r.json()


def _get_sync(path: str) -> Tuple[bytes, str]:
    global _storage_key
    key = _init_sync()
    r = requests.get(
        f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60
    )
    if r.status_code == 503:
        _storage_key = None
        key = _init_sync()
        r = requests.get(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key},
            timeout=60,
        )
    if r.status_code == 500:
        # No clean 404 — treat as missing
        raise HTTPException(404, "File not found")
    r.raise_for_status()
    return r.content, r.headers.get("Content-Type", "application/octet-stream")


# ── Async wrappers ───────────────────────────────────────────────
async def init_storage() -> str:
    return await run_in_threadpool(_init_sync)


async def put_object(path: str, data: bytes, content_type: str) -> dict:
    return await run_in_threadpool(_put_sync, path, data, content_type)


async def get_object(path: str) -> Tuple[bytes, str]:
    return await run_in_threadpool(_get_sync, path)


# ── High-level helper ───────────────────────────────────────────
def _guess_ext(content_type: str) -> str:
    ct = (content_type or "").lower()
    if "png" in ct: return "png"
    if "jpeg" in ct or "jpg" in ct: return "jpg"
    if "webp" in ct: return "webp"
    if "heic" in ct: return "heic"
    if "gif" in ct: return "gif"
    return "bin"


async def upload_photo_bytes(user_id: str, data: bytes, content_type: str) -> str:
    """Uploads bytes and returns the storage path (persist this)."""
    if len(data) > 15 * 1024 * 1024:
        raise HTTPException(413, "File too large (max 15 MB)")
    ext = _guess_ext(content_type)
    path = f"{APP_NAME}/uploads/{user_id}/{uuid.uuid4().hex}.{ext}"
    await put_object(path, data, content_type or "application/octet-stream")
    return path


async def upload_photo_base64(user_id: str, data_url_or_b64: str) -> str:
    """Accepts `data:image/jpeg;base64,...` or raw base64 → returns storage path."""
    s = data_url_or_b64.strip()
    content_type = "image/jpeg"
    if s.startswith("data:"):
        try:
            header, b64 = s.split(",", 1)
            if ";base64" not in header:
                raise ValueError("only base64 data URLs accepted")
            content_type = header[len("data:"):].split(";", 1)[0] or "image/jpeg"
            raw = base64.b64decode(b64)
        except Exception as e:
            raise HTTPException(400, f"Invalid base64 data URL: {e}")
    else:
        try:
            raw = base64.b64decode(s)
        except Exception:
            raise HTTPException(400, "Invalid base64 payload")
    return await upload_photo_bytes(user_id, raw, content_type)


async def upload_file_base64(user_id: str, data_url_or_b64: str, extension: str = "bin") -> str:
    """Generic base64 → object-storage upload for non-image payloads (e.g., audio).

    Accepts either a `data:audio/m4a;base64,...` URL or raw base64. Content type
    is preserved from the data URL header when present; otherwise falls back
    to `application/octet-stream`. Storage path uses the supplied `extension`.
    """
    s = data_url_or_b64.strip()
    content_type = "application/octet-stream"
    if s.startswith("data:"):
        try:
            header, b64 = s.split(",", 1)
            if ";base64" not in header:
                raise ValueError("only base64 data URLs accepted")
            content_type = header[len("data:"):].split(";", 1)[0] or content_type
            raw = base64.b64decode(b64)
        except Exception as e:
            raise HTTPException(400, f"Invalid base64 data URL: {e}")
    else:
        try:
            raw = base64.b64decode(s)
        except Exception:
            raise HTTPException(400, "Invalid base64 payload")
    if len(raw) > 15 * 1024 * 1024:
        raise HTTPException(413, "File too large (max 15 MB)")
    ext = (extension or "bin").lstrip(".").lower() or "bin"
    path = f"{APP_NAME}/uploads/{user_id}/{uuid.uuid4().hex}.{ext}"
    await put_object(path, raw, content_type)
    return path
