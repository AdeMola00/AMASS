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
from fastapi import FastAPI, APIRouter, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field

from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# ─── Config ───────────────────────────────────────────────
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ.get("JWT_SECRET", "amass-dev-secret-change-in-production")
JWT_ALG = "HS256"
JWT_EXPIRES_DAYS = 30
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")

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
    avatar_url: Optional[str] = None
    is_agent: bool = False
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
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class MarketplaceItem(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    category: Literal["construction", "home", "services"]
    subcategory: str
    name: str
    description: str
    price: int
    currency: str = "NGN"
    image: str
    vendor: str
    rating: float = 4.5
    reviews: int = 0
    location: Optional[str] = None


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
    return user


def user_to_out(u: dict) -> UserOut:
    return UserOut(
        id=u["id"],
        email=u["email"],
        full_name=u["full_name"],
        phone=u.get("phone"),
        avatar_url=u.get("avatar_url"),
        is_agent=u.get("is_agent", False),
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
    q: Optional[str] = None,
    limit: int = 100,
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
    return docs


@api.get("/properties/{property_id}")
async def get_property(property_id: str):
    doc = await db.properties.find_one({"id": property_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Property not found")
    return doc


# ─── Property submission (Agent) ─────────────────────────
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


@api.post("/properties", response_model=Property)
async def create_property(data: PropertyCreateIn, user: dict = Depends(get_current_user)):
    prop = Property(
        **data.model_dump(),
        status="coming_soon",
        verified=False,
        agent_id=user["id"],
        agent_name=user["full_name"],
        agent_avatar=user.get("avatar_url"),
    )
    await db.properties.insert_one(prop.model_dump())
    # Promote the user to agent on first listing
    if not user.get("is_agent"):
        await db.users.update_one({"id": user["id"]}, {"$set": {"is_agent": True}})
    return prop


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

    # Deterministic mock analytics off the listing count for now.
    n = len(listings)
    return {
        "stats": {
            "listings": len(listings),
            "active": len(active),
            "verified": len(verified),
            "views_30d": n * 137 + 42,
            "leads_30d": n * 6 + 3,
            "appointments_30d": n * 2 + 1,
            "total_value": total_value,
        },
        "recent": listings[:5],
    }


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
        return {"favorited": False}
    await db.favorites.insert_one(
        {
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "property_id": data.property_id,
            "created_at": datetime.now(timezone.utc),
        }
    )
    return {"favorited": True}


@api.get("/favorites/ids")
async def favorite_ids(user: dict = Depends(get_current_user)):
    docs = await db.favorites.find({"user_id": user["id"]}, {"_id": 0}).to_list(500)
    return {"ids": [d["property_id"] for d in docs]}


# ─── Marketplace ──────────────────────────────────────────
@api.get("/marketplace")
async def marketplace(category: Optional[str] = None, subcategory: Optional[str] = None):
    q: dict = {}
    if category:
        q["category"] = category
    if subcategory:
        q["subcategory"] = subcategory
    docs = await db.marketplace.find(q, {"_id": 0}).to_list(500)
    return docs


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

SEED_MARKETPLACE = [
    # Construction
    {"category": "construction", "subcategory": "Building Materials", "name": "Dangote Cement 50kg", "description": "Premium Portland cement, per bag.", "price": 8500, "image": "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=800", "vendor": "BuildMart NG", "rating": 4.7, "reviews": 342},
    {"category": "construction", "subcategory": "Building Materials", "name": "Ceramic Floor Tiles (60x60)", "description": "Italian design ceramic tiles per m².", "price": 5500, "image": "https://images.unsplash.com/photo-1615529162924-f8605388461d?w=800", "vendor": "TileHub", "rating": 4.5, "reviews": 128},
    {"category": "construction", "subcategory": "Equipment Rental", "name": "Concrete Mixer (Daily)", "description": "500L capacity concrete mixer rental.", "price": 25000, "image": "https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=800", "vendor": "SiteGear", "rating": 4.4, "reviews": 76},
    {"category": "construction", "subcategory": "Professionals", "name": "Chief Architect - Adewale K.", "description": "Award-winning architect, 15+ years experience.", "price": 500000, "image": "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=800", "vendor": "AKD Studio", "rating": 4.9, "reviews": 54},
    {"category": "construction", "subcategory": "Professionals", "name": "Structural Engineer", "description": "Certified structural engineering consultation.", "price": 250000, "image": "https://images.unsplash.com/photo-1581094794329-c8112a89af12?w=800", "vendor": "StructPro", "rating": 4.6, "reviews": 89},
    # Home
    {"category": "home", "subcategory": "Furniture", "name": "Milano 3-Seater Sofa", "description": "Premium leather sofa, imported.", "price": 850000, "image": "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800", "vendor": "Casa Milano", "rating": 4.8, "reviews": 213},
    {"category": "home", "subcategory": "Kitchen", "name": "Modular Kitchen Set", "description": "Complete modern kitchen cabinetry.", "price": 2450000, "image": "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800", "vendor": "Kitchen Republic", "rating": 4.7, "reviews": 65},
    {"category": "home", "subcategory": "Electronics", "name": "Samsung 65\" QLED TV", "description": "4K QLED Smart TV.", "price": 1200000, "image": "https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?w=800", "vendor": "Slot Nigeria", "rating": 4.9, "reviews": 401},
    {"category": "home", "subcategory": "Lighting", "name": "Crystal Chandelier", "description": "European crystal statement chandelier.", "price": 380000, "image": "https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?w=800", "vendor": "Lumi", "rating": 4.6, "reviews": 44},
    {"category": "home", "subcategory": "Decoration", "name": "Abstract Wall Art Set", "description": "Set of 3 canvas prints, gold framed.", "price": 95000, "image": "https://images.unsplash.com/photo-1513519245088-0e12902e5a38?w=800", "vendor": "Artistry Lagos", "rating": 4.8, "reviews": 156},
    {"category": "home", "subcategory": "Appliances", "name": "LG Double-Door Fridge 620L", "description": "Inverter, energy efficient.", "price": 950000, "image": "https://images.unsplash.com/photo-1571175443880-49e1d25b2bc5?w=800", "vendor": "LG Nigeria", "rating": 4.7, "reviews": 220},
]

SEED_NEIGHBORHOODS = [
    {"id": "n1", "name": "Lekki Phase 1", "city": "Lekki", "state": "Lagos", "image": "https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=1200", "avg_price": 155_000_000, "price_change_pct": 8.2, "walk_score": 72, "school_score": 85, "safety_score": 82, "infrastructure_score": 88, "overall_score": 87, "latitude": 6.4361, "longitude": 3.4739, "trending": True},
    {"id": "n2", "name": "Ikoyi", "city": "Ikoyi", "state": "Lagos", "image": "https://images.unsplash.com/photo-1512918728675-ed5a9ecdebfd?w=1200", "avg_price": 310_000_000, "price_change_pct": 4.1, "walk_score": 80, "school_score": 92, "safety_score": 90, "infrastructure_score": 91, "overall_score": 92, "latitude": 6.4488, "longitude": 3.4356, "trending": True},
    {"id": "n3", "name": "Victoria Island", "city": "Victoria Island", "state": "Lagos", "image": "https://images.unsplash.com/photo-1519222970733-f546218fa6d7?w=1200", "avg_price": 380_000_000, "price_change_pct": 5.7, "walk_score": 84, "school_score": 88, "safety_score": 87, "infrastructure_score": 93, "overall_score": 90, "latitude": 6.4281, "longitude": 3.4219, "trending": False},
    {"id": "n4", "name": "Maitama, Abuja", "city": "Abuja", "state": "FCT", "image": "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200", "avg_price": 220_000_000, "price_change_pct": 6.9, "walk_score": 70, "school_score": 86, "safety_score": 91, "infrastructure_score": 90, "overall_score": 88, "latitude": 9.0863, "longitude": 7.4906, "trending": True},
    {"id": "n5", "name": "Abeokuta", "city": "Abeokuta", "state": "Ogun", "image": "https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1200", "avg_price": 22_000_000, "price_change_pct": 12.3, "walk_score": 55, "school_score": 68, "safety_score": 78, "infrastructure_score": 62, "overall_score": 68, "latitude": 7.1608, "longitude": 3.3480, "trending": True},
]


@api.post("/seed")
async def seed_data():
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

    # Seed neighborhoods
    await db.neighborhoods.delete_many({})
    for n in SEED_NEIGHBORHOODS:
        await db.neighborhoods.insert_one(n.copy())

    return {
        "properties": len(SEED_PROPERTIES),
        "marketplace": len(SEED_MARKETPLACE),
        "neighborhoods": len(SEED_NEIGHBORHOODS),
    }


@api.get("/")
async def root():
    return {"app": "AMASS API", "version": "1.0.0"}


# ─── Mount ────────────────────────────────────────────────
app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def on_startup():
    # Auto-seed if empty
    count = await db.properties.count_documents({})
    if count == 0:
        logger.info("Seeding initial data …")
        await seed_data()


@app.on_event("shutdown")
async def on_shutdown():
    client.close()
