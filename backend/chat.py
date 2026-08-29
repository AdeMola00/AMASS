"""AMASS In-App Chat — Phase 1 (Jun 2026)

Property-linked one-to-one messaging with long-poll real-time, hooked into
the existing `notifications` collection for badges and D-10 event
propagation. Reuses the JWT auth + require_auth dependency; no parallel
identity system.

Collections:
    conversations           {id, kind, property_id, listing_id, participant_ids[],
                             created_by, last_message_preview, last_message_at,
                             created_at, updated_at}
    chat_messages           {id, conversation_id, sender_id, text, kind,
                             attachments[], client_msg_id, status, created_at}
    chat_reads              {conversation_id, user_id, last_read_at}
    chat_blocks             {blocker_id, blocked_id, created_at}
    chat_reports            {id, reporter_id, conversation_id, message_id?,
                             reported_user_id, reason, status, created_at}

Real-time: long-poll `/updates` endpoint that awaits new messages up to
8 seconds and returns immediately if none.  A future WebSocket upgrade slots
in behind the same helper (`_wait_for_new_messages`).
"""
from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel, Field


# ── Constants ────────────────────────────────────────────────────
MAX_TEXT_LEN = 4000
MAX_PAGE = 50
LONG_POLL_MAX_MS = 20000
POLL_INTERVAL_S = 0.6


# ── Schemas ──────────────────────────────────────────────────────
class SendMessageIn(BaseModel):
    text: str = Field(..., min_length=1, max_length=MAX_TEXT_LEN)
    client_msg_id: Optional[str] = Field(None, max_length=64)
    kind: Literal["text", "property_card"] = "text"
    attachments: Optional[List[Dict[str, Any]]] = None


class ReportIn(BaseModel):
    conversation_id: str
    message_id: Optional[str] = None
    reported_user_id: Optional[str] = None
    reason: str = Field(..., min_length=3, max_length=500)


# ── Helpers ──────────────────────────────────────────────────────
def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _hydrate_participants(db, ids: List[str]) -> List[Dict[str, Any]]:
    rows = await db.users.find(
        {"id": {"$in": ids}},
        {"_id": 0, "id": 1, "email": 1, "full_name": 1, "profile_photo": 1,
         "is_agent": 1, "verified": 1},
    ).to_list(len(ids))
    return rows


async def _hydrate_property(db, property_id: Optional[str]) -> Optional[Dict[str, Any]]:
    if not property_id: return None
    p = await db.properties.find_one(
        {"id": property_id},
        {"_id": 0, "id": 1, "title": 1, "location": 1, "price": 1,
         "listing_type": 1, "property_type": 1, "images": 1, "agent_id": 1,
         "verified": 1, "bedrooms": 1, "bathrooms": 1, "size_sqm": 1},
    )
    return p


async def _assert_participant(db, conversation_id: str, user_id: str, is_admin: bool = False):
    q = {"id": conversation_id}
    conv = await db.conversations.find_one(q, {"_id": 0})
    if not conv:
        raise HTTPException(404, "Conversation not found")
    if not is_admin and user_id not in (conv.get("participant_ids") or []):
        raise HTTPException(403, "Not a participant")
    return conv


async def _bump_conversation(db, conversation_id: str, preview: str, when: datetime):
    await db.conversations.update_one(
        {"id": conversation_id},
        {"$set": {"last_message_preview": preview[:200],
                  "last_message_at": when, "updated_at": when}},
    )


async def _unread_count_for(db, conversation_id: str, user_id: str) -> int:
    r = await db.chat_reads.find_one(
        {"conversation_id": conversation_id, "user_id": user_id},
        {"_id": 0, "last_read_at": 1},
    )
    last_read = (r or {}).get("last_read_at") or datetime(1970, 1, 1, tzinfo=timezone.utc)
    return await db.chat_messages.count_documents({
        "conversation_id": conversation_id,
        "sender_id": {"$ne": user_id},
        "created_at": {"$gt": last_read},
    })


async def _wait_for_new_messages(db, conversation_id: str, after: datetime,
                                 wait_ms: int) -> List[Dict[str, Any]]:
    """Poll DB every POLL_INTERVAL_S until either we find new messages, wait_ms
    elapses, or an exception is raised. Simpler than WebSockets, deployment-safe."""
    deadline = asyncio.get_event_loop().time() + min(wait_ms, LONG_POLL_MAX_MS) / 1000
    while True:
        rows = await db.chat_messages.find(
            {"conversation_id": conversation_id,
             "created_at": {"$gt": after}},
            {"_id": 0},
        ).sort("created_at", 1).limit(MAX_PAGE).to_list(MAX_PAGE)
        if rows: return rows
        if asyncio.get_event_loop().time() >= deadline:
            return []
        await asyncio.sleep(POLL_INTERVAL_S)


async def _notify(db, user_id: str, conversation_id: str, sender_name: str,
                  preview: str, property_id: Optional[str]):
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "kind": "NEW_MESSAGE",
        "title": f"{sender_name} sent you a message",
        "body": preview[:120],
        "read": False,
        "meta": {"conversation_id": conversation_id,
                 "property_id": property_id,
                 "sender_name": sender_name},
        "created_at": _now().isoformat(),
    })


# ── Router ───────────────────────────────────────────────────────
def register_chat_routes(db, get_current_user, require_admin):
    router = APIRouter(prefix="/api/chat", tags=["chat"])

    # ── Start from property ───────────────────────────────────
    @router.post("/conversations/from-property/{property_id}")
    async def start_from_property(property_id: str, user: dict = Depends(get_current_user)):
        prop = await db.properties.find_one(
            {"id": property_id},
            {"_id": 0, "id": 1, "agent_id": 1, "title": 1, "listing_id": 1, "location": 1},
        )
        if not prop:
            raise HTTPException(404, "Property not found")
        agent_id = prop.get("agent_id")
        if not agent_id:
            raise HTTPException(400, "Property has no agent to contact")
        if agent_id == user["id"]:
            raise HTTPException(400, "You are the agent for this property")

        # One conversation per (property_id, {buyer,agent}). Idempotent.
        existing = await db.conversations.find_one(
            {"property_id": property_id,
             "participant_ids": {"$all": [user["id"], agent_id], "$size": 2}},
            {"_id": 0},
        )
        if existing:
            return existing

        now = _now()
        conv = {
            "id": str(uuid.uuid4()),
            "kind": "property",
            "property_id": property_id,
            "listing_id": prop.get("listing_id"),
            "participant_ids": sorted([user["id"], agent_id]),
            "created_by": user["id"],
            "last_message_preview": None,
            "last_message_at": None,
            "created_at": now,
            "updated_at": now,
        }
        await db.conversations.insert_one(conv)
        conv.pop("_id", None)
        return conv

    # ── Support conversation (buyer ↔ admin) ─────────────────
    @router.post("/conversations/support")
    async def start_support(user: dict = Depends(get_current_user)):
        import os
        admin_emails = [e.strip().lower() for e in os.environ.get(
            "ADMIN_EMAILS", "demo@amass.africa,admin@amass.africa"
        ).split(",") if e.strip()]
        admin = await db.users.find_one(
            {"$or": [{"is_admin": True},
                     {"email": {"$in": admin_emails}}]},
            {"_id": 0, "id": 1},
        )
        if not admin:
            raise HTTPException(500, "No support agent available")
        existing = await db.conversations.find_one(
            {"kind": "support",
             "participant_ids": {"$all": [user["id"], admin["id"]], "$size": 2}},
            {"_id": 0},
        )
        if existing: return existing
        now = _now()
        conv = {"id": str(uuid.uuid4()), "kind": "support",
                "property_id": None, "listing_id": None,
                "participant_ids": sorted([user["id"], admin["id"]]),
                "created_by": user["id"],
                "last_message_preview": None, "last_message_at": None,
                "created_at": now, "updated_at": now}
        await db.conversations.insert_one(conv)
        conv.pop("_id", None)
        return conv

    # ── List my conversations ────────────────────────────────
    @router.get("/conversations")
    async def list_conversations(user: dict = Depends(get_current_user),
                                  limit: int = Query(50, ge=1, le=200)):
        cur = db.conversations.find(
            {"participant_ids": user["id"]}, {"_id": 0},
        ).sort([("last_message_at", -1), ("created_at", -1)]).limit(limit)
        convs = await cur.to_list(limit)
        # Hydrate participants + property + unread
        user_ids = {uid for c in convs for uid in c.get("participant_ids", [])}
        users = await _hydrate_participants(db, list(user_ids))
        by_id = {u["id"]: u for u in users}
        out = []
        for c in convs:
            other_ids = [uid for uid in c.get("participant_ids", []) if uid != user["id"]]
            c["other_participants"] = [by_id.get(oid) for oid in other_ids if by_id.get(oid)]
            c["property"] = await _hydrate_property(db, c.get("property_id"))
            c["unread_count"] = await _unread_count_for(db, c["id"], user["id"])
            out.append(c)
        return {"items": out, "count": len(out)}

    # ── Single conversation ──────────────────────────────────
    @router.get("/conversations/{conv_id}")
    async def get_conversation(conv_id: str, user: dict = Depends(get_current_user)):
        conv = await _assert_participant(db, conv_id, user["id"])
        conv["participants"] = await _hydrate_participants(db, conv["participant_ids"])
        conv["property"] = await _hydrate_property(db, conv.get("property_id"))
        conv["unread_count"] = await _unread_count_for(db, conv_id, user["id"])
        return conv

    # ── List messages (paginated backward) ───────────────────
    @router.get("/conversations/{conv_id}/messages")
    async def list_messages(
        conv_id: str,
        before: Optional[str] = Query(None, description="ISO timestamp; return messages older than this"),
        limit: int = Query(30, ge=1, le=MAX_PAGE),
        user: dict = Depends(get_current_user),
    ):
        await _assert_participant(db, conv_id, user["id"])
        q: Dict[str, Any] = {"conversation_id": conv_id}
        if before:
            try:
                # Accept both '...Z' and '+00:00' ISO forms
                dt = datetime.fromisoformat(before.replace("Z", "+00:00"))
                q["created_at"] = {"$lt": dt}
            except Exception:
                raise HTTPException(400, "Invalid 'before' timestamp")
        rows = await db.chat_messages.find(q, {"_id": 0}) \
            .sort("created_at", -1).limit(limit).to_list(limit)
        rows.reverse()  # oldest first for rendering
        return {"items": rows, "count": len(rows)}

    # ── Send a message ───────────────────────────────────────
    @router.post("/conversations/{conv_id}/messages")
    async def send_message(
        conv_id: str,
        data: SendMessageIn = Body(...),
        user: dict = Depends(get_current_user),
    ):
        conv = await _assert_participant(db, conv_id, user["id"])
        # Blocked either way?
        other_ids = [uid for uid in conv["participant_ids"] if uid != user["id"]]
        for oid in other_ids:
            b = await db.chat_blocks.find_one(
                {"$or": [{"blocker_id": user["id"], "blocked_id": oid},
                         {"blocker_id": oid, "blocked_id": user["id"]}]},
                {"_id": 0},
            )
            if b:
                raise HTTPException(403, "This conversation is blocked")

        # Rate limit: 30 msgs / 60s
        since = _now().timestamp() - 60
        count = await db.chat_messages.count_documents({
            "conversation_id": conv_id, "sender_id": user["id"],
            "created_at": {"$gte": datetime.fromtimestamp(since, tz=timezone.utc)},
        })
        if count > 30:
            raise HTTPException(429, "Slow down — try again in a moment")

        # Idempotency by client_msg_id (per conversation + sender)
        if data.client_msg_id:
            dupe = await db.chat_messages.find_one(
                {"conversation_id": conv_id, "sender_id": user["id"],
                 "client_msg_id": data.client_msg_id}, {"_id": 0},
            )
            if dupe: return dupe

        now = _now()
        msg = {
            "id": str(uuid.uuid4()),
            "conversation_id": conv_id,
            "sender_id": user["id"],
            "sender_name": user.get("full_name") or user.get("email") or "Someone",
            "text": data.text.strip(),
            "kind": data.kind,
            "attachments": data.attachments or [],
            "client_msg_id": data.client_msg_id,
            "status": "sent",
            "created_at": now,
        }
        await db.chat_messages.insert_one(msg)
        await _bump_conversation(db, conv_id, msg["text"], now)
        # Notifications to other participants
        for oid in other_ids:
            await _notify(db, oid, conv_id, msg["sender_name"], msg["text"],
                          conv.get("property_id"))
        msg.pop("_id", None)
        return msg

    # ── Mark read ────────────────────────────────────────────
    @router.post("/conversations/{conv_id}/read")
    async def mark_read(conv_id: str, user: dict = Depends(get_current_user)):
        await _assert_participant(db, conv_id, user["id"])
        now = _now()
        await db.chat_reads.update_one(
            {"conversation_id": conv_id, "user_id": user["id"]},
            {"$set": {"last_read_at": now, "updated_at": now}},
            upsert=True,
        )
        # Also mark related NEW_MESSAGE notifications as read
        await db.notifications.update_many(
            {"user_id": user["id"], "kind": "NEW_MESSAGE",
             "meta.conversation_id": conv_id, "read": False},
            {"$set": {"read": True}},
        )
        return {"ok": True, "read_at": now.isoformat()}

    # ── Long-poll for new messages ───────────────────────────
    @router.get("/conversations/{conv_id}/updates")
    async def poll_updates(
        conv_id: str,
        after: str = Query(..., description="ISO timestamp of last-seen message"),
        wait_ms: int = Query(8000, ge=0, le=LONG_POLL_MAX_MS),
        user: dict = Depends(get_current_user),
    ):
        await _assert_participant(db, conv_id, user["id"])
        try:
            after_dt = datetime.fromisoformat(after.replace("Z", "+00:00"))
        except Exception:
            raise HTTPException(400, "Invalid 'after' timestamp")
        rows = await _wait_for_new_messages(db, conv_id, after_dt, wait_ms)
        return {"items": rows, "server_time": _now().isoformat()}

    # ── Unread count for badge ───────────────────────────────
    @router.get("/unread-count")
    async def unread_count(user: dict = Depends(get_current_user)):
        convs = await db.conversations.find(
            {"participant_ids": user["id"]},
            {"_id": 0, "id": 1},
        ).to_list(500)
        total = 0
        for c in convs:
            total += await _unread_count_for(db, c["id"], user["id"])
        return {"unread_count": total, "conversation_count": len(convs)}

    # ── Block / unblock ──────────────────────────────────────
    @router.post("/block/{target_user_id}")
    async def block_user(target_user_id: str, user: dict = Depends(get_current_user)):
        if target_user_id == user["id"]:
            raise HTTPException(400, "Cannot block yourself")
        await db.chat_blocks.update_one(
            {"blocker_id": user["id"], "blocked_id": target_user_id},
            {"$set": {"created_at": _now()}}, upsert=True,
        )
        return {"ok": True}

    @router.delete("/block/{target_user_id}")
    async def unblock_user(target_user_id: str, user: dict = Depends(get_current_user)):
        await db.chat_blocks.delete_one(
            {"blocker_id": user["id"], "blocked_id": target_user_id}
        )
        return {"ok": True}

    @router.get("/blocks")
    async def list_blocks(user: dict = Depends(get_current_user)):
        rows = await db.chat_blocks.find({"blocker_id": user["id"]}, {"_id": 0}) \
            .sort("created_at", -1).to_list(200)
        return {"items": rows, "count": len(rows)}

    # ── Report ────────────────────────────────────────────────
    @router.post("/report")
    async def report(data: ReportIn, user: dict = Depends(get_current_user)):
        # Must be a participant of the conversation being reported
        await _assert_participant(db, data.conversation_id, user["id"])
        rid = str(uuid.uuid4())
        await db.chat_reports.insert_one({
            "id": rid,
            "reporter_id": user["id"],
            "conversation_id": data.conversation_id,
            "message_id": data.message_id,
            "reported_user_id": data.reported_user_id,
            "reason": data.reason,
            "status": "OPEN",
            "created_at": _now(),
        })
        return {"ok": True, "id": rid}

    # ── Admin ────────────────────────────────────────────────
    @router.get("/admin/reports")
    async def admin_reports(status: str = Query("OPEN"),
                            limit: int = Query(50, ge=1, le=200),
                            _admin=Depends(require_admin)):
        rows = await db.chat_reports.find({"status": status.upper()}, {"_id": 0}) \
            .sort("created_at", -1).limit(limit).to_list(limit)
        return {"items": rows, "count": len(rows)}

    @router.post("/admin/reports/{report_id}/resolve")
    async def admin_resolve_report(
        report_id: str, resolution: str = Body("resolved", embed=True),
        admin: dict = Depends(require_admin),
    ):
        r = await db.chat_reports.update_one(
            {"id": report_id, "status": "OPEN"},
            {"$set": {"status": "RESOLVED", "resolution": resolution,
                      "resolved_by": admin["id"], "resolved_at": _now()}},
        )
        if not r.matched_count:
            raise HTTPException(404, "Report not found or already resolved")
        return {"ok": True}

    @router.get("/admin/stats")
    async def admin_stats(_admin=Depends(require_admin)):
        total = await db.conversations.count_documents({})
        active = await db.conversations.count_documents({
            "last_message_at": {"$gte": datetime(2020, 1, 1, tzinfo=timezone.utc)}
        })
        open_reports = await db.chat_reports.count_documents({"status": "OPEN"})
        total_blocks = await db.chat_blocks.count_documents({})
        total_messages = await db.chat_messages.count_documents({})
        return {
            "total_conversations": total,
            "active_conversations": active,
            "total_messages": total_messages,
            "open_reports": open_reports,
            "total_blocks": total_blocks,
        }

    return router


# ── Startup indexes helper ────────────────────────────────────────
async def create_chat_indexes(db):
    await db.conversations.create_index("id", unique=True)
    await db.conversations.create_index([("participant_ids", 1), ("last_message_at", -1)])
    await db.conversations.create_index([("property_id", 1), ("kind", 1)])
    await db.chat_messages.create_index("id", unique=True)
    await db.chat_messages.create_index([("conversation_id", 1), ("created_at", -1)])
    # Migration — drop any pre-existing idempotency index (from the previous
    # sparse=True definition) so we can recreate it with partialFilterExpression.
    try:
        info = await db.chat_messages.index_information()
        if "chat_msg_idempotency" in info:
            opts = info["chat_msg_idempotency"]
            has_partial = "partialFilterExpression" in opts
            if not has_partial:
                await db.chat_messages.drop_index("chat_msg_idempotency")
    except Exception:
        pass
    await db.chat_messages.create_index(
        [("conversation_id", 1), ("sender_id", 1), ("client_msg_id", 1)],
        unique=True,
        partialFilterExpression={"client_msg_id": {"$type": "string"}},
        name="chat_msg_idempotency",
    )
    await db.chat_reads.create_index(
        [("conversation_id", 1), ("user_id", 1)], unique=True,
    )
    await db.chat_blocks.create_index(
        [("blocker_id", 1), ("blocked_id", 1)], unique=True,
    )
    await db.chat_reports.create_index("id", unique=True)
    await db.chat_reports.create_index([("status", 1), ("created_at", -1)])
