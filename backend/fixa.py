"""
FIXA — verified home-service providers. No tokens anywhere: browsing, contact details and bookings are free.

  • Providers are `services` rows in `marketplace` (the seed data lives there too). Registered providers carry
    `seller_id` = their user id and a `fixa_status`: pending → verified (by AMASS Admin) | rejected; a verified
    provider can later be suspended (admin) or hidden (automatically after 3 open reports from different users).
    Only visible providers (no status, or `verified`) appear to customers.
  • Join FIXA: `POST /api/fixa/apply` creates the pending profile for the categories the pro belongs to and tells
    the admins. `GET /api/fixa/me` is the provider's own view (status, profile, stats); `PUT /api/fixa/me` edits it.
  • Jobs: bookings made by customers (`POST /api/marketplace/fixa/book`, server.py) show up for the provider under
    `GET /api/fixa/jobs`; the provider confirms / declines, the customer marks done + rates (server.py).
  • Reports: `POST /api/fixa/providers/{id}/report` — every report notifies the admins; the 3rd open report from a
    third distinct user hides the provider until an admin reinstates them.
  • Reputation only: jobs done, rating, badges. Nothing is earned or spent.
"""
from __future__ import annotations

import asyncio
import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

logger = logging.getLogger("amass.fixa")

HIDDEN_STATUSES = ("pending", "rejected", "suspended", "hidden")
AUTO_HIDE_REPORTS = 3
MAX_WORK_PHOTOS = 5  # gallery on the pro's public profile

# Curated trade list for the Join FIXA form (DB subcategories are merged in).
FIXA_CATEGORIES = [
    "Plumbing", "Electrical", "AC Repair", "Carpentry", "Painting", "Tiling", "Cleaning", "Movers", "Interior Design",
    "Solar", "CCTV & Security", "Generator", "Roofing", "Gardening", "Pest Control", "Welding", "Pool Maintenance",
    "POP Ceiling", "Renovation", "Handyman", "Laundry", "Architect", "Surveyor", "Engineer", "Valuer", "Legal / Title",
]

REPORT_REASONS = {
    "no_show": "Didn't show up",
    "poor_work": "Poor quality work",
    "overcharging": "Overcharged / hidden fees",
    "unsafe": "Unsafe or unprofessional behaviour",
    "fraud": "Scam or fraud",
    "other": "Something else",
}

# Reputation badges — earned automatically from real activity (AMASS Verified is set by the admin on approval).
BADGE_RULES: list[dict[str, Any]] = [
    {"name": "AMASS Verified", "icon": "shield-checkmark", "how": "Approved by AMASS Admin", "auto": False},
    {"name": "Rising", "icon": "trending-up", "how": "5 jobs completed on FIXA", "auto": True, "min_jobs": 5},
    {"name": "Top Pro", "icon": "ribbon", "how": "4.8★ or better across 20+ jobs", "auto": True, "min_jobs": 20, "min_rating": 4.8},
    {"name": "Veteran", "icon": "medal", "how": "100 jobs completed on FIXA", "auto": True, "min_jobs": 100},
]
AUTO_BADGE_NAMES = {b["name"] for b in BADGE_RULES if b["auto"]}


def auto_badges(existing: list[str], jobs: int, rating: Optional[float]) -> list[str]:
    """Keep every hand-given badge (seeded or admin) and recompute the automatic ones from jobs + rating."""
    kept = [b for b in (existing or []) if b not in AUTO_BADGE_NAMES]
    earned = [b["name"] for b in BADGE_RULES if b["auto"] and jobs >= b["min_jobs"] and (rating or 0) >= b.get("min_rating", 0)]
    return kept + earned


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()


def _digits(raw: Optional[str]) -> str:
    return re.sub(r"[^\d+]", "", raw or "")


# ─── Models ──────────────────────────────────────────────────────────────────
class ApplyIn(BaseModel):
    business_name: str = Field(min_length=2, max_length=80)
    categories: list[str] = Field(min_length=1, max_length=5)
    city: str = Field(min_length=2, max_length=80)
    service_areas: list[str] = Field(default_factory=list, max_length=10)
    phone: str = Field(min_length=7, max_length=20)
    whatsapp: Optional[str] = Field(default=None, max_length=20)
    years_experience: int = Field(default=0, ge=0, le=60)
    bio: str = Field(default="", max_length=600)
    image: Optional[str] = None
    work_photos: list[str] = Field(default_factory=list, max_length=MAX_WORK_PHOTOS)


class ReportIn(BaseModel):
    reason: Literal["no_show", "poor_work", "overcharging", "unsafe", "fraud", "other"]
    details: Optional[str] = Field(default=None, max_length=600)
    booking_id: Optional[str] = None


class AdminNoteIn(BaseModel):
    note: Optional[str] = Field(default=None, max_length=400)


class ResolveIn(BaseModel):
    outcome: Literal["resolved", "dismissed"] = "resolved"
    note: Optional[str] = Field(default=None, max_length=400)
    reinstate: bool = False


# ─── Shapes ──────────────────────────────────────────────────────────────────
def provider_card(doc: dict) -> dict:
    """Card for lists and the Feeds rail — contact included (FIXA is free)."""
    name = doc.get("seller_name") or doc.get("name") or "FIXA provider"
    initials = "".join(p[0] for p in name.replace("—", " ").split()[:2] if p and p[0].isalpha()).upper()
    cats = doc.get("provider_categories") or ([doc.get("subcategory")] if doc.get("subcategory") else [])
    return {
        "id": doc["id"],
        "display_name": name.split("—")[0].strip(),
        "initials": initials or "FX",
        "category": doc.get("subcategory") or (cats[0] if cats else "Services"),
        "categories": [c for c in cats if c],
        "rating": doc.get("rating"),
        "reviews": doc.get("reviews") or doc.get("seller_reviews") or 0,
        "area": doc.get("location") or doc.get("city"),
        "city": doc.get("city"),
        "verified": bool(doc.get("is_fixa_verified") or doc.get("verified")),
        "badges": doc.get("fixa_badges") or [],
        "years_experience": doc.get("provider_years_experience"),
        "jobs_completed": doc.get("provider_jobs_completed") or 0,
        "image": doc.get("image") or (doc.get("images") or [None])[0],
        "is_boosted": bool(doc.get("is_boosted")),
        "phone": doc.get("seller_phone"),
        "whatsapp": doc.get("seller_whatsapp") or doc.get("seller_phone"),
        "seller_id": doc.get("seller_id"),
        "status": doc.get("fixa_status") or ("verified" if doc.get("is_fixa_verified") else "listed"),
    }


def provider_full(doc: dict) -> dict:
    return {
        **provider_card(doc),
        "bio": doc.get("seller_bio") or doc.get("description") or "",
        "specializations": doc.get("provider_specializations") or [],
        "service_areas": doc.get("provider_service_areas") or [],
        "call_out_from": doc.get("price"),
        "images": [u for u in (doc.get("images") or []) if u],
        "work_photos": [u for u in (doc.get("work_photos") or []) if u][:MAX_WORK_PHOTOS],
        "posted_at": doc.get("posted_at"),
    }


def visible_query(extra: Optional[dict] = None) -> dict:
    q: dict[str, Any] = {"category": "services", "status": {"$nin": ["removed", "paused"]}, "fixa_status": {"$nin": list(HIDDEN_STATUSES)}}
    if extra:
        q.update(extra)
    return q


# ─── Router ──────────────────────────────────────────────────────────────────
def register_fixa_routes(db: AsyncIOMotorDatabase, get_current_user, require_admin, admin_emails: set[str]) -> tuple[APIRouter, APIRouter]:
    router = APIRouter(prefix="/api/fixa", tags=["fixa"])
    admin = APIRouter(prefix="/api/admin/fixa", tags=["fixa-admin"])

    async def _admin_ids() -> list[str]:
        rows = await db.users.find({"$or": [{"is_admin": True}, {"email": {"$in": [e for e in admin_emails]}}]}, {"_id": 0, "id": 1}).to_list(50)
        return [r["id"] for r in rows]

    async def _tell(user_id: Optional[str], kind: str, title: str, body: str, meta: dict, action_url: str, *, push: bool = True):
        if not user_id:
            return
        from notification_center import emit

        try:
            await emit(db, user_id, kind, title, body, meta, action_url=action_url, push=push)
        except Exception as e:  # noqa: BLE001 — never block the action
            logger.warning("fixa notification failed: %s", e)

    async def _tell_admins(kind: str, title: str, body: str, meta: dict, action_url: str):
        for aid in await _admin_ids():
            await _tell(aid, kind, title, body, meta, action_url, push=False)

    async def _mine(user_id: str) -> Optional[dict]:
        return await db.marketplace.find_one({"category": "services", "seller_id": user_id}, {"_id": 0})

    async def _reviews(provider_item_id: str, limit: int = 20) -> list[dict]:
        rows = await db.fixa_bookings.find({"item_id": provider_item_id, "status": "completed", "rating": {"$gte": 1}}, {"_id": 0, "rating": 1, "review": 1, "customer_name": 1, "completed_at": 1, "trade": 1}).sort("completed_at", -1).to_list(limit)
        return [{"rating": r["rating"], "review": r.get("review"), "by": (r.get("customer_name") or "Customer").split(" ")[0], "at": r.get("completed_at"), "trade": r.get("trade")} for r in rows]

    async def _stats(provider_item_id: str) -> dict:
        done = await db.fixa_bookings.count_documents({"item_id": provider_item_id, "status": "completed"})
        pending = await db.fixa_bookings.count_documents({"item_id": provider_item_id, "status": "pending"})
        upcoming = await db.fixa_bookings.count_documents({"item_id": provider_item_id, "status": "confirmed"})
        open_reports = await db.fixa_reports.count_documents({"provider_item_id": provider_item_id, "status": "open"})
        return {"jobs_completed": done, "pending_requests": pending, "upcoming": upcoming, "open_reports": open_reports}

    # ── Browse (free) ────────────────────────────────────────────────────────
    @router.get("/categories")
    async def categories():
        subs = await db.marketplace.distinct("subcategory", visible_query())
        seen = {c.lower(): c for c in FIXA_CATEGORIES}
        for s in subs:
            if s and s.lower() not in seen:
                seen[s.lower()] = s
        return {"categories": sorted(seen.values(), key=str.lower), "report_reasons": REPORT_REASONS, "badge_rules": BADGE_RULES}

    @router.get("/providers")
    async def providers(
        q: Optional[str] = None, subcategory: Optional[str] = None, city: Optional[str] = None, verified: Optional[bool] = None,
        sort: Optional[str] = None, limit: int = 60, user: dict = Depends(get_current_user),
    ):
        query = visible_query()
        if subcategory:
            rx = {"$regex": re.escape(subcategory), "$options": "i"}
            query["$or"] = [{"subcategory": rx}, {"provider_categories": rx}]
        if city:
            crx = {"$regex": re.escape(city), "$options": "i"}
            query.setdefault("$and", []).append({"$or": [{"city": crx}, {"location": crx}, {"provider_service_areas": crx}]})
        if verified is not None:
            query["is_fixa_verified"] = verified
        if q:
            rx = {"$regex": re.escape(q), "$options": "i"}
            query.setdefault("$and", []).append({"$or": [{"name": rx}, {"seller_name": rx}, {"subcategory": rx}, {"provider_categories": rx}, {"tags": rx}, {"provider_specializations": rx}]})
        sort_spec = [("is_boosted", -1), ("rating", -1), ("provider_jobs_completed", -1)] if sort != "newest" else [("posted_at", -1)]
        docs = await db.marketplace.find(query, {"_id": 0}).sort(sort_spec).limit(min(limit, 200)).to_list(200)
        subs = await db.marketplace.distinct("subcategory", visible_query())
        mine = await _mine(user["id"])
        return {"items": [provider_card(d) for d in docs], "count": len(docs), "subcategories": sorted(s for s in subs if s), "my_status": (mine or {}).get("fixa_status") if mine else None}

    @router.get("/providers/{provider_id}")
    async def provider(provider_id: str, user: dict = Depends(get_current_user)):
        d = await db.marketplace.find_one({"id": provider_id, "category": "services"}, {"_id": 0})
        if not d:
            raise HTTPException(404, "Provider not found")
        is_owner = d.get("seller_id") == user["id"]
        if (d.get("fixa_status") in HIDDEN_STATUSES or d.get("status") in ("removed", "paused")) and not (is_owner or user.get("is_admin")):
            raise HTTPException(404, "Provider not found")
        out = provider_full(d)
        out["reviews_list"] = await _reviews(provider_id)
        out["is_owner"] = is_owner
        out["my_open_booking"] = await db.fixa_bookings.find_one({"item_id": provider_id, "user_id": user["id"], "status": {"$in": ["pending", "confirmed"]}}, {"_id": 0})
        out["my_report"] = await db.fixa_reports.find_one({"provider_item_id": provider_id, "reporter_id": user["id"], "status": "open"}, {"_id": 0, "id": 1, "reason": 1, "created_at": 1})
        return out

    # ── Join FIXA / my provider profile ──────────────────────────────────────
    def _profile_fields(body: ApplyIn, user: dict) -> dict:
        cats = []
        for c in body.categories:
            c = c.strip()
            if c and c.lower() not in {x.lower() for x in cats}:
                cats.append(c)
        if not cats:
            raise HTTPException(400, "Pick at least one category")
        phone = _digits(body.phone)
        if len(phone) < 7:
            raise HTTPException(400, "Enter a valid phone number")
        photos: list[str] = []
        for u in body.work_photos:
            u = (u or "").strip()
            if not u:
                continue
            if not (u.startswith("https://") or u.startswith("http://") or u.startswith("/api/")):
                raise HTTPException(400, "Work photos must be uploaded images (links), not raw data")
            if u not in photos:
                photos.append(u)
        photos = photos[:MAX_WORK_PHOTOS]
        return {
            "name": f"{body.business_name.strip()} — {cats[0]}",
            "seller_name": body.business_name.strip(),
            "subcategory": cats[0],
            "provider_categories": cats,
            "city": body.city.strip(),
            "location": body.city.strip(),
            "provider_service_areas": [a.strip() for a in body.service_areas if a.strip()][:10],
            "seller_phone": phone,
            "seller_whatsapp": _digits(body.whatsapp) or phone,
            "provider_years_experience": body.years_experience,
            "seller_bio": body.bio.strip(),
            "description": body.bio.strip(),
            "image": body.image,
            "work_photos": photos,
            "images": ([body.image] if body.image else []) + photos,
            "seller_avatar": body.image or user.get("avatar_url"),
            "tags": ["fixa"],
        }

    @router.post("/apply", status_code=201)
    async def apply(body: ApplyIn, user: dict = Depends(get_current_user)):
        existing = await _mine(user["id"])
        if existing:
            st = existing.get("fixa_status") or "verified"
            if st == "rejected":
                # Re-apply after a rejection: refresh the profile and queue it again.
                await db.marketplace.update_one({"id": existing["id"]}, {"$set": {**_profile_fields(body, user), "fixa_status": "pending", "applied_at": _iso(_now()), "rejection_reason": None, "updated_at": _iso(_now())}})
                await _tell_admins("FIXA_APPLICATION", "FIXA re-application", f"{body.business_name.strip()} re-applied for {', '.join(body.categories)}.", {"provider_item_id": existing["id"]}, "/admin/fixa")
                return {**provider_full(await _mine(user["id"])), "status": "pending"}
            raise HTTPException(409, "You already have a FIXA profile" + (" awaiting verification" if st == "pending" else ""))
        now = _now()
        doc = {
            "id": str(uuid.uuid4()),
            "category": "services",
            "seller_id": user["id"],
            "status": "active",
            "fixa_status": "pending",
            "is_fixa_verified": False,
            "fixa_badges": [],
            "rating": None,
            "reviews": 0,
            "provider_jobs_completed": 0,
            "price": 0,
            "posted_at": _iso(now),
            "applied_at": _iso(now),
            "created_at": _iso(now),
            "updated_at": _iso(now),
            **_profile_fields(body, user),
        }
        await db.marketplace.insert_one(dict(doc))
        await db.users.update_one({"id": user["id"]}, {"$set": {"is_fixa_provider": True}})
        await _tell_admins("FIXA_APPLICATION", "New FIXA application", f"{doc['seller_name']} applied for {', '.join(doc['provider_categories'])} in {doc['city']}.", {"provider_item_id": doc["id"]}, "/admin/fixa")
        await _tell(user["id"], "FIXA_APPLIED", "Application received", "AMASS Admin will verify your FIXA profile. You'll hear from us here.", {"provider_item_id": doc["id"]}, "/fixa/provider", push=False)
        return {**provider_full(doc), "status": "pending"}

    @router.get("/me")
    async def me(user: dict = Depends(get_current_user)):
        d = await _mine(user["id"])
        if not d:
            return {"status": "none", "profile": None, "stats": None}
        return {"status": d.get("fixa_status") or "verified", "profile": provider_full(d), "stats": await _stats(d["id"]), "rejection_reason": d.get("rejection_reason"), "applied_at": d.get("applied_at"), "verified_at": d.get("verified_at"), "hidden_reason": d.get("hidden_reason"), "badge_rules": BADGE_RULES}

    @router.put("/me")
    async def update_me(body: ApplyIn, user: dict = Depends(get_current_user)):
        d = await _mine(user["id"])
        if not d:
            raise HTTPException(404, "You don't have a FIXA profile yet — tap Join FIXA")
        fields = _profile_fields(body, user)
        if not body.image:
            # No photo in the payload = keep the current one (the edit form always sends it when set).
            fields.pop("image", None)
            fields.pop("seller_avatar", None)
            fields["images"] = ([d["image"]] if d.get("image") else []) + fields["work_photos"]
        await db.marketplace.update_one({"id": d["id"]}, {"$set": {**fields, "updated_at": _iso(_now())}})
        d2 = await _mine(user["id"])
        return {"status": d2.get("fixa_status") or "verified", "profile": provider_full(d2)}

    # ── Jobs (provider side) ─────────────────────────────────────────────────
    @router.get("/jobs")
    async def jobs(user: dict = Depends(get_current_user)):
        d = await _mine(user["id"])
        if not d:
            return {"items": [], "stats": None}
        rows = await db.fixa_bookings.find({"item_id": d["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
        return {"items": rows, "stats": await _stats(d["id"])}

    async def _job(job_id: str, user: dict) -> tuple[dict, dict]:
        d = await _mine(user["id"])
        b = await db.fixa_bookings.find_one({"id": job_id}, {"_id": 0})
        if not d or not b or b.get("item_id") != d["id"]:
            raise HTTPException(404, "Job not found")
        return d, b

    @router.post("/jobs/{job_id}/confirm")
    async def confirm_job(job_id: str, body: AdminNoteIn | None = None, user: dict = Depends(get_current_user)):
        d, b = await _job(job_id, user)
        if b.get("status") != "pending":
            raise HTTPException(409, "Only a pending request can be confirmed")
        now = _iso(_now())
        await db.fixa_bookings.update_one({"id": job_id, "status": "pending"}, {"$set": {"status": "confirmed", "confirmed_at": now, "provider_note": (body.note or "").strip() if body else None}})
        await _tell(b["user_id"], "FIXA_BOOKING_CONFIRMED", "Booking confirmed", f"{d.get('seller_name')} confirmed {b.get('scheduled_date')} · {b.get('scheduled_time')}.", {"booking_id": job_id, "provider_item_id": d["id"]}, "/fixa/bookings")
        return {"ok": True, "status": "confirmed"}

    @router.post("/jobs/{job_id}/decline")
    async def decline_job(job_id: str, body: AdminNoteIn | None = None, user: dict = Depends(get_current_user)):
        d, b = await _job(job_id, user)
        if b.get("status") not in ("pending", "confirmed"):
            raise HTTPException(409, "This job can't be declined now")
        now = _iso(_now())
        note = (body.note or "").strip() if body else ""
        await db.fixa_bookings.update_one({"id": job_id}, {"$set": {"status": "declined", "declined_at": now, "provider_note": note or None}})
        await _tell(b["user_id"], "FIXA_BOOKING_DECLINED", "Booking declined", f"{d.get('seller_name')} can't make {b.get('scheduled_date')}.{' ' + note if note else ''} Find another pro on FIXA.", {"booking_id": job_id}, "/fixa")
        return {"ok": True, "status": "declined"}

    # ── Reports ──────────────────────────────────────────────────────────────
    @router.post("/providers/{provider_id}/report", status_code=201)
    async def report(provider_id: str, body: ReportIn, user: dict = Depends(get_current_user)):
        d = await db.marketplace.find_one({"id": provider_id, "category": "services"}, {"_id": 0})
        if not d:
            raise HTTPException(404, "Provider not found")
        if d.get("seller_id") == user["id"]:
            raise HTTPException(400, "You can't report your own profile")
        if await db.fixa_reports.find_one({"provider_item_id": provider_id, "reporter_id": user["id"], "status": "open"}):
            raise HTTPException(409, "You already reported this provider — AMASS Admin is on it")
        now = _now()
        rep = {
            "id": str(uuid.uuid4()),
            "provider_item_id": provider_id,
            "provider_user_id": d.get("seller_id"),
            "provider_name": d.get("seller_name") or d.get("name"),
            "reporter_id": user["id"],
            "reporter_name": user.get("full_name"),
            "reason": body.reason,
            "reason_label": REPORT_REASONS[body.reason],
            "details": (body.details or "").strip() or None,
            "booking_id": body.booking_id,
            "status": "open",
            "created_at": _iso(now),
        }
        await db.fixa_reports.insert_one(dict(rep))
        distinct_reporters = len(await db.fixa_reports.distinct("reporter_id", {"provider_item_id": provider_id, "status": "open"}))
        auto_hidden = False
        if distinct_reporters >= AUTO_HIDE_REPORTS and d.get("fixa_status") not in ("suspended", "hidden"):
            await db.marketplace.update_one({"id": provider_id}, {"$set": {"fixa_status": "hidden", "hidden_at": _iso(now), "hidden_reason": f"{distinct_reporters} open reports"}})
            auto_hidden = True
            await _tell(d.get("seller_id"), "FIXA_PROFILE_HIDDEN", "Your FIXA profile is hidden", "Several customers reported your profile. AMASS Admin is reviewing it — you'll hear from us here.", {"provider_item_id": provider_id}, "/fixa/provider")
        await _tell_admins(
            "FIXA_REPORT", "Provider reported" + (" · auto-hidden" if auto_hidden else ""),
            f"{rep['provider_name']}: {REPORT_REASONS[body.reason]} ({distinct_reporters} open report{'s' if distinct_reporters != 1 else ''}).",
            {"report_id": rep["id"], "provider_item_id": provider_id}, "/admin/fixa?tab=reports",
        )
        return {"ok": True, "report": rep, "auto_hidden": auto_hidden, "open_reports": distinct_reporters}

    # ── Admin ────────────────────────────────────────────────────────────────
    @admin.get("/overview")
    async def overview(_admin=Depends(require_admin)):
        return {
            "pending": await db.marketplace.count_documents({"category": "services", "fixa_status": "pending"}),
            "verified": await db.marketplace.count_documents(visible_query()),
            "hidden": await db.marketplace.count_documents({"category": "services", "fixa_status": {"$in": ["hidden", "suspended"]}}),
            "open_reports": await db.fixa_reports.count_documents({"status": "open"}),
        }

    @admin.get("/applications")
    async def applications(status: str = Query("pending"), _admin=Depends(require_admin)):
        q: dict[str, Any] = {"category": "services"}
        if status == "all":
            q["fixa_status"] = {"$exists": True}
        else:
            q["fixa_status"] = status
        rows = await db.marketplace.find(q, {"_id": 0}).sort("applied_at", -1).to_list(300)
        out = []
        for d in rows:
            u = await db.users.find_one({"id": d.get("seller_id")}, {"_id": 0, "id": 1, "full_name": 1, "email": 1, "phone": 1, "identity_verified": 1}) if d.get("seller_id") else None
            out.append({**provider_full(d), "applied_at": d.get("applied_at"), "verified_at": d.get("verified_at"), "rejection_reason": d.get("rejection_reason"), "hidden_reason": d.get("hidden_reason"), "user": u, "stats": await _stats(d["id"])})
        return {"items": out, "count": len(out)}

    async def _set_status(provider_id: str, status: str, admin_user: dict, extra: Optional[dict] = None) -> dict:
        d = await db.marketplace.find_one({"id": provider_id, "category": "services"}, {"_id": 0})
        if not d:
            raise HTTPException(404, "Provider not found")
        upd = {"fixa_status": status, "updated_at": _iso(_now()), **(extra or {})}
        await db.marketplace.update_one({"id": provider_id}, {"$set": upd})
        await db.fixa_admin_log.insert_one({"id": str(uuid.uuid4()), "provider_item_id": provider_id, "status": status, "by": admin_user["id"], "at": _iso(_now()), **(extra or {})})
        return d

    @admin.post("/applications/{provider_id}/approve")
    async def approve(provider_id: str, body: AdminNoteIn | None = None, admin_user: dict = Depends(require_admin)):
        cur = await db.marketplace.find_one({"id": provider_id, "category": "services"}, {"_id": 0, "fixa_badges": 1, "provider_jobs_completed": 1, "rating": 1})
        if not cur:
            raise HTTPException(404, "Provider not found")
        badges = auto_badges([b for b in (cur.get("fixa_badges") or []) if b != "AMASS Verified"] + ["AMASS Verified"], int(cur.get("provider_jobs_completed") or 0), cur.get("rating"))
        d = await _set_status(provider_id, "verified", admin_user, {"is_fixa_verified": True, "verified_at": _iso(_now()), "verified_by": admin_user["id"], "rejection_reason": None, "fixa_badges": badges})
        await _tell(d.get("seller_id"), "FIXA_VERIFIED", "You're FIXA verified 🎉", f"Your {d.get('subcategory')} profile is live. Homeowners can now find and book you." + (f" Note from admin: {body.note.strip()}" if body and body.note else ""), {"provider_item_id": provider_id}, "/fixa/provider")
        return {"ok": True, "status": "verified"}

    @admin.post("/applications/{provider_id}/reject")
    async def reject(provider_id: str, body: AdminNoteIn | None = None, admin_user: dict = Depends(require_admin)):
        note = (body.note or "").strip() if body else ""
        d = await _set_status(provider_id, "rejected", admin_user, {"is_fixa_verified": False, "rejection_reason": note or None})
        await _tell(d.get("seller_id"), "FIXA_REJECTED", "FIXA application not approved", (note or "We couldn't verify your profile this time.") + " You can update your details and apply again.", {"provider_item_id": provider_id}, "/fixa/provider")
        return {"ok": True, "status": "rejected"}

    @admin.post("/providers/{provider_id}/suspend")
    async def suspend(provider_id: str, body: AdminNoteIn | None = None, admin_user: dict = Depends(require_admin)):
        note = (body.note or "").strip() if body else ""
        d = await _set_status(provider_id, "suspended", admin_user, {"hidden_reason": note or "Suspended by AMASS Admin", "hidden_at": _iso(_now())})
        await _tell(d.get("seller_id"), "FIXA_SUSPENDED", "FIXA profile suspended", note or "Your profile was suspended by AMASS Admin.", {"provider_item_id": provider_id}, "/fixa/provider")
        return {"ok": True, "status": "suspended"}

    @admin.post("/providers/{provider_id}/reinstate")
    async def reinstate(provider_id: str, admin_user: dict = Depends(require_admin)):
        d = await _set_status(provider_id, "verified", admin_user, {"is_fixa_verified": True, "hidden_reason": None, "hidden_at": None})
        await db.fixa_reports.update_many({"provider_item_id": provider_id, "status": "open"}, {"$set": {"status": "resolved", "resolved_at": _iso(_now()), "resolved_by": admin_user["id"], "resolution": "Provider reinstated"}})
        await _tell(d.get("seller_id"), "FIXA_REINSTATED", "Your FIXA profile is live again", "AMASS Admin reviewed the reports and reinstated your profile.", {"provider_item_id": provider_id}, "/fixa/provider")
        return {"ok": True, "status": "verified"}

    @admin.get("/reports")
    async def reports(status: str = Query("open"), _admin=Depends(require_admin)):
        q: dict[str, Any] = {} if status == "all" else {"status": status}
        rows = await db.fixa_reports.find(q, {"_id": 0}).sort("created_at", -1).to_list(300)
        for r in rows:
            p = await db.marketplace.find_one({"id": r["provider_item_id"]}, {"_id": 0, "fixa_status": 1, "is_fixa_verified": 1})
            r["provider_status"] = (p or {}).get("fixa_status") or ("verified" if (p or {}).get("is_fixa_verified") else "listed")
        return {"items": rows, "count": len(rows)}

    @admin.post("/reports/{report_id}/resolve")
    async def resolve(report_id: str, body: ResolveIn, admin_user: dict = Depends(require_admin)):
        r = await db.fixa_reports.find_one({"id": report_id}, {"_id": 0})
        if not r:
            raise HTTPException(404, "Report not found")
        await db.fixa_reports.update_one({"id": report_id}, {"$set": {"status": body.outcome, "resolved_at": _iso(_now()), "resolved_by": admin_user["id"], "resolution": (body.note or "").strip() or None}})
        if body.reinstate:
            await reinstate(r["provider_item_id"], admin_user)
        await _tell(r["reporter_id"], "FIXA_REPORT_RESOLVED", "Thanks for your report", "AMASS Admin reviewed your report" + (f": {body.note.strip()}" if body.note else "."), {"report_id": report_id}, "/fixa", push=False)
        return {"ok": True, "status": body.outcome}

    return router, admin


async def recompute_provider_rating(db: AsyncIOMotorDatabase, provider_item_id: str) -> None:
    """After a rated booking: blend the seeded rating (kept as a base) with real customer ratings."""
    d = await db.marketplace.find_one({"id": provider_item_id}, {"_id": 0, "rating": 1, "reviews": 1, "seed_rating": 1, "seed_reviews": 1, "seller_reviews": 1})
    if not d:
        return
    if "seed_rating" not in d:
        base_r, base_n = d.get("rating"), int(d.get("reviews") or d.get("seller_reviews") or 0)
        await db.marketplace.update_one({"id": provider_item_id}, {"$set": {"seed_rating": base_r, "seed_reviews": base_n if base_r else 0}})
    else:
        base_r, base_n = d.get("seed_rating"), int(d.get("seed_reviews") or 0)
    agg = await db.fixa_bookings.aggregate([{"$match": {"item_id": provider_item_id, "status": "completed", "rating": {"$gte": 1}}}, {"$group": {"_id": None, "n": {"$sum": 1}, "s": {"$sum": "$rating"}}}]).to_list(1)
    n_new, s_new = (int(agg[0]["n"]), float(agg[0]["s"])) if agg else (0, 0.0)
    total_n = (base_n if base_r else 0) + n_new
    total_s = (float(base_r) * base_n if base_r else 0.0) + s_new
    done = await db.fixa_bookings.count_documents({"item_id": provider_item_id, "status": "completed"})
    upd: dict[str, Any] = {"reviews": total_n}
    if total_n:
        upd["rating"] = round(total_s / total_n, 1)
    seed_jobs = (await db.marketplace.find_one({"id": provider_item_id}, {"_id": 0, "seed_jobs": 1, "provider_jobs_completed": 1, "fixa_badges": 1})) or {}
    if "seed_jobs" not in seed_jobs:
        await db.marketplace.update_one({"id": provider_item_id}, {"$set": {"seed_jobs": int(seed_jobs.get("provider_jobs_completed") or 0)}})
        base_jobs = int(seed_jobs.get("provider_jobs_completed") or 0)
    else:
        base_jobs = int(seed_jobs.get("seed_jobs") or 0)
    upd["provider_jobs_completed"] = base_jobs + done
    upd["fixa_badges"] = auto_badges(seed_jobs.get("fixa_badges") or [], upd["provider_jobs_completed"], upd.get("rating", base_r))
    await db.marketplace.update_one({"id": provider_item_id}, {"$set": upd})


async def ensure_fixa_indexes(db: AsyncIOMotorDatabase) -> None:
    try:
        await db.fixa_reports.create_index("id", unique=True)
        await db.fixa_reports.create_index([("provider_item_id", 1), ("status", 1)])
        await db.fixa_reports.create_index([("reporter_id", 1), ("provider_item_id", 1), ("status", 1)])
        await db.fixa_bookings.create_index([("item_id", 1), ("status", 1)])
        await db.fixa_bookings.create_index([("user_id", 1), ("created_at", -1)])
        await db.marketplace.create_index([("category", 1), ("seller_id", 1)])
        await db.marketplace.create_index([("category", 1), ("fixa_status", 1)])
    except Exception as e:  # never block boot
        logger.warning("fixa indexes failed: %s", e)
