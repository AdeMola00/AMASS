"""Remove the TEST_/probe posts QA leaves in the demo account and reset the demo creator's strikes/suspension."""
import asyncio
import os
import sys

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))


async def main() -> None:
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ.get("DB_NAME", "amass_db")]
    demo = await db.users.find_one({"email": "demo@amass.africa"}, {"id": 1})
    q = {"author_id": demo["id"], "$or": [{"title": {"$regex": "^TEST_"}}, {"body": {"$regex": "^TEST_"}}, {"title": {"$regex": "^Unregistered pistol|^Pistol for sale|handgun", "$options": "i"}}, {"body": {"$regex": "^Testing feed post|^Retest post"}}, {"moderation.decision_note": "Weapons are prohibited"}]}
    ids = [p["id"] async for p in db.social_posts.find(q, {"id": 1})]
    await db.social_posts.delete_many({"id": {"$in": ids}})
    await db.social_appeals.delete_many({"post_id": {"$in": ids}})
    await db.social_post_reports.delete_many({"post_id": {"$in": ids}})
    await db.marketplace.delete_many({"social_post_id": {"$in": ids}})
    await db.social_profiles.update_one({"user_id": demo["id"]}, {"$set": {"strikes": 0, "feed_suspended": False}})
    flagged = await db.social_posts.count_documents({"moderation.status": "flagged", "status": {"$ne": "removed"}})
    print(f"deleted {len(ids)} test posts · flagged left: {flagged}")


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
