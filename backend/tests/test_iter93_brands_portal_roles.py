"""Iteration 93: Brands-only Market (admin brands + brand invites + brand portal), Admin Portal shared key, Admin accounts & roles."""
import os
import time
import uuid

import pytest
import requests
from dotenv import dotenv_values
from pymongo import MongoClient

FE = dotenv_values("/app/frontend/.env")
BE = dotenv_values("/app/backend/.env")
BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or FE["EXPO_PUBLIC_BACKEND_URL"]).rstrip("/")
U = uuid.uuid4().hex[:6]
BRAND_NAME = f"QA Brand {U}"
BRAND_EMAIL = f"qa-brand-{U}@amass-qa.africa"
PW = "QaBrand2026!"
S = {}  # shared state between ordered tests


@pytest.fixture(scope="module")
def db():
    c = MongoClient(BE["MONGO_URL"])
    yield c[BE["DB_NAME"]]
    c.close()


@pytest.fixture(scope="module")
def admin_h():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "demo@amass.africa", "password": "amass2026"}, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    S["admin_id"] = d["user"]["id"]
    return {"Authorization": f"Bearer {d.get('token') or d.get('access_token')}"}


@pytest.fixture(scope="module", autouse=True)
def cleanup(db):
    yield
    if S.get("brand_id"):
        db.brand_accounts.delete_many({"brand_id": S["brand_id"]})
        db.shop_products.delete_many({"retailer_id": S["brand_id"]})
        db.shop_retailers.delete_many({"id": S["brand_id"]})
    db.brand_accounts.delete_many({"email": BRAND_EMAIL})


# ── Admin brands ──
class TestA_AdminBrands:
    def test_create_brand(self, admin_h):
        r = requests.post(f"{BASE_URL}/api/admin/brands", json={"name": BRAND_NAME, "categories": ["home_decor"]}, headers=admin_h)
        assert r.status_code == 201, r.text
        S["brand_id"] = r.json()["id"]
        assert r.json()["name"] == BRAND_NAME

    def test_duplicate_brand_409(self, admin_h):
        r = requests.post(f"{BASE_URL}/api/admin/brands", json={"name": BRAND_NAME, "categories": ["home_decor"]}, headers=admin_h)
        assert r.status_code == 409, r.text

    def test_invite_account(self, admin_h):
        r = requests.post(f"{BASE_URL}/api/admin/brands/{S['brand_id']}/accounts", json={"name": "QA Manager", "email": BRAND_EMAIL}, headers=admin_h)
        assert r.status_code == 201, r.text
        d = r.json()
        assert d["password_set"] is False and d["email_sent"] is False
        assert "/brand/set-password?token=" in (d.get("invite_link") or ""), d
        assert d["invite_link"].startswith("https://")
        S["acc_id"] = d["id"]
        S["token"] = d["invite_link"].split("token=")[1]

    def test_invite_same_email_409(self, admin_h):
        r = requests.post(f"{BASE_URL}/api/admin/brands/{S['brand_id']}/accounts", json={"name": "QA Manager", "email": BRAND_EMAIL}, headers=admin_h)
        assert r.status_code == 409


# ── Brand auth ──
class TestB_BrandAuth:
    def test_login_before_set_401(self):
        r = requests.post(f"{BASE_URL}/api/brand/auth/login", json={"email": BRAND_EMAIL, "password": PW})
        assert r.status_code == 401

    def test_invite_lookup(self):
        r = requests.get(f"{BASE_URL}/api/brand/auth/invite/{S['token']}")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["email"] == BRAND_EMAIL and d["brand_name"] == BRAND_NAME and d["kind"] == "invite"

    def test_set_password_then_reuse_410_then_login(self):
        r = requests.post(f"{BASE_URL}/api/brand/auth/set-password", json={"token": S["token"], "password": PW})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["token"] and d["account"]["email"] == BRAND_EMAIL and d["brand"]["name"] == BRAND_NAME
        r2 = requests.post(f"{BASE_URL}/api/brand/auth/set-password", json={"token": S["token"], "password": PW})
        assert r2.status_code == 410
        r3 = requests.post(f"{BASE_URL}/api/brand/auth/login", json={"email": BRAND_EMAIL, "password": PW})
        assert r3.status_code == 200, r3.text
        S["bh"] = {"Authorization": f"Bearer {r3.json()['token']}"}

    def test_forgot_unknown_generic(self):
        r = requests.post(f"{BASE_URL}/api/brand/auth/forgot-password", json={"email": f"nobody-{U}@amass-qa.africa"})
        assert r.status_code == 200 and r.json().get("message")


# ── Brand token scope + products ──
class TestC_BrandProducts:
    def test_me_and_list(self):
        assert requests.get(f"{BASE_URL}/api/brand/me", headers=S["bh"]).status_code == 200
        r = requests.get(f"{BASE_URL}/api/brand/products", headers=S["bh"])
        assert r.status_code == 200 and "items" in r.json()

    def test_create_patch_public_delete(self):
        r = requests.post(f"{BASE_URL}/api/brand/products", json={"name": f"TEST_Lamp {U}", "category": "home_decor", "price": 185000, "promo_previous_price": 215000}, headers=S["bh"])
        assert r.status_code == 201, r.text
        d = r.json()
        pid = d["id"]
        S["pid"] = pid
        assert d["name"] == f"TEST_Lamp {U}" and d.get("category_name") and d.get("promo") and d["promo"]["previous_price"] == 215000
        price = d["price"]["amount"] if isinstance(d["price"], dict) else d["price"]
        assert price == 185000
        r = requests.patch(f"{BASE_URL}/api/brand/products/{pid}", json={"price": 150000, "stock_status": "out_of_stock"}, headers=S["bh"])
        assert r.status_code == 200, r.text
        pub = requests.get(f"{BASE_URL}/api/shop/products/{pid}")
        assert pub.status_code == 200, pub.text
        S["public_after_patch"] = pub.json()
        r = requests.delete(f"{BASE_URL}/api/brand/products/{pid}", headers=S["bh"])
        assert r.status_code == 200
        lst = requests.get(f"{BASE_URL}/api/brand/products", headers=S["bh"]).json()["items"]
        row = [x for x in lst if x["id"] == pid][0]
        assert row["published"] is False
        S["public_after_hide"] = requests.get(f"{BASE_URL}/api/shop/products/{pid}").status_code

    def test_brand_token_rejected_elsewhere(self):
        assert requests.get(f"{BASE_URL}/api/auth/me", headers=S["bh"]).status_code == 401
        assert requests.get(f"{BASE_URL}/api/admin/brands", headers=S["bh"]).status_code == 401

    def test_cannot_touch_other_retailer_product(self):
        r = requests.get(f"{BASE_URL}/api/shop/products")
        assert r.status_code == 200
        data = r.json()
        items = data.get("products") or data.get("items") or []
        other = [p for p in items if (p.get("retailer_id") or (p.get("retailer") or {}).get("id")) != S["brand_id"]]
        assert other, "no other retailer products"
        r = requests.patch(f"{BASE_URL}/api/brand/products/{other[0]['id']}", json={"price": 1}, headers=S["bh"])
        assert r.status_code == 404
        r = requests.delete(f"{BASE_URL}/api/brand/products/{other[0]['id']}", headers=S["bh"])
        assert r.status_code == 404


# ── Admin manage brand logins ──
class TestD_AdminAccountMgmt:
    def test_resend_reset_kind(self, admin_h):
        r = requests.post(f"{BASE_URL}/api/admin/brands/{S['brand_id']}/accounts/{S['acc_id']}/invite", headers=admin_h)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["invite_kind"] == "reset" and d.get("invite_link")
        assert d["password_set"] is True  # regression: admin views used to project out password_hash

    def test_disable_enable(self, admin_h):
        url = f"{BASE_URL}/api/admin/brands/{S['brand_id']}/accounts/{S['acc_id']}"
        assert requests.patch(url, json={"disabled": True}, headers=admin_h).status_code == 200
        assert requests.post(f"{BASE_URL}/api/brand/auth/login", json={"email": BRAND_EMAIL, "password": PW}).status_code == 401
        assert requests.get(f"{BASE_URL}/api/brand/me", headers=S["bh"]).status_code == 401
        assert requests.patch(url, json={"disabled": False}, headers=admin_h).status_code == 200
        assert requests.post(f"{BASE_URL}/api/brand/auth/login", json={"email": BRAND_EMAIL, "password": PW}).status_code == 200

    def test_delete_account(self, admin_h):
        r = requests.delete(f"{BASE_URL}/api/admin/brands/{S['brand_id']}/accounts/{S['acc_id']}", headers=admin_h)
        assert r.status_code == 200
        assert requests.post(f"{BASE_URL}/api/brand/auth/login", json={"email": BRAND_EMAIL, "password": PW}).status_code == 401


# ── Admin Portal shared key ──
class TestE_PortalKey:
    def test_key_lifecycle(self, admin_h):
        r = requests.post(f"{BASE_URL}/api/admin/portal-connection/key", json={"label": "QA"}, headers=admin_h)
        assert r.status_code == 201, r.text
        key = r.json()["key"]
        assert key.startswith("amass_pk_") and r.json()["prefix"]
        KH = {"X-AMASS-Portal-Key": key}
        me = requests.get(f"{BASE_URL}/api/portal/auth/me", headers=KH)
        assert me.status_code == 200, me.text
        assert me.json()["role"] == "super_admin" and me.json()["source"] == "portal_key"
        assert requests.get(f"{BASE_URL}/api/portal/auth/me", headers={"Authorization": f"Bearer {key}"}).status_code == 200
        for ep in ("dashboard/stats", "agents", "platform-users", "leads"):
            assert requests.get(f"{BASE_URL}/api/portal/{ep}", headers=KH).status_code == 200, ep
        users = requests.get(f"{BASE_URL}/api/portal/platform-users?search=adaeze", headers=KH).json()
        target = [u for u in users if not u["is_admin"]][0]
        w = requests.patch(f"{BASE_URL}/api/portal/platform-users/{target['id']}/status", json={"status": "active"}, headers={**KH, "X-AMASS-Portal-Actor": "QA Lead <qa@amass.africa>"})
        assert w.status_code == 200, w.text
        acts = requests.get(f"{BASE_URL}/api/portal/dashboard/activities", headers=KH).json()
        assert acts[0]["user_name"] == "QA Lead", acts[:2]
        assert requests.get(f"{BASE_URL}/api/portal/auth/me", headers={"X-AMASS-Portal-Key": "amass_pk_wrong"}).status_code == 401
        assert requests.get(f"{BASE_URL}/api/admin/brands", headers={"Authorization": f"Bearer {key}"}).status_code == 401
        assert requests.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {key}"}).status_code == 401
        conn = requests.get(f"{BASE_URL}/api/admin/portal-connection", headers=admin_h).json()
        assert conn["key"]["prefix"] == r.json()["prefix"] and conn["key"]["uses"] > 0
        rv = requests.delete(f"{BASE_URL}/api/admin/portal-connection/key", headers=admin_h)
        assert rv.status_code == 200 and rv.json()["revoked"] is True
        assert requests.get(f"{BASE_URL}/api/portal/auth/me", headers=KH).status_code == 401
        assert requests.get(f"{BASE_URL}/api/admin/portal-connection", headers=admin_h).json()["key"] is None

    def test_staff_login_still_works(self):
        r = requests.post(f"{BASE_URL}/api/portal/auth/login", json={"email": "demo@amass.africa", "password": "amass2026"})
        assert r.status_code == 200, r.text
        t = r.json().get("token") or r.json().get("access_token")
        assert requests.get(f"{BASE_URL}/api/portal/auth/me", headers={"Authorization": f"Bearer {t}"}).status_code == 200


# ── Admin accounts & roles ──
class TestF_AdminAccounts:
    def test_search_suspend_restore(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/admin/users?search=adaeze", headers=admin_h)
        assert r.status_code == 200
        row = [x for x in r.json()["items"] if x["email"] == "adaeze.okoye@amass.africa"][0]
        assert "is_agent" in row
        uid = row["id"]
        try:
            assert requests.patch(f"{BASE_URL}/api/admin/users/{uid}", json={"account_status": "suspended"}, headers=admin_h).status_code == 200
            l1 = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "adaeze.okoye@amass.africa", "password": "Agent2026!"})
            assert l1.status_code == 403, l1.text
        finally:
            assert requests.patch(f"{BASE_URL}/api/admin/users/{uid}", json={"account_status": "active"}, headers=admin_h).status_code == 200
        l2 = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "adaeze.okoye@amass.africa", "password": "Agent2026!"})
        assert l2.status_code == 200, l2.text

    def test_cannot_suspend_self(self, admin_h):
        r = requests.patch(f"{BASE_URL}/api/admin/users/{S['admin_id']}", json={"account_status": "suspended"}, headers=admin_h)
        assert r.status_code == 400
        r = requests.patch(f"{BASE_URL}/api/admin/users/{S['admin_id']}", json={"is_admin": False}, headers=admin_h)
        assert r.status_code == 400
