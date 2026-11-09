# Helper (iter3): create / delete a TEST_ listing for agent.demo used by the UI edit + share tests. Usage: python helper_partner_iter3_fixture.py create|delete <id>
import os
import sys

import requests
from dotenv import dotenv_values
from pymongo import MongoClient

B = (os.environ.get("EXPO_BACKEND_URL") or os.environ.get("EXPO_PUBLIC_BACKEND_URL")).rstrip("/")
e = dotenv_values("/app/backend/.env")
db = MongoClient(e["MONGO_URL"])[e["DB_NAME"]]

if sys.argv[1] == "create":
    t = requests.post(f"{B}/api/auth/login", json={"email": "agent.demo@amass.africa", "password": "Partner2026!"}).json()["access_token"]
    r = requests.post(f"{B}/api/properties", headers={"Authorization": f"Bearer {t}"}, json={"title": "TEST_iter3 UI home", "description": "TEST_ listing for UI edit", "price": 2000000, "listing_type": "rent", "property_type": "apartment", "bedrooms": 2, "bathrooms": 1, "size_sqm": 70, "location": "TEST Yaba", "city": "Lagos", "state": "Lagos", "latitude": 6.5, "longitude": 3.4, "images": ["https://images.unsplash.com/photo-1515263487990-61b07816b324?w=1200", "https://images.unsplash.com/photo-1600607688969-a5bfcd646154?w=1200"]})
    print(r.status_code, r.json().get("id"))
else:
    pid = sys.argv[2]
    print("deleted", db.properties.delete_one({"id": pid, "title": "TEST_iter3 UI home"}).deleted_count)
    db.property_audit_logs.delete_many({"property_id": pid})
