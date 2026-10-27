"""Shared secret between this backend and the external AMASS Admin Portal (https://amass-control.emergent.host).

An AMASS admin generates the key inside the app (Cockpit → Admin Portal connection); the plaintext is shown exactly
once and pasted into the portal's settings. Only a SHA-256 hash is stored here. The portal's backend then calls
`/api/portal/*` with `X-AMASS-Portal-Key: amass_pk_…` (or `Authorization: Bearer amass_pk_…`) and optionally
`X-AMASS-Portal-Actor: Name <email>` so every write in the audit log names the staff member who did it.

One active key at a time: generating a new one revokes the previous key immediately.
"""
from __future__ import annotations

import hashlib
import re
import secrets
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException

PREFIX = "amass_pk_"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _hash(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _public(k: dict) -> dict:
    return {"id": k["id"], "prefix": k["prefix"], "label": k.get("label"), "created_at": k.get("created_at"), "created_by_name": k.get("created_by_name"), "last_used_at": k.get("last_used_at"), "uses": k.get("uses", 0)}


async def key_status(db) -> Optional[dict]:
    k = await db.portal_keys.find_one({"revoked_at": None}, {"_id": 0, "key_hash": 0})
    return _public(k) if k else None


async def create_key(db, admin: dict, label: Optional[str] = None) -> dict:
    """Revoke any active key, mint a new one and return it with the plaintext (shown once)."""
    raw = PREFIX + secrets.token_urlsafe(36)
    t = _now()
    await db.portal_keys.update_many({"revoked_at": None}, {"$set": {"revoked_at": t, "revoked_by": admin["id"], "revoked_reason": "rotated"}})
    doc = {"id": str(uuid.uuid4()), "key_hash": _hash(raw), "prefix": raw[: len(PREFIX) + 6], "label": (label or "AMASS Admin Portal").strip()[:80], "created_at": t, "created_by": admin["id"], "created_by_name": admin.get("full_name") or admin.get("email"), "last_used_at": None, "uses": 0, "revoked_at": None}
    await db.portal_keys.insert_one({**doc})
    await db.audit_log.insert_one({"id": str(uuid.uuid4()), "source": "cockpit", "actor_id": admin["id"], "actor_name": doc["created_by_name"], "action": "generated a new Admin Portal key (previous key revoked)", "target": doc["id"], "at": t})
    return {**_public(doc), "key": raw}


async def revoke_key(db, admin: dict) -> bool:
    t = _now()
    res = await db.portal_keys.update_many({"revoked_at": None}, {"$set": {"revoked_at": t, "revoked_by": admin["id"], "revoked_reason": "revoked"}})
    if res.modified_count:
        await db.audit_log.insert_one({"id": str(uuid.uuid4()), "source": "cockpit", "actor_id": admin["id"], "actor_name": admin.get("full_name") or admin.get("email"), "action": "revoked the Admin Portal key", "target": None, "at": t})
    return bool(res.modified_count)


async def authenticate_key(db, raw: str, actor: Optional[str] = None) -> dict:
    """Resolve a presented key to a super_admin portal account or raise 401."""
    k = await db.portal_keys.find_one({"key_hash": _hash(raw.strip()), "revoked_at": None}, {"_id": 0, "id": 1, "label": 1})
    if not k:
        raise HTTPException(401, "Invalid or revoked Admin Portal key")
    await db.portal_keys.update_one({"id": k["id"]}, {"$set": {"last_used_at": _now()}, "$inc": {"uses": 1}})
    actor = (actor or "").strip()[:160]
    m = re.match(r"^\s*(.*?)\s*<\s*([^>]+@[^>]+)\s*>\s*$", actor)
    name, email = (m.group(1) or m.group(2), m.group(2)) if m else (actor, actor if "@" in actor else "")
    return {"id": f"portal-key:{k['id']}", "name": name or k.get("label") or "AMASS Admin Portal", "email": email.lower(), "role": "super_admin", "source": "portal_key"}
