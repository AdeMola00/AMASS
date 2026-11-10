"""
AMASS HOME PROTECT — insurance for the building, household contents and appliances, paid in MASS.

  • AMASS is the storefront: every premium comes from a partner RATE CARD that an admin enters
    (`hp_rate_cards`): tiered plans (building + contents premium, limits, excess, perils) plus a
    per-appliance top-up (annual % of the item's value per category, with a floor).
  • Quote → pay (MASS debit, receipt, notification) → policy (`hp_policies`, 12-month term).
    Items on a live policy show "Protected" everywhere in My Home.
  • Add-on quotes let the user cover newly bought appliances mid-term (pro-rated for the days left).
  • Claims (`hp_claims`): the user describes what happened with photos; an admin reviews in the app
    (under review → more info → approved → paid / rejected). Approved payouts are settled in MASS.
"""
from __future__ import annotations

import logging
import math
import random
import string
import uuid
from datetime import date, datetime, timedelta
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from home_hub import ITEM_CATEGORIES, FileRef, add_months, clean, iso, now_utc, parse_day, today_local

logger = logging.getLogger("amass.home.protect")

MASS_RATE_NGN = 100
TERM_MONTHS = 12
QUOTE_TTL_DAYS = 7
EXPIRING_DAYS = 30
POLICY_REMINDERS = (30, 7, 0)

INCIDENT_TYPES: list[dict[str, str]] = [
    {"key": "fire", "label": "Fire or smoke", "icon": "flame"},
    {"key": "flood", "label": "Flood or water damage", "icon": "water"},
    {"key": "storm", "label": "Storm or wind", "icon": "thunderstorm"},
    {"key": "theft", "label": "Theft or burglary", "icon": "lock-open"},
    {"key": "surge", "label": "Power surge", "icon": "flash"},
    {"key": "accident", "label": "Accidental damage", "icon": "alert-circle"},
    {"key": "breakdown", "label": "Mechanical or electrical breakdown", "icon": "construct"},
    {"key": "other", "label": "Something else", "icon": "help-circle"},
]
INCIDENT_KEYS = {i["key"] for i in INCIDENT_TYPES}
PERIL_LABELS = {i["key"]: i["label"] for i in INCIDENT_TYPES if i["key"] != "other"}

ClaimStatus = Literal["submitted", "under_review", "more_info", "approved", "rejected", "paid"]
CLAIM_OPEN = ("submitted", "under_review", "more_info", "approved")
CLAIM_STATUS_LABEL = {
    "submitted": "Submitted",
    "under_review": "Under review",
    "more_info": "More information needed",
    "approved": "Approved · payout pending",
    "rejected": "Not approved",
    "paid": "Settled · paid",
}
Scope = Literal["appliance", "contents", "building"]

# Default partner rate card — a placeholder the admin edits/replaces before launch.
DEFAULT_RATE_CARD: dict[str, Any] = {
    "partner_name": "Demo Insurance Partner",
    "partner_short": "Demo Partner",
    "licence": "NAICOM/RIC/000 (demo)",
    "claims_phone": "+234 800 000 0000",
    "claims_email": "claims@example.com",
    "notes": "Sample rates for the preview. Replace with the partner's approved rate card before launch.",
    "mass_rate_ngn": MASS_RATE_NGN,
    "term_months": TERM_MONTHS,
    "max_item_value_ngn": 5_000_000,
    "plans": [
        {"key": "basic", "name": "Basic", "tagline": "Essentials — fire, flood, storm and theft", "building_premium_ngn": 15_000, "contents_premium_ngn": 6_000, "building_limit_ngn": 15_000_000, "contents_limit_ngn": 1_000_000, "excess_ngn": 10_000, "perils": ["fire", "flood", "storm", "theft"], "appliance_discount_pct": 0, "recommended": False},
        {"key": "standard", "name": "Standard", "tagline": "Most popular — adds power-surge cover", "building_premium_ngn": 25_000, "contents_premium_ngn": 12_000, "building_limit_ngn": 35_000_000, "contents_limit_ngn": 3_000_000, "excess_ngn": 7_500, "perils": ["fire", "flood", "storm", "theft", "surge"], "appliance_discount_pct": 10, "recommended": True},
        {"key": "premium", "name": "Premium", "tagline": "Widest cover — accidental damage and breakdown", "building_premium_ngn": 45_000, "contents_premium_ngn": 25_000, "building_limit_ngn": 80_000_000, "contents_limit_ngn": 8_000_000, "excess_ngn": 5_000, "perils": ["fire", "flood", "storm", "theft", "surge", "accident", "breakdown"], "appliance_discount_pct": 20, "recommended": False},
    ],
    "item_rates": {
        "tv": {"rate_pct": 3.0, "min_premium_ngn": 2_000},
        "fridge": {"rate_pct": 2.5, "min_premium_ngn": 2_000},
        "washer": {"rate_pct": 2.5, "min_premium_ngn": 2_000},
        "ac": {"rate_pct": 3.0, "min_premium_ngn": 2_000},
        "generator": {"rate_pct": 4.0, "min_premium_ngn": 3_000},
        "inverter": {"rate_pct": 3.5, "min_premium_ngn": 3_000},
        "laptop": {"rate_pct": 5.0, "min_premium_ngn": 2_500},
        "phone": {"rate_pct": 6.0, "min_premium_ngn": 2_000},
        "kitchen": {"rate_pct": 3.0, "min_premium_ngn": 1_000},
        "furniture": {"rate_pct": 1.5, "min_premium_ngn": 1_000},
    },
}


# ─── Models ───────────────────────────────────────────────────────────────
class PlanIn(BaseModel):
    key: str = Field(..., min_length=1, max_length=24, pattern=r"^[a-z0-9_-]+$")
    name: str = Field(..., min_length=1, max_length=40)
    tagline: Optional[str] = Field(None, max_length=120)
    building_premium_ngn: float = Field(0, ge=0)
    contents_premium_ngn: float = Field(0, ge=0)
    building_limit_ngn: float = Field(0, ge=0)
    contents_limit_ngn: float = Field(0, ge=0)
    excess_ngn: float = Field(0, ge=0)
    perils: list[str] = Field(default_factory=list)
    appliance_discount_pct: float = Field(0, ge=0, le=90)
    recommended: bool = False


class ItemRateIn(BaseModel):
    rate_pct: float = Field(..., ge=0, le=100)
    min_premium_ngn: float = Field(0, ge=0)


class RateCardIn(BaseModel):
    partner_name: str = Field(..., min_length=1, max_length=80)
    partner_short: Optional[str] = Field(None, max_length=30)
    licence: Optional[str] = Field(None, max_length=80)
    claims_phone: Optional[str] = Field(None, max_length=40)
    claims_email: Optional[str] = Field(None, max_length=80)
    notes: Optional[str] = Field(None, max_length=400)
    mass_rate_ngn: int = Field(MASS_RATE_NGN, ge=1)
    term_months: int = Field(TERM_MONTHS, ge=1, le=36)
    max_item_value_ngn: float = Field(5_000_000, ge=0)
    plans: list[PlanIn] = Field(..., min_length=1, max_length=6)
    item_rates: dict[str, Optional[ItemRateIn]] = Field(default_factory=dict)
    active: bool = True


class QuoteIn(BaseModel):
    home_id: str
    plan_key: Optional[str] = None  # required for a new policy; ignored for add-ons
    include_building: bool = True
    item_ids: list[str] = Field(default_factory=list, max_length=100)
    policy_id: Optional[str] = None  # set → add-on quote for an existing live policy


class ClaimIn(BaseModel):
    id: Optional[str] = None
    policy_id: str
    scope: Scope = "appliance"
    item_id: Optional[str] = None
    incident_type: str = "other"
    incident_date: str
    description: str = Field(..., min_length=10, max_length=2000)
    amount_claimed_ngn: Optional[float] = Field(None, ge=0)
    photos: list[FileRef] = Field(default_factory=list, max_length=8)


class ClaimReplyIn(BaseModel):
    message: str = Field("", max_length=2000)
    photos: list[FileRef] = Field(default_factory=list, max_length=8)


class DecisionIn(BaseModel):
    status: ClaimStatus
    note: Optional[str] = Field(None, max_length=1000)
    payout_ngn: Optional[float] = Field(None, ge=0)


# ─── Helpers ──────────────────────────────────────────────────────────────
def _ref(prefix: str) -> str:
    return f"{prefix}-{''.join(random.choices(string.ascii_uppercase + string.digits, k=6))}"


def _mass(ngn: float, rate: int) -> int:
    return int(math.ceil(max(0.0, float(ngn)) / max(1, rate))) if ngn > 0 else 0


def nice_day(d: Optional[str]) -> str:
    """'2027-11-09' → '9 Nov 2027' for copy the customer reads."""
    x = parse_day(d)
    return x.strftime("%-d %b %Y") if x else (d or "")


OWNER_KINDS = ("owner", "family")


def policy_status(p: dict, today: date) -> str:
    if p.get("status") == "cancelled":
        return "cancelled"
    exp = parse_day(p.get("expires_at"))
    if not exp or exp < today:
        return "expired"
    return "expiring" if (exp - today).days <= EXPIRING_DAYS else "active"


def shape_policy(p: dict, today: date) -> dict:
    p = clean(dict(p)) or {}
    p["state"] = policy_status(p, today)
    exp = parse_day(p.get("expires_at"))
    p["days_left"] = (exp - today).days if exp else None
    p["insured_items"] = len(p.get("items") or [])
    p["insured_value_ngn"] = sum(float(i.get("value") or 0) for i in p.get("items") or [])
    return p


def shape_claim(c: dict) -> dict:
    c = clean(dict(c)) or {}
    c["status_label"] = CLAIM_STATUS_LABEL.get(c.get("status"), c.get("status"))
    c["is_open"] = c.get("status") in CLAIM_OPEN
    c["incident_label"] = next((i["label"] for i in INCIDENT_TYPES if i["key"] == c.get("incident_type")), "Something else")
    return c


def _public_card(card: dict) -> dict:
    """What the consumer app needs from a rate card (no admin notes)."""
    card = clean(dict(card)) or {}
    card.pop("notes", None)
    card.pop("updated_by", None)
    card["perils"] = PERIL_LABELS
    return card


def price_items(card: dict, plan: Optional[dict], items: list[dict]) -> tuple[list[dict], list[dict]]:
    """Per-appliance premium lines. Returns (lines, skipped) — skipped items say why."""
    rates = card.get("item_rates") or {}
    max_value = float(card.get("max_item_value_ngn") or 0)
    disc = float((plan or {}).get("appliance_discount_pct") or 0)
    lines, skipped = [], []
    for it in items:
        rate = rates.get(it.get("category") or "other")
        if not rate:
            skipped.append({"item_id": it["id"], "name": it.get("name"), "reason": "This type of item isn't insurable on this rate card"})
            continue
        value = float(it.get("value") or it.get("price") or 0)
        if value <= 0:
            skipped.append({"item_id": it["id"], "name": it.get("name"), "reason": "Add what it's worth first"})
            continue
        if max_value and value > max_value:
            value = max_value
        premium = max(value * float(rate.get("rate_pct") or 0) / 100.0, float(rate.get("min_premium_ngn") or 0))
        premium = round(premium * (1 - disc / 100.0))
        lines.append({"item_id": it["id"], "name": it.get("name"), "category": it.get("category") or "other", "room": it.get("room"), "photo": it.get("photo"), "value": value, "rate_pct": rate.get("rate_pct"), "premium_ngn": premium})
    return lines, skipped


async def active_card(db: AsyncIOMotorDatabase) -> dict:
    card = await db.hp_rate_cards.find_one({"active": True}, {"_id": 0}, sort=[("updated_at", -1)])
    if not card:
        raise HTTPException(503, "Home Protect isn't open yet — no partner rate card is live.")
    return card


async def ensure_home_protect(db: AsyncIOMotorDatabase) -> None:
    await db.hp_rate_cards.create_index("active")
    await db.hp_quotes.create_index([("user_id", 1), ("created_at", -1)])
    await db.hp_policies.create_index([("user_id", 1), ("home_id", 1)])
    await db.hp_policies.create_index("policy_no", unique=True)
    await db.hp_policies.create_index("items.item_id")
    try:  # belt-and-braces behind the atomic quote lock: one live policy per paid quote
        await db.hp_policies.create_index("quote_id", unique=True, partialFilterExpression={"status": "active"}, name="uniq_active_quote")
    except Exception as e:  # noqa: BLE001
        logger.warning("hp_policies quote_id index: %s", e)
    await db.hp_claims.create_index([("user_id", 1), ("created_at", -1)])
    await db.hp_claims.create_index([("status", 1), ("created_at", -1)])
    await db.hp_claims.create_index("claim_no", unique=True)
    if not await db.hp_rate_cards.count_documents({}):
        await db.hp_rate_cards.insert_one({"id": str(uuid.uuid4()), **DEFAULT_RATE_CARD, "active": True, "created_at": iso(now_utc()), "updated_at": iso(now_utc()), "updated_by": "system"})


# ── Shared with My Home (items list / detail / overview / spending) ──
async def protection_map(db: AsyncIOMotorDatabase, user_id: str, today: date) -> dict[str, dict]:
    """item_id → protection pill data from the user's policies (live ones win over ended ones)."""
    out: dict[str, dict] = {}
    rank = {"active": 3, "expiring": 2, "expired": 1}
    async for p in db.hp_policies.find({"user_id": user_id, "status": {"$ne": "cancelled"}}, {"_id": 0, "id": 1, "policy_no": 1, "expires_at": 1, "status": 1, "items.item_id": 1}):
        st = policy_status(p, today)
        for it in p.get("items") or []:
            iid = it.get("item_id")
            if iid and rank.get(st, 0) > rank.get(out.get(iid, {}).get("status"), 0):
                out[iid] = {"status": st, "policy_id": p["id"], "policy_no": p.get("policy_no"), "expires_at": p.get("expires_at")}
    return out


async def home_protection(db: AsyncIOMotorDatabase, user_id: str, home_id: Optional[str], today: date) -> dict:
    """The dashboard banner: the best policy for this home (or across all homes)."""
    q: dict[str, Any] = {"user_id": user_id, "status": {"$ne": "cancelled"}}
    if home_id and home_id != "all":
        q["home_id"] = home_id
    best: Optional[dict] = None
    rank = {"active": 3, "expiring": 2, "expired": 1}
    async for p in db.hp_policies.find(q, {"_id": 0}).sort("expires_at", -1):
        if best is None or rank[policy_status(p, today)] > rank[policy_status(best, today)]:
            best = p
    if not best:
        return {"status": "none", "insured_items": 0, "expires_at": None, "policy_id": None, "plan_name": None}
    return {"status": policy_status(best, today), "insured_items": len(best.get("items") or []), "expires_at": best.get("expires_at"), "policy_id": best["id"], "plan_name": best.get("plan_name"), "partner_name": best.get("partner_name")}


async def home_live_policies(db: AsyncIOMotorDatabase, user_id: str, home_id: str, today: date) -> list[dict]:
    """Policies still in force on one home (used before a home is deleted)."""
    rows = await db.hp_policies.find({"user_id": user_id, "home_id": home_id, "status": {"$ne": "cancelled"}}, {"_id": 0, "id": 1, "policy_no": 1, "expires_at": 1, "status": 1}).to_list(50)
    return [p for p in rows if policy_status(p, today) in ("active", "expiring")]


async def cancel_home_cover(db: AsyncIOMotorDatabase, user_id: str, home_id: str, reason: str) -> int:
    """Home deleted → its cover ends, open claims on it are withdrawn and any open quotes lapse. Returns policies cancelled."""
    now = iso(now_utc())
    q = {"user_id": user_id, "home_id": home_id, "status": {"$ne": "cancelled"}}
    ids = [p["id"] async for p in db.hp_policies.find(q, {"_id": 0, "id": 1})]
    r = await db.hp_policies.update_many(q, {"$set": {"status": "cancelled", "cancelled_at": now, "cancel_reason": reason, "updated_at": now}})
    if ids:
        note = "Withdrawn — you removed this home and its cover."
        await db.hp_claims.update_many(
            {"policy_id": {"$in": ids}, "status": {"$in": list(CLAIM_OPEN)}},
            {"$set": {"status": "rejected", "admin_note": note, "updated_at": now}, "$push": {"timeline": {"at": now, "status": "rejected", "by": "you", "note": note}}},
        )
    await db.hp_quotes.update_many({"user_id": user_id, "home_id": home_id, "status": "quoted"}, {"$set": {"status": "expired"}})
    return r.modified_count


async def insurance_spend(db: AsyncIOMotorDatabase, user_id: str, home_id: Optional[str], year: int) -> list[dict]:
    """Premiums paid in a year → My Home Spending (insurance bucket)."""
    q: dict[str, Any] = {"user_id": user_id, "paid_at": {"$gte": f"{year}-01-01", "$lte": f"{year}-12-31T23:59:59"}}
    if home_id and home_id != "all":
        q["home_id"] = home_id
    rows = []
    async for p in db.hp_policies.find(q, {"_id": 0, "id": 1, "paid_at": 1, "total_ngn": 1, "initial_total_ngn": 1, "plan_name": 1}).sort("paid_at", -1):
        rows.append({"type": "insurance", "title": f"Home Protect · {p.get('plan_name') or 'cover'}", "amount": float(p.get("initial_total_ngn") if p.get("initial_total_ngn") is not None else p.get("total_ngn") or 0), "date": (p.get("paid_at") or "")[:10], "category": "insurance", "path": f"/home/protect/policy/{p['id']}"})
    async for a in db.hp_policy_addons.find(q, {"_id": 0}).sort("paid_at", -1):
        rows.append({"type": "insurance", "title": f"Home Protect · {len(a.get('items') or [])} item{'s' if len(a.get('items') or []) != 1 else ''} added", "amount": float(a.get("total_ngn") or 0), "date": (a.get("paid_at") or "")[:10], "category": "insurance", "path": f"/home/protect/policy/{a['policy_id']}"})
    return rows


async def run_protect_sweep(db: AsyncIOMotorDatabase, today: Optional[date] = None) -> dict:
    """Daily-ish: remind 30/7/0 days before a policy ends; drop stale quotes."""
    from notification_center import emit

    today = today or today_local()
    sent = 0
    async for p in db.hp_policies.find({"status": {"$ne": "cancelled"}}, {"_id": 0}):
        exp = parse_day(p.get("expires_at"))
        if not exp:
            continue
        days = (exp - today).days
        if days not in POLICY_REMINDERS:
            continue
        key = f"hp-exp:{p['id']}:{days}"
        if await db.hh_reminders_sent.find_one({"key": key}):
            continue
        await db.hh_reminders_sent.insert_one({"key": key, "created_at": iso(now_utc())})
        when = "today" if days == 0 else f"in {days} days"
        doc = await emit(db, p["user_id"], "HOME_PROTECT_EXPIRING", f"Home Protect cover ends {when}", f"{p.get('plan_name')} cover for {p.get('home_name') or 'your home'} ends on {exp.strftime('%d %b %Y')}. Renew to stay protected.", {"policy_id": p["id"], "days": days}, category="home", dedupe_key=key, action_url=f"/home/protect/policy/{p['id']}")
        sent += bool(doc)
    purged = await db.hp_quotes.update_many({"status": "quoted", "expires_quote_at": {"$lt": iso(now_utc())}}, {"$set": {"status": "expired"}})
    return {"reminders": sent, "quotes_expired": purged.modified_count}


# ─── Routes ───────────────────────────────────────────────────────────────
def register_home_protect_routes(db: AsyncIOMotorDatabase, get_current_user, require_admin) -> APIRouter:
    router = APIRouter(prefix="/api/home/protect", tags=["home-protect"])

    def _uid(user: dict) -> str:
        return user["id"]

    async def _home(user: dict, home_id: str) -> dict:
        h = await db.hh_homes.find_one({"id": home_id, "user_id": _uid(user)}, {"_id": 0})
        if not h:
            raise HTTPException(404, "Home not found")
        return h

    async def _policy(user: dict, policy_id: str) -> dict:
        p = await db.hp_policies.find_one({"id": policy_id, "user_id": _uid(user)}, {"_id": 0})
        if not p:
            raise HTTPException(404, "Policy not found")
        return p

    def _files(user: dict, files: list[FileRef]) -> list[dict]:
        out = []
        for f in files:
            if not f.path.startswith(f"amass/uploads/{_uid(user)}/"):
                raise HTTPException(403, "That file doesn't belong to you")
            out.append(f.model_dump())
        return out

    async def _live_policy(user: dict, home_id: str, today: date) -> Optional[dict]:
        async for p in db.hp_policies.find({"user_id": _uid(user), "home_id": home_id, "status": {"$ne": "cancelled"}}, {"_id": 0}).sort("expires_at", -1):
            if policy_status(p, today) in ("active", "expiring"):
                return p
        return None

    async def _wallet(user: dict) -> dict:
        from tokens import WalletService

        w = await WalletService(db).get_or_create(_uid(user), "MASS")
        return {"balance": int(w["balance"] + w["bonus_balance"])}

    # ── Catalog & status ──
    @router.get("/catalog")
    async def catalog(user: dict = Depends(get_current_user)):
        card = await db.hp_rate_cards.find_one({"active": True}, {"_id": 0}, sort=[("updated_at", -1)])
        return {
            "open": bool(card),
            "rate_card": _public_card(card) if card else None,
            "incident_types": INCIDENT_TYPES,
            "insurable_categories": [c["key"] for c in ITEM_CATEGORIES if card and (card.get("item_rates") or {}).get(c["key"])],
            "mass_rate_ngn": int((card or {}).get("mass_rate_ngn") or MASS_RATE_NGN),
            "term_months": int((card or {}).get("term_months") or TERM_MONTHS),
        }

    @router.get("/status")
    async def status(home_id: Optional[str] = None, user: dict = Depends(get_current_user)):
        today = today_local()
        q: dict[str, Any] = {"user_id": _uid(user)}
        if home_id and home_id != "all":
            q["home_id"] = home_id
        policies = [shape_policy(p, today) for p in await db.hp_policies.find(q, {"_id": 0}).sort("created_at", -1).to_list(50)]
        live = next((p for p in policies if p["state"] in ("active", "expiring")), None)
        claims = [shape_claim(c) for c in await db.hp_claims.find(q, {"_id": 0}).sort("created_at", -1).to_list(100)]
        items_q: dict[str, Any] = {"user_id": _uid(user)}
        if home_id and home_id != "all":
            items_q["home_id"] = home_id
        items = await db.hh_items.find(items_q, {"_id": 0, "id": 1, "name": 1, "category": 1, "value": 1, "price": 1, "room": 1, "photo": 1}).to_list(500)
        pmap = await protection_map(db, _uid(user), today)
        card = await db.hp_rate_cards.find_one({"active": True}, {"_id": 0, "item_rates": 1})
        rates = (card or {}).get("item_rates") or {}
        unprotected = [i for i in items if i["id"] not in pmap and rates.get(i.get("category") or "other")]
        return {
            "today": today.isoformat(),
            "open": bool(card),
            "live": live,
            "policies": policies,
            "claims": claims,
            "open_claims": sum(1 for c in claims if c["is_open"]),
            "items_total": len(items),
            "items_protected": sum(1 for i in items if pmap.get(i["id"], {}).get("status") in ("active", "expiring")),
            "unprotected_insurable": [{"id": i["id"], "name": i.get("name"), "category": i.get("category"), "value": i.get("value") or i.get("price"), "photo": i.get("photo")} for i in unprotected][:20],
        }

    # ── Quote ──
    @router.post("/quote", status_code=201)
    async def quote(body: QuoteIn, user: dict = Depends(get_current_user)):
        today = today_local()
        card = await active_card(db)
        home = await _home(user, body.home_id)
        rate = int(card.get("mass_rate_ngn") or MASS_RATE_NGN)
        term = int(card.get("term_months") or TERM_MONTHS)
        items = await db.hh_items.find({"user_id": _uid(user), "home_id": body.home_id, "id": {"$in": body.item_ids}}, {"_id": 0}).to_list(200) if body.item_ids else []
        pmap = await protection_map(db, _uid(user), today)
        already = [i for i in items if pmap.get(i["id"], {}).get("status") in ("active", "expiring")]
        items = [i for i in items if i["id"] not in {a["id"] for a in already}]

        if body.policy_id:
            # Add-on: more appliances onto the live policy, pro-rated for the days left.
            policy = await _policy(user, body.policy_id)
            if policy_status(policy, today) not in ("active", "expiring") or policy["home_id"] != body.home_id:
                raise HTTPException(409, "That policy isn't live for this home")
            plan = next((p for p in (card.get("plans") or []) if p["key"] == policy.get("plan_key")), None)
            lines, skipped = price_items(card, plan, items)
            if not lines:
                raise HTTPException(422, {"message": "Nothing to add — pick appliances that aren't covered yet and have a value.", "skipped": skipped})
            exp = parse_day(policy["expires_at"]) or today
            start = parse_day(policy["starts_at"]) or today
            days_left = max(1, (exp - today).days)
            term_days = max(1, (exp - start).days)
            factor = min(1.0, days_left / term_days)
            annual = sum(l["premium_ngn"] for l in lines)
            total_ngn = round(annual * factor)
            for l in lines:
                l["premium_ngn_prorated"] = round(l["premium_ngn"] * factor)
            q = {
                "id": str(uuid.uuid4()), "kind": "addon", "user_id": _uid(user), "home_id": body.home_id, "policy_id": policy["id"], "rate_card_id": card["id"], "partner_name": card["partner_name"],
                "plan_key": policy.get("plan_key"), "plan_name": policy.get("plan_name"), "include_building": False, "items": lines, "skipped": skipped, "already_covered": [{"id": a["id"], "name": a.get("name")} for a in already],
                "breakdown": {"building_ngn": 0, "contents_ngn": 0, "appliances_ngn": total_ngn, "appliances_annual_ngn": annual, "prorate_factor": round(factor, 4), "days_left": days_left},
                "total_ngn": total_ngn, "total_mass": _mass(total_ngn, rate), "mass_rate_ngn": rate, "term_months": term, "starts_at": today.isoformat(), "expires_at": policy["expires_at"],
                "status": "quoted", "created_at": iso(now_utc()), "expires_quote_at": iso(now_utc() + timedelta(days=QUOTE_TTL_DAYS)),
            }
        else:
            if await _live_policy(user, body.home_id, today):
                raise HTTPException(409, {"code": "already_covered", "message": "This home already has live cover. Add appliances to it instead."})
            plan = next((p for p in (card.get("plans") or []) if p["key"] == body.plan_key), None)
            if not plan:
                raise HTTPException(422, "Pick a plan")
            if not home.get("ownership"):
                raise HTTPException(422, {"code": "ownership_required", "message": "Tell us whether you own or rent this home first — it decides if the building can be covered."})
            include_building = bool(body.include_building) and home.get("ownership") in OWNER_KINDS and float(plan.get("building_premium_ngn") or 0) > 0
            lines, skipped = price_items(card, plan, items)
            building = float(plan.get("building_premium_ngn") or 0) if include_building else 0.0
            contents = float(plan.get("contents_premium_ngn") or 0)
            appliances = float(sum(l["premium_ngn"] for l in lines))
            total_ngn = round(building + contents + appliances)
            starts = today
            exp = add_months(starts, term) - timedelta(days=1)
            q = {
                "id": str(uuid.uuid4()), "kind": "new", "user_id": _uid(user), "home_id": body.home_id, "home_name": home.get("name"), "policy_id": None, "rate_card_id": card["id"], "partner_name": card["partner_name"],
                "plan_key": plan["key"], "plan_name": plan["name"], "plan": plan, "include_building": include_building, "items": lines, "skipped": skipped, "already_covered": [{"id": a["id"], "name": a.get("name")} for a in already],
                "breakdown": {"building_ngn": building, "contents_ngn": contents, "appliances_ngn": appliances},
                "total_ngn": total_ngn, "total_mass": _mass(total_ngn, rate), "mass_rate_ngn": rate, "term_months": term, "starts_at": starts.isoformat(), "expires_at": exp.isoformat(),
                "status": "quoted", "created_at": iso(now_utc()), "expires_quote_at": iso(now_utc() + timedelta(days=QUOTE_TTL_DAYS)),
            }
        await db.hp_quotes.insert_one(dict(q))
        w = await _wallet(user)
        q["wallet"] = {**w, "shortfall": max(0, q["total_mass"] - w["balance"])}
        return q

    @router.get("/quotes/{quote_id}")
    async def get_quote(quote_id: str, user: dict = Depends(get_current_user)):
        q = await db.hp_quotes.find_one({"id": quote_id, "user_id": _uid(user)}, {"_id": 0})
        if not q:
            raise HTTPException(404, "Quote not found")
        w = await _wallet(user)
        q["wallet"] = {**w, "shortfall": max(0, q["total_mass"] - w["balance"])}
        return q

    @router.post("/quotes/{quote_id}/pay")
    async def pay_quote(quote_id: str, user: dict = Depends(get_current_user)):
        """Debit MASS → policy (or add items to the live one). Idempotent: a paid quote returns its policy."""
        from notification_center import emit
        from receipts import issue_receipt
        from tokens import WalletService

        today = today_local()
        q = await db.hp_quotes.find_one({"id": quote_id, "user_id": _uid(user)}, {"_id": 0})
        if not q:
            raise HTTPException(404, "Quote not found")
        if q.get("status") == "paid" and q.get("policy_id"):
            return shape_policy(await _policy(user, q["policy_id"]), today)
        if q.get("status") == "paying":
            raise HTTPException(409, {"code": "payment_in_progress", "message": "This payment is already going through — give it a second."})
        if q.get("expires_quote_at") and q["expires_quote_at"] < iso(now_utc()):
            raise HTTPException(410, "This quote has expired — get a fresh one.")
        if q["kind"] == "new" and await _live_policy(user, q["home_id"], today):
            raise HTTPException(409, {"code": "already_covered", "message": "This home already has live cover."})
        if q["kind"] == "addon":
            policy = await _policy(user, q["policy_id"])
            if policy_status(policy, today) not in ("active", "expiring"):
                raise HTTPException(409, "That policy is no longer live")
        # Atomic lock: exactly one request may move the quote quoted → paying. Everyone else gets the policy or a 409.
        locked = await db.hp_quotes.find_one_and_update({"id": quote_id, "user_id": _uid(user), "status": "quoted"}, {"$set": {"status": "paying", "paying_at": iso(now_utc())}}, projection={"_id": 0, "id": 1})
        if not locked:
            fresh = await db.hp_quotes.find_one({"id": quote_id}, {"_id": 0, "status": 1, "policy_id": 1})
            if fresh and fresh.get("status") == "paid" and fresh.get("policy_id"):
                return shape_policy(await _policy(user, fresh["policy_id"]), today)
            raise HTTPException(409, {"code": "payment_in_progress", "message": "This payment is already going through — give it a second."})
        amount = int(q["total_mass"])
        svc = WalletService(db)
        label = f"AMASS Home Protect · {q.get('plan_name')}{' add-on' if q['kind'] == 'addon' else ''}"
        try:
            w = await svc.debit(_uid(user), amount, "spend_insurance", label, meta={"quote_id": q["id"], "home_id": q["home_id"], "kind": q["kind"]}) if amount > 0 else await svc.get_or_create(_uid(user), "MASS")
        except HTTPException as e:
            await db.hp_quotes.update_one({"id": quote_id, "status": "paying"}, {"$set": {"status": "quoted"}, "$unset": {"paying_at": ""}})
            if e.status_code == 402:
                bal = (await _wallet(user))["balance"]
                raise HTTPException(402, {"code": "insufficient_mass", "shortfall": max(0, amount - bal), "balance": bal, "needed": amount})
            raise
        except Exception:
            await db.hp_quotes.update_one({"id": quote_id, "status": "paying"}, {"$set": {"status": "quoted"}, "$unset": {"paying_at": ""}})
            raise
        balance_after = int(w["balance"] + w["bonus_balance"])
        tx = await db.token_transactions.find_one({"user_id": _uid(user), "meta.quote_id": q["id"]}, {"_id": 0, "id": 1}, sort=[("created_at", -1)]) if amount > 0 else None
        paid_at = iso(now_utc())
        home = await db.hh_homes.find_one({"id": q["home_id"]}, {"_id": 0, "name": 1, "address": 1, "city": 1}) or {}
        new_items = [{"item_id": l["item_id"], "name": l["name"], "category": l["category"], "room": l.get("room"), "photo": l.get("photo"), "value": l["value"], "premium_ngn": l.get("premium_ngn_prorated", l["premium_ngn"]), "added_at": paid_at} for l in q.get("items") or []]

        if q["kind"] == "addon":
            await db.hp_policies.update_one({"id": policy["id"]}, {"$push": {"items": {"$each": new_items}}, "$inc": {"total_ngn": q["total_ngn"], "total_mass": amount}, "$set": {"updated_at": paid_at}})
            await db.hp_policy_addons.insert_one({"id": str(uuid.uuid4()), "policy_id": policy["id"], "user_id": _uid(user), "home_id": q["home_id"], "quote_id": q["id"], "items": new_items, "total_ngn": q["total_ngn"], "total_mass": amount, "paid_at": paid_at, "transaction_id": (tx or {}).get("id")})
            policy_id = policy["id"]
            policy_no = policy["policy_no"]
            title, body_txt = f"{len(new_items)} item{'s' if len(new_items) != 1 else ''} added to your cover", f"{', '.join(i['name'] for i in new_items[:3])}{'…' if len(new_items) > 3 else ''} now protected under {policy_no} until {nice_day(policy['expires_at'])}."
        else:
            plan = q.get("plan") or {}
            policy_id = str(uuid.uuid4())
            policy_no = _ref(f"HP{today.strftime('%y')}")
            while await db.hp_policies.find_one({"policy_no": policy_no}):
                policy_no = _ref(f"HP{today.strftime('%y')}")
            doc = {
                "id": policy_id, "policy_no": policy_no, "user_id": _uid(user), "home_id": q["home_id"], "home_name": home.get("name"), "home_address": home.get("address") or home.get("city"),
                "rate_card_id": q["rate_card_id"], "partner_name": q["partner_name"], "plan_key": q["plan_key"], "plan_name": q["plan_name"],
                "cover": {"include_building": q["include_building"], "building_limit_ngn": plan.get("building_limit_ngn") if q["include_building"] else 0, "contents_limit_ngn": plan.get("contents_limit_ngn"), "excess_ngn": plan.get("excess_ngn"), "perils": plan.get("perils") or []},
                "items": new_items, "breakdown": q["breakdown"], "total_ngn": q["total_ngn"], "total_mass": amount, "initial_total_ngn": q["total_ngn"], "initial_total_mass": amount, "mass_rate_ngn": q["mass_rate_ngn"],
                "starts_at": today.isoformat(), "expires_at": (add_months(today, int(q["term_months"])) - timedelta(days=1)).isoformat(), "term_months": q["term_months"],
                "status": "active", "paid_at": paid_at, "transaction_id": (tx or {}).get("id"), "quote_id": q["id"], "created_at": paid_at, "updated_at": paid_at,
            }
            await db.hp_policies.insert_one(dict(doc))
            title, body_txt = f"You're protected · {policy_no}", f"{q['plan_name']} cover for {home.get('name') or 'your home'} runs until {nice_day(doc['expires_at'])}. {len(new_items)} appliance{'s' if len(new_items) != 1 else ''} insured."
        await db.hp_quotes.update_one({"id": q["id"]}, {"$set": {"status": "paid", "paid_at": paid_at, "policy_id": policy_id}})
        if tx:
            await db.token_transactions.update_one({"id": tx["id"]}, {"$set": {"meta.policy_id": policy_id, "meta.policy_no": policy_no}})
        receipt_no = None
        if amount > 0:
            try:
                rec = await issue_receipt(
                    db, user_id=_uid(user), kind="home_protect", reference=(tx or {}).get("id") or q["id"], amount_ngn=int(q["total_ngn"]), tokens=amount, currency="MASS", rate_ngn=int(q["mass_rate_ngn"]),
                    description=label, balance_after=balance_after,
                    items=[{"label": "Policy", "value": policy_no}, {"label": "Insurer", "value": q["partner_name"]}, {"label": "Home", "value": home.get("name") or "My home"}, {"label": "Appliances", "value": str(len(new_items))}, {"label": "Cover until", "value": nice_day(q["expires_at"])}],
                    meta={"policy_id": policy_id, "quote_id": q["id"], "kind": q["kind"]},
                )
                receipt_no = rec.get("receipt_no")
            except Exception as e:  # noqa: BLE001 — never block the purchase
                logger.warning("home protect receipt failed: %s", e)
        try:
            await emit(db, _uid(user), "HOME_PROTECT_POLICY", title, body_txt, {"policy_id": policy_id, "policy_no": policy_no, "receipt_no": receipt_no, "amount": amount}, category="home", action_url=f"/home/protect/policy/{policy_id}", push=False)
        except Exception as e:  # noqa: BLE001
            logger.warning("home protect notify failed: %s", e)
        out = shape_policy(await _policy(user, policy_id), today)
        out["receipt_no"] = receipt_no
        out["balance_after"] = balance_after
        out["added_items"] = len(new_items)
        return out

    # ── Policies ──
    @router.get("/policies")
    async def list_policies(home_id: Optional[str] = None, user: dict = Depends(get_current_user)):
        today = today_local()
        q: dict[str, Any] = {"user_id": _uid(user)}
        if home_id and home_id != "all":
            q["home_id"] = home_id
        return {"items": [shape_policy(p, today) for p in await db.hp_policies.find(q, {"_id": 0}).sort("created_at", -1).to_list(50)], "today": today.isoformat()}

    @router.get("/policies/{policy_id}")
    async def get_policy(policy_id: str, user: dict = Depends(get_current_user)):
        today = today_local()
        p = shape_policy(await _policy(user, policy_id), today)
        p["claims"] = [shape_claim(c) for c in await db.hp_claims.find({"policy_id": policy_id, "user_id": _uid(user)}, {"_id": 0}).sort("created_at", -1).to_list(100)]
        card = await db.hp_rate_cards.find_one({"id": p.get("rate_card_id")}, {"_id": 0, "claims_phone": 1, "claims_email": 1, "partner_name": 1, "licence": 1})
        p["partner"] = card or {"partner_name": p.get("partner_name")}
        p["perils_labels"] = [PERIL_LABELS.get(k, k) for k in (p.get("cover") or {}).get("perils") or []]
        covered = {i["item_id"] for i in p.get("items") or []}
        extra = await db.hh_items.find({"user_id": _uid(user), "home_id": p["home_id"], "id": {"$nin": list(covered)}}, {"_id": 0, "id": 1, "name": 1, "category": 1, "value": 1, "price": 1, "photo": 1}).to_list(200)
        rates = ((await db.hp_rate_cards.find_one({"active": True}, {"_id": 0, "item_rates": 1})) or {}).get("item_rates") or {}
        p["addable_items"] = [{"id": i["id"], "name": i.get("name"), "category": i.get("category"), "value": i.get("value") or i.get("price"), "photo": i.get("photo")} for i in extra if rates.get(i.get("category") or "other")]
        return p

    # ── Claims ──
    @router.get("/claims")
    async def list_claims(home_id: Optional[str] = None, user: dict = Depends(get_current_user)):
        q: dict[str, Any] = {"user_id": _uid(user)}
        if home_id and home_id != "all":
            q["home_id"] = home_id
        return {"items": [shape_claim(c) for c in await db.hp_claims.find(q, {"_id": 0}).sort("created_at", -1).to_list(100)]}

    @router.post("/claims", status_code=201)
    async def create_claim(body: ClaimIn, user: dict = Depends(get_current_user)):
        from notification_center import emit

        today = today_local()
        if body.id and (existing := await db.hp_claims.find_one({"id": body.id, "user_id": _uid(user)}, {"_id": 0})):
            return shape_claim(existing)
        policy = await _policy(user, body.policy_id)
        state = policy_status(policy, today)
        inc = parse_day(body.incident_date)
        if not inc:
            raise HTTPException(422, "When did it happen?")
        if inc > today:
            raise HTTPException(422, "The incident date can't be in the future")
        starts, ends = parse_day(policy.get("starts_at")), parse_day(policy.get("expires_at"))
        if (starts and inc < starts) or (ends and inc > ends):
            raise HTTPException(422, f"This policy covered {nice_day(policy.get('starts_at'))} to {nice_day(policy.get('expires_at'))} — the incident falls outside it.")
        if state == "cancelled":
            raise HTTPException(409, "This policy was cancelled")
        if body.incident_type not in INCIDENT_KEYS:
            raise HTTPException(422, "Pick what happened")
        item = None
        if body.scope == "appliance":
            item = next((i for i in policy.get("items") or [] if i["item_id"] == body.item_id), None)
            if not item:
                raise HTTPException(422, "Pick an appliance that's on this policy")
        if body.scope == "building" and not (policy.get("cover") or {}).get("include_building"):
            raise HTTPException(422, "This policy doesn't cover the building")
        perils = (policy.get("cover") or {}).get("perils") or []
        warning = None if body.incident_type in perils or body.incident_type == "other" else f"{PERIL_LABELS.get(body.incident_type, 'This')} isn't listed on your {policy.get('plan_name')} plan — the insurer will decide if it's covered."
        now = iso(now_utc())
        claim_no = _ref("CLM")
        while await db.hp_claims.find_one({"claim_no": claim_no}):
            claim_no = _ref("CLM")
        doc = {
            "id": body.id or str(uuid.uuid4()), "claim_no": claim_no, "user_id": _uid(user), "home_id": policy["home_id"], "home_name": policy.get("home_name"), "policy_id": policy["id"], "policy_no": policy["policy_no"], "partner_name": policy.get("partner_name"), "plan_name": policy.get("plan_name"),
            "scope": body.scope, "item_id": (item or {}).get("item_id"), "item_name": (item or {}).get("name"), "item_photo": (item or {}).get("photo"), "item_value": (item or {}).get("value"),
            "incident_type": body.incident_type, "incident_date": inc.isoformat(), "description": body.description.strip(), "amount_claimed_ngn": body.amount_claimed_ngn, "photos": _files(user, body.photos),
            "status": "submitted", "coverage_warning": warning, "payout_ngn": None, "payout_mass": None, "admin_note": None,
            "timeline": [{"at": now, "status": "submitted", "by": "you", "note": "Claim submitted"}],
            "created_at": now, "updated_at": now,
        }
        await db.hp_claims.insert_one(dict(doc))
        try:
            await emit(db, _uid(user), "HOME_PROTECT_CLAIM", f"Claim {claim_no} received", f"We've passed your {PERIL_LABELS.get(body.incident_type, 'damage').lower()} claim to {policy.get('partner_name')}. You'll hear back here as it progresses.", {"claim_id": doc["id"], "claim_no": claim_no, "status": "submitted"}, category="home", action_url=f"/home/protect/claims/{doc['id']}", push=False)
        except Exception as e:  # noqa: BLE001
            logger.warning("claim notify failed: %s", e)
        return shape_claim(doc)

    @router.get("/claims/{claim_id}")
    async def get_claim(claim_id: str, user: dict = Depends(get_current_user)):
        c = await db.hp_claims.find_one({"id": claim_id, "user_id": _uid(user)}, {"_id": 0})
        if not c:
            raise HTTPException(404, "Claim not found")
        out = shape_claim(c)
        card = await db.hp_rate_cards.find_one({"active": True}, {"_id": 0, "claims_phone": 1, "claims_email": 1, "partner_name": 1})
        out["partner"] = card or {}
        return out

    @router.post("/claims/{claim_id}/reply")
    async def reply_claim(claim_id: str, body: ClaimReplyIn, user: dict = Depends(get_current_user)):
        c = await db.hp_claims.find_one({"id": claim_id, "user_id": _uid(user)}, {"_id": 0})
        if not c:
            raise HTTPException(404, "Claim not found")
        if c["status"] in ("rejected", "paid"):
            raise HTTPException(409, "This claim is closed")
        if not body.message.strip() and not body.photos:
            raise HTTPException(422, "Add a message or a photo")
        now = iso(now_utc())
        photos = _files(user, body.photos)
        new_status = "under_review" if c["status"] == "more_info" else c["status"]
        await db.hp_claims.update_one({"id": claim_id}, {"$push": {"timeline": {"at": now, "status": new_status, "by": "you", "note": body.message.strip() or f"{len(photos)} photo{'s' if len(photos) != 1 else ''} added", "photos": photos}, "photos": {"$each": photos}}, "$set": {"status": new_status, "updated_at": now}})
        return shape_claim(await db.hp_claims.find_one({"id": claim_id}, {"_id": 0}))

    # ── Admin ──
    @router.get("/admin/summary")
    async def admin_summary(_: dict = Depends(require_admin)):
        today = today_local()
        policies = await db.hp_policies.find({"status": {"$ne": "cancelled"}}, {"_id": 0, "expires_at": 1, "status": 1, "total_mass": 1, "items": 1}).to_list(10000)
        live = [p for p in policies if policy_status(p, today) in ("active", "expiring")]
        open_claims = await db.hp_claims.count_documents({"status": {"$in": list(CLAIM_OPEN)}})
        paid = await db.hp_claims.find({"status": "paid"}, {"_id": 0, "payout_mass": 1}).to_list(10000)
        return {"policies_live": len(live), "policies_total": len(policies), "items_insured": sum(len(p.get("items") or []) for p in live), "premiums_mass": sum(int(p.get("total_mass") or 0) for p in policies), "claims_open": open_claims, "claims_paid": len(paid), "payouts_mass": sum(int(c.get("payout_mass") or 0) for c in paid), "rate_cards": await db.hp_rate_cards.count_documents({}), "rate_card_active": bool(await db.hp_rate_cards.find_one({"active": True}))}

    @router.get("/admin/rate-cards")
    async def admin_rate_cards(_: dict = Depends(require_admin)):
        return {"items": await db.hp_rate_cards.find({}, {"_id": 0}).sort("updated_at", -1).to_list(50), "categories": [c for c in ITEM_CATEGORIES if c["key"] != "other"], "perils": INCIDENT_TYPES[:-1]}

    def _card_doc(body: RateCardIn, admin: dict, existing: Optional[dict] = None) -> dict:
        keys = [p.key for p in body.plans]
        if len(set(keys)) != len(keys):
            raise HTTPException(422, "Plan keys must be unique")
        for p in body.plans:
            bad = [x for x in p.perils if x not in PERIL_LABELS]
            if bad:
                raise HTTPException(422, f"Unknown peril: {', '.join(bad)}")
        return {
            "id": (existing or {}).get("id") or str(uuid.uuid4()),
            **body.model_dump(exclude={"plans", "item_rates"}),
            "plans": [p.model_dump() for p in body.plans],
            "item_rates": {k: (v.model_dump() if v else None) for k, v in body.item_rates.items() if k in {c["key"] for c in ITEM_CATEGORIES}},
            "created_at": (existing or {}).get("created_at") or iso(now_utc()),
            "updated_at": iso(now_utc()),
            "updated_by": admin.get("email"),
        }

    @router.post("/admin/rate-cards", status_code=201)
    async def admin_create_card(body: RateCardIn, admin: dict = Depends(require_admin)):
        doc = _card_doc(body, admin)
        if doc["active"]:
            await db.hp_rate_cards.update_many({}, {"$set": {"active": False}})
        await db.hp_rate_cards.insert_one(dict(doc))
        return doc

    @router.put("/admin/rate-cards/{card_id}")
    async def admin_update_card(card_id: str, body: RateCardIn, admin: dict = Depends(require_admin)):
        existing = await db.hp_rate_cards.find_one({"id": card_id}, {"_id": 0})
        if not existing:
            raise HTTPException(404, "Rate card not found")
        doc = _card_doc(body, admin, existing)
        if doc["active"]:
            await db.hp_rate_cards.update_many({"id": {"$ne": card_id}}, {"$set": {"active": False}})
        await db.hp_rate_cards.replace_one({"id": card_id}, doc)
        return doc

    @router.post("/admin/rate-cards/{card_id}/activate")
    async def admin_activate_card(card_id: str, _: dict = Depends(require_admin)):
        if not await db.hp_rate_cards.find_one({"id": card_id}):
            raise HTTPException(404, "Rate card not found")
        await db.hp_rate_cards.update_many({}, {"$set": {"active": False}})
        await db.hp_rate_cards.update_one({"id": card_id}, {"$set": {"active": True, "updated_at": iso(now_utc())}})
        return {"ok": True}

    @router.get("/admin/policies")
    async def admin_policies(_: dict = Depends(require_admin)):
        today = today_local()
        rows = [shape_policy(p, today) for p in await db.hp_policies.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)]
        users = {u["id"]: u for u in await db.users.find({"id": {"$in": list({r["user_id"] for r in rows})}}, {"_id": 0, "id": 1, "full_name": 1, "email": 1}).to_list(500)}
        for r in rows:
            u = users.get(r["user_id"], {})
            r["user"] = {"name": u.get("full_name"), "email": u.get("email")}
        return {"items": rows}

    @router.get("/admin/claims")
    async def admin_claims(status: str = Query("open", pattern=r"^(open|closed|all)$"), _: dict = Depends(require_admin)):
        q: dict[str, Any] = {}
        if status == "open":
            q["status"] = {"$in": list(CLAIM_OPEN)}
        elif status == "closed":
            q["status"] = {"$in": ["rejected", "paid"]}
        rows = [shape_claim(c) for c in await db.hp_claims.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)]
        users = {u["id"]: u for u in await db.users.find({"id": {"$in": list({r["user_id"] for r in rows})}}, {"_id": 0, "id": 1, "full_name": 1, "email": 1, "phone": 1}).to_list(500)}
        for r in rows:
            u = users.get(r["user_id"], {})
            r["user"] = {"name": u.get("full_name"), "email": u.get("email"), "phone": u.get("phone")}
        return {"items": rows, "counts": {"open": await db.hp_claims.count_documents({"status": {"$in": list(CLAIM_OPEN)}}), "closed": await db.hp_claims.count_documents({"status": {"$in": ["rejected", "paid"]}})}}

    @router.get("/admin/claims/{claim_id}")
    async def admin_claim(claim_id: str, _: dict = Depends(require_admin)):
        c = await db.hp_claims.find_one({"id": claim_id}, {"_id": 0})
        if not c:
            raise HTTPException(404, "Claim not found")
        out = shape_claim(c)
        u = await db.users.find_one({"id": c["user_id"]}, {"_id": 0, "full_name": 1, "email": 1, "phone": 1}) or {}
        out["user"] = {"name": u.get("full_name"), "email": u.get("email"), "phone": u.get("phone")}
        out["policy"] = shape_policy(await db.hp_policies.find_one({"id": c["policy_id"]}, {"_id": 0}) or {}, today_local())
        out["item"] = clean(await db.hh_items.find_one({"id": c.get("item_id")}, {"_id": 0})) if c.get("item_id") else None
        out["mass_rate_ngn"] = int(((await db.hp_rate_cards.find_one({"active": True}, {"_id": 0, "mass_rate_ngn": 1})) or {}).get("mass_rate_ngn") or MASS_RATE_NGN)
        return out

    @router.post("/admin/claims/{claim_id}/decide")
    async def admin_decide(claim_id: str, body: DecisionIn, admin: dict = Depends(require_admin)):
        """Move a claim along. `approved` fixes the payout; `paid` settles it in MASS to the customer's wallet."""
        from notification_center import emit
        from tokens import WalletService

        c = await db.hp_claims.find_one({"id": claim_id}, {"_id": 0})
        if not c:
            raise HTTPException(404, "Claim not found")
        if c["status"] in ("rejected", "paid"):
            raise HTTPException(409, "This claim is already closed")
        if body.status == "submitted":
            raise HTTPException(422, "Pick a decision")
        now = iso(now_utc())
        rate = int(((await db.hp_rate_cards.find_one({"id": (await db.hp_policies.find_one({"id": c["policy_id"]}, {"_id": 0, "rate_card_id": 1}) or {}).get("rate_card_id")}, {"_id": 0, "mass_rate_ngn": 1})) or {}).get("mass_rate_ngn") or MASS_RATE_NGN)
        sets: dict[str, Any] = {"status": body.status, "updated_at": now, "admin_note": body.note or c.get("admin_note"), "decided_by": admin.get("email")}
        payout_ngn = body.payout_ngn if body.payout_ngn is not None else c.get("payout_ngn")
        if body.status in ("approved", "paid"):
            if payout_ngn is None or payout_ngn <= 0:
                raise HTTPException(422, "Enter the payout amount (₦)")
            sets["payout_ngn"] = float(payout_ngn)
            sets["payout_mass"] = _mass(float(payout_ngn), rate)
        copy = {
            "under_review": ("is being reviewed", "The insurer is looking at your claim now."),
            "more_info": ("needs a bit more from you", body.note or "Please add the details or photos requested."),
            "approved": ("has been approved", f"₦{float(payout_ngn or 0):,.0f} ({sets.get('payout_mass', 0)} MASS) will be paid to your wallet shortly."),
            "rejected": ("wasn't approved", body.note or "The insurer couldn't approve this claim. Reply if you'd like to add anything."),
            "paid": ("has been paid", f"{sets.get('payout_mass', 0)} MASS (₦{float(payout_ngn or 0):,.0f}) is now in your wallet."),
        }[body.status]
        if body.status == "paid":
            sets["paid_at"] = now
        # Atomic: only an open claim can move, so two admins tapping "paid" at once credit the wallet exactly once.
        moved = await db.hp_claims.find_one_and_update(
            {"id": claim_id, "status": {"$nin": ["rejected", "paid"]}},
            {"$set": sets, "$push": {"timeline": {"at": now, "status": body.status, "by": "insurer", "note": body.note or copy[1]}}},
            projection={"_id": 0, "id": 1},
        )
        if not moved:
            raise HTTPException(409, "This claim is already closed")
        if body.status == "paid":
            mass = sets["payout_mass"]
            w = await WalletService(db).credit(c["user_id"], mass, "insurance_payout", f"Home Protect claim {c['claim_no']} settled", meta={"claim_id": c["id"], "claim_no": c["claim_no"], "policy_id": c["policy_id"], "payout_ngn": float(payout_ngn)})
            await db.hp_claims.update_one({"id": claim_id}, {"$set": {"payout_balance_after": int(w["balance"] + w["bonus_balance"])}})
        try:
            await emit(db, c["user_id"], "HOME_PROTECT_CLAIM", f"Claim {c['claim_no']} {copy[0]}", copy[1], {"claim_id": c["id"], "claim_no": c["claim_no"], "status": body.status}, category="home", action_url=f"/home/protect/claims/{c['id']}")
        except Exception as e:  # noqa: BLE001
            logger.warning("claim decision notify failed: %s", e)
        return shape_claim(await db.hp_claims.find_one({"id": claim_id}, {"_id": 0}))

    @router.post("/admin/sweep")
    async def admin_sweep(_: dict = Depends(require_admin)):
        return await run_protect_sweep(db)

    return router
