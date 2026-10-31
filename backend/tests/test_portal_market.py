"""Admin Portal → Market management (/api/portal/market/*): brands, logins, products, offers, images, banners,
featured placement, FIXA moderation, Declutter moderation, and the `brands` permission module.

Runs against the live preview API with a freshly minted portal key (the key is revoked at the end, which
leaves the demo's own key state untouched except for rotation — regenerate from Admin → Portal if needed).
"""
import os
import uuid

import pytest
import requests
from dotenv import dotenv_values
from pymongo import MongoClient

FE = dotenv_values("/app/frontend/.env")
BE = dotenv_values("/app/backend/.env")
BASE = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or FE["EXPO_PUBLIC_BACKEND_URL"]).rstrip("/") + "/api"
U = uuid.uuid4().hex[:6]
PNG = bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fe0d35b8b70000000049454e44ae426082")
S: dict = {}


@pytest.fixture(scope="module")
def db():
    c = MongoClient(BE["MONGO_URL"])
    yield c[BE["DB_NAME"]]
    c.close()


@pytest.fixture(scope="module")
def portal(db):
    # Staff login (demo is an app admin → super_admin) rather than minting a portal key: keys are single-active,
    # so minting here would revoke the key another test file is using when suites run in parallel.
    r = requests.post(f"{BASE}/portal/auth/login", json={"email": "demo@amass.africa", "password": "amass2026"}, timeout=30)
    assert r.status_code == 200, r.text
    yield {"Authorization": f"Bearer {r.json()['token']}", "X-AMASS-Portal-Actor": "Pytest <qa@amass.africa>"}
    # test rows only
    if S.get("brand_id"):
        db.shop_products.delete_many({"retailer_id": S["brand_id"]})
        db.brand_accounts.delete_many({"brand_id": S["brand_id"]})
        db.shop_retailers.delete_one({"id": S["brand_id"]})
    if S.get("banner_id"):
        db.shop_banners.delete_one({"id": S["banner_id"]})
    if S.get("listing_id"):
        db.marketplace.delete_one({"id": S["listing_id"]})
        db.marketplace_reports.delete_many({"item_id": S["listing_id"]})


def P(portal, method, path, **kw):
    return requests.request(method, f"{BASE}/portal{path}", headers=portal, timeout=60, **kw)


class TestPermissionsAndSchema:
    def test_brands_module_exists_in_roles(self, portal):
        d = P(portal, "GET", "/roles").json()
        assert "brands" in d["modules"]
        cm = next(r for r in d["roles"] if r["name"] == "content_manager")
        assert cm["permissions"]["brands"] == {"view": True, "create": True, "edit": True, "delete": True}
        support = next(r for r in d["roles"] if r["name"] == "customer_support")
        assert support["permissions"]["brands"]["view"] is False

    def test_schema_and_overview(self, portal):
        s = P(portal, "GET", "/market/schema").json()
        assert {g["group"] for g in s["groups"]} >= {"brands", "products", "offers", "banners", "fixa", "declutter"}
        o = P(portal, "GET", "/market/overview").json()
        assert set(o) == {"brands", "products", "banners", "fixa", "declutter"}

    def test_no_key_is_rejected(self):
        r = requests.get(f"{BASE}/portal/market/brands", headers={"X-AMASS-Portal-Key": "amass_pk_nope"}, timeout=30)
        assert r.status_code == 401 and "no active key" in r.json()["detail"]


class TestBrands:
    def test_create_brand(self, portal):
        r = P(portal, "POST", "/market/brands", json={"name": f"Pytest Brand {U}", "categories": ["lighting"], "website": "https://example.com", "tagline": "Bright ideas"})
        assert r.status_code == 201, r.text
        b = r.json()
        S["brand_id"] = b["id"]
        assert b["published"] is True and b["accounts"] == [] and b["source"] == "admin_portal"
        dup = P(portal, "POST", "/market/brands", json={"name": f"pytest brand {U}"})
        assert dup.status_code == 409

    def test_list_filters_and_detail(self, portal):
        items = P(portal, "GET", f"/market/brands?search=Pytest+Brand+{U}").json()["items"]
        assert [i["id"] for i in items] == [S["brand_id"]]
        d = P(portal, "GET", f"/market/brands/{S['brand_id']}").json()
        assert d["products"] == [] and d["tagline"] == "Bright ideas"

    def test_patch_featured_logo(self, portal):
        r = P(portal, "PATCH", f"/market/brands/{S['brand_id']}", json={"tagline": "Even brighter", "phone": "+2348000000000"})
        assert r.status_code == 200 and r.json()["tagline"] == "Even brighter"
        r = P(portal, "PATCH", f"/market/brands/{S['brand_id']}/featured", json={"featured": True})
        assert r.json()["sponsored"] is True
        assert any(b["id"] == S["brand_id"] for b in P(portal, "GET", "/market/featured").json()["brands"])
        r = requests.post(f"{BASE}/portal/market/brands/{S['brand_id']}/logo", headers=portal, files={"file": ("l.png", PNG, "image/png")}, timeout=60)
        assert r.status_code == 201 and "/api/public-files/" in r.json()["logo_url"]
        bad = requests.post(f"{BASE}/portal/market/brands/{S['brand_id']}/logo", headers=portal, files={"file": ("x.txt", b"hi", "text/plain")}, timeout=60)
        assert bad.status_code == 415

    def test_brand_login_invite_lifecycle(self, portal):
        email = f"pytest-brand-{U}@amass-qa.africa"
        r = P(portal, "POST", f"/market/brands/{S['brand_id']}/accounts", json={"name": "QA Manager", "email": email})
        assert r.status_code == 201, r.text
        a = r.json()
        assert a["password_set"] is False and "email_sent" in a and a["email"] == email
        S["account_id"] = a["id"]
        assert P(portal, "POST", f"/market/brands/{S['brand_id']}/accounts", json={"name": "Dup", "email": email}).status_code == 409
        assert P(portal, "POST", f"/market/brands/{S['brand_id']}/accounts/{a['id']}/invite").status_code == 200
        assert P(portal, "PATCH", f"/market/brands/{S['brand_id']}/accounts/{a['id']}", json={"disabled": True}).json()["disabled"] is True
        assert P(portal, "GET", f"/market/brands/{S['brand_id']}/accounts").json()["count"] == 1
        assert P(portal, "DELETE", f"/market/brands/{S['brand_id']}/accounts/{a['id']}").json()["ok"] is True
        assert P(portal, "GET", f"/market/brands/{S['brand_id']}/accounts").json()["count"] == 0


class TestProductsOffersImages:
    def test_add_product_with_offer(self, portal):
        body = {"name": "Pytest Floor Lamp", "description": "Warm LED", "category": "lighting", "price": 80000, "images": ["https://picsum.photos/300"], "featured": True, "offer": {"previous_price": 100000, "label": "Launch offer"}}
        r = P(portal, "POST", f"/market/brands/{S['brand_id']}/products", json=body)
        assert r.status_code == 201, r.text
        p = r.json()
        S["pid"] = p["id"]
        assert p["offer"]["percent_off"] == 20 and p["offer"]["status"] == "live" and p["featured"] is True and p["published"] is True
        assert P(portal, "POST", f"/market/brands/{S['brand_id']}/products", json={**body, "category": "cars"}).status_code == 400

    def test_product_visible_in_app(self):
        r = requests.get(f"{BASE}/shop/products/{S['pid']}", timeout=30)
        assert r.status_code == 200 and r.json()["promo"]["previous_price"] == 100000

    def test_offer_rules(self, portal):
        assert P(portal, "PUT", f"/market/products/{S['pid']}/offer", json={"previous_price": 80000}).status_code == 400
        assert P(portal, "PUT", f"/market/products/{S['pid']}/offer", json={"previous_price": 120000, "expires_at": "2000-01-01T00:00:00Z"}).status_code == 400
        r = P(portal, "PUT", f"/market/products/{S['pid']}/offer", json={"previous_price": 120000, "expires_at": "2099-01-01T00:00:00Z", "source_url": "https://example.com/sale"})
        assert r.status_code == 200 and r.json()["offer"]["saving"] == 40000 and "ends 2099-01-01" in r.json()["offer"]["terms"]
        live = P(portal, "GET", f"/market/offers?status=live&brand_id={S['brand_id']}").json()
        assert [i["id"] for i in live["items"]] == [S["pid"]]
        # raising the price above the old price drops the (now fake) deal
        r = P(portal, "PATCH", f"/market/products/{S['pid']}", json={"price": 130000})
        assert r.json()["offer"] is None
        assert P(portal, "DELETE", f"/market/products/{S['pid']}/offer").status_code == 200

    def test_images_append_and_remove(self, portal):
        r = requests.post(f"{BASE}/portal/market/products/{S['pid']}/images", headers=portal, files={"file": ("p.png", PNG, "image/png")}, timeout=60)
        assert r.status_code == 201
        imgs = r.json()["images"]
        assert len(imgs) == 2 and imgs[-1] == r.json()["upload"]["url"]
        r = P(portal, "DELETE", f"/market/products/{S['pid']}/images", params={"url": imgs[-1]})
        assert r.status_code == 200 and len(r.json()["images"]) == 1
        r = P(portal, "PATCH", f"/market/products/{S['pid']}", json={"images": []})
        assert r.json()["images"] == []

    def test_hide_restore_product(self, portal):
        r = P(portal, "DELETE", f"/market/products/{S['pid']}")
        assert r.json()["hidden"] is True
        assert requests.get(f"{BASE}/shop/products/{S['pid']}", timeout=30).status_code == 404
        hidden = P(portal, "GET", f"/market/products?brand_id={S['brand_id']}&status=hidden").json()["items"]
        assert [i["id"] for i in hidden] == [S["pid"]]
        r = P(portal, "POST", f"/market/products/{S['pid']}/restore")
        assert r.json()["published"] is True
        assert requests.get(f"{BASE}/shop/products/{S['pid']}", timeout=30).status_code == 200

    def test_hide_and_restore_brand(self, portal):
        r = P(portal, "DELETE", f"/market/brands/{S['brand_id']}")
        assert r.json()["hidden"] is True
        assert requests.get(f"{BASE}/shop/retailers/{S['brand_id']}", timeout=30).status_code == 404
        r = P(portal, "POST", f"/market/brands/{S['brand_id']}/restore")
        assert r.json()["published"] is True
        assert requests.get(f"{BASE}/shop/retailers/{S['brand_id']}", timeout=30).status_code == 200


class TestBanners:
    def test_banner_lifecycle(self, portal):
        r = P(portal, "POST", "/market/banners", json={"title": f"Pytest sale {U}", "body": "Up to 20% off lighting", "cta": "Shop", "route": "/shop/category/lighting", "tone": "warning"})
        assert r.status_code == 201, r.text
        b = r.json()
        S["banner_id"] = b["id"]
        assert b["live"] is True
        home = requests.get(f"{BASE}/shop/home", timeout=60).json()
        assert home["banners"][0]["key"] == f"admin-{b['id']}" and home["banners"][0]["tone"] == "warning"
        # scheduled for the future → not live
        r = P(portal, "PATCH", f"/market/banners/{b['id']}", json={"starts_at": "2099-01-01T00:00:00Z"})
        assert r.json()["live"] is False
        assert not any(x["key"] == f"admin-{b['id']}" for x in requests.get(f"{BASE}/shop/home", timeout=60).json()["banners"])
        assert P(portal, "PATCH", f"/market/banners/{b['id']}", json={"starts_at": "2099-01-02T00:00:00Z", "ends_at": "2099-01-01T00:00:00Z"}).status_code == 400
        r = P(portal, "PATCH", f"/market/banners/{b['id']}", json={"clear_schedule": True})
        assert r.json()["live"] is True
        assert P(portal, "DELETE", f"/market/banners/{b['id']}").json()["archived"] is True
        assert all(x["id"] != b["id"] for x in P(portal, "GET", "/market/banners").json()["items"])
        assert any(x["id"] == b["id"] for x in P(portal, "GET", "/market/banners?include_archived=true").json()["items"])
        assert P(portal, "POST", f"/market/banners/{b['id']}/restore").json()["archived"] is False


class TestFixaAndDeclutter:
    def test_fixa_reads(self, portal):
        assert set(P(portal, "GET", "/market/fixa/overview").json()) == {"pending", "verified", "hidden", "open_reports"}
        assert P(portal, "GET", "/market/fixa/providers?status=all").status_code == 200
        assert P(portal, "GET", "/market/fixa/reports?status=all").status_code == 200
        assert P(portal, "POST", "/market/fixa/providers/nope/approve", json={"note": "x"}).status_code == 404

    def test_declutter_moderation(self, portal, db):
        item = {"id": str(uuid.uuid4()), "name": f"Pytest chair {U}", "category": "furniture", "price": 5000, "image": "https://picsum.photos/200", "images": [], "city": "Lagos", "status": "active", "seller_id": None, "seller_name": "QA", "posted_at": "2026-01-01T00:00:00+00:00"}
        db.marketplace.insert_one({**item})
        S["listing_id"] = item["id"]
        rows = P(portal, "GET", f"/market/declutter/listings?status=active&q=Pytest+chair+{U}").json()["items"]
        assert [r["id"] for r in rows] == [item["id"]] and rows[0]["open_reports"] == 0
        assert P(portal, "PATCH", f"/market/declutter/listings/{item['id']}", json={"action": "pause_listing"}).json()["ok"]
        assert db.marketplace.find_one({"id": item["id"]})["status"] == "paused"
        assert P(portal, "PATCH", f"/market/declutter/listings/{item['id']}", json={"action": "restore_listing"}).json()["ok"]
        assert db.marketplace.find_one({"id": item["id"]})["status"] == "active"
        assert P(portal, "PATCH", "/market/declutter/listings/nope", json={"action": "pause_listing"}).status_code == 404
        assert P(portal, "GET", "/market/declutter/reports?status=open").status_code == 200

    def test_audit_trail(self, db):
        # staff-login sessions are logged under the signed-in admin's name (the Actor header applies to portal keys)
        assert db.audit_log.count_documents({"source": "portal", "target": S["brand_id"]}) >= 2
