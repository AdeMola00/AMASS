"""Neighbours — estates & local community layer.

Estates (verified communities) · membership + resident verification · posts (official notices,
questions, recommendations) · interest groups · events + RSVP + optional group chat · local
places + resident recommendations · maintenance service requests (status-tracked, linked to the
existing FIXA service workflow — never ordinary feed posts) · estate-manager moderation.

Authorization lives here, not in the UI:
  • Every estate-only read (`posts`, `events` with estate audience, `members`, amenities-only places,
    service requests) goes through `_member(estate_id, user)` → approved member/manager/admin.
  • Unit numbers, proof documents and phone numbers are stored but NEVER projected out.
  • Estate centroid is an approximate public point (never a member's home).
  • Events carry an `audience`: estate | connections | public. Readers are checked per audience.

Routes: /api/community/…
"""
from __future__ import annotations

import math
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from social_common import (
    award, are_connected, connection_ids, ensure, muted_ids_for, new_id, notify, now, public_users,
)

PLACE_CATEGORIES = ("supermarket", "pharmacy", "clinic", "school", "restaurant", "gym", "salon", "laundry", "mechanic", "atm", "park", "worship", "security", "amenity", "other")
SERVICE_CATEGORIES = ("plumbing", "electrical", "water", "generator", "security", "waste", "road", "lighting", "cleaning", "other")
SERVICE_STATUSES = ("open", "acknowledged", "in_progress", "resolved", "closed")


# ─── Schemas ──────────────────────────────────────────────
class EstateRequestIn(BaseModel):
    name: str = Field(min_length=3, max_length=80)
    city: str = Field(min_length=2, max_length=60)
    state: Optional[str] = Field(None, max_length=60)
    area: Optional[str] = Field(None, max_length=80)
    description: Optional[str] = Field(None, max_length=400)
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    i_am_manager: bool = False


class JoinIn(BaseModel):
    join_code: Optional[str] = Field(None, max_length=24)
    proof_url: Optional[str] = Field(None, max_length=500)
    unit: Optional[str] = Field(None, max_length=40)  # private — never returned
    note: Optional[str] = Field(None, max_length=200)


class EstatePatch(BaseModel):
    description: Optional[str] = Field(None, max_length=400)
    cover_image: Optional[str] = Field(None, max_length=500)
    amenities: Optional[list[str]] = None
    rules: Optional[str] = Field(None, max_length=1200)
    rotate_join_code: Optional[bool] = None


class PostIn(BaseModel):
    type: Literal["notice", "question", "recommendation", "general"] = "general"
    title: Optional[str] = Field(None, max_length=120)
    body: str = Field(min_length=2, max_length=2000)
    group_id: Optional[str] = None
    place_id: Optional[str] = None
    tags: list[str] = Field(default_factory=list, max_length=5)
    official: bool = False  # managers only


class ReplyIn(BaseModel):
    body: str = Field(min_length=1, max_length=1200)


class GroupIn(BaseModel):
    name: str = Field(min_length=2, max_length=60)
    description: Optional[str] = Field(None, max_length=200)
    emoji: Optional[str] = Field(None, max_length=4)


class EventIn(BaseModel):
    title: str = Field(min_length=3, max_length=100)
    description: Optional[str] = Field(None, max_length=1200)
    kind: Literal["gathering", "viewing", "activity", "meeting"] = "gathering"
    starts_at: datetime
    ends_at: Optional[datetime] = None
    location_label: str = Field(min_length=2, max_length=120)
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    audience: Literal["estate", "connections", "public"] = "estate"
    estate_id: Optional[str] = None
    property_id: Optional[str] = None
    capacity: Optional[int] = Field(None, ge=2, le=5000)
    group_chat: bool = False


class RsvpIn(BaseModel):
    status: Literal["going", "maybe", "declined"]


class PlaceIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    category: str
    latitude: float
    longitude: float
    address_label: Optional[str] = Field(None, max_length=160)
    estate_id: Optional[str] = None
    is_amenity: bool = False
    note: Optional[str] = Field(None, max_length=300)


class RecommendIn(BaseModel):
    text: Optional[str] = Field(None, max_length=300)


class ServiceRequestIn(BaseModel):
    estate_id: str
    category: str
    title: str = Field(min_length=3, max_length=100)
    description: str = Field(min_length=5, max_length=1500)
    location_label: Optional[str] = Field(None, max_length=120)
    photos: list[str] = Field(default_factory=list, max_length=5)
    urgent: bool = False


class ServiceUpdateIn(BaseModel):
    status: Literal["acknowledged", "in_progress", "resolved", "closed"]
    note: Optional[str] = Field(None, max_length=600)
    fixa_item_id: Optional[str] = None  # link to a FIXA provider chosen via the normal (gated) flow


class ReviewMemberIn(BaseModel):
    action: Literal["approve", "reject", "make_manager", "remove"]
    note: Optional[str] = Field(None, max_length=200)


class UploadIn(BaseModel):
    data_url: str = Field(min_length=16, max_length=8_000_000)


def _slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:60]


def _km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


ESTATE_PUBLIC = {"_id": 0, "join_code": 0, "manager_notes": 0}
MEMBER_PRIVATE = ("unit", "proof_url", "note")


def register_community_routes(db, get_current_user, require_admin, bearer, decode_user_id):
    router = APIRouter(prefix="/api/community", tags=["community"])

    # ─── membership helpers ──────────────────────────────
    async def _membership(estate_id: str, user_id: str) -> Optional[dict]:
        return await db.estate_members.find_one({"estate_id": estate_id, "user_id": user_id}, {"_id": 0})

    async def _member(estate_id: str, user: dict, manager: bool = False) -> dict:
        """Approved resident/manager (or AMASS admin). Raises 403 otherwise."""
        est = await db.estates.find_one({"id": estate_id}, {"_id": 0})
        ensure(est is not None, 404, "Estate not found")
        if user.get("is_admin"):
            return est
        m = await _membership(estate_id, user["id"])
        ok = m is not None and m.get("status") == "approved"
        if manager:
            ok = ok and (m.get("role") == "manager")
        ensure(ok, 403, "Residents only — join this estate to see its community" if not manager else "Estate managers only")
        return est

    def _estate_out(e: dict, m: Optional[dict], counts: Optional[dict] = None) -> dict:
        out = {k: v for k, v in e.items() if k not in ("join_code", "manager_notes")}
        out["membership"] = None if not m else {"status": m["status"], "role": m.get("role", "resident"), "joined_at": m.get("approved_at"), "verification_method": m.get("verification_method")}
        out["verification_methods"] = e.get("verification", ["join_code", "proof_upload"])
        if counts:
            out.update(counts)
        return out

    async def _estate_counts(estate_id: str) -> dict:
        return {
            "member_count": await db.estate_members.count_documents({"estate_id": estate_id, "status": "approved"}),
            "upcoming_events": await db.events.count_documents({"estate_id": estate_id, "starts_at": {"$gte": now()}, "status": {"$ne": "hidden"}}),
            "open_questions": await db.estate_posts.count_documents({"estate_id": estate_id, "type": "question", "answers_count": 0, "status": "active"}),
        }

    # ─── Estates directory ───────────────────────────────
    @router.get("/estates")
    async def list_estates(q: Optional[str] = None, city: Optional[str] = None, lat: Optional[float] = None, lng: Optional[float] = None, user: dict = Depends(get_current_user)):
        query: dict = {"status": "active"}
        if q:
            query["$or"] = [{"name": {"$regex": re.escape(q), "$options": "i"}}, {"area": {"$regex": re.escape(q), "$options": "i"}}, {"city": {"$regex": re.escape(q), "$options": "i"}}]
        if city:
            query["city"] = {"$regex": re.escape(city), "$options": "i"}
        rows = await db.estates.find(query, ESTATE_PUBLIC).limit(100).to_list(100)
        mine = {m["estate_id"]: m async for m in db.estate_members.find({"user_id": user["id"]}, {"_id": 0})}
        if lat is not None and lng is not None:
            for r in rows:
                if r.get("latitude") is not None and r.get("longitude") is not None:
                    r["distance_km"] = round(_km(lat, lng, r["latitude"], r["longitude"]), 1)
            rows.sort(key=lambda r: r.get("distance_km", 9e9))
        out = []
        for r in rows:
            out.append(_estate_out(r, mine.get(r["id"]), {"member_count": await db.estate_members.count_documents({"estate_id": r["id"], "status": "approved"})}))
        return {"items": out, "my_estate_ids": [k for k, v in mine.items() if v.get("status") == "approved"]}

    @router.get("/estates/mine")
    async def my_estates(user: dict = Depends(get_current_user)):
        ms = await db.estate_members.find({"user_id": user["id"], "status": {"$in": ["approved", "pending"]}}, {"_id": 0}).to_list(50)
        ids = [m["estate_id"] for m in ms]
        ests = {e["id"]: e async for e in db.estates.find({"id": {"$in": ids}}, ESTATE_PUBLIC)}
        out = []
        for m in ms:
            e = ests.get(m["estate_id"])
            if e:
                out.append(_estate_out(e, m, await _estate_counts(e["id"]) if m["status"] == "approved" else None))
        return out

    @router.post("/estates/request")
    async def request_estate(data: EstateRequestIn, user: dict = Depends(get_current_user)):
        """Users propose a new estate; AMASS admin approves (status pending → active)."""
        dup = await db.estates.find_one({"slug": _slug(f"{data.name}-{data.city}")}, {"_id": 0, "id": 1, "status": 1})
        ensure(dup is None, 409, "An estate with this name already exists in that city")
        doc = {
            "id": new_id(), "name": data.name.strip(), "slug": _slug(f"{data.name}-{data.city}"), "city": data.city.strip(), "state": (data.state or "").strip() or None,
            "area": (data.area or "").strip() or None, "description": (data.description or "").strip() or None, "latitude": data.latitude, "longitude": data.longitude,
            "cover_image": None, "amenities": [], "rules": None, "verification": ["join_code", "proof_upload"], "join_code": secrets.token_hex(3).upper(),
            "status": "pending", "created_by": user["id"], "requested_manager": data.i_am_manager, "created_at": now(), "updated_at": now(),
        }
        await db.estates.insert_one(doc)
        await db.estate_members.insert_one({"id": new_id(), "estate_id": doc["id"], "user_id": user["id"], "role": "manager" if data.i_am_manager else "resident", "status": "pending", "verification_method": "founder", "created_at": now()})
        await db.analytics_events.insert_one({"id": new_id(), "name": "estate_request", "user_id": user["id"], "props": {"new_estate": True}, "created_at": now()})
        return {"ok": True, "estate_id": doc["id"], "status": "pending", "message": "Thanks — we review new estates within 2 working days."}

    @router.get("/estates/{estate_id}")
    async def get_estate(estate_id: str, user: dict = Depends(get_current_user)):
        e = await db.estates.find_one({"id": estate_id}, ESTATE_PUBLIC)
        ensure(e is not None, 404, "Estate not found")
        m = await _membership(estate_id, user["id"])
        approved = (m or {}).get("status") == "approved" or user.get("is_admin")
        out = _estate_out(e, m, await _estate_counts(estate_id))
        managers = await db.estate_members.find({"estate_id": estate_id, "role": "manager", "status": "approved"}, {"_id": 0, "user_id": 1}).to_list(10)
        users = await public_users(db, [x["user_id"] for x in managers])
        out["managers"] = [users[x["user_id"]] for x in managers if x["user_id"] in users]
        out["is_manager"] = bool(m and m.get("role") == "manager" and m.get("status") == "approved") or bool(user.get("is_admin"))
        if out["is_manager"]:
            out["pending_requests"] = await db.estate_members.count_documents({"estate_id": estate_id, "status": "pending"})
            full = await db.estates.find_one({"id": estate_id}, {"_id": 0, "join_code": 1})
            out["join_code"] = (full or {}).get("join_code")
        if not approved:
            # Public teaser only — no posts, no members, no events detail.
            out["teaser"] = {"recent_activity_count": await db.estate_posts.count_documents({"estate_id": estate_id, "created_at": {"$gte": now() - timedelta(days=30)}})}
        return out

    @router.post("/estates/{estate_id}/join")
    async def join_estate(estate_id: str, data: JoinIn, user: dict = Depends(get_current_user)):
        e = await db.estates.find_one({"id": estate_id}, {"_id": 0})
        ensure(e is not None and e.get("status") == "active", 404, "Estate not found")
        m = await _membership(estate_id, user["id"])
        if m and m["status"] == "approved":
            return {"ok": True, "status": "approved", "already_member": True}
        if m and m["status"] == "pending":
            return {"ok": True, "status": "pending", "already_requested": True}
        method = None
        status = "pending"
        if data.join_code:
            if data.join_code.strip().upper() == (e.get("join_code") or "").upper():
                method = "join_code"
                status = "approved" if "join_code_auto" in e.get("verification", []) else "pending"
            else:
                raise HTTPException(400, "That join code isn't right. Ask your estate management for the current code.")
        elif data.proof_url:
            method = "proof_upload"
        else:
            method = "request"
        doc = {
            "id": new_id(), "estate_id": estate_id, "user_id": user["id"], "role": "resident", "status": status, "verification_method": method,
            "proof_url": data.proof_url, "unit": (data.unit or "").strip() or None, "note": (data.note or "").strip() or None,
            "created_at": now(), "approved_at": now() if status == "approved" else None,
        }
        await db.estate_members.update_one({"estate_id": estate_id, "user_id": user["id"]}, {"$set": doc}, upsert=True)
        await db.analytics_events.insert_one({"id": new_id(), "name": "estate_request", "user_id": user["id"], "props": {"method": method, "auto": status == "approved"}, "created_at": now()})
        if status == "pending":
            managers = await db.estate_members.find({"estate_id": estate_id, "role": "manager", "status": "approved"}, {"_id": 0, "user_id": 1}).to_list(10)
            for mg in managers:
                await notify(db, mg["user_id"], "ESTATE_REQUEST", f"New resident request · {e['name']}", f"{user.get('full_name') or 'A resident'} asked to join via {method.replace('_', ' ')}.", {"estate_id": estate_id})
        return {"ok": True, "status": status, "method": method, "message": "You're in — welcome to the community." if status == "approved" else "Request sent. Estate management will verify you shortly."}

    @router.post("/estates/{estate_id}/leave")
    async def leave_estate(estate_id: str, user: dict = Depends(get_current_user)):
        m = await _membership(estate_id, user["id"])
        ensure(m is not None, 404, "You're not a member")
        if m.get("role") == "manager":
            others = await db.estate_members.count_documents({"estate_id": estate_id, "role": "manager", "status": "approved", "user_id": {"$ne": user["id"]}})
            ensure(others > 0, 400, "Make another resident a manager before leaving")
        await db.estate_members.delete_one({"estate_id": estate_id, "user_id": user["id"]})
        return {"ok": True}

    @router.patch("/estates/{estate_id}")
    async def patch_estate(estate_id: str, data: EstatePatch, user: dict = Depends(get_current_user)):
        await _member(estate_id, user, manager=True)
        changes = {k: v for k, v in data.model_dump().items() if v is not None and k != "rotate_join_code"}
        if data.rotate_join_code:
            changes["join_code"] = secrets.token_hex(3).upper()
        if changes:
            changes["updated_at"] = now()
            await db.estates.update_one({"id": estate_id}, {"$set": changes})
        return {"ok": True, "join_code": changes.get("join_code")}

    # ─── Members (managers) ──────────────────────────────
    @router.get("/estates/{estate_id}/members")
    async def members(estate_id: str, status: Literal["approved", "pending", "all"] = "approved", user: dict = Depends(get_current_user)):
        await _member(estate_id, user)
        m_me = await _membership(estate_id, user["id"])
        is_mgr = bool(user.get("is_admin")) or ((m_me or {}).get("role") == "manager")
        q: dict = {"estate_id": estate_id}
        if status == "pending":
            ensure(is_mgr, 403, "Estate managers only")
            q["status"] = "pending"
        elif status == "approved":
            q["status"] = "approved"
        else:
            ensure(is_mgr, 403, "Estate managers only")
        rows = await db.estate_members.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
        users = await public_users(db, [r["user_id"] for r in rows])
        out = []
        for r in rows:
            u = users.get(r["user_id"])
            if not u:
                continue
            item = {"id": r["id"], "user": u, "role": r.get("role", "resident"), "status": r["status"], "verification_method": r.get("verification_method"), "created_at": r["created_at"], "approved_at": r.get("approved_at")}
            if is_mgr and r["status"] == "pending":
                # Managers see that proof exists and the applicant's note — never the unit or document URL itself in lists.
                item["has_proof"] = bool(r.get("proof_url"))
                item["note"] = r.get("note")
            out.append(item)
        return out

    @router.get("/estates/{estate_id}/members/{member_id}/proof")
    async def member_proof(estate_id: str, member_id: str, user: dict = Depends(get_current_user)):
        """Managers may open a pending applicant's proof document (audited)."""
        await _member(estate_id, user, manager=True)
        r = await db.estate_members.find_one({"id": member_id, "estate_id": estate_id, "status": "pending"}, {"_id": 0, "proof_url": 1, "unit": 1})
        ensure(r is not None and r.get("proof_url"), 404, "No proof document")
        await db.audit_log.insert_one({"id": new_id(), "actor_id": user["id"], "action": "estate_proof_viewed", "estate_id": estate_id, "member_id": member_id, "at": now()})
        return {"proof_url": r["proof_url"], "unit": r.get("unit")}

    @router.post("/estates/{estate_id}/members/{member_id}/review")
    async def review_member(estate_id: str, member_id: str, data: ReviewMemberIn, user: dict = Depends(get_current_user)):
        e = await _member(estate_id, user, manager=True)
        r = await db.estate_members.find_one({"id": member_id, "estate_id": estate_id}, {"_id": 0})
        ensure(r is not None, 404, "Request not found")
        if data.action == "approve":
            await db.estate_members.update_one({"id": member_id}, {"$set": {"status": "approved", "approved_at": now(), "approved_by": user["id"], "proof_url": None}})
            await notify(db, r["user_id"], "ESTATE_APPROVED", f"Welcome to {e['name']}", "You're verified. Say hello to your neighbours.", {"estate_id": estate_id})
            await db.analytics_events.insert_one({"id": new_id(), "name": "estate_approved", "user_id": r["user_id"], "props": {"estate_id": estate_id}, "created_at": now()})
        elif data.action == "reject":
            await db.estate_members.update_one({"id": member_id}, {"$set": {"status": "rejected", "rejected_at": now(), "proof_url": None, "manager_note": data.note}})
            await notify(db, r["user_id"], "ESTATE_REJECTED", f"Request to join {e['name']}", data.note or "Management couldn't verify your residence. You can try again with a join code.", {"estate_id": estate_id})
        elif data.action == "make_manager":
            ensure(r["status"] == "approved", 409, "Approve the resident first")
            await db.estate_members.update_one({"id": member_id}, {"$set": {"role": "manager"}})
        else:  # remove
            ensure(r["user_id"] != user["id"], 400, "Use “Leave estate” for yourself")
            await db.estate_members.delete_one({"id": member_id})
        return {"ok": True}

    # ─── Posts (notices · questions · recommendations) ───
    async def _post_out(rows: list[dict], me: str) -> list[dict]:
        users = await public_users(db, [r["author_id"] for r in rows])
        muted = await muted_ids_for(db, me)
        out = []
        for r in rows:
            if r["author_id"] in muted:
                continue
            out.append({**r, "author": users.get(r["author_id"]), "upvoted": me in r.get("upvotes", []), "upvote_count": len(r.get("upvotes", [])), "upvotes": None})
        return out

    @router.get("/estates/{estate_id}/posts")
    async def list_posts(estate_id: str, type: Optional[str] = None, group_id: Optional[str] = None, limit: int = Query(40, le=100), before: Optional[str] = None, user: dict = Depends(get_current_user)):
        await _member(estate_id, user)
        q: dict = {"estate_id": estate_id, "status": "active"}
        if type:
            q["type"] = type
        q["group_id"] = group_id if group_id else None
        if before:
            q["created_at"] = {"$lt": datetime.fromisoformat(before)}
        rows = await db.estate_posts.find(q, {"_id": 0}).sort([("pinned", -1), ("created_at", -1)]).limit(limit).to_list(limit)
        return {"items": await _post_out(rows, user["id"]), "has_more": len(rows) == limit}

    @router.post("/estates/{estate_id}/posts")
    async def create_post(estate_id: str, data: PostIn, user: dict = Depends(get_current_user)):
        e = await _member(estate_id, user)
        m = await _membership(estate_id, user["id"])
        is_mgr = bool(user.get("is_admin")) or ((m or {}).get("role") == "manager")
        if data.type == "notice" or data.official:
            ensure(is_mgr, 403, "Only estate management can post official notices")
        if data.group_id:
            g = await db.estate_groups.find_one({"id": data.group_id, "estate_id": estate_id}, {"_id": 0, "member_ids": 1})
            ensure(g is not None and user["id"] in g.get("member_ids", []), 403, "Join the group to post in it")
        # Light anti-spam: max 10 posts/hour per user per estate.
        recent = await db.estate_posts.count_documents({"estate_id": estate_id, "author_id": user["id"], "created_at": {"$gte": now() - timedelta(hours=1)}})
        ensure(recent < 10, 429, "You're posting quickly — take a short break")
        doc = {
            "id": new_id(), "estate_id": estate_id, "group_id": data.group_id, "author_id": user["id"], "type": data.type, "is_official": bool(is_mgr and (data.official or data.type == "notice")),
            "title": (data.title or "").strip() or None, "body": data.body.strip(), "place_id": data.place_id, "tags": [t.strip().lower()[:24] for t in data.tags if t.strip()],
            "answers_count": 0, "accepted_reply_id": None, "upvotes": [], "pinned": False, "status": "active", "created_at": now(), "updated_at": now(),
        }
        await db.estate_posts.insert_one(doc)
        doc.pop("_id", None)
        if data.type == "question":
            await db.analytics_events.insert_one({"id": new_id(), "name": "question_asked", "user_id": user["id"], "props": {"estate_id": estate_id}, "created_at": now()})
        if doc["is_official"]:
            # Official notices notify residents (the only post type that does).
            residents = await db.estate_members.find({"estate_id": estate_id, "status": "approved", "user_id": {"$ne": user["id"]}}, {"_id": 0, "user_id": 1}).to_list(5000)
            for r in residents:
                await notify(db, r["user_id"], "ESTATE_NOTICE", f"{e['name']} · Official notice", doc["title"] or doc["body"], {"estate_id": estate_id, "post_id": doc["id"]})
        return (await _post_out([doc], user["id"]))[0]

    @router.get("/posts/{post_id}")
    async def get_post(post_id: str, user: dict = Depends(get_current_user)):
        p = await db.estate_posts.find_one({"id": post_id}, {"_id": 0})
        ensure(p is not None and p.get("status") != "hidden", 404, "Post not found")
        await _member(p["estate_id"], user)
        replies = await db.estate_post_replies.find({"post_id": post_id, "status": {"$ne": "hidden"}}, {"_id": 0}).sort("created_at", 1).to_list(300)
        users = await public_users(db, [r["author_id"] for r in replies])
        muted = await muted_ids_for(db, user["id"])
        out = (await _post_out([p], user["id"]))[0]
        out["replies"] = [{**r, "author": users.get(r["author_id"]), "is_accepted": r["id"] == p.get("accepted_reply_id")} for r in replies if r["author_id"] not in muted]
        place = await db.places.find_one({"id": p["place_id"]}, {"_id": 0}) if p.get("place_id") else None
        out["place"] = place
        return out

    @router.post("/posts/{post_id}/replies")
    async def reply(post_id: str, data: ReplyIn, user: dict = Depends(get_current_user)):
        p = await db.estate_posts.find_one({"id": post_id}, {"_id": 0})
        ensure(p is not None and p.get("status") == "active", 404, "Post not found")
        await _member(p["estate_id"], user)
        r = {"id": new_id(), "post_id": post_id, "author_id": user["id"], "body": data.body.strip(), "status": "active", "created_at": now()}
        await db.estate_post_replies.insert_one(r)
        await db.estate_posts.update_one({"id": post_id}, {"$inc": {"answers_count": 1}, "$set": {"updated_at": now()}})
        if p["author_id"] != user["id"]:
            kind = "QUESTION_ANSWERED" if p["type"] == "question" else "POST_REPLY"
            await notify(db, p["author_id"], kind, f"{user.get('full_name') or 'A neighbour'} replied", r["body"], {"post_id": post_id, "estate_id": p["estate_id"]})
            if p["type"] == "question":
                await db.analytics_events.insert_one({"id": new_id(), "name": "question_answered", "user_id": user["id"], "props": {"estate_id": p["estate_id"]}, "created_at": now()})
                await award(db, user["id"], "question_answered", 2, {"post_id": post_id})
            # Welcoming a new resident's first post counts as a welcome.
            if p["type"] == "general" and (p.get("tags") or []) and "new-here" in p["tags"]:
                await award(db, user["id"], "welcome", 1, {"post_id": post_id})
        users = await public_users(db, [user["id"]])
        r.pop("_id", None)
        return {**r, "author": users.get(user["id"]), "is_accepted": False}

    @router.post("/posts/{post_id}/accept/{reply_id}")
    async def accept_reply(post_id: str, reply_id: str, user: dict = Depends(get_current_user)):
        p = await db.estate_posts.find_one({"id": post_id}, {"_id": 0})
        ensure(p is not None, 404, "Post not found")
        ensure(p["author_id"] == user["id"], 403, "Only the person who asked can accept an answer")
        r = await db.estate_post_replies.find_one({"id": reply_id, "post_id": post_id}, {"_id": 0})
        ensure(r is not None, 404, "Reply not found")
        await db.estate_posts.update_one({"id": post_id}, {"$set": {"accepted_reply_id": reply_id}})
        if r["author_id"] != user["id"]:
            await award(db, r["author_id"], "answer_accepted", 5, {"post_id": post_id})
            await notify(db, r["author_id"], "ANSWER_ACCEPTED", "Your answer was accepted", (p.get("title") or p["body"])[:100], {"post_id": post_id, "estate_id": p["estate_id"]})
        return {"ok": True}

    @router.post("/posts/{post_id}/upvote")
    async def upvote(post_id: str, user: dict = Depends(get_current_user)):
        p = await db.estate_posts.find_one({"id": post_id}, {"_id": 0, "estate_id": 1, "upvotes": 1})
        ensure(p is not None, 404, "Post not found")
        await _member(p["estate_id"], user)
        if user["id"] in p.get("upvotes", []):
            await db.estate_posts.update_one({"id": post_id}, {"$pull": {"upvotes": user["id"]}})
            return {"upvoted": False}
        await db.estate_posts.update_one({"id": post_id}, {"$addToSet": {"upvotes": user["id"]}})
        return {"upvoted": True}

    @router.post("/posts/{post_id}/moderate")
    async def moderate_post(post_id: str, action: Literal["hide", "restore", "pin", "unpin", "delete"] = Query(...), user: dict = Depends(get_current_user)):
        p = await db.estate_posts.find_one({"id": post_id}, {"_id": 0})
        ensure(p is not None, 404, "Post not found")
        if action == "delete" and p["author_id"] == user["id"]:
            await db.estate_posts.delete_one({"id": post_id})
            await db.estate_post_replies.delete_many({"post_id": post_id})
            return {"ok": True}
        await _member(p["estate_id"], user, manager=True)
        if action == "delete":
            await db.estate_posts.delete_one({"id": post_id})
            await db.estate_post_replies.delete_many({"post_id": post_id})
        else:
            upd = {"hide": {"status": "hidden"}, "restore": {"status": "active"}, "pin": {"pinned": True}, "unpin": {"pinned": False}}[action]
            await db.estate_posts.update_one({"id": post_id}, {"$set": upd})
        return {"ok": True}

    # ─── Interest groups ─────────────────────────────────
    @router.get("/estates/{estate_id}/groups")
    async def list_groups(estate_id: str, user: dict = Depends(get_current_user)):
        await _member(estate_id, user)
        rows = await db.estate_groups.find({"estate_id": estate_id}, {"_id": 0}).to_list(100)
        return [{**g, "member_count": len(g.get("member_ids", [])), "joined": user["id"] in g.get("member_ids", []), "member_ids": None} for g in rows]

    @router.post("/estates/{estate_id}/groups")
    async def create_group(estate_id: str, data: GroupIn, user: dict = Depends(get_current_user)):
        await _member(estate_id, user)
        g = {"id": new_id(), "estate_id": estate_id, "name": data.name.strip(), "description": (data.description or "").strip() or None, "emoji": data.emoji or "✨", "created_by": user["id"], "member_ids": [user["id"]], "created_at": now()}
        await db.estate_groups.insert_one(g)
        g.pop("_id", None)
        return {**g, "member_count": 1, "joined": True, "member_ids": None}

    @router.post("/groups/{group_id}/{action}")
    async def group_membership(group_id: str, action: Literal["join", "leave"], user: dict = Depends(get_current_user)):
        g = await db.estate_groups.find_one({"id": group_id}, {"_id": 0, "estate_id": 1})
        ensure(g is not None, 404, "Group not found")
        await _member(g["estate_id"], user)
        op = "$addToSet" if action == "join" else "$pull"
        await db.estate_groups.update_one({"id": group_id}, {op: {"member_ids": user["id"]}})
        return {"ok": True, "joined": action == "join"}

    # ─── Events ──────────────────────────────────────────
    async def _can_see_event(ev: dict, user: dict) -> bool:
        if ev.get("host_id") == user["id"] or user.get("is_admin"):
            return True
        aud = ev.get("audience", "estate")
        if aud == "public":
            return True
        if aud == "connections":
            return await are_connected(db, user["id"], ev["host_id"])
        m = await _membership(ev["estate_id"], user["id"]) if ev.get("estate_id") else None
        return bool(m and m.get("status") == "approved")

    async def _events_out(rows: list[dict], me: str) -> list[dict]:
        ids = [r["id"] for r in rows]
        mine = {r["event_id"]: r["status"] async for r in db.event_rsvps.find({"event_id": {"$in": ids}, "user_id": me}, {"_id": 0, "event_id": 1, "status": 1})}
        counts: dict[str, dict[str, int]] = {}
        async for row in db.event_rsvps.aggregate([{"$match": {"event_id": {"$in": ids}}}, {"$group": {"_id": {"e": "$event_id", "s": "$status"}, "n": {"$sum": 1}}}]):
            counts.setdefault(row["_id"]["e"], {})[row["_id"]["s"]] = row["n"]
        users = await public_users(db, [r["host_id"] for r in rows])
        ests = {e["id"]: e["name"] async for e in db.estates.find({"id": {"$in": [r["estate_id"] for r in rows if r.get("estate_id")]}}, {"_id": 0, "id": 1, "name": 1})}
        out = []
        for r in rows:
            c = counts.get(r["id"], {})
            out.append({**r, "host": users.get(r["host_id"]), "estate_name": ests.get(r.get("estate_id")), "my_rsvp": mine.get(r["id"]), "going_count": c.get("going", 0), "maybe_count": c.get("maybe", 0), "is_host": r["host_id"] == me})
        return out

    @router.get("/events")
    async def list_events(estate_id: Optional[str] = None, scope: Literal["upcoming", "mine", "past"] = "upcoming", user: dict = Depends(get_current_user)):
        q: dict = {"status": {"$ne": "hidden"}}
        if scope == "upcoming":
            q["starts_at"] = {"$gte": now() - timedelta(hours=3)}
        elif scope == "past":
            q["starts_at"] = {"$lt": now() - timedelta(hours=3)}
        if estate_id:
            await _member(estate_id, user)
            q["estate_id"] = estate_id
        else:
            my_estates = [m["estate_id"] async for m in db.estate_members.find({"user_id": user["id"], "status": "approved"}, {"_id": 0, "estate_id": 1})]
            conns = list(await connection_ids(db, user["id"]))
            q["$or"] = [{"audience": "public"}, {"estate_id": {"$in": my_estates}, "audience": "estate"}, {"host_id": {"$in": conns}, "audience": "connections"}, {"host_id": user["id"]}]
        if scope == "mine":
            going = [r["event_id"] async for r in db.event_rsvps.find({"user_id": user["id"], "status": {"$in": ["going", "maybe"]}}, {"_id": 0, "event_id": 1})]
            q = {"$and": [q, {"$or": [{"id": {"$in": going}}, {"host_id": user["id"]}]}]}
        rows = await db.events.find(q, {"_id": 0}).sort("starts_at", 1 if scope != "past" else -1).limit(60).to_list(60)
        return await _events_out(rows, user["id"])

    @router.post("/events")
    async def create_event(data: EventIn, user: dict = Depends(get_current_user)):
        ensure(data.starts_at > now() - timedelta(minutes=5), 400, "Events must start in the future")
        if data.audience == "estate":
            ensure(bool(data.estate_id), 400, "Pick the estate this event belongs to")
            await _member(data.estate_id, user)
        if data.property_id:
            ensure(await db.properties.find_one({"id": data.property_id}, {"_id": 0, "id": 1}) is not None, 404, "Property not found")
        doc = {
            "id": new_id(), "title": data.title.strip(), "description": (data.description or "").strip() or None, "kind": data.kind, "starts_at": data.starts_at, "ends_at": data.ends_at,
            "location_label": data.location_label.strip(), "latitude": data.latitude, "longitude": data.longitude, "audience": data.audience, "estate_id": data.estate_id if data.audience == "estate" else data.estate_id,
            "property_id": data.property_id, "capacity": data.capacity, "host_id": user["id"], "conversation_id": None, "status": "active", "created_at": now(), "updated_at": now(),
        }
        await db.events.insert_one(doc)
        await db.event_rsvps.update_one({"event_id": doc["id"], "user_id": user["id"]}, {"$set": {"status": "going", "created_at": now()}}, upsert=True)
        if data.group_chat:
            conv = {"id": new_id(), "kind": "group", "title": doc["title"], "event_id": doc["id"], "property_id": None, "listing_id": None, "participant_ids": [user["id"]], "created_by": user["id"], "last_message_preview": None, "last_message_at": None, "created_at": now(), "updated_at": now()}
            await db.conversations.insert_one(conv)
            doc["conversation_id"] = conv["id"]
            await db.events.update_one({"id": doc["id"]}, {"$set": {"conversation_id": conv["id"]}})
        await award(db, user["id"], "event_hosted", 3, {"event_id": doc["id"]})
        doc.pop("_id", None)
        return (await _events_out([doc], user["id"]))[0]

    @router.get("/events/{event_id}")
    async def get_event(event_id: str, user: dict = Depends(get_current_user)):
        ev = await db.events.find_one({"id": event_id}, {"_id": 0})
        ensure(ev is not None and ev.get("status") != "hidden", 404, "Event not found")
        ensure(await _can_see_event(ev, user), 403, "This event is private")
        out = (await _events_out([ev], user["id"]))[0]
        going = await db.event_rsvps.find({"event_id": event_id, "status": "going"}, {"_id": 0, "user_id": 1}).limit(30).to_list(30)
        users = await public_users(db, [g["user_id"] for g in going])
        out["going"] = [users[g["user_id"]] for g in going if g["user_id"] in users]
        if ev.get("property_id"):
            # Viewing events show the property PREVIEW; the paid action stays on the property page.
            p = await db.properties.find_one({"id": ev["property_id"]}, {"_id": 0, "id": 1, "title": 1, "city": 1, "price": 1, "listing_type": 1, "images": 1, "bedrooms": 1})
            out["property"] = p
        return out

    @router.post("/events/{event_id}/rsvp")
    async def rsvp(event_id: str, data: RsvpIn, user: dict = Depends(get_current_user)):
        ev = await db.events.find_one({"id": event_id}, {"_id": 0})
        ensure(ev is not None and ev.get("status") != "hidden", 404, "Event not found")
        ensure(await _can_see_event(ev, user), 403, "This event is private")
        if data.status == "going" and ev.get("capacity"):
            going = await db.event_rsvps.count_documents({"event_id": event_id, "status": "going", "user_id": {"$ne": user["id"]}})
            ensure(going < ev["capacity"], 409, "This event is full")
        await db.event_rsvps.update_one({"event_id": event_id, "user_id": user["id"]}, {"$set": {"status": data.status, "updated_at": now()}, "$setOnInsert": {"created_at": now()}}, upsert=True)
        if ev.get("conversation_id"):
            op = "$addToSet" if data.status in ("going", "maybe") else "$pull"
            await db.conversations.update_one({"id": ev["conversation_id"]}, {op: {"participant_ids": user["id"]}})
        if data.status == "going":
            await db.analytics_events.insert_one({"id": new_id(), "name": "event_rsvp", "user_id": user["id"], "props": {"event_id": event_id}, "created_at": now()})
        return {"ok": True, "status": data.status, "conversation_id": ev.get("conversation_id") if data.status in ("going", "maybe") else None}

    @router.post("/events/{event_id}/cancel")
    async def cancel_event(event_id: str, user: dict = Depends(get_current_user)):
        ev = await db.events.find_one({"id": event_id}, {"_id": 0})
        ensure(ev is not None, 404, "Event not found")
        ensure(ev["host_id"] == user["id"] or user.get("is_admin"), 403, "Only the host can cancel")
        await db.events.update_one({"id": event_id}, {"$set": {"status": "cancelled", "updated_at": now()}})
        goers = await db.event_rsvps.find({"event_id": event_id, "status": {"$in": ["going", "maybe"]}, "user_id": {"$ne": user["id"]}}, {"_id": 0, "user_id": 1}).to_list(5000)
        for g in goers:
            await notify(db, g["user_id"], "EVENT_CANCELLED", f"Cancelled · {ev['title']}", "The host cancelled this event.", {"event_id": event_id})
        return {"ok": True}

    # ─── Places (local map layer — never property markers) ─
    def _place_out(p: dict, me: str) -> dict:
        recs = p.get("recommended_by", [])
        return {**p, "recommended_by": None, "recommendation_count": len(recs), "recommended_by_me": me in recs, "label": "Promoted" if p.get("is_promoted") else None}

    @router.get("/places")
    async def nearby_places(lat: float, lng: float, radius_km: float = Query(3.0, ge=0.2, le=25), category: Optional[str] = None, estate_id: Optional[str] = None, user: dict = Depends(get_current_user)):
        dlat = radius_km / 111.0
        dlng = radius_km / (111.0 * max(0.2, math.cos(math.radians(lat))))
        q: dict = {"status": {"$ne": "hidden"}, "latitude": {"$gte": lat - dlat, "$lte": lat + dlat}, "longitude": {"$gte": lng - dlng, "$lte": lng + dlng}}
        if category:
            q["category"] = category
        my_estates = [m["estate_id"] async for m in db.estate_members.find({"user_id": user["id"], "status": "approved"}, {"_id": 0, "estate_id": 1})]
        # Estate-only amenities are visible to that estate's residents only.
        q["$or"] = [{"is_amenity": {"$ne": True}}, {"is_amenity": True, "estate_id": {"$in": my_estates}}]
        if estate_id:
            q["estate_id"] = estate_id
        rows = await db.places.find(q, {"_id": 0}).limit(200).to_list(200)
        for r in rows:
            r["distance_km"] = round(_km(lat, lng, r["latitude"], r["longitude"]), 2)
        rows.sort(key=lambda r: (-(len(r.get("recommended_by", []))), r["distance_km"]))
        return {"items": [_place_out(r, user["id"]) for r in rows], "categories": list(PLACE_CATEGORIES)}

    @router.post("/places")
    async def add_place(data: PlaceIn, user: dict = Depends(get_current_user)):
        ensure(data.category in PLACE_CATEGORIES, 400, "Unknown category")
        if data.estate_id:
            await _member(data.estate_id, user)
        if data.is_amenity:
            ensure(bool(data.estate_id), 400, "Amenities belong to an estate")
            await _member(data.estate_id, user, manager=True)
        # Dedupe: same name within ~60 m.
        near = await db.places.find_one({"name": {"$regex": f"^{re.escape(data.name.strip())}$", "$options": "i"}, "latitude": {"$gte": data.latitude - 0.0006, "$lte": data.latitude + 0.0006}, "longitude": {"$gte": data.longitude - 0.0006, "$lte": data.longitude + 0.0006}}, {"_id": 0, "id": 1})
        if near:
            return {"ok": True, "place_id": near["id"], "duplicate": True}
        p = {
            "id": new_id(), "name": data.name.strip(), "category": data.category, "latitude": data.latitude, "longitude": data.longitude, "address_label": (data.address_label or "").strip() or None,
            "estate_id": data.estate_id, "is_amenity": data.is_amenity, "is_promoted": False, "added_by": user["id"], "recommended_by": [user["id"]], "notes": [{"user_id": user["id"], "text": data.note.strip(), "at": now()}] if data.note else [],
            "status": "active", "created_at": now(), "updated_at": now(),
        }
        await db.places.insert_one(p)
        await award(db, user["id"], "place_added", 2, {"place_id": p["id"]})
        p.pop("_id", None)
        return {"ok": True, "place_id": p["id"], "place": _place_out(p, user["id"])}

    @router.get("/places/{place_id}")
    async def get_place(place_id: str, user: dict = Depends(get_current_user)):
        p = await db.places.find_one({"id": place_id}, {"_id": 0})
        ensure(p is not None and p.get("status") != "hidden", 404, "Place not found")
        if p.get("is_amenity") and p.get("estate_id"):
            await _member(p["estate_id"], user)
        users = await public_users(db, [n["user_id"] for n in p.get("notes", [])] + p.get("recommended_by", [])[:12])
        verified_residents = 0
        if p.get("estate_id"):
            verified_residents = await db.estate_members.count_documents({"estate_id": p["estate_id"], "status": "approved", "user_id": {"$in": p.get("recommended_by", [])}})
        out = _place_out(p, user["id"])
        out["notes"] = [{**n, "user": users.get(n["user_id"])} for n in p.get("notes", [])]
        out["recommenders"] = [users[u] for u in p.get("recommended_by", [])[:12] if u in users]
        out["verified_resident_recommendations"] = verified_residents
        return out

    @router.post("/places/{place_id}/recommend")
    async def recommend(place_id: str, data: RecommendIn, user: dict = Depends(get_current_user)):
        p = await db.places.find_one({"id": place_id}, {"_id": 0})
        ensure(p is not None, 404, "Place not found")
        if user["id"] in p.get("recommended_by", []) and not data.text:
            await db.places.update_one({"id": place_id}, {"$pull": {"recommended_by": user["id"]}})
            return {"ok": True, "recommended": False}
        upd: dict = {"$addToSet": {"recommended_by": user["id"]}, "$set": {"updated_at": now()}}
        if data.text:
            upd["$push"] = {"notes": {"$each": [{"user_id": user["id"], "text": data.text.strip(), "at": now()}], "$slice": -50}}
        await db.places.update_one({"id": place_id}, upd)
        if p.get("added_by") and p["added_by"] != user["id"] and len(p.get("recommended_by", [])) + 1 >= 2:
            await award(db, p["added_by"], "place_recommended", 1, {"place_id": place_id})
        return {"ok": True, "recommended": True}

    # ─── Service requests (maintenance → tracked workflow) ─
    async def _sr_out(rows: list[dict], me: str, is_mgr: bool) -> list[dict]:
        users = await public_users(db, [r["reporter_id"] for r in rows] + [u.get("by") for r in rows for u in r.get("updates", [])])
        out = []
        for r in rows:
            item = {**r, "reporter": users.get(r["reporter_id"]) if (is_mgr or r["reporter_id"] == me) else None, "updates": [{**u, "user": users.get(u.get("by"))} for u in r.get("updates", [])], "is_mine": r["reporter_id"] == me}
            out.append(item)
        return out

    @router.get("/estates/{estate_id}/service-requests")
    async def list_service_requests(estate_id: str, scope: Literal["mine", "all"] = "mine", user: dict = Depends(get_current_user)):
        await _member(estate_id, user)
        m = await _membership(estate_id, user["id"])
        is_mgr = bool(user.get("is_admin")) or ((m or {}).get("role") == "manager")
        q: dict = {"estate_id": estate_id}
        if scope == "mine" or not is_mgr:
            q["reporter_id"] = user["id"]
        rows = await db.service_requests.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)
        return {"items": await _sr_out(rows, user["id"], is_mgr), "is_manager": is_mgr, "categories": list(SERVICE_CATEGORIES)}

    @router.post("/service-requests")
    async def create_service_request(data: ServiceRequestIn, user: dict = Depends(get_current_user)):
        e = await _member(data.estate_id, user)
        ensure(data.category in SERVICE_CATEGORIES, 400, "Unknown category")
        doc = {
            "id": new_id(), "estate_id": data.estate_id, "reporter_id": user["id"], "category": data.category, "title": data.title.strip(), "description": data.description.strip(),
            "location_label": (data.location_label or "").strip() or None, "photos": data.photos[:5], "urgent": data.urgent, "status": "open", "fixa_item_id": None, "fixa_booking_id": None,
            "updates": [{"by": user["id"], "status": "open", "note": "Reported", "at": now()}], "created_at": now(), "updated_at": now(),
        }
        await db.service_requests.insert_one(doc)
        managers = await db.estate_members.find({"estate_id": data.estate_id, "role": "manager", "status": "approved"}, {"_id": 0, "user_id": 1}).to_list(10)
        for mg in managers:
            await notify(db, mg["user_id"], "SERVICE_REQUEST", f"{'URGENT · ' if data.urgent else ''}{data.category.title()} · {e['name']}", doc["title"], {"service_request_id": doc["id"], "estate_id": data.estate_id})
        doc.pop("_id", None)
        return (await _sr_out([doc], user["id"], False))[0]

    @router.get("/service-requests/{sr_id}")
    async def get_service_request(sr_id: str, user: dict = Depends(get_current_user)):
        r = await db.service_requests.find_one({"id": sr_id}, {"_id": 0})
        ensure(r is not None, 404, "Request not found")
        await _member(r["estate_id"], user)
        m = await _membership(r["estate_id"], user["id"])
        is_mgr = bool(user.get("is_admin")) or ((m or {}).get("role") == "manager")
        ensure(is_mgr or r["reporter_id"] == user["id"], 403, "You can only view your own requests")
        out = (await _sr_out([r], user["id"], is_mgr))[0]
        out["can_manage"] = is_mgr
        if r.get("fixa_item_id"):
            out["fixa_provider"] = await db.marketplace.find_one({"id": r["fixa_item_id"]}, {"_id": 0, "id": 1, "name": 1, "seller_name": 1, "subcategory": 1, "image": 1, "rating": 1})
        return out

    @router.post("/service-requests/{sr_id}/update")
    async def update_service_request(sr_id: str, data: ServiceUpdateIn, user: dict = Depends(get_current_user)):
        r = await db.service_requests.find_one({"id": sr_id}, {"_id": 0})
        ensure(r is not None, 404, "Request not found")
        m = await _membership(r["estate_id"], user["id"])
        is_mgr = bool(user.get("is_admin")) or ((m or {}).get("role") == "manager" and m.get("status") == "approved")
        if not is_mgr:
            # Reporters may only close their own request.
            ensure(r["reporter_id"] == user["id"] and data.status == "closed", 403, "Only estate management can update this request")
        upd: dict = {"status": data.status, "updated_at": now()}
        if data.fixa_item_id:
            prov = await db.marketplace.find_one({"id": data.fixa_item_id, "category": "services"}, {"_id": 0, "id": 1})
            ensure(prov is not None, 404, "FIXA provider not found")
            upd["fixa_item_id"] = data.fixa_item_id
        await db.service_requests.update_one({"id": sr_id}, {"$set": upd, "$push": {"updates": {"by": user["id"], "status": data.status, "note": (data.note or "").strip() or None, "at": now()}}})
        if r["reporter_id"] != user["id"]:
            await notify(db, r["reporter_id"], "SERVICE_REQUEST_UPDATE", f"{r['title']} · {data.status.replace('_', ' ').title()}", data.note or "Estate management updated your request.", {"service_request_id": sr_id, "estate_id": r["estate_id"]})
        return {"ok": True, "status": data.status}

    # ─── Uploads (proof of residence · service-request photos) ─
    @router.post("/uploads")
    async def upload_image(data: UploadIn, user: dict = Depends(get_current_user)):
        b64 = data.data_url.split(",", 1)[1] if data.data_url.startswith("data:") else data.data_url
        ensure(int(len(b64) * 0.75) <= 5 * 1024 * 1024, 413, "Image too large (max 5 MB)")
        from object_storage import upload_photo_base64
        path = await upload_photo_base64(user["id"], data.data_url)
        return {"url": f"/api/files/{path}", "path": path}

    # ─── Neighbours home (one call for the hub screen) ───
    @router.get("/home")
    async def neighbours_home(user: dict = Depends(get_current_user)):
        ms = await db.estate_members.find({"user_id": user["id"], "status": {"$in": ["approved", "pending"]}}, {"_id": 0}).to_list(10)
        est_ids = [m["estate_id"] for m in ms]
        ests = {e["id"]: e async for e in db.estates.find({"id": {"$in": est_ids}}, ESTATE_PUBLIC)}
        estates = []
        for m in ms:
            e = ests.get(m["estate_id"])
            if e:
                estates.append(_estate_out(e, m, await _estate_counts(e["id"]) if m["status"] == "approved" else None))
        approved_ids = [m["estate_id"] for m in ms if m["status"] == "approved"]
        conns = await connection_ids(db, user["id"])
        pending_in = await db.connections.count_documents({"addressee_id": user["id"], "status": "pending"})
        ev_q = {"status": {"$ne": "hidden"}, "starts_at": {"$gte": now() - timedelta(hours=3)}, "$or": [{"audience": "public"}, {"estate_id": {"$in": approved_ids}, "audience": "estate"}, {"host_id": {"$in": list(conns)}, "audience": "connections"}, {"host_id": user["id"]}]}
        events = await db.events.find(ev_q, {"_id": 0}).sort("starts_at", 1).limit(5).to_list(5)
        colls = await db.shared_collections.find({"member_ids": user["id"]}, {"_id": 0}).sort("updated_at", -1).limit(4).to_list(4)
        users = await public_users(db, list(conns)[:8] + [m for c in colls for m in c.get("member_ids", [])])
        questions = []
        if approved_ids:
            qrows = await db.estate_posts.find({"estate_id": {"$in": approved_ids}, "type": "question", "status": "active", "answers_count": 0}, {"_id": 0}).sort("created_at", -1).limit(3).to_list(3)
            qusers = await public_users(db, [q["author_id"] for q in qrows])
            questions = [{**q, "author": qusers.get(q["author_id"]), "estate_name": ests.get(q["estate_id"], {}).get("name"), "upvotes": None} for q in qrows]
        notices = []
        if approved_ids:
            nrows = await db.estate_posts.find({"estate_id": {"$in": approved_ids}, "is_official": True, "status": "active"}, {"_id": 0}).sort("created_at", -1).limit(2).to_list(2)
            notices = [{**n, "estate_name": ests.get(n["estate_id"], {}).get("name"), "upvotes": None} for n in nrows]
        open_sr = await db.service_requests.count_documents({"reporter_id": user["id"], "status": {"$in": ["open", "acknowledged", "in_progress"]}})
        prof = await db.social_profiles.find_one({"user_id": user["id"]}, {"_id": 0, "handle": 1, "discoverable_by_contacts": 1, "contribution_points": 1, "badges": 1})
        return {
            "estates": estates,
            "connections": {"count": len(conns), "pending_in": pending_in, "preview": [users[c] for c in list(conns)[:8] if c in users]},
            "collections": [{"id": c["id"], "name": c["name"], "emoji": c.get("emoji"), "item_count": c.get("item_count", 0), "member_count": len(c.get("member_ids", [])), "cover_images": c.get("cover_images", [])[:3], "members": [users[m] for m in c.get("member_ids", []) if m in users][:4]} for c in colls],
            "events": await _events_out(events, user["id"]),
            "open_questions": questions,
            "notices": notices,
            "open_service_requests": open_sr,
            "profile": {"handle": (prof or {}).get("handle"), "points": int((prof or {}).get("contribution_points") or 0), "badges": (prof or {}).get("badges") or [], "contacts_on": bool((prof or {}).get("discoverable_by_contacts"))},
            "phone_verified": bool(user.get("phone_verified")),
        }

    # ─── Admin: estate approvals ─────────────────────────
    @router.get("/admin/estates")
    async def admin_estates(status: str = Query("pending"), _: dict = Depends(require_admin)):
        q = {} if status == "ALL" else {"status": status}
        rows = await db.estates.find(q, {"_id": 0}).sort("created_at", -1).limit(200).to_list(200)
        users = await public_users(db, [r.get("created_by") for r in rows if r.get("created_by")])
        for r in rows:
            r["creator"] = users.get(r.get("created_by"))
            r["member_count"] = await db.estate_members.count_documents({"estate_id": r["id"], "status": "approved"})
        return {"items": rows}

    @router.post("/admin/estates/{estate_id}/review")
    async def admin_review_estate(estate_id: str, action: Literal["approve", "reject"] = Query(...), _: dict = Depends(require_admin)):
        e = await db.estates.find_one({"id": estate_id}, {"_id": 0})
        ensure(e is not None, 404, "Estate not found")
        if action == "approve":
            await db.estates.update_one({"id": estate_id}, {"$set": {"status": "active", "updated_at": now()}})
            # The founder becomes an approved resident (manager if they asked for it).
            await db.estate_members.update_one({"estate_id": estate_id, "user_id": e["created_by"]}, {"$set": {"status": "approved", "approved_at": now(), "role": "manager" if e.get("requested_manager") else "resident"}})
            await notify(db, e["created_by"], "ESTATE_APPROVED", f"{e['name']} is live on AMASS", "Share the join code with your neighbours to grow the community.", {"estate_id": estate_id})
        else:
            await db.estates.update_one({"id": estate_id}, {"$set": {"status": "rejected", "updated_at": now()}})
            await notify(db, e["created_by"], "ESTATE_REJECTED", f"{e['name']} wasn't approved", "We couldn't verify this estate. Reply to support if you'd like to add more details.", {"estate_id": estate_id})
        return {"ok": True}

    return router


async def event_reminder_sweep(db) -> int:
    """Send one reminder ~24h and one ~2h before events users said they're going to."""
    sent = 0
    for window, key in ((timedelta(hours=24), "r24"), (timedelta(hours=2), "r2")):
        lo, hi = now() + window - timedelta(minutes=15), now() + window + timedelta(minutes=15)
        async for ev in db.events.find({"status": "active", "starts_at": {"$gte": lo, "$lte": hi}, f"reminders.{key}": {"$ne": True}}, {"_id": 0, "id": 1, "title": 1, "location_label": 1, "starts_at": 1}):
            goers = await db.event_rsvps.find({"event_id": ev["id"], "status": "going"}, {"_id": 0, "user_id": 1}).to_list(5000)
            when = "tomorrow" if key == "r24" else "in about 2 hours"
            for g in goers:
                await notify(db, g["user_id"], "EVENT_REMINDER", f"{ev['title']} · {when}", ev.get("location_label") or "", {"event_id": ev["id"]})
                sent += 1
            await db.events.update_one({"id": ev["id"]}, {"$set": {f"reminders.{key}": True}})
    return sent


async def ensure_community_indexes(db) -> None:
    await db.estates.create_index("id", unique=True)
    await db.estates.create_index("slug", unique=True)
    await db.estates.create_index([("status", 1), ("city", 1)])
    await db.estate_members.create_index([("estate_id", 1), ("user_id", 1)], unique=True)
    await db.estate_members.create_index([("user_id", 1), ("status", 1)])
    await db.estate_posts.create_index([("estate_id", 1), ("status", 1), ("created_at", -1)])
    await db.estate_posts.create_index("id", unique=True)
    await db.estate_post_replies.create_index([("post_id", 1), ("created_at", 1)])
    await db.estate_groups.create_index("id", unique=True)
    await db.events.create_index("id", unique=True)
    await db.events.create_index([("estate_id", 1), ("starts_at", 1)])
    await db.events.create_index([("audience", 1), ("starts_at", 1)])
    await db.event_rsvps.create_index([("event_id", 1), ("user_id", 1)], unique=True)
    await db.places.create_index("id", unique=True)
    await db.places.create_index([("latitude", 1), ("longitude", 1)])
    await db.service_requests.create_index("id", unique=True)
    await db.service_requests.create_index([("estate_id", 1), ("status", 1), ("created_at", -1)])
