"""
My Home AI — photo → item details and receipt → purchase details (AMASS AI CORE, vision).

  • Both endpoints only READ: the user confirms the suggestions in the app before anything is saved.
  • The model is instructed to return null for anything it cannot actually see — it never invents prices,
    dates, serial numbers or warranties; where it estimates (replacement value) it says so and gives a range.
  • Files are the user's private uploads (`amass/uploads/{user_id}/…`); they are fetched from object storage,
    downsized and sent as base64. PDFs are not readable as images → 415 with a clear message.
"""
from __future__ import annotations

import base64
import io
import json
import logging
import os
import re
import uuid
from typing import Any, Optional

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

load_dotenv()
logger = logging.getLogger("amass.home.ai")

LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")
VISION_PROVIDER, VISION_MODEL = "openai", "gpt-5.4"
MAX_SIDE = 1280

ITEM_SYSTEM = """You help a household owner build an inventory of what is in their home from a single photo.
Return ONLY a JSON object (no markdown) with exactly these keys:
{
 "is_household_item": true|false,
 "name": string|null,            // short friendly name, e.g. "Samsung 55\\" Smart TV"
 "category": one of ["tv","fridge","washer","ac","generator","inverter","laptop","phone","kitchen","furniture","other"]|null,
 "room": one of ["Living room","Bedroom","Kitchen","Bathroom","Dining","Office","Kids' room","Balcony","Garage","Store","Outdoor","Other"]|null,
 "brand": string|null,           // only if a logo or printed brand is clearly visible
 "model": string|null,           // only if printed/visible
 "serial": string|null,          // only if a serial/label is legible
 "condition": one of ["new","good","fair","poor"]|null,
 "colour": string|null,
 "replacement_value_ngn": {"low": number, "high": number, "basis": string}|null, // Nigeria retail range for a similar NEW item, only when you are reasonably sure; basis explains
 "confidence": number,           // 0..1 for the identification as a whole
 "missing": [string],            // human-readable list of what you could not determine (e.g. "purchase price", "warranty")
 "notes": string|null            // anything useful you noticed (damage, accessories)
}
Rules: never guess brand/model/serial — null when not legible. Never invent purchase price, purchase date or warranty: those are
NOT in this schema on purpose. If the photo is not a household item, set is_household_item=false and leave other fields null."""

RECEIPT_SYSTEM = """You read a photo of a purchase receipt or invoice for a household owner.
Return ONLY a JSON object (no markdown) with exactly these keys:
{
 "is_receipt": true|false,
 "store": string|null,
 "purchased_at": "YYYY-MM-DD"|null,     // only if a date is printed; convert formats carefully (Nigerian receipts are usually DD/MM/YYYY)
 "currency": string|null,              // e.g. "NGN"
 "total": number|null,                 // grand total actually printed
 "items": [{"name": string, "price": number|null, "qty": number|null}],  // line items as printed, max 12
 "warranty_months": number|null,       // only if the receipt states a warranty period
 "payment_method": string|null,
 "receipt_number": string|null,
 "confidence": number,                 // 0..1
 "missing": [string]                   // what you could not read (e.g. "date", "total")
}
Rules: copy only what is printed. If a value is unreadable, use null. Never estimate totals or dates."""


class FileIn(BaseModel):
    path: Optional[str] = None  # private upload path (amass/uploads/{user}/…)
    data_url: Optional[str] = None  # or a base64 data URL straight from the camera


def _strip_json(text: str) -> dict:
    s = text.strip()
    s = re.sub(r"^```(?:json)?\s*|\s*```$", "", s, flags=re.S)
    try:
        return json.loads(s)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", s, flags=re.S)
        if not m:
            raise
        return json.loads(m.group(0))


def _to_jpeg_b64(raw: bytes, content_type: str) -> str:
    """Downsize + normalise to JPEG so HEIC/WebP/PNG camera shots all work and payloads stay small."""
    if content_type == "application/pdf" or raw[:4] == b"%PDF":
        raise HTTPException(415, "Please upload a photo of the receipt — PDFs can't be read yet.")
    try:
        from PIL import Image, ImageOps

        im = Image.open(io.BytesIO(raw))
        im = ImageOps.exif_transpose(im).convert("RGB")
        im.thumbnail((MAX_SIDE, MAX_SIDE))
        out = io.BytesIO()
        im.save(out, "JPEG", quality=86)
        return base64.b64encode(out.getvalue()).decode()
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(415, f"That file isn't a readable image ({e.__class__.__name__}).")


async def _vision_json(system: str, prompt: str, image_b64: str) -> dict:
    if not LLM_KEY:
        raise HTTPException(503, "AI is not configured")
    from emergentintegrations.llm.chat import ImageContent, LlmChat, UserMessage

    chat = LlmChat(api_key=LLM_KEY, session_id=f"home-ai-{uuid.uuid4().hex}", system_message=system).with_model(VISION_PROVIDER, VISION_MODEL)
    try:
        text = await chat.send_message(UserMessage(text=prompt, file_contents=[ImageContent(image_base64=image_b64)]))
    except Exception as e:  # noqa: BLE001
        logger.warning("home ai call failed: %s", e)
        raise HTTPException(502, "AI couldn't look at that right now. Please try again.")
    try:
        return _strip_json(text or "")
    except Exception:  # noqa: BLE001
        logger.warning("home ai returned non-JSON: %s", (text or "")[:300])
        raise HTTPException(502, "AI gave an unreadable answer. Please try again.")


def _num(v: Any) -> Optional[float]:
    try:
        return float(v) if v is not None and v != "" else None
    except (TypeError, ValueError):
        return None


def register_home_ai_routes(db, get_current_user) -> APIRouter:
    router = APIRouter(prefix="/api/home/ai", tags=["home-ai"])

    async def _image_b64(user: dict, body: FileIn) -> str:
        if body.data_url:
            s = body.data_url.strip()
            ct = "image/jpeg"
            if s.startswith("data:"):
                header, b64 = s.split(",", 1)
                ct = header[len("data:"):].split(";", 1)[0] or ct
            else:
                b64 = s
            try:
                raw = base64.b64decode(b64)
            except Exception:
                raise HTTPException(400, "Invalid image data")
            if len(raw) > 12 * 1024 * 1024:
                raise HTTPException(413, "Image too large (max 12 MB)")
            return _to_jpeg_b64(raw, ct)
        if body.path:
            if not body.path.startswith(f"amass/uploads/{user['id']}/"):
                raise HTTPException(403, "That file doesn't belong to you")
            from object_storage import get_object

            try:
                raw, ct = await get_object(body.path)
            except Exception:
                raise HTTPException(404, "File not found")
            return _to_jpeg_b64(raw, ct or "")
        raise HTTPException(400, "Send a photo (path or data_url)")

    async def _log(user: dict, kind: str, result: dict) -> None:
        await db.hh_ai_log.insert_one({"id": str(uuid.uuid4()), "user_id": user["id"], "kind": kind, "confidence": result.get("confidence"), "ok": True, "created_at": __import__("datetime").datetime.utcnow().isoformat()})

    @router.post("/identify")
    async def identify_item(body: FileIn, user: dict = Depends(get_current_user)):
        """Photo → suggested item fields. Nothing is saved; the user confirms in the form."""
        img = await _image_b64(user, body)
        raw = await _vision_json(ITEM_SYSTEM, "Identify this household item and fill the JSON.", img)
        from home_hub import ITEM_CATEGORY_KEYS, ROOMS

        cat = raw.get("category") if raw.get("category") in ITEM_CATEGORY_KEYS else ("other" if raw.get("is_household_item") else None)
        rv = raw.get("replacement_value_ngn") if isinstance(raw.get("replacement_value_ngn"), dict) else None
        out = {
            "is_household_item": bool(raw.get("is_household_item")),
            "name": (raw.get("name") or None),
            "category": cat,
            "room": raw.get("room") if raw.get("room") in ROOMS else None,
            "brand": raw.get("brand") or None,
            "model": raw.get("model") or None,
            "serial": raw.get("serial") or None,
            "condition": raw.get("condition") if raw.get("condition") in ("new", "good", "fair", "poor") else None,
            "colour": raw.get("colour") or None,
            "replacement_value": {"low": _num(rv.get("low")), "high": _num(rv.get("high")), "basis": rv.get("basis") or "Estimated Nigerian retail range for a similar new item"} if rv and _num(rv.get("low")) and _num(rv.get("high")) else None,
            "confidence": max(0.0, min(1.0, _num(raw.get("confidence")) or 0.0)),
            "missing": [str(m) for m in (raw.get("missing") or []) if m][:8],
            "notes": raw.get("notes") or None,
            "model_used": f"{VISION_PROVIDER}/{VISION_MODEL}",
        }
        await _log(user, "identify", out)
        return out

    @router.post("/receipt")
    async def read_receipt(body: FileIn, user: dict = Depends(get_current_user)):
        """Receipt photo → store, date, total, line items. Nothing is saved; the user confirms in the form."""
        img = await _image_b64(user, body)
        raw = await _vision_json(RECEIPT_SYSTEM, "Read this receipt and fill the JSON.", img)
        day = raw.get("purchased_at")
        if not (isinstance(day, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", day)):
            day = None
        items = []
        for it in (raw.get("items") or [])[:12]:
            if isinstance(it, dict) and it.get("name"):
                items.append({"name": str(it["name"])[:80], "price": _num(it.get("price")), "qty": _num(it.get("qty"))})
        out = {
            "is_receipt": bool(raw.get("is_receipt")),
            "store": raw.get("store") or None,
            "purchased_at": day,
            "currency": raw.get("currency") or None,
            "total": _num(raw.get("total")),
            "items": items,
            "warranty_months": int(_num(raw.get("warranty_months")) or 0) or None,
            "payment_method": raw.get("payment_method") or None,
            "receipt_number": raw.get("receipt_number") or None,
            "confidence": max(0.0, min(1.0, _num(raw.get("confidence")) or 0.0)),
            "missing": [str(m) for m in (raw.get("missing") or []) if m][:8],
            "model_used": f"{VISION_PROVIDER}/{VISION_MODEL}",
        }
        await _log(user, "receipt", out)
        return out

    return router
