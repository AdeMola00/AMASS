"""AMASS Marketing & Sharing — Phase 3

Property share tracking + WhatsApp deep-link helpers.

The heavy lifting for QR codes and flyer generation happens on the CLIENT
(react-native-qrcode-svg + react-native-view-shot) — the server just:

  • Emits a canonical short link for each property
  • Tracks share events per channel (WhatsApp / QR / copy_link / native)
  • Returns pre-composed WhatsApp message templates
  • Returns agent + property metadata combined in one call so the client can
    render a flyer without chaining requests
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from motor.motor_asyncio import AsyncIOMotorDatabase

# ─── Public config ──────────────────────────────────────────────
AMASS_DOMAIN = "https://amass.africa"

ShareChannel = Literal[
    "whatsapp", "qr", "copy_link", "native_share", "flyer", "email", "sms"
]


class ShareEventIn(BaseModel):
    channel: ShareChannel
    context: Optional[str] = None  # "property" | "flyer" | "agent_profile" | ...


class ShareLinkOut(BaseModel):
    share_url: str
    qr_url: str
    whatsapp_url: str
    whatsapp_message: str
    flyer_payload: dict  # everything the client needs to render a flyer


class ShareStatsOut(BaseModel):
    total_shares: int
    by_channel: dict  # {"whatsapp": 42, "qr": 12, ...}


# ─── Router factory ─────────────────────────────────────────────
def register_share_routes(db: AsyncIOMotorDatabase, require_auth):
    router = APIRouter(prefix="/api/share", tags=["share"])

    async def _hydrate_flyer(property_doc: dict) -> dict:
        """Combine property + agent + badge data for a self-contained flyer.
        Reuses agent_platform_v2.hydrate_public_agent_by_user."""
        agent_meta: Optional[dict] = None
        try:
            from agent_platform_v2 import hydrate_public_agent_by_user
            if property_doc.get("agent_id"):
                agent_meta = await hydrate_public_agent_by_user(
                    db, property_doc["agent_id"]
                )
        except Exception:
            agent_meta = None
        return {
            "property": {
                "id": property_doc["id"],
                "title": property_doc.get("title"),
                "price": property_doc.get("price"),
                "currency": property_doc.get("currency", "NGN"),
                "listing_type": property_doc.get("listing_type"),
                "property_type": property_doc.get("property_type"),
                "bedrooms": property_doc.get("bedrooms"),
                "bathrooms": property_doc.get("bathrooms"),
                "size_sqm": property_doc.get("size_sqm"),
                "city": property_doc.get("city"),
                "state": property_doc.get("state"),
                "location": property_doc.get("location"),
                "images": property_doc.get("images", [])[:1],  # only cover for flyer
                "verified": property_doc.get("verified", False),
                "amenities": property_doc.get("amenities", [])[:6],
            },
            "agent": agent_meta,
            "brand": {
                "name": "AMASS",
                "tagline": "Africa's Property Intelligence",
                "domain": "amass.africa",
                "accent": "#E11B22",
                "ink": "#0A0A0A",
            },
        }

    def _whatsapp_message(prop: dict, share_url: str, agent_name: Optional[str]) -> str:
        price = prop.get("price", 0) or 0
        try:
            price_fmt = f"₦{int(price):,}"
        except Exception:
            price_fmt = f"₦{price}"
        listing = (prop.get("listing_type") or "for sale").upper()
        beds = prop.get("bedrooms")
        baths = prop.get("bathrooms")
        location = ", ".join(
            [x for x in (prop.get("city"), prop.get("state")) if x]
        ) or (prop.get("location") or "")
        lines = [
            f"*{prop.get('title', 'Property on AMASS')}*",
            f"{listing} · {location}",
            f"💰 {price_fmt}",
        ]
        specs = []
        if beds:
            specs.append(f"{beds} bed")
        if baths:
            specs.append(f"{baths} bath")
        if prop.get("size_sqm"):
            specs.append(f"{prop['size_sqm']} sqm")
        if specs:
            lines.append("🏠 " + " · ".join(specs))
        if agent_name:
            lines.append(f"👤 Listed by {agent_name}")
        lines.append("")
        lines.append(f"👉 View on AMASS: {share_url}")
        lines.append("")
        lines.append("_Powered by AMASS — amass.africa_")
        return "\n".join(lines)

    # ═══ 1) Fetch a share bundle for a property ═══════════════════
    @router.get("/property/{property_id}", response_model=ShareLinkOut)
    async def property_share(property_id: str):
        prop = await db.properties.find_one({"id": property_id}, {"_id": 0})
        if not prop:
            raise HTTPException(404, "Property not found")
        share_url = f"{AMASS_DOMAIN}/property/{property_id}"
        flyer = await _hydrate_flyer(prop)
        agent_name = (flyer.get("agent") or {}).get("full_name")
        msg = _whatsapp_message(prop, share_url, agent_name)
        # WhatsApp deep link — wa.me is universal (opens WhatsApp on both
        # iOS/Android; falls back to web when no app is installed).
        from urllib.parse import quote
        wa = f"https://wa.me/?text={quote(msg)}"
        return ShareLinkOut(
            share_url=share_url,
            qr_url=share_url,
            whatsapp_url=wa,
            whatsapp_message=msg,
            flyer_payload=flyer,
        )

    # ═══ 2) Agent profile share bundle ════════════════════════════
    @router.get("/agent/{slug}", response_model=ShareLinkOut)
    async def agent_share(slug: str):
        agent = await db.agent_applications.find_one({"slug": slug}, {"_id": 0}) or (
            await db.agent_applications.find_one({"user_id": slug}, {"_id": 0})
        )
        if not agent:
            raise HTTPException(404, "Agent not found")
        try:
            from agent_platform_v2 import hydrate_public_agent_by_user
            agent_meta = await hydrate_public_agent_by_user(db, agent["user_id"])
        except Exception:
            agent_meta = None
        share_url = (agent_meta or {}).get(
            "share_url", f"{AMASS_DOMAIN}/agent/{slug}"
        )
        name = (agent_meta or {}).get("full_name") or "an AMASS agent"
        badge = ((agent_meta or {}).get("badge") or {}).get("label", "AMASS Agent")
        msg = (
            f"*{name}* — {badge} on AMASS\n"
            f"View verified listings and contact directly:\n"
            f"👉 {share_url}\n\n"
            f"_Powered by AMASS — amass.africa_"
        )
        from urllib.parse import quote
        wa = f"https://wa.me/?text={quote(msg)}"
        return ShareLinkOut(
            share_url=share_url,
            qr_url=share_url,
            whatsapp_url=wa,
            whatsapp_message=msg,
            flyer_payload={
                "kind": "agent",
                "agent": agent_meta,
                "brand": {
                    "name": "AMASS",
                    "tagline": "Africa's Property Intelligence",
                    "domain": "amass.africa",
                    "accent": "#E11B22",
                    "ink": "#0A0A0A",
                },
            },
        )

    # ═══ 3) Record a share event (analytics) ══════════════════════
    @router.post("/property/{property_id}/event")
    async def record_property_share(
        property_id: str,
        data: ShareEventIn,
        user: dict = Depends(require_auth),
    ):
        prop = await db.properties.find_one({"id": property_id}, {"_id": 0, "id": 1})
        if not prop:
            raise HTTPException(404, "Property not found")
        now = datetime.now(timezone.utc)
        await db.share_events.insert_one(
            {
                "id": str(uuid.uuid4()),
                "kind": "property",
                "target_id": property_id,
                "channel": data.channel,
                "context": data.context,
                "user_id": user["id"],
                "created_at": now,
            }
        )
        # Denormalised counter on the property for cheap reads.
        # Legacy docs may carry share_by_channel: null — $inc can't create a sub-field on null.
        await db.properties.update_one({"id": property_id, "share_by_channel": None}, {"$set": {"share_by_channel": {}}})
        await db.properties.update_one(
            {"id": property_id},
            {
                "$inc": {
                    "share_count": 1,
                    f"share_by_channel.{data.channel}": 1,
                }
            },
        )
        return {"ok": True}

    @router.post("/agent/{slug}/event")
    async def record_agent_share(
        slug: str,
        data: ShareEventIn,
        user: dict = Depends(require_auth),
    ):
        agent = await db.agent_applications.find_one({"slug": slug}, {"_id": 0}) or (
            await db.agent_applications.find_one({"user_id": slug}, {"_id": 0})
        )
        if not agent:
            raise HTTPException(404, "Agent not found")
        now = datetime.now(timezone.utc)
        await db.share_events.insert_one(
            {
                "id": str(uuid.uuid4()),
                "kind": "agent",
                "target_id": agent["user_id"],
                "target_slug": agent.get("slug"),
                "channel": data.channel,
                "context": data.context,
                "user_id": user["id"],
                "created_at": now,
            }
        )
        await db.agent_applications.update_one({"user_id": agent["user_id"], "share_by_channel": None}, {"$set": {"share_by_channel": {}}})
        await db.agent_applications.update_one(
            {"user_id": agent["user_id"]},
            {
                "$inc": {
                    "share_count": 1,
                    f"share_by_channel.{data.channel}": 1,
                }
            },
        )
        return {"ok": True}

    # ═══ 4) Aggregate stats (for agent dashboard) ═════════════════
    @router.get("/property/{property_id}/stats", response_model=ShareStatsOut)
    async def property_share_stats(
        property_id: str,
        user: dict = Depends(require_auth),
    ):
        prop = await db.properties.find_one(
            {"id": property_id},
            {"_id": 0, "agent_id": 1, "share_count": 1, "share_by_channel": 1},
        )
        if not prop:
            raise HTTPException(404, "Property not found")
        # Only the listing agent (or admins) sees their own stats.
        if prop.get("agent_id") != user["id"] and not user.get("is_admin"):
            raise HTTPException(403, "You can only view your own listing stats")
        return ShareStatsOut(
            total_shares=int(prop.get("share_count", 0) or 0),
            by_channel=prop.get("share_by_channel", {}) or {},
        )

    return router
