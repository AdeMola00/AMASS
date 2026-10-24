"""AMASS monetization core — shared unlock service, entitlements, zone/tier
pricing, FIX gate, lean map markers, admin pricing + reporting.

Design (MongoDB standalone → no multi-document transactions):
  • The ENTITLEMENT row is the lock. `POST /unlocks` inserts a *pending*
    entitlement first (unique user+featureKey+target); only the request that
    wins the insert may debit. Concurrent callers see the duplicate and resolve
    to the winner's outcome → exactly one charge, balance never negative.
  • The wallet debit is a conditional atomic update (WalletService.debit).
  • Every wallet change writes a ledger row (token_transactions) carrying
    feature_key / target / category / zone / price snapshot / balance before &
    after / status / idempotency key.
  • Idempotency keys are stored in `unlock_requests` (unique) so a retry after
    an unknown outcome returns the original result instead of charging twice.
  • Reconciliation (startup + every 10 min) fails stale pending entitlements
    and auto-credits unlocks whose property became unavailable within 24h.
"""
from __future__ import annotations

import asyncio
import hashlib
import math
import re
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field
from pymongo import ASCENDING
from pymongo.errors import DuplicateKeyError

from app_settings import get_setting
from social_common import marker_social_context
from tokens import WalletService

FeatureKey = Literal["property", "fixa_provider"]
FEATURE_CURRENCY: dict[str, str] = {"property": "MASS", "fixa_provider": "FIX"}

# ─── MASS — the sole property-access currency ────────────────────────────
# ₦100 = 1 MASS. Property fees are quoted, disclosed and charged in MASS only;
# FIX is the FIXA services currency and is never accepted for property access.
PROPERTY_CURRENCY = "MASS"
MASS_NGN = 100

# ─── Defaults (admin-editable; persisted in app_settings) ───────────────
DEFAULT_MONETIZATION = {
    "conversion": {"MASS_ngn": MASS_NGN, "FIX_ngn": 10},
    "welcome_bonus": {"MASS": 30, "FIX": 100},
    "topup_min_ngn": 1000,
    "topup_bonus_tiers": [
        {"min_ngn": 5000, "bonus_pct": 5},
        {"min_ngn": 10000, "bonus_pct": 10},
        {"min_ngn": 25000, "bonus_pct": 15},
    ],
    "auto_credit_window_hours": 24,
    "map_markers_per_minute": 90,
    "free_amass_sale": False,
}
# Approved Lagos price table (MASS). Base × zone multiplier:
#   Zone A (prime)    rent 80 · sale 120   = ₦8,000 / ₦12,000
#   Zone B (high)     rent 40 · sale 60    = ₦4,000 / ₦6,000
#   Zone C (mid)      rent 20 · sale 30    = ₦2,000 / ₦3,000
#   Zone D (standard) rent 10 · sale 15    = ₦1,000 / ₦1,500
PROPERTY_BASE = {"rent": 10, "sale": 15}
PROPERTY_ZONE_MULT = {"A": 8, "B": 4, "C": 2, "D": 1}
ZONE_LABELS = {"A": "Prime", "B": "High", "C": "Mid", "D": "Standard"}
# Lagos areas per zone — the human-readable face of the approved table (zone lookup is admin-editable).
LAGOS_ZONE_AREAS: dict[str, list[str]] = {
    "A": ["Ikoyi", "Victoria Island", "Banana Island", "Lekki Phase 1"],
    "B": ["Lekki", "Lekki-Ajah", "Ajah", "Ikeja GRA", "Magodo"],
    "C": ["Yaba", "Surulere", "Ikeja", "Festac"],
    "D": ["Everywhere else in Lagos"],
}
# Pre-June-2026 scale (₦10 = 1 MASS, base 100/150) — used once by the startup migration.
_LEGACY_PROPERTY_BASE = {"rent": 100, "sale": 150}
_LEGACY_MASS_NGN = 10
_LEGACY_WELCOME_MASS = 300
PROVIDER_TIER_BASE = {"1": 50, "2": 100, "3": 200, "4": 400}
PROVIDER_ZONE_MULT = {"A": 1.5, "B": 1.25, "C": 1.0, "D": 1.0}
DEFAULT_ZONE_LOOKUP: dict[str, str] = {
    # Zone A — prime
    "ikoyi": "A", "victoria island": "A", "banana island": "A", "lekki phase 1": "A", "maitama": "A", "asokoro": "A",
    # Zone B — high
    "lekki-ajah": "B", "lekki ajah": "B", "ajah": "B", "lekki": "B", "ikeja gra": "B", "magodo": "B", "gwarinpa": "B",
    "wuse": "B", "jabi": "B", "port harcourt gra": "B",
    # Zone C — mid
    "yaba": "C", "surulere": "C", "ikeja": "C", "festac": "C", "kubwa": "C", "ibadan": "C", "enugu": "C", "benin": "C",
}
DEFAULT_CATEGORY_TIERS: dict[str, int] = {
    # 1 small jobs
    "cleaning": 1, "laundry": 1, "gardening": 1, "handyman": 1, "decluttering": 1, "decluttering help": 1, "movers": 1, "moving": 1,
    # 2 skilled trades
    "plumbing": 2, "electrical": 2, "ac": 2, "ac repair": 2, "air conditioning": 2, "carpentry": 2, "painting": 2, "pest control": 2,
    "masonry": 2, "cctv": 2, "security systems": 2,
    # 3 projects
    "renovation": 3, "tiling": 3, "pop": 3, "pop ceiling": 3, "roofing": 3, "solar": 3, "interior design": 3, "interior": 3,
    "interior designers": 3, "project manager": 3, "project managers": 3,
    # 4 professionals
    "surveyor": 4, "surveyors": 4, "architect": 4, "architects": 4, "engineer": 4, "engineers": 4, "valuer": 4,
    "valuers": 4, "inspector": 4, "inspectors": 4, "legal": 4, "title": 4, "legal/title": 4,
}
ZONE_ORDER = ["A", "B", "C", "D"]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _norm(s: Optional[str]) -> str:
    return re.sub(r"\s+", " ", (s or "").lower().replace("—", "-").replace("–", "-")).strip()


def zone_from_lookup(lookup: dict[str, str], *texts: Optional[str]) -> str:
    hay = " | ".join(_norm(t) for t in texts if t)
    if not hay:
        return "D"
    # Longest keys first so "lekki phase 1" beats "lekki", "ikeja gra" beats "ikeja".
    for key in sorted(lookup.keys(), key=len, reverse=True):
        if key and key in hay:
            return lookup[key]
    return "D"


def round_to_10(x: float) -> int:
    """Round half-up to the nearest 10 (62.5 → 60, 75 → 80)."""
    return int(math.floor(x / 10.0 + 0.5) * 10) if x > 0 else 0


def property_category(prop: dict) -> str:
    lt = (prop.get("listing_type") or "").lower()
    return "sale" if lt in ("sale", "buy") else "rent"


# ─── Simple per-user token bucket (map markers) ──────────────────────────
class _Bucket:
    def __init__(self) -> None:
        self.hits: dict[str, list[float]] = {}

    def allow(self, key: str, per_minute: int) -> bool:
        now = time.monotonic()
        window = [t for t in self.hits.get(key, []) if now - t < 60]
        if len(window) >= per_minute:
            self.hits[key] = window
            return False
        window.append(now)
        self.hits[key] = window
        return True


_marker_bucket = _Bucket()


# ─── Pricing engine ──────────────────────────────────────────────────────
class PricingEngine:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db

    async def config(self) -> dict:
        cfg = await get_setting(self.db, "monetization", DEFAULT_MONETIZATION) or {}
        merged = {**DEFAULT_MONETIZATION, **cfg}
        merged["conversion"] = {**DEFAULT_MONETIZATION["conversion"], **(cfg.get("conversion") or {})}
        merged["welcome_bonus"] = {**DEFAULT_MONETIZATION["welcome_bonus"], **(cfg.get("welcome_bonus") or {})}
        return merged

    async def token_ngn(self, currency: str) -> int:
        cfg = await self.config()
        return int(cfg["conversion"].get(f"{currency}_ngn", MASS_NGN if currency == PROPERTY_CURRENCY else 10))

    async def lagos_price_table(self) -> dict:
        """The approved Lagos property-access table: live MASS fees per zone with their exact naira value."""
        rate = await self.token_ngn(PROPERTY_CURRENCY)
        zones = []
        for zone in ZONE_ORDER:
            rent = int((await self.active_price("property", "rent", zone))["amount"])
            sale = int((await self.active_price("property", "sale", zone))["amount"])
            zones.append({
                "zone": zone,
                "label": ZONE_LABELS[zone],
                "areas": LAGOS_ZONE_AREAS[zone],
                "rent": {"mass": rent, "ngn": rent * rate},
                "sale": {"mass": sale, "ngn": sale * rate},
            })
        return {"currency": PROPERTY_CURRENCY, "mass_ngn": rate, "city": "Lagos", "zones": zones}

    async def zone_lookup(self) -> dict[str, str]:
        z = await get_setting(self.db, "zone_lookup", DEFAULT_ZONE_LOOKUP)
        return {**DEFAULT_ZONE_LOOKUP, **(z or {})}

    async def category_tiers(self) -> dict[str, int]:
        t = await get_setting(self.db, "category_tiers", DEFAULT_CATEGORY_TIERS)
        return {**DEFAULT_CATEGORY_TIERS, **(t or {})}

    async def zone_for(self, *texts: Optional[str]) -> str:
        return zone_from_lookup(await self.zone_lookup(), *texts)

    async def tier_for(self, subcategory: Optional[str], category: Optional[str] = None) -> int:
        tiers = await self.category_tiers()
        sub = _norm(subcategory)
        if sub in tiers:
            return int(tiers[sub])
        for key, tier in sorted(tiers.items(), key=lambda kv: len(kv[0]), reverse=True):
            if key and key in sub:
                return int(tier)
        return 1

    def default_amount(self, feature_key: str, category: str, zone: str) -> int:
        if feature_key == "property":
            return int(PROPERTY_BASE.get(category, PROPERTY_BASE["rent"]) * PROPERTY_ZONE_MULT.get(zone, 1))
        return round_to_10(PROVIDER_TIER_BASE.get(str(category), 50) * PROVIDER_ZONE_MULT.get(zone, 1.0))

    async def active_price(self, feature_key: str, category: str, zone: str) -> dict:
        row = await self.db.fee_prices.find_one(
            {"feature_key": feature_key, "category": str(category), "zone_tier": zone, "active": True}, {"_id": 0}
        )
        if row:
            return row
        return {
            "id": None,
            "feature_key": feature_key,
            "category": str(category),
            "zone_tier": zone,
            "currency": FEATURE_CURRENCY[feature_key],
            "amount": self.default_amount(feature_key, category, zone),
            "source": "default",
        }

    async def seed_defaults(self) -> int:
        """Insert active default rows where none exist (idempotent)."""
        created = 0
        for zone in ZONE_ORDER:
            for cat in ("rent", "sale"):
                created += await self._ensure_row("property", cat, zone)
            for tier in ("1", "2", "3", "4"):
                created += await self._ensure_row("fixa_provider", tier, zone)
        return created

    async def _ensure_row(self, fk: str, cat: str, zone: str) -> int:
        exists = await self.db.fee_prices.find_one({"feature_key": fk, "category": cat, "zone_tier": zone, "active": True})
        if exists:
            return 0
        try:
            await self.db.fee_prices.insert_one(
                {
                    "id": str(uuid.uuid4()),
                    "feature_key": fk,
                    "category": cat,
                    "zone_tier": zone,
                    "currency": FEATURE_CURRENCY[fk],
                    "amount": self.default_amount(fk, cat, zone),
                    "active": True,
                    "effective_from": _now(),
                    "effective_to": None,
                    "created_by": "system",
                    "note": "seed",
                    "created_at": _now(),
                }
            )
            return 1
        except DuplicateKeyError:
            return 0

    async def zone_medians(self, zone: str) -> dict:
        """Median sale price & annual rent (naira) for the zone, if data exists."""
        sale: list[int] = []
        rent: list[int] = []
        async for p in self.db.properties.find({"price": {"$gt": 0}}, {"_id": 0, "price": 1, "listing_type": 1, "location": 1, "city": 1, "state": 1}):
            z = await self.zone_for(p.get("location"), p.get("city"), p.get("state"))
            if z != zone:
                continue
            (sale if property_category(p) == "sale" else rent).append(int(p["price"]))
        return {"median_sale": _median(sale), "median_rent": _median(rent), "n_sale": len(sale), "n_rent": len(rent)}

    async def validate_price(self, feature_key: str, category: str, zone: str, amount: int) -> None:
        if amount <= 0:
            raise HTTPException(422, "Price must be greater than zero")
        if feature_key == "property":
            other_cat = "rent" if category == "sale" else "sale"
            other = await self.active_price("property", other_cat, zone)
            if category == "sale" and amount < int(other["amount"]):
                raise HTTPException(422, f"Sale price ({amount}) must be ≥ rent price ({other['amount']}) in zone {zone}")
            if category == "rent" and amount > int(other["amount"]):
                raise HTTPException(422, f"Rent price ({amount}) must be ≤ sale price ({other['amount']}) in zone {zone}")
            med = await self.zone_medians(zone)
            token_ngn = await self.token_ngn("MASS")
            if category == "sale" and med["median_sale"]:
                ceiling = (0.0002 * med["median_sale"]) / token_ngn
                if amount > ceiling:
                    raise HTTPException(422, f"Exceeds ceiling of {int(ceiling)} MASS (0.02% of zone median sale price)")
            if category == "rent" and med["median_rent"]:
                ceiling = (0.005 * med["median_rent"]) / token_ngn
                if amount > ceiling:
                    raise HTTPException(422, f"Exceeds ceiling of {int(ceiling)} MASS (0.5% of zone median annual rent)")

    async def set_price(self, feature_key: str, category: str, zone: str, amount: int, admin_id: str, note: str = "") -> dict:
        await self.validate_price(feature_key, category, zone, int(amount))
        now = _now()
        await self.db.fee_prices.update_many(
            {"feature_key": feature_key, "category": str(category), "zone_tier": zone, "active": True},
            {"$set": {"active": False, "effective_to": now}},
        )
        row = {
            "id": str(uuid.uuid4()),
            "feature_key": feature_key,
            "category": str(category),
            "zone_tier": zone,
            "currency": FEATURE_CURRENCY[feature_key],
            "amount": int(amount),
            "active": True,
            "effective_from": now,
            "effective_to": None,
            "created_by": admin_id,
            "note": note,
            "created_at": now,
        }
        await self.db.fee_prices.insert_one(dict(row))
        return row


def _median(xs: list[int]) -> Optional[int]:
    if not xs:
        return None
    s = sorted(xs)
    n = len(s)
    return int(s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2)


# ─── Target resolution ───────────────────────────────────────────────────
class Target(BaseModel):
    feature_key: str
    target_id: str
    label: str
    category: str
    zone_tier: str
    owner_id: Optional[str] = None
    available: bool = True
    doc: dict = Field(default_factory=dict)


class UnlockService:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.pricing = PricingEngine(db)
        self.wallet = WalletService(db)

    # ── targets ──
    async def resolve_target(self, feature_key: str, target_id: str) -> Target:
        if feature_key == "property":
            doc = await self.db.properties.find_one({"id": target_id}, {"_id": 0})
            if not doc:
                raise HTTPException(404, "Property not found")
            cat = property_category(doc)
            if not doc.get("listing_type"):
                raise HTTPException(422, "Property has no category")
            zone = await self.pricing.zone_for(doc.get("location"), doc.get("city"), doc.get("state"))
            available = (doc.get("status") or "available") not in ("sold", "unavailable", "removed", "withdrawn")
            ref = doc.get("amass_id") or f"AM-{doc['id'][:6].upper()}"
            return Target(
                feature_key=feature_key, target_id=target_id,
                label=f"{cat.title()} · {(doc.get('property_type') or 'property').replace('_', ' ').title()} · {ref}",
                category=cat, zone_tier=zone, owner_id=doc.get("agent_id"), available=available, doc=doc,
            )
        if feature_key == "fixa_provider":
            doc = await self.db.marketplace.find_one({"id": target_id, "category": "services"}, {"_id": 0})
            if not doc:
                raise HTTPException(404, "Provider not found")
            tier = await self.pricing.tier_for(doc.get("subcategory"), doc.get("category"))
            zone = await self.pricing.zone_for(doc.get("location"), doc.get("city"))
            available = (doc.get("status") or "active") not in ("inactive", "suspended", "removed")
            return Target(
                feature_key=feature_key, target_id=target_id,
                label=doc.get("seller_name") or doc.get("name") or "FIXA provider",
                category=str(tier), zone_tier=zone, owner_id=doc.get("seller_id") or doc.get("vendor_id"),
                available=available, doc=doc,
            )
        raise HTTPException(422, "Unknown featureKey")

    @staticmethod
    def is_owner(user: dict, t: Target) -> bool:
        """Owners (listing agent / provider) never pay for their own item. Admins are NOT exempt:
        the paid unlock applies uniformly so pricing, ledger and demos behave the same for everyone."""
        if not t.owner_id:
            return False
        return t.owner_id == user.get("id")

    async def entitlement(self, user_id: str, feature_key: str, target_id: str) -> Optional[dict]:
        return await self.db.entitlements.find_one(
            {"user_id": user_id, "feature_key": feature_key, "target_id": target_id, "status": "active"}, {"_id": 0}
        )

    async def has_access(self, user: dict, feature_key: str, target_id: str, t: Optional[Target] = None) -> bool:
        if t is not None and self.is_owner(user, t):
            return True
        return (await self.entitlement(user["id"], feature_key, target_id)) is not None

    # ── quote ──
    async def quote(self, user: dict, feature_key: str, target_id: str, log_attempt: bool = True) -> dict:
        t = await self.resolve_target(feature_key, target_id)
        currency = FEATURE_CURRENCY[feature_key]
        price = await self.pricing.active_price(feature_key, t.category, t.zone_tier)
        fee = int(price["amount"])
        token_ngn = await self.pricing.token_ngn(currency)
        w = await self.wallet.get_or_create(user["id"], currency)  # type: ignore[arg-type]
        balance = int(w["balance"] + w["bonus_balance"])
        ent = await self.entitlement(user["id"], feature_key, target_id)
        owner = self.is_owner(user, t)
        if log_attempt and not ent and not owner:
            await self._event(user["id"], feature_key, target_id, "attempt", fee, currency, t)
        return {
            "feature_key": feature_key,
            "target_id": target_id,
            "label": t.label,
            "category": t.category,
            "zone_tier": t.zone_tier,
            "currency": currency,
            "fee": 0 if (ent or owner) else fee,
            "fee_ngn": 0 if (ent or owner) else fee * token_ngn,
            "token_ngn": token_ngn,
            "balance": balance,
            "balance_after": balance if (ent or owner) else balance - fee,
            "can_afford": bool(ent or owner or balance >= fee),
            "already_unlocked": ent is not None,
            "is_owner": owner,
            "available": t.available,
            "price_id": price.get("id"),
        }

    async def _event(self, user_id: str, feature_key: str, target_id: str, outcome: str, fee: int, currency: str, t: Optional[Target], extra: Optional[dict] = None) -> None:
        await self.db.unlock_events.insert_one(
            {
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "feature_key": feature_key,
                "target_id": target_id,
                "outcome": outcome,
                "fee": fee,
                "currency": currency,
                "category": t.category if t else None,
                "zone_tier": t.zone_tier if t else None,
                "created_at": _now(),
                **(extra or {}),
            }
        )

    # ── unlock ──
    async def unlock(self, user: dict, feature_key: str, target_id: str, idempotency_key: str) -> dict:
        if feature_key not in FEATURE_CURRENCY:
            raise HTTPException(422, "Unknown featureKey")
        if not idempotency_key or len(idempotency_key) < 8:
            raise HTTPException(422, "Idempotency-Key header required")
        uid = user["id"]
        currency = FEATURE_CURRENCY[feature_key]
        # 0. Idempotency: same key → same answer.
        try:
            await self.db.unlock_requests.insert_one(
                {"key": idempotency_key, "user_id": uid, "feature_key": feature_key, "target_id": target_id, "status": "pending", "created_at": _now()}
            )
        except DuplicateKeyError:
            prev = await self.db.unlock_requests.find_one({"key": idempotency_key}, {"_id": 0})
            if prev and prev.get("user_id") != uid:
                raise HTTPException(409, "Idempotency key belongs to another user")
            if prev and prev.get("status") == "completed":
                return prev["result"]
            if prev and prev.get("status") == "failed":
                raise HTTPException(int(prev.get("error_code", 409)), prev.get("error", "Previous attempt failed"))
            raise HTTPException(409, "Unlock in progress — check status before retrying")

        try:
            result = await self._unlock_inner(user, feature_key, target_id, currency, idempotency_key)
        except HTTPException as e:
            await self.db.unlock_requests.update_one(
                {"key": idempotency_key}, {"$set": {"status": "failed", "error": e.detail, "error_code": e.status_code, "finished_at": _now()}}
            )
            raise
        await self.db.unlock_requests.update_one({"key": idempotency_key}, {"$set": {"status": "completed", "result": result, "finished_at": _now()}})
        return result

    async def _unlock_inner(self, user: dict, feature_key: str, target_id: str, currency: str, idem: str) -> dict:
        uid = user["id"]
        if feature_key == "property" and currency != PROPERTY_CURRENCY:
            # Property access is MASS-only — no other token (FIX) or path may charge for it.
            raise HTTPException(422, "Property access is charged in MASS only")
        t = await self.resolve_target(feature_key, target_id)
        # 1. validate
        if not t.available:
            await self._event(uid, feature_key, target_id, "failed", 0, currency, t, {"reason": "unavailable"})
            raise HTTPException(409, "This listing is no longer available")
        # 2. existing entitlement / owner → free
        if self.is_owner(user, t):
            return await self._result(user, t, None, charged=0, currency=currency, free_reason="owner")
        existing = await self.entitlement(uid, feature_key, target_id)
        if existing:
            await self._event(uid, feature_key, target_id, "free_repeat", 0, currency, t)
            return await self._result(user, t, existing, charged=0, currency=currency, free_reason="already_unlocked")
        # 3. fee (server-side, live)
        price = await self.pricing.active_price(feature_key, t.category, t.zone_tier)
        fee = int(price["amount"])
        token_ngn = await self.pricing.token_ngn(currency)
        # 4. balance pre-check (no deduction)
        w = await self.wallet.get_or_create(uid, currency)  # type: ignore[arg-type]
        balance = int(w["balance"] + w["bonus_balance"])
        if balance < fee:
            await self._event(uid, feature_key, target_id, "insufficient", fee, currency, t)
            raise HTTPException(402, f"Insufficient {currency}: need {fee}, have {balance}")
        # 5. lock via pending entitlement (unique index) — exactly one winner
        ent_id = str(uuid.uuid4())
        pending = {
            "id": ent_id,
            "user_id": uid,
            "feature_key": feature_key,
            "target_id": target_id,
            "status": "pending",
            "currency": currency,
            "amount_paid": fee,
            "category": t.category,
            "zone_tier": t.zone_tier,
            "price_id": price.get("id"),
            "transaction_id": None,
            "idempotency_key": idem,
            "source": "paid",
            "created_at": _now(),
        }
        try:
            await self.db.entitlements.insert_one(dict(pending))
        except DuplicateKeyError:
            # Another request won. Wait briefly for it to settle, then serve its outcome.
            for _ in range(20):
                other = await self.db.entitlements.find_one({"user_id": uid, "feature_key": feature_key, "target_id": target_id}, {"_id": 0})
                if other and other.get("status") == "active":
                    await self._event(uid, feature_key, target_id, "free_repeat", 0, currency, t, {"reason": "concurrent"})
                    return await self._result(user, t, other, charged=0, currency=currency, free_reason="already_unlocked")
                if not other:
                    raise HTTPException(409, "Concurrent unlock failed — please retry")
                await asyncio.sleep(0.1)
            raise HTTPException(409, "Unlock in progress — check status before retrying")
        # 6. debit atomically + ledger
        try:
            updated = await self.wallet.debit(
                uid, fee, "spend_unlock", f"Unlocked {t.label}",
                currency=currency,  # type: ignore[arg-type]
                meta={"feature_key": feature_key, "target_id": target_id, "entitlement_id": ent_id},
                extra={
                    "feature_key": feature_key, "target_id": target_id, "category": t.category, "zone_tier": t.zone_tier,
                    "price_snapshot": {"amount": fee, "currency": currency, "token_ngn": token_ngn, "ngn": fee * token_ngn, "price_id": price.get("id")},
                    "status": "completed", "idempotency_key": idem, "entitlement_id": ent_id,
                },
            )
        except HTTPException as e:
            await self.db.entitlements.delete_one({"id": ent_id, "status": "pending"})
            await self._event(uid, feature_key, target_id, "failed" if e.status_code != 402 else "insufficient", fee, currency, t, {"reason": str(e.detail)})
            raise
        tx = await self.db.token_transactions.find_one({"idempotency_key": idem, "user_id": uid}, {"_id": 0, "id": 1})
        await self.db.entitlements.update_one(
            {"id": ent_id}, {"$set": {"status": "active", "transaction_id": tx["id"] if tx else None, "activated_at": _now()}}
        )
        ent = await self.db.entitlements.find_one({"id": ent_id}, {"_id": 0})
        await self._event(uid, feature_key, target_id, "paid", fee, currency, t, {"transaction_id": ent.get("transaction_id")})
        balance_after = int(updated["balance"] + updated["bonus_balance"])
        # Receipt — issued only now, after the debit + ledger row are committed (one per entitlement).
        receipt_no = None
        if feature_key == "property":
            try:
                from receipts import issue_receipt
                rec = await issue_receipt(
                    self.db, user_id=uid, kind="property_access", reference=ent.get("transaction_id") or ent_id,
                    amount_ngn=fee * token_ngn, tokens=fee, currency=currency, rate_ngn=token_ngn,
                    description=f"Property access · {t.label}",
                    items=[
                        {"label": "Property", "value": t.label},
                        {"label": "Zone", "value": f"Zone {t.zone_tier} · {ZONE_LABELS.get(t.zone_tier, '')}".strip(" ·")},
                        {"label": "Fee", "value": f"{fee:,} MASS = ₦{fee * token_ngn:,}"},
                    ],
                    balance_after=balance_after,
                    meta={"property_id": target_id, "entitlement_id": ent_id, "category": t.category, "zone_tier": t.zone_tier},
                )
                receipt_no = rec.get("receipt_no")
                if receipt_no:
                    await self.db.entitlements.update_one({"id": ent_id}, {"$set": {"receipt_no": receipt_no}})
                    if ent.get("transaction_id"):
                        await self.db.token_transactions.update_one({"id": ent["transaction_id"]}, {"$set": {"receipt_no": receipt_no}})
                    ent["receipt_no"] = receipt_no
            except Exception as e:  # never block the unlock
                import logging
                logging.getLogger("amass.monetization").warning("unlock receipt failed: %s", e)
        # Receipt in the Notification Center (never pushed — the user just did this on-screen).
        try:
            from notification_center import emit
            await emit(
                self.db, uid, "UNLOCK_RECEIPT",
                f"Receipt · {fee} {currency} spent",
                f"Unlocked {t.label}. Balance now {balance_after} {currency}.",
                {"reference": ent.get("transaction_id") or ent_id, "receipt_no": receipt_no, "feature_key": feature_key, "target_id": target_id, "amount": fee, "currency": currency, **({"property_id": target_id} if feature_key == "property" else {})},
                action_url="/wallet",
                push=False,
            )
        except Exception as e:  # never block the unlock
            import logging
            logging.getLogger("amass.monetization").warning("unlock receipt notification failed: %s", e)
        return await self._result(user, t, ent, charged=fee, currency=currency, balance_after=balance_after)

    async def _result(self, user: dict, t: Target, ent: Optional[dict], *, charged: int, currency: str, free_reason: Optional[str] = None, balance_after: Optional[int] = None) -> dict:
        if balance_after is None:
            w = await self.wallet.get_or_create(user["id"], currency)  # type: ignore[arg-type]
            balance_after = int(w["balance"] + w["bonus_balance"])
        details = await self.details(user, t)
        return {
            "ok": True,
            "feature_key": t.feature_key,
            "target_id": t.target_id,
            "charged": charged,
            "currency": currency,
            "balance_after": balance_after,
            "free_reason": free_reason,
            "entitlement": ent,
            "details": details,
        }

    # ── protected detail payloads ──
    async def details(self, user: dict, t: Target) -> dict:
        if t.feature_key == "property":
            doc = dict(t.doc)
            agent = await self.db.users.find_one({"id": doc.get("agent_id")}, {"_id": 0, "phone": 1, "email": 1, "full_name": 1, "avatar_url": 1, "agent_slug": 1}) if doc.get("agent_id") else None
            doc["agent_phone"] = (agent or {}).get("phone")
            doc["agent_email"] = (agent or {}).get("email")
            doc["agent_name"] = doc.get("agent_name") or (agent or {}).get("full_name")
            doc["agent_avatar"] = doc.get("agent_avatar") or (agent or {}).get("avatar_url")
            doc["unlocked"] = True
            doc["agent_unlocked"] = True
            doc["is_free_amass_sale"] = False
            return doc
        doc = dict(t.doc)
        doc["unlocked"] = True
        return doc

    @staticmethod
    def provider_preview(doc: dict) -> dict:
        """Non-sensitive card data — safe to list before unlock."""
        name = doc.get("seller_name") or doc.get("name") or "FIXA provider"
        initials = "".join(p[0] for p in name.replace("—", " ").split()[:2] if p and p[0].isalpha()).upper()
        return {
            "id": doc["id"],
            "display_name": name.split("—")[0].strip(),
            "initials": initials or "FX",
            "category": doc.get("subcategory") or "Services",
            "rating": doc.get("rating"),
            "reviews": doc.get("reviews") or doc.get("seller_reviews"),
            "area": doc.get("location") or doc.get("city"),
            "verified": bool(doc.get("is_fixa_verified") or doc.get("verified")),
            "badges": doc.get("fixa_badges") or [],
            "years_experience": doc.get("provider_years_experience"),
            "jobs_completed": doc.get("provider_jobs_completed"),
            "image": doc.get("image") or (doc.get("images") or [None])[0],
            "is_boosted": bool(doc.get("is_boosted")),
        }

    # ── reconciliation / auto-credit ──
    async def reconcile(self) -> dict:
        now = _now()
        stale = await self.db.entitlements.delete_many({"status": "pending", "created_at": {"$lt": now - timedelta(minutes=5)}})
        await self.db.unlock_requests.update_many(
            {"status": "pending", "created_at": {"$lt": now - timedelta(minutes=5)}},
            {"$set": {"status": "failed", "error": "timed out", "error_code": 409}},
        )
        cfg = await self.pricing.config()
        window = int(cfg.get("auto_credit_window_hours", 24))
        credited = 0
        cursor = self.db.entitlements.find(
            {"status": "active", "feature_key": "property", "source": "paid", "amount_paid": {"$gt": 0}, "created_at": {"$gte": now - timedelta(hours=window)}},
            {"_id": 0},
        )
        async for ent in cursor:
            prop = await self.db.properties.find_one({"id": ent["target_id"]}, {"_id": 0, "status": 1})
            if prop is None or (prop.get("status") in ("sold", "unavailable", "removed", "withdrawn")):
                if await self.auto_credit(ent, "listing_unavailable", actor="system"):
                    credited += 1
        return {"stale_pending_removed": stale.deleted_count, "auto_credited": credited}

    async def auto_credit(self, ent: dict, reason: str, actor: str = "system") -> bool:
        """Refund an unlock through the ledger exactly once; keeps the record (never edits completed rows)."""
        res = await self.db.entitlements.update_one(
            {"id": ent["id"], "status": "active"}, {"$set": {"status": "refunded", "refund_reason": reason, "refunded_at": _now(), "refunded_by": actor}}
        )
        if res.modified_count == 0:
            return False
        await self.wallet.credit(
            ent["user_id"], int(ent["amount_paid"]), "refund", f"Auto-credit: {reason.replace('_', ' ')}",
            currency=ent["currency"],
            meta={"feature_key": ent["feature_key"], "target_id": ent["target_id"], "entitlement_id": ent["id"], "reason": reason},
            extra={
                "feature_key": ent["feature_key"], "target_id": ent["target_id"], "category": ent.get("category"), "zone_tier": ent.get("zone_tier"),
                "status": "completed", "auto_credit": True, "refund_of": ent.get("transaction_id"), "entitlement_id": ent["id"],
            },
        )
        await self._event(ent["user_id"], ent["feature_key"], ent["target_id"], "auto_credit", int(ent["amount_paid"]), ent["currency"], None, {"reason": reason})
        return True

    async def migrate_legacy_unlocks(self) -> int:
        """property_unlocks (tier access/legacy) → entitlements. Idempotent; keeps IDs."""
        n = 0
        async for r in self.db.property_unlocks.find({"$or": [{"tier": "access"}, {"tier": {"$exists": False}}], "status": {"$ne": "pending"}}, {"_id": 0}):
            if r.get("expires_at") and r["expires_at"] < _now():
                continue
            try:
                await self.db.entitlements.insert_one(
                    {
                        "id": r.get("id") or str(uuid.uuid4()), "user_id": r["user_id"], "feature_key": "property", "target_id": r["property_id"], "status": "active",
                        "currency": "MASS", "amount_paid": int(r.get("tokens_paid") or 0), "category": None, "zone_tier": None, "price_id": None,
                        "transaction_id": r.get("transaction_id"), "idempotency_key": None, "source": "legacy", "created_at": r.get("created_at") or _now(),
                        "activated_at": r.get("created_at") or _now(),
                    }
                )
                n += 1
            except DuplicateKeyError:
                continue
        return n


# ─── Indexes ─────────────────────────────────────────────────────────────
async def ensure_monetization_defaults(db: AsyncIOMotorDatabase) -> None:
    """Persist admin-editable defaults (monetization / zone_lookup / category_tiers) once."""
    for key, value in (("monetization", DEFAULT_MONETIZATION), ("zone_lookup", DEFAULT_ZONE_LOOKUP), ("category_tiers", DEFAULT_CATEGORY_TIERS)):
        if not await db.app_settings.find_one({"key": key}, {"_id": 0, "key": 1}):
            await db.app_settings.insert_one({"key": key, "value": value, "is_system": True, "created_at": _now(), "updated_at": _now()})


async def migrate_mass_ngn_100(db: AsyncIOMotorDatabase) -> Optional[dict]:
    """One-off: move persisted pricing from ₦10/MASS to the approved ₦100/MASS scale.

    Naira fees stay identical (Zone A rent ₦8,000 → 800 MASS before, 80 MASS now); only the
    MASS numbers shrink ×10. Welcome bonus keeps its ₦3,000 value (300 → 30 MASS). Wallet
    balances and the historical ledger are NOT touched. Guarded by a `migrations` row so it
    runs exactly once; a fresh database (already on the new defaults) is a no-op.
    """
    key = "mass_ngn_100_v1"
    if await db.migrations.find_one({"key": key}):
        return None
    report = {"key": key, "applied_at": _now(), "conversion": False, "welcome_bonus": False, "fee_prices": 0}
    cfg = await db.app_settings.find_one({"key": "monetization"}, {"_id": 0, "value": 1})
    if cfg:
        value = dict(cfg.get("value") or {})
        conv = dict(value.get("conversion") or {})
        wb = dict(value.get("welcome_bonus") or {})
        if int(conv.get("MASS_ngn", _LEGACY_MASS_NGN)) == _LEGACY_MASS_NGN:
            conv["MASS_ngn"] = MASS_NGN
            report["conversion"] = True
        if int(wb.get("MASS", _LEGACY_WELCOME_MASS)) == _LEGACY_WELCOME_MASS:
            wb["MASS"] = DEFAULT_MONETIZATION["welcome_bonus"]["MASS"]
            report["welcome_bonus"] = True
        if report["conversion"] or report["welcome_bonus"]:
            await db.app_settings.update_one(
                {"key": "monetization"},
                {"$set": {"value": {**value, "conversion": conv, "welcome_bonus": wb}, "updated_at": _now()}},
            )
    # Property fee rows: legacy default → new default; admin overrides scale ÷10 (min 1 MASS).
    async for row in db.fee_prices.find({"feature_key": "property", "active": True}):
        cat, zone, amount = row.get("category"), row.get("zone_tier"), int(row.get("amount", 0))
        legacy_default = _LEGACY_PROPERTY_BASE.get(cat, _LEGACY_PROPERTY_BASE["rent"]) * PROPERTY_ZONE_MULT.get(zone, 1)
        new_default = PROPERTY_BASE.get(cat, PROPERTY_BASE["rent"]) * PROPERTY_ZONE_MULT.get(zone, 1)
        if amount == new_default or amount < legacy_default / 2:
            continue  # already on the new scale
        new_amount = new_default if amount == legacy_default else max(1, int(round(amount / 10)))
        await db.fee_prices.update_one(
            {"_id": row["_id"]},
            {"$set": {"amount": new_amount, "legacy_amount": amount, "note": f"{row.get('note') or ''} · rescaled to ₦100/MASS".strip(" ·")}},
        )
        report["fee_prices"] += 1
    await db.migrations.insert_one(dict(report))
    return report


async def ensure_monetization_indexes(db: AsyncIOMotorDatabase) -> None:
    await ensure_monetization_defaults(db)
    await migrate_mass_ngn_100(db)
    await db.entitlements.create_index([("user_id", ASCENDING), ("feature_key", ASCENDING), ("target_id", ASCENDING)], unique=True, name="entitlement_uniq")
    await db.entitlements.create_index([("target_id", ASCENDING), ("status", ASCENDING)], name="entitlement_target")
    await db.unlock_requests.create_index([("key", ASCENDING)], unique=True, name="unlock_request_key_uniq")
    await db.unlock_requests.create_index([("created_at", ASCENDING)], expireAfterSeconds=60 * 60 * 24 * 14, name="unlock_request_ttl")
    await db.token_transactions.create_index(
        [("idempotency_key", ASCENDING)], unique=True, name="tx_idempotency_uniq",
        partialFilterExpression={"idempotency_key": {"$type": "string"}},
    )
    await db.token_transactions.create_index([("feature_key", ASCENDING), ("created_at", ASCENDING)], name="tx_feature_created")
    await db.fee_prices.create_index(
        [("feature_key", ASCENDING), ("category", ASCENDING), ("zone_tier", ASCENDING)], unique=True, name="fee_price_active_uniq",
        partialFilterExpression={"active": True},
    )
    await db.unlock_events.create_index([("created_at", ASCENDING)], name="unlock_events_created")
    await db.unlock_events.create_index([("user_id", ASCENDING), ("feature_key", ASCENDING), ("target_id", ASCENDING)], name="unlock_events_user_target")


# ─── Routes ──────────────────────────────────────────────────────────────
class UnlockIn(BaseModel):
    featureKey: FeatureKey
    targetId: str


class CancelIn(BaseModel):
    featureKey: FeatureKey
    targetId: str
    reason: Optional[str] = None


class ReportIn(BaseModel):
    reason: Literal["unavailable", "unreachable"]
    note: Optional[str] = None


class PriceIn(BaseModel):
    featureKey: FeatureKey
    category: str
    zoneTier: Literal["A", "B", "C", "D"]
    amount: int
    note: Optional[str] = ""


class ZoneLookupIn(BaseModel):
    zones: dict[str, Literal["A", "B", "C", "D"]]


class TiersIn(BaseModel):
    tiers: dict[str, int]


class ConfigIn(BaseModel):
    conversion: Optional[dict] = None
    welcome_bonus: Optional[dict] = None
    topup_min_ngn: Optional[int] = None
    topup_bonus_tiers: Optional[list] = None
    auto_credit_window_hours: Optional[int] = None
    map_markers_per_minute: Optional[int] = None
    free_amass_sale: Optional[bool] = None


class AdjustIn(BaseModel):
    reason: str
    amount: Optional[int] = None


def register_monetization_routes(db: AsyncIOMotorDatabase, get_current_user, require_admin):
    svc = UnlockService(db)
    pricing = svc.pricing
    router = APIRouter(prefix="/api", tags=["monetization"])
    admin = APIRouter(prefix="/api/admin", tags=["monetization-admin"])

    async def require_fix_access(user: dict = Depends(get_current_user)) -> dict:
        """FIXA gate: FIX > 0, read live from the wallet (never cached). Entry never deducts."""
        w = await svc.wallet.get_or_create(user["id"], "FIX")
        bal = int(w["balance"] + w["bonus_balance"])
        if bal <= 0:
            raise HTTPException(403, {"code": "FIX_REQUIRED", "message": "FIXA access requires FIX tokens", "balance": bal})
        user["_fix_balance"] = bal
        return user

    # ── public config (naira equivalence shown everywhere) ──
    @router.get("/monetization/config")
    async def public_config():
        cfg = await pricing.config()
        return {"conversion": cfg["conversion"], "welcome_bonus": cfg["welcome_bonus"], "topup_min_ngn": cfg["topup_min_ngn"], "topup_bonus_tiers": cfg["topup_bonus_tiers"]}

    @router.get("/monetization/price-table")
    async def public_price_table():
        """Approved Lagos property-access fees — MASS with exact naira value (₦100 = 1 MASS)."""
        return await pricing.lagos_price_table()

    # ── quotes & unlocks ──
    @router.get("/unlocks/quote")
    async def get_quote(featureKey: FeatureKey, targetId: str, user: dict = Depends(get_current_user)):
        if featureKey == "fixa_provider":
            await require_fix_access(user)
        return await svc.quote(user, featureKey, targetId)

    @router.post("/unlocks")
    async def post_unlock(data: UnlockIn, request: Request, user: dict = Depends(get_current_user)):
        key = request.headers.get("Idempotency-Key") or request.headers.get("idempotency-key") or ""
        if data.featureKey == "fixa_provider":
            await require_fix_access(user)
        return await svc.unlock(user, data.featureKey, data.targetId, key)

    @router.get("/unlocks/status/{key}")
    async def unlock_status(key: str, user: dict = Depends(get_current_user)):
        req = await db.unlock_requests.find_one({"key": key, "user_id": user["id"]}, {"_id": 0})
        if not req:
            raise HTTPException(404, "Unknown idempotency key")
        return req

    @router.post("/unlocks/cancel")
    async def cancel_unlock(data: CancelIn, user: dict = Depends(get_current_user)):
        try:
            t = await svc.resolve_target(data.featureKey, data.targetId)
            price = await pricing.active_price(data.featureKey, t.category, t.zone_tier)
            fee = int(price["amount"])
        except HTTPException:
            t, fee = None, 0
        await svc._event(user["id"], data.featureKey, data.targetId, "cancelled", fee, FEATURE_CURRENCY[data.featureKey], t, {"reason": data.reason})
        return {"ok": True}

    @router.get("/unlocks/mine")
    async def my_unlocks(featureKey: FeatureKey = Query(...), user: dict = Depends(get_current_user)):
        ents = await db.entitlements.find({"user_id": user["id"], "feature_key": featureKey, "status": {"$in": ["active", "refunded"]}}, {"_id": 0}).sort("created_at", -1).to_list(500)
        ids = [e["target_id"] for e in ents]
        out = []
        if featureKey == "property":
            docs = {d["id"]: d for d in await db.properties.find({"id": {"$in": ids}}, {"_id": 0}).to_list(500)}
            for e in ents:
                d = docs.get(e["target_id"])
                if d:
                    out.append({"entitlement": e, "property": {**d, "unlocked": True, "agent_unlocked": True}})
        else:
            docs = {d["id"]: d for d in await db.marketplace.find({"id": {"$in": ids}}, {"_id": 0}).to_list(500)}
            for e in ents:
                d = docs.get(e["target_id"])
                if d:
                    out.append({"entitlement": e, "provider": {**UnlockService.provider_preview(d), "phone": d.get("seller_phone"), "whatsapp": d.get("seller_whatsapp"), "unlocked": True}})
        return {"items": out, "count": len(out)}

    @router.post("/unlocks/{entitlement_id}/report")
    async def report_unlock(entitlement_id: str, data: ReportIn, user: dict = Depends(get_current_user)):
        ent = await db.entitlements.find_one({"id": entitlement_id, "user_id": user["id"]}, {"_id": 0})
        if not ent:
            raise HTTPException(404, "Unlock not found")
        if ent.get("status") != "active" or int(ent.get("amount_paid") or 0) <= 0:
            raise HTTPException(409, "This unlock is not eligible for a credit")
        cfg = await pricing.config()
        window = int(cfg.get("auto_credit_window_hours", 24))
        created = ent.get("created_at")
        if created and created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        if not created or created < _now() - timedelta(hours=window):
            raise HTTPException(409, f"Credits are only automatic within {window}h of unlocking")
        reason = "listing_unavailable" if data.reason == "unavailable" else "provider_unreachable"
        ok = await svc.auto_credit(ent, reason, actor=user["id"])
        if not ok:
            raise HTTPException(409, "Already credited")
        await db.monetization_audit.insert_one({"id": str(uuid.uuid4()), "type": "auto_credit", "actor": user["id"], "entitlement_id": entitlement_id, "reason": reason, "note": data.note, "created_at": _now()})
        return {"ok": True, "credited": int(ent["amount_paid"]), "currency": ent["currency"]}

    # ── property details (403 without entitlement) ──
    @router.get("/properties/{property_id}/details")
    async def property_details(property_id: str, user: dict = Depends(get_current_user)):
        t = await svc.resolve_target("property", property_id)
        if not await svc.has_access(user, "property", property_id, t):
            q = await svc.quote(user, "property", property_id, log_attempt=False)
            raise HTTPException(403, {"code": "UNLOCK_REQUIRED", "fee": q["fee"], "fee_ngn": q["fee_ngn"], "currency": "MASS", "balance": q["balance"]})
        return await svc.details(user, t)

    # ── lean, authenticated, rate-limited markers ──
    @router.get("/map/markers")
    async def map_markers(
        min_lat: Optional[float] = None, max_lat: Optional[float] = None, min_lng: Optional[float] = None, max_lng: Optional[float] = None,
        listing_type: Optional[str] = None, property_type: Optional[str] = None, min_price: Optional[int] = None, max_price: Optional[int] = None,
        bedrooms: Optional[int] = None, verified: Optional[bool] = None, q: Optional[str] = None, limit: int = 300,
        user: dict = Depends(get_current_user),
    ):
        cfg = await pricing.config()
        if not _marker_bucket.allow(user["id"], int(cfg.get("map_markers_per_minute", 90))):
            raise HTTPException(429, "Too many map requests — slow down a little")
        query: dict = {"status": {"$nin": ["sold", "removed", "withdrawn", "unavailable"]}}
        if listing_type:
            query["listing_type"] = {"$in": ["sale", "buy"]} if listing_type in ("sale", "buy") else listing_type
        if property_type:
            query["property_type"] = property_type
        if bedrooms is not None:
            query["bedrooms"] = {"$gte": bedrooms}
        if verified is not None:
            query["verified"] = verified
        if min_price is not None or max_price is not None:
            pr: dict = {}
            if min_price is not None:
                pr["$gte"] = min_price
            if max_price is not None:
                pr["$lte"] = max_price
            query["price"] = pr
        if q:
            rx = {"$regex": re.escape(q), "$options": "i"}
            query["$or"] = [{"title": rx}, {"city": rx}, {"location": rx}, {"state": rx}]
        if None not in (min_lat, max_lat, min_lng, max_lng):
            query["latitude"] = {"$gte": min_lat, "$lte": max_lat}
            query["longitude"] = {"$gte": min_lng, "$lte": max_lng}
        docs = await db.properties.find(query, {"_id": 0, "id": 1, "title": 1, "listing_type": 1, "property_type": 1, "latitude": 1, "longitude": 1, "agent_id": 1, "verified": 1, "promotion": 1,
                                               "price": 1, "image": 1, "images": 1, "bedrooms": 1, "bathrooms": 1, "size_sqm": 1, "city": 1, "state": 1, "location": 1, "status": 1, "is_amass_exclusive": 1, "documents_verified": 1}).limit(min(limit, 500)).to_list(500)
        from promotions import active_promotion as _active_promo
        from tokens import is_free_amass_sale as _is_free_sale
        ent_ids = {e["target_id"] for e in await db.entitlements.find({"user_id": user["id"], "feature_key": "property", "status": "active"}, {"_id": 0, "target_id": 1}).to_list(2000)}
        # Friend nudges: counts only (friends who share their saves + my shared lists). Never reveals paid data.
        social = await marker_social_context(db, user["id"], [d["id"] for d in docs])
        # Zone/category fee per marker (same O(1)-per-zone cache as list endpoints) so tiles can say "Unlock · N MASS".
        lookup = await pricing.zone_lookup()
        free_flag = bool(cfg.get("free_amass_sale"))
        fee_cache: dict[tuple[str, str], int] = {}
        out = []
        for d in docs:
            if d.get("latitude") is None or d.get("longitude") is None:
                continue
            unlocked = d["id"] in ent_ids or d.get("agent_id") == user["id"]
            lat, lng = d["latitude"], d["longitude"]
            if not unlocked:
                lat, lng = _jitter(d["id"], lat, lng)
            s = social.get(d["id"], {})
            cat = property_category(d)
            zone = zone_from_lookup(lookup, d.get("location"), d.get("city"), d.get("state"))
            if (cat, zone) not in fee_cache:
                fee_cache[(cat, zone)] = int((await pricing.active_price("property", cat, zone))["amount"])
            is_free = free_flag and _is_free_sale(d)
            if is_free:
                unlocked = True
                lat, lng = d["latitude"], d["longitude"]
            gallery = [u for u in (d.get("images") or []) if u]
            out.append({
                "id": d["id"], "category": cat, "type": d.get("property_type"), "lat": lat, "lng": lng, "unlocked": unlocked,
                "verified": bool(d.get("verified")), "approx": not unlocked,
                "friends_saved": int(s.get("friends_saved", 0)), "in_shared_list": bool(s.get("in_shared_list", False)),
                "promotion_tier": (_active_promo(d) or {}).get("tier"),
                # Public teaser tier — identical to what the locked detail preview already shows. Address + agent stay gated.
                "title": d.get("title"), "price": d.get("price"), "listing_type": d.get("listing_type"),
                "cover": d.get("image") or (gallery[0] if gallery else None),
                # The gallery itself is part of the unlock: only unlocked/free homes get it; everyone learns the count.
                "images": gallery[:8] if unlocked else None,
                "image_count": len(gallery) or (1 if d.get("image") else 0),
                "documents_verified": bool(d.get("documents_verified")),
                "bedrooms": d.get("bedrooms"), "bathrooms": d.get("bathrooms"), "size_sqm": d.get("size_sqm"),
                "city": d.get("city"), "place": d.get("location") if unlocked else d.get("city"),
                "status": d.get("status", "available"), "access_cost": 0 if is_free else fee_cache[(cat, zone)], "is_free_amass_sale": is_free,
            })
        return {"markers": out, "count": len(out), "approx_radius_m": 150}

    # ── FIXA (gated) ──
    @router.get("/fixa/access")
    async def fixa_access(user: dict = Depends(get_current_user)):
        w = await svc.wallet.get_or_create(user["id"], "FIX")
        bal = int(w["balance"] + w["bonus_balance"])
        return {"allowed": bal > 0, "balance": bal, "currency": "FIX"}

    @router.get("/fixa/providers")
    async def fixa_providers(
        q: Optional[str] = None, subcategory: Optional[str] = None, city: Optional[str] = None, verified: Optional[bool] = None,
        sort: Optional[str] = None, limit: int = 60, user: dict = Depends(require_fix_access),
    ):
        query: dict = {"category": "services"}
        if subcategory:
            query["subcategory"] = {"$regex": f"^{re.escape(subcategory)}$", "$options": "i"}
        if city:
            query["$or"] = [{"city": {"$regex": re.escape(city), "$options": "i"}}, {"location": {"$regex": re.escape(city), "$options": "i"}}]
        if verified is not None:
            query["is_fixa_verified"] = verified
        if q:
            rx = {"$regex": re.escape(q), "$options": "i"}
            query["$and"] = [{"$or": [{"name": rx}, {"seller_name": rx}, {"subcategory": rx}, {"tags": rx}, {"provider_specializations": rx}]}]
        sort_spec = [("is_boosted", -1), ("rating", -1)] if sort != "newest" else [("posted_at", -1)]
        docs = await db.marketplace.find(query, {"_id": 0}).sort(sort_spec).limit(min(limit, 200)).to_list(200)
        ents = {e["target_id"] for e in await db.entitlements.find({"user_id": user["id"], "feature_key": "fixa_provider", "status": "active"}, {"_id": 0, "target_id": 1}).to_list(2000)}
        items = []
        for d in docs:
            tier = await pricing.tier_for(d.get("subcategory"), d.get("category"))
            items.append({**UnlockService.provider_preview(d), "tier": tier, "unlocked": d["id"] in ents or d.get("seller_id") == user["id"]})
        subs = await db.marketplace.distinct("subcategory", {"category": "services"})
        return {"items": items, "count": len(items), "subcategories": sorted(s for s in subs if s), "fix_balance": user.get("_fix_balance")}

    @router.get("/fixa/providers/{provider_id}")
    async def fixa_provider_preview(provider_id: str, user: dict = Depends(require_fix_access)):
        t = await svc.resolve_target("fixa_provider", provider_id)
        unlocked = await svc.has_access(user, "fixa_provider", provider_id, t)
        return {**UnlockService.provider_preview(t.doc), "tier": int(t.category), "zone_tier": t.zone_tier, "unlocked": unlocked, "bio": (t.doc.get("seller_bio") or t.doc.get("description") or "")[:160]}

    @router.get("/fixa/providers/{provider_id}/details")
    async def fixa_provider_details(provider_id: str, user: dict = Depends(require_fix_access)):
        t = await svc.resolve_target("fixa_provider", provider_id)
        if not await svc.has_access(user, "fixa_provider", provider_id, t):
            q = await svc.quote(user, "fixa_provider", provider_id, log_attempt=False)
            raise HTTPException(403, {"code": "UNLOCK_REQUIRED", "fee": q["fee"], "fee_ngn": q["fee_ngn"], "currency": "FIX", "balance": q["balance"]})
        return await svc.details(user, t)

    # ── admin: pricing ──
    @admin.get("/pricing")
    async def admin_pricing(_admin=Depends(require_admin)):
        rows = await db.fee_prices.find({"active": True}, {"_id": 0}).sort([("feature_key", 1), ("zone_tier", 1), ("category", 1)]).to_list(200)
        cfg = await pricing.config()
        return {"prices": rows, "conversion": cfg["conversion"], "zone_multipliers": {"property": PROPERTY_ZONE_MULT, "fixa_provider": PROVIDER_ZONE_MULT}, "bases": {"property": PROPERTY_BASE, "fixa_provider": PROVIDER_TIER_BASE}}

    @admin.post("/pricing")
    async def admin_set_price(data: PriceIn, admin_user: dict = Depends(require_admin)):
        row = await pricing.set_price(data.featureKey, data.category, data.zoneTier, data.amount, admin_user["id"], data.note or "")
        await db.monetization_audit.insert_one({"id": str(uuid.uuid4()), "type": "price_change", "actor": admin_user["id"], "detail": {k: v for k, v in row.items() if k != "_id"}, "created_at": _now()})
        return row

    @admin.get("/pricing/history")
    async def admin_pricing_history(featureKey: Optional[str] = None, zoneTier: Optional[str] = None, category: Optional[str] = None, _admin=Depends(require_admin)):
        q: dict = {}
        if featureKey:
            q["feature_key"] = featureKey
        if zoneTier:
            q["zone_tier"] = zoneTier
        if category:
            q["category"] = category
        rows = await db.fee_prices.find(q, {"_id": 0}).sort("effective_from", -1).to_list(1000)
        return {"history": rows}

    @admin.get("/pricing/zones")
    async def admin_zones(_admin=Depends(require_admin)):
        return {"zones": await pricing.zone_lookup(), "default": "D"}

    @admin.put("/pricing/zones")
    async def admin_set_zones(data: ZoneLookupIn, admin_user: dict = Depends(require_admin)):
        zones = {_norm(k): v for k, v in data.zones.items() if _norm(k)}
        await db.app_settings.update_one({"key": "zone_lookup"}, {"$set": {"value": zones, "updated_at": _now()}}, upsert=True)
        await db.monetization_audit.insert_one({"id": str(uuid.uuid4()), "type": "zone_lookup", "actor": admin_user["id"], "detail": {"count": len(zones)}, "created_at": _now()})
        return {"zones": await pricing.zone_lookup()}

    @admin.get("/pricing/tiers")
    async def admin_tiers(_admin=Depends(require_admin)):
        return {"tiers": await pricing.category_tiers(), "bases": PROVIDER_TIER_BASE}

    @admin.put("/pricing/tiers")
    async def admin_set_tiers(data: TiersIn, admin_user: dict = Depends(require_admin)):
        tiers = {_norm(k): int(v) for k, v in data.tiers.items() if _norm(k) and int(v) in (1, 2, 3, 4)}
        await db.app_settings.update_one({"key": "category_tiers"}, {"$set": {"value": tiers, "updated_at": _now()}}, upsert=True)
        await db.monetization_audit.insert_one({"id": str(uuid.uuid4()), "type": "category_tiers", "actor": admin_user["id"], "detail": {"count": len(tiers)}, "created_at": _now()})
        return {"tiers": await pricing.category_tiers()}

    @admin.get("/monetization/config")
    async def admin_config(_admin=Depends(require_admin)):
        return await pricing.config()

    @admin.put("/monetization/config")
    async def admin_set_config(data: ConfigIn, admin_user: dict = Depends(require_admin)):
        cur = await pricing.config()
        patch = {k: v for k, v in data.model_dump().items() if v is not None}
        if "topup_min_ngn" in patch and int(patch["topup_min_ngn"]) < 100:
            raise HTTPException(422, "Top-up minimum must be at least ₦100")
        for cur_key in ("conversion", "welcome_bonus"):
            if cur_key in patch:
                patch[cur_key] = {**cur[cur_key], **patch[cur_key]}
                if any(int(v) <= 0 for v in patch[cur_key].values()):
                    raise HTTPException(422, f"{cur_key} values must be positive")
        new = {**cur, **patch}
        await db.app_settings.update_one({"key": "monetization"}, {"$set": {"value": new, "updated_at": _now()}}, upsert=True)
        await db.monetization_audit.insert_one({"id": str(uuid.uuid4()), "type": "config", "actor": admin_user["id"], "detail": patch, "created_at": _now()})
        return new

    # ── admin: report (completed transactions only) ──
    @admin.get("/monetization/report")
    async def admin_report(
        date_from: Optional[str] = None, date_to: Optional[str] = None, featureKey: Optional[str] = None, category: Optional[str] = None, zoneTier: Optional[str] = None,
        _admin=Depends(require_admin),
    ):
        start = _parse_date(date_from) or (_now() - timedelta(days=30))
        end = _parse_date(date_to, end_of_day=True) or _now()
        base: dict = {"created_at": {"$gte": start, "$lte": end}}
        if featureKey:
            base["feature_key"] = featureKey
        if category:
            base["category"] = category
        if zoneTier:
            base["zone_tier"] = zoneTier
        tx_q = {**base, "kind": "spend_unlock", "status": "completed", "feature_key": {"$exists": True}}
        if featureKey:
            tx_q["feature_key"] = featureKey
        txs = await db.token_transactions.find(tx_q, {"_id": 0}).to_list(100000)
        events = await db.unlock_events.find(base, {"_id": 0}).to_list(100000)
        cfg = await pricing.config()
        conv = cfg["conversion"]
        by_cat: dict[str, dict] = {}
        by_date: dict[str, dict] = {}
        payers: set[str] = set()
        tokens_by_cur = {"MASS": 0, "FIX": 0}
        sale = rent = provider = 0
        for t in txs:
            amt = abs(int(t["amount"]))
            cur = t.get("currency", "MASS")
            fk = t.get("feature_key")
            cat = str(t.get("category"))
            key = f"{fk}:{cat}"
            c = by_cat.setdefault(key, {"feature_key": fk, "category": cat, "currency": cur, "unlocks": 0, "tokens": 0, "ngn": 0})
            c["unlocks"] += 1
            c["tokens"] += amt
            c["ngn"] += amt * int(conv.get(f"{cur}_ngn", 10))
            tokens_by_cur[cur] = tokens_by_cur.get(cur, 0) + amt
            payers.add(t["user_id"])
            if fk == "property":
                if cat == "sale":
                    sale += 1
                else:
                    rent += 1
            else:
                provider += 1
            day = t["created_at"].strftime("%Y-%m-%d") if isinstance(t.get("created_at"), datetime) else str(t.get("created_at"))[:10]
            dd = by_date.setdefault(day, {"date": day, "unlocks": 0, "MASS": 0, "FIX": 0, "ngn": 0})
            dd["unlocks"] += 1
            dd[cur] = dd.get(cur, 0) + amt
            dd["ngn"] += amt * int(conv.get(f"{cur}_ngn", 10))
        outcomes: dict[str, int] = {}
        for e in events:
            outcomes[e["outcome"]] = outcomes.get(e["outcome"], 0) + 1
        paid = len(txs)
        return {
            "range": {"from": start, "to": end},
            "filters": {"featureKey": featureKey, "category": category, "zoneTier": zoneTier},
            "attempts": outcomes.get("attempt", 0),
            "paid_unlocks": paid,
            "unique_payers": len(payers),
            "sale_unlocks": sale,
            "rental_unlocks": rent,
            "provider_unlocks": provider,
            "free_repeat_views": outcomes.get("free_repeat", 0),
            "failed": outcomes.get("failed", 0) + outcomes.get("insufficient", 0),
            "cancelled": outcomes.get("cancelled", 0),
            "auto_credits": outcomes.get("auto_credit", 0),
            "tokens_collected": tokens_by_cur,
            "naira_value": {cur: n * int(conv.get(f"{cur}_ngn", 10)) for cur, n in tokens_by_cur.items()},
            "average_per_unlock": {cur: (n / max(1, sum(1 for t in txs if t.get("currency", "MASS") == cur))) for cur, n in tokens_by_cur.items()},
            "by_category": sorted(by_cat.values(), key=lambda r: -r["tokens"]),
            "revenue_by_date": sorted(by_date.values(), key=lambda r: r["date"]),
            "conversion": conv,
        }

    # ── admin: entitlement fixes (authorized + audited) ──
    @admin.get("/entitlements")
    async def admin_entitlements(user_id: Optional[str] = None, featureKey: Optional[str] = None, status: Optional[str] = None, limit: int = 100, _admin=Depends(require_admin)):
        q: dict = {}
        if user_id:
            q["user_id"] = user_id
        if featureKey:
            q["feature_key"] = featureKey
        if status:
            q["status"] = status
        rows = await db.entitlements.find(q, {"_id": 0}).sort("created_at", -1).limit(min(limit, 500)).to_list(500)
        return {"items": rows}

    @admin.post("/entitlements/{entitlement_id}/refund")
    async def admin_refund(entitlement_id: str, data: AdjustIn, admin_user: dict = Depends(require_admin)):
        ent = await db.entitlements.find_one({"id": entitlement_id}, {"_id": 0})
        if not ent:
            raise HTTPException(404, "Entitlement not found")
        if ent.get("status") != "active":
            raise HTTPException(409, f"Entitlement is {ent.get('status')}")
        ok = await svc.auto_credit(ent, f"admin_refund: {data.reason}", actor=admin_user["id"])
        await db.monetization_audit.insert_one({"id": str(uuid.uuid4()), "type": "refund", "actor": admin_user["id"], "entitlement_id": entitlement_id, "reason": data.reason, "created_at": _now()})
        return {"ok": ok}

    @admin.post("/entitlements/{entitlement_id}/revoke")
    async def admin_revoke(entitlement_id: str, data: AdjustIn, admin_user: dict = Depends(require_admin)):
        res = await db.entitlements.update_one({"id": entitlement_id, "status": "active"}, {"$set": {"status": "revoked", "revoked_at": _now(), "revoked_by": admin_user["id"], "revoke_reason": data.reason}})
        if res.modified_count == 0:
            raise HTTPException(409, "Nothing to revoke")
        await db.monetization_audit.insert_one({"id": str(uuid.uuid4()), "type": "revoke", "actor": admin_user["id"], "entitlement_id": entitlement_id, "reason": data.reason, "created_at": _now()})
        return {"ok": True}

    @admin.post("/entitlements/grant")
    async def admin_grant(data: UnlockIn, body: AdjustIn, user_id: str = Query(...), admin_user: dict = Depends(require_admin)):
        t = await svc.resolve_target(data.featureKey, data.targetId)
        try:
            await db.entitlements.insert_one({
                "id": str(uuid.uuid4()), "user_id": user_id, "feature_key": data.featureKey, "target_id": data.targetId, "status": "active", "currency": FEATURE_CURRENCY[data.featureKey],
                "amount_paid": 0, "category": t.category, "zone_tier": t.zone_tier, "price_id": None, "transaction_id": None, "idempotency_key": None, "source": "admin_grant",
                "granted_by": admin_user["id"], "reason": body.reason, "created_at": _now(), "activated_at": _now(),
            })
        except DuplicateKeyError:
            raise HTTPException(409, "User already has this entitlement")
        await db.monetization_audit.insert_one({"id": str(uuid.uuid4()), "type": "grant", "actor": admin_user["id"], "user_id": user_id, "detail": data.model_dump(), "reason": body.reason, "created_at": _now()})
        return {"ok": True}

    @admin.get("/monetization/audit")
    async def admin_audit(limit: int = 100, _admin=Depends(require_admin)):
        return {"items": await db.monetization_audit.find({}, {"_id": 0}).sort("created_at", -1).limit(min(limit, 500)).to_list(500)}

    @admin.post("/monetization/reconcile")
    async def admin_reconcile(_admin=Depends(require_admin)):
        return await svc.reconcile()

    return router, admin, svc, require_fix_access


def _parse_date(s: Optional[str], end_of_day: bool = False) -> Optional[datetime]:
    if not s:
        return None
    try:
        d = datetime.fromisoformat(s)
    except ValueError:
        return None
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    if end_of_day and len(s) <= 10:
        d = d + timedelta(days=1) - timedelta(microseconds=1)
    return d


def _jitter(seed: str, lat: float, lng: float, radius_m: float = 150.0) -> tuple[float, float]:
    """Deterministic offset (≤ radius) so the same property always lands on the same approximate pin."""
    h = hashlib.sha256(seed.encode()).digest()
    angle = (int.from_bytes(h[:4], "big") / 2**32) * 2 * math.pi
    r = (0.4 + 0.6 * (int.from_bytes(h[4:8], "big") / 2**32)) * radius_m
    dlat = (r * math.cos(angle)) / 111_320.0
    dlng = (r * math.sin(angle)) / (111_320.0 * max(0.2, math.cos(math.radians(lat))))
    return round(lat + dlat, 6), round(lng + dlng, 6)


async def annotate_properties(db: AsyncIOMotorDatabase, docs: list[dict], user_id: Optional[str]) -> None:
    """Batch version of `property_fee` for list endpoints: attaches token_cost / access_cost /
    zone_tier / unlocked / is_free_amass_sale using zone pricing + entitlements in O(1) lookups
    per (category, zone) instead of per document. Strips agent contact when not unlocked."""
    from tokens import is_free_amass_sale

    if not docs:
        return
    engine = PricingEngine(db)
    cfg = await engine.config()
    lookup = await engine.zone_lookup()
    free_flag = bool(cfg.get("free_amass_sale"))
    ent_ids: set[str] = set()
    if user_id:
        cursor = db.entitlements.find(
            {"user_id": user_id, "feature_key": "property", "status": "active", "target_id": {"$in": [d["id"] for d in docs]}},
            {"_id": 0, "target_id": 1},
        )
        ent_ids = {e["target_id"] async for e in cursor}
    price_cache: dict[tuple[str, str], int] = {}
    for p in docs:
        cat = property_category(p)
        zone = zone_from_lookup(lookup, p.get("location"), p.get("city"), p.get("state"))
        key = (cat, zone)
        if key not in price_cache:
            price_cache[key] = int((await engine.active_price("property", cat, zone))["amount"])
        is_free = free_flag and is_free_amass_sale(p)
        fee = 0 if is_free else price_cache[key]
        p["is_amass_exclusive"] = bool(p.get("is_amass_exclusive", False))
        p["is_free_amass_sale"] = is_free
        p["token_cost"] = fee
        p["access_cost"] = fee
        p["zone_tier"] = zone
        p["unlocked"] = is_free or p["id"] in ent_ids or (user_id is not None and p.get("agent_id") == user_id)
        if not p["unlocked"]:
            p.pop("agent_phone", None)
            p.pop("agent_email", None)


async def property_fee(db: AsyncIOMotorDatabase, prop: dict) -> tuple[int, bool]:
    """(fee_in_MASS, is_free) for a property using zone/category pricing.
    `is_free` honours the admin switch `monetization.free_amass_sale` (default off)."""
    from tokens import is_free_amass_sale  # legacy helper (AMASS-listed sale)

    engine = PricingEngine(db)
    cfg = await engine.config()
    if cfg.get("free_amass_sale") and is_free_amass_sale(prop):
        return 0, True
    cat = property_category(prop)
    zone = await engine.zone_for(prop.get("location"), prop.get("city"), prop.get("state"))
    price = await engine.active_price("property", cat, zone)
    return int(price["amount"]), False
