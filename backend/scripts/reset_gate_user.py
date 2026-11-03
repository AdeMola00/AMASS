"""Put the QA zero-MASS account back behind the Add MASS gate (wallet 0, map hour spent).

Usage: python3 scripts/reset_gate_user.py
"""
from dotenv import dotenv_values
from pymongo import MongoClient

BE = dotenv_values("/app/backend/.env")
EMAIL = "gate-preview@amass-qa.africa"

db = MongoClient(BE["MONGO_URL"])[BE["DB_NAME"]]
u = db.users.find_one({"email": EMAIL}, {"id": 1})
assert u, "QA zero-MASS user missing — see memory/test_credentials.md"
db.wallets.update_one({"user_id": u["id"], "currency": "MASS"}, {"$set": {"balance": 0, "bonus_balance": 0, "locked": 0}})
doc = db.map_time.find_one({"user_id": u["id"]}) or {}
db.map_time.update_one({"user_id": u["id"]}, {"$set": {"used_seconds": int(doc.get("paid_seconds") or 0)}})
print("reset", EMAIL, db.wallets.find_one({"user_id": u["id"], "currency": "MASS"}, {"_id": 0, "balance": 1}), db.map_time.find_one({"user_id": u["id"]}, {"_id": 0, "paid_seconds": 1, "used_seconds": 1}))
