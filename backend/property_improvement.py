"""AMASS Property Improvement, Inspection, Finance & Renovation Projects.

Adds a whole new pillar to the AMASS ecosystem without touching existing modules:

  ┌────────── User journey ──────────┐
  │  Improve My Property                                              │
  │     ├─ 1. Inspection Request (photos, videos, renovation goals)   │
  │     ├─ 2. Inspection Report (admin fills, user views)             │
  │     ├─ 3. Finance Application (partner bank routing, AMASS = facilitator)
  │     └─ 4. Renovation Project (9-step tracker, BOQ, FIXA + Brands)  │
  └───────────────────────────────────┘

All records are user-owned + admin-manageable via the same endpoints so the
external Admin Portal can reuse them.

Design principles
─────────────────
- Reuse Property, Marketplace and Wallet infrastructure — never fork data.
- Base64 images/videos (matches AMASS pattern; migrate to S3 later).
- MongoDB free-form docs so the shape can evolve without migrations.
- Every state-change emits an in-app `notifications` doc (push wiring later).
- Server-owned Health Score = simple weighted formula (see `_compute_health_score`).
- Future-ready: mortgage, insurance, escrow, smart-contract hooks left as
  optional fields in the models — populated when those services come online.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from motor.motor_asyncio import AsyncIOMotorDatabase


# ─── Static config ──────────────────────────────────────────────
PROJECT_MILESTONES: List[dict] = [
    {"key": "inspection_scheduled",  "label": "Inspection Scheduled",  "icon": "calendar"},
    {"key": "inspection_completed",  "label": "Inspection Completed",  "icon": "clipboard"},
    {"key": "loan_submitted",        "label": "Loan Submitted",        "icon": "document-text"},
    {"key": "loan_approved",         "label": "Loan Approved",         "icon": "checkmark-circle"},
    {"key": "contractor_assigned",   "label": "Contractor Assigned",   "icon": "hammer"},
    {"key": "materials_ordered",     "label": "Materials Ordered",     "icon": "cube"},
    {"key": "construction_progress", "label": "Construction In Progress","icon": "construct"},
    {"key": "quality_inspection",    "label": "Quality Inspection",    "icon": "shield-checkmark"},
    {"key": "project_completed",     "label": "Project Completed",     "icon": "trophy"},
]
MILESTONE_KEYS = [m["key"] for m in PROJECT_MILESTONES]

PARTNER_BANKS: List[dict] = [
    {
        "id": "access", "name": "Access Bank", "logo": None,
        "products": ["renovation_loan", "home_improvement", "mortgage_referral"],
        "rate_apr_range": [11.5, 22.0], "max_tenor_months": 36,
    },
    {
        "id": "gtbank", "name": "GTBank", "logo": None,
        "products": ["renovation_loan", "property_completion", "home_improvement"],
        "rate_apr_range": [12.0, 24.0], "max_tenor_months": 48,
    },
    {
        "id": "first_bank", "name": "First Bank", "logo": None,
        "products": ["renovation_loan", "rebuild_loan", "rental_upgrade"],
        "rate_apr_range": [10.5, 20.0], "max_tenor_months": 60,
    },
    {
        "id": "uba", "name": "UBA", "logo": None,
        "products": ["renovation_loan", "home_improvement", "mortgage_referral"],
        "rate_apr_range": [11.0, 23.5], "max_tenor_months": 36,
    },
]

FINANCE_PRODUCTS: List[dict] = [
    {"id": "renovation_loan",     "name": "Renovation Loan",         "description": "Full renovation of an existing property."},
    {"id": "property_completion", "name": "Property Completion Loan","description": "Complete a partially-built property."},
    {"id": "rebuild_loan",        "name": "Rebuild Loan",            "description": "Demolish and rebuild an existing property."},
    {"id": "rental_upgrade",      "name": "Rental Upgrade Loan",     "description": "Upgrade a property for rental income boost."},
    {"id": "mortgage_referral",   "name": "Mortgage Referral",       "description": "Get matched to a partner-bank mortgage."},
    {"id": "home_improvement",    "name": "Home Improvement Financing","description": "General home improvement financing."},
]

# Simple weighted formula for the Property Health Score (0-100).
# Higher is better. Each category is admin-rated 1-5 (or None if not observed).
HEALTH_WEIGHTS = {
    "structural":  0.25,
    "roof":        0.15,
    "electrical":  0.15,
    "plumbing":    0.15,
    "exterior":    0.10,
    "interior":    0.10,
    "condition":   0.10,
}


def _compute_health_score(ratings: dict) -> int:
    """Return 0-100 given optional 1-5 ratings for each HEALTH_WEIGHTS key."""
    total_weight = 0.0
    score = 0.0
    for k, w in HEALTH_WEIGHTS.items():
        v = ratings.get(k)
        if v is None:
            continue
        try:
            v = max(1, min(5, int(v)))
        except Exception:
            continue
        score += (v / 5.0) * w
        total_weight += w
    if total_weight == 0:
        return 0
    return round((score / total_weight) * 100)


# ─── Pydantic ───────────────────────────────────────────────────
InspectionStatus = Literal["requested", "scheduled", "in_progress", "completed", "cancelled"]
FinanceStatus = Literal["draft", "submitted", "under_review", "approved", "rejected", "disbursed", "cancelled"]
ProjectStatus = Literal["planned", "active", "on_hold", "completed", "cancelled"]


class InspectionRequestIn(BaseModel):
    property_id: str
    renovation_goals: str
    budget_hint_ngn: Optional[float] = None
    preferred_date: Optional[str] = None  # ISO YYYY-MM-DD
    contact_phone: str
    photos: List[str] = Field(default_factory=list)  # base64 or URLs (up to 12)
    videos: List[str] = Field(default_factory=list)  # base64 or URLs (up to 3)
    notes: Optional[str] = None


class InspectionReportIn(BaseModel):
    """Filled by an admin/inspector once the on-site visit is done."""
    condition_summary: str
    structural: dict = Field(default_factory=dict)   # {rating: 1-5, notes: "..."}
    electrical: dict = Field(default_factory=dict)
    plumbing:   dict = Field(default_factory=dict)
    roof:       dict = Field(default_factory=dict)
    interior:   dict = Field(default_factory=dict)
    exterior:   dict = Field(default_factory=dict)
    condition:  dict = Field(default_factory=dict)  # overall condition rating
    photos: List[str] = Field(default_factory=list)
    videos: List[str] = Field(default_factory=list)
    estimated_market_value_ngn: Optional[float] = None
    estimated_renovation_cost_ngn: Optional[float] = None
    estimated_post_renovation_value_ngn: Optional[float] = None
    estimated_rental_income_monthly_ngn: Optional[float] = None
    recommendations: List[str] = Field(default_factory=list)  # bullet points
    inspector_name: Optional[str] = None
    inspector_id: Optional[str] = None


class FinanceApplicationIn(BaseModel):
    property_id: str
    inspection_id: Optional[str] = None
    product_id: str  # renovation_loan | property_completion | …
    partner_bank_id: Optional[str] = None
    amount_requested_ngn: float
    tenor_months: int = 24
    purpose: str
    documents: List[dict] = Field(default_factory=list)  # [{name, base64, size, uploaded_at}]
    contact_phone: Optional[str] = None


class FinanceStatusUpdate(BaseModel):
    status: FinanceStatus
    note: Optional[str] = None
    partner_bank_id: Optional[str] = None
    reference: Optional[str] = None


class ProjectCreateIn(BaseModel):
    property_id: str
    inspection_id: Optional[str] = None
    finance_application_id: Optional[str] = None
    scope: str
    estimated_cost_ngn: Optional[float] = None
    estimated_start: Optional[str] = None
    estimated_completion: Optional[str] = None
    boq_items: List[dict] = Field(default_factory=list)  # [{item, unit, qty, unit_price, total}]
    recommended_provider_ids: List[str] = Field(default_factory=list)
    recommended_brand_ids: List[str] = Field(default_factory=list)


class ProjectMilestoneIn(BaseModel):
    milestone_key: str
    note: Optional[str] = None
    completed_at: Optional[str] = None


class AgentReferralIn(BaseModel):
    property_id: str
    client_user_id: Optional[str] = None
    client_name: Optional[str] = None
    client_phone: Optional[str] = None
    note: Optional[str] = None
    product_id: Optional[str] = None  # if recommending financing


class LinkReferralIn(BaseModel):
    application_id: str
    deal_value_ngn: float


class PayoutIn(BaseModel):
    method: Literal["bank", "wallet"] = "wallet"
    bank_account: Optional[dict] = None  # {bank_name, account_number, account_name}
    reference: Optional[str] = None


# Commission rate table (percent of loan disbursed or sale value).
COMMISSION_RATES = {
    "renovation_loan":     0.025,
    "property_completion": 0.025,
    "rebuild_loan":        0.020,
    "rental_upgrade":      0.030,
    "mortgage_referral":   0.015,
    "home_improvement":    0.030,
    "property_sale":       0.020,
}


def _commission_rate(product_id: Optional[str]) -> float:
    return COMMISSION_RATES.get(product_id or "property_sale", 0.02)


# ─── Registration ───────────────────────────────────────────────
def register_property_improvement_routes(
    db: AsyncIOMotorDatabase,
    require_auth,  # callable → dict (current user)
) -> APIRouter:
    router = APIRouter(prefix="/api", tags=["property-improvement"])

    async def _push_notification(user_id: str, kind: str, title: str, body: str, meta: Optional[dict] = None):
        """Store (and maybe push) an in-app notification via the Notification Center."""
        from notification_center import emit
        await emit(db, user_id, kind, title, body, meta or {})

    # ═══ Catalog endpoints ═════════════════════════════════════
    @router.get("/improve/catalog")
    async def improve_catalog():
        """Static config the mobile app hydrates the improvement UI from."""
        return {
            "milestones": PROJECT_MILESTONES,
            "finance_products": FINANCE_PRODUCTS,
            "partner_banks": PARTNER_BANKS,
            "trades": [
                "Architect", "Builder", "Engineer", "Electrician", "Plumber",
                "Carpenter", "Painter", "POP Installer", "Tiler", "Welder",
                "Interior Designer", "Quantity Surveyor", "Facility Manager",
            ],
            "brand_categories": [
                "Cement", "Roofing Materials", "Tiles", "Doors", "Windows",
                "Electrical Materials", "Plumbing Materials", "Paint",
                "Kitchen Fixtures", "Bathroom Fixtures", "Furniture", "Appliances",
            ],
        }

    # ═══ Inspections ══════════════════════════════════════════
    @router.post("/inspections")
    async def create_inspection(
        data: InspectionRequestIn, user: dict = Depends(require_auth)
    ):
        prop = await db.properties.find_one({"id": data.property_id}, {"_id": 0})
        if not prop:
            raise HTTPException(404, "Property not found")
        doc = {
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "property_id": data.property_id,
            "property_snapshot": {
                "title": prop.get("title"),
                "location": prop.get("location"),
                "city": prop.get("city"),
                "images": (prop.get("images") or [])[:3],
                "price": prop.get("price"),
            },
            "renovation_goals": data.renovation_goals[:2000],
            "budget_hint_ngn": data.budget_hint_ngn,
            "preferred_date": data.preferred_date,
            "contact_phone": data.contact_phone,
            "photos": data.photos[:12],
            "videos": data.videos[:3],
            "notes": (data.notes or "")[:1000],
            "status": "requested",
            "report": None,
            "health_score": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "scheduled_at": None,
            "completed_at": None,
        }
        await db.inspections.insert_one(dict(doc))
        await _push_notification(
            user["id"], "inspection_requested",
            "Inspection request received",
            f"We'll schedule your inspection for {prop.get('title', 'your property')} soon.",
            meta={"inspection_id": doc["id"], "property_id": data.property_id},
        )
        doc.pop("_id", None)
        return doc

    @router.get("/inspections/mine")
    async def my_inspections(user: dict = Depends(require_auth)):
        return await db.inspections.find(
            {"user_id": user["id"]}, {"_id": 0}
        ).sort("created_at", -1).to_list(50)

    @router.get("/inspections/{inspection_id}")
    async def get_inspection(inspection_id: str, user: dict = Depends(require_auth)):
        doc = await db.inspections.find_one({"id": inspection_id}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Inspection not found")
        # Owner or admin can view (admin flag on user)
        if doc["user_id"] != user["id"] and not user.get("is_admin"):
            raise HTTPException(403, "Not your inspection")
        return doc

    class ScheduleIn(BaseModel):
        scheduled_at: str  # ISO datetime
        inspector_name: Optional[str] = None

    @router.patch("/inspections/{inspection_id}/schedule")
    async def schedule_inspection(
        inspection_id: str, data: ScheduleIn, user: dict = Depends(require_auth)
    ):
        doc = await db.inspections.find_one({"id": inspection_id}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Inspection not found")
        # In MVP, allow the owner OR any admin to move to scheduled
        await db.inspections.update_one(
            {"id": inspection_id},
            {"$set": {
                "status": "scheduled",
                "scheduled_at": data.scheduled_at,
                "inspector_name": data.inspector_name,
            }},
        )
        await _push_notification(
            doc["user_id"], "inspection_scheduled",
            "Inspection scheduled",
            f"Your inspection is scheduled for {data.scheduled_at[:10]}.",
            meta={"inspection_id": inspection_id},
        )
        return {"ok": True}

    @router.post("/inspections/{inspection_id}/report")
    async def submit_report(
        inspection_id: str,
        data: InspectionReportIn,
        user: dict = Depends(require_auth),
    ):
        doc = await db.inspections.find_one({"id": inspection_id}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Inspection not found")
        # Compute health score from category ratings
        ratings = {
            "structural": data.structural.get("rating"),
            "electrical": data.electrical.get("rating"),
            "plumbing":   data.plumbing.get("rating"),
            "roof":       data.roof.get("rating"),
            "interior":   data.interior.get("rating"),
            "exterior":   data.exterior.get("rating"),
            "condition":  data.condition.get("rating"),
        }
        score = _compute_health_score(ratings)
        report = data.model_dump()
        report["submitted_at"] = datetime.now(timezone.utc).isoformat()
        await db.inspections.update_one(
            {"id": inspection_id},
            {"$set": {
                "status": "completed",
                "report": report,
                "health_score": score,
                "completed_at": report["submitted_at"],
            }},
        )
        await _push_notification(
            doc["user_id"], "report_ready",
            "Your inspection report is ready",
            f"Property Health Score: {score}/100",
            meta={"inspection_id": inspection_id, "health_score": score},
        )
        return {"ok": True, "health_score": score}

    # ═══ Finance ══════════════════════════════════════════════
    @router.get("/finance/products")
    async def list_finance_products():
        return {"products": FINANCE_PRODUCTS, "partner_banks": PARTNER_BANKS}

    @router.post("/finance/applications")
    async def create_finance_application(
        data: FinanceApplicationIn, user: dict = Depends(require_auth)
    ):
        prod = next((p for p in FINANCE_PRODUCTS if p["id"] == data.product_id), None)
        if not prod:
            raise HTTPException(400, "Unknown finance product")
        prop = await db.properties.find_one({"id": data.property_id}, {"_id": 0})
        if not prop:
            raise HTTPException(404, "Property not found")
        doc = {
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "property_id": data.property_id,
            "inspection_id": data.inspection_id,
            "product_id": data.product_id,
            "product_name": prod["name"],
            "partner_bank_id": data.partner_bank_id,
            "amount_requested_ngn": data.amount_requested_ngn,
            "tenor_months": data.tenor_months,
            "purpose": data.purpose[:2000],
            "documents": data.documents[:20],
            "contact_phone": data.contact_phone,
            "status": "submitted",
            "history": [
                {
                    "status": "submitted",
                    "at": datetime.now(timezone.utc).isoformat(),
                    "note": "Application submitted for review.",
                }
            ],
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.finance_applications.insert_one(dict(doc))
        await _push_notification(
            user["id"], "loan_submitted",
            "Loan application submitted",
            f"{prod['name']} — ₦{int(data.amount_requested_ngn):,} — under review.",
            meta={"application_id": doc["id"]},
        )
        doc.pop("_id", None)
        return doc

    @router.get("/finance/applications/mine")
    async def my_finance_applications(user: dict = Depends(require_auth)):
        return await db.finance_applications.find(
            {"user_id": user["id"]}, {"_id": 0}
        ).sort("created_at", -1).to_list(50)

    @router.get("/finance/applications/{app_id}")
    async def get_finance_application(app_id: str, user: dict = Depends(require_auth)):
        doc = await db.finance_applications.find_one({"id": app_id}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Application not found")
        if doc["user_id"] != user["id"] and not user.get("is_admin"):
            raise HTTPException(403, "Not your application")
        return doc

    @router.patch("/finance/applications/{app_id}/status")
    async def update_finance_status(
        app_id: str, data: FinanceStatusUpdate, user: dict = Depends(require_auth)
    ):
        doc = await db.finance_applications.find_one({"id": app_id}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Application not found")
        entry = {
            "status": data.status,
            "at": datetime.now(timezone.utc).isoformat(),
            "note": data.note,
        }
        update = {"status": data.status}
        if data.partner_bank_id:
            update["partner_bank_id"] = data.partner_bank_id
        if data.reference:
            update["reference"] = data.reference
        await db.finance_applications.update_one(
            {"id": app_id},
            {"$set": update, "$push": {"history": entry}},
        )
        await _push_notification(
            doc["user_id"], "loan_status_change",
            f"Loan {data.status.replace('_', ' ')}",
            data.note or f"Your {doc['product_name']} application is now {data.status.replace('_', ' ')}.",
            meta={"application_id": app_id, "status": data.status},
        )
        return {"ok": True}

    # ═══ Renovation Projects ════════════════════════════════
    @router.post("/projects")
    async def create_project(
        data: ProjectCreateIn, user: dict = Depends(require_auth)
    ):
        prop = await db.properties.find_one({"id": data.property_id}, {"_id": 0})
        if not prop:
            raise HTTPException(404, "Property not found")
        # Pre-fill the tracker with the milestones already reached
        now = datetime.now(timezone.utc).isoformat()
        completed: dict = {}
        if data.inspection_id:
            insp = await db.inspections.find_one({"id": data.inspection_id}, {"_id": 0})
            if insp and insp.get("scheduled_at"):
                completed["inspection_scheduled"] = insp["scheduled_at"]
            if insp and insp.get("status") == "completed":
                completed["inspection_completed"] = insp.get("completed_at") or now
        if data.finance_application_id:
            fin = await db.finance_applications.find_one(
                {"id": data.finance_application_id}, {"_id": 0}
            )
            if fin:
                completed["loan_submitted"] = fin.get("created_at") or now
                if fin.get("status") == "approved":
                    completed["loan_approved"] = now
        doc = {
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "property_id": data.property_id,
            "inspection_id": data.inspection_id,
            "finance_application_id": data.finance_application_id,
            "scope": data.scope[:2000],
            "estimated_cost_ngn": data.estimated_cost_ngn,
            "estimated_start": data.estimated_start,
            "estimated_completion": data.estimated_completion,
            "boq_items": data.boq_items,
            "recommended_provider_ids": data.recommended_provider_ids,
            "recommended_brand_ids": data.recommended_brand_ids,
            "status": "planned",
            "milestones_completed": completed,
            "activity_log": [
                {"kind": "created", "at": now, "note": "Renovation project created."}
            ],
            "property_snapshot": {
                "title": prop.get("title"),
                "location": prop.get("location"),
                "images": (prop.get("images") or [])[:3],
            },
            "created_at": now,
        }
        await db.renovation_projects.insert_one(dict(doc))
        await _push_notification(
            user["id"], "project_created",
            "Renovation project created",
            f"Track your renovation for {prop.get('title', 'your property')} in real time.",
            meta={"project_id": doc["id"]},
        )
        doc.pop("_id", None)
        return doc

    @router.get("/projects/mine")
    async def my_projects(user: dict = Depends(require_auth)):
        return await db.renovation_projects.find(
            {"user_id": user["id"]}, {"_id": 0}
        ).sort("created_at", -1).to_list(50)

    @router.get("/projects/{project_id}")
    async def get_project(project_id: str, user: dict = Depends(require_auth)):
        doc = await db.renovation_projects.find_one({"id": project_id}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Project not found")
        if doc["user_id"] != user["id"] and not user.get("is_admin"):
            raise HTTPException(403, "Not your project")
        # Hydrate recommended providers & brands from marketplace
        prov_ids = doc.get("recommended_provider_ids") or []
        brand_ids = doc.get("recommended_brand_ids") or []
        if prov_ids:
            doc["recommended_providers"] = await db.marketplace.find(
                {"id": {"$in": prov_ids}}, {"_id": 0}
            ).to_list(30)
        if brand_ids:
            doc["recommended_brands"] = await db.marketplace.find(
                {"id": {"$in": brand_ids}}, {"_id": 0}
            ).to_list(30)
        return doc

    @router.patch("/projects/{project_id}/milestone")
    async def advance_milestone(
        project_id: str, data: ProjectMilestoneIn, user: dict = Depends(require_auth)
    ):
        if data.milestone_key not in MILESTONE_KEYS:
            raise HTTPException(400, "Unknown milestone")
        doc = await db.renovation_projects.find_one({"id": project_id}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Project not found")
        now = data.completed_at or datetime.now(timezone.utc).isoformat()
        milestones = doc.get("milestones_completed") or {}
        milestones[data.milestone_key] = now
        entry = {
            "kind": "milestone",
            "milestone": data.milestone_key,
            "at": now,
            "note": data.note,
        }
        status_update: dict = {"milestones_completed": milestones}
        if data.milestone_key == "project_completed":
            status_update["status"] = "completed"
        elif len(milestones) >= 3 and doc.get("status") == "planned":
            status_update["status"] = "active"
        await db.renovation_projects.update_one(
            {"id": project_id},
            {"$set": status_update, "$push": {"activity_log": entry}},
        )
        # Notify the owner
        label = next(
            (m["label"] for m in PROJECT_MILESTONES if m["key"] == data.milestone_key),
            data.milestone_key,
        )
        await _push_notification(
            doc["user_id"], "milestone_completed",
            f"Milestone reached: {label}",
            data.note or f"Your renovation project just hit '{label}'.",
            meta={"project_id": project_id, "milestone": data.milestone_key},
        )
        return {"ok": True, "milestones_completed": milestones}

    # ═══ Property improvement dashboard (per-property) ══════
    @router.get("/improve/property/{property_id}")
    async def improve_property_view(
        property_id: str, user: dict = Depends(require_auth)
    ):
        """Aggregated overview for one property — everything the mobile
        Property Dashboard tab needs in a single roundtrip."""
        prop = await db.properties.find_one({"id": property_id}, {"_id": 0})
        if not prop:
            raise HTTPException(404, "Property not found")
        # user-scoped inspection / finance / projects
        insp = await db.inspections.find(
            {"user_id": user["id"], "property_id": property_id}, {"_id": 0}
        ).sort("created_at", -1).to_list(20)
        fin = await db.finance_applications.find(
            {"user_id": user["id"], "property_id": property_id}, {"_id": 0}
        ).sort("created_at", -1).to_list(20)
        proj = await db.renovation_projects.find(
            {"user_id": user["id"], "property_id": property_id}, {"_id": 0}
        ).sort("created_at", -1).to_list(20)
        latest_report = None
        for i in insp:
            if i.get("report"):
                latest_report = i["report"]
                latest_report["_inspection_id"] = i["id"]
                latest_report["_health_score"] = i.get("health_score")
                break
        return {
            "property": prop,
            "inspections": insp,
            "finance_applications": fin,
            "projects": proj,
            "summary": {
                "current_market_value_ngn": prop.get("price"),
                "estimated_renovation_cost_ngn": (latest_report or {}).get("estimated_renovation_cost_ngn"),
                "estimated_post_renovation_value_ngn": (latest_report or {}).get("estimated_post_renovation_value_ngn"),
                "estimated_rental_income_monthly_ngn": (latest_report or {}).get("estimated_rental_income_monthly_ngn"),
                "property_health_score": (latest_report or {}).get("_health_score"),
                "active_project_id": next((p["id"] for p in proj if p.get("status") in ("active", "planned")), None),
                "financing_status": (fin[0]["status"] if fin else None),
            },
        }

    # ═══ Improvement hub (all user's activity) ══════════════
    @router.get("/improve/mine")
    async def improve_mine(user: dict = Depends(require_auth)):
        insp = await db.inspections.find(
            {"user_id": user["id"]}, {"_id": 0}
        ).sort("created_at", -1).to_list(30)
        fin = await db.finance_applications.find(
            {"user_id": user["id"]}, {"_id": 0}
        ).sort("created_at", -1).to_list(30)
        proj = await db.renovation_projects.find(
            {"user_id": user["id"]}, {"_id": 0}
        ).sort("created_at", -1).to_list(30)
        return {"inspections": insp, "finance_applications": fin, "projects": proj}

    # ═══ Notifications ═══════════════════════════════════════
    @router.get("/notifications")
    async def list_notifications(
        limit: int = Query(30, le=100), user: dict = Depends(require_auth)
    ):
        docs = await db.notifications.find(
            {"user_id": user["id"]}, {"_id": 0}
        ).sort("created_at", -1).limit(limit).to_list(limit)
        unread = await db.notifications.count_documents(
            {"user_id": user["id"], "read": False}
        )
        return {"unread": unread, "items": docs}

    @router.post("/notifications/mark-read")
    async def mark_notifications_read(user: dict = Depends(require_auth)):
        await db.notifications.update_many(
            {"user_id": user["id"], "read": False},
            {"$set": {"read": True, "read_at": datetime.now(timezone.utc).isoformat()}},
        )
        return {"ok": True}

    # ═══ Agent Workspace hooks ═══════════════════════════════
    # Prefixed `/agent-workspace/*` to avoid collision with the existing
    # `/agents/{user_id}` public-profile route defined in server.py.
    @router.post("/agent-workspace/referrals")
    async def create_agent_referral(
        data: AgentReferralIn, user: dict = Depends(require_auth)
    ):
        prop = await db.properties.find_one({"id": data.property_id}, {"_id": 0})
        if not prop:
            raise HTTPException(404, "Property not found")
        doc = {
            "id": str(uuid.uuid4()),
            "agent_user_id": user["id"],
            "property_id": data.property_id,
            "property_snapshot": {
                "title": prop.get("title"),
                "location": prop.get("location"),
                "images": (prop.get("images") or [])[:1],
                "price": prop.get("price"),
            },
            "client_user_id": data.client_user_id,
            "client_name": data.client_name,
            "client_phone": data.client_phone,
            "product_id": data.product_id,
            "note": (data.note or "")[:1000],
            "status": "open",  # open | qualified | converted | closed_lost
            "commission_rate": _commission_rate(data.product_id),
            "commission_status": "pending",  # pending | approved | paid | cancelled
            "commission_amount_ngn": None,
            "payout_method": None,   # bank | wallet
            "payout_reference": None,
            "linked_application_id": None,
            "history": [
                {"kind": "created", "at": datetime.now(timezone.utc).isoformat(),
                 "note": "Referral logged."}
            ],
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.agent_referrals.insert_one(dict(doc))
        await _push_notification(
            user["id"], "agent_referral_created",
            "Referral logged",
            f"Referral for {prop.get('title', 'property')} is now tracked in your Agent Workspace.",
            meta={"referral_id": doc["id"]},
        )
        doc.pop("_id", None)
        return doc

    @router.get("/agent-workspace/referrals")
    async def my_agent_referrals(user: dict = Depends(require_auth)):
        return await db.agent_referrals.find(
            {"agent_user_id": user["id"]}, {"_id": 0}
        ).sort("created_at", -1).to_list(50)

    @router.post("/agent-workspace/referrals/{referral_id}/qualify")
    async def qualify_referral(
        referral_id: str, data: LinkReferralIn, user: dict = Depends(require_auth)
    ):
        # SECURITY: Only admins may qualify a referral — otherwise agents can
        # rubber-stamp their own commissions and self-payout MASS tokens.
        if not user.get("is_admin"):
            raise HTTPException(403, "Only AMASS admins can qualify referrals")
        r = await db.agent_referrals.find_one({"id": referral_id}, {"_id": 0})
        if not r:
            raise HTTPException(404, "Referral not found")
        rate = r.get("commission_rate") or _commission_rate(r.get("product_id"))
        amount = round(float(data.deal_value_ngn) * rate)
        entry = {
            "kind": "qualified",
            "at": datetime.now(timezone.utc).isoformat(),
            "application_id": data.application_id,
            "deal_value_ngn": data.deal_value_ngn,
            "commission_amount_ngn": amount,
        }
        await db.agent_referrals.update_one(
            {"id": referral_id},
            {"$set": {
                "status": "qualified",
                "linked_application_id": data.application_id,
                "commission_amount_ngn": amount,
                "commission_status": "approved",
            }, "$push": {"history": entry}},
        )
        await _push_notification(
            r["agent_user_id"], "referral_qualified",
            "Referral qualified for commission",
            f"₦{amount:,} approved — payout will follow after the deal closes.",
            meta={"referral_id": referral_id, "amount_ngn": amount},
        )
        return {"ok": True, "commission_amount_ngn": amount, "rate": rate}

    @router.post("/agent-workspace/referrals/{referral_id}/payout")
    async def payout_referral(
        referral_id: str, data: PayoutIn, user: dict = Depends(require_auth)
    ):
        """Trigger a commission payout. MOCK gateway — in production this would
        call Paystack Transfer / Flutterwave Transfer or credit the agent's
        MASS wallet. Idempotent: once paid, further calls return the existing payout.
        SECURITY: admin-only to prevent self-payout abuse.
        """
        if not user.get("is_admin"):
            raise HTTPException(403, "Only AMASS admins can trigger payouts")
        r = await db.agent_referrals.find_one({"id": referral_id}, {"_id": 0})
        if not r:
            raise HTTPException(404, "Referral not found")
        if r.get("commission_status") == "paid":
            return {"ok": True, "already_paid": True,
                    "amount_ngn": r.get("commission_amount_ngn"),
                    "reference": r.get("payout_reference")}
        if r.get("commission_status") != "approved":
            raise HTTPException(400, "Referral must be approved before payout")
        amount = r.get("commission_amount_ngn") or 0
        if amount <= 0:
            raise HTTPException(400, "No commission amount to pay out")
        ref = data.reference or f"ref_payout_{uuid.uuid4().hex[:12]}"
        now = datetime.now(timezone.utc).isoformat()
        credited_mass = None
        if data.method == "wallet":
            from tokens import WalletService  # local import to avoid cycle
            svc = WalletService(db)
            credited_mass = max(1, round(amount / 100))  # ₦100 = 1 MASS (MVP)
            await svc.credit(
                r["agent_user_id"], credited_mass, "earn_reward",
                f"Referral commission payout — ₦{amount:,}",
                currency="MASS",
                meta={"referral_id": referral_id, "payout_reference": ref, "amount_ngn": amount},
            )
        entry = {
            "kind": "payout",
            "at": now,
            "note": f"Paid out ₦{amount:,} via {data.method}",
            "reference": ref,
        }
        await db.agent_referrals.update_one(
            {"id": referral_id},
            {"$set": {
                "commission_status": "paid",
                "status": "converted",
                "payout_method": data.method,
                "payout_reference": ref,
                "payout_bank_account": data.bank_account,
                "paid_at": now,
            }, "$push": {"history": entry}},
        )
        await _push_notification(
            r["agent_user_id"], "commission_paid",
            "Commission paid",
            f"₦{amount:,} paid to your {data.method}."
            + (f" ({credited_mass} MASS credited)" if data.method == "wallet" else ""),
            meta={"referral_id": referral_id, "amount_ngn": amount, "reference": ref},
        )
        return {
            "ok": True, "amount_ngn": amount, "reference": ref,
            "method": data.method, "credited_mass": credited_mass,
        }

    @router.get("/agent-workspace/summary")
    async def agent_summary(user: dict = Depends(require_auth)):
        """KPIs for the Agent Workspace dashboard."""
        docs = await db.agent_referrals.find(
            {"agent_user_id": user["id"]}, {"_id": 0}
        ).to_list(500)
        total = len(docs)
        approved = sum(1 for d in docs if d.get("commission_status") == "approved")
        paid = sum(1 for d in docs if d.get("commission_status") == "paid")
        pending_amount = sum(
            (d.get("commission_amount_ngn") or 0)
            for d in docs if d.get("commission_status") == "approved"
        )
        paid_amount = sum(
            (d.get("commission_amount_ngn") or 0)
            for d in docs if d.get("commission_status") == "paid"
        )
        return {
            "total_referrals": total,
            "approved_count": approved,
            "paid_count": paid,
            "pending_payout_ngn": pending_amount,
            "paid_ngn": paid_amount,
        }

    return router
