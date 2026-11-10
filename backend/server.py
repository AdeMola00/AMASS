from fastapi import FastAPI, APIRouter, HTTPException, Header, Depends
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import secrets as secrets_lib
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import List, Optional, Dict, Any
import uuid
import asyncio
import re
import ipaddress
import httpx
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlparse
from datetime import datetime, timezone


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

ADMIN_API_KEY = os.environ.get('ADMIN_API_KEY')

# ---------------------------------------------------------------------------
# Lead alert emails (Emergent managed email — Resend via integration proxy)
# ---------------------------------------------------------------------------
EMAIL_BASE_URL = "https://integrations.emergentagent.com"  # constant, never from env
EMAIL_KEY = os.environ.get("EMERGENT_EMAIL_KEY")
EMAIL_FROM_NAME = os.environ.get("EMAIL_FROM_NAME")
EMAIL_REPLY_TO = os.environ.get("EMAIL_REPLY_TO")
ALERT_EMAIL = os.environ.get("ALERT_EMAIL")

_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "goo.gl", "rebrand.ly")
_CRED_ASK = ("reply with your password", "reply with the code", "send your password", "cvv",
             "send us your password", "enter your password below", "confirm your card number",
             "your full card number", "seed phrase", "recovery phrase", "verify your card",
             "social security number", "confirm your bank details")
_HOSTISH = re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", re.I)


def _host_ok(host: str) -> bool:
    if not host or "xn--" in host:
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)


def _same_site(shown: str, real: str) -> bool:
    return shown == real or real.endswith("." + shown) or shown.endswith("." + real)


class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls, self.anchors = set(), [], []
        self._href, self._text = None, []

    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]
        if tag.lower() == "a":
            self._href = dict((k.lower(), v) for k, v in attrs).get("href")
            self._text = []

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.anchors.append((self._href, "".join(self._text)))
            self._href, self._text = None, []


def _assert_safe_email(subject: str, html: str) -> None:
    scan = _EmailScan()
    scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms or input fields in email (G2)")
    body = f"{subject}\n{html}".lower()
    for p in _CRED_ASK:
        if p in body:
            raise ValueError(f"Email asks the recipient for credentials: {p!r} (G2)")
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")):
            continue
        if not low.startswith("https://"):
            raise ValueError(f"Email links/assets must be absolute https: {url!r} (G3)")
        host = urlparse(low).hostname or ""
        if not _host_ok(host) or urlparse(low).username is not None:
            raise ValueError(f"Shortened, numeric-host or credential-bearing URL: {url!r} (G3)")
    for href, text in scan.anchors:
        real = urlparse(href.strip().lower()).hostname or ""
        if not real:
            continue
        for m in _HOSTISH.finditer(text):
            if not _same_site(m.group(1).lower(), real):
                raise ValueError(f"Anchor text {m.group(1)!r} != real link host {real!r} (G3)")


FORM_LABELS = {
    "waiting_list": "Waiting List signup",
    "become_agent": "Agent application",
    "fixa_provider": "FIXA Pro application",
    "list_property": "List Property request",
    "contact": "Contact message",
    "book_demo": "Demo booking",
    "partner": "Partnership enquiry",
    "newsletter": "Newsletter signup",
}


def lead_alert_html(lead: "Lead") -> str:
    """Server-side template for the internal lead alert (all values escaped)."""
    rows = [("Name", lead.name), ("Email", lead.email), ("Phone", lead.phone), ("Message", lead.message)]
    rows += [(k.replace("_", " ").title(), str(v)) for k, v in (lead.details or {}).items()]
    body = "".join(
        f'<tr><td style="padding:6px 12px;font-weight:bold;color:#555;vertical-align:top">{escape(label)}</td>'
        f'<td style="padding:6px 12px">{escape(str(value))}</td></tr>'
        for label, value in rows if value
    )
    label = FORM_LABELS.get(lead.form_type, lead.form_type.replace("_", " ").title())
    return (
        '<table role="presentation" width="100%"><tr><td style="padding:24px;font-family:Arial,sans-serif">'
        f'<h2 style="margin:0 0 4px;color:#E11D2A">New {escape(label)}</h2>'
        f'<p style="margin:0 0 16px;color:#555">Submitted on the AMASS landing page at {escape(lead.created_at)}.</p>'
        f'<table role="presentation" style="border-collapse:collapse;border:1px solid #eee">{body}</table>'
        f'<p style="font-size:12px;color:#888;margin-top:24px">Sent by {escape(EMAIL_FROM_NAME or "AMASS")} lead alerts. '
        'We never ask for passwords or card details by email.</p>'
        '</td></tr></table>'
    )


async def send_email(*, to: str, subject: str, html: str) -> Optional[str]:
    """Fire-and-log send via the managed email proxy. Never raises to callers."""
    _assert_safe_email(subject, html)
    payload = {"to": [to], "subject": subject, "html": html, "from_name": EMAIL_FROM_NAME}
    if EMAIL_REPLY_TO:
        payload["contact_email"] = EMAIL_REPLY_TO
    try:
        async with httpx.AsyncClient(timeout=30) as http:
            resp = await http.post(
                f"{EMAIL_BASE_URL}/api/v1/email/send",
                headers={"X-Email-Key": EMAIL_KEY},
                json=payload,
            )
        if resp.status_code >= 400:
            try:
                code = resp.json().get("code", "")
            except ValueError:
                code = ""
            if code in ("insufficient_credits", "integration_disabled", "daily_limit_reached"):
                logger.warning("Email paused: %s (%s) — owner action needed in Emergent", code, resp.status_code)
            else:
                logger.error("Email send failed: %s %s", resp.status_code, resp.text)
            return None
        email_id = resp.json().get("id")
        logger.info("Lead alert email sent to %s (id=%s)", to, email_id)
        return email_id
    except Exception:
        logger.exception("Email send error")
        return None


app = FastAPI(title="AMASS API")
api_router = APIRouter(prefix="/api")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Admin API-key authentication (machine-to-machine for AMASS ADMIN)
# ---------------------------------------------------------------------------
async def require_admin(
    x_api_key: Optional[str] = Header(None),
    authorization: Optional[str] = Header(None),
):
    provided = x_api_key
    if not provided and authorization and authorization.lower().startswith("bearer "):
        provided = authorization[7:]
    if not ADMIN_API_KEY:
        raise HTTPException(status_code=503, detail="Admin API key is not configured")
    if not provided or not secrets_lib.compare_digest(provided, ADMIN_API_KEY):
        raise HTTPException(status_code=401, detail="Invalid or missing API key")
    return True


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
VALID_FORMS = {
    "become_agent", "list_property", "contact", "book_demo",
    "partner", "waiting_list", "newsletter", "fixa_provider",
}
LEAD_STATUSES = {"new", "contacted", "closed"}


class LeadCreate(BaseModel):
    form_type: str
    name: Optional[str] = None
    email: EmailStr
    phone: Optional[str] = None
    message: Optional[str] = None
    details: Dict[str, Any] = Field(default_factory=dict)


class Lead(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    form_type: str
    name: Optional[str] = None
    email: str
    phone: Optional[str] = None
    message: Optional[str] = None
    details: Dict[str, Any] = Field(default_factory=dict)
    status: str = "new"
    created_at: str = Field(default_factory=now_iso)


class NewsletterCreate(BaseModel):
    email: EmailStr


class LeadUpdate(BaseModel):
    status: Optional[str] = None
    notes: Optional[str] = None


# ---------------------------------------------------------------------------
# Editable landing-page content (CMS) — defaults seed the database
# ---------------------------------------------------------------------------
DEFAULT_CONTENT: Dict[str, Any] = {
    "hero": {
        "overline": "The Google Maps of African Real Estate",
        "line1": "Discover Africa's",
        "line2": "Properties Like",
        "line3": "Never Before",
        "subheading": "The AMASS app lets you search, verify, buy, rent, finance, insure and explore properties with intelligent maps, verified listings and AI-powered property intelligence.",
        "ctaPrimary": "Get Early Access",
        "ctaSecondary": "Become an Agent",
    },
    "trust": ["Verified Listings", "AI Powered", "Secure Transactions", "Pan-African Coverage"],
    "stats": [
        {"value": "48,000+", "label": "Properties Listed"},
        {"value": "3,200+", "label": "Verified Agents"},
        {"value": "120k+", "label": "Verified Documents"},
        {"value": "20+", "label": "Cities Across Africa"},
        {"value": "0.4s", "label": "Avg. Search Speed"},
        {"value": "₦900B+", "label": "Transactions Secured"},
    ],
    "africanCities": [
        "Lagos", "Abuja", "Accra", "Nairobi", "Kigali", "Cape Town",
        "Kampala", "Dar es Salaam", "Dakar", "Addis Ababa", "Johannesburg", "Kumasi",
    ],
    "testimonials": [
        {"name": "Adebayo Ogunlesi", "role": "Property Investor · Lagos", "quote": "AMASS turned a 3-month search into a weekend. The verification alone saved me from two fraudulent listings.", "avatar": "https://images.pexels.com/photos/36053652/pexels-photo-36053652.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop"},
        {"name": "Ama Mensah", "role": "First-time Buyer · Accra", "quote": "I bought my first apartment in East Legon entirely through AMASS. Escrow made the payment feel completely safe.", "avatar": "https://images.pexels.com/photos/5999896/pexels-photo-5999896.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop"},
        {"name": "Chinedu Okafor", "role": "Verified Agent · Abuja", "quote": "My leads tripled in the first month. The CRM and analytics are genuinely better than tools I paid for.", "avatar": "https://images.pexels.com/photos/13801446/pexels-photo-13801446.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop"},
        {"name": "Wanjiru Kamau", "role": "Developer · Nairobi", "quote": "We sold out a 40-unit development off-plan using AMASS new-development tools. Remarkable reach across Africa.", "avatar": "https://images.pexels.com/photos/5905901/pexels-photo-5905901.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop"},
        {"name": "Emeka Nwankwo", "role": "Construction Co. · Kigali", "quote": "Sourcing materials and vetted professionals in one marketplace cut our procurement time in half.", "avatar": "https://images.pexels.com/photos/13801474/pexels-photo-13801474.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop"},
    ],
    "faqs": [
        {"q": "Where is AMASS available across Africa?", "a": "AMASS is live in 20+ cities with the deepest inventory in Lagos, Abuja, Accra and Nairobi — and expanding rapidly across the continent."},
        {"q": "How does AMASS verify listings?", "a": "Every listing passes document checks, ownership validation and agent identity verification before it earns a verified badge."},
        {"q": "Are transactions safe?", "a": "All payments can move through AMASS Escrow, so funds are only released when both parties meet agreed conditions."},
        {"q": "What is AMASS Property Intelligence?", "a": "It's our AI + satellite layer delivering valuations, neighbourhood scores, risk analysis and market predictions on any property."},
        {"q": "How do I become an AMASS agent?", "a": "Tap ‘Become an Agent’, complete verification, and start listing with a full CRM, analytics and marketing suite."},
        {"q": "Does AMASS offer financing?", "a": "Yes — mortgages, BNPL, property financing and insurance through our vetted financial partners."},
    ],
    "sections": {
        "marquee": True, "categories": True, "pillars": True,
        "showcase": True, "stats": True, "howItWorks": True, "agents": True,
        "constructionPros": True, "homeMarketplace": True, "mobileApp": True,
        "testimonials": True, "faq": True, "finalCta": True, "ecosystem": True,
    },
}


async def seed_content():
    existing = await db.site_content.find_one({"key": "default"})
    if not existing:
        await db.site_content.insert_one({"key": "default", **DEFAULT_CONTENT, "updated_at": now_iso()})


# ---------------------------------------------------------------------------
# Public routes
# ---------------------------------------------------------------------------
@api_router.get("/")
async def root():
    return {"message": "AMASS API is live"}


@api_router.get("/content")
async def get_content():
    doc = await db.site_content.find_one({"key": "default"}, {"_id": 0})
    if not doc:
        await seed_content()
        doc = await db.site_content.find_one({"key": "default"}, {"_id": 0})
    return doc


@api_router.post("/leads", response_model=Lead, status_code=201)
async def create_lead(payload: LeadCreate):
    if payload.form_type not in VALID_FORMS:
        raise HTTPException(status_code=400, detail="Unsupported form type")
    lead = Lead(**payload.model_dump())
    await db.leads.insert_one(lead.model_dump())
    logger.info("New lead captured: %s (%s)", lead.email, lead.form_type)
    if ALERT_EMAIL and EMAIL_KEY:
        label = FORM_LABELS.get(lead.form_type, lead.form_type.replace("_", " ").title())
        # fire-and-forget: a slow email proxy must never delay the user-facing response
        asyncio.create_task(send_email(to=ALERT_EMAIL, subject=f"New AMASS lead: {label}", html=lead_alert_html(lead)))
    return lead


@api_router.post("/newsletter", response_model=Lead, status_code=201)
async def subscribe_newsletter(payload: NewsletterCreate):
    existing = await db.leads.find_one(
        {"email": payload.email, "form_type": "newsletter"}, {"_id": 0}
    )
    if existing:
        return existing
    lead = Lead(form_type="newsletter", email=payload.email)
    await db.leads.insert_one(lead.model_dump())
    return lead


# ---------------------------------------------------------------------------
# Admin routes (API-key protected) — for the external AMASS ADMIN dashboard
# ---------------------------------------------------------------------------
@api_router.get("/admin/leads", response_model=List[Lead])
async def admin_list_leads(
    form_type: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 1000,
    _: bool = Depends(require_admin),
):
    query: Dict[str, Any] = {}
    if form_type:
        query["form_type"] = form_type
    if status:
        query["status"] = status
    leads = await db.leads.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return leads


@api_router.get("/admin/newsletter", response_model=List[Lead])
async def admin_list_newsletter(limit: int = 2000, _: bool = Depends(require_admin)):
    leads = await db.leads.find(
        {"form_type": "newsletter"}, {"_id": 0}
    ).sort("created_at", -1).to_list(limit)
    return leads


@api_router.patch("/admin/leads/{lead_id}", response_model=Lead)
async def admin_update_lead(lead_id: str, payload: LeadUpdate, _: bool = Depends(require_admin)):
    update: Dict[str, Any] = {}
    if payload.status is not None:
        if payload.status not in LEAD_STATUSES:
            raise HTTPException(status_code=400, detail="Invalid status")
        update["status"] = payload.status
    if payload.notes is not None:
        update["notes"] = payload.notes
    if not update:
        raise HTTPException(status_code=400, detail="Nothing to update")
    result = await db.leads.update_one({"id": lead_id}, {"$set": update})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Lead not found")
    doc = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    return doc


@api_router.get("/admin/stats")
async def admin_stats(_: bool = Depends(require_admin)):
    total = await db.leads.count_documents({})
    by_form: Dict[str, int] = {}
    for ft in VALID_FORMS:
        by_form[ft] = await db.leads.count_documents({"form_type": ft})
    by_status: Dict[str, int] = {}
    for st in LEAD_STATUSES:
        by_status[st] = await db.leads.count_documents({"status": st})
    recent = await db.leads.find({}, {"_id": 0}).sort("created_at", -1).to_list(10)
    return {"total_leads": total, "by_form_type": by_form, "by_status": by_status, "recent": recent}


@api_router.get("/admin/content")
async def admin_get_content(_: bool = Depends(require_admin)):
    doc = await db.site_content.find_one({"key": "default"}, {"_id": 0})
    if not doc:
        await seed_content()
        doc = await db.site_content.find_one({"key": "default"}, {"_id": 0})
    return doc


def deep_merge(base: Dict[str, Any], patch: Dict[str, Any]) -> Dict[str, Any]:
    """Recursively merge patch into base. Dicts merge; lists/scalars replace."""
    for k, v in patch.items():
        if isinstance(v, dict) and isinstance(base.get(k), dict):
            base[k] = deep_merge(base[k], v)
        else:
            base[k] = v
    return base


@api_router.put("/admin/content")
async def admin_update_content(payload: Dict[str, Any], _: bool = Depends(require_admin)):
    payload.pop("key", None)
    payload.pop("_id", None)
    current = await db.site_content.find_one({"key": "default"}, {"_id": 0})
    if not current:
        current = {"key": "default", **DEFAULT_CONTENT}
    merged = deep_merge(current, payload)
    merged["updated_at"] = now_iso()
    await db.site_content.update_one({"key": "default"}, {"$set": merged}, upsert=True)
    doc = await db.site_content.find_one({"key": "default"}, {"_id": 0})
    return doc


@api_router.post("/admin/content/reset")
async def admin_reset_content(_: bool = Depends(require_admin)):
    await db.site_content.update_one(
        {"key": "default"},
        {"$set": {**DEFAULT_CONTENT, "updated_at": now_iso()}},
        upsert=True,
    )
    doc = await db.site_content.find_one({"key": "default"}, {"_id": 0})
    return doc


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def on_startup():
    await seed_content()


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
