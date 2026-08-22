"""AMASS - Africa's Property Operating System — Backend API"""
import os
import uuid
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List, Optional, Literal, AsyncGenerator

import bcrypt
import jwt
from dotenv import load_dotenv

# CRITICAL: load .env BEFORE importing token module (which reads JWT_SECRET at import time)
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from fastapi import FastAPI, APIRouter, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field

from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone

from marketplace_seed import VENDORS, COLLECTIONS, MARKET_ITEMS
from marketplace_c2c_seed import C2C_ITEMS as C2C_MARKET_ITEMS
from fixa_seed import FIXA_PROVIDERS
from tokens import register_token_routes, compute_token_cost, has_unlocked, is_free_amass_sale, WalletService, FIX_EARN_RULES
from earn_and_tools import register_earn_routes, register_agent_tool_routes
from ads import register_ads_routes
from marketplace_v2 import register_marketplace_v2_routes

# ─── Config ───────────────────────────────────────────────
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ.get("JWT_SECRET")
if not JWT_SECRET or len(JWT_SECRET) < 24:
    raise RuntimeError(
        "JWT_SECRET is missing or too weak. Set a strong JWT_SECRET "
        "(>=24 chars) in backend/.env before starting the API."
    )
JWT_ALG = "HS256"
JWT_EXPIRES_DAYS = 30
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")

# Admin allow-list — comma-separated emails allowed to run privileged ops
# (seeding, referral qualify/payout, etc.). Fallback keeps the demo account
# admin so the pre-configured demo flow keeps working.
ADMIN_EMAILS = {
    e.strip().lower()
    for e in os.environ.get("ADMIN_EMAILS", "demo@amass.africa,admin@amass.africa").split(",")
    if e.strip()
}

# ─── DB ───────────────────────────────────────────────────
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

# ─── App ──────────────────────────────────────────────────
app = FastAPI(title="AMASS API")
api = APIRouter(prefix="/api")
bearer = HTTPBearer(auto_error=False)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("amass")


# ─── Models ───────────────────────────────────────────────
class UserOut(BaseModel):
    id: str
    email: str
    full_name: str
    phone: Optional[str] = None
    phone_verified: bool = False
    avatar_url: Optional[str] = None
    city: Optional[str] = None
    bio: Optional[str] = None
    is_agent: bool = False
    is_admin: bool = False
    referral_code: Optional[str] = None
    created_at: datetime


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    full_name: str
    phone: Optional[str] = None


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class Property(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    description: str
    price: int  # Naira
    currency: str = "NGN"
    listing_type: Literal["buy", "rent", "lease", "shortlet"]
    property_type: Literal["duplex", "apartment", "bungalow", "land", "commercial", "penthouse", "terrace"]
    bedrooms: int
    bathrooms: int
    size_sqm: int
    location: str
    city: str
    state: str
    country: str = "Nigeria"
    latitude: float
    longitude: float
    images: List[str] = []
    amenities: List[str] = []
    status: Literal["available", "coming_soon", "verified", "premium", "sold"] = "available"
    verified: bool = False
    agent_id: Optional[str] = None
    agent_name: Optional[str] = None
    agent_avatar: Optional[str] = None
    year_built: Optional[int] = None
    parking: Optional[int] = None
    investment_score: Optional[int] = None  # 0-100
    ai_valuation: Optional[int] = None
    # Trust & authority — first-class metadata
    listing_source: Literal[
        "owner_listed", "mandated", "independent", "pending"
    ] = "pending"
    mandate: Optional[dict] = None  # {owner_name, owner_phone, mandate_type, mandate_expiry, docs[]}
    # Token economy — Category 1 = AMASS Exclusive (free), Category 2 = token-gated
    is_amass_exclusive: bool = False
    token_cost: Optional[int] = None  # override; else computed from category
    # Sharing analytics (Phase 3)
    share_count: Optional[int] = 0
    share_by_channel: Optional[dict] = None
    views_count: Optional[int] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class MarketplaceItem(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    category: str  # relaxed — supports c2c cats: vehicles, motorcycles, phones, electronics, furniture, appliances, fashion, tools, equipment, business, services, home, construction, real_estate
    subcategory: str
    name: str
    description: str
    price: int
    original_price: Optional[int] = None
    currency: str = "NGN"
    image: str
    images: List[str] = []
    vendor: str
    vendor_id: Optional[str] = None
    rating: float = 4.5
    reviews: int = 0
    location: Optional[str] = None
    city: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    verified: bool = False
    delivery: bool = True
    delivery_days: int = 3
    brand: Optional[str] = None
    condition: Literal["new", "used", "refurbished", "for_parts"] = "new"
    stock: int = 25
    specs: dict = Field(default_factory=dict)
    tags: List[str] = []
    popular: bool = False
    on_sale: bool = False
    # ─── Classifieds (OfferUp / Letgo style) ────────────────
    posted_at: Optional[str] = None  # ISO string; falls back to created_at
    views: int = 0
    saves: int = 0
    is_boosted: bool = False
    is_featured: bool = False
    negotiable: bool = True
    contact_prefs: List[str] = Field(default_factory=lambda: ["chat", "call", "whatsapp"])  # subset of chat/call/whatsapp
    # Seller (C2C / B2C dealer / B2C brand)
    seller_id: Optional[str] = None
    seller_name: Optional[str] = None
    seller_avatar: Optional[str] = None
    seller_phone: Optional[str] = None
    seller_whatsapp: Optional[str] = None
    seller_type: Literal["individual", "dealer", "brand"] = "individual"
    seller_verified: bool = False
    seller_rating: float = 4.7
    seller_reviews: int = 0
    seller_joined_year: int = 2024
    seller_response_time_hours: int = 2
    seller_response_rate: int = 92  # percent
    seller_bio: Optional[str] = None
    # ─── FIXA service-provider extras (only used by services listings) ─
    provider_years_experience: Optional[int] = None
    provider_jobs_completed: Optional[int] = None
    provider_specializations: List[str] = Field(default_factory=list)
    provider_service_areas: List[str] = Field(default_factory=list)
    is_fixa_verified: bool = False
    fixa_badges: List[str] = Field(default_factory=list)  # e.g. ["Background Checked", "Insured", "Top Pro"]


class Vendor(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    tagline: str
    logo: str
    cover: str
    verified: bool = True
    rating: float
    reviews: int
    followers: int
    location: str
    about: str
    contact_phone: str
    contact_email: str
    joined_year: int


class Collection(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    slug: str
    title: str
    subtitle: str
    banner: str
    accent: str
    tag_filter: Optional[str] = None
    category_filter: Optional[str] = None


class Neighborhood(BaseModel):
    id: str
    name: str
    city: str
    state: str
    image: str
    avg_price: int
    price_change_pct: float
    walk_score: int
    school_score: int
    safety_score: int
    infrastructure_score: int
    overall_score: int
    latitude: float
    longitude: float
    trending: bool = False


class FavoriteToggleIn(BaseModel):
    property_id: str


class AiSearchIn(BaseModel):
    query: str
    session_id: Optional[str] = None


# ─── Auth utils ───────────────────────────────────────────
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=JWT_EXPIRES_DAYS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


async def get_current_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
) -> dict:
    if not creds:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALG])
        user_id = payload.get("sub")
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid token")
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(401, "User not found")
    # Normalize admin flag from allow-list or explicit doc field.
    email = (user.get("email") or "").lower()
    user["is_admin"] = bool(user.get("is_admin")) or email in ADMIN_EMAILS
    return user


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if not user.get("is_admin"):
        raise HTTPException(403, "Admin only")
    return user


def user_to_out(u: dict) -> UserOut:
    email = (u.get("email") or "").lower()
    is_admin = bool(u.get("is_admin")) or email in ADMIN_EMAILS
    return UserOut(
        id=u["id"],
        email=u["email"],
        full_name=u["full_name"],
        phone=u.get("phone"),
        avatar_url=u.get("avatar_url"),
        is_agent=u.get("is_agent", False),
        is_admin=is_admin,
        created_at=u["created_at"],
    )


# ─── Auth endpoints ───────────────────────────────────────
@api.post("/auth/register", response_model=TokenOut)
async def register(data: RegisterIn):
    existing = await db.users.find_one({"email": data.email.lower()})
    if existing:
        raise HTTPException(400, "Email already registered")
    user_id = str(uuid.uuid4())
    user_doc = {
        "id": user_id,
        "email": data.email.lower(),
        "password_hash": hash_password(data.password),
        "full_name": data.full_name,
        "phone": data.phone,
        "avatar_url": None,
        "is_agent": False,
        "created_at": datetime.now(timezone.utc),
    }
    await db.users.insert_one(user_doc)
    return TokenOut(access_token=create_token(user_id), user=user_to_out(user_doc))


@api.post("/auth/login", response_model=TokenOut)
async def login(data: LoginIn):
    user = await db.users.find_one({"email": data.email.lower()})
    if not user or not verify_password(data.password, user.get("password_hash", "")):
        raise HTTPException(401, "Invalid email or password")
    return TokenOut(access_token=create_token(user["id"]), user=user_to_out(user))


@api.get("/auth/me", response_model=UserOut)
async def me(user: dict = Depends(get_current_user)):
    return user_to_out(user)


# ─── Properties ───────────────────────────────────────────
@api.get("/properties")
async def list_properties(
    listing_type: Optional[str] = None,
    property_type: Optional[str] = None,
    min_price: Optional[int] = None,
    max_price: Optional[int] = None,
    bedrooms: Optional[int] = None,
    city: Optional[str] = None,
    verified: Optional[bool] = None,
    listing_source: Optional[str] = None,
    q: Optional[str] = None,
    token_filter: Optional[Literal["free", "token", "amass_exclusive"]] = None,
    # Viewport (bounding box) filter — lazy-load only listings visible on screen.
    min_lat: Optional[float] = None,
    max_lat: Optional[float] = None,
    min_lng: Optional[float] = None,
    max_lng: Optional[float] = None,
    limit: int = 100,
    creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
):
    query: dict = {}
    if listing_type:
        query["listing_type"] = listing_type
    if property_type:
        query["property_type"] = property_type
    if bedrooms is not None:
        query["bedrooms"] = {"$gte": bedrooms}
    if city:
        query["city"] = {"$regex": city, "$options": "i"}
    if verified is not None:
        query["verified"] = verified
    if listing_source:
        query["listing_source"] = listing_source
    if token_filter == "amass_exclusive":
        query["is_amass_exclusive"] = True
    elif token_filter == "free":
        query["is_amass_exclusive"] = True
    elif token_filter == "token":
        query["is_amass_exclusive"] = {"$ne": True}
    if min_lat is not None and max_lat is not None:
        query["latitude"] = {"$gte": min_lat, "$lte": max_lat}
    if min_lng is not None and max_lng is not None:
        query["longitude"] = {"$gte": min_lng, "$lte": max_lng}
    if min_price is not None or max_price is not None:
        price_q: dict = {}
        if min_price is not None:
            price_q["$gte"] = min_price
        if max_price is not None:
            price_q["$lte"] = max_price
        query["price"] = price_q
    if q:
        query["$or"] = [
            {"title": {"$regex": q, "$options": "i"}},
            {"location": {"$regex": q, "$options": "i"}},
            {"city": {"$regex": q, "$options": "i"}},
            {"description": {"$regex": q, "$options": "i"}},
        ]
    docs = await db.properties.find(query, {"_id": 0}).limit(limit).to_list(limit)

    # Determine current user (optional) for personalized unlock flags
    user_id: Optional[str] = None
    if creds:
        try:
            payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALG])
            user_id = payload.get("sub")
        except jwt.PyJWTError:
            user_id = None

    unlocked_ids: set = set()
    if user_id and docs:
        now = datetime.now(timezone.utc)
        cursor = db.property_unlocks.find(
            {
                "user_id": user_id,
                "property_id": {"$in": [d["id"] for d in docs]},
                "$or": [{"expires_at": None}, {"expires_at": {"$gt": now}}],
            },
            {"_id": 0, "property_id": 1},
        )
        async for r in cursor:
            unlocked_ids.add(r["property_id"])

    # Enrich with recent view/favorite counts (last 7 days) + token economy fields.
    if docs:
        ids = [p["id"] for p in docs]
        since = datetime.now(timezone.utc) - timedelta(days=7)
        pipeline = [
            {"$match": {"property_id": {"$in": ids}, "created_at": {"$gte": since}}},
            {"$group": {"_id": {"pid": "$property_id", "type": "$event_type"}, "count": {"$sum": 1}}},
        ]
        counts: dict = {pid: {"views_recent": 0, "favorites_recent": 0} for pid in ids}
        async for row in db.property_events.aggregate(pipeline):
            pid = row["_id"]["pid"]
            t = row["_id"]["type"]
            if t == "view":
                counts[pid]["views_recent"] = row["count"]
            elif t == "favorite":
                counts[pid]["favorites_recent"] = row["count"]
        for p in docs:
            c = counts.get(p["id"], {"views_recent": 0, "favorites_recent": 0})
            p["views_recent"] = c["views_recent"]
            p["favorites_recent"] = c["favorites_recent"]
    # Always add token economy fields on each item
    for p in docs:
        p["is_amass_exclusive"] = bool(p.get("is_amass_exclusive", False))
        p["is_free_amass_sale"] = is_free_amass_sale(p)
        p["token_cost"] = compute_token_cost(p)
        # Free-AMASS-sale is always "unlocked" for everyone.
        p["unlocked"] = p["is_free_amass_sale"] or (p["id"] in unlocked_ids if user_id else False)
    return docs


@api.get("/properties/{property_id}")
async def get_property(
    property_id: str,
    creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
):
    doc = await db.properties.find_one({"id": property_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Property not found")
    user_id: Optional[str] = None
    if creds:
        try:
            payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALG])
            user_id = payload.get("sub")
        except jwt.PyJWTError:
            user_id = None

    is_exclusive = bool(doc.get("is_amass_exclusive", False))
    is_free = is_free_amass_sale(doc)
    token_cost = compute_token_cost(doc)
    doc["is_amass_exclusive"] = is_exclusive
    doc["is_free_amass_sale"] = is_free
    doc["token_cost"] = token_cost

    unlocked = is_free
    if not unlocked and user_id:
        unlocked = await has_unlocked(db, user_id, property_id)

    doc["unlocked"] = unlocked

    if not unlocked:
        # Return only public preview — strip premium information.
        # Keep only first image, city-level location, no exact address / agent contact.
        first_image = doc["images"][0] if doc.get("images") else None
        preview_desc = (doc.get("description") or "")[:120]
        if len(doc.get("description") or "") > 120:
            preview_desc += "…"
        return {
            "id": doc["id"],
            "title": doc["title"],
            "description": preview_desc,
            "price": doc["price"],
            "currency": doc.get("currency", "NGN"),
            "listing_type": doc["listing_type"],
            "property_type": doc["property_type"],
            "bedrooms": doc["bedrooms"],
            "bathrooms": doc.get("bathrooms", 0),
            "size_sqm": doc.get("size_sqm", 0),
            "location": doc.get("city", ""),  # City-level only
            "city": doc.get("city", ""),
            "state": doc.get("state", ""),
            "country": doc.get("country", "Nigeria"),
            "latitude": doc["latitude"],
            "longitude": doc["longitude"],
            "images": [first_image] if first_image else [],
            "amenities": [],
            "status": doc.get("status", "available"),
            "verified": doc.get("verified", False),
            "listing_source": doc.get("listing_source", "pending"),
            "agent_name": None,
            "agent_avatar": None,
            "agent_id": None,
            "year_built": None,
            "parking": None,
            "investment_score": None,
            "ai_valuation": None,
            "mandate": None,
            "views_recent": doc.get("views_recent", 0),
            "favorites_recent": doc.get("favorites_recent", 0),
            "is_amass_exclusive": False,
            "token_cost": token_cost,
            "unlocked": False,
        }
    doc["views_recent"] = doc.get("views_recent", 0)
    doc["favorites_recent"] = doc.get("favorites_recent", 0)
    return doc


# ─── Analytics events ────────────────────────────────────
async def log_event(property_id: str, event_type: str, user_id: Optional[str] = None):
    """Insert an event. `view` events are deduped per user+property per day
    to avoid inflating counts on refreshes."""
    now = datetime.now(timezone.utc)
    if event_type == "view":
        # Dedupe key
        day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        existing = await db.property_events.find_one(
            {
                "property_id": property_id,
                "event_type": "view",
                "user_id": user_id,
                "created_at": {"$gte": day_start},
            }
        )
        if existing:
            return
    await db.property_events.insert_one(
        {
            "id": str(uuid.uuid4()),
            "property_id": property_id,
            "user_id": user_id,
            "event_type": event_type,
            "created_at": now,
        }
    )


@api.post("/properties/{property_id}/view")
async def record_view(
    property_id: str,
    creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
):
    prop = await db.properties.find_one({"id": property_id}, {"id": 1, "_id": 0})
    if not prop:
        raise HTTPException(404, "Property not found")
    user_id: Optional[str] = None
    if creds:
        try:
            payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALG])
            user_id = payload.get("sub")
        except jwt.PyJWTError:
            user_id = None
    await log_event(property_id, "view", user_id)
    return {"ok": True}


# ─── Property submission (Agent) ─────────────────────────
class MandateIn(BaseModel):
    owner_name: str
    owner_phone: str
    mandate_type: Literal["exclusive", "sole", "open", "verbal"]
    mandate_expiry: Optional[str] = None  # ISO date
    documents: List[str] = []


class PropertyCreateIn(BaseModel):
    title: str
    description: str
    price: int
    listing_type: Literal["buy", "rent", "lease", "shortlet"]
    property_type: Literal["duplex", "apartment", "bungalow", "land", "commercial", "penthouse", "terrace"]
    bedrooms: int = 0
    bathrooms: int = 0
    size_sqm: int
    location: str
    city: str
    state: str
    country: str = "Nigeria"
    latitude: float
    longitude: float
    images: List[str] = []
    amenities: List[str] = []
    year_built: Optional[int] = None
    parking: Optional[int] = None
    # Trust & authority
    is_owner: bool = False
    has_mandate: bool = False
    mandate: Optional[MandateIn] = None


@api.post("/properties", response_model=Property)
async def create_property(data: PropertyCreateIn, user: dict = Depends(get_current_user)):
    # SECURITY: enforce per-plan listing quota server-side (frontend limits
    # are advisory only). Raises HTTP 402 with an "upgrade" hint payload.
    await check_listing_quota(db, user["id"])

    # Determine listing_source
    if data.is_owner:
        listing_source: str = "owner_listed"
    elif data.has_mandate and data.mandate:
        # Mandate submitted — starts as pending until admin verifies (unless the
        # agent is already an approved Level-3 mandated agent).
        agent_app = await db.agent_applications.find_one(
            {"user_id": user["id"], "status": "approved", "verification_level": {"$gte": 3}}
        )
        listing_source = "mandated" if agent_app else "pending"
    else:
        # Agent is marketing without a confirmed mandate
        listing_source = "independent"

    prop_kwargs = data.model_dump(exclude={"is_owner", "has_mandate", "mandate"})
    prop = Property(
        **prop_kwargs,
        status="coming_soon",
        verified=False,
        agent_id=user["id"],
        agent_name=user["full_name"],
        agent_avatar=user.get("avatar_url"),
        listing_source=listing_source,
        mandate=data.mandate.model_dump() if data.mandate else None,
    )
    await db.properties.insert_one(prop.model_dump())
    if not user.get("is_agent"):
        await db.users.update_one({"id": user["id"]}, {"$set": {"is_agent": True}})
    # Reward: 40 tokens for uploading a property (rate-limited to 5/day server-side).
    try:
        from tokens import WalletService as _WS
        _svc = _WS(db)
        today = datetime.now(timezone.utc).date().isoformat()
        cnt = await db.token_transactions.count_documents(
            {
                "user_id": user["id"],
                "kind": "earn_reward",
                "meta.task_id": "upload_property",
                "meta.date": today,
            }
        )
        if cnt < 5:
            await _svc.credit(
                user["id"],
                40,
                "earn_reward",
                "Reward: Uploaded a property",
                meta={"task_id": "upload_property", "date": today, "property_id": prop.id},
            )
    except Exception:
        logger.exception("failed to award upload_property")

    # After crediting: check whether this listing brings the agent to
    # 5+ verified quality listings → mark Starter Kit eligible.
    try:
        await maybe_mark_starter_kit_eligible(db, user["id"])
    except Exception:
        logger.exception("starter kit eligibility check failed")

    return prop


# ─── Become an Agent ─────────────────────────────────────
class AgentApplyIn(BaseModel):
    # Personal
    full_name: str
    phone: str
    email: str
    nin: Optional[str] = None
    id_document_url: Optional[str] = None
    selfie_url: Optional[str] = None
    # Business
    agency_name: Optional[str] = None
    cac_number: Optional[str] = None
    office_address: Optional[str] = None
    state: str
    lga: Optional[str] = None
    years_experience: int = 0
    # Coverage & specialisation
    areas_of_operation: List[str] = []
    specialisations: List[str] = []
    # Mandate declaration
    has_mandate_authority: bool = False


class AgentPublic(BaseModel):
    id: str
    user_id: str
    full_name: str
    phone: str
    email: str
    agency_name: Optional[str] = None
    office_address: Optional[str] = None
    state: str
    lga: Optional[str] = None
    years_experience: int
    areas_of_operation: List[str]
    specialisations: List[str]
    verification_level: int  # 1 basic, 2 identity, 3 mandated
    verification_badge: str  # "Registered Agent" | "Identity Verified" | "Verified Mandated Agent"
    status: Literal["pending", "approved", "rejected", "suspended"]
    avatar_url: Optional[str] = None
    rating: float = 0.0
    reviews_count: int = 0
    active_listings: int = 0
    total_sold: int = 0
    total_rented: int = 0
    mandate_verification_rate: float = 0.0
    created_at: datetime


def _badge_for(level: int) -> str:
    if level >= 3:
        return "Verified Mandated Agent"
    if level == 2:
        return "Identity Verified"
    return "Registered Agent"


@api.post("/agents/apply", response_model=AgentPublic)
async def agent_apply(data: AgentApplyIn, user: dict = Depends(get_current_user)):
    existing = await db.agent_applications.find_one({"user_id": user["id"]})

    # Compute initial verification level (self-declared, admin later upgrades).
    verification_level = 1
    if data.id_document_url and data.selfie_url:
        verification_level = 2

    now = datetime.now(timezone.utc)
    doc = {
        "user_id": user["id"],
        "full_name": data.full_name,
        "phone": data.phone,
        "email": data.email,
        "nin": data.nin,
        "id_document_url": data.id_document_url,
        "selfie_url": data.selfie_url,
        "agency_name": data.agency_name,
        "cac_number": data.cac_number,
        "office_address": data.office_address,
        "state": data.state,
        "lga": data.lga,
        "years_experience": data.years_experience,
        "areas_of_operation": data.areas_of_operation,
        "specialisations": data.specialisations,
        "has_mandate_authority": data.has_mandate_authority,
        "verification_level": verification_level,
        "status": "pending",
        "updated_at": now,
    }

    if existing:
        await db.agent_applications.update_one({"user_id": user["id"]}, {"$set": doc})
        agent = await db.agent_applications.find_one({"user_id": user["id"]}, {"_id": 0})
    else:
        doc["id"] = str(uuid.uuid4())
        doc["created_at"] = now
        doc["avatar_url"] = user.get("avatar_url")
        doc["rating"] = 0.0
        doc["reviews_count"] = 0
        await db.agent_applications.insert_one(doc)
        agent = doc

    # Mark user as agent
    await db.users.update_one({"id": user["id"]}, {"$set": {"is_agent": True}})

    return _agent_to_public(agent)


async def _agent_stats(user_id: str) -> dict:
    listings = await db.properties.find({"agent_id": user_id}, {"_id": 0, "status": 1, "listing_source": 1}).to_list(500)
    active = [p for p in listings if p.get("status") not in ("sold",)]
    sold = [p for p in listings if p.get("status") == "sold"]
    mandated = [p for p in listings if p.get("listing_source") == "mandated"]
    rate = (len(mandated) / len(listings)) if listings else 0.0
    return {
        "active_listings": len(active),
        "total_sold": len(sold),
        "total_rented": 0,
        "mandate_verification_rate": round(rate, 2),
    }


def _agent_to_public(doc: dict) -> AgentPublic:
    return AgentPublic(
        id=doc.get("id", ""),
        user_id=doc["user_id"],
        full_name=doc["full_name"],
        phone=doc["phone"],
        email=doc["email"],
        agency_name=doc.get("agency_name"),
        office_address=doc.get("office_address"),
        state=doc["state"],
        lga=doc.get("lga"),
        years_experience=doc.get("years_experience", 0),
        areas_of_operation=doc.get("areas_of_operation", []) or [],
        specialisations=doc.get("specialisations", []) or [],
        verification_level=doc.get("verification_level", 1),
        verification_badge=_badge_for(doc.get("verification_level", 1)),
        status=doc.get("status", "pending"),
        avatar_url=doc.get("avatar_url"),
        rating=doc.get("rating", 0.0),
        reviews_count=doc.get("reviews_count", 0),
        active_listings=0,
        total_sold=0,
        total_rented=0,
        mandate_verification_rate=0.0,
        created_at=doc.get("created_at", datetime.now(timezone.utc)),
    )


@api.get("/agents/me", response_model=AgentPublic)
async def agent_me(user: dict = Depends(get_current_user)):
    doc = await db.agent_applications.find_one({"user_id": user["id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "No agent application yet")
    out = _agent_to_public(doc)
    stats = await _agent_stats(user["id"])
    out.active_listings = stats["active_listings"]
    out.total_sold = stats["total_sold"]
    out.total_rented = stats["total_rented"]
    out.mandate_verification_rate = stats["mandate_verification_rate"]
    return out


@api.get("/agents/{user_id}", response_model=AgentPublic)
async def get_agent(user_id: str):
    doc = await db.agent_applications.find_one({"user_id": user_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Agent not found")
    out = _agent_to_public(doc)
    stats = await _agent_stats(user_id)
    out.active_listings = stats["active_listings"]
    out.total_sold = stats["total_sold"]
    out.total_rented = stats["total_rented"]
    out.mandate_verification_rate = stats["mandate_verification_rate"]
    return out


@api.get("/agents/{user_id}/listings")
async def agent_listings_public(user_id: str):
    docs = await db.properties.find({"agent_id": user_id}, {"_id": 0}).to_list(200)
    return docs


# ─── Agent dashboard ─────────────────────────────────────
@api.get("/agent/listings")
async def agent_listings(user: dict = Depends(get_current_user)):
    docs = await db.properties.find({"agent_id": user["id"]}, {"_id": 0}).to_list(500)
    return docs


@api.get("/agent/dashboard")
async def agent_dashboard(user: dict = Depends(get_current_user)):
    listings = await db.properties.find({"agent_id": user["id"]}, {"_id": 0}).to_list(500)
    active = [p for p in listings if p.get("status") != "sold"]
    verified = [p for p in listings if p.get("verified")]
    total_value = sum(int(p.get("price", 0)) for p in active)

    listing_ids = [p["id"] for p in listings]
    since = datetime.now(timezone.utc) - timedelta(days=30)

    views_30d = 0
    favorites_30d = 0
    if listing_ids:
        views_30d = await db.property_events.count_documents(
            {
                "property_id": {"$in": listing_ids},
                "event_type": "view",
                "created_at": {"$gte": since},
            }
        )
        favorites_30d = await db.property_events.count_documents(
            {
                "property_id": {"$in": listing_ids},
                "event_type": "favorite",
                "created_at": {"$gte": since},
            }
        )

    return {
        "stats": {
            "listings": len(listings),
            "active": len(active),
            "verified": len(verified),
            "views_30d": views_30d,
            "favorites_30d": favorites_30d,
            "total_value": total_value,
        },
        "recent": listings[:5],
    }


@api.get("/agent/listings-analytics")
async def agent_listings_analytics(user: dict = Depends(get_current_user)):
    """Per-listing view + favorite counts for the current agent."""
    listings = await db.properties.find({"agent_id": user["id"]}, {"_id": 0}).to_list(500)
    listing_ids = [p["id"] for p in listings]
    if not listing_ids:
        return []

    pipeline = [
        {"$match": {"property_id": {"$in": listing_ids}}},
        {"$group": {"_id": {"pid": "$property_id", "type": "$event_type"}, "count": {"$sum": 1}}},
    ]
    agg = await db.property_events.aggregate(pipeline).to_list(1000)

    counts: dict = {pid: {"views": 0, "favorites": 0} for pid in listing_ids}
    for row in agg:
        pid = row["_id"]["pid"]
        t = row["_id"]["type"]
        if pid not in counts:
            continue
        if t == "view":
            counts[pid]["views"] = row["count"]
        elif t == "favorite":
            counts[pid]["favorites"] = row["count"]

    return [
        {
            "property_id": p["id"],
            "title": p["title"],
            "image": (p.get("images") or [""])[0],
            "price": p["price"],
            "status": p.get("status"),
            "verified": p.get("verified", False),
            "views": counts[p["id"]]["views"],
            "favorites": counts[p["id"]]["favorites"],
        }
        for p in listings
    ]


@api.get("/agent/leads")
async def agent_leads(user: dict = Depends(get_current_user)):
    listings = await db.properties.find({"agent_id": user["id"]}, {"_id": 0}).to_list(500)
    if not listings:
        return []
    # Generate mock leads tied to real listings so the dashboard feels live.
    LEAD_TEMPLATES = [
        {"name": "Chidinma Eze", "avatar": "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200", "channel": "chat", "message": "Is this still available? Can I inspect on Saturday?"},
        {"name": "Tobi Adeyemi", "avatar": "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200", "channel": "call", "message": "Missed call — interested in a viewing this week."},
        {"name": "Amaka Nwosu", "avatar": "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=200", "channel": "chat", "message": "What's the minimum down payment for this unit?"},
        {"name": "Fola Ojo", "avatar": "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=200", "channel": "email", "message": "Requesting the C of O documents ahead of inspection."},
        {"name": "Zainab Musa", "avatar": "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=200", "channel": "chat", "message": "Any flexibility on the price? Serious buyer."},
    ]
    leads = []
    for i, tmpl in enumerate(LEAD_TEMPLATES):
        prop = listings[i % len(listings)]
        leads.append(
            {
                "id": f"lead-{i}",
                **tmpl,
                "property_id": prop["id"],
                "property_title": prop["title"],
                "property_image": (prop.get("images") or [""])[0],
                "created_at": (datetime.now(timezone.utc) - timedelta(hours=i * 6 + 1)).isoformat(),
                "unread": i < 2,
            }
        )
    return leads


# ─── Favorites ────────────────────────────────────────────
@api.get("/favorites")
async def list_favorites(user: dict = Depends(get_current_user)):
    docs = await db.favorites.find({"user_id": user["id"]}, {"_id": 0}).to_list(500)
    prop_ids = [d["property_id"] for d in docs]
    props = await db.properties.find({"id": {"$in": prop_ids}}, {"_id": 0}).to_list(500)
    return props


@api.post("/favorites/toggle")
async def toggle_favorite(
    data: FavoriteToggleIn, user: dict = Depends(get_current_user)
):
    existing = await db.favorites.find_one(
        {"user_id": user["id"], "property_id": data.property_id}
    )
    if existing:
        await db.favorites.delete_one(
            {"user_id": user["id"], "property_id": data.property_id}
        )
        await log_event(data.property_id, "unfavorite", user["id"])
        return {"favorited": False}
    await db.favorites.insert_one(
        {
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "property_id": data.property_id,
            "created_at": datetime.now(timezone.utc),
        }
    )
    await log_event(data.property_id, "favorite", user["id"])
    return {"favorited": True}


@api.get("/favorites/ids")
async def favorite_ids(user: dict = Depends(get_current_user)):
    docs = await db.favorites.find({"user_id": user["id"]}, {"_id": 0}).to_list(500)
    return {"ids": [d["property_id"] for d in docs]}


# ─── Marketplace ──────────────────────────────────────────
@api.get("/marketplace")
async def marketplace(
    category: Optional[str] = None,
    subcategory: Optional[str] = None,
    q: Optional[str] = None,
    tag: Optional[str] = None,
    popular: Optional[bool] = None,
    on_sale: Optional[bool] = None,
    min_price: Optional[int] = None,
    max_price: Optional[int] = None,
    verified: Optional[bool] = None,
    condition: Optional[str] = None,
    city: Optional[str] = None,
    seller_type: Optional[str] = None,
    boosted_only: Optional[bool] = None,
    sort: Optional[str] = None,  # newest | price_asc | price_desc | views | saves
    limit: int = 200,
):
    query: dict = {}
    if category:
        query["category"] = category
    if subcategory:
        query["subcategory"] = subcategory
    if tag:
        query["tags"] = tag
    if popular is not None:
        query["popular"] = popular
    if on_sale is not None:
        query["on_sale"] = on_sale
    if verified is not None:
        query["verified"] = verified
    if condition:
        query["condition"] = condition
    if city:
        query["city"] = {"$regex": city, "$options": "i"}
    if seller_type:
        query["seller_type"] = seller_type
    if boosted_only:
        query["is_boosted"] = True
    if min_price is not None or max_price is not None:
        price_q: dict = {}
        if min_price is not None:
            price_q["$gte"] = min_price
        if max_price is not None:
            price_q["$lte"] = max_price
        query["price"] = price_q
    if q:
        query["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"description": {"$regex": q, "$options": "i"}},
            {"subcategory": {"$regex": q, "$options": "i"}},
            {"brand": {"$regex": q, "$options": "i"}},
            {"city": {"$regex": q, "$options": "i"}},
        ]
    cursor = db.marketplace.find(query, {"_id": 0})
    sort_map = {
        "newest": [("posted_at", -1)],
        "price_asc": [("price", 1)],
        "price_desc": [("price", -1)],
        "views": [("views", -1)],
        "saves": [("saves", -1)],
    }
    if sort and sort in sort_map:
        cursor = cursor.sort(sort_map[sort])
    else:
        # default: boosted first, then newest
        cursor = cursor.sort([("is_boosted", -1), ("is_featured", -1), ("posted_at", -1)])
    docs = await cursor.limit(limit).to_list(limit)
    return docs


@api.get("/marketplace/collections")
async def marketplace_collections():
    docs = await db.collections.find({}, {"_id": 0}).to_list(100)
    return docs


@api.get("/marketplace/vendors")
async def marketplace_vendors():
    docs = await db.vendors.find({}, {"_id": 0}).to_list(100)
    return docs


@api.get("/marketplace/vendors/{vendor_id}")
async def marketplace_vendor(vendor_id: str):
    v = await db.vendors.find_one({"id": vendor_id}, {"_id": 0})
    if not v:
        raise HTTPException(404, "Vendor not found")
    items = await db.marketplace.find({"vendor_id": vendor_id}, {"_id": 0}).to_list(200)
    return {"vendor": v, "items": items}


@api.get("/marketplace/items/{item_id}")
async def marketplace_item(item_id: str):
    it = await db.marketplace.find_one({"id": item_id}, {"_id": 0})
    if not it:
        raise HTTPException(404, "Item not found")
    # Related items from the same subcategory
    related = await db.marketplace.find(
        {"subcategory": it["subcategory"], "id": {"$ne": it["id"]}},
        {"_id": 0},
    ).limit(6).to_list(6)
    return {"item": it, "related": related}


@api.post("/marketplace/items/{item_id}/view")
async def record_marketplace_view(item_id: str, user: dict = Depends(get_current_user)):
    it = await db.marketplace.find_one({"id": item_id}, {"id": 1, "_id": 0})
    if not it:
        raise HTTPException(404, "Item not found")
    now = datetime.now(timezone.utc)
    # Pull existing then re-insert to keep newest-first & dedupe
    await db.users.update_one(
        {"id": user["id"]},
        {
            "$pull": {"recently_viewed_market": {"item_id": item_id}},
        },
    )
    await db.users.update_one(
        {"id": user["id"]},
        {
            "$push": {
                "recently_viewed_market": {
                    "$each": [{"item_id": item_id, "viewed_at": now}],
                    "$position": 0,
                    "$slice": 20,
                }
            }
        },
    )
    return {"ok": True}


@api.get("/marketplace/recently-viewed")
async def marketplace_recently_viewed(user: dict = Depends(get_current_user)):
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0, "recently_viewed_market": 1})
    if not u:
        return []
    rows = u.get("recently_viewed_market", []) or []
    ids = [r["item_id"] for r in rows][:12]
    if not ids:
        return []
    docs = await db.marketplace.find({"id": {"$in": ids}}, {"_id": 0}).to_list(50)
    order = {i: idx for idx, i in enumerate(ids)}
    docs.sort(key=lambda d: order.get(d["id"], 999))
    return docs


# ─── FIXA Bookings ────────────────────────────────────────
class FixaBookingIn(BaseModel):
    item_id: str
    customer_name: str
    customer_phone: str
    address: str
    scheduled_date: str  # ISO date, YYYY-MM-DD
    scheduled_time: str  # e.g. "Morning" / "Afternoon" / "10:00"
    notes: Optional[str] = None


@api.post("/marketplace/fixa/book")
async def fixa_book(data: FixaBookingIn, user: dict = Depends(get_current_user)):
    it = await db.marketplace.find_one({"id": data.item_id}, {"_id": 0})
    if not it:
        raise HTTPException(404, "Provider not found")
    if it.get("category") != "services":
        raise HTTPException(400, "This item is not a FIXA service listing")
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "item_id": data.item_id,
        "provider_id": it.get("seller_id"),
        "provider_name": it.get("seller_name") or it.get("vendor"),
        "provider_avatar": it.get("seller_avatar"),
        "provider_phone": it.get("seller_phone"),
        "provider_whatsapp": it.get("seller_whatsapp"),
        "trade": it.get("subcategory"),
        "customer_name": data.customer_name,
        "customer_phone": data.customer_phone,
        "address": data.address,
        "scheduled_date": data.scheduled_date,
        "scheduled_time": data.scheduled_time,
        "notes": data.notes or "",
        "status": "pending",  # pending | confirmed | completed | cancelled
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.fixa_bookings.insert_one(doc.copy())
    doc.pop("_id", None)
    return {"ok": True, "booking": doc}


@api.get("/marketplace/fixa/bookings")
async def fixa_my_bookings(user: dict = Depends(get_current_user)):
    docs = await db.fixa_bookings.find(
        {"user_id": user["id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    return docs


class FixaBookingCompleteIn(BaseModel):
    rating: Optional[int] = None  # 1-5 stars; 5 unlocks the "positive_rating" bonus
    review: Optional[str] = None


@api.post("/marketplace/fixa/bookings/{booking_id}/complete")
async def fixa_booking_complete(
    booking_id: str,
    data: FixaBookingCompleteIn,
    user: dict = Depends(get_current_user),
):
    """Customer marks a booking complete. Auto-awards FIX to the provider:
       – job_completed (base) always
       – positive_rating bonus when rating >= 5
       – milestone bonuses when the provider crosses 50/100/500 lifetime jobs
    Idempotent by booking_id.
    """
    booking = await db.fixa_bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(404, "Booking not found")
    if booking["user_id"] != user["id"]:
        raise HTTPException(403, "Only the booking owner can complete this booking")
    if booking.get("status") == "completed":
        return {"ok": True, "already_completed": True}

    now = datetime.now(timezone.utc).isoformat()
    update: dict = {"status": "completed", "completed_at": now}
    if data.rating is not None:
        update["rating"] = int(max(1, min(5, data.rating)))
    if data.review:
        update["review"] = data.review[:500]
    await db.fixa_bookings.update_one({"id": booking_id}, {"$set": update})

    # ─── Auto-award FIX to the provider ───────────────────────
    svc = WalletService(db)
    awards: list[dict] = []
    provider_id = booking.get("provider_id")
    # Provider FIX wallet is keyed by seller_id (fixa_*). In this MVP seed
    # providers are external tradespeople not real users — we track FIX on
    # them anyway so their virtual wallets accrue balance.
    if provider_id:
        # 1. Base job completion
        base = FIX_EARN_RULES["job_completed"]
        idem = f"job_completed:{booking_id}"
        dup = await db.token_transactions.find_one(
            {"user_id": provider_id, "currency": "FIX", "meta.idempotency_key": idem}
        )
        if not dup:
            await svc.credit(
                provider_id, base["amount"], "earn_reward", base["description"],
                currency="FIX",
                meta={"event": "job_completed", "booking_id": booking_id, "idempotency_key": idem},
            )
            awards.append({"event": "job_completed", "amount": base["amount"]})
        # 2. Positive rating bonus
        if update.get("rating") == 5:
            pos = FIX_EARN_RULES["positive_rating"]
            idem2 = f"positive_rating:{booking_id}"
            dup2 = await db.token_transactions.find_one(
                {"user_id": provider_id, "currency": "FIX", "meta.idempotency_key": idem2}
            )
            if not dup2:
                await svc.credit(
                    provider_id, pos["amount"], "earn_reward", pos["description"],
                    currency="FIX",
                    meta={"event": "positive_rating", "booking_id": booking_id, "idempotency_key": idem2},
                )
                awards.append({"event": "positive_rating", "amount": pos["amount"]})
        # 3. Milestone check
        completed_count = await db.fixa_bookings.count_documents(
            {"provider_id": provider_id, "status": "completed"}
        )
        for milestone in (50, 100, 500):
            if completed_count == milestone:
                m_rule = FIX_EARN_RULES[f"milestone_{milestone}"]
                idem3 = f"milestone_{milestone}:{provider_id}"
                dup3 = await db.token_transactions.find_one(
                    {"user_id": provider_id, "currency": "FIX", "meta.idempotency_key": idem3}
                )
                if not dup3:
                    await svc.credit(
                        provider_id, m_rule["amount"], "earn_reward", m_rule["description"],
                        currency="FIX",
                        meta={"event": f"milestone_{milestone}", "idempotency_key": idem3},
                    )
                    awards.append({"event": f"milestone_{milestone}", "amount": m_rule["amount"]})

    return {"ok": True, "booking_id": booking_id, "awards": awards}


# ─── Cart ─────────────────────────────────────────────────
class CartItemIn(BaseModel):
    item_id: str
    quantity: int = 1


@api.get("/cart")
async def get_cart(user: dict = Depends(get_current_user)):
    doc = await db.carts.find_one({"user_id": user["id"]}, {"_id": 0})
    lines = (doc or {}).get("items", []) if doc else []
    if not lines:
        return {"items": [], "subtotal": 0}
    ids = [l["item_id"] for l in lines]
    items = await db.marketplace.find({"id": {"$in": ids}}, {"_id": 0}).to_list(200)
    id_map = {i["id"]: i for i in items}
    detailed = []
    subtotal = 0
    for l in lines:
        it = id_map.get(l["item_id"])
        if not it:
            continue
        qty = int(l.get("quantity", 1))
        subtotal += it["price"] * qty
        detailed.append({"item": it, "quantity": qty})
    return {"items": detailed, "subtotal": subtotal}


@api.post("/cart/add")
async def cart_add(data: CartItemIn, user: dict = Depends(get_current_user)):
    it = await db.marketplace.find_one({"id": data.item_id}, {"id": 1, "_id": 0})
    if not it:
        raise HTTPException(404, "Item not found")
    doc = await db.carts.find_one({"user_id": user["id"]}, {"_id": 0})
    if not doc:
        await db.carts.insert_one(
            {
                "id": str(uuid.uuid4()),
                "user_id": user["id"],
                "items": [{"item_id": data.item_id, "quantity": max(1, data.quantity)}],
                "updated_at": datetime.now(timezone.utc),
            }
        )
    else:
        items = doc.get("items", []) or []
        found = False
        for line in items:
            if line["item_id"] == data.item_id:
                line["quantity"] = max(1, int(line.get("quantity", 1)) + data.quantity)
                found = True
                break
        if not found:
            items.append({"item_id": data.item_id, "quantity": max(1, data.quantity)})
        await db.carts.update_one(
            {"user_id": user["id"]},
            {"$set": {"items": items, "updated_at": datetime.now(timezone.utc)}},
        )
    return await get_cart(user)


@api.post("/cart/update")
async def cart_update(data: CartItemIn, user: dict = Depends(get_current_user)):
    if data.quantity <= 0:
        await db.carts.update_one(
            {"user_id": user["id"]},
            {"$pull": {"items": {"item_id": data.item_id}}},
        )
    else:
        await db.carts.update_one(
            {"user_id": user["id"], "items.item_id": data.item_id},
            {"$set": {"items.$.quantity": data.quantity}},
        )
    return await get_cart(user)


@api.delete("/cart/{item_id}")
async def cart_remove(item_id: str, user: dict = Depends(get_current_user)):
    await db.carts.update_one(
        {"user_id": user["id"]},
        {"$pull": {"items": {"item_id": item_id}}},
    )
    return await get_cart(user)


@api.post("/cart/clear")
async def cart_clear(user: dict = Depends(get_current_user)):
    await db.carts.update_one(
        {"user_id": user["id"]},
        {"$set": {"items": []}},
    )
    return {"items": [], "subtotal": 0}


@api.post("/checkout")
async def checkout(user: dict = Depends(get_current_user)):
    """Mock checkout — clears the cart and returns a fake order confirmation."""
    cart = await get_cart(user)
    if not cart["items"]:
        raise HTTPException(400, "Cart is empty")
    order_id = f"AMS-{str(uuid.uuid4())[:8].upper()}"
    await db.orders.insert_one(
        {
            "id": order_id,
            "user_id": user["id"],
            "items": cart["items"],
            "subtotal": cart["subtotal"],
            "created_at": datetime.now(timezone.utc),
        }
    )
    await db.carts.update_one({"user_id": user["id"]}, {"$set": {"items": []}})
    return {"order_id": order_id, "subtotal": cart["subtotal"], "eta_days": 3}


# ─── Neighborhoods / Discover ─────────────────────────────
@api.get("/neighborhoods")
async def neighborhoods():
    docs = await db.neighborhoods.find({}, {"_id": 0}).to_list(200)
    return docs


# ─── AI search ────────────────────────────────────────────
@api.post("/ai/search")
async def ai_search(data: AiSearchIn):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(500, "AI service not configured")

    system = (
        "You are AMASS AI, an expert Africa real-estate assistant for a Nigeria-focused "
        "property platform. Users ask about buying, renting, leasing, investment yields "
        "and neighborhood comparisons. Prices are in Nigerian Naira (₦). Use markdown-lite "
        "concise responses: short paragraphs, bullet points where helpful, and highlight "
        "areas (Lekki, Ikoyi, Victoria Island, Ikeja, Abuja, Abeokuta). Keep replies under "
        "180 words. Be warm, insightful, premium in tone."
    )
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=data.session_id or str(uuid.uuid4()),
        system_message=system,
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")

    async def event_generator() -> AsyncGenerator[bytes, None]:
        try:
            async for ev in chat.stream_message(UserMessage(text=data.query)):
                if isinstance(ev, TextDelta):
                    yield f"data: {ev.content}\n\n".encode("utf-8")
                elif isinstance(ev, StreamDone):
                    yield b"data: [DONE]\n\n"
                    break
        except Exception as e:
            logger.exception("ai stream error")
            yield f"data: [ERROR] {str(e)}\n\n".encode("utf-8")

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@api.post("/ai/search/sync")
async def ai_search_sync(data: AiSearchIn):
    """Non-streaming variant for simple clients."""
    if not EMERGENT_LLM_KEY:
        raise HTTPException(500, "AI service not configured")

    system = (
        "You are AMASS AI, an expert Africa real-estate assistant. Prices in ₦. "
        "Concise, premium, 150 words max."
    )
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=data.session_id or str(uuid.uuid4()),
        system_message=system,
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")
    text_parts = []
    try:
        async for ev in chat.stream_message(UserMessage(text=data.query)):
            if isinstance(ev, TextDelta):
                text_parts.append(ev.content)
            elif isinstance(ev, StreamDone):
                break
    except Exception as e:
        raise HTTPException(500, f"AI error: {e}")
    return {"reply": "".join(text_parts)}


# ─── Seed ─────────────────────────────────────────────────
SEED_PROPERTIES = [
    {
        "title": "Palatial Ocean-View Duplex, Lekki Phase 1",
        "description": "A stunning modern duplex with panoramic ocean views, private pool, and smart home features. Nestled in the heart of Lekki Phase 1.",
        "price": 145_000_000,
        "listing_type": "buy",
        "property_type": "duplex",
        "bedrooms": 5,
        "bathrooms": 6,
        "size_sqm": 620,
        "location": "Admiralty Way, Lekki Phase 1",
        "city": "Lekki",
        "state": "Lagos",
        "latitude": 6.4361,
        "longitude": 3.4739,
        "images": [
            "https://images.unsplash.com/photo-1613977257363-707ba9348227?w=1200",
            "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200",
            "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=1200",
        ],
        "amenities": ["Swimming Pool", "Smart Home", "24/7 Security", "Gym", "Solar Power"],
        "status": "premium",
        "verified": True,
        "year_built": 2023,
        "parking": 4,
        "investment_score": 92,
        "ai_valuation": 158_000_000,
        "agent_name": "Adaeze Okoye",
        "agent_avatar": "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200",
    },
    {
        "title": "Serene 4-Bedroom Terrace, Ikoyi",
        "description": "Refined family terrace with private garden. Steps from Ikoyi Club.",
        "price": 320_000_000,
        "listing_type": "buy",
        "property_type": "terrace",
        "bedrooms": 4,
        "bathrooms": 5,
        "size_sqm": 480,
        "location": "Bourdillon Road, Ikoyi",
        "city": "Ikoyi",
        "state": "Lagos",
        "latitude": 6.4488,
        "longitude": 3.4356,
        "images": [
            "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=1200",
            "https://images.unsplash.com/photo-1600585152220-90363fe7e115?w=1200",
        ],
        "amenities": ["Private Garden", "BQ", "CCTV", "Borehole"],
        "status": "verified",
        "verified": True,
        "year_built": 2022,
        "parking": 3,
        "investment_score": 88,
        "ai_valuation": 340_000_000,
        "agent_name": "Chidi Nwosu",
        "agent_avatar": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200",
    },
    {
        "title": "Skyline Penthouse, Victoria Island",
        "description": "Elite penthouse overlooking the Lagos skyline. Concierge and private lift.",
        "price": 480_000_000,
        "listing_type": "buy",
        "property_type": "penthouse",
        "bedrooms": 4,
        "bathrooms": 5,
        "size_sqm": 550,
        "location": "Ahmadu Bello Way, Victoria Island",
        "city": "Victoria Island",
        "state": "Lagos",
        "latitude": 6.4281,
        "longitude": 3.4219,
        "images": [
            "https://images.unsplash.com/photo-1512918728675-ed5a9ecdebfd?w=1200",
            "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?w=1200",
        ],
        "amenities": ["Concierge", "Rooftop Pool", "Private Lift", "Wine Cellar"],
        "status": "premium",
        "verified": True,
        "year_built": 2024,
        "parking": 3,
        "investment_score": 95,
        "ai_valuation": 510_000_000,
        "agent_name": "Fatima Bello",
        "agent_avatar": "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=200",
    },
    {
        "title": "Modern 3-Bed Apartment for Rent, Lekki",
        "description": "Fully serviced apartment in a gated estate. Available immediately.",
        "price": 8_500_000,
        "listing_type": "rent",
        "property_type": "apartment",
        "bedrooms": 3,
        "bathrooms": 3,
        "size_sqm": 180,
        "location": "Chevron Drive, Lekki",
        "city": "Lekki",
        "state": "Lagos",
        "latitude": 6.4432,
        "longitude": 3.5119,
        "images": [
            "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200",
            "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200",
        ],
        "amenities": ["Furnished", "24/7 Power", "Pool", "Gym"],
        "status": "available",
        "verified": True,
        "year_built": 2021,
        "parking": 2,
        "investment_score": 78,
        "ai_valuation": 9_200_000,
        "agent_name": "Tunde Adebayo",
        "agent_avatar": "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200",
    },
    {
        "title": "Prime Land, Abeokuta",
        "description": "One acre of verified land with clear title. Great for development.",
        "price": 18_000_000,
        "listing_type": "buy",
        "property_type": "land",
        "bedrooms": 0,
        "bathrooms": 0,
        "size_sqm": 4046,
        "location": "Kobape, Abeokuta",
        "city": "Abeokuta",
        "state": "Ogun",
        "latitude": 7.1608,
        "longitude": 3.3480,
        "images": [
            "https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1200",
        ],
        "amenities": ["C of O", "Cleared", "Road Access"],
        "status": "verified",
        "verified": True,
        "investment_score": 82,
        "ai_valuation": 20_000_000,
        "agent_name": "Kemi Ola",
        "agent_avatar": "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=200",
    },
    {
        "title": "Contemporary Bungalow, Abuja",
        "description": "Bright 4-bedroom bungalow with expansive compound in Maitama.",
        "price": 210_000_000,
        "listing_type": "buy",
        "property_type": "bungalow",
        "bedrooms": 4,
        "bathrooms": 4,
        "size_sqm": 380,
        "location": "Maitama District, Abuja",
        "city": "Abuja",
        "state": "FCT",
        "latitude": 9.0863,
        "longitude": 7.4906,
        "images": [
            "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200",
            "https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=1200",
        ],
        "amenities": ["Garden", "Study", "Solar Backup"],
        "status": "available",
        "verified": True,
        "year_built": 2020,
        "parking": 4,
        "investment_score": 85,
        "ai_valuation": 225_000_000,
        "agent_name": "Ibrahim Musa",
        "agent_avatar": "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=200",
    },
    {
        "title": "Short-Let Studio, Ikeja GRA",
        "description": "Cozy fully-serviced studio, great for business travelers.",
        "price": 65_000,
        "listing_type": "shortlet",
        "property_type": "apartment",
        "bedrooms": 1,
        "bathrooms": 1,
        "size_sqm": 45,
        "location": "Isaac John, Ikeja GRA",
        "city": "Ikeja",
        "state": "Lagos",
        "latitude": 6.5833,
        "longitude": 3.3500,
        "images": [
            "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200",
        ],
        "amenities": ["Netflix", "Wifi", "Kitchen", "AC"],
        "status": "available",
        "verified": False,
        "year_built": 2019,
        "parking": 1,
        "investment_score": 70,
        "ai_valuation": 68_000,
        "agent_name": "Amina Yusuf",
        "agent_avatar": "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200",
    },
    {
        "title": "Commercial Office Space, Victoria Island",
        "description": "Grade-A office space, 300sqm open plan floor.",
        "price": 45_000_000,
        "listing_type": "lease",
        "property_type": "commercial",
        "bedrooms": 0,
        "bathrooms": 4,
        "size_sqm": 300,
        "location": "Adeola Odeku, Victoria Island",
        "city": "Victoria Island",
        "state": "Lagos",
        "latitude": 6.4276,
        "longitude": 3.4258,
        "images": [
            "https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200",
        ],
        "amenities": ["Elevator", "Backup Power", "Fibre Internet", "Parking"],
        "status": "coming_soon",
        "verified": True,
        "year_built": 2023,
        "parking": 20,
        "investment_score": 89,
        "ai_valuation": 48_000_000,
        "agent_name": "Chidi Nwosu",
        "agent_avatar": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200",
    },
    {
        "title": "Sold - Elegant Terrace, Ikoyi",
        "description": "Recently sold reference property.",
        "price": 275_000_000,
        "listing_type": "buy",
        "property_type": "terrace",
        "bedrooms": 4,
        "bathrooms": 4,
        "size_sqm": 420,
        "location": "Gerard Road, Ikoyi",
        "city": "Ikoyi",
        "state": "Lagos",
        "latitude": 6.4520,
        "longitude": 3.4390,
        "images": [
            "https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=1200",
        ],
        "amenities": ["BQ", "Garden", "Security"],
        "status": "sold",
        "verified": True,
        "year_built": 2019,
        "parking": 3,
        "investment_score": 80,
    },
]

SEED_MARKETPLACE = MARKET_ITEMS

SEED_VENDORS = VENDORS

SEED_COLLECTIONS = COLLECTIONS

SEED_NEIGHBORHOODS = [
    {"id": "n1", "name": "Lekki Phase 1", "city": "Lekki", "state": "Lagos", "image": "https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=1200", "avg_price": 155_000_000, "price_change_pct": 8.2, "walk_score": 72, "school_score": 85, "safety_score": 82, "infrastructure_score": 88, "overall_score": 87, "latitude": 6.4361, "longitude": 3.4739, "trending": True},
    {"id": "n2", "name": "Ikoyi", "city": "Ikoyi", "state": "Lagos", "image": "https://images.unsplash.com/photo-1512918728675-ed5a9ecdebfd?w=1200", "avg_price": 310_000_000, "price_change_pct": 4.1, "walk_score": 80, "school_score": 92, "safety_score": 90, "infrastructure_score": 91, "overall_score": 92, "latitude": 6.4488, "longitude": 3.4356, "trending": True},
    {"id": "n3", "name": "Victoria Island", "city": "Victoria Island", "state": "Lagos", "image": "https://images.unsplash.com/photo-1519222970733-f546218fa6d7?w=1200", "avg_price": 380_000_000, "price_change_pct": 5.7, "walk_score": 84, "school_score": 88, "safety_score": 87, "infrastructure_score": 93, "overall_score": 90, "latitude": 6.4281, "longitude": 3.4219, "trending": False},
    {"id": "n4", "name": "Maitama, Abuja", "city": "Abuja", "state": "FCT", "image": "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200", "avg_price": 220_000_000, "price_change_pct": 6.9, "walk_score": 70, "school_score": 86, "safety_score": 91, "infrastructure_score": 90, "overall_score": 88, "latitude": 9.0863, "longitude": 7.4906, "trending": True},
    {"id": "n5", "name": "Abeokuta", "city": "Abeokuta", "state": "Ogun", "image": "https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1200", "avg_price": 22_000_000, "price_change_pct": 12.3, "walk_score": 55, "school_score": 68, "safety_score": 78, "infrastructure_score": 62, "overall_score": 68, "latitude": 7.1608, "longitude": 3.3480, "trending": True},
]


@api.post("/seed")
async def seed_data(_admin: dict = Depends(require_admin)):
    return await _do_seed()


async def _do_seed():
    # Seed properties
    await db.properties.delete_many({})
    for p in SEED_PROPERTIES:
        prop = Property(**p)
        await db.properties.insert_one(prop.model_dump())

    # Seed marketplace
    await db.marketplace.delete_many({})
    for m in SEED_MARKETPLACE:
        item = MarketplaceItem(**m)
        await db.marketplace.insert_one(item.model_dump())
    # C2C classifieds seed (OfferUp/Letgo-style)
    for m in C2C_MARKET_ITEMS:
        try:
            item = MarketplaceItem(**m)
            await db.marketplace.insert_one(item.model_dump())
        except Exception as e:
            logger.warning(f"skip c2c seed item {m.get('name','?')}: {e}")

    # FIXA verified service providers
    for m in FIXA_PROVIDERS:
        try:
            item = MarketplaceItem(**m)
            await db.marketplace.insert_one(item.model_dump())
        except Exception as e:
            logger.warning(f"skip fixa seed item {m.get('name','?')}: {e}")

    # Seed vendors
    await db.vendors.delete_many({})
    for v in SEED_VENDORS:
        await db.vendors.insert_one(v.copy())

    # Seed collections
    await db.collections.delete_many({})
    for c in SEED_COLLECTIONS:
        await db.collections.insert_one(c.copy())

    # Seed neighborhoods
    await db.neighborhoods.delete_many({})
    for n in SEED_NEIGHBORHOODS:
        await db.neighborhoods.insert_one(n.copy())

    return {
        "properties": len(SEED_PROPERTIES),
        "marketplace": len(SEED_MARKETPLACE),
        "vendors": len(SEED_VENDORS),
        "collections": len(SEED_COLLECTIONS),
        "neighborhoods": len(SEED_NEIGHBORHOODS),
    }


@api.get("/")
async def root():
    return {"app": "AMASS API", "version": "1.0.0"}


# ─── Mount ────────────────────────────────────────────────
app.include_router(api)
app.include_router(register_token_routes(db))


# AI helper — used by agent tools (description gen + search parser)
class _ChatWrapper:
    def __init__(self, system: str):
        self._chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=str(uuid.uuid4()),
            system_message=system,
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")

    async def ask(self, text: str) -> str:
        parts: list = []
        async for ev in self._chat.stream_message(UserMessage(text=text)):
            if isinstance(ev, TextDelta):
                parts.append(ev.content)
            elif isinstance(ev, StreamDone):
                break
        return "".join(parts)


def _chat_factory(system: str) -> _ChatWrapper:
    return _ChatWrapper(system)


app.include_router(register_earn_routes(db))
app.include_router(register_agent_tool_routes(db, _chat_factory))
app.include_router(register_ads_routes(db))
app.include_router(register_marketplace_v2_routes(db, get_current_user))
from intelligence import register_intelligence_routes  # noqa: E402
app.include_router(register_intelligence_routes(db))
from apple_auth import register_apple_auth_route  # noqa: E402
app.include_router(register_apple_auth_route(db, create_token, user_to_out))

# ─── Saved Searches / Alerts ──────────────────────────────────
from saved_searches import register_saved_search_routes
app.include_router(register_saved_search_routes(db, get_current_user))

# ─── Real payments (Paystack + Flutterwave) with MOCK_PAYMENT fallback
from payments import register_payment_routes
app.include_router(register_payment_routes(db, get_current_user))

# ─── Property Improvement, Inspection, Finance & Renovation Projects
from property_improvement import register_property_improvement_routes
app.include_router(register_property_improvement_routes(db, get_current_user))

# ─── Agent Platform (Phase 1: onboarding, plans, quotas, founding, admin)
from agent_platform import (
    register_agent_platform_routes,
    check_listing_quota,
    maybe_mark_starter_kit_eligible,
    _ensure_plans_seeded,
)
_agent_platform_router, _agent_platform_admin_router = register_agent_platform_routes(
    db, get_current_user, require_admin
)
app.include_router(_agent_platform_router)
app.include_router(_agent_platform_admin_router)

# ─── Agent Platform v2 (Phase 2: public profiles, badges, apple deletion)
from agent_platform_v2 import register_agent_platform_v2_routes
import agent_platform as _ap  # for _FINALIZE_SUBSCRIPTION lookup
_v2_router, _v2_admin_router = register_agent_platform_v2_routes(
    db,
    get_current_user,
    require_admin,
    finalize_subscription_hook=lambda pending: _ap._FINALIZE_SUBSCRIPTION(pending),  # type: ignore
)
app.include_router(_v2_router)
app.include_router(_v2_admin_router)

# ─── Marketing & Sharing (Phase 3: share links, WhatsApp, QR events)
from share_routes import register_share_routes
app.include_router(register_share_routes(db, get_current_user))

# ─── Reviews · Agent Score · Analytics · Lead CRM (Phase 4)
from reviews_score_crm import register_phase4_routes
_p4_router, _p4_admin_router = register_phase4_routes(db, get_current_user, require_admin)
app.include_router(_p4_router)
app.include_router(_p4_admin_router)

# ─── Property Identity Core (Phase 6A)
from property_identity import register_property_identity_routes
_pi_router, _pi_public = register_property_identity_routes(
    db, get_current_user, require_admin
)
app.include_router(_pi_router)
app.include_router(_pi_public)

# ─── Duplicate Detection Engine (Phase 6B)
from duplicate_detection import register_duplicate_routes
_dup_router, _dup_admin = register_duplicate_routes(db, get_current_user, require_admin)
app.include_router(_dup_router)
app.include_router(_dup_admin)

# ─── Property Representations & Claims (Phase 6C)
from property_representations import register_representation_routes
_rep_agent, _rep_public, _rep_admin = register_representation_routes(
    db, get_current_user, require_admin
)
app.include_router(_rep_agent)
app.include_router(_rep_public)
app.include_router(_rep_admin)

# ─── Property Passport — public SEO-friendly page (Phase 6C)
from property_passport import register_passport_routes
_pp_public, _pp_admin = register_passport_routes(db, get_current_user, require_admin)
app.include_router(_pp_public)
app.include_router(_pp_admin)

# ─── Admin Cockpit — duplicate queue, merge, audit, verify (Phase 6D)
from admin_cockpit import register_admin_cockpit_routes
app.include_router(register_admin_cockpit_routes(db, require_admin))

# ─── D-1: Property Type registry + App Settings (feature flags, weights, pricing) ─
from property_types import register_property_type_routes, ensure_default_property_types
from app_settings import register_app_settings_routes, ensure_default_settings
_pt_public, _pt_admin = register_property_type_routes(db, require_admin)
_as_public, _as_admin = register_app_settings_routes(db, require_admin)
app.include_router(_pt_public)
app.include_router(_pt_admin)
app.include_router(_as_public)
app.include_router(_as_admin)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def on_startup():
    # ─── DB Indexes (idempotent) ─────────────────────────────
    try:
        await db.properties.create_index("id", unique=True)
        await db.properties.create_index("agent_id")
        await db.properties.create_index("listing_type")
        await db.properties.create_index([("latitude", 1), ("longitude", 1)])
        await db.properties.create_index("verified")
        await db.wallets.create_index([("user_id", 1), ("currency", 1)], unique=True)
        await db.token_transactions.create_index([("user_id", 1), ("created_at", -1)])
        await db.token_transactions.create_index("meta.idempotency_key", sparse=True)
        await db.notifications.create_index([("user_id", 1), ("created_at", -1)])
        await db.notifications.create_index("id", unique=True)
        await db.users.create_index("email", unique=True)
        await db.users.create_index("referral_code", sparse=True)
        await db.favorites.create_index([("user_id", 1), ("property_id", 1)], unique=True)
        await db.favorites.create_index("property_id")
        await db.marketplace.create_index("id", unique=True)
        await db.agent_referrals.create_index("agent_user_id")
        await db.agent_referrals.create_index("id", unique=True)
        # Agent Platform (Phase 1)
        await db.agent_plans.create_index("id", unique=True)
        await db.agent_subscriptions.create_index([("user_id", 1), ("status", 1)])
        await db.agent_subscriptions.create_index("id", unique=True)
        await db.agent_subscriptions.create_index("payment_reference", sparse=True)
        await db.agent_starter_kits.create_index("user_id", unique=True)
        await db.founding_program.create_index("id", unique=True)
        await db.pending_agent_subscriptions.create_index("reference", unique=True)
        await db.agent_applications.create_index("user_id", unique=True)
        await db.agent_applications.create_index("status")
        await db.agent_applications.create_index("slug", unique=True, sparse=True)
        await db.account_deletions.create_index("user_id_hash", unique=True)
        await db.share_events.create_index([("target_id", 1), ("created_at", -1)])
        await db.share_events.create_index([("user_id", 1), ("created_at", -1)])
        # Phase 4 — reviews / CRM
        await db.agent_reviews.create_index([("agent_id", 1), ("status", 1), ("created_at", -1)])
        await db.agent_reviews.create_index([("reviewer_id", 1), ("agent_id", 1)], unique=True)
        await db.agent_reviews.create_index("id", unique=True)
        await db.agent_review_reports.create_index("review_id")
        await db.lead_unlocks.create_index([("agent_id", 1), ("crm_status", 1)])
        await db.lead_unlocks.create_index([("agent_id", 1), ("next_follow_up_at", 1)], sparse=True)
        # Phase 6A — Property Identity Core (MongoDB 2dsphere)
        await db.properties_geo.create_index([("entrance_point", "2dsphere")])
        await db.properties_geo.create_index("amass_property_id", unique=True)
        await db.properties_geo.create_index("property_uuid", unique=True)
        await db.properties_geo.create_index("aliases")
        await db.properties_geo.create_index([("state", 1), ("lga", 1), ("area", 1)])
        await db.properties_geo.create_index("normalized_address")
        await db.property_listings.create_index("property_id")
        await db.property_listings.create_index([("agent_id", 1), ("listing_status", 1)])
        await db.property_listings.create_index("id", unique=True)
        await db.property_onboarding.create_index(
            [("client_submission_id", 1), ("agent_id", 1)], unique=True
        )
        await db.property_onboarding.create_index("id", unique=True)
        await db.property_onboarding.create_index([("agent_id", 1), ("status", 1)])
        await db.property_id_counters.create_index("state_code", unique=True)
        await db.property_audit_logs.create_index([("property_id", 1), ("created_at", -1)])
        await db.property_audit_logs.create_index("id", unique=True)
        # Phase 6C — Representations & Claims
        await db.property_representations.create_index("id", unique=True)
        await db.property_representations.create_index(
            [("property_id", 1), ("status", 1)]
        )
        await db.property_representations.create_index(
            [("user_id", 1), ("status", 1)]
        )
        await db.property_representations.create_index("listing_id", sparse=True)
        await db.property_representations.create_index(
            [("listing_id", 1), ("user_id", 1)], unique=True, sparse=True
        )
        await db.property_claims.create_index("id", unique=True)
        await db.property_claims.create_index(
            [("representation_id", 1), ("submitted_at", -1)]
        )
        # ─── Phase D-1: Property types + app settings + D-3/D-5/D-8 collections ─
        await db.property_types.create_index("slug", unique=True)
        await db.property_types.create_index([("order", 1), ("active", 1)])
        await db.app_settings.create_index("key", unique=True)
        # Discovery pipeline (populated in D-2/D-3)
        await db.property_candidates.create_index("id", unique=True)
        await db.property_candidates.create_index("google_place_id", sparse=True)
        await db.property_candidates.create_index([("status", 1), ("created_at", -1)])
        await db.property_candidates.create_index([("location", "2dsphere")])
        await db.discovery_jobs.create_index("id", unique=True)
        await db.discovery_jobs.create_index([("status", 1), ("created_at", -1)])
        await db.google_places_cache.create_index("place_id", unique=True)
        await db.google_places_cache.create_index([("cached_at", 1)])
        await db.google_places_usage.create_index([("day", 1)])
        # Verification tasks + territories + valuations (populated D-5..D-8)
        await db.agent_verification_tasks.create_index("id", unique=True)
        await db.agent_verification_tasks.create_index([("agent_id", 1), ("status", 1)])
        await db.agent_verification_tasks.create_index([("location", "2dsphere")])
        await db.agent_territories.create_index([("agent_id", 1)])
        await db.agent_territories.create_index([("polygon", "2dsphere")])
        await db.property_valuations.create_index([("amass_property_id", 1), ("valued_at", -1)])
        await db.property_valuations.create_index("id", unique=True)
        # Seed defaults (idempotent)
        from property_types import ensure_default_property_types as _ensure_pt
        from app_settings import ensure_default_settings as _ensure_as
        await _ensure_pt(db)
        await _ensure_as(db)
    except Exception as e:
        logger.warning(f"Index creation issue (safe to ignore on re-boot): {e}")

    # ─── Seed Agent Platform plans + founding program ─────────
    try:
        await _ensure_plans_seeded(db)
    except Exception:
        logger.exception("failed to seed agent plans")

    # ─── Backfill slugs on existing agent_applications (Phase 2) ────
    try:
        from agent_platform_v2 import _ensure_slug as _ensure_agent_slug
        cursor = db.agent_applications.find({"slug": {"$exists": False}}, {"_id": 0})
        async for a in cursor:
            try:
                await _ensure_agent_slug(db, a)
            except Exception:
                pass
    except Exception:
        logger.exception("agent slug backfill failed")

    # Auto-seed if empty
    count = await db.properties.count_documents({})
    if count == 0:
        logger.info("Seeding initial data …")
        await _do_seed()
    # Mark AMASS Exclusive listings (Category 1 — free forever)
    # Marketing inventory: keep a curated handful as AMASS Exclusive.
    # First, unmark all so we can converge to a deterministic state each boot.
    await db.properties.update_many({}, {"$set": {"is_amass_exclusive": False}})
    exclusive_ids: list = []
    # Pick top 2 verified + 1 owner_listed as exclusive if available.
    top_verified = await db.properties.find(
        {"verified": True}, {"id": 1, "_id": 0}
    ).sort("price", -1).limit(2).to_list(2)
    exclusive_ids.extend([d["id"] for d in top_verified])
    owner_listed = await db.properties.find(
        {"listing_source": "owner_listed"}, {"id": 1, "_id": 0}
    ).limit(1).to_list(1)
    exclusive_ids.extend([d["id"] for d in owner_listed])
    if exclusive_ids:
        await db.properties.update_many(
            {"id": {"$in": exclusive_ids}},
            {"$set": {"is_amass_exclusive": True}},
        )

    # Seed a single always-on demo advertisement (marketplace-facing) so the
    # smart ad delivery flow is testable end-to-end.
    from ads import Ad, AdMedia  # local import to avoid circular
    ad_count = await db.advertisements.count_documents({"seller_id": "demo-system"})
    if ad_count == 0:
        # Pick a marketplace item to advertise
        sample_item = await db.marketplace_items.find_one({}, {"_id": 0})
        cover = None
        if sample_item:
            imgs = sample_item.get("images") or []
            cover = imgs[0] if imgs else None
        demo_ad = Ad(
            seller_id="demo-system",
            marketplace_item_id=sample_item["id"] if sample_item else None,
            tier="premium",
            title=(sample_item.get("title") if sample_item else "Discover premium home essentials"),
            description="Handpicked pieces from AMASS-verified vendors. Free delivery on your first order.",
            cta_label="Shop the collection",
            media=[
                AdMedia(
                    kind="image",
                    url=cover
                    or "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1080",
                    aspect_ratio=1.6,
                )
            ],
            target_cities=["Lagos", "Abuja"],
            tokens_paid=0,
            expires_at=datetime.now(timezone.utc) + timedelta(days=180),
            status="active",
        )
        await db.advertisements.insert_one(demo_ad.model_dump())

    # Assign 2 seed properties to the demo user so /agent-dashboard is
    # populated for demo E2E flow (Boost / Leads UI).
    demo_user = await db.users.find_one({"email": "demo@amass.africa"}, {"_id": 0})
    if demo_user:
        demo_props = await db.properties.find(
            {"agent_id": {"$ne": demo_user["id"]}}, {"_id": 0}
        ).sort("price", -1).limit(2).to_list(2)
        if demo_props:
            await db.properties.update_many(
                {"id": {"$in": [p["id"] for p in demo_props]}},
                {
                    "$set": {
                        "agent_id": demo_user["id"],
                        "agent_name": demo_user.get("full_name", "Ada Demo"),
                    }
                },
            )
            await db.users.update_one({"id": demo_user["id"]}, {"$set": {"is_agent": True}})


@app.on_event("shutdown")
async def on_shutdown():
    client.close()
