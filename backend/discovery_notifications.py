"""AMASS Phase D-10 — Notifications integration for discovery pipeline.

Small helper that plugs into existing `notifications` collection used across
the app. Emits notifications for:
  • VERIFICATION_WIN     — agent completed a PROPERTY_EXISTS verification
  • FRAUD_FLAG_RAISED    — a new fraud flag was created (admins)
  • CANDIDATE_PROMOTED   — a new AMASS property was created (agents in territory)
  • VERIFICATION_TASK_ASSIGNED — new open task in your territory

Notifications shape matches `property_improvement._push_notification`:
  {id, user_id, kind, title, body, read, meta, created_at (ISO string)}
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional


async def push_notification(
    db, user_id: str, kind: str, title: str, body: str,
    meta: Optional[Dict[str, Any]] = None,
):
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "kind": kind,
        "title": title,
        "body": body,
        "read": False,
        "meta": meta or {},
        "created_at": datetime.now(timezone.utc).isoformat(),
    })


async def _admin_user_ids(db) -> List[str]:
    import os
    admin_emails = {e.strip().lower() for e in os.environ.get(
        "ADMIN_EMAILS", "demo@amass.africa,admin@amass.africa"
    ).split(",") if e.strip()}
    rows = await db.users.find(
        {"$or": [{"is_admin": True},
                 {"email": {"$in": list(admin_emails)}}]},
        {"_id": 0, "id": 1},
    ).to_list(100)
    return [a["id"] for a in rows if a.get("id")]


async def _agents_in_territory(db, state: Optional[str], lga: Optional[str]) -> List[str]:
    if not state: return []
    q: Dict[str, Any] = {"state": state, "is_active": True}
    if lga:
        # match agents whose LGAs include this one, OR whose LGAs list is empty
        # (meaning "cover the whole state")
        q = {"$and": [
            {"state": state, "is_active": True},
            {"$or": [{"lgas": lga}, {"lgas": []}, {"lgas": {"$exists": False}}]},
        ]}
    rows = await db.agent_territories.find(q, {"_id": 0, "agent_id": 1}).to_list(200)
    return [r["agent_id"] for r in rows if r.get("agent_id")]


# ── Public notification hooks ────────────────────────────────────
async def notify_verification_win(db, agent_id: str, task: Dict[str, Any], drift_m: Optional[int]):
    amass_id = task.get("amass_property_id")
    body_parts = [f"You've verified {amass_id}."]
    if drift_m is not None:
        body_parts.append(f"Drift {drift_m}m from stored pin.")
    await push_notification(
        db, agent_id, "VERIFICATION_WIN",
        "Verification recorded ✅",
        " ".join(body_parts),
        meta={"amass_property_id": amass_id, "task_id": task.get("id"), "drift_m": drift_m},
    )


async def notify_fraud_flag(db, flag: Dict[str, Any], property_snapshot: Optional[Dict[str, Any]] = None):
    """Notify all admins about a newly raised fraud flag."""
    admins = await _admin_user_ids(db)
    if not admins: return 0
    prop_label = "a property"
    if property_snapshot and property_snapshot.get("amass_property_id"):
        prop_label = property_snapshot["amass_property_id"]
    title = f"⚠️ {flag['flag_type'].replace('_', ' ').title()}"
    body = f"{prop_label} flagged — severity {flag.get('severity', 'medium')}."
    for uid in admins:
        await push_notification(
            db, uid, "FRAUD_FLAG_RAISED", title, body,
            meta={"flag_id": flag.get("id"), "flag_type": flag.get("flag_type"),
                  "property_uuid": flag.get("property_uuid"),
                  "amass_property_id": (property_snapshot or {}).get("amass_property_id")},
        )
    return len(admins)


async def notify_task_assigned(db, task: Dict[str, Any]):
    """Notify agents in this task's territory that a new lead is available."""
    agent_ids = await _agents_in_territory(db, task.get("state"), task.get("lga"))
    if not agent_ids: return 0
    for aid in agent_ids:
        await push_notification(
            db, aid, "VERIFICATION_TASK_ASSIGNED",
            "New property to verify",
            f"{task.get('property_type') or 'A property'} in "
            f"{task.get('area') or task.get('lga') or task.get('state')} is waiting for you.",
            meta={"task_id": task.get("id"),
                  "amass_property_id": task.get("amass_property_id"),
                  "state": task.get("state"), "lga": task.get("lga")},
        )
    return len(agent_ids)


async def notify_candidate_promoted(db, amass_property_id: str, state: str, lga: Optional[str]):
    agent_ids = await _agents_in_territory(db, state, lga)
    for aid in agent_ids:
        await push_notification(
            db, aid, "CANDIDATE_PROMOTED",
            "New lead in your territory",
            f"{amass_property_id} is now open for on-site verification.",
            meta={"amass_property_id": amass_property_id, "state": state, "lga": lga},
        )
    return len(agent_ids)
