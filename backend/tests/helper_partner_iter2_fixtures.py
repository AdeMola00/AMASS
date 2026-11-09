# Helper (iter2): create TEST_ UI fixtures — FIXA pending+confirmed jobs and 2 open offers to seller.demo
import os, uuid, json
from datetime import date, timedelta
import requests

B = (os.environ.get("EXPO_BACKEND_URL") or os.environ.get("EXPO_PUBLIC_BACKEND_URL")).rstrip("/")


def login(e, p):
    s = requests.Session()
    s.headers["Authorization"] = "Bearer " + requests.post(f"{B}/api/auth/login", json={"email": e, "password": p}).json()["access_token"]
    return s


def fresh():
    r = requests.post(f"{B}/api/auth/register", json={"email": f"test_partner_{uuid.uuid4().hex[:8]}@amass-qa.africa", "password": "TestPass2026!", "full_name": "TEST_ Ui Buyer"})
    s = requests.Session()
    s.headers["Authorization"] = "Bearer " + r.json()["access_token"]
    return s


fixa = login("fixa.demo@amass.africa", "Partner2026!")
seller = login("seller.demo@amass.africa", "Partner2026!")
item_id = fixa.get(f"{B}/api/partner/me").json()["fixa"]["item_id"]
out = {}
for k in ("pending", "confirmed"):
    r = fresh().post(f"{B}/api/marketplace/fixa/book", json={"item_id": item_id, "customer_name": f"TEST_ {k} customer", "customer_phone": "+2348031000011", "address": "TEST_ 2 Ui St, Yaba", "scheduled_date": (date.today() + timedelta(days=2)).isoformat(), "scheduled_time": "Morning"})
    bid = r.json().get("id") or r.json().get("booking", {}).get("id")
    if k == "confirmed":
        fixa.post(f"{B}/api/fixa/jobs/{bid}/confirm", json={})
    out[f"job_{k}"] = bid
items = [i for i in seller.get(f"{B}/api/marketplace/my-listings").json() if i.get("status", "active") == "active"]
for n, it in zip(("offer_a", "offer_b"), items[:2] if len(items) > 1 else items * 2):
    r = fresh().post(f"{B}/api/marketplace/items/{it['id']}/offer", json={"amount": 120000, "message": f"TEST_ {n}"})
    out[n] = r.json().get("id") or r.json().get("offer", {}).get("id")
print(json.dumps(out))
print("counts", fixa.get(f"{B}/api/partner/me").json()["counts"], seller.get(f"{B}/api/partner/me").json()["counts"])
