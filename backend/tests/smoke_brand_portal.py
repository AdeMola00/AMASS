"""Smoke: brand invite flow + portal shared key. Run: python /app/backend/tests/smoke_brand_portal.py"""
import asyncio
import os
import sys

import httpx
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
BASE = (os.environ.get("EXPO_BACKEND_URL") or "http://localhost:8001").rstrip("/")
BASE = "http://localhost:8001"


async def main():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ.get("DB_NAME", "test_database")]
    async with httpx.AsyncClient(base_url=BASE, timeout=30) as c:
        r = await c.post("/api/auth/login", json={"email": "demo@amass.africa", "password": "amass2026"})
        r.raise_for_status()
        tok = r.json()["token"] if "token" in r.json() else r.json()["access_token"]
        H = {"Authorization": f"Bearer {tok}"}

        # clean previous smoke data
        await db.brand_accounts.delete_many({"email": "smoke-brand@amass-qa.africa"})
        await db.shop_retailers.delete_many({"name": "Smoke Lighting Co"})

        r = await c.post("/api/admin/brands", json={"name": "Smoke Lighting Co", "tagline": "Lamps", "categories": ["home_decor"]}, headers=H)
        print("create brand", r.status_code, r.json().get("id"))
        brand = r.json()
        r = await c.post(f"/api/admin/brands/{brand['id']}/accounts", json={"name": "Smoke Manager", "email": "smoke-brand@amass-qa.africa"}, headers=H)
        print("invite", r.status_code, {k: r.json().get(k) for k in ("email_sent", "email_error", "password_set", "invite_sent_at")})
        acc_id = r.json()["id"]

        # login before password set must fail
        r = await c.post("/api/brand/auth/login", json={"email": "smoke-brand@amass-qa.africa", "password": "whatever123"})
        print("login before set-password ->", r.status_code)

        # grab token from DB? hash only — so simulate by issuing a new link and reading the hash isn't possible; instead
        # use resend and then patch a known token hash in for the test
        import hashlib, secrets
        raw = secrets.token_urlsafe(32)
        await db.brand_accounts.update_one({"id": acc_id}, {"$set": {"invite.token_hash": hashlib.sha256(raw.encode()).hexdigest()}})
        r = await c.get(f"/api/brand/auth/invite/{raw}")
        print("invite lookup", r.status_code, r.json())
        r = await c.post("/api/brand/auth/set-password", json={"token": raw, "password": "BrandPass2026!"})
        print("set-password", r.status_code, list(r.json().keys()) if r.status_code == 200 else r.json())
        btok = r.json()["token"]
        r = await c.post("/api/brand/auth/set-password", json={"token": raw, "password": "BrandPass2026!"})
        print("reuse link ->", r.status_code, r.json())
        r = await c.post("/api/brand/auth/login", json={"email": "smoke-brand@amass-qa.africa", "password": "BrandPass2026!"})
        print("login after ->", r.status_code)
        BH = {"Authorization": f"Bearer {btok}"}
        r = await c.post("/api/brand/products", json={"name": "Arc Lamp", "category": "home_decor", "price": 185000, "promo_previous_price": 215000}, headers=BH)
        print("create product", r.status_code, r.json().get("name"), r.json().get("price"))
        pid = r.json()["id"]
        r = await c.get(f"/api/shop/products/{pid}")
        print("public product visible ->", r.status_code)
        # brand token must not act as app user / admin
        r = await c.get("/api/auth/me", headers=BH)
        print("brand token on app api ->", r.status_code)
        r = await c.get("/api/admin/brands", headers=BH)
        print("brand token on admin api ->", r.status_code)
        r = await c.post("/api/brand/auth/forgot-password", json={"email": "nobody@amass-qa.africa"})
        print("forgot unknown ->", r.status_code, r.json()["message"][:40])

        # portal shared key
        r = await c.post("/api/admin/portal-connection/key", json={"label": "smoke"}, headers=H)
        print("create key", r.status_code, r.json()["prefix"])
        key = r.json()["key"]
        r = await c.get("/api/portal/auth/me", headers={"X-AMASS-Portal-Key": key, "X-AMASS-Portal-Actor": "Ops Lead <ops@amass.africa>"})
        print("portal me via key", r.status_code, r.json())
        r = await c.get("/api/portal/dashboard/stats", headers={"Authorization": f"Bearer {key}"})
        print("portal stats via bearer key", r.status_code, list(r.json())[:3])
        r = await c.get("/api/portal/agents", headers={"X-AMASS-Portal-Key": "amass_pk_wrong"})
        print("wrong key ->", r.status_code)
        r = await c.get("/api/admin/portal-connection", headers=H)
        print("connection", r.status_code, r.json()["key"]["prefix"], r.json()["api_base"])
        r = await c.delete("/api/admin/portal-connection/key", headers=H)
        print("revoke", r.status_code, r.json())
        r = await c.get("/api/portal/auth/me", headers={"X-AMASS-Portal-Key": key})
        print("after revoke ->", r.status_code)
        # key must not work on app/admin apis
        r = await c.get("/api/admin/brands", headers={"Authorization": f"Bearer {key}"})
        print("key on admin api ->", r.status_code)


asyncio.run(main())
