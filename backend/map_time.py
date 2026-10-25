"""
Map time — browsing homes on the Find Home map costs MASS.

  • 0 MASS in the wallet → no property markers at all (the map itself stays usable).
  • With MASS: 1 MASS buys 60 minutes ON the map. The app heartbeats once a minute while the Find Home tab is in
    front; the server adds the elapsed time and, when the paid hour is used up, charges the next one — or, if the
    wallet is empty by then, switches the markers off until the user tops up.

Why metered on the server
  • `/map/markers` itself runs the meter, so no client can read markers without paying — the heartbeat endpoint
    only keeps the clock honest between marker loads.
  • Time only accrues between heartbeats that are close together (≤ GRACE). Leaving the tab, backgrounding the
    app or losing connection simply stops the clock; nothing is charged for time away.
  • Everyone pays the same hourly price; it is admin-configurable (`monetization.map_hour_mass`; 0 = free map).
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo.errors import DuplicateKeyError

HOUR_SECONDS = 3600
HEARTBEAT_SECONDS = 60
# A heartbeat this long after the previous one still counts as continuous use (covers a slow network or a
# missed interval). Anything longer means the user left the map — that gap is never counted.
GRACE_SECONDS = 150


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()


class MapTimeMeter:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db

    async def hourly_cost(self) -> int:
        cfg = ((await self.db.app_settings.find_one({"key": "monetization"}, {"_id": 0, "value": 1})) or {}).get("value") or {}
        try:
            return max(0, int(cfg.get("map_hour_mass", 1)))
        except (TypeError, ValueError):
            return 1

    async def _doc(self, user_id: str) -> dict:
        """The user's meter row — created on first use so later conditional writes always have a row to match."""
        doc = await self.db.map_time.find_one({"user_id": user_id}, {"_id": 0})
        if doc:
            return doc
        fresh = {"user_id": user_id, "paid_seconds": 0, "used_seconds": 0, "hours_charged": 0, "last_tick_at": None, "created_at": _iso(_now())}
        try:
            await self.db.map_time.insert_one(dict(fresh))
        except DuplicateKeyError:
            return await self.db.map_time.find_one({"user_id": user_id}, {"_id": 0}) or fresh
        return fresh

    async def _buy_hour(self, wallet, uid: str, cost: int, *, hours: int, used: int, paid: int, now: datetime) -> Optional[tuple[int, int, int, bool]]:
        """Buy the next hour exactly once, even when several heartbeats race (markers load + tick fire together).

        The hour is CLAIMED with a conditional write keyed on `hours_charged`; only the winner debits the wallet.
        Returns (paid, hours, balance, won) — `won` is True only for the request that actually paid — or None when
        the wallet turned out to be empty."""
        claim = await self.db.map_time.update_one(
            {"user_id": uid, "hours_charged": hours},
            {"$set": {"paid_seconds": used + HOUR_SECONDS, "hours_charged": hours + 1, "updated_at": _iso(now)}},
        )
        if claim.modified_count:
            try:
                w = await wallet.debit(
                    uid, cost, "spend_feature", f"Map time · {HOUR_SECONDS // 60} min on Find Home",
                    currency="MASS",
                    meta={"feature_key": "map_time", "hour": hours + 1, "seconds": HOUR_SECONDS},
                    extra={"feature_key": "map_time", "status": "completed"},
                )
            except HTTPException:
                # Balance moved underneath us → give the claimed hour back.
                await self.db.map_time.update_one({"user_id": uid, "hours_charged": hours + 1}, {"$set": {"paid_seconds": paid, "hours_charged": hours}})
                return None
            return used + HOUR_SECONDS, hours + 1, int(w["balance"] + w["bonus_balance"]), True
        # Another request just bought this hour — report its result instead of charging again.
        fresh = await self._doc(uid)
        w = await wallet.get_or_create(uid, "MASS")
        return int(fresh.get("paid_seconds") or 0), int(fresh.get("hours_charged") or 0), int(w["balance"] + w["bonus_balance"]), False

    async def tick(self, user: dict, *, heartbeat: bool = True) -> dict:
        """Account the time since the last heartbeat; charge the next hour when the paid one is used up.

        `heartbeat=False` (used by the status read) reports the current state without charging or accruing."""
        from tokens import WalletService

        uid = user["id"]
        cost = await self.hourly_cost()
        wallet = WalletService(self.db)
        w = await wallet.get_or_create(uid, "MASS")
        balance = int(w["balance"] + w["bonus_balance"])
        if cost == 0:
            return {"access": True, "metered": False, "remaining_seconds": None, "hourly_cost": cost, "balance": balance, "charged_now": False, "hours_charged": 0}

        now = _now()
        doc = await self._doc(uid)
        paid = int(doc.get("paid_seconds") or 0)
        used = int(doc.get("used_seconds") or 0)
        hours = int(doc.get("hours_charged") or 0)
        charged_now = False

        if heartbeat:
            last = doc.get("last_tick_at")
            if last:
                try:
                    gap = (now - datetime.fromisoformat(last)).total_seconds()
                except ValueError:
                    gap = GRACE_SECONDS + 1
                if 0 < gap <= GRACE_SECONDS:
                    used += int(gap)
            if used >= paid and balance >= cost:
                # The paid hour (or the very first one) is used up → buy the next hour, if the wallet allows.
                bought = await self._buy_hour(wallet, uid, cost, hours=hours, used=used, paid=paid, now=now)
                if bought:
                    paid, hours, balance, charged_now = bought
            access = paid > used
            # Only the clock fields here — `paid_seconds` / `hours_charged` are owned by the claim in `_buy_hour`.
            await self.db.map_time.update_one({"user_id": uid}, {"$set": {"used_seconds": used, "last_tick_at": _iso(now), "updated_at": _iso(now)}})
        else:
            access = paid > used
        return {
            "access": access,
            "metered": True,
            "remaining_seconds": max(paid - used, 0),
            "hourly_cost": cost,
            "balance": balance,
            "charged_now": charged_now,
            "hours_charged": hours,
            "heartbeat_seconds": HEARTBEAT_SECONDS,
        }


def register_map_time_routes(db: AsyncIOMotorDatabase, require_auth) -> tuple[APIRouter, MapTimeMeter]:
    meter = MapTimeMeter(db)
    router = APIRouter(prefix="/api/map/time", tags=["map-time"])

    @router.post("/tick")
    async def tick(user=Depends(require_auth)):
        """Heartbeat from the Find Home tab — once a minute while it's in front."""
        return await meter.tick(user, heartbeat=True)

    @router.get("")
    async def status(user=Depends(require_auth)):
        """Current state without accruing time or charging (wallet / settings screens)."""
        return await meter.tick(user, heartbeat=False)

    return router, meter


async def ensure_map_time_indexes(db: AsyncIOMotorDatabase) -> None:
    try:
        await db.map_time.create_index("user_id", unique=True)
    except Exception:  # never block boot
        pass
