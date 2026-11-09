#!/usr/bin/env python3
"""Capture raw 3×-DPR phone screens (1170 × 2532) of the running web preview for the store generators.

Outputs land in assets/images/store-raw/ and are consumed by store_common.py
(generate_appstore_ios.py / generate_playstore_v2.py / generate_feature_graphic.py).

  python3 scripts/capture_store_screens.py            # everything
  python3 scripts/capture_store_screens.py map intro  # a subset

Needs the Expo web server on :3000 and the backend on :8001 (demo@amass.africa session is created via the API).
The home map is captured twice — over white and over black — so store_common can recover exact alpha for the
chrome + live price pins and drop them onto the synthesised Lagos map.
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
import urllib.request

from playwright.async_api import Page, async_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "assets", "images", "store-raw"))
os.makedirs(OUT, exist_ok=True)

WEB = "http://localhost:3000"
API = "http://localhost:8001/api"
CHROME = "/usr/bin/google-chrome"
DEMO = {"email": "demo@amass.africa", "password": "amass2026"}

SHOWCASE_CHAT = "1177858f-bed5-465f-b4d7-de978e354454"   # demo agent ↔ Tunde Bakare, Lekki duplex inspection
PROPERTY = "7d769d80-fdf8-4778-932a-f938aa3c27cf"        # Palatial Ocean-View Duplex, Lekki Phase 1 (3 photos)
AI_PROMPT = "Show me a duplex under ₦150M in Lekki"

HIDE_CSS = """
::-webkit-scrollbar { display: none !important; }
* { scrollbar-width: none !important; }
"""


def login() -> str:
    req = urllib.request.Request(f"{API}/auth/login", data=json.dumps(DEMO).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.load(r)["access_token"]


async def settle(page: Page, ms: int = 1800) -> None:
    await page.wait_for_function("document.fonts && document.fonts.status === 'loaded'", timeout=30000)
    await page.wait_for_timeout(ms)


async def shot(page: Page, name: str) -> None:
    path = os.path.join(OUT, f"{name}.png")
    await page.screenshot(path=path, full_page=False)
    print(f"  ✓ {name}.png")


async def goto(page: Page, path: str, ms: int = 2200) -> None:
    await page.goto(f"{WEB}{path}", wait_until="domcontentloaded", timeout=90000)
    await page.wait_for_function("document.querySelector('#root') && document.querySelector('#root').innerText.trim().length > 0", timeout=90000)
    await settle(page, ms)


# ─── scenes ────────────────────────────────────────────────────────────
async def cap_intro(page: Page) -> None:
    """Brand moment: lockup risen, all five price markers landed, Skip hidden."""
    await page.goto(f"{WEB}/", wait_until="domcontentloaded", timeout=90000)
    await page.wait_for_selector('[data-testid="intro-marker-shortlet"]', state="visible", timeout=90000)
    await page.add_style_tag(content='[data-testid="brand-skip"] { visibility: hidden !important; }')
    await page.wait_for_timeout(950)
    await shot(page, "intro")


async def cap_onboarding(page: Page) -> None:
    await goto(page, "/onboarding", 2600)
    await shot(page, "onboarding")


async def cap_map(page: Page) -> None:
    """Find Home tab with the web map stand-in blanked to white and to black (alpha recovery downstream)."""
    await goto(page, "/", 7000)  # intro → routes to the tabs once auth resolves
    await page.wait_for_selector('[data-testid="web-map-backdrop"]', state="attached", timeout=60000)
    # first-run intent sheet ("What are you looking for?") — browse everything
    browse = page.get_by_text("Just browsing", exact=True).first
    try:
        await browse.click(timeout=6000)
    except Exception:
        pass
    await page.wait_for_timeout(3000)
    # wider view → more price pins; hide the transient time-meter chip + greeting for a clean marketing frame
    await page.add_style_tag(content='[data-testid="map-time-chip"], [data-testid="map-time-chip-last-hour"], [data-testid="home-greeting"], [data-testid="search-this-area"] { visibility: hidden !important; }')
    for _ in range(2):
        try:
            await page.get_by_test_id("fab-zoom-out").click(timeout=4000)
            await page.wait_for_timeout(900)
        except Exception:
            break
    await page.wait_for_timeout(1500)
    # Chrome only: the live pins are hidden and store_common draws a full, app-styled pin field instead
    # (the web stand-in projects just a few seeded listings; the marketing frame needs a busy Lagos).
    await page.add_style_tag(content='[data-testid^="pin-"], [data-testid^="cluster-"], [data-testid^="ghost-pin-"], [data-testid="pin-tap-hint"] { visibility: hidden !important; }')
    await page.wait_for_timeout(500)
    await page.evaluate(
        """() => {
          const wrap = document.querySelector('[data-testid="web-map-backdrop"]').parentElement;
          const kids = Array.from(wrap.children);
          kids[0].style.visibility = 'hidden';            // unsplash tile
          kids[1].style.visibility = 'hidden';            // dark tint
          kids[kids.length - 1].style.visibility = 'hidden'; // "renders on mobile" hint
          wrap.dataset.storeWrap = '1';
          wrap.style.backgroundColor = '#FFFFFF';
        }"""
    )
    await page.wait_for_timeout(400)
    await shot(page, "map_white")
    await page.evaluate("document.querySelector('[data-store-wrap]').style.backgroundColor = '#000000'")
    await page.wait_for_timeout(400)
    await shot(page, "map_black")


async def cap_simple(page: Page, name: str, path: str, ms: int = 2600) -> None:
    await goto(page, path, ms)
    await shot(page, name)


async def cap_ai(page: Page) -> None:
    await goto(page, "/ai-search", 2000)
    box = page.get_by_placeholder("Ask AMASS AI").first
    await box.click()
    await box.fill(AI_PROMPT)
    await page.keyboard.press("Enter")
    try:
        await page.wait_for_function(
            "document.body.innerText.includes('₦') && document.body.innerText.length > 1200", timeout=60000
        )
    except Exception:
        print("  (AI answer did not arrive in time — capturing current state)")
    await page.wait_for_timeout(1500)
    await shot(page, "ai")


SCENES = {
    "intro": (False, cap_intro),
    "onboarding": (False, cap_onboarding),
    "map": (True, cap_map),
    "property": (True, lambda p: cap_simple(p, "property", f"/property/{PROPERTY}", 3200)),
    "feeds": (True, lambda p: cap_simple(p, "feeds", "/updates", 3200)),
    "market": (True, lambda p: cap_simple(p, "market", "/marketplace", 3200)),
    "my_home": (True, lambda p: cap_simple(p, "my_home", "/home", 3200)),
    "profile": (True, lambda p: cap_simple(p, "profile", "/profile", 2800)),
    "chat": (True, lambda p: cap_simple(p, "chat", f"/chat/{SHOWCASE_CHAT}", 2800)),
    "ai": (True, cap_ai),
    "wallet": (True, lambda p: cap_simple(p, "wallet", "/wallet", 2800)),
    "tokens": (True, lambda p: cap_simple(p, "tokens", "/buy-tokens", 2800)),
    "agent": (True, lambda p: cap_simple(p, "agent", "/agent-dashboard", 3200)),
    "fixa": (True, lambda p: cap_simple(p, "fixa", "/fixa", 3200)),
    "notifications": (True, lambda p: cap_simple(p, "notifications", "/notifications", 2600)),
    "earn": (True, lambda p: cap_simple(p, "earn", "/earn", 2600)),
}


async def main(names: list[str]) -> None:
    token = login()
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path=CHROME, headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"])
        for name in names:
            needs_auth, fn = SCENES[name]
            ctx = await browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=3, is_mobile=True, has_touch=True, locale="en-NG", timezone_id="Africa/Lagos", reduced_motion="no-preference")
            if needs_auth:
                await ctx.add_init_script(f"window.localStorage.setItem('amass_auth_token', {json.dumps(json.dumps(token))});")
            await ctx.add_init_script(f"const s=document.createElement('style');s.textContent={json.dumps(HIDE_CSS)};document.addEventListener('DOMContentLoaded',()=>document.head.appendChild(s));")
            page = await ctx.new_page()
            print(f"[{name}]")
            try:
                await fn(page)
            except Exception as e:  # keep going — one broken scene must not block the rest
                print(f"  ✗ {name}: {e}")
            await ctx.close()
        await browser.close()


if __name__ == "__main__":
    wanted = sys.argv[1:] or list(SCENES)
    asyncio.run(main(wanted))
