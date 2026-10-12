"""Idempotent restore of the demo account (demo@amass.africa / amass2026).

Usage:  cd /app/backend && python3 scripts/restore_demo_user.py

Re-creates the user row (with its ORIGINAL id so chats / unlocks / leads keep
their links), un-archives the demo properties, and recreates the approved agent
profile, wallets and Pro subscription.
"""
import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone

import bcrypt
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

DEMO_ID = "a8d30ca3-f221-4240-b0b9-5bf708206efc"
DEMO_EMAIL = "demo@amass.africa"
DEMO_PASSWORD = "amass2026"
DEMO_NAME = "Ada Demo"

# Original seed statuses (title prefix → status). Anything else → available.
SEED_STATUS = {
    "Palatial Ocean-View Duplex": "premium",
    "Serene 4-Bedroom Terrace": "verified",
    "Skyline Penthouse": "premium",
    "Modern 3-Bed Apartment for Rent": "available",
    "Prime Land, Abeokuta": "verified",
    "Contemporary Bungalow, Abuja": "available",
    "Short-Let Studio": "available",
    "Commercial Office Space": "verified",
    "Sold - Elegant Terrace": "sold",
}


def _status_for(title: str) -> str:
    for prefix, status in SEED_STATUS.items():
        if title.startswith(prefix):
            return status
    return "available"


async def main() -> None:
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    now = datetime.now(timezone.utc)

    # 1. User row
    pw_hash = bcrypt.hashpw(DEMO_PASSWORD.encode(), bcrypt.gensalt()).decode()
    await db.users.update_one(
        {"id": DEMO_ID},
        {
            "$set": {
                "email": DEMO_EMAIL,
                "password_hash": pw_hash,
                "full_name": DEMO_NAME,
                "phone": "+2348012345678",
                "phone_verified": True,
                "city": "Lagos",
                "bio": "AMASS demo agent · Lekki & Ikoyi specialist",
                "is_agent": True,
                "is_admin": True,
                "referral_code": "ADAD-ZDWU",
            },
            "$setOnInsert": {"id": DEMO_ID, "avatar_url": None, "created_at": now},
        },
        upsert=True,
    )
    print("user: ok")

    # 2. Properties — re-link + un-archive
    props = await db.properties.find(
        {"agent_id": {"$in": ["deleted-user", DEMO_ID]}}, {"_id": 0, "id": 1, "title": 1}
    ).to_list(500)
    for p in props:
        await db.properties.update_one(
            {"id": p["id"]},
            {
                "$set": {
                    "agent_id": DEMO_ID,
                    "agent_name": DEMO_NAME,
                    "status": _status_for(p.get("title", "")),
                }
            },
        )
    print(f"properties restored: {len(props)}")

    # 3. Approved agent profile
    await db.agent_applications.update_one(
        {"user_id": DEMO_ID},
        {
            "$set": {
                "full_name": DEMO_NAME,
                "phone": "+2348012345678",
                "email": DEMO_EMAIL,
                "agency_name": "AMASS Demo Realty",
                "office_address": "12 Admiralty Way, Lekki Phase 1, Lagos",
                "state": "Lagos",
                "lga": "Eti-Osa",
                "years_experience": 6,
                "areas_of_operation": ["Lekki", "Ikoyi", "Victoria Island"],
                "specialisations": ["residential", "luxury", "land"],
                "has_mandate_authority": True,
                "verification_level": 3,
                "status": "approved",
                "slug": "ada-demo",
                "rating": 4.8,
                "reviews_count": 12,
                "updated_at": now,
            },
            "$setOnInsert": {"id": str(uuid.uuid4()), "created_at": now, "avatar_url": None},
        },
        upsert=True,
    )
    print("agent profile: ok")

    # 4. Wallets (MASS + FIX)
    for currency, balance, earned, used in (("MASS", 6328, 7000, 672), ("FIX", 480, 520, 40)):
        await db.wallets.update_one(
            {"user_id": DEMO_ID, "currency": currency},
            {
                "$set": {"balance": balance, "bonus_balance": 0, "locked": 0,
                         "lifetime_earned": earned, "lifetime_used": used},
                "$setOnInsert": {"created_at": now},
            },
            upsert=True,
        )
        if not await db.token_transactions.find_one({"user_id": DEMO_ID, "currency": currency}):
            await db.token_transactions.insert_one(
                {
                    "id": str(uuid.uuid4()),
                    "user_id": DEMO_ID,
                    "kind": "adjustment",
                    "amount": balance,
                    "balance_after": balance,
                    "description": f"Demo account restored · {currency} balance",
                    "currency": currency,
                    "created_at": now,
                }
            )
    print("wallets: ok")

    # 5. Active Pro subscription
    if not await db.agent_subscriptions.find_one({"user_id": DEMO_ID, "status": "active"}):
        await db.agent_subscriptions.insert_one(
            {
                "id": str(uuid.uuid4()),
                "user_id": DEMO_ID,
                "plan_id": "pro",
                "status": "active",
                "is_founding_price": True,
                "monthly_price_ngn": 10000,
                "listing_limit": 30,
                "payment_reference": f"agentsub_demo_{uuid.uuid4().hex[:8]}",
                "provider": "mock",
                "started_at": now,
                "next_billing_at": now.replace(microsecond=0),
                "expires_at": None,
                "cancelled_at": None,
                "created_at": now,
            }
        )
    print("subscription: ok")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
