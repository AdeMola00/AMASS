"""Neighbours — friends & couples layer.

Profiles/settings · connections · private contact matching · private shared collections ·
property social context · block / mute / report · recognition.

Privacy guarantees enforced here (not in the UI):
  • Contact matching never stores the caller's contacts. The client hashes E.164 numbers
    (sha256) on-device and sends hashes; we intersect with `social_profiles.phone_hash` of users
    who opted in (`discoverable_by_contacts`) and return public profiles only — never phones.
  • Collections are invite-only: every read/write asserts membership.
  • Property payloads inside collections pass through the same `annotate_properties` gate as the
    map, so a shared collection can never reveal paid agent contact.
  • "Saved by X" context is only shown for connections who enabled `share_saves`.
  • Blocks are shared with chat (`chat_blocks`) so a blocked person disappears everywhere.

Routes: /api/social/…
"""
from __future__ import annotations

import hashlib
import re
import secrets
from datetime import timedelta
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from social_common import (
    are_connected, award, badge_label, blocked_ids_for, connection_ids, ensure, is_blocked_between,
    muted_ids_for, new_id, notify, now, public_user, public_users, BADGE_RULES,
)

HANDLE_RE = re.compile(r"^[a-z0-9_]{3,20}$")
MAX_COLLECTION_ITEMS = 60
MAX_COLLECTION_MEMBERS = 12


# ─── Schemas (module-level: FastAPI must resolve postponed annotations) ───
class ProfilePatch(BaseModel):
    display_name: Optional[str] = Field(None, min_length=2, max_length=60)
    handle: Optional[str] = Field(None, min_length=3, max_length=20)
    bio: Optional[str] = Field(None, max_length=200)
    city: Optional[str] = Field(None, max_length=60)
    discoverable_by_contacts: Optional[bool] = None
    discoverable_by_handle: Optional[bool] = None
    share_saves: Optional[bool] = None


class ConnectIn(BaseModel):
    user_id: str
    message: Optional[str] = Field(None, max_length=140)


class ContactMatchIn(BaseModel):
    hashes: list[str] = Field(max_length=2000)


class CollectionIn(BaseModel):
    name: str = Field(min_length=2, max_length=60)
    kind: Literal["homes", "places"] = "homes"
    emoji: Optional[str] = Field(None, max_length=4)
    description: Optional[str] = Field(None, max_length=200)


class CollectionPatch(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=60)
    emoji: Optional[str] = Field(None, max_length=4)
    description: Optional[str] = Field(None, max_length=200)


class CollectionItemIn(BaseModel):
    kind: Literal["property", "place"] = "property"
    target_id: str
    note: Optional[str] = Field(None, max_length=200)


class CollectionInviteIn(BaseModel):
    user_id: str


class CommentIn(BaseModel):
    text: str = Field(min_length=1, max_length=600)
    item_id: Optional[str] = None


class ReactIn(BaseModel):
    reaction: Literal["love", "maybe", "no", "clear"]


class ReportIn(BaseModel):
    target_type: Literal["user", "post", "reply", "event", "place", "comment", "collection"]
    target_id: str
    reason: Literal["spam", "harassment", "scam", "inappropriate", "privacy", "misinformation", "other"]
    details: Optional[str] = Field(None, max_length=600)
    estate_id: Optional[str] = None


class FeedbackIn(BaseModel):
    area: Literal["neighbours", "collections", "estates", "events", "places", "friends", "other"] = "neighbours"
    rating: Optional[int] = Field(None, ge=1, le=5)
    text: str = Field(min_length=3, max_length=1000)


def register_social_routes(db, get_current_user, require_admin, annotate_properties):
    router = APIRouter(prefix="/api/social", tags=["social"])

    # ─── profile helpers ─────────────────────────────────
    async def _profile(user: dict) -> dict:
        p = await db.social_profiles.find_one({"user_id": user["id"]}, {"_id": 0})
        if not p:
            p = {
                "user_id": user["id"],
                "display_name": None,
                "handle": None,
                "bio": None,
                "city": user.get("city"),
                "avatar_url": None,
                "discoverable_by_contacts": False,
                "discoverable_by_handle": True,
                "share_saves": False,
                "contact_match_enabled": False,
                "contact_match_last_at": None,
                "phone_hash": hashlib.sha256(user["phone"].encode()).hexdigest() if user.get("phone") and user.get("phone_verified") else None,
                "contribution_points": 0,
                "badges": [],
                "created_at": now(),
            }
            await db.social_profiles.update_one({"user_id": user["id"]}, {"$setOnInsert": p}, upsert=True)
        elif user.get("phone") and user.get("phone_verified") and not p.get("phone_hash"):
            p["phone_hash"] = hashlib.sha256(user["phone"].encode()).hexdigest()
            await db.social_profiles.update_one({"user_id": user["id"]}, {"$set": {"phone_hash": p["phone_hash"]}})
        return p

    def _profile_out(user: dict, p: dict, counts: dict) -> dict:
        return {
            **public_user(user, p),
            "bio": p.get("bio"),
            "settings": {
                "discoverable_by_contacts": bool(p.get("discoverable_by_contacts")),
                "discoverable_by_handle": p.get("discoverable_by_handle", True),
                "share_saves": bool(p.get("share_saves")),
                "contact_match_enabled": bool(p.get("contact_match_enabled")),
                "contact_match_last_at": p.get("contact_match_last_at"),
                "has_phone": bool(user.get("phone_verified")),
            },
            "recognition": {
                "points": int(p.get("contribution_points") or 0),
                "badges": [{"key": b, "label": badge_label(b)} for b in (p.get("badges") or [])],
            },
            "counts": counts,
        }

    async def _counts(user_id: str) -> dict:
        return {
            "connections": await db.connections.count_documents({"pair": user_id, "status": "accepted"}),
            "pending_in": await db.connections.count_documents({"addressee_id": user_id, "status": "pending"}),
            "collections": await db.shared_collections.count_documents({"member_ids": user_id}),
            "estates": await db.estate_members.count_documents({"user_id": user_id, "status": "approved"}),
        }

    # ─── Me / settings ───────────────────────────────────
    @router.get("/me")
    async def me(user: dict = Depends(get_current_user)):
        p = await _profile(user)
        return _profile_out(user, p, await _counts(user["id"]))

    @router.patch("/me")
    async def patch_me(data: ProfilePatch, user: dict = Depends(get_current_user)):
        p = await _profile(user)
        changes = {k: v for k, v in data.model_dump().items() if v is not None}
        if "handle" in changes:
            h = changes["handle"].lower().strip().lstrip("@")
            ensure(bool(HANDLE_RE.match(h)), 400, "Handles are 3–20 characters: letters, numbers, underscores")
            taken = await db.social_profiles.find_one({"handle": h, "user_id": {"$ne": user["id"]}}, {"_id": 0, "user_id": 1})
            ensure(taken is None, 409, "That handle is taken")
            changes["handle"] = h
        if changes.get("discoverable_by_contacts") and not user.get("phone_verified"):
            raise HTTPException(400, "Verify your phone number first so contacts can find you")
        if changes:
            changes["updated_at"] = now()
            await db.social_profiles.update_one({"user_id": user["id"]}, {"$set": changes})
            p.update(changes)
        return _profile_out(user, p, await _counts(user["id"]))

    @router.get("/users/{user_id}")
    async def view_user(user_id: str, user: dict = Depends(get_current_user)):
        ensure(not await is_blocked_between(db, user["id"], user_id), 404, "User not found")
        target = await db.users.find_one({"id": user_id}, {"_id": 0})
        ensure(target is not None, 404, "User not found")
        p = await db.social_profiles.find_one({"user_id": user_id}, {"_id": 0}) or {}
        conn = await db.connections.find_one({"pair": sorted([user["id"], user_id])}, {"_id": 0})
        shared_estates = []
        if conn and conn.get("status") == "accepted":
            mine = {m["estate_id"] async for m in db.estate_members.find({"user_id": user["id"], "status": "approved"}, {"_id": 0, "estate_id": 1})}
            theirs = {m["estate_id"] async for m in db.estate_members.find({"user_id": user_id, "status": "approved"}, {"_id": 0, "estate_id": 1})}
            if mine & theirs:
                shared_estates = await db.estates.find({"id": {"$in": list(mine & theirs)}}, {"_id": 0, "id": 1, "name": 1}).to_list(10)
        return {
            **public_user(target, p),
            "bio": p.get("bio"),
            "recognition": {"points": int(p.get("contribution_points") or 0), "badges": [{"key": b, "label": badge_label(b)} for b in (p.get("badges") or [])]},
            "connection": None if not conn else {"status": conn["status"], "id": conn["id"], "requested_by_me": conn["requester_id"] == user["id"]},
            "shared_estates": shared_estates,
            "is_me": user_id == user["id"],
        }

    # ─── Find friends ────────────────────────────────────
    @router.get("/search")
    async def search_people(q: str = Query(min_length=2, max_length=40), user: dict = Depends(get_current_user)):
        needle = q.strip().lstrip("@").lower()
        blocked = await blocked_ids_for(db, user["id"])
        profs = await db.social_profiles.find(
            {"discoverable_by_handle": {"$ne": False}, "user_id": {"$ne": user["id"]}, "$or": [{"handle": {"$regex": f"^{re.escape(needle)}"}}, {"display_name": {"$regex": re.escape(needle), "$options": "i"}}]},
            {"_id": 0, "user_id": 1},
        ).limit(20).to_list(20)
        ids = [p["user_id"] for p in profs if p["user_id"] not in blocked]
        if len(ids) < 20:
            # Fall back to full names of users who haven't opted out.
            extra = await db.users.find({"full_name": {"$regex": re.escape(needle), "$options": "i"}, "id": {"$nin": [user["id"], *ids, *blocked]}}, {"_id": 0, "id": 1}).limit(20 - len(ids)).to_list(20)
            opted_out = {p["user_id"] async for p in db.social_profiles.find({"user_id": {"$in": [e["id"] for e in extra]}, "discoverable_by_handle": False}, {"_id": 0, "user_id": 1})}
            ids += [e["id"] for e in extra if e["id"] not in opted_out]
        users = await public_users(db, ids)
        conns = await db.connections.find({"pair": user["id"]}, {"_id": 0, "pair": 1, "status": 1, "requester_id": 1}).to_list(5000)
        cby = {}
        for c in conns:
            other = [p for p in c["pair"] if p != user["id"]]
            if other:
                cby[other[0]] = {"status": c["status"], "requested_by_me": c["requester_id"] == user["id"]}
        return [{**users[i], "connection": cby.get(i)} for i in ids if i in users]

    @router.post("/contacts/match")
    async def contacts_match(data: ContactMatchIn, user: dict = Depends(get_current_user)):
        """Client sends sha256(E.164) hashes. Nothing about the caller's address book is stored."""
        hashes = [h.lower() for h in data.hashes if re.fullmatch(r"[0-9a-fA-F]{64}", h)]
        ensure(bool(hashes), 400, "No valid contact hashes supplied")
        me = await _profile(user)
        blocked = await blocked_ids_for(db, user["id"])
        rows = await db.social_profiles.find(
            {"phone_hash": {"$in": hashes}, "discoverable_by_contacts": True, "user_id": {"$ne": user["id"]}},
            {"_id": 0, "user_id": 1},
        ).to_list(500)
        ids = [r["user_id"] for r in rows if r["user_id"] not in blocked]
        users = await public_users(db, ids)
        conns = await db.connections.find({"pair": user["id"]}, {"_id": 0, "pair": 1, "status": 1, "requester_id": 1}).to_list(5000)
        cby = {}
        for c in conns:
            other = [p for p in c["pair"] if p != user["id"]]
            if other:
                cby[other[0]] = {"status": c["status"], "requested_by_me": c["requester_id"] == user["id"]}
        await db.social_profiles.update_one({"user_id": user["id"]}, {"$set": {"contact_match_enabled": True, "contact_match_last_at": now(), "contact_match_count": len(hashes)}})
        await db.analytics_events.insert_one({"id": new_id(), "name": "contact_match_result", "user_id": user["id"], "props": {"matches": len(ids), "hashed": len(hashes)}, "created_at": now()})
        return {"matches": [{**users[i], "connection": cby.get(i)} for i in ids if i in users], "hashed": len(hashes), "discoverable": bool(me.get("discoverable_by_contacts"))}

    @router.delete("/contacts/sync")
    async def contacts_disable(user: dict = Depends(get_current_user)):
        """Turn matching off: stop being discoverable and clear every trace of the opt-in."""
        await db.social_profiles.update_one({"user_id": user["id"]}, {"$set": {"contact_match_enabled": False, "discoverable_by_contacts": False, "contact_match_last_at": None, "contact_match_count": 0}})
        return {"ok": True}

    # ─── Connections ─────────────────────────────────────
    async def _conn_out(rows: list[dict], me: str) -> list[dict]:
        others = [p for r in rows for p in r["pair"] if p != me]
        users = await public_users(db, others)
        out = []
        for r in rows:
            other = next((p for p in r["pair"] if p != me), None)
            if other and other in users:
                out.append({"id": r["id"], "status": r["status"], "requested_by_me": r["requester_id"] == me, "message": r.get("message"), "created_at": r["created_at"], "responded_at": r.get("responded_at"), "user": users[other]})
        return out

    @router.get("/connections")
    async def list_connections(status: Literal["accepted", "pending", "all"] = "all", user: dict = Depends(get_current_user)):
        q: dict = {"pair": user["id"]}
        if status != "all":
            q["status"] = status
        else:
            q["status"] = {"$in": ["accepted", "pending"]}
        rows = await db.connections.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
        items = await _conn_out(rows, user["id"])
        return {
            "accepted": [i for i in items if i["status"] == "accepted"],
            "incoming": [i for i in items if i["status"] == "pending" and not i["requested_by_me"]],
            "outgoing": [i for i in items if i["status"] == "pending" and i["requested_by_me"]],
        }

    @router.post("/connections")
    async def request_connection(data: ConnectIn, user: dict = Depends(get_current_user)):
        ensure(data.user_id != user["id"], 400, "You can't connect with yourself")
        target = await db.users.find_one({"id": data.user_id}, {"_id": 0, "id": 1, "full_name": 1})
        ensure(target is not None and not await is_blocked_between(db, user["id"], data.user_id), 404, "User not found")
        pair = sorted([user["id"], data.user_id])
        existing = await db.connections.find_one({"pair": pair}, {"_id": 0})
        if existing:
            if existing["status"] == "accepted":
                return {"ok": True, "status": "accepted", "id": existing["id"]}
            if existing["status"] == "pending":
                if existing["requester_id"] != user["id"]:
                    # They asked first — accept instead of duplicating.
                    return await respond_connection(existing["id"], "accept", user)
                return {"ok": True, "status": "pending", "id": existing["id"]}
            # declined/cancelled → allow a fresh request after 7 days
            if existing.get("responded_at") and (now() - existing["responded_at"].replace(tzinfo=existing["responded_at"].tzinfo or now().tzinfo)) < timedelta(days=7) and existing["status"] == "declined":
                raise HTTPException(429, "You can send another request in a few days")
            await db.connections.delete_one({"id": existing["id"]})
        doc = {"id": new_id(), "pair": pair, "requester_id": user["id"], "addressee_id": data.user_id, "status": "pending", "message": (data.message or "").strip() or None, "created_at": now(), "responded_at": None}
        await db.connections.insert_one(doc)
        me = await _profile(user)
        await notify(db, data.user_id, "CONNECTION_REQUEST", f"{me.get('display_name') or user.get('full_name')} wants to connect", doc["message"] or "Accept to share collections and message each other.", {"connection_id": doc["id"], "user_id": user["id"]})
        return {"ok": True, "status": "pending", "id": doc["id"]}

    @router.post("/connections/{conn_id}/{action}")
    async def respond_connection(conn_id: str, action: Literal["accept", "decline", "cancel", "remove"], user: dict = Depends(get_current_user)):
        c = await db.connections.find_one({"id": conn_id, "pair": user["id"]}, {"_id": 0})
        ensure(c is not None, 404, "Connection not found")
        other = next(p for p in c["pair"] if p != user["id"])
        if action in ("accept", "decline"):
            ensure(c["status"] == "pending" and c["addressee_id"] == user["id"], 409, "Nothing to respond to")
            status = "accepted" if action == "accept" else "declined"
            await db.connections.update_one({"id": conn_id}, {"$set": {"status": status, "responded_at": now()}})
            if status == "accepted":
                me = await _profile(user)
                await notify(db, other, "CONNECTION_ACCEPTED", f"{me.get('display_name') or user.get('full_name')} accepted your request", "You can now share collections and message each other.", {"connection_id": conn_id, "user_id": user["id"]})
            return {"ok": True, "status": status, "id": conn_id}
        if action == "cancel":
            ensure(c["status"] == "pending" and c["requester_id"] == user["id"], 409, "Only a pending request you sent can be cancelled")
            await db.connections.delete_one({"id": conn_id})
            return {"ok": True, "status": "cancelled", "id": conn_id}
        # remove an accepted connection (either side)
        ensure(c["status"] == "accepted", 409, "Not connected")
        await db.connections.delete_one({"id": conn_id})
        return {"ok": True, "status": "removed", "id": conn_id}

    # ─── Block / mute ────────────────────────────────────
    @router.post("/block/{user_id}")
    async def block(user_id: str, user: dict = Depends(get_current_user)):
        ensure(user_id != user["id"], 400, "You can't block yourself")
        await db.chat_blocks.update_one({"blocker_id": user["id"], "blocked_id": user_id}, {"$setOnInsert": {"created_at": now()}}, upsert=True)
        await db.connections.delete_many({"pair": sorted([user["id"], user_id])})
        # Leave their collections / remove them from mine
        await db.shared_collections.update_many({"owner_id": user["id"]}, {"$pull": {"member_ids": user_id}})
        await db.shared_collections.update_many({"owner_id": user_id}, {"$pull": {"member_ids": user["id"]}})
        return {"ok": True}

    @router.delete("/block/{user_id}")
    async def unblock(user_id: str, user: dict = Depends(get_current_user)):
        await db.chat_blocks.delete_one({"blocker_id": user["id"], "blocked_id": user_id})
        return {"ok": True}

    @router.post("/mute/{user_id}")
    async def mute(user_id: str, user: dict = Depends(get_current_user)):
        await db.social_mutes.update_one({"user_id": user["id"], "muted_id": user_id}, {"$setOnInsert": {"created_at": now()}}, upsert=True)
        return {"ok": True}

    @router.delete("/mute/{user_id}")
    async def unmute(user_id: str, user: dict = Depends(get_current_user)):
        await db.social_mutes.delete_one({"user_id": user["id"], "muted_id": user_id})
        return {"ok": True}

    @router.get("/blocked")
    async def blocked_list(user: dict = Depends(get_current_user)):
        rows = await db.chat_blocks.find({"blocker_id": user["id"]}, {"_id": 0, "blocked_id": 1, "created_at": 1}).to_list(500)
        muted = await db.social_mutes.find({"user_id": user["id"]}, {"_id": 0, "muted_id": 1}).to_list(500)
        users = await public_users(db, [r["blocked_id"] for r in rows] + [m["muted_id"] for m in muted])
        return {"blocked": [users[r["blocked_id"]] for r in rows if r["blocked_id"] in users], "muted": [users[m["muted_id"]] for m in muted if m["muted_id"] in users]}

    # ─── Reports (community moderation queue) ────────────
    @router.post("/reports")
    async def report(data: ReportIn, user: dict = Depends(get_current_user)):
        dup = await db.social_reports.find_one({"reporter_id": user["id"], "target_type": data.target_type, "target_id": data.target_id, "status": "OPEN"}, {"_id": 0, "id": 1})
        if dup:
            await db.social_reports.update_one({"id": dup["id"]}, {"$set": {"reason": data.reason, "details": (data.details or "").strip() or None, "updated_at": now()}})
            return {"ok": True, "report_id": dup["id"], "duplicate": True}
        estate_id = data.estate_id
        if not estate_id and data.target_type in ("post", "reply", "event"):
            coll = {"post": db.estate_posts, "reply": db.estate_post_replies, "event": db.events}[data.target_type]
            t = await coll.find_one({"id": data.target_id}, {"_id": 0, "estate_id": 1, "post_id": 1})
            if t and t.get("post_id"):
                parent = await db.estate_posts.find_one({"id": t["post_id"]}, {"_id": 0, "estate_id": 1})
                estate_id = (parent or {}).get("estate_id")
            else:
                estate_id = (t or {}).get("estate_id")
        rep = {"id": new_id(), "reporter_id": user["id"], "target_type": data.target_type, "target_id": data.target_id, "reason": data.reason, "details": (data.details or "").strip() or None, "estate_id": estate_id, "status": "OPEN", "created_at": now(), "updated_at": now()}
        await db.social_reports.insert_one(rep)
        # 3 independent open reports → hide the content until a moderator looks.
        open_n = await db.social_reports.count_documents({"target_type": data.target_type, "target_id": data.target_id, "status": "OPEN"})
        if open_n >= 3 and data.target_type in ("post", "reply", "event", "place", "comment"):
            coll = {"post": db.estate_posts, "reply": db.estate_post_replies, "event": db.events, "place": db.places, "comment": db.collection_comments}[data.target_type]
            await coll.update_one({"id": data.target_id}, {"$set": {"status": "hidden", "hidden_reason": "auto_reports"}})
        return {"ok": True, "report_id": rep["id"]}

    # ─── Collections ─────────────────────────────────────
    async def _collection(coll_id: str, user_id: str) -> dict:
        c = await db.shared_collections.find_one({"id": coll_id}, {"_id": 0})
        ensure(c is not None, 404, "Collection not found")
        ensure(user_id in c.get("member_ids", []), 403, "This collection is private")
        return c

    def _coll_summary(c: dict, me: str, users: dict) -> dict:
        return {
            "id": c["id"],
            "name": c["name"],
            "emoji": c.get("emoji"),
            "kind": c.get("kind", "homes"),
            "description": c.get("description"),
            "owner_id": c["owner_id"],
            "is_owner": c["owner_id"] == me,
            "members": [users[m] for m in c.get("member_ids", []) if m in users],
            "member_count": len(c.get("member_ids", [])),
            "item_count": c.get("item_count", 0),
            "cover_images": c.get("cover_images", [])[:4],
            "updated_at": c.get("updated_at"),
            "created_at": c["created_at"],
            "last_activity": c.get("last_activity"),
        }

    @router.get("/collections")
    async def list_collections(user: dict = Depends(get_current_user)):
        rows = await db.shared_collections.find({"member_ids": user["id"]}, {"_id": 0}).sort("updated_at", -1).to_list(200)
        users = await public_users(db, [m for c in rows for m in c.get("member_ids", [])])
        return [_coll_summary(c, user["id"], users) for c in rows]

    @router.post("/collections")
    async def create_collection(data: CollectionIn, user: dict = Depends(get_current_user)):
        n = await db.shared_collections.count_documents({"owner_id": user["id"]})
        ensure(n < 30, 400, "You can have up to 30 collections")
        doc = {
            "id": new_id(), "name": data.name.strip(), "kind": data.kind, "emoji": data.emoji or ("🏠" if data.kind == "homes" else "📍"),
            "description": (data.description or "").strip() or None, "owner_id": user["id"], "member_ids": [user["id"]],
            "invite_code": secrets.token_urlsafe(8), "item_count": 0, "cover_images": [], "created_at": now(), "updated_at": now(), "last_activity": None,
        }
        await db.shared_collections.insert_one(doc)
        users = await public_users(db, [user["id"]])
        return _coll_summary(doc, user["id"], users)

    @router.get("/collections/{coll_id}")
    async def get_collection(coll_id: str, user: dict = Depends(get_current_user)):
        c = await _collection(coll_id, user["id"])
        items = await db.collection_items.find({"collection_id": coll_id}, {"_id": 0}).sort("created_at", -1).to_list(MAX_COLLECTION_ITEMS)
        prop_ids = [i["target_id"] for i in items if i["kind"] == "property"]
        place_ids = [i["target_id"] for i in items if i["kind"] == "place"]
        props = await db.properties.find({"id": {"$in": prop_ids}}, {"_id": 0}).to_list(len(prop_ids)) if prop_ids else []
        # Same paid gate as the map/list endpoints: strips agent contact unless the viewer unlocked it.
        await annotate_properties(db, props, user["id"])
        pby = {p["id"]: p for p in props}
        places = await db.places.find({"id": {"$in": place_ids}}, {"_id": 0}).to_list(len(place_ids)) if place_ids else []
        plby = {p["id"]: p for p in places}
        comments = await db.collection_comments.find({"collection_id": coll_id, "status": {"$ne": "hidden"}}, {"_id": 0}).sort("created_at", 1).to_list(500)
        users = await public_users(db, [*c.get("member_ids", []), *(i["added_by"] for i in items), *(cm["user_id"] for cm in comments)])
        muted = await muted_ids_for(db, user["id"])
        out_items = []
        for i in items:
            target = pby.get(i["target_id"]) if i["kind"] == "property" else plby.get(i["target_id"])
            if not target:
                continue
            reactions = i.get("reactions", {})
            out_items.append({
                "id": i["id"], "kind": i["kind"], "target_id": i["target_id"], "note": i.get("note"), "added_by": users.get(i["added_by"]),
                "created_at": i["created_at"],
                "reactions": {"love": sum(1 for v in reactions.values() if v == "love"), "maybe": sum(1 for v in reactions.values() if v == "maybe"), "no": sum(1 for v in reactions.values() if v == "no"), "mine": reactions.get(user["id"])},
                "comment_count": sum(1 for cm in comments if cm.get("item_id") == i["id"]),
                "property": target if i["kind"] == "property" else None,
                "place": target if i["kind"] == "place" else None,
            })
        return {
            **_coll_summary(c, user["id"], users),
            "invite_code": c.get("invite_code") if c["owner_id"] == user["id"] else None,
            "items": out_items,
            "comments": [{**cm, "user": users.get(cm["user_id"])} for cm in comments if cm["user_id"] not in muted],
        }

    @router.patch("/collections/{coll_id}")
    async def patch_collection(coll_id: str, data: CollectionPatch, user: dict = Depends(get_current_user)):
        c = await _collection(coll_id, user["id"])
        ensure(c["owner_id"] == user["id"], 403, "Only the owner can edit the collection")
        changes = {k: v for k, v in data.model_dump().items() if v is not None}
        if changes:
            changes["updated_at"] = now()
            await db.shared_collections.update_one({"id": coll_id}, {"$set": changes})
        return {"ok": True}

    @router.delete("/collections/{coll_id}")
    async def delete_collection(coll_id: str, user: dict = Depends(get_current_user)):
        c = await _collection(coll_id, user["id"])
        if c["owner_id"] == user["id"]:
            await db.shared_collections.delete_one({"id": coll_id})
            await db.collection_items.delete_many({"collection_id": coll_id})
            await db.collection_comments.delete_many({"collection_id": coll_id})
            return {"ok": True, "deleted": True}
        await db.shared_collections.update_one({"id": coll_id}, {"$pull": {"member_ids": user["id"]}})
        return {"ok": True, "left": True}

    @router.post("/collections/{coll_id}/items")
    async def add_item(coll_id: str, data: CollectionItemIn, user: dict = Depends(get_current_user)):
        c = await _collection(coll_id, user["id"])
        ensure(c.get("item_count", 0) < MAX_COLLECTION_ITEMS, 400, f"A collection holds up to {MAX_COLLECTION_ITEMS} items")
        coll = db.properties if data.kind == "property" else db.places
        target = await coll.find_one({"id": data.target_id}, {"_id": 0, "id": 1, "images": 1, "image": 1, "title": 1, "name": 1})
        ensure(target is not None, 404, "Not found")
        dup = await db.collection_items.find_one({"collection_id": coll_id, "target_id": data.target_id}, {"_id": 0, "id": 1})
        if dup:
            return {"ok": True, "item_id": dup["id"], "duplicate": True}
        item = {"id": new_id(), "collection_id": coll_id, "kind": data.kind, "target_id": data.target_id, "added_by": user["id"], "note": (data.note or "").strip() or None, "reactions": {}, "created_at": now()}
        await db.collection_items.insert_one(item)
        cover = (target.get("images") or [target.get("image")])[0] if (target.get("images") or target.get("image")) else None
        upd: dict = {"$inc": {"item_count": 1}, "$set": {"updated_at": now(), "last_activity": {"kind": "added", "user_id": user["id"], "label": target.get("title") or target.get("name"), "at": now()}}}
        if cover:
            upd["$push"] = {"cover_images": {"$each": [cover], "$slice": -4}}
        await db.shared_collections.update_one({"id": coll_id}, upd)
        me = await _profile(user)
        for m in c.get("member_ids", []):
            if m != user["id"]:
                await notify(db, m, "COLLECTION_ACTIVITY", f"{me.get('display_name') or user.get('full_name')} added to {c['name']}", target.get("title") or target.get("name") or "New item", {"collection_id": coll_id, "item_id": item["id"]})
        return {"ok": True, "item_id": item["id"]}

    @router.delete("/collections/{coll_id}/items/{item_id}")
    async def remove_item(coll_id: str, item_id: str, user: dict = Depends(get_current_user)):
        c = await _collection(coll_id, user["id"])
        it = await db.collection_items.find_one({"id": item_id, "collection_id": coll_id}, {"_id": 0})
        ensure(it is not None, 404, "Item not found")
        ensure(it["added_by"] == user["id"] or c["owner_id"] == user["id"], 403, "Only the person who added it (or the owner) can remove it")
        await db.collection_items.delete_one({"id": item_id})
        await db.collection_comments.delete_many({"item_id": item_id})
        await db.shared_collections.update_one({"id": coll_id}, {"$inc": {"item_count": -1}, "$set": {"updated_at": now()}})
        return {"ok": True}

    @router.post("/collections/{coll_id}/items/{item_id}/react")
    async def react(coll_id: str, item_id: str, data: ReactIn, user: dict = Depends(get_current_user)):
        await _collection(coll_id, user["id"])
        if data.reaction == "clear":
            await db.collection_items.update_one({"id": item_id, "collection_id": coll_id}, {"$unset": {f"reactions.{user['id']}": ""}})
        else:
            await db.collection_items.update_one({"id": item_id, "collection_id": coll_id}, {"$set": {f"reactions.{user['id']}": data.reaction}})
        await db.shared_collections.update_one({"id": coll_id}, {"$set": {"updated_at": now()}})
        return {"ok": True}

    @router.post("/collections/{coll_id}/comments")
    async def comment(coll_id: str, data: CommentIn, user: dict = Depends(get_current_user)):
        c = await _collection(coll_id, user["id"])
        if data.item_id:
            ensure(await db.collection_items.find_one({"id": data.item_id, "collection_id": coll_id}) is not None, 404, "Item not found")
        cm = {"id": new_id(), "collection_id": coll_id, "item_id": data.item_id, "user_id": user["id"], "text": data.text.strip(), "status": "active", "created_at": now()}
        await db.collection_comments.insert_one(cm)
        await db.shared_collections.update_one({"id": coll_id}, {"$set": {"updated_at": now(), "last_activity": {"kind": "comment", "user_id": user["id"], "label": cm["text"][:60], "at": now()}}})
        me = await _profile(user)
        for m in c.get("member_ids", []):
            if m != user["id"]:
                await notify(db, m, "COLLECTION_ACTIVITY", f"{me.get('display_name') or user.get('full_name')} commented in {c['name']}", cm["text"], {"collection_id": coll_id, "item_id": data.item_id})
        users = await public_users(db, [user["id"]])
        cm.pop("_id", None)
        return {**cm, "user": users.get(user["id"])}

    @router.post("/collections/{coll_id}/invite")
    async def invite(coll_id: str, data: CollectionInviteIn, user: dict = Depends(get_current_user)):
        c = await _collection(coll_id, user["id"])
        ensure(len(c.get("member_ids", [])) < MAX_COLLECTION_MEMBERS, 400, f"Up to {MAX_COLLECTION_MEMBERS} people per collection")
        ensure(await are_connected(db, user["id"], data.user_id), 403, "You can only invite people you're connected with")
        if data.user_id in c.get("member_ids", []):
            return {"ok": True, "already_member": True}
        await db.shared_collections.update_one({"id": coll_id}, {"$addToSet": {"member_ids": data.user_id}, "$set": {"updated_at": now()}})
        me = await _profile(user)
        await notify(db, data.user_id, "COLLECTION_INVITE", f"{me.get('display_name') or user.get('full_name')} shared “{c['name']}” with you", "Open it to save, compare and discuss homes together.", {"collection_id": coll_id})
        return {"ok": True}

    @router.post("/collections/{coll_id}/invite-code/rotate")
    async def rotate_code(coll_id: str, user: dict = Depends(get_current_user)):
        c = await _collection(coll_id, user["id"])
        ensure(c["owner_id"] == user["id"], 403, "Only the owner can manage the invite link")
        code = secrets.token_urlsafe(8)
        await db.shared_collections.update_one({"id": coll_id}, {"$set": {"invite_code": code}})
        return {"invite_code": code}

    @router.get("/collections/join/{code}")
    async def preview_join(code: str, user: dict = Depends(get_current_user)):
        c = await db.shared_collections.find_one({"invite_code": code}, {"_id": 0, "id": 1, "name": 1, "emoji": 1, "owner_id": 1, "member_ids": 1, "item_count": 1})
        ensure(c is not None, 404, "This invite link is no longer valid")
        users = await public_users(db, [c["owner_id"]])
        return {"id": c["id"], "name": c["name"], "emoji": c.get("emoji"), "owner": users.get(c["owner_id"]), "member_count": len(c.get("member_ids", [])), "item_count": c.get("item_count", 0), "already_member": user["id"] in c.get("member_ids", [])}

    @router.post("/collections/join/{code}")
    async def join_by_code(code: str, user: dict = Depends(get_current_user)):
        c = await db.shared_collections.find_one({"invite_code": code}, {"_id": 0})
        ensure(c is not None, 404, "This invite link is no longer valid")
        ensure(not await is_blocked_between(db, user["id"], c["owner_id"]), 404, "This invite link is no longer valid")
        if user["id"] in c.get("member_ids", []):
            return {"ok": True, "collection_id": c["id"], "already_member": True}
        ensure(len(c.get("member_ids", [])) < MAX_COLLECTION_MEMBERS, 400, "This collection is full")
        await db.shared_collections.update_one({"id": c["id"]}, {"$addToSet": {"member_ids": user["id"]}, "$set": {"updated_at": now()}})
        me = await _profile(user)
        await notify(db, c["owner_id"], "COLLECTION_ACTIVITY", f"{me.get('display_name') or user.get('full_name')} joined “{c['name']}”", "They can now save, react and comment.", {"collection_id": c["id"]})
        return {"ok": True, "collection_id": c["id"]}

    @router.post("/collections/{coll_id}/members/{member_id}/remove")
    async def remove_member(coll_id: str, member_id: str, user: dict = Depends(get_current_user)):
        c = await _collection(coll_id, user["id"])
        ensure(c["owner_id"] == user["id"] and member_id != user["id"], 403, "Only the owner can remove members")
        await db.shared_collections.update_one({"id": coll_id}, {"$pull": {"member_ids": member_id}})
        return {"ok": True}

    # ─── Property social context (consent-gated) ─────────
    @router.get("/context/properties")
    async def property_context(ids: str = Query(..., description="comma-separated property ids"), user: dict = Depends(get_current_user)):
        pids = [i for i in ids.split(",") if i][:50]
        if not pids:
            return {}
        conns = await connection_ids(db, user["id"])
        sharing = {p["user_id"] async for p in db.social_profiles.find({"user_id": {"$in": list(conns)}, "share_saves": True}, {"_id": 0, "user_id": 1})} if conns else set()
        favs = await db.favorites.find({"property_id": {"$in": pids}, "user_id": {"$in": list(sharing)}}, {"_id": 0, "property_id": 1, "user_id": 1}).to_list(2000) if sharing else []
        colls = await db.shared_collections.find({"member_ids": user["id"]}, {"_id": 0, "id": 1, "name": 1, "emoji": 1, "member_ids": 1}).to_list(200)
        cids = [c["id"] for c in colls]
        items = await db.collection_items.find({"collection_id": {"$in": cids}, "target_id": {"$in": pids}}, {"_id": 0, "collection_id": 1, "target_id": 1}).to_list(2000) if cids else []
        cby = {c["id"]: c for c in colls}
        users = await public_users(db, [f["user_id"] for f in favs])
        out: dict[str, dict] = {pid: {"saved_by": [], "in_collections": []} for pid in pids}
        for f in favs:
            if f["user_id"] in users:
                out[f["property_id"]]["saved_by"].append(users[f["user_id"]])
        for it in items:
            c = cby.get(it["collection_id"])
            if c:
                out[it["target_id"]]["in_collections"].append({"id": c["id"], "name": c["name"], "emoji": c.get("emoji"), "shared": len(c.get("member_ids", [])) > 1})
        return out

    # ─── Recognition ─────────────────────────────────────
    @router.get("/recognition")
    async def recognition(user: dict = Depends(get_current_user)):
        p = await _profile(user)
        rows = await db.contributions.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(50)
        counts: dict[str, int] = {}
        for r in rows:
            counts[r["kind"]] = counts.get(r["kind"], 0) + 1
        return {
            "points": int(p.get("contribution_points") or 0),
            "badges": [{"key": b, "label": badge_label(b)} for b in (p.get("badges") or [])],
            "progress": [{"key": k, "label": label, "kind": kind, "have": counts.get(kind, 0), "need": t, "earned": k in (p.get("badges") or [])} for k, label, kind, t in BADGE_RULES],
            "recent": rows[:20],
            "note": "Recognition is a thank-you from your community. It never unlocks paid property details and has no cash value.",
        }

    @router.post("/feedback")
    async def feedback(data: FeedbackIn, user: dict = Depends(get_current_user)):
        await db.social_feedback.insert_one({"id": new_id(), "user_id": user["id"], "area": data.area, "rating": data.rating, "text": data.text.strip(), "created_at": now()})
        return {"ok": True}

    # ─── Admin moderation ────────────────────────────────
    @router.get("/admin/reports")
    async def admin_reports(status: str = Query("OPEN"), _: dict = Depends(require_admin)):
        q = {} if status == "ALL" else {"status": status}
        rows = await db.social_reports.find(q, {"_id": 0}).sort("created_at", -1).limit(200).to_list(200)
        users = await public_users(db, [r["reporter_id"] for r in rows] + [r["target_id"] for r in rows if r["target_type"] == "user"])
        estates = {e["id"]: e["name"] async for e in db.estates.find({"id": {"$in": [r["estate_id"] for r in rows if r.get("estate_id")]}}, {"_id": 0, "id": 1, "name": 1})}
        for r in rows:
            r["reporter"] = users.get(r["reporter_id"])
            r["target_user"] = users.get(r["target_id"]) if r["target_type"] == "user" else None
            r["estate_name"] = estates.get(r.get("estate_id"))
            if r["target_type"] in ("post", "reply", "event", "place", "comment"):
                coll = {"post": db.estate_posts, "reply": db.estate_post_replies, "event": db.events, "place": db.places, "comment": db.collection_comments}[r["target_type"]]
                t = await coll.find_one({"id": r["target_id"]}, {"_id": 0, "title": 1, "body": 1, "name": 1, "text": 1, "status": 1})
                r["target_preview"] = (t or {}).get("title") or (t or {}).get("name") or ((t or {}).get("body") or (t or {}).get("text") or "")[:140]
                r["target_status"] = (t or {}).get("status")
        return {"items": rows, "open_total": await db.social_reports.count_documents({"status": "OPEN"})}

    @router.post("/admin/reports/{report_id}/resolve")
    async def admin_resolve(report_id: str, action: Literal["dismiss", "hide", "restore", "ban_user"] = Query(...), admin: dict = Depends(require_admin)):
        rep = await db.social_reports.find_one({"id": report_id}, {"_id": 0})
        ensure(rep is not None, 404, "Report not found")
        if action in ("hide", "restore") and rep["target_type"] in ("post", "reply", "event", "place", "comment"):
            coll = {"post": db.estate_posts, "reply": db.estate_post_replies, "event": db.events, "place": db.places, "comment": db.collection_comments}[rep["target_type"]]
            await coll.update_one({"id": rep["target_id"]}, {"$set": {"status": "hidden" if action == "hide" else "active", "hidden_reason": "moderator" if action == "hide" else None}})
        if action == "ban_user" and rep["target_type"] == "user":
            await db.users.update_one({"id": rep["target_id"]}, {"$set": {"social_banned": True}})
        await db.social_reports.update_many({"target_type": rep["target_type"], "target_id": rep["target_id"], "status": "OPEN"}, {"$set": {"status": "RESOLVED", "resolution": action, "resolved_by": admin["id"], "resolved_at": now(), "updated_at": now()}})
        return {"ok": True}

    return router


async def ensure_social_indexes(db) -> None:
    await db.social_profiles.create_index("user_id", unique=True)
    await db.social_profiles.create_index("handle", unique=True, partialFilterExpression={"handle": {"$type": "string"}})
    await db.social_profiles.create_index("phone_hash", partialFilterExpression={"phone_hash": {"$type": "string"}})
    await db.connections.create_index("id", unique=True)
    await db.connections.create_index("pair", unique=True)
    await db.connections.create_index([("addressee_id", 1), ("status", 1)])
    await db.shared_collections.create_index("id", unique=True)
    await db.shared_collections.create_index("member_ids")
    await db.shared_collections.create_index("invite_code", unique=True)
    await db.collection_items.create_index([("collection_id", 1), ("target_id", 1)], unique=True)
    await db.collection_items.create_index("target_id")
    await db.collection_comments.create_index([("collection_id", 1), ("created_at", 1)])
    await db.social_mutes.create_index([("user_id", 1), ("muted_id", 1)], unique=True)
    await db.social_reports.create_index("id", unique=True)
    await db.social_reports.create_index([("status", 1), ("created_at", -1)])
    await db.contributions.create_index([("user_id", 1), ("kind", 1), ("ref", 1)], unique=True)
