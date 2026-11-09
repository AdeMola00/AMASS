"""
Re-runnable cleanup of automated-test fixtures that leaked into the live database.

Automated suites (pytest + the testing agent) sign up throw-away users (…@example.com, …@test.amass,
…@amass-qa.africa, test_…@amass.africa) and create listings titled "TEST_…", Nearby posts "TEST_alert …",
marketplace items "Test sofa …", estates "TEST…", viewings, chats, mandates and notifications. Those surfaced
to real users (Find Home pins, Feeds, the demo inbox, admin queues). This script removes them — and only them.

Rules (conservative):
  • "test user" = email domain example.com / test.amass / amass-qa.africa (except the documented QA account
    zeromass@amass-qa.africa) or local part starting with test_ at amass.africa. Accounts themselves are kept.
  • Content is deleted when it is owned by a test user, or its title/name matches the TEST pattern, or (for
    notifications) the thing it points at no longer exists.
  • Never touches wallets, receipts, Home Hub data, properties_geo, agent tasks or fraud flags.

Run:  cd /app/backend && python scripts/cleanup_test_data.py [--dry-run]
"""
import asyncio
import os
import re
import sys

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

TEST_NAME = {"$regex": r"^(TEST|QA[ _-]|Chat Test|test_|Tester |pytest|zz_test)", "$options": "i"}
TEST_TEXT = {"$regex": r"(TEST_|\bTEST\b|Test sofa|\bQA\b|List Friend)", "$options": "i"}
TEST_SOFA = {"$regex": r"^Test sofa ", "$options": "i"}
KEEP_EMAILS = {"zeromass@amass-qa.africa", "demo@amass.africa", "adaeze.okoye@amass.africa"}


def is_test_email(email: str) -> bool:
    e = (email or "").lower()
    if not e or e in KEEP_EMAILS:
        return False
    local, _, dom = e.partition("@")
    return dom in {"example.com", "test.amass", "amass-qa.africa"} or (dom == "amass.africa" and local.startswith("test_"))


async def ids(cur, k: str = "id") -> list:
    return [d[k] async for d in cur]


async def main(dry_run: bool) -> None:
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ.get("DB_NAME", "test_database")]

    test_users = [u["id"] async for u in db.users.find({}, {"_id": 0, "id": 1, "email": 1}) if is_test_email(u.get("email"))]
    tu = {"$in": test_users}
    print(f"test users: {len(test_users)} (accounts are kept)")

    prop_ids = await ids(db.properties.find({"$or": [{"title": TEST_NAME}, {"owner_id": tu}, {"agent_id": tu}]}, {"_id": 0, "id": 1}))
    market_ids = await ids(db.marketplace.find({"$or": [{"name": TEST_NAME}, {"name": TEST_SOFA}, {"seller_id": tu}]}, {"_id": 0, "id": 1}))
    estate_ids = await ids(db.estates.find({"$or": [{"name": TEST_NAME}, {"created_by": tu}]}, {"_id": 0, "id": 1}))
    post_ids = await ids(db.social_posts.find({"$or": [{"title": TEST_NAME}, {"author_id": tu}]}, {"_id": 0, "id": 1}))
    conv_ids = await ids(db.conversations.find({"participant_ids": {"$elemMatch": tu}}, {"_id": 0, "id": 1}))
    rep_ids = await ids(db.property_representations.find({"user_id": tu}, {"_id": 0, "id": 1}))
    viewing_q = {"$or": [{"buyer_id": tu}, {"agent_id": tu}, {"property_id": {"$in": prop_ids}}]}

    plan = [
        ("properties", {"id": {"$in": prop_ids}}),
        ("favorites", {"property_id": {"$in": prop_ids}}),
        ("viewings", viewing_q),
        ("marketplace", {"id": {"$in": market_ids}}),
        ("marketplace_offers", {"$or": [{"item_id": {"$in": market_ids}}, {"buyer_id": tu}, {"seller_id": tu}]}),
        ("marketplace_reports", {"$or": [{"item_id": {"$in": market_ids}}, {"reporter_id": tu}]}),
        ("estates", {"id": {"$in": estate_ids}}),
        ("estate_members", {"estate_id": {"$in": estate_ids}}),
        ("social_posts", {"id": {"$in": post_ids}}),
        ("social_post_comments", {"$or": [{"post_id": {"$in": post_ids}}, {"author_id": tu}]}),
        ("social_post_likes", {"$or": [{"post_id": {"$in": post_ids}}, {"user_id": tu}]}),
        ("social_post_reports", {"$or": [{"post_id": {"$in": post_ids}}, {"reporter_id": tu}]}),
        ("conversations", {"id": {"$in": conv_ids}}),
        ("chat_messages", {"conversation_id": {"$in": conv_ids}}),
        ("chat_reports", {"$or": [{"conversation_id": {"$in": conv_ids}}, {"reporter_id": tu}]}),
        ("property_representations", {"id": {"$in": rep_ids}}),
        ("agent_reviews", {"$or": [{"reviewer_id": tu}, {"agent_id": tu}]}),
        ("agent_review_reports", {"reporter_id": tu}),
        ("fixa_reports", {"$or": [{"reporter_id": tu}, {"provider_item_id": {"$in": market_ids}}]}),
        ("fixa_bookings", {"$or": [{"user_id": tu}, {"item_id": {"$in": market_ids}}]}),
        ("notifications", {"$or": [{"user_id": tu}, {"title": TEST_TEXT}, {"body": TEST_TEXT}]}),
    ]
    for coll, q in plan:
        n = await db[coll].count_documents(q)
        if not n:
            continue
        if dry_run:
            print(f"[dry-run] would delete {n} from {coll}")
        else:
            r = await db[coll].delete_many(q)
            print(f"deleted {r.deleted_count} from {coll}")

    # Notifications that point at something that no longer exists (deleted above or by earlier test runs).
    checks = {
        "representation_id": ("property_representations", "id"),
        "post_id": ("social_posts", "id"),
        "item_id": ("marketplace", "id"),
        "provider_item_id": ("marketplace", "id"),
        "offer_id": ("marketplace_offers", "id"),
        "review_id": ("agent_reviews", "id"),
        "conversation_id": ("conversations", "id"),
        "property_id": ("properties", "id"),
    }
    orphan_ids = []
    async for n in db.notifications.find({}, {"_id": 0, "id": 1, "meta": 1, "kind": 1}):
        meta = n.get("meta") or {}
        for key, (coll, field) in checks.items():
            ref = meta.get(key)
            if not ref:
                continue
            if key == "property_id" and n.get("kind", "").startswith(("REPRESENTATION", "VERIFICATION", "FRAUD")):
                continue  # those reference properties_geo, which we never touch
            if not await db[coll].find_one({field: ref}, {"_id": 1}):
                orphan_ids.append(n["id"])
                break
    if orphan_ids:
        if dry_run:
            print(f"[dry-run] would delete {len(orphan_ids)} orphan notifications")
        else:
            r = await db.notifications.delete_many({"id": {"$in": orphan_ids}})
            print(f"deleted {r.deleted_count} orphan notifications")
    print("done")


if __name__ == "__main__":
    asyncio.run(main("--dry-run" in sys.argv))
