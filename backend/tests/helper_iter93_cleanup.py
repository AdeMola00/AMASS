"""Iteration 93 cleanup: remove QA brands/accounts/products/users created by UI tests; keep Smoke Lighting Co."""
import requests
from dotenv import dotenv_values
from pymongo import MongoClient

FE = dotenv_values("/app/frontend/.env")
BE = dotenv_values("/app/backend/.env")
BASE = FE["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
db = MongoClient(BE["MONGO_URL"])[BE["DB_NAME"]]

for r in db.shop_retailers.find({"name": {"$regex": "^QA (UI )?Brand"}}, {"_id": 0, "id": 1, "name": 1}):
    db.brand_accounts.delete_many({"brand_id": r["id"]})
    db.shop_products.delete_many({"retailer_id": r["id"]})
    db.shop_retailers.delete_one({"id": r["id"]})
    print("deleted brand", r["name"])
print("qa accounts", db.brand_accounts.delete_many({"email": {"$regex": "^qa-(ui|brand)-"}}).deleted_count)
print("test products", db.shop_products.delete_many({"name": {"$regex": "^TEST_(UI )?Lamp"}}).deleted_count)
print("qa user", db.users.delete_many({"email": "qa-roles-i93@amass-qa.africa"}).deleted_count)

tok = requests.post(f"{BASE}/api/brand/auth/login", json={"email": "smoke-brand@amass-qa.africa", "password": "BrandPass2026!"}).json()["token"]
H = {"Authorization": f"Bearer {tok}"}
print("restore tagline", requests.patch(f"{BASE}/api/brand/profile", json={"tagline": "Lamps"}, headers=H).status_code)
items = requests.get(f"{BASE}/api/brand/products", headers=H).json()["items"]
if items:  # trigger recount_retailer after direct DB delete
    print("recount", requests.patch(f"{BASE}/api/brand/products/{items[0]['id']}", json={}, headers=H).status_code)
print("smoke products", [(p["name"], p["published"]) for p in items])
print("active portal keys", db.portal_keys.count_documents({"revoked_at": None}))
print("adaeze", db.users.find_one({"email": "adaeze.okoye@amass.africa"}, {"_id": 0, "account_status": 1}))
