"""Smoke: social publishing admin routes + smart link. Run: python /app/backend/tests/smoke_social.py"""
import asyncio

import httpx

B = "http://localhost:8001"
IOS_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1"


async def main():
    async with httpx.AsyncClient(base_url=B, timeout=60) as c:
        r = await c.post("/api/auth/login", json={"email": "demo@amass.africa", "password": "amass2026"})
        H = {"Authorization": f"Bearer {r.json()['access_token']}"}
        r = await c.get("/api/admin/social/overview", headers=H)
        print("overview", r.status_code, [(p["platform"], p["configured"], p["connected"]) for p in r.json()["platforms"]], r.json()["stats"])
        r = await c.get("/api/admin/social/listings", headers=H)
        items = r.json()["items"]
        print("listings", r.status_code, len(items), items[0]["title"] if items else None)
        pid = items[0]["id"]
        r = await c.get(f"/api/admin/social/compose/{pid}", headers=H)
        d = r.json()
        print("compose", r.status_code)
        print(d["captions"]["x"], "\nlen x", len(d["captions"]["x"]))
        print("---\n" + d["captions"]["instagram"][:420])
        print("link", d["link"])
        r = await c.post("/api/admin/social/posts", json={"property_id": pid, "platforms": ["facebook", "instagram", "x", "linkedin", "tiktok"]}, headers=H)
        print("post", r.status_code, r.json()["status"], {k: v["status"] for k, v in r.json()["results"].items()})
        post_id = r.json()["id"]
        r = await c.post("/api/admin/social/test/x", headers=H)
        print("test x", r.status_code, r.json())
        r = await c.get("/api/admin/social/connect/linkedin", headers=H)
        print("connect linkedin", r.status_code, r.json())
        r = await c.patch("/api/admin/social/settings", json={"auto_post": {"tiktok": True}, "hashtags": ["#AMASS", "Lagos Homes", "x"], "ios_store_url": "https://apps.apple.com/app/id123"}, headers=H)
        print("settings", r.status_code, r.json()["auto_post"], r.json()["hashtags"])
        r = await c.get(f"/api/go/{pid}?src=instagram&post={post_id}", headers={"User-Agent": IOS_UA})
        print("go", r.status_code, r.headers.get("content-type"), "og:image" in r.text, "amass://property" in r.text, "apps.apple.com" in r.text)
        r = await c.get(f"/api/go/{pid}?src=facebook", headers={"User-Agent": "facebookexternalhit/1.1"})
        print("bot go", r.status_code)
        r = await c.get("/api/admin/social/overview", headers=H)
        print("clicks", r.json()["stats"]["clicks_by_source"])
        r = await c.get(f"/api/share/property/{pid}")
        s = r.json()
        print("share", r.status_code, s["share_url"], list(s["social"]["intents"].keys()))
        r = await c.post("/api/admin/social/publish-queued", headers=H)
        print("publish-queued", r.status_code, r.json()["attempted"])
        r = await c.get("/api/go/nope", follow_redirects=False)
        print("go 404 ->", r.status_code, r.headers.get("location"))
        r = await c.patch("/api/admin/social/settings", json={"auto_post": {"tiktok": False}, "hashtags": ["AMASS", "AmassAfrica", "RealEstateNigeria", "LagosProperty", "PropertyNigeria", "HouseHunting"], "ios_store_url": ""}, headers=H)
        print("settings restored", r.status_code)
        r = await c.delete(f"/api/admin/social/posts/{post_id}", headers=H)
        print("cleanup post", r.status_code)


asyncio.run(main())
