from dotenv import load_dotenv
from pathlib import Path
import os

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, Query
from fastapi.responses import StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta
import uuid
import logging
import io
import csv
import random
import bcrypt
import jwt

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = "HS256"

app = FastAPI(title="AMASS Admin Portal API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("amass")


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def new_id():
    return str(uuid.uuid4())


# ---------------------------------------------------------------------------
# RBAC configuration
# ---------------------------------------------------------------------------
MODULES = [
    "dashboard", "leads", "cms", "properties", "agents", "users",
    "property_owners", "developers", "transactions", "payments",
    "subscriptions", "property_verification", "construction_marketplace",
    "home_marketplace", "messages", "notifications", "analytics",
    "reports", "roles", "settings", "ai_management",
]

ACTIONS = ["view", "create", "edit", "delete"]

ROLE_DEFS = {
    "super_admin": {"label": "Super Admin", "description": "Full unrestricted access to every module."},
    "administrator": {"label": "Administrator", "description": "Manage all operational modules."},
    "content_manager": {"label": "Content Manager", "description": "Manage landing page content & SEO."},
    "property_manager": {"label": "Property Manager", "description": "Manage properties & verification."},
    "agent_manager": {"label": "Agent Manager", "description": "Manage agents and onboarding."},
    "customer_support": {"label": "Customer Support", "description": "Handle leads, messages & users."},
    "finance": {"label": "Finance", "description": "Manage transactions, payments & subscriptions."},
    "marketing": {"label": "Marketing", "description": "Manage leads, CMS & analytics."},
}


def full_perms():
    return {m: {a: True for a in ACTIONS} for m in MODULES}


def perms_for(view_modules, edit_modules=None):
    edit_modules = edit_modules or []
    p = {m: {a: False for a in ACTIONS} for m in MODULES}
    for m in view_modules:
        p[m]["view"] = True
    for m in edit_modules:
        p[m] = {a: True for a in ACTIONS}
    return p


def default_permissions(role: str):
    if role in ("super_admin", "administrator"):
        return full_perms()
    if role == "content_manager":
        return perms_for(["dashboard"], ["cms"])
    if role == "property_manager":
        return perms_for(["dashboard"], ["properties", "property_verification"])
    if role == "agent_manager":
        return perms_for(["dashboard"], ["agents"])
    if role == "customer_support":
        return perms_for(["dashboard", "users"], ["leads", "messages"])
    if role == "finance":
        return perms_for(["dashboard", "reports"], ["transactions", "payments", "subscriptions"])
    if role == "marketing":
        return perms_for(["dashboard", "analytics"], ["leads", "cms"])
    return perms_for(["dashboard"])


# ---------------------------------------------------------------------------
# Security helpers
# ---------------------------------------------------------------------------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str, email: str) -> str:
    payload = {"sub": user_id, "email": email,
               "exp": datetime.now(timezone.utc) + timedelta(days=7), "type": "access"}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.admin_users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


async def effective_permissions(user: dict) -> dict:
    if user.get("permissions_override"):
        return user["permissions_override"]
    role_doc = await db.roles.find_one({"name": user["role"]}, {"_id": 0})
    if role_doc:
        return role_doc["permissions"]
    return default_permissions(user["role"])


def require(module: str, action: str = "view"):
    async def dep(user: dict = Depends(get_current_user)):
        if user["role"] == "super_admin":
            return user
        perms = await effective_permissions(user)
        if not perms.get(module, {}).get(action, False):
            raise HTTPException(status_code=403, detail="You do not have permission for this action")
        return user
    return dep


async def log_activity(action: str, entity: str, user: dict, meta: str = ""):
    await db.activities.insert_one({
        "id": new_id(), "action": action, "entity": entity,
        "user_name": user.get("name", "System"), "user_email": user.get("email", ""),
        "meta": meta, "created_at": now_iso(),
    })


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class LoginInput(BaseModel):
    email: EmailStr
    password: str


class ChangePasswordInput(BaseModel):
    current_password: str
    new_password: str


class AdminUserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: str


class LeadStatusInput(BaseModel):
    status: str


class RolePermissionsInput(BaseModel):
    permissions: Dict[str, Dict[str, bool]]


class CMSUpdateInput(BaseModel):
    data: Optional[Dict[str, Any]] = None
    visible: Optional[bool] = None


class ProfileInput(BaseModel):
    name: str


# ---------------------------------------------------------------------------
# Auth endpoints
# ---------------------------------------------------------------------------
@api.post("/auth/login")
async def login(body: LoginInput, response: Response):
    email = body.email.lower().strip()
    user = await db.admin_users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if user.get("status") == "suspended":
        raise HTTPException(status_code=403, detail="Account suspended")
    token = create_access_token(user["id"], user["email"])
    await db.admin_users.update_one({"id": user["id"]}, {"$set": {"last_login": now_iso()}})
    response.set_cookie("access_token", token, httponly=True, secure=True, samesite="none", max_age=604800, path="/")
    safe = {k: v for k, v in user.items() if k not in ("_id", "password_hash")}
    safe["permissions"] = await effective_permissions(user)
    return {"token": token, "user": safe}


@api.post("/auth/logout")
async def logout(response: Response, user: dict = Depends(get_current_user)):
    response.delete_cookie("access_token", path="/")
    return {"success": True}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    user["permissions"] = await effective_permissions(user)
    return user


@api.post("/auth/change-password")
async def change_password(body: ChangePasswordInput, user: dict = Depends(get_current_user)):
    full = await db.admin_users.find_one({"id": user["id"]})
    if not verify_password(body.current_password, full["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters")
    await db.admin_users.update_one({"id": user["id"]}, {"$set": {"password_hash": hash_password(body.new_password)}})
    await log_activity("changed password", "account", user)
    return {"success": True}


@api.patch("/auth/profile")
async def update_profile(body: ProfileInput, user: dict = Depends(get_current_user)):
    await db.admin_users.update_one({"id": user["id"]}, {"$set": {"name": body.name}})
    return {"success": True}


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------
@api.get("/dashboard/stats")
async def dashboard_stats(user: dict = Depends(require("dashboard"))):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    total_leads = await db.leads.count_documents({})
    new_today = await db.leads.count_documents({"created_at": {"$regex": f"^{today}"}})
    agents = await db.agents.count_documents({})
    users = await db.platform_users.count_documents({})
    properties = await db.properties.count_documents({})
    pending = await db.properties.count_documents({"status": "pending"})
    newsletter = await db.leads.count_documents({"type": "newsletter"})
    return {
        "total_leads": total_leads,
        "new_leads_today": new_today,
        "registered_agents": agents,
        "registered_users": users,
        "total_properties": properties,
        "pending_property_approvals": pending,
        "newsletter_subscribers": newsletter,
    }


@api.get("/dashboard/leads-trend")
async def leads_trend(user: dict = Depends(require("dashboard"))):
    out = []
    for i in range(13, -1, -1):
        day = (datetime.now(timezone.utc) - timedelta(days=i))
        key = day.strftime("%Y-%m-%d")
        count = await db.leads.count_documents({"created_at": {"$regex": f"^{key}"}})
        out.append({"date": day.strftime("%b %d"), "leads": count})
    return out


@api.get("/dashboard/lead-sources")
async def lead_sources(user: dict = Depends(require("dashboard"))):
    pipeline = [{"$group": {"_id": "$type", "value": {"$sum": 1}}}]
    rows = await db.leads.aggregate(pipeline).to_list(100)
    return [{"name": r["_id"], "value": r["value"]} for r in rows]


@api.get("/dashboard/activities")
async def recent_activities(user: dict = Depends(require("dashboard"))):
    rows = await db.activities.find({}, {"_id": 0}).sort("created_at", -1).to_list(12)
    return rows


# ---------------------------------------------------------------------------
# Leads
# ---------------------------------------------------------------------------
LEAD_TYPES = {
    "agent": "Become an Agent", "contact": "Contact Us", "demo": "Book Demo",
    "partner": "Partner with AMASS", "property": "List Your Property",
    "newsletter": "Newsletter", "waitlist": "Waiting List",
}


@api.get("/leads")
async def list_leads(
    user: dict = Depends(require("leads")),
    search: Optional[str] = None,
    type: Optional[str] = None,
    status: Optional[str] = None,
):
    q: Dict[str, Any] = {}
    if type and type != "all":
        q["type"] = type
    if status and status != "all":
        q["status"] = status
    if search:
        q["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}},
            {"phone": {"$regex": search, "$options": "i"}},
            {"message": {"$regex": search, "$options": "i"}},
        ]
    rows = await db.leads.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return rows


@api.get("/leads/{lead_id}")
async def get_lead(lead_id: str, user: dict = Depends(require("leads"))):
    lead = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    return lead


@api.patch("/leads/{lead_id}/status")
async def set_lead_status(lead_id: str, body: LeadStatusInput, user: dict = Depends(require("leads", "edit"))):
    if body.status not in ("New", "Contacted", "Closed"):
        raise HTTPException(status_code=400, detail="Invalid status")
    res = await db.leads.update_one({"id": lead_id}, {"$set": {"status": body.status}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Lead not found")
    await log_activity(f"marked lead as {body.status}", "lead", user, lead_id)
    return {"success": True}


@api.delete("/leads/{lead_id}")
async def delete_lead(lead_id: str, user: dict = Depends(require("leads", "delete"))):
    res = await db.leads.delete_one({"id": lead_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Lead not found")
    await log_activity("deleted a lead", "lead", user, lead_id)
    return {"success": True}


@api.get("/leads-export/csv")
async def export_leads(user: dict = Depends(require("leads")), type: Optional[str] = None, status: Optional[str] = None):
    q: Dict[str, Any] = {}
    if type and type != "all":
        q["type"] = type
    if status and status != "all":
        q["status"] = status
    rows = await db.leads.find(q, {"_id": 0}).sort("created_at", -1).to_list(5000)
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["Name", "Email", "Phone", "Type", "Status", "Message", "Created At"])
    for r in rows:
        writer.writerow([r.get("name", ""), r.get("email", ""), r.get("phone", ""),
                         LEAD_TYPES.get(r.get("type", ""), r.get("type", "")),
                         r.get("status", ""), r.get("message", ""), r.get("created_at", "")])
    buf.seek(0)
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": "attachment; filename=amass_leads.csv"})


# Public endpoint used by the AMASS landing page to submit a form
class PublicLeadInput(BaseModel):
    type: str
    name: str
    email: EmailStr
    phone: Optional[str] = ""
    message: Optional[str] = ""


@api.post("/public/leads")
async def public_submit_lead(body: PublicLeadInput):
    if body.type not in LEAD_TYPES:
        raise HTTPException(status_code=400, detail="Invalid lead type")
    doc = {"id": new_id(), "type": body.type, "name": body.name, "email": body.email.lower(),
           "phone": body.phone or "", "message": body.message or "", "status": "New", "created_at": now_iso()}
    await db.leads.insert_one(doc)
    return {"success": True}


# ---------------------------------------------------------------------------
# Landing Page CMS
# ---------------------------------------------------------------------------
@api.get("/cms/sections")
async def list_cms_sections(user: dict = Depends(require("cms"))):
    rows = await db.cms_sections.find({}, {"_id": 0}).sort("order", 1).to_list(100)
    return rows


@api.get("/cms/sections/{key}")
async def get_cms_section(key: str, user: dict = Depends(require("cms"))):
    doc = await db.cms_sections.find_one({"key": key}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Section not found")
    return doc


@api.put("/cms/sections/{key}")
async def update_cms_section(key: str, body: CMSUpdateInput, user: dict = Depends(require("cms", "edit"))):
    update: Dict[str, Any] = {"updated_at": now_iso()}
    if body.data is not None:
        update["data"] = body.data
    if body.visible is not None:
        update["visible"] = body.visible
    res = await db.cms_sections.update_one({"key": key}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Section not found")
    await log_activity(f"updated CMS section '{key}'", "cms", user)
    return {"success": True}


@api.get("/public/landing")
async def public_landing():
    rows = await db.cms_sections.find({"visible": True}, {"_id": 0}).sort("order", 1).to_list(100)
    return {s["key"]: s["data"] for s in rows}


# ---------------------------------------------------------------------------
# Roles & Permissions
# ---------------------------------------------------------------------------
@api.get("/roles")
async def list_roles(user: dict = Depends(require("roles"))):
    rows = await db.roles.find({}, {"_id": 0}).to_list(100)
    for r in rows:
        r["user_count"] = await db.admin_users.count_documents({"role": r["name"]})
    return {"roles": rows, "modules": MODULES, "actions": ACTIONS}


@api.put("/roles/{name}")
async def update_role(name: str, body: RolePermissionsInput, user: dict = Depends(require("roles", "edit"))):
    if name == "super_admin":
        raise HTTPException(status_code=400, detail="Super Admin permissions cannot be modified")
    res = await db.roles.update_one({"name": name}, {"$set": {"permissions": body.permissions}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Role not found")
    await log_activity(f"updated permissions for role '{name}'", "role", user)
    return {"success": True}


# ---------------------------------------------------------------------------
# Admin user management (Settings > Team)
# ---------------------------------------------------------------------------
@api.get("/admin-users")
async def list_admin_users(user: dict = Depends(require("settings"))):
    rows = await db.admin_users.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(200)
    return rows


@api.post("/admin-users")
async def create_admin_user(body: AdminUserCreate, user: dict = Depends(require("settings", "create"))):
    if body.role not in ROLE_DEFS:
        raise HTTPException(status_code=400, detail="Invalid role")
    email = body.email.lower().strip()
    if await db.admin_users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already exists")
    doc = {"id": new_id(), "name": body.name, "email": email, "password_hash": hash_password(body.password),
           "role": body.role, "status": "active", "permissions_override": None,
           "created_at": now_iso(), "last_login": None}
    await db.admin_users.insert_one(doc)
    await log_activity(f"created admin user {email}", "admin_user", user)
    return {"success": True}


@api.delete("/admin-users/{uid}")
async def delete_admin_user(uid: str, user: dict = Depends(require("settings", "delete"))):
    target = await db.admin_users.find_one({"id": uid})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target["role"] == "super_admin":
        raise HTTPException(status_code=400, detail="Cannot delete a Super Admin")
    await db.admin_users.delete_one({"id": uid})
    await log_activity(f"removed admin user {target['email']}", "admin_user", user)
    return {"success": True}


# ---------------------------------------------------------------------------
# Generic module stats (placeholder modules)
# ---------------------------------------------------------------------------
@api.get("/modules/{module}/summary")
async def module_summary(module: str, user: dict = Depends(get_current_user)):
    counts = {
        "properties": await db.properties.count_documents({}),
        "agents": await db.agents.count_documents({}),
        "users": await db.platform_users.count_documents({}),
    }
    return {"module": module, "counts": counts}


# ---------------------------------------------------------------------------
# Seeding
# ---------------------------------------------------------------------------
async def seed():
    await db.admin_users.create_index("email", unique=True)
    await db.leads.create_index("created_at")

    # Roles
    for name, meta in ROLE_DEFS.items():
        existing = await db.roles.find_one({"name": name})
        if not existing:
            await db.roles.insert_one({
                "name": name, "label": meta["label"], "description": meta["description"],
                "permissions": default_permissions(name), "system": True,
            })

    # Admin users
    admin_email = os.environ["ADMIN_EMAIL"].lower()
    admin_password = os.environ["ADMIN_PASSWORD"]
    existing = await db.admin_users.find_one({"email": admin_email})
    if not existing:
        await db.admin_users.insert_one({
            "id": new_id(), "name": "AMASS Super Admin", "email": admin_email,
            "password_hash": hash_password(admin_password), "role": "super_admin",
            "status": "active", "permissions_override": None, "created_at": now_iso(), "last_login": None,
        })
        logger.info("Seeded super admin %s", admin_email)
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.admin_users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_password)}})

    for email, role in [("content@amass.africa", "content_manager"),
                        ("finance@amass.africa", "finance"),
                        ("support@amass.africa", "customer_support")]:
        if not await db.admin_users.find_one({"email": email}):
            await db.admin_users.insert_one({
                "id": new_id(), "name": ROLE_DEFS[role]["label"], "email": email,
                "password_hash": hash_password("Amass@2026"), "role": role,
                "status": "active", "permissions_override": None, "created_at": now_iso(), "last_login": None,
            })

    # CMS sections (version-gated re-seed so content stays aligned with the live landing page)
    if await db.cms_sections.find_one({"version": CMS_VERSION}) is None:
        await db.cms_sections.delete_many({})
        await db.cms_sections.insert_many(default_cms_sections())
        logger.info("Seeded CMS sections (v%s)", CMS_VERSION)

    # Demo data
    if await db.leads.count_documents({}) == 0:
        await seed_demo_data()
        logger.info("Seeded demo data")


CMS_VERSION = 2  # bump to force a re-seed of landing page content


def default_cms_sections():
    order = 0
    def s(key, title, data, visible=True):
        nonlocal order
        order += 1
        return {"key": key, "title": title, "data": data, "visible": visible,
                "order": order, "version": CMS_VERSION, "updated_at": now_iso()}
    return [
        s("hero", "Hero Section", {
            "overline": "The Google Maps of African Real Estate",
            "headline": "Discover Africa's Properties Like Never Before",
            "subheadline": "The AMASS app lets you search, verify, buy, rent, finance and explore properties with intelligent maps, verified listings and AI-powered property intelligence.",
            "primary_cta_label": "Get Early Access", "primary_cta_link": "#waitlist",
            "secondary_cta_label": "Become an Agent", "secondary_cta_link": "#agents",
            "trust_badges": [
                {"label": "Verified Listings"}, {"label": "AI Powered"},
                {"label": "Secure Transactions"}, {"label": "Nationwide Coverage"},
            ],
            "background_image": "https://images.pexels.com/photos/27741697/pexels-photo-27741697.jpeg?auto=compress&cs=tinysrgb&w=2400",
        }),
        s("categories", "Category Map", {
            "overline": "Live Map Experience",
            "title": "One intelligent map. Every category of property.",
            "items": [
                {"name": "Luxury Homes", "count": "2,400+"},
                {"name": "Apartments", "count": "8,100+"},
                {"name": "Commercial", "count": "1,900+"},
                {"name": "Land", "count": "5,300+"},
                {"name": "Short Lets", "count": "3,700+"},
                {"name": "New Developments", "count": "640+"},
                {"name": "Construction Projects", "count": "310+"},
            ],
        }),
        s("pillars", "What AMASS Does (Pillars)", {
            "overline": "What AMASS Does",
            "title": "A single platform for the entire property lifecycle.",
            "subtitle": "Six intelligent pillars — from discovery and verification to construction, furnishing and finance — working together in one elegant interface.",
            "items": [
                {"number": "01", "title": "Property Marketplace", "description": "Buy, sell, rent, lease — from luxury homes and commercial to land and short lets.", "tags": "Buy, Sell, Rent, Lease, Commercial, Land, Short Let, Luxury Homes"},
                {"number": "02", "title": "Property Intelligence", "description": "Satellite discovery, verification and analytics that turn guesswork into certainty.", "tags": "Satellite Discovery, Verification, Market Analytics, Valuation, Ownership Insights, Neighbourhood Intel"},
                {"number": "03", "title": "Construction Marketplace", "description": "Everything to build — materials, equipment and vetted professionals in one place.", "tags": "Building Materials, Equipment Rental, Professionals, Architects, Engineers, Surveyors, Project Mgmt"},
                {"number": "04", "title": "Home Marketplace", "description": "Furnish and finish your space with curated furniture, appliances and decor.", "tags": "Furniture, Appliances, Electronics, Kitchen, Garden, Decoration, Office, Lifestyle"},
                {"number": "05", "title": "AI Services", "description": "An intelligent copilot for search, valuation, risk and market predictions.", "tags": "AI Search, Investment Assistant, AI Valuation, Recommendations, Risk Analysis, Predictions"},
                {"number": "06", "title": "Financial Services", "description": "Mortgages, BNPL, financing and escrow — secure money movement, end to end.", "tags": "Mortgage, BNPL, Financing, Loans, Insurance, Escrow, Secure Payments"},
            ],
        }),
        s("showcase", "Property Showcase", {
            "overline": "Property Showcase",
            "title": "Handpicked homes, verified to the last detail.",
            "cta_label": "Browse 48,000+ listings in the app",
            "items": [
                {"title": "Ocean-View Penthouse", "price": "₦420M", "location": "Eko Atlantic, VI", "badge": "Premium", "specs": "5 bed · 6 bath · 610m²", "agent": "Adaeze O.", "image": "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?q=80&w=1200&auto=format&fit=crop"},
                {"title": "Waterfront Duplex", "price": "₦185M", "location": "Banana Island, Ikoyi", "badge": "Available", "specs": "4 bed · 5 bath · 420m²", "agent": "Tunde A.", "image": "https://images.unsplash.com/photo-1613490493576-7fde63acd811?q=80&w=1200&auto=format&fit=crop"},
                {"title": "Smart 3-Bed Apartment", "price": "₦95M", "location": "Lekki Phase 1", "badge": "Verified", "specs": "3 bed · 3 bath · 210m²", "agent": "Ngozi E.", "image": "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?q=80&w=1200&auto=format&fit=crop"},
                {"title": "Contemporary Terrace", "price": "₦260M", "location": "Ikate, Lekki", "badge": "Coming Soon", "specs": "4 bed · 4 bath · 340m²", "agent": "Emeka N.", "image": "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?q=80&w=1200&auto=format&fit=crop"},
                {"title": "Serviced Short-Let Studio", "price": "₦72M", "location": "Victoria Island", "badge": "Short Let", "specs": "1 bed · 1 bath · 65m²", "agent": "Bisi K.", "image": "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?q=80&w=1200&auto=format&fit=crop"},
                {"title": "Signature Smart Home", "price": "₦310M", "location": "Osborne, Ikoyi", "badge": "Premium", "specs": "5 bed · 5 bath · 520m²", "agent": "Chidi U.", "image": "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?q=80&w=1200&auto=format&fit=crop"},
            ],
        }),
        s("statistics", "Statistics (Why Choose AMASS)", {
            "overline": "Why Choose AMASS",
            "title": "Built for Africa. Trusted across the continent.",
            "cities": "Lagos, Abuja, Accra, Nairobi, Kigali, Cape Town, Kampala, Dar es Salaam, Dakar, Addis Ababa, Johannesburg, Kumasi",
            "items": [
                {"value": "48,000+", "label": "Properties Listed"},
                {"value": "3,200+", "label": "Verified Agents"},
                {"value": "120k+", "label": "Verified Documents"},
                {"value": "20+", "label": "Cities Across Africa"},
                {"value": "0.4s", "label": "Avg. Search Speed"},
                {"value": "₦900B+", "label": "Transactions Secured"},
            ],
        }),
        s("how_it_works", "How It Works", {
            "overline": "How It Works",
            "title": "From first search to keys in hand — in five steps.",
            "items": [
                {"number": "01", "title": "Discover", "description": "Explore verified listings on an intelligent satellite map."},
                {"number": "02", "title": "Verify", "description": "Confirm documents, ownership and agent identity instantly."},
                {"number": "03", "title": "Inspect", "description": "Book physical or virtual tours with a single tap."},
                {"number": "04", "title": "Chat", "description": "Negotiate securely with verified agents in real time."},
                {"number": "05", "title": "Complete", "description": "Close with escrow-protected, secure transactions."},
            ],
        }),
        s("for_agents", "For Agents", {
            "overline": "For Agents",
            "title": "Grow faster with the tools top agents use.",
            "description": "List once, reach millions. Manage every property, lead and transaction from a dashboard designed to close deals.",
            "cta_label": "Become an AMASS Agent",
            "items": [
                {"title": "More Leads", "description": "Reach millions of active, verified property seekers."},
                {"title": "Verified Profile", "description": "A trusted blue badge that converts browsers to buyers."},
                {"title": "Property Management", "description": "Manage every listing from one elegant dashboard."},
                {"title": "Analytics Dashboard", "description": "Understand views, leads and market demand live."},
                {"title": "Powerful CRM", "description": "Never lose a lead with an intelligent pipeline."},
                {"title": "Marketing Tools", "description": "Boost, promote and syndicate listings effortlessly."},
            ],
        }),
        s("construction", "Construction Professionals", {
            "overline": "Construction Professionals",
            "title": "Verified experts for every build.",
            "cta_label": "Join as a Professional",
            "items": [
                {"name": "Electricians", "count": "1,200+ verified"},
                {"name": "Plumbers", "count": "980+ verified"},
                {"name": "Architects", "count": "640+ verified"},
                {"name": "Builders", "count": "1,800+ verified"},
                {"name": "Painters", "count": "760+ verified"},
                {"name": "Surveyors", "count": "420+ verified"},
                {"name": "Interior Designers", "count": "530+ verified"},
                {"name": "Equipment Vendors", "count": "310+ verified"},
            ],
        }),
        s("home_marketplace", "Home Marketplace", {
            "overline": "Home Marketplace",
            "title": "Furnish every corner, beautifully.",
            "items": [
                {"name": "Furniture", "price": "from ₦85k", "image": "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?q=80&w=800&auto=format&fit=crop"},
                {"name": "Kitchen", "price": "from ₦40k", "image": "https://images.unsplash.com/photo-1556909212-d5b604d0c90d?q=80&w=800&auto=format&fit=crop"},
                {"name": "Electronics", "price": "from ₦120k", "image": "https://images.unsplash.com/photo-1498049794561-7780e7231661?q=80&w=800&auto=format&fit=crop"},
                {"name": "Appliances", "price": "from ₦95k", "image": "https://images.unsplash.com/photo-1585659722983-3a675dabf23d?q=80&w=800&auto=format&fit=crop"},
                {"name": "Lighting", "price": "from ₦18k", "image": "https://images.unsplash.com/photo-1524758631624-e2822e304c36?q=80&w=800&auto=format&fit=crop"},
                {"name": "Decoration", "price": "from ₦12k", "image": "https://images.unsplash.com/photo-1513161455079-7dc1de15ef3e?q=80&w=800&auto=format&fit=crop"},
            ],
        }),
        s("mobile", "AMASS Mobile", {
            "overline": "AMASS Mobile",
            "title": "The entire property market, in your pocket.",
            "description": "Explore satellite maps, chat with verified agents, get AI valuations and complete transactions — with a beautiful light and dark experience.",
            "features": "Live Map, AI Assistant, Secure Messages",
            "app_store_link": "#", "play_store_link": "#",
        }),
        s("testimonials", "Testimonials", {
            "overline": "Testimonials",
            "title": "Loved by buyers, investors and builders alike.",
            "items": [
                {"quote": "AMASS turned a 3-month search into a weekend. The verification alone saved me from two fraudulent listings.", "name": "Adebayo Ogunlesi", "role": "Property Investor · Lagos", "image": "https://images.pexels.com/photos/36053652/pexels-photo-36053652.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop"},
                {"quote": "I bought my first apartment in East Legon entirely through AMASS. Escrow made the payment feel completely safe.", "name": "Ama Mensah", "role": "First-time Buyer · Accra", "image": "https://images.pexels.com/photos/5999896/pexels-photo-5999896.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop"},
                {"quote": "My leads tripled in the first month. The CRM and analytics are genuinely better than tools I paid for.", "name": "Chinedu Okafor", "role": "Verified Agent · Abuja", "image": "https://images.pexels.com/photos/13801446/pexels-photo-13801446.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop"},
                {"quote": "We sold out a 40-unit development off-plan using AMASS new-development tools. Remarkable reach across Africa.", "name": "Wanjiru Kamau", "role": "Developer · Nairobi", "image": "https://images.pexels.com/photos/5905901/pexels-photo-5905901.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop"},
                {"quote": "Sourcing materials and vetted professionals in one marketplace cut our procurement time in half.", "name": "Emeka Nwankwo", "role": "Construction Co. · Kigali", "image": "https://images.pexels.com/photos/13801474/pexels-photo-13801474.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop"},
            ],
        }),
        s("faq", "FAQ", {
            "overline": "FAQ",
            "title": "Questions, answered.",
            "subtitle": "Everything you need to know about buying, listing and building with AMASS.",
            "items": [
                {"q": "Where is AMASS available across Africa?", "a": "AMASS is live in 20+ cities including Lagos, Abuja, Accra, Nairobi, Kigali and Cape Town, and is expanding rapidly across the continent."},
                {"q": "How does AMASS verify listings?", "a": "Every listing goes through document checks, ownership validation and agent identity verification before it is published."},
                {"q": "Are transactions safe?", "a": "Yes. All payments are escrow-protected and processed through secure, regulated payment partners."},
                {"q": "What is AMASS Property Intelligence?", "a": "It combines satellite discovery, market analytics, valuations and neighbourhood insights to turn guesswork into certainty."},
                {"q": "How do I become an AMASS agent?", "a": "Tap 'Become an Agent', complete your verified profile and start listing to reach millions of active buyers."},
                {"q": "Does AMASS offer financing?", "a": "Yes — mortgages, BNPL, loans and insurance are available directly through our Financial Services pillar."},
            ],
        }),
        s("final_cta", "Final CTA", {
            "overline": "Start Today",
            "title": "Find Your Next Property Today",
            "description": "Join the platform redefining how Africa discovers, verifies and owns property.",
            "primary_cta_label": "Get Early Access", "primary_cta_link": "#waitlist",
            "secondary_cta_label": "Download App", "secondary_cta_link": "#download",
            "background_image": "https://images.pexels.com/photos/27741697/pexels-photo-27741697.jpeg?auto=compress&cs=tinysrgb&w=2400",
        }),
        s("contact", "Contact Information", {
            "email": "hello@amass.africa", "phone": "+234 800 000 0000",
            "address": "Victoria Island, Lagos, Nigeria",
        }),
        s("social", "Social Media Links", {
            "twitter": "https://twitter.com/amass", "linkedin": "https://linkedin.com/company/amass",
            "instagram": "https://instagram.com/amass", "facebook": "https://facebook.com/amass",
        }),
        s("footer", "Footer", {
            "tagline": "Africa's intelligent property discovery, real estate, construction and home marketplace.",
            "copyright": "© 2026 AMASS. All rights reserved.",
        }),
        s("seo", "SEO Settings", {
            "meta_title": "AMASS | Discover Africa's Properties Like Never Before",
            "meta_description": "AMASS — Africa's intelligent property discovery, real estate, construction and home marketplace. Search, verify, buy, rent and finance properties with AI-powered intelligence and interactive maps.",
            "meta_keywords": "africa real estate, property marketplace, verified listings, property intelligence, construction marketplace, mortgage",
            "og_image": "https://images.pexels.com/photos/27741697/pexels-photo-27741697.jpeg?auto=compress&cs=tinysrgb&w=2400",
        }),
    ]


async def seed_demo_data():
    first = ["Amara", "David", "Chinwe", "Kwame", "Zainab", "Tunde", "Fatima", "Emeka", "Lerato", "Kofi", "Ngozi", "Sipho"]
    last = ["Okafor", "Mwangi", "Bello", "Mensah", "Adeyemi", "Dlamini", "Nwosu", "Osei", "Kamau", "Achebe"]
    statuses = ["New", "Contacted", "Closed"]
    types = list(LEAD_TYPES.keys())
    messages = {
        "agent": "I'd like to become a verified AMASS agent.",
        "contact": "I have a question about your platform.",
        "demo": "Please schedule a product demo for our team.",
        "partner": "We'd love to explore a partnership.",
        "property": "I want to list my property on AMASS.",
        "newsletter": "", "waitlist": "Add me to the early access waiting list.",
    }
    leads = []
    for i in range(46):
        t = random.choice(types)
        fn, ln = random.choice(first), random.choice(last)
        days_ago = random.randint(0, 13)
        created = (datetime.now(timezone.utc) - timedelta(days=days_ago, hours=random.randint(0, 23))).isoformat()
        leads.append({
            "id": new_id(), "type": t, "name": f"{fn} {ln}",
            "email": f"{fn.lower()}.{ln.lower()}@example.com", "phone": f"+234 80{random.randint(10000000, 99999999)}",
            "message": messages[t], "status": random.choice(statuses), "created_at": created,
        })
    # ensure a few from today
    for _ in range(4):
        fn, ln = random.choice(first), random.choice(last)
        leads.append({"id": new_id(), "type": random.choice(types), "name": f"{fn} {ln}",
                      "email": f"{fn.lower()}.{ln.lower()}@example.com", "phone": "+234 8000000000",
                      "message": "New enquiry today.", "status": "New", "created_at": now_iso()})
    await db.leads.insert_many(leads)

    agents = [{"id": new_id(), "name": f"{random.choice(first)} {random.choice(last)}",
               "email": f"agent{i}@amass.africa", "city": random.choice(["Lagos", "Nairobi", "Accra", "Cairo"]),
               "verified": random.choice([True, False]), "created_at": now_iso()} for i in range(14)]
    await db.agents.insert_many(agents)

    users = [{"id": new_id(), "name": f"{random.choice(first)} {random.choice(last)}",
              "email": f"user{i}@example.com", "created_at": now_iso()} for i in range(52)]
    await db.platform_users.insert_many(users)

    props = []
    for i in range(38):
        props.append({"id": new_id(), "title": f"Property #{1000 + i}",
                      "city": random.choice(["Lagos", "Nairobi", "Accra", "Cairo", "Kigali"]),
                      "price": random.randint(50, 800) * 1000,
                      "status": random.choice(["approved", "approved", "approved", "pending"]),
                      "created_at": now_iso()})
    await db.properties.insert_many(props)

    acts = [
        ("submitted a new lead", "lead"), ("registered as an agent", "agent"),
        ("listed a new property", "property"), ("updated the hero section", "cms"),
        ("subscribed to newsletter", "lead"), ("booked a demo", "lead"),
        ("approved a property", "property"), ("joined the waiting list", "lead"),
    ]
    activities = []
    for i, (a, e) in enumerate(acts * 2):
        activities.append({"id": new_id(), "action": a, "entity": e,
                           "user_name": f"{random.choice(first)} {random.choice(last)}", "user_email": "",
                           "meta": "", "created_at": (datetime.now(timezone.utc) - timedelta(hours=i * 3)).isoformat()})
    await db.activities.insert_many(activities)


@app.on_event("startup")
async def on_startup():
    await seed()


@api.get("/")
async def root():
    return {"message": "AMASS Admin Portal API"}


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
