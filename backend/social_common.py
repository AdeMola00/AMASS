"""Shared helpers for the Neighbours (social) layer — privacy-first projections + notifications."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Iterable, Optional

from fastapi import HTTPException

# Fields that may EVER leave the server about another user. No email, phone, unit, documents.
PUBLIC_USER_FIELDS = {"_id": 0, "id": 1, "full_name": 1, "avatar_url": 1, "profile_photo": 1, "city": 1, "verified": 1, "is_agent": 1, "created_at": 1}


def now() -> datetime:
    return datetime.now(timezone.utc)


def new_id() -> str:
    return str(uuid.uuid4())


def public_user(u: Optional[dict], profile: Optional[dict] = None) -> Optional[dict]:
    if not u:
        return None
    p = profile or {}
    return {
        "id": u["id"],
        "full_name": p.get("display_name") or u.get("full_name") or "AMASS neighbour",
        "avatar_url": p.get("avatar_url") or u.get("avatar_url") or u.get("profile_photo"),
        "handle": p.get("handle"),
        "city": p.get("city") or u.get("city"),
        "verified": bool(u.get("verified")),
        "is_agent": bool(u.get("is_agent")),
        "badges": p.get("badges") or [],
        "member_since": (u.get("created_at").year if isinstance(u.get("created_at"), datetime) else None),
    }


async def public_users(db, ids: Iterable[str]) -> dict[str, dict]:
    ids = list({i for i in ids if i})
    if not ids:
        return {}
    users = await db.users.find({"id": {"$in": ids}}, PUBLIC_USER_FIELDS).to_list(len(ids))
    profiles = await db.social_profiles.find({"user_id": {"$in": ids}}, {"_id": 0}).to_list(len(ids))
    pby = {p["user_id"]: p for p in profiles}
    return {u["id"]: public_user(u, pby.get(u["id"])) for u in users}


async def notify(db, user_id: Optional[str], kind: str, title: str, body: str, meta: Optional[dict] = None) -> None:
    if not user_id:
        return
    await db.notifications.insert_one({
        "id": new_id(),
        "user_id": user_id,
        "kind": kind,
        "title": title[:120],
        "body": (body or "")[:160],
        "read": False,
        "meta": meta or {},
        "created_at": now().isoformat(),
    })


async def is_blocked_between(db, a: str, b: str) -> bool:
    """Blocks are shared with chat: either direction hides the pair from each other."""
    return await db.chat_blocks.find_one({"$or": [{"blocker_id": a, "blocked_id": b}, {"blocker_id": b, "blocked_id": a}]}) is not None


async def blocked_ids_for(db, user_id: str) -> set[str]:
    rows = await db.chat_blocks.find({"$or": [{"blocker_id": user_id}, {"blocked_id": user_id}]}, {"_id": 0, "blocker_id": 1, "blocked_id": 1}).to_list(2000)
    out: set[str] = set()
    for r in rows:
        out.add(r["blocked_id"] if r["blocker_id"] == user_id else r["blocker_id"])
    return out


async def muted_ids_for(db, user_id: str) -> set[str]:
    rows = await db.social_mutes.find({"user_id": user_id}, {"_id": 0, "muted_id": 1}).to_list(2000)
    return {r["muted_id"] for r in rows}


async def are_connected(db, a: str, b: str) -> bool:
    if a == b:
        return True
    return await db.connections.find_one({"pair": sorted([a, b]), "status": "accepted"}) is not None


async def connection_ids(db, user_id: str) -> set[str]:
    rows = await db.connections.find({"pair": user_id, "status": "accepted"}, {"_id": 0, "pair": 1}).to_list(5000)
    return {p for r in rows for p in r["pair"] if p != user_id}


async def award(db, user_id: str, kind: str, points: int, ref: Optional[dict] = None) -> None:
    """Non-monetary recognition. Never touches wallets; never unlocks paid data.
    Idempotent per (user, kind, ref) so repeated actions can't farm points."""
    key = {"user_id": user_id, "kind": kind, "ref": ref or {}}
    if await db.contributions.find_one(key):
        return
    await db.contributions.insert_one({**key, "id": new_id(), "points": points, "created_at": now()})
    await db.social_profiles.update_one({"user_id": user_id}, {"$inc": {"contribution_points": points}, "$setOnInsert": {"user_id": user_id, "created_at": now()}}, upsert=True)
    await refresh_badges(db, user_id)


BADGE_RULES = [
    # (badge key, label, kind counted, threshold)
    ("helpful_neighbour", "Helpful neighbour", "answer_accepted", 3),
    ("local_guide", "Local guide", "place_recommended", 3),
    ("host", "Host", "event_hosted", 1),
    ("welcomer", "Welcomer", "welcome", 3),
    ("good_eye", "Good eye", "place_added", 2),
]


async def refresh_badges(db, user_id: str) -> list[str]:
    counts: dict[str, int] = {}
    async for row in db.contributions.aggregate([{"$match": {"user_id": user_id}}, {"$group": {"_id": "$kind", "n": {"$sum": 1}}}]):
        counts[row["_id"]] = row["n"]
    badges = [key for key, _label, kind, threshold in BADGE_RULES if counts.get(kind, 0) >= threshold]
    await db.social_profiles.update_one({"user_id": user_id}, {"$set": {"badges": badges}}, upsert=True)
    return badges


def badge_label(key: str) -> str:
    for k, label, _kind, _t in BADGE_RULES:
        if k == key:
            return label
    return key.replace("_", " ").title()


def ensure(cond: bool, status: int, msg: str) -> None:
    if not cond:
        raise HTTPException(status, msg)


def strip_private(doc: dict, keys: Iterable[str]) -> dict:
    for k in keys:
        doc.pop(k, None)
    return doc
