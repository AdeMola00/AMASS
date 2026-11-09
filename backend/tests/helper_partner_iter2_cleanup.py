# Helper (iter2): cleanup of TEST_ records created by this run, by id only
import os
import requests

B = (os.environ.get("EXPO_BACKEND_URL") or os.environ.get("EXPO_PUBLIC_BACKEND_URL")).rstrip("/")


def tok(e, p):
    return {"Authorization": "Bearer " + requests.post(f"{B}/api/auth/login", json={"email": e, "password": p}).json()["access_token"]}


bh = {"Authorization": "Bearer " + requests.post(f"{B}/api/brand/auth/login", json={"email": "brand.demo@amass.africa", "password": "Partner2026!"}).json()["token"]}
for p in requests.get(f"{B}/api/brand/products", headers=bh).json()["items"]:
    if p["name"] == "TEST_ Brand partner soap":
        print("del brand product", p["id"], requests.delete(f"{B}/api/brand/products/{p['id']}", headers=bh).status_code)

sh = tok("seller.demo@amass.africa", "Partner2026!")
for i in requests.get(f"{B}/api/marketplace/my-listings", headers=sh).json():
    if i.get("name") == "TEST_ Partner lamp":
        print("del item", i["id"], requests.delete(f"{B}/api/marketplace/v2/items/{i['id']}", headers=sh).status_code, requests.delete(f"{B}/api/marketplace/items/{i['id']}", headers=sh).status_code)

ah = tok("agent.demo@amass.africa", "Partner2026!")
r = requests.get(f"{B}/api/partner/me", headers=ah).json()
print("agent.demo quota", r["listing_quota"])
