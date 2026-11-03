"""QA helper (iter 98): put gate-preview user in last-hour state. Usage: python3 set_last_hour_state.py <minutes_left>"""
import sys
from dotenv import dotenv_values
from pymongo import MongoClient

BE = dotenv_values("/app/backend/.env")
EMAIL = "gate-preview@amass-qa.africa"
mins = int(sys.argv[1]) if len(sys.argv) > 1 else 25
db = MongoClient(BE["MONGO_URL"])[BE["DB_NAME"]]
u = db.users.find_one({"email": EMAIL}, {"id": 1})
db.wallets.update_one({"user_id": u["id"], "currency": "MASS"}, {"$set": {"balance": 0, "bonus_balance": 0, "locked": 0}})
doc = db.map_time.find_one({"user_id": u["id"]}) or {}
paid = int(doc.get("paid_seconds") or 0)
db.map_time.update_one({"user_id": u["id"]}, {"$set": {"used_seconds": paid - mins * 60}})
print("set", db.map_time.find_one({"user_id": u["id"]}, {"_id": 0}))
