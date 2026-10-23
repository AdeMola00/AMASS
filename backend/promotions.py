"""AMASS Agent Boost Tools — Promote · Feature · Boost.

A promotion is a timed, MASS-paid visibility upgrade on one listing:

  • promote  → ranked above standard listings in list / filter results
  • feature  → + "Featured" badge and first cards wherever listings are ranked (search results, AI search)
  • boost    → + gold highlighted map pin + alerts to buyers whose saved
               searches match the listing

Prices/durations are admin-editable (app_settings.promotion_pricing); the
placements per tier are fixed product rules. Every activation writes a row to
`promotions` (history + reporting) and stamps `properties.promotion`, which the
list/map/detail endpoints read through `annotate_promotion`.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

logger = logging.getLogger("amass.promotions")

TierKey = Literal["promote", "feature", "boost"]
TIER_ORDER: dict[str, int] = {"promote": 1, "feature": 2, "boost": 3}
SETTING_KEY = "promotion_pricing"

DEFAULT_TIERS: dict[str, dict[str, Any]] = {
    "promote": {
        "tokens": 20,
        "days": 7,
        "label": "Promote",
        "perk": "Higher in search results",
        "placements": ["results"],
        "uplift": 1.8,
    },
    "feature": {
        "tokens": 50,
        "days": 14,
        "label": "Feature",
        "perk": "Featured homes rail + priority in results",
        "placements": ["results", "featured"],
        "uplift": 3.2,
    },
    "boost": {
        "tokens": 100,
        "days": 30,
        "label": "Boost",
        "perk": "Top of every feed, gold map pin and alerts to matched buyers",
        "placements": ["results", "featured", "map", "alerts"],
        "uplift": 5.0,
    },
}

PLACEMENTS: dict[str, dict[str, str]] = {
    "results": {"label": "Search results", "caption": "Ranked above standard listings in every list and filter result", "icon": "list"},
    "featured": {"label": "Featured homes", "caption": "Gold Featured badge and first place in every results list", "icon": "star"},
    "map": {"label": "Map pin", "caption": "Gold highlighted pin that stands out at every zoom level", "icon": "location"},
    "alerts": {"label": "Buyer alerts", "caption": "One-time alert to buyers whose saved searches match", "icon": "notifications"},
}


# ─── helpers ──────────────────────────────────────────────────────────────
def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(d: Any) -> Optional[datetime]:
    if not isinstance(d, datetime):
        if isinstance(d, str):
            try:
                d = datetime.fromisoformat(d.replace("Z", "+00:00"))
            except ValueError:
                return None
        else:
            return None
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


async def get_tiers(db: AsyncIOMotorDatabase) -> dict[str, dict[str, Any]]:
    """Defaults merged with the admin-editable tokens/days overrides."""
    doc = await db.app_settings.find_one({"key": SETTING_KEY}, {"_id": 0, "value": 1})
    override = (doc or {}).get("value") or {}
    out: dict[str, dict[str, Any]] = {}
    for k, base in DEFAULT_TIERS.items():
        o = override.get(k) or {}
        t = dict(base)
        if isinstance(o.get("tokens"), (int, float)) and o["tokens"] >= 0:
            t["tokens"] = int(o["tokens"])
        if isinstance(o.get("days"), (int, float)) and o["days"] > 0:
            t["days"] = int(o["days"])
        out[k] = t
    return out


def active_promotion(prop: dict, now: Optional[datetime] = None) -> Optional[dict]:
    promo = prop.get("promotion")
    if not isinstance(promo, dict) or promo.get("tier") not in TIER_ORDER:
        return None
    exp = _aware(promo.get("expires_at"))
    if not exp or exp <= (now or _now()):
        return None
    return promo


def promotion_weight(prop: dict, now: Optional[datetime] = None) -> int:
    promo = active_promotion(prop, now)
    return TIER_ORDER[promo["tier"]] if promo else 0


def annotate_promotion(docs: list[dict], now: Optional[datetime] = None) -> None:
    """Normalise `promotion` on API payloads: None when expired, else a compact
    JSON-safe dict with `tier`, `expires_at` (ISO) and `days_left`."""
    now = now or _now()
    for p in docs:
        promo = active_promotion(p, now)
        if not promo:
            p["promotion"] = None
            continue
        exp = _aware(promo["expires_at"])
        p["promotion"] = {
            "tier": promo["tier"],
            "starts_at": (_aware(promo.get("starts_at")) or now).isoformat(),
            "expires_at": exp.isoformat() if exp else None,
            "days_left": max(0, int(((exp - now).total_seconds() + 86399) // 86400)) if exp else 0,
        }


async def find_promoted_first(db: AsyncIOMotorDatabase, query: dict, limit: int) -> list[dict]:
    """Promoted (active) listings that match `query` first — boost > feature >
    promote — then the standard listings, within one `limit`."""
    now = _now()
    promo_q = {**query, "promotion.expires_at": {"$gt": now}}
    promoted = await db.properties.find(promo_q, {"_id": 0}).limit(limit).to_list(limit)
    promoted = [p for p in promoted if active_promotion(p, now)]
    promoted.sort(key=lambda p: promotion_weight(p, now), reverse=True)
    rest_limit = max(0, limit - len(promoted))
    rest: list[dict] = []
    if rest_limit:
        rest_q = dict(query)
        if promoted:
            ids = [p["id"] for p in promoted]
            rest_q = {"$and": [query, {"id": {"$nin": ids}}]} if query else {"id": {"$nin": ids}}
        rest = await db.properties.find(rest_q, {"_id": 0}).limit(rest_limit).to_list(rest_limit)
    return promoted + rest


def _criteria_matches(criteria: dict, prop: dict) -> bool:
    """Pure-Python mirror of notification_center._criteria_query so we can score
    many saved searches against ONE property without a query per search."""
    c = criteria or {}
    q = (c.get("q") or "").strip().lower()
    if q:
        hay = " ".join(str(prop.get(f) or "") for f in ("title", "description", "location", "city")).lower()
        if q not in hay:
            return False
    for k in ("city", "listing_type", "property_type"):
        if c.get(k) and str(prop.get(k) or "").lower() != str(c[k]).lower():
            return False
    price = float(prop.get("price") or 0)
    if c.get("min_price") is not None and price < float(c["min_price"]):
        return False
    if c.get("max_price") is not None and price > float(c["max_price"]):
        return False
    if c.get("min_beds") is not None and int(prop.get("bedrooms") or 0) < int(c["min_beds"]):
        return False
    if c.get("min_baths") is not None and int(prop.get("bathrooms") or 0) < int(c["min_baths"]):
        return False
    b = c.get("bbox")
    if b and len(b) == 4:
        lng, lat = prop.get("longitude"), prop.get("latitude")
        if lng is None or lat is None or not (b[0] <= lng <= b[2] and b[1] <= lat <= b[3]):
            return False
    return True


async def matched_buyers(db: AsyncIOMotorDatabase, prop: dict) -> list[dict]:
    """Saved searches (alerts on, not the agent's own) whose criteria match this listing."""
    out: list[dict] = []
    cursor = db.saved_searches.find({"alerts_enabled": True, "user_id": {"$ne": prop.get("agent_id")}}, {"_id": 0, "id": 1, "user_id": 1, "name": 1, "criteria": 1}).limit(2000)
    async for s in cursor:
        if _criteria_matches(s.get("criteria") or {}, prop):
            out.append(s)
    return out


async def reach_estimate(db: AsyncIOMotorDatabase, prop: dict, tiers: dict[str, dict[str, Any]]) -> dict:
    now = _now()
    since = now - timedelta(days=30)
    city = prop.get("city") or ""
    listing_type = prop.get("listing_type")
    peers_q: dict = {"status": {"$nin": ["sold", "archived", "hidden", "draft", "rejected"]}}
    if city:
        peers_q["city"] = {"$regex": f"^{city}$", "$options": "i"}
    if listing_type:
        peers_q["listing_type"] = listing_type
    peers = await db.properties.find(peers_q, {"_id": 0, "id": 1, "promotion": 1}).limit(400).to_list(400)
    peer_ids = [p["id"] for p in peers]
    # Current position in the default (promoted-first) order among peers.
    peers.sort(key=lambda p: promotion_weight(p, now), reverse=True)
    rank = next((i + 1 for i, p in enumerate(peers) if p["id"] == prop["id"]), len(peers) or 1)
    promoted_peers = sum(1 for p in peers if active_promotion(p, now))

    views_30d = await db.property_events.count_documents({"property_id": prop["id"], "event_type": "view", "created_at": {"$gte": since}})
    seekers = 0
    if peer_ids:
        pipeline = [
            {"$match": {"property_id": {"$in": peer_ids}, "event_type": "view", "created_at": {"$gte": since}, "user_id": {"$ne": None}}},
            {"$group": {"_id": "$user_id"}},
            {"$count": "n"},
        ]
        async for row in db.property_events.aggregate(pipeline):
            seekers = int(row.get("n", 0))
    buyers = await matched_buyers(db, prop)
    baseline = max(views_30d, 12)
    estimates = {k: int(round(baseline * float(t.get("uplift", 1)))) for k, t in tiers.items()}
    return {
        "views_30d": views_30d,
        "city_seekers_30d": seekers,
        "matched_buyers": len({b["user_id"] for b in buyers}),
        "competing_listings": max(0, len(peers) - 1),
        "promoted_competitors": promoted_peers - (1 if active_promotion(prop, now) else 0),
        "current_rank": rank,
        "estimated_views": estimates,
        "city": city,
    }


async def notify_boost(db: AsyncIOMotorDatabase, prop: dict, agent_name: Optional[str]) -> int:
    """One-time alert to every buyer with a matching saved search. Honours the
    user's notification preferences (category property_matches) + dedupes per
    property so re-boosts never spam."""
    from notification_center import emit

    buyers = await matched_buyers(db, prop)
    seen: set[str] = set()
    sent = 0
    price = prop.get("price") or 0
    try:
        price_fmt = f"₦{int(price):,}"
    except (TypeError, ValueError):
        price_fmt = f"₦{price}"
    where = prop.get("city") or (prop.get("location") or "").split(",")[0]
    for s in buyers:
        uid = s["user_id"]
        if uid in seen:
            continue
        seen.add(uid)
        res = await emit(
            db,
            uid,
            "BOOSTED_LISTING",
            f"Just boosted: {prop.get('title', 'A home you may like')}"[:120],
            f"{price_fmt} · {where} — matches “{s.get('name') or 'your saved search'}”" + (f" · listed by {agent_name}" if agent_name else ""),
            {"property_id": prop["id"], "saved_search_id": s.get("id"), "saved_search_name": s.get("name"), "tier": "boost"},
            dedupe_key=f"boost:{prop['id']}:{uid}",
            action_url=f"/property/{prop['id']}?via=boost",
        )
        sent += 1 if res else 0
    return sent


# ─── models ──────────────────────────────────────────────────────────────
class PromoteIn(BaseModel):
    property_id: str
    tier: TierKey


class TierPatch(BaseModel):
    tokens: Optional[int] = Field(default=None, ge=0, le=100000)
    days: Optional[int] = Field(default=None, ge=1, le=365)


class TiersPatchIn(BaseModel):
    promote: Optional[TierPatch] = None
    feature: Optional[TierPatch] = None
    boost: Optional[TierPatch] = None


# ─── routes ──────────────────────────────────────────────────────────────
def register_promotion_routes(db: AsyncIOMotorDatabase, get_current_user, require_admin, wallet_service) -> APIRouter:
    router = APIRouter(prefix="/api", tags=["promotions"])

    async def _owned_property(property_id: str, user: dict) -> dict:
        prop = await db.properties.find_one({"id": property_id}, {"_id": 0})
        if not prop:
            raise HTTPException(404, "Property not found")
        if prop.get("agent_id") != user["id"] and not user.get("is_admin"):
            raise HTTPException(403, "You can only boost your own listings")
        return prop

    async def _balance(user_id: str) -> int:
        w = await wallet_service.get_or_create(user_id, "MASS")
        return int(w["balance"] + w["bonus_balance"])

    def _prop_summary(p: dict) -> dict:
        return {
            "id": p["id"],
            "title": p.get("title"),
            "price": p.get("price"),
            "listing_type": p.get("listing_type"),
            "property_type": p.get("property_type"),
            "bedrooms": p.get("bedrooms"),
            "bathrooms": p.get("bathrooms"),
            "size_sqm": p.get("size_sqm"),
            "location": p.get("location"),
            "city": p.get("city"),
            "verified": bool(p.get("verified")),
            "status": p.get("status", "available"),
            "image": (p.get("images") or [None])[0],
        }

    @router.get("/agent/promotions/config")
    async def promotions_config():
        return await get_tiers(db)

    @router.get("/agent/promotions/placements")
    async def promotions_placements():
        return PLACEMENTS

    @router.get("/agent/promotions/preview/{property_id}")
    async def promotion_preview(property_id: str, user: dict = Depends(get_current_user)):
        prop = await _owned_property(property_id, user)
        tiers = await get_tiers(db)
        balance = await _balance(user["id"])
        reach = await reach_estimate(db, prop, tiers)
        now = _now()
        active = active_promotion(prop, now)
        annotate_promotion([prop], now)
        out_tiers = {}
        for k, t in tiers.items():
            out_tiers[k] = {
                **t,
                "balance_after": balance - int(t["tokens"]),
                "affordable": balance >= int(t["tokens"]),
                "estimated_views": reach["estimated_views"].get(k, 0),
                "extends_active": bool(active and active.get("tier") == k),
            }
        return {
            "property": _prop_summary(prop),
            "balance": balance,
            "currency": "MASS",
            "tiers": out_tiers,
            "placements": PLACEMENTS,
            "reach": reach,
            "active": prop.get("promotion"),
        }

    @router.post("/agent/promote")
    async def promote_listing(data: PromoteIn, user: dict = Depends(get_current_user)):
        prop = await _owned_property(data.property_id, user)
        tiers = await get_tiers(db)
        cfg = tiers[data.tier]
        cost = int(cfg["tokens"])
        try:
            await wallet_service.debit(
                user["id"],
                cost,
                "spend_unlock",
                f"{cfg['label']} listing: {(prop.get('title') or '')[:40]}",
                meta={"property_id": data.property_id, "tier": data.tier, "feature": "promotion"},
            )
        except HTTPException as e:
            if e.status_code == 402:
                balance = await _balance(user["id"])
                raise HTTPException(402, {"error": "insufficient_tokens", "required": cost, "balance": balance, "shortfall": cost - balance})
            raise
        now = _now()
        active = active_promotion(prop, now)
        # Same tier while still active → extend from the current expiry; otherwise start fresh.
        starts = now
        base = _aware(active.get("expires_at")) if active and active.get("tier") == data.tier else None
        expires = (base or now) + timedelta(days=int(cfg["days"]))
        promo = {"tier": data.tier, "starts_at": (_aware(active.get("starts_at")) if base else None) or starts, "expires_at": expires, "boosted_by": user["id"]}
        await db.properties.update_one({"id": data.property_id}, {"$set": {"promotion": promo}})
        alerts_sent = 0
        if data.tier == "boost":
            try:
                agent = await db.users.find_one({"id": user["id"]}, {"_id": 0, "full_name": 1})
                alerts_sent = await notify_boost(db, prop, (agent or {}).get("full_name"))
            except Exception:  # alerts are best-effort; the paid placement is already live
                logger.exception("boost alerts failed for %s", data.property_id)
        await db.promotions.insert_one({
            "id": str(uuid.uuid4()),
            "property_id": data.property_id,
            "agent_id": user["id"],
            "tier": data.tier,
            "cost": cost,
            "days": int(cfg["days"]),
            "starts_at": starts,
            "expires_at": expires,
            "extended": bool(base),
            "alerts_sent": alerts_sent,
            "views_at_start": await db.property_events.count_documents({"property_id": data.property_id, "event_type": "view"}),
            "created_at": now,
        })
        return {
            "ok": True,
            "tier": data.tier,
            "starts_at": starts.isoformat(),
            "expires_at": expires.isoformat(),
            "cost": cost,
            "extended": bool(base),
            "alerts_sent": alerts_sent,
            "balance_after": await _balance(user["id"]),
        }

    @router.get("/agent/promotions/mine")
    async def my_promotions(user: dict = Depends(get_current_user)):
        now = _now()
        listings = await db.properties.find({"agent_id": user["id"], "promotion.tier": {"$exists": True}}, {"_id": 0}).to_list(500)
        active: list[dict] = []
        for p in listings:
            promo = active_promotion(p, now)
            if not promo:
                continue
            starts = _aware(promo.get("starts_at")) or now
            views_since = await db.property_events.count_documents({"property_id": p["id"], "event_type": "view", "created_at": {"$gte": starts}})
            saves_since = await db.property_events.count_documents({"property_id": p["id"], "event_type": "favorite", "created_at": {"$gte": starts}})
            annotate_promotion([p], now)
            active.append({**_prop_summary(p), "promotion": p["promotion"], "views_since": views_since, "saves_since": saves_since})
        active.sort(key=lambda x: TIER_ORDER.get(x["promotion"]["tier"], 0), reverse=True)
        history = await db.promotions.find({"agent_id": user["id"]}, {"_id": 0}).sort("created_at", -1).limit(20).to_list(20)
        for h in history:
            for k in ("starts_at", "expires_at", "created_at"):
                d = _aware(h.get(k))
                h[k] = d.isoformat() if d else None
        tiers = await get_tiers(db)
        return {"active": active, "history": history, "tiers": tiers, "spent_total": sum(int(h.get("cost") or 0) for h in history)}

    # ─── admin ───
    @router.get("/admin/promotions/config")
    async def admin_get_config(_: dict = Depends(require_admin)):
        return {"tiers": await get_tiers(db), "defaults": DEFAULT_TIERS, "placements": PLACEMENTS}

    @router.patch("/admin/promotions/config")
    async def admin_patch_config(data: TiersPatchIn, admin: dict = Depends(require_admin)):
        current = await get_tiers(db)
        value: dict[str, dict[str, int]] = {}
        for k in DEFAULT_TIERS:
            patch = getattr(data, k)
            tokens = current[k]["tokens"]
            days = current[k]["days"]
            if patch:
                if patch.tokens is not None:
                    tokens = patch.tokens
                if patch.days is not None:
                    days = patch.days
            value[k] = {"tokens": int(tokens), "days": int(days)}
        if not (value["promote"]["tokens"] <= value["feature"]["tokens"] <= value["boost"]["tokens"]):
            raise HTTPException(422, "Prices must step up: Promote ≤ Feature ≤ Boost")
        now = _now()
        await db.app_settings.update_one(
            {"key": SETTING_KEY},
            {"$set": {"value": value, "updated_at": now, "updated_by": admin["id"]}, "$setOnInsert": {"key": SETTING_KEY, "is_system": False, "created_at": now}},
            upsert=True,
        )
        return {"tiers": await get_tiers(db), "defaults": DEFAULT_TIERS, "placements": PLACEMENTS}

    return router
