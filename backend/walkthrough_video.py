"""Walkthrough videos for listings — Redfin-style camera badge on the map pin + a player on the property page.

A listing may carry one `walkthrough_video`:
    {"url": str, "provider": "youtube" | "vimeo" | "upload", "video_id": str|None, "embed_url": str|None,
     "thumbnail": str|None, "added_at": datetime}

Listers add it two ways (the owner chose both): paste a YouTube / Vimeo link, or upload a video file from the phone.
Uploads travel in ~1.5 MB chunks (`/api/uploads/video/chunk` → `/api/uploads/video/complete`) so the ingress body
limit never bites, are capped at VIDEO_MAX_MB and land in Emergent Object Storage under `amass/public/…` (served by
/api/public-files with HTTP Range support so players can seek).

Visibility follows the gallery gate: everyone sees *that* a listing has a walkthrough (`has_video`, the camera badge);
the video itself is part of the unlock, like the full photo set.
"""
from __future__ import annotations

import asyncio
import logging
import os
import re
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

logger = logging.getLogger("amass.walkthrough")

VIDEO_MAX_MB = 80
CHUNK_MAX_MB = 4
CHUNK_DIR = Path(os.environ.get("AMASS_UPLOAD_TMP") or "/tmp/amass_uploads")
VIDEO_EXT = (".mp4", ".mov", ".m4v", ".webm", ".mkv")
VIDEO_MIME = {"video/mp4": "mp4", "video/quicktime": "mov", "video/x-m4v": "m4v", "video/webm": "webm", "video/x-matroska": "mkv"}

_YT = re.compile(r"(?:youtube\.com/(?:watch\?(?:.*&)?v=|shorts/|embed/|live/)|youtu\.be/)([A-Za-z0-9_-]{11})")
_VIMEO = re.compile(r"vimeo\.com/(?:video/)?(\d{6,12})")


def now() -> datetime:
    return datetime.now(timezone.utc)


def parse_video_link(url: Optional[str]) -> Optional[dict]:
    """Normalise a pasted link / uploaded file URL into the stored shape. Raises 400 on junk."""
    s = (url or "").strip()
    if not s:
        return None
    m = _YT.search(s)
    if m:
        vid = m.group(1)
        return {"url": f"https://www.youtube.com/watch?v={vid}", "provider": "youtube", "video_id": vid, "embed_url": f"https://www.youtube-nocookie.com/embed/{vid}?playsinline=1&rel=0&modestbranding=1", "thumbnail": f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg", "added_at": now()}
    m = _VIMEO.search(s)
    if m:
        vid = m.group(1)
        return {"url": f"https://vimeo.com/{vid}", "provider": "vimeo", "video_id": vid, "embed_url": f"https://player.vimeo.com/video/{vid}?playsinline=1&dnt=1", "thumbnail": None, "added_at": now()}
    if s.startswith("https://") and "/api/public-files/" in s and _is_own_upload(s):
        return {"url": s, "provider": "upload", "video_id": None, "embed_url": None, "thumbnail": None, "added_at": now()}
    raise HTTPException(400, "Paste a YouTube or Vimeo link, or upload a video file (MP4 / MOV)")


def _is_own_upload(url: str) -> bool:
    """Only videos that went through /uploads/video/* (our object storage) count as uploads — no hot-linking other hosts."""
    from object_storage import APP_NAME

    path = url.split("/api/public-files/", 1)[1].split("?")[0]
    return path.startswith(f"{APP_NAME}/public/") and path.lower().endswith(VIDEO_EXT)


def video_fields(doc: dict, unlocked: bool) -> dict:
    """What to attach to a public property / marker payload."""
    wv = doc.get("walkthrough_video") or None
    out: dict = {"has_video": bool(wv and wv.get("url"))}
    if wv and unlocked:
        out["walkthrough_video"] = {k: wv.get(k) for k in ("url", "provider", "video_id", "embed_url", "thumbnail")}
    return out


# ─── demo data ───
DEMO_TOURS = [  # real Lagos home tours on YouTube — verified reachable via oEmbed
    "https://www.youtube.com/watch?v=XgfKgbQhtNs",
    "https://www.youtube.com/watch?v=mRkfUz4BEro",
    "https://www.youtube.com/watch?v=9fbA9vri-Fk",
    "https://www.youtube.com/watch?v=1ZTvDHgc7sI",
    "https://www.youtube.com/watch?v=9kVBsqcUsOs",
    "https://www.youtube.com/watch?v=YTi6X72q9pk",
]


async def seed_demo_walkthroughs(db) -> dict:
    """Give a handful of verified demo homes a walkthrough so the camera badge is visible right away. Idempotent."""
    if await db.properties.count_documents({"walkthrough_video.url": {"$exists": True}}) >= len(DEMO_TOURS):
        return {"skipped": True}
    docs = await db.properties.find({"verified": True, "images.0": {"$exists": True}, "walkthrough_video": {"$exists": False}, "status": {"$nin": ["sold", "archived"]}}, {"_id": 0, "id": 1, "price": 1}).sort("price", -1).limit(len(DEMO_TOURS)).to_list(len(DEMO_TOURS))
    n = 0
    for d, link in zip(docs, DEMO_TOURS):
        await db.properties.update_one({"id": d["id"]}, {"$set": {"walkthrough_video": {**parse_video_link(link), "demo": True}}})
        n += 1
    return {"seeded": n}


# ─── chunked upload ───
def _part_dir(user_id: str, upload_id: str) -> Path:
    if not re.fullmatch(r"[A-Za-z0-9_-]{8,64}", upload_id):
        raise HTTPException(400, "Bad upload id")
    return CHUNK_DIR / re.sub(r"[^A-Za-z0-9_-]", "", user_id)[:64] / upload_id


class CompleteIn(BaseModel):
    upload_id: str
    total: int
    mime: str = "video/mp4"
    filename: Optional[str] = None


class WalkthroughIn(BaseModel):
    url: Optional[str] = None  # None / "" clears the walkthrough


def register_walkthrough_routes(db, get_current_user) -> APIRouter:
    router = APIRouter(prefix="/api", tags=["walkthrough"])

    @router.post("/uploads/video/chunk")
    async def upload_chunk(upload_id: str = Form(...), index: int = Form(...), total: int = Form(...), chunk: UploadFile = File(...), user: dict = Depends(get_current_user)):
        if total < 1 or total > 400 or index < 0 or index >= total:
            raise HTTPException(400, "Bad chunk index")
        data = await chunk.read()
        if len(data) > CHUNK_MAX_MB * 1024 * 1024:
            raise HTTPException(413, f"Chunk too large (max {CHUNK_MAX_MB} MB)")
        if (index + 1) * len(data) > (VIDEO_MAX_MB + CHUNK_MAX_MB) * 1024 * 1024:
            raise HTTPException(413, f"Video too large (max {VIDEO_MAX_MB} MB)")
        d = _part_dir(user["id"], upload_id)
        d.mkdir(parents=True, exist_ok=True)
        await asyncio.to_thread((d / f"{index:04d}.part").write_bytes, data)
        received = len(list(d.glob("*.part")))
        return {"ok": True, "received": received, "total": total}

    @router.post("/uploads/video/complete")
    async def upload_complete(body: CompleteIn, user: dict = Depends(get_current_user)):
        d = _part_dir(user["id"], body.upload_id)
        parts = sorted(d.glob("*.part")) if d.exists() else []
        if len(parts) != body.total:
            raise HTTPException(400, f"Upload incomplete — {len(parts)} of {body.total} chunks received")
        mime = (body.mime or "").split(";")[0].strip().lower() or "video/mp4"
        ext = VIDEO_MIME.get(mime) or (Path(body.filename or "").suffix.lstrip(".").lower() or "mp4")
        if mime not in VIDEO_MIME and not mime.startswith("video/"):
            raise HTTPException(400, "Only video files can be uploaded as a walkthrough")

        def _assemble() -> bytes:
            buf = bytearray()
            for p in parts:
                buf.extend(p.read_bytes())
            shutil.rmtree(d, ignore_errors=True)
            return bytes(buf)

        data = await asyncio.to_thread(_assemble)
        if len(data) > VIDEO_MAX_MB * 1024 * 1024:
            raise HTTPException(413, f"Video too large (max {VIDEO_MAX_MB} MB) — trim it or upload to YouTube and paste the link")
        if len(data) < 1024:
            raise HTTPException(400, "That file looks empty")
        from object_storage import APP_NAME, put_object
        from public_url import public_api_base

        path = f"{APP_NAME}/public/{user['id']}/walkthrough-{uuid.uuid4().hex}.{ext}"
        await put_object(path, data, mime if mime in VIDEO_MIME else "video/mp4")
        return {"url": f"{public_api_base()}/api/public-files/{path}", "path": path, "bytes": len(data)}

    @router.patch("/properties/{property_id}/walkthrough")
    async def set_walkthrough(property_id: str, body: WalkthroughIn, user: dict = Depends(get_current_user)):
        prop = await db.properties.find_one({"id": property_id}, {"_id": 0, "id": 1, "agent_id": 1, "owner_id": 1, "title": 1})
        if not prop:
            raise HTTPException(404, "Listing not found")
        if prop.get("agent_id") != user["id"] and prop.get("owner_id") != user["id"] and not user.get("is_admin"):
            raise HTTPException(403, "Only the lister can change the walkthrough video")
        wv = parse_video_link(body.url)
        if wv:
            await db.properties.update_one({"id": property_id}, {"$set": {"walkthrough_video": wv, "updated_at": now()}})
        else:
            await db.properties.update_one({"id": property_id}, {"$unset": {"walkthrough_video": ""}, "$set": {"updated_at": now()}})
        return {"ok": True, **video_fields({"walkthrough_video": wv}, True)}

    return router
