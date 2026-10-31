"""Edge-case probe for /api/portal/market (T1 review). Creates TEST_ rows and deletes them at the end."""
import uuid
import requests
from dotenv import dotenv_values
from pymongo import MongoClient

FE = dotenv_values("/app/frontend/.env"); BE = dotenv_values("/app/backend/.env")
BASE = FE["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") + "/api"
db = MongoClient(BE["MONGO_URL"])[BE["DB_NAME"]]
U = uuid.uuid4().hex[:6]
PNG = bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fe0d35b8b70000000049454e44ae426082")
_j = requests.post(f"{BASE}/auth/login", json={"email": "demo@amass.africa", "password": "amass2026"}).json(); tok = _j.get("token") or _j.get("access_token")
_t = tok if isinstance(tok, str) else None
AH = {"Authorization": f"Bearer {tok}"}
H = {"X-AMASS-Portal-Key": requests.post(f"{BASE}/admin/portal-connection/key", headers=AH, json={"label": "T1 probe"}).json()["key"], "X-AMASS-Portal-Actor": "Tester <qa@amass.africa>"}
P = lambda m, p, **k: requests.request(m, f"{BASE}/portal{p}", headers=H, timeout=60, **k)
created = {"brand": None, "banners": [], "media": []}
try:
    b = P("POST", "/market/brands", json={"name": f"TEST_Probe {U}", "categories": ["lighting"]}).json(); created["brand"] = b["id"]
    pr = P("POST", f"/market/brands/{b['id']}/products", json={"name": f"TEST_ProbeLamp {U}", "category": "lighting", "price": 5000}).json()
    # 1 hidden brand -> its products still public?
    P("DELETE", f"/market/brands/{b['id']}")
    print("1 hidden-brand product GET:", requests.get(f"{BASE}/shop/products/{pr['id']}").status_code)
    s = requests.get(f"{BASE}/shop/search", params={"q": f"ProbeLamp {U}"}).json()
    print("1 hidden-brand product in search:", pr["id"] in str(s))
    c = requests.get(f"{BASE}/shop/products", params={"category": "lighting", "limit": 500}).json()
    print("1 hidden-brand product in category list:", pr["id"] in str(c))
    P("POST", f"/market/brands/{b['id']}/restore")
    # 2 banner archive -> restore -> live?
    bn = P("POST", "/market/banners", json={"title": f"TEST_ProbeBanner {U}"}).json(); created["banners"].append(bn["id"])
    P("DELETE", f"/market/banners/{bn['id']}")
    r = P("POST", f"/market/banners/{bn['id']}/restore").json()
    print("2 restored banner active/live:", r.get("active"), r.get("live"))
    # 3 banner route validation
    for route in ["javascript:alert(1)", "http://insecure.example.com", "not a route"]:
        rr = P("POST", "/market/banners", json={"title": f"TEST_route {U}", "route": route})
        print("3 banner route", repr(route), "->", rr.status_code)
        if rr.status_code == 201: created["banners"].append(rr.json()["id"])
    # 4 spoofed content-type
    rr = requests.post(f"{BASE}/portal/market/upload", headers=H, files={"file": ("x.png", b"<html>not an image</html>", "image/png")})
    print("4 non-image bytes labelled image/png ->", rr.status_code)
    if rr.status_code == 201: created["media"].append(rr.json()["id"])
    # 5 expired ends_at banner on create
    rr = P("POST", "/market/banners", json={"title": f"TEST_expired {U}", "ends_at": "2020-01-01T00:00:00Z"})
    print("5 banner ends_at in past ->", rr.status_code, rr.json().get("live") if rr.ok else rr.text[:100])
    if rr.status_code == 201: created["banners"].append(rr.json()["id"])
    # 6 declutter route on a FIXA services listing (moderation crossing)
    svc = db.marketplace.find_one({"category": "services"}, {"_id": 0, "id": 1})
    print("6 declutter list includes services?", any(i.get("category") == "services" for i in P("GET", "/market/declutter/listings", params={"status": "all", "limit": 500}).json()["items"]))
    # 7 unknown ids
    for m, p, j in [("PATCH", "/market/products/nope", {"name": "xx"}), ("PUT", "/market/products/nope/offer", {"previous_price": 10}), ("PATCH", "/market/banners/nope", {"title": "xx"}), ("POST", "/market/brands/nope/accounts", {"name": "a", "email": f"x{U}@amass-qa.africa"}), ("POST", "/market/brands/nope/products", {"name": "xx", "category": "lighting", "price": 1}), ("PATCH", "/market/brands/nope/accounts/nope", {"disabled": True}), ("POST", "/market/fixa/providers/nope/suspend", {}), ("POST", "/market/fixa/reports/nope/resolve", {}), ("POST", "/market/declutter/reports/nope/resolve", {"action": "dismiss"})]:
        print("7", m, p, "->", P(m, p, json=j).status_code)
    # 8 invalid email on brand login
    print("8 bad email ->", P("POST", f"/market/brands/{b['id']}/accounts", json={"name": "a", "email": "bad"}).status_code)
    # 9 patch brand published False -> hidden_at?
    rr = P("PATCH", f"/market/brands/{b['id']}", json={"published": False}).json()
    print("9 PATCH published False -> hidden_at:", rr.get("hidden_at"), "| status=hidden lists it:", any(x["id"] == b["id"] for x in P("GET", "/market/brands", params={"status": "hidden", "search": U}).json()["items"]))
    P("PATCH", f"/market/brands/{b['id']}", json={"published": True})
    # 10 offer on hidden product + overview count
    P("PUT", f"/market/products/{pr['id']}/offer", json={"previous_price": 9000})
    P("DELETE", f"/market/products/{pr['id']}")
    print("10 hidden product offer in /market/offers?status=live:", any(x["id"] == pr["id"] for x in P("GET", "/market/offers").json()["items"]))
    # 11 delete image with url not present
    print("11 remove absent image ->", requests.delete(f"{BASE}/portal/market/products/{pr['id']}/images", headers=H, params={"url": "https://x/y.png"}).status_code)
    # 12 no key / bad key / staff token on market
    print("12 no key ->", requests.get(f"{BASE}/portal/market/overview").status_code)
    # 13 empty-name brand / missing name
    print("13 brand empty name ->", P("POST", "/market/brands", json={"name": ""}).status_code)
    # 14 banner list sort / order: created banner with order -5 first?
    bo = P("POST", "/market/banners", json={"title": f"TEST_order {U}", "order": -5}).json(); created["banners"].append(bo["id"])
    hb = requests.get(f"{BASE}/shop/home").json().get("banners", [])
    print("14 home banners keys:", [x.get("key") for x in hb][:6])
    # 15 offer previous_price == huge / label too long
    print("15 label>60 ->", P("PUT", f"/market/products/{pr['id']}/offer", json={"previous_price": 9000, "label": "x" * 61}).status_code)
    # 16 negative price / price 0 product + offer
    print("16 price -1 ->", P("POST", f"/market/brands/{b['id']}/products", json={"name": "TEST_neg", "category": "lighting", "price": -1}).status_code)
finally:
    if created["brand"]:
        db.shop_products.delete_many({"retailer_id": created["brand"]}); db.brand_accounts.delete_many({"brand_id": created["brand"]}); db.shop_retailers.delete_one({"id": created["brand"]})
    db.shop_banners.delete_many({"id": {"$in": created["banners"]}})
    db.portal_media.delete_many({"id": {"$in": created["media"]}})
    print("cleanup done; leftover TEST_ brands:", db.shop_retailers.count_documents({"name": {"$regex": "^TEST_"}}), "banners:", db.shop_banners.count_documents({"title": {"$regex": "^TEST_"}}))
