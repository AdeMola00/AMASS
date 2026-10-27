"""
Agency teams — one shared CRM for an agency.

Rules (user decisions, Jun 2026):
  • Only AMASS Admin creates an agency and names its Owner (an existing AMASS user).
  • The Owner (and Managers) invite agents BY EMAIL; the invite is accepted in-app. Existing users get an
    in-app notification + email; unknown emails get an email telling them to sign up with that address —
    the invite is waiting for them under My AMASS → Agency team.
  • Team CRM: every lead unlocked by a member is pooled. Owner / Managers see every lead and assign them;
    Agents see only the leads assigned to them (their own unlocks count as assigned to them until moved).

Collections
  agencies        {id, name, owner_id, status active|inactive, created_by, created_at, updated_at}
  agency_members  {id, agency_id, user_id|None, email, role owner|manager|agent, status invited|active|removed|declined,
                   invited_by, invited_at, joined_at, removed_at}
  lead_unlocks    gains `assigned_to` (user id) and `agency_id` (set on first assignment) — see reviews_score_crm.py
"""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timezone
from html import escape
from typing import Literal, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, EmailStr, Field

logger = logging.getLogger("amass.agency")

ROLES = ("owner", "manager", "agent")
MANAGER_ROLES = ("owner", "manager")
MAX_TEAM = 50


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


def _public_base(request: Optional[Request]) -> str:
    base = (os.getenv("PUBLIC_API_BASE") or os.getenv("EXPO_BACKEND_URL") or "").strip()
    if not base and request is not None:
        proto = (request.headers.get("x-forwarded-proto") or request.url.scheme or "https").split(",")[0].strip()
        host = (request.headers.get("x-forwarded-host") or request.headers.get("host") or "").split(",")[0].strip()
        if host and not host.startswith(("localhost", "127.0.0.1", "0.0.0.0")):
            base = f"{proto}://{host}"
    return base.rstrip("/")


# ─── Models ──────────────────────────────────────────────────────────────────
class InviteIn(BaseModel):
    email: EmailStr
    role: Literal["agent", "manager"] = "agent"


class RoleIn(BaseModel):
    role: Literal["agent", "manager"]


class AssignIn(BaseModel):
    assigned_to: Optional[str] = None  # None → unassign


class AgencyCreateIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    owner_email: EmailStr


class AgencyPatchIn(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=80)
    status: Optional[Literal["active", "inactive"]] = None
    owner_email: Optional[EmailStr] = None


# ─── Shared helpers (also used by the personal CRM in reviews_score_crm.py) ──
def public_user(u: Optional[dict]) -> Optional[dict]:
    if not u:
        return None
    return {"id": u.get("id"), "full_name": u.get("full_name"), "avatar_url": u.get("avatar_url"), "email": u.get("email"), "phone": u.get("phone")}


async def active_membership(db: AsyncIOMotorDatabase, user_id: str) -> Optional[dict]:
    """The user's active membership with the agency doc attached, or None."""
    m = await db.agency_members.find_one({"user_id": user_id, "status": "active"}, {"_id": 0})
    if not m:
        return None
    a = await db.agencies.find_one({"id": m["agency_id"], "status": "active"}, {"_id": 0})
    if not a:
        return None
    return {**m, "agency": a}


async def team_user_ids(db: AsyncIOMotorDatabase, agency_id: str) -> list[str]:
    return [m["user_id"] async for m in db.agency_members.find({"agency_id": agency_id, "status": "active", "user_id": {"$ne": None}}, {"_id": 0, "user_id": 1})]


def team_leads_query(agency_id: str, member_ids: list[str]) -> dict:
    return {"$or": [{"agent_id": {"$in": member_ids}}, {"agency_id": agency_id}]}


def my_leads_query(user_id: str) -> dict:
    """Leads that belong to this agent's own pipeline: assigned to them, or their unlocks nobody moved."""
    return {"$or": [{"assigned_to": user_id}, {"agent_id": user_id, "assigned_to": {"$in": [None]}}]}


def unassigned_query(agency_id: str, member_ids: list[str]) -> dict:
    """Pooled leads nobody is working: no explicit assignee and the unlocking agent has left the team."""
    return {"agency_id": agency_id, "assigned_to": {"$in": [None]}, "agent_id": {"$nin": member_ids}}


async def lead_access(db: AsyncIOMotorDatabase, user: dict, lead: dict) -> bool:
    """May this user read/update the lead? Owner of the unlock, its assignee, a manager of the owner's
    agency, or an admin."""
    if user.get("is_admin") or lead.get("agent_id") == user["id"] or lead.get("assigned_to") == user["id"]:
        return True
    me = await active_membership(db, user["id"])
    if not me or me["role"] not in MANAGER_ROLES:
        return False
    if lead.get("agency_id") == me["agency_id"]:
        return True
    return lead.get("agent_id") in await team_user_ids(db, me["agency_id"])


async def hydrate_leads(db: AsyncIOMotorDatabase, leads: list[dict], team_ids: Optional[set[str]] = None) -> list[dict]:
    """Attach property preview, buyer contact, unlocking agent and assignee to raw lead_unlocks docs.

    `assignee` = explicit `assigned_to`, else the unlocking agent (only while they're still on the team
    when `team_ids` is given) — the person the lead sits with right now; None → needs assigning."""
    prop_ids = list({l.get("property_id") for l in leads if l.get("property_id")})
    user_ids = list({u for l in leads for u in (l.get("favorite_user_id"), l.get("user_id"), l.get("agent_id"), l.get("assigned_to")) if u})
    props = await db.properties.find({"id": {"$in": prop_ids}}, {"_id": 0, "id": 1, "title": 1, "images": 1, "price": 1}).to_list(500) if prop_ids else []
    users = await db.users.find({"id": {"$in": user_ids}}, {"_id": 0, "id": 1, "full_name": 1, "avatar_url": 1, "email": 1, "phone": 1}).to_list(500) if user_ids else []
    pmap = {p["id"]: p for p in props}
    umap = {u["id"]: u for u in users}
    out: list[dict] = []
    for l in leads:
        p = pmap.get(l.get("property_id") or "") or {}
        buyer = umap.get(l.get("favorite_user_id") or "") or umap.get(l.get("user_id") or "") or {}
        agent = umap.get(l.get("agent_id") or "")
        if l.get("assigned_to"):
            assignee = umap.get(l["assigned_to"])
        elif team_ids is None or l.get("agent_id") in team_ids:
            assignee = agent
        else:
            assignee = None
        out.append(
            {
                **l,
                "status": l.get("crm_status") or "new",
                "property_title": p.get("title"),
                "property_image": (p.get("images") or [None])[0],
                "property_price": p.get("price"),
                "contact_name": l.get("contact_name") or buyer.get("full_name"),
                "contact_phone": l.get("contact_phone") or buyer.get("phone"),
                "contact_email": l.get("contact_email") or buyer.get("email"),
                "agent": public_user(agent),
                "assignee": public_user(assignee),
            }
        )
    return out


# ─── Router ──────────────────────────────────────────────────────────────────
def register_agency_routes(db: AsyncIOMotorDatabase, require_auth, require_admin) -> tuple[APIRouter, APIRouter]:
    router = APIRouter(prefix="/api/agency", tags=["agency-teams"])
    admin = APIRouter(prefix="/api/admin/agencies", tags=["agency-admin"])

    async def _notify(user_id: Optional[str], kind: str, title: str, body: str, meta: dict, action_url: str) -> None:
        if not user_id:
            return
        try:
            from notification_center import emit

            await emit(db, user_id, kind, title, body, meta, action_url=action_url)
        except Exception as e:  # never fail the action because of a notification
            logger.warning("agency notify failed: %s", e)

    async def _email(to: str, subject: str, html: str) -> None:
        try:
            from auth_security import send_email

            await send_email(to=to, subject=subject, html=html)
        except Exception as e:  # invites still work without email (the in-app invite is the source of truth)
            logger.warning("agency invite email failed for %s: %s", to, e)

    async def _members(agency_id: str) -> list[dict]:
        rows = await db.agency_members.find({"agency_id": agency_id, "status": {"$in": ["active", "invited"]}}, {"_id": 0}).sort("invited_at", 1).to_list(MAX_TEAM * 2)
        ids = [r["user_id"] for r in rows if r.get("user_id")]
        users = {u["id"]: u async for u in db.users.find({"id": {"$in": ids}}, {"_id": 0, "id": 1, "full_name": 1, "avatar_url": 1, "email": 1, "phone": 1})}
        order = {"owner": 0, "manager": 1, "agent": 2}
        out = [{**r, "user": public_user(users.get(r.get("user_id") or ""))} for r in rows]
        out.sort(key=lambda r: (0 if r["status"] == "active" else 1, order.get(r["role"], 9), (r.get("user") or {}).get("full_name") or r.get("email") or ""))
        return out

    async def _require_member(user: dict) -> dict:
        me = await active_membership(db, user["id"])
        if not me:
            raise HTTPException(404, "You're not on an agency team yet")
        return me

    async def _require_manager(user: dict) -> dict:
        me = await _require_member(user)
        if me["role"] not in MANAGER_ROLES:
            raise HTTPException(403, "Only the agency owner or a manager can do that")
        return me

    async def _release_leads(user_id: str, agency_id: str) -> None:
        """Someone left the team: team leads they were working go back to the pool (unassigned). Their own
        unlocks that were never pooled stay with them in their personal CRM."""
        await db.lead_unlocks.update_many(
            {"assigned_to": user_id, "$or": [{"agent_id": {"$ne": user_id}}, {"agency_id": agency_id}]},
            {"$set": {"assigned_to": None}},
        )

    async def _stats(me: dict, user: dict) -> dict:
        ids = await team_user_ids(db, me["agency_id"])
        team_q = team_leads_query(me["agency_id"], ids)
        total = await db.lead_unlocks.count_documents(team_q)
        unassigned = await db.lead_unlocks.count_documents(unassigned_query(me["agency_id"], ids))
        mine = await db.lead_unlocks.count_documents({**team_q, **my_leads_query(user["id"])})
        return {"members": len(ids), "leads_total": total, "unassigned": unassigned, "mine": mine}

    # ── Membership ───────────────────────────────────────────────────────────
    @router.get("/me")
    async def me(user: dict = Depends(require_auth)):
        email = (user.get("email") or "").lower()
        # Invites addressed to this email (sent before the account existed) are bound to the user on first sight.
        if email:
            await db.agency_members.update_many({"email": email, "status": "invited", "user_id": None}, {"$set": {"user_id": user["id"]}})
        invites = await db.agency_members.find({"user_id": user["id"], "status": "invited"}, {"_id": 0}).to_list(20)
        if invites:
            a_ids = [i["agency_id"] for i in invites]
            agencies = {a["id"]: a async for a in db.agencies.find({"id": {"$in": a_ids}, "status": "active"}, {"_id": 0})}
            inviter_ids = [i.get("invited_by") for i in invites if i.get("invited_by")]
            inviters = {u["id"]: u async for u in db.users.find({"id": {"$in": inviter_ids}}, {"_id": 0, "id": 1, "full_name": 1, "avatar_url": 1})}
            invites = [{**i, "agency": agencies.get(i["agency_id"]), "inviter": public_user(inviters.get(i.get("invited_by") or ""))} for i in invites if i["agency_id"] in agencies]
        mem = await active_membership(db, user["id"])
        if not mem:
            return {"agency": None, "membership": None, "members": [], "my_invites": invites, "stats": None}
        return {
            "agency": mem["agency"],
            "membership": {k: v for k, v in mem.items() if k != "agency"},
            "members": await _members(mem["agency_id"]),
            "my_invites": invites,
            "stats": await _stats(mem, user),
        }

    @router.post("/invites", status_code=201)
    async def invite(body: InviteIn, request: Request, user: dict = Depends(require_auth)):
        me = await _require_manager(user)
        if body.role == "manager" and me["role"] != "owner":
            raise HTTPException(403, "Only the owner can invite managers")
        email = body.email.lower().strip()
        if email == (user.get("email") or "").lower():
            raise HTTPException(400, "That's you — you're already on the team")
        active_count = await db.agency_members.count_documents({"agency_id": me["agency_id"], "status": {"$in": ["active", "invited"]}})
        if active_count >= MAX_TEAM:
            raise HTTPException(400, f"Teams are capped at {MAX_TEAM} people")
        target = await db.users.find_one({"email": email}, {"_id": 0, "id": 1, "full_name": 1, "email": 1})
        if target:
            if await active_membership(db, target["id"]):
                raise HTTPException(409, f"{target.get('full_name') or email} is already on an agency team")
        dup = await db.agency_members.find_one({"agency_id": me["agency_id"], "email": email, "status": "invited"}, {"_id": 0, "id": 1})
        if dup:
            raise HTTPException(409, "An invite is already waiting for that email")
        now = _now()
        doc = {
            "id": str(uuid.uuid4()),
            "agency_id": me["agency_id"],
            "user_id": target["id"] if target else None,
            "email": email,
            "role": body.role,
            "status": "invited",
            "invited_by": user["id"],
            "invited_at": _iso(now),
            "joined_at": None,
        }
        await db.agency_members.insert_one(dict(doc))
        agency = me["agency"]
        inviter = user.get("full_name") or "Your agency"
        base = _public_base(request)
        link = f"{base}/agency" if base else ""
        if target:
            await _notify(target["id"], "AGENCY_INVITE", f"Join {agency['name']}", f"{inviter} invited you to the {agency['name']} team as {'a manager' if body.role == 'manager' else 'an agent'}. Accept in My AMASS → Agency team.", {"agency_id": agency["id"], "invite_id": doc["id"]}, "/agency")
            how = "Open AMASS → My AMASS → Agency team and tap Accept."
        else:
            how = f"Create your AMASS account with this email address ({email}), then open My AMASS → Agency team to accept."
        role_label = "a manager" if body.role == "manager" else "an agent"
        from email_theme import p, raw_p, render_email

        html = render_email(
            title=f"You're invited to {agency['name']}",
            kicker="Agency team",
            hero="skyline",
            preheader=f"{inviter} invited you to join {agency['name']} on AMASS as {role_label}.",
            body_html=raw_p(f"{escape(inviter)} invited you to join <b>{escape(agency['name'])}</b> on AMASS as {role_label}. Team leads are shared in one CRM so nothing falls through the cracks.") + p(how),
            cta=("Open AMASS", link) if link.startswith("https://") else None,
            note="If you weren't expecting this, you can ignore this email.",
        )
        await _email(email, f"{inviter} invited you to {agency['name']} on AMASS", html)
        return {**doc, "user": public_user(target)}

    @router.delete("/invites/{invite_id}")
    async def cancel_invite(invite_id: str, user: dict = Depends(require_auth)):
        me = await _require_manager(user)
        res = await db.agency_members.delete_one({"id": invite_id, "agency_id": me["agency_id"], "status": "invited"})
        if not res.deleted_count:
            raise HTTPException(404, "Invite not found")
        return {"ok": True}

    async def _my_invite(invite_id: str, user: dict) -> dict:
        inv = await db.agency_members.find_one({"id": invite_id, "status": "invited"}, {"_id": 0})
        if not inv or (inv.get("user_id") not in (None, user["id"])) or (inv.get("user_id") is None and inv["email"] != (user.get("email") or "").lower()):
            raise HTTPException(404, "Invite not found")
        return inv

    @router.post("/invites/{invite_id}/accept")
    async def accept_invite(invite_id: str, user: dict = Depends(require_auth)):
        inv = await _my_invite(invite_id, user)
        if await active_membership(db, user["id"]):
            raise HTTPException(409, "You're already on an agency team — leave it first")
        agency = await db.agencies.find_one({"id": inv["agency_id"], "status": "active"}, {"_id": 0})
        if not agency:
            raise HTTPException(410, "This agency is no longer active")
        if await db.agency_members.count_documents({"agency_id": agency["id"], "status": "active"}) >= MAX_TEAM:
            raise HTTPException(400, f"This team is full ({MAX_TEAM} people)")
        now = _now()
        # Memberships left behind by a deactivated agency are closed so this one becomes the only active row.
        await db.agency_members.update_many({"user_id": user["id"], "status": "active"}, {"$set": {"status": "removed", "removed_at": _iso(now)}})
        await db.agency_members.update_one({"id": invite_id, "status": "invited"}, {"$set": {"user_id": user["id"], "status": "active", "joined_at": _iso(now)}})
        # Other pending invites for this person are moot now.
        await db.agency_members.update_many({"user_id": user["id"], "status": "invited"}, {"$set": {"status": "declined"}})
        await db.users.update_one({"id": user["id"]}, {"$set": {"is_agent": True, "agency_id": agency["id"], "agency_name": agency["name"]}})
        name = user.get("full_name") or user.get("email")
        for m in await db.agency_members.find({"agency_id": agency["id"], "status": "active", "role": {"$in": list(MANAGER_ROLES)}, "user_id": {"$ne": user["id"]}}, {"_id": 0, "user_id": 1}).to_list(MAX_TEAM):
            await _notify(m["user_id"], "AGENCY_JOINED", f"{name} joined the team", f"{name} accepted the invite to {agency['name']}. Assign them leads from the team CRM.", {"agency_id": agency["id"], "user_id": user["id"]}, "/agency")
        return {"ok": True, "agency": agency, "role": inv["role"]}

    @router.post("/invites/{invite_id}/decline")
    async def decline_invite(invite_id: str, user: dict = Depends(require_auth)):
        await _my_invite(invite_id, user)
        await db.agency_members.update_one({"id": invite_id}, {"$set": {"status": "declined", "user_id": user["id"]}})
        return {"ok": True}

    @router.patch("/members/{member_id}")
    async def change_role(member_id: str, body: RoleIn, user: dict = Depends(require_auth)):
        me = await _require_member(user)
        if me["role"] != "owner":
            raise HTTPException(403, "Only the owner can change roles")
        m = await db.agency_members.find_one({"id": member_id, "agency_id": me["agency_id"], "status": {"$in": ["active", "invited"]}}, {"_id": 0})
        if not m:
            raise HTTPException(404, "Member not found")
        if m["role"] == "owner":
            raise HTTPException(400, "The owner's role can't be changed here — ask AMASS Admin")
        await db.agency_members.update_one({"id": member_id}, {"$set": {"role": body.role}})
        if m.get("user_id") and m["status"] == "active":
            await _notify(m["user_id"], "AGENCY_ROLE", f"You're now {'a manager' if body.role == 'manager' else 'an agent'} at {me['agency']['name']}", "Managers see every team lead and can assign them." if body.role == "manager" else "You'll see the leads assigned to you in the team CRM.", {"agency_id": me["agency_id"]}, "/agency")
        return {"ok": True, "role": body.role}

    @router.delete("/members/{member_id}")
    async def remove_member(member_id: str, user: dict = Depends(require_auth)):
        me = await _require_manager(user)
        m = await db.agency_members.find_one({"id": member_id, "agency_id": me["agency_id"], "status": {"$in": ["active", "invited"]}}, {"_id": 0})
        if not m:
            raise HTTPException(404, "Member not found")
        if m["role"] == "owner":
            raise HTTPException(400, "The owner can't be removed")
        if m.get("user_id") == user["id"]:
            raise HTTPException(400, "Use Leave team to remove yourself")
        if me["role"] == "manager" and m["role"] == "manager":
            raise HTTPException(403, "Only the owner can remove a manager")
        if m["status"] == "invited":
            await db.agency_members.delete_one({"id": member_id})
            return {"ok": True, "removed": "invite"}
        await db.agency_members.update_one({"id": member_id}, {"$set": {"status": "removed", "removed_at": _iso(_now())}})
        await _release_leads(m["user_id"], me["agency_id"])
        await db.users.update_one({"id": m["user_id"]}, {"$unset": {"agency_id": "", "agency_name": ""}})
        await _notify(m["user_id"], "AGENCY_REMOVED", f"You've left {me['agency']['name']}", "You were removed from the agency team. Your own leads stay in your Leads CRM.", {"agency_id": me["agency_id"]}, "/crm")
        return {"ok": True, "removed": "member"}

    @router.post("/leave")
    async def leave(user: dict = Depends(require_auth)):
        # Works for a deactivated agency too (the row would otherwise block future invites).
        m = await db.agency_members.find_one({"user_id": user["id"], "status": "active"}, {"_id": 0})
        if not m:
            raise HTTPException(404, "You're not on an agency team yet")
        agency = await db.agencies.find_one({"id": m["agency_id"]}, {"_id": 0, "status": 1}) or {}
        if m["role"] == "owner" and agency.get("status") == "active":
            raise HTTPException(400, "The owner can't leave — ask AMASS Admin to hand the agency over first")
        await db.agency_members.update_many({"user_id": user["id"], "status": "active"}, {"$set": {"status": "removed", "removed_at": _iso(_now())}})
        await _release_leads(user["id"], m["agency_id"])
        await db.users.update_one({"id": user["id"]}, {"$unset": {"agency_id": "", "agency_name": ""}})
        return {"ok": True}

    # ── Team CRM ─────────────────────────────────────────────────────────────
    @router.get("/leads")
    async def team_leads(
        status: Optional[str] = Query(None, description="new|contacted|…|won|lost|open"),
        assignee: Optional[str] = Query(None, description="me | unassigned | <user_id>"),
        user: dict = Depends(require_auth),
    ):
        me = await _require_member(user)
        ids = await team_user_ids(db, me["agency_id"])
        parts: list[dict] = [team_leads_query(me["agency_id"], ids)]
        if me["role"] not in MANAGER_ROLES:
            parts.append(my_leads_query(user["id"]))
        elif assignee == "me":
            parts.append(my_leads_query(user["id"]))
        elif assignee == "unassigned":
            parts.append(unassigned_query(me["agency_id"], ids))
        elif assignee:
            parts.append({"$or": [{"assigned_to": assignee}, {"agent_id": assignee, "assigned_to": {"$in": [None]}}]})
        if status == "open":
            parts.append({"crm_status": {"$nin": ["won", "lost"]}})
        elif status == "new":
            parts.append({"$or": [{"crm_status": "new"}, {"crm_status": {"$exists": False}}, {"crm_status": None}]})
        elif status:
            parts.append({"crm_status": status})
        leads = await db.lead_unlocks.find({"$and": parts}, {"_id": 0}).sort("created_at", -1).to_list(500)
        return {"role": me["role"], "items": await hydrate_leads(db, leads, set(ids))}

    @router.patch("/leads/{lead_id}/assign")
    async def assign_lead(lead_id: str, body: AssignIn = Body(...), user: dict = Depends(require_auth)):
        me = await _require_manager(user)
        lead = await db.lead_unlocks.find_one({"id": lead_id}, {"_id": 0})
        if not lead:
            raise HTTPException(404, "Lead not found")
        ids = await team_user_ids(db, me["agency_id"])
        if lead.get("agent_id") not in ids and lead.get("agency_id") != me["agency_id"]:
            raise HTTPException(403, "That lead isn't in your team's pool")
        if body.assigned_to is not None and body.assigned_to not in ids:
            raise HTTPException(400, "Pick someone who is on the team")
        now = _now()
        await db.lead_unlocks.update_one(
            {"id": lead_id},
            {"$set": {"assigned_to": body.assigned_to, "agency_id": me["agency_id"], "assigned_by": user["id"], "assigned_at": now, "updated_at": now}},
        )
        if body.assigned_to and body.assigned_to != user["id"]:
            prop = await db.properties.find_one({"id": lead.get("property_id") or ""}, {"_id": 0, "title": 1}) or {}
            buyer = await db.users.find_one({"id": lead.get("favorite_user_id") or ""}, {"_id": 0, "full_name": 1}) or {}
            who = buyer.get("full_name") or "A buyer"
            await _notify(body.assigned_to, "LEAD_ASSIGNED", "New lead assigned to you", f"{user.get('full_name') or 'Your manager'} assigned {who}{' · ' + prop['title'] if prop.get('title') else ''} to you. Follow up from the team CRM.", {"lead_id": lead_id, "agency_id": me["agency_id"]}, f"/agency/leads?lead={lead_id}")
        fresh = await db.lead_unlocks.find_one({"id": lead_id}, {"_id": 0})
        return {"ok": True, "lead": (await hydrate_leads(db, [fresh], set(ids)))[0]}

    # ── Admin ────────────────────────────────────────────────────────────────
    async def _admin_shape(a: dict) -> dict:
        owner = await db.users.find_one({"id": a["owner_id"]}, {"_id": 0, "id": 1, "full_name": 1, "avatar_url": 1, "email": 1, "phone": 1})
        members = await db.agency_members.count_documents({"agency_id": a["id"], "status": "active"})
        invited = await db.agency_members.count_documents({"agency_id": a["id"], "status": "invited"})
        ids = await team_user_ids(db, a["id"])
        leads = await db.lead_unlocks.count_documents(team_leads_query(a["id"], ids)) if ids else 0
        return {**a, "owner": public_user(owner), "members": members, "invited": invited, "leads": leads}

    @admin.get("")
    async def list_agencies(_admin: dict = Depends(require_admin)):
        rows = await db.agencies.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
        return {"items": [await _admin_shape(a) for a in rows]}

    @admin.post("", status_code=201)
    async def create_agency(body: AgencyCreateIn, admin_user: dict = Depends(require_admin)):
        owner = await db.users.find_one({"email": body.owner_email.lower()}, {"_id": 0, "id": 1, "full_name": 1, "email": 1})
        if not owner:
            raise HTTPException(404, "No AMASS account with that email — the owner must sign up first")
        if await active_membership(db, owner["id"]):
            raise HTTPException(409, f"{owner.get('full_name') or owner['email']} already belongs to an agency")
        now = _now()
        # Close any membership left behind by a deactivated agency.
        await db.agency_members.update_many({"user_id": owner["id"], "status": "active"}, {"$set": {"status": "removed", "removed_at": _iso(now)}})
        agency = {"id": str(uuid.uuid4()), "name": body.name.strip(), "owner_id": owner["id"], "status": "active", "created_by": admin_user["id"], "created_at": _iso(now), "updated_at": _iso(now)}
        await db.agencies.insert_one(dict(agency))
        await db.agency_members.insert_one({"id": str(uuid.uuid4()), "agency_id": agency["id"], "user_id": owner["id"], "email": owner["email"].lower(), "role": "owner", "status": "active", "invited_by": admin_user["id"], "invited_at": _iso(now), "joined_at": _iso(now)})
        await db.users.update_one({"id": owner["id"]}, {"$set": {"is_agent": True, "agency_id": agency["id"], "agency_name": agency["name"]}})
        await _notify(owner["id"], "AGENCY_CREATED", f"{agency['name']} is live on AMASS", "AMASS Admin made you the owner. Invite your agents by email and share one CRM.", {"agency_id": agency["id"]}, "/agency")
        return await _admin_shape(agency)

    @admin.patch("/{agency_id}")
    async def patch_agency(agency_id: str, body: AgencyPatchIn, admin_user: dict = Depends(require_admin)):
        a = await db.agencies.find_one({"id": agency_id}, {"_id": 0})
        if not a:
            raise HTTPException(404, "Agency not found")
        updates: dict = {}
        if body.name:
            updates["name"] = body.name.strip()
        if body.status:
            updates["status"] = body.status
        if body.owner_email:
            new_owner = await db.users.find_one({"email": body.owner_email.lower()}, {"_id": 0, "id": 1, "email": 1, "full_name": 1})
            if not new_owner:
                raise HTTPException(404, "No AMASS account with that email")
            if new_owner["id"] != a["owner_id"]:
                other = await active_membership(db, new_owner["id"])
                if other and other["agency_id"] != agency_id:
                    raise HTTPException(409, "That person belongs to another agency")
                now = _iso(_now())
                await db.agency_members.update_one({"agency_id": agency_id, "user_id": a["owner_id"], "status": "active"}, {"$set": {"role": "manager"}})
                # One row per person: close memberships from deactivated agencies, drop pending invites here.
                await db.agency_members.update_many({"user_id": new_owner["id"], "status": "active", "agency_id": {"$ne": agency_id}}, {"$set": {"status": "removed", "removed_at": now}})
                await db.agency_members.delete_many({"agency_id": agency_id, "status": "invited", "$or": [{"user_id": new_owner["id"]}, {"email": new_owner["email"].lower()}]})
                existing = await db.agency_members.find_one({"agency_id": agency_id, "user_id": new_owner["id"], "status": "active"}, {"_id": 0, "id": 1})
                if existing:
                    await db.agency_members.update_one({"id": existing["id"]}, {"$set": {"role": "owner"}})
                else:
                    await db.agency_members.insert_one({"id": str(uuid.uuid4()), "agency_id": agency_id, "user_id": new_owner["id"], "email": new_owner["email"].lower(), "role": "owner", "status": "active", "invited_by": admin_user["id"], "invited_at": now, "joined_at": now})
                await db.users.update_one({"id": new_owner["id"]}, {"$set": {"is_agent": True, "agency_id": agency_id, "agency_name": updates.get("name") or a["name"]}})
                updates["owner_id"] = new_owner["id"]
        if not updates:
            raise HTTPException(400, "Nothing to update")
        updates["updated_at"] = _iso(_now())
        await db.agencies.update_one({"id": agency_id}, {"$set": updates})
        if "name" in updates:
            ids = await team_user_ids(db, agency_id)
            await db.users.update_many({"id": {"$in": ids}}, {"$set": {"agency_name": updates["name"]}})
        return await _admin_shape(await db.agencies.find_one({"id": agency_id}, {"_id": 0}))

    return router, admin


async def ensure_agency_indexes(db: AsyncIOMotorDatabase) -> None:
    try:
        await db.agencies.create_index("id", unique=True)
        await db.agency_members.create_index("id", unique=True)
        await db.agency_members.create_index([("agency_id", 1), ("status", 1)])
        await db.agency_members.create_index([("user_id", 1), ("status", 1)])
        await db.agency_members.create_index([("email", 1), ("status", 1)])
        await db.lead_unlocks.create_index("assigned_to")
        await db.lead_unlocks.create_index("agency_id")
        # Older unlocks were written without an `id`; the CRM needs one to update them.
        await db.lead_unlocks.update_many({"id": {"$exists": False}}, [{"$set": {"id": {"$toString": "$_id"}}}])
    except Exception as e:  # never block boot
        logger.warning("agency indexes failed: %s", e)
