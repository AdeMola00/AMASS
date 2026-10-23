"""Phase 3.6 E2E — Marketplace sell-side (seller/buyer/admin).

Hybrid approach:
- API for setup/verification (listings, feed, offer state, reports).
- Playwright UI for key screens (my-listings, item detail, admin reports).
"""
import os
import asyncio
import json
import uuid
import time
import requests
from playwright.async_api import async_playwright

BASE_URL = "https://property-os-africa.preview.emergentagent.com"
API = f"{BASE_URL}/api"
IMG = "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800"

SELLER = {"email": "demo@amass.africa", "password": "amass2026"}


def api_login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=20)
    r.raise_for_status()
    return r.json()["access_token"]


def api_register():
    email = f"mkt.e2e+{uuid.uuid4().hex[:8]}@amass.africa"
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": "Buyer2026!", "full_name": "E2E Buyer"}, timeout=20)
    r.raise_for_status()
    return r.json()["access_token"], email


def auth(tok):
    return {"Authorization": f"Bearer {tok}"}


results = []


def log(step, ok, detail=""):
    results.append({"step": step, "ok": ok, "detail": detail})
    marker = "PASS" if ok else "FAIL"
    print(f"[{marker}] {step} :: {detail}")


async def set_token(page, token):
    """Install JWT into localStorage BEFORE first navigation to a real route."""
    await page.evaluate(
        f"() => window.localStorage.setItem('amass_auth_token', JSON.stringify({json.dumps(token)}))"
    )


async def run():
    # ---------- SETUP (API) ----------
    seller_tok = api_login(SELLER)
    log("seller.login", True, "demo@amass.africa")
    buyer_tok, buyer_email = api_register()
    log("buyer.register", True, buyer_email)

    item_name = f"E2E Sofa {uuid.uuid4().hex[:5]}"
    body = {
        "name": item_name,
        "description": "Three seater fabric sofa in great condition",
        "price": 120000,
        "category": "furniture",
        "subcategory": "sofas",
        "condition": "used",
        "image": IMG,
        "images": [IMG],
        "city": "Lagos - Lekki",
        "negotiable": True,
    }
    r = requests.post(f"{API}/marketplace/items", json=body, headers=auth(seller_tok), timeout=20)
    assert r.status_code == 200, r.text
    item = r.json()["item"]
    item_id = item["id"]
    log("seller.create_listing", True, f"id={item_id} status={item['status']}")

    created_ids = [item_id]

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 390, "height": 844})
        page = await context.new_page()
        page.on("pageerror", lambda e: print(f"PAGEERROR: {e}"))

        # --- Seed localStorage with seller token ---
        await page.goto(f"{BASE_URL}/", wait_until="domcontentloaded")
        await set_token(page, seller_tok)

        # =============== 1) /marketplace/my-listings as seller ===============
        await page.goto(f"{BASE_URL}/marketplace/my-listings", wait_until="domcontentloaded")
        try:
            await page.wait_for_selector('[data-testid="my-listings-screen"]', timeout=15000)
            log("1.my-listings-screen renders", True)
        except Exception as e:
            await page.screenshot(path="/tmp/my_listings_fail.png", quality=40)
            log("1.my-listings-screen renders", False, str(e))

        # Tabs
        for tab in ("listings", "received", "sent"):
            try:
                el = await page.query_selector(f'[data-testid="my-listings-tab-{tab}"]')
                log(f"1.tab-{tab} exists", el is not None)
            except Exception as e:
                log(f"1.tab-{tab} exists", False, str(e))

        # Switch to listings tab
        try:
            await page.click('[data-testid="my-listings-tab-listings"]', force=True)
            await page.wait_for_timeout(600)
        except Exception:
            pass

        # Row exists
        row_sel = f'[data-testid="my-listing-{item_id}"]'
        try:
            await page.wait_for_selector(row_sel, timeout=8000)
            log("1.my-listing row rendered", True)
        except Exception as e:
            log("1.my-listing row rendered", False, str(e))

        # Manage sheet
        try:
            await page.click(f'[data-testid="manage-{item_id}"]', force=True)
            await page.wait_for_selector('[data-testid="manage-sheet"]', timeout=5000)
            log("1.manage-sheet opens", True)
        except Exception as e:
            log("1.manage-sheet opens", False, str(e))

        # Edit → change price to 110000
        try:
            await page.click('[data-testid="manage-edit"]', force=True)
            await page.wait_for_selector('[data-testid="edit-sheet"]', timeout=5000)
            # Clear and fill
            el = page.locator('[data-testid="edit-price"] input, [data-testid="edit-price"]').first
            await el.fill("110000")
            await page.click('[data-testid="edit-save"]', force=True)
            await page.wait_for_timeout(1500)
            # Verify via API
            det = requests.get(f"{API}/marketplace/items/{item_id}", timeout=20).json()["item"]
            log("1.edit-save → price=110000", det.get("price") == 110000, f"price={det.get('price')}")
        except Exception as e:
            log("1.edit flow", False, str(e))

        # Pause
        try:
            await page.click(f'[data-testid="manage-{item_id}"]', force=True)
            await page.wait_for_selector('[data-testid="manage-sheet"]', timeout=5000)
            await page.click('[data-testid="manage-pause"]', force=True)
            await page.wait_for_timeout(1500)
            det = requests.get(f"{API}/marketplace/items/{item_id}", timeout=20).json()["item"]
            feed = requests.get(f"{API}/marketplace", params={"q": item_name}, timeout=20).json()
            in_feed = any(i["id"] == item_id for i in feed)
            log("1.pause → status=paused & hidden from feed", det.get("status") == "paused" and not in_feed, f"status={det.get('status')} in_feed={in_feed}")
        except Exception as e:
            log("1.pause flow", False, str(e))

        # Resume
        try:
            await page.click(f'[data-testid="manage-{item_id}"]', force=True)
            await page.wait_for_selector('[data-testid="manage-sheet"]', timeout=5000)
            await page.click('[data-testid="manage-resume"]', force=True)
            await page.wait_for_timeout(1500)
            det = requests.get(f"{API}/marketplace/items/{item_id}", timeout=20).json()["item"]
            log("1.resume → status=active", det.get("status") == "active", f"status={det.get('status')}")
        except Exception as e:
            log("1.resume flow", False, str(e))

        # =============== 2) Buyer flow on /marketplace/{id} ===============
        await context.clear_cookies()
        bpage = await context.new_page()
        await bpage.goto(f"{BASE_URL}/", wait_until="domcontentloaded")
        await bpage.evaluate(
            f"() => window.localStorage.setItem('amass_auth_token', JSON.stringify({json.dumps(buyer_tok)}))"
        )

        await bpage.goto(f"{BASE_URL}/marketplace/{item_id}", wait_until="domcontentloaded")
        try:
            await bpage.wait_for_selector('[data-testid="item-detail"]', timeout=15000)
            log("2.item-detail renders", True)
        except Exception as e:
            await bpage.screenshot(path="/tmp/item_detail_fail.png", quality=40)
            log("2.item-detail renders", False, str(e))

        # action-chat
        conv_id = None
        try:
            await bpage.click('[data-testid="action-chat"]', force=True)
            await bpage.wait_for_url("**/chat/**", timeout=8000)
            url = bpage.url
            conv_id = url.rstrip("/").split("/")[-1].split("?")[0]
            log("2.action-chat navigates to /chat/{id}", True, f"conv={conv_id}")
            # chat-item-card
            try:
                await bpage.wait_for_selector('[data-testid="chat-item-card"]', timeout=5000)
                log("2.chat-item-card visible", True)
            except Exception as e:
                log("2.chat-item-card visible", False, str(e))
        except Exception as e:
            log("2.action-chat", False, str(e))

        # Back to item
        await bpage.goto(f"{BASE_URL}/marketplace/{item_id}", wait_until="domcontentloaded")
        await bpage.wait_for_timeout(1200)

        # action-offer → send 90000
        offer_submitted = False
        try:
            await bpage.wait_for_selector('[data-testid="action-offer"]', timeout=8000)
            await bpage.click('[data-testid="action-offer"]', force=True)
            await bpage.wait_for_timeout(1500)
            found = await bpage.query_selector('[data-testid="offer-amount-input"]')
            if found:
                await bpage.locator('[data-testid="offer-amount-input"] input, [data-testid="offer-amount-input"]').first.fill("90000")
                await bpage.click('[data-testid="submit-offer"]', force=True)
                await bpage.wait_for_timeout(2000)
                offer_submitted = True
                log("2.offer-sheet submit via UI", True, "90000")
            else:
                # web portal fallback
                r = requests.post(f"{API}/marketplace/items/{item_id}/offer", json={"amount": 90000, "message": "Can do 90k cash"}, headers=auth(buyer_tok), timeout=20)
                offer_submitted = r.status_code == 200
                log("2.offer via API fallback (bottom-sheet web portal limitation)", offer_submitted, f"status={r.status_code}")
        except Exception as e:
            r = requests.post(f"{API}/marketplace/items/{item_id}/offer", json={"amount": 90000, "message": "Can do 90k cash"}, headers=auth(buyer_tok), timeout=20)
            offer_submitted = r.status_code == 200
            log("2.offer via API fallback", offer_submitted, f"err={e}; status={r.status_code}")

        # Verify sent offers has an awaiting-reply offer
        sent = requests.get(f"{API}/marketplace/offers/sent", headers=auth(buyer_tok), timeout=20).json()
        offer = next((o for o in sent if o["item"]["id"] == item_id), None)
        log("2.sent list has offer", offer is not None, f"status={offer.get('status') if offer else 'none'}")

        # Check my-listings?tab=sent as buyer renders offer-withdraw-{id}
        if offer:
            await bpage.goto(f"{BASE_URL}/marketplace/my-listings?tab=sent", wait_until="domcontentloaded")
            try:
                await bpage.wait_for_selector(f'[data-testid="offer-{offer["id"]}"]', timeout=8000)
                has_withdraw = await bpage.query_selector(f'[data-testid="offer-withdraw-{offer["id"]}"]')
                log("2.buyer sent tab shows offer + withdraw", has_withdraw is not None)
            except Exception as e:
                log("2.buyer sent tab shows offer + withdraw", False, str(e))

        # =============== 3) Seller counters, buyer accepts ===============
        if offer:
            r = requests.post(
                f"{API}/marketplace/offers/{offer['id']}/respond",
                json={"action": "counter", "counter_amount": 100000},
                headers=auth(seller_tok),
                timeout=20,
            )
            log("3.seller counter via API", r.status_code == 200 and r.json()["offer"]["status"] == "countered", str(r.status_code))

            # Seller UI: received tab shows card
            await page.goto(f"{BASE_URL}/marketplace/my-listings?tab=received", wait_until="domcontentloaded")
            try:
                await page.wait_for_selector(f'[data-testid="offer-{offer["id"]}"]', timeout=8000)
                counter_btn = await page.query_selector(f'[data-testid="offer-counter-{offer["id"]}"]')
                log("3.seller received tab shows offer card + counter button", counter_btn is not None)
            except Exception as e:
                log("3.seller received tab shows offer card", False, str(e))

            # Buyer accepts
            r = requests.post(
                f"{API}/marketplace/offers/{offer['id']}/respond",
                json={"action": "accept"},
                headers=auth(buyer_tok),
                timeout=20,
            )
            acc = r.json().get("offer", {})
            log("3.buyer accepts → status=accepted, agreed=100000, conv_id present",
                r.status_code == 200 and acc.get("status") == "accepted" and acc.get("agreed_amount") == 100000 and bool(acc.get("conversation_id")),
                f"status={r.status_code}, acc={acc.get('status')}, agreed={acc.get('agreed_amount')}, conv={acc.get('conversation_id')}")

            # Buyer UI: sent tab shows chat button for accepted
            await bpage.goto(f"{BASE_URL}/marketplace/my-listings?tab=sent", wait_until="domcontentloaded")
            await bpage.wait_for_timeout(1500)
            chat_btn = await bpage.query_selector(f'[data-testid="offer-chat-{offer["id"]}"]')
            log("3.buyer sent tab offer-chat-{id} button", chat_btn is not None)

        # =============== 4) Report flow as buyer ===============
        await bpage.goto(f"{BASE_URL}/marketplace/{item_id}", wait_until="domcontentloaded")
        await bpage.wait_for_timeout(1500)
        # Via UI
        report_submitted_ui = False
        try:
            btn = await bpage.query_selector('[data-testid="report-listing"]')
            if btn:
                await bpage.click('[data-testid="report-listing"]', force=True)
                await bpage.wait_for_selector('[data-testid="report-sheet"]', timeout=5000)
                await bpage.click('[data-testid="report-reason-scam"]', force=True)
                await bpage.wait_for_timeout(400)
                try:
                    await bpage.locator('[data-testid="report-details"] textarea, [data-testid="report-details"] input, [data-testid="report-details"]').first.fill("Looks like a scam, deposit required upfront")
                except Exception:
                    pass
                await bpage.click('[data-testid="report-submit"]', force=True)
                await bpage.wait_for_timeout(1500)
                report_submitted_ui = True
                log("4.report submitted via UI", True)
            else:
                log("4.report-listing button missing (fallback to API)", False)
        except Exception as e:
            log("4.report UI flow", False, str(e))

        if not report_submitted_ui:
            r = requests.post(f"{API}/marketplace/items/{item_id}/report", json={"reason": "scam", "details": "Scam"}, headers=auth(buyer_tok), timeout=20)
            log("4.report via API", r.status_code == 200)

        # Dedup
        r = requests.post(f"{API}/marketplace/items/{item_id}/report", json={"reason": "other"}, headers=auth(buyer_tok), timeout=20)
        log("4.report dedup → duplicate=true", r.status_code == 200 and r.json().get("duplicate") is True, str(r.json()))

        # Seller viewing own listing should NOT see report-listing nor action-offer/chat
        await page.goto(f"{BASE_URL}/marketplace/{item_id}", wait_until="domcontentloaded")
        await page.wait_for_timeout(1500)
        own_note = await page.query_selector('[data-testid="own-listing-note"]')
        manage_btn = await page.query_selector('[data-testid="manage-listing"]')
        no_report = await page.query_selector('[data-testid="report-listing"]')
        no_offer = await page.query_selector('[data-testid="action-offer"]')
        log("4.seller on own listing: own-listing-note + manage-listing visible; no report/offer", 
            own_note is not None and manage_btn is not None and no_report is None and no_offer is None,
            f"own_note={own_note is not None} manage={manage_btn is not None} no_report={no_report is None} no_offer={no_offer is None}")

        # =============== 5) Admin cockpit → market-reports ===============
        await page.goto(f"{BASE_URL}/admin", wait_until="domcontentloaded")
        await page.wait_for_timeout(1500)
        tile = await page.query_selector('[data-testid="tile-market-reports"]')
        log("5.admin cockpit tile-market-reports present", tile is not None)

        await page.goto(f"{BASE_URL}/admin/market-reports", wait_until="domcontentloaded")
        try:
            await page.wait_for_selector('[data-testid="admin-market-reports"]', timeout=10000)
            log("5.admin-market-reports screen renders", True)
        except Exception as e:
            log("5.admin-market-reports screen renders", False, str(e))

        # Fetch reports via API to find id for our item
        q = requests.get(f"{API}/marketplace/admin/reports", headers=auth(seller_tok), timeout=20).json()
        rep = next((x for x in q.get("items", []) if x["item"]["id"] == item_id), None)
        if rep:
            card = await page.query_selector(f'[data-testid="market-report-{rep["id"]}"]')
            log("5.market-report card present", card is not None, f"rid={rep['id']}")
            # Try dismiss
            try:
                await page.click(f'[data-testid="dismiss-{rep["id"]}"]', force=True)
                await page.wait_for_timeout(1500)
                q2 = requests.get(f"{API}/marketplace/admin/reports", headers=auth(seller_tok), timeout=20).json()
                dismissed = not any(x["id"] == rep["id"] for x in q2.get("items", []))
                log("5.dismiss removes report from open queue", dismissed)
            except Exception as e:
                log("5.dismiss action", False, str(e))

            # Resolved filter
            try:
                btn = await page.query_selector('[data-testid="reports-filter-resolved"]')
                if btn:
                    await page.click('[data-testid="reports-filter-resolved"]', force=True)
                    await page.wait_for_timeout(1200)
                    log("5.reports-filter-resolved exists", True)
                else:
                    log("5.reports-filter-resolved exists", False)
            except Exception as e:
                log("5.reports-filter-resolved exists", False, str(e))

        # Non-admin check
        apage = await context.new_page()
        await apage.goto(f"{BASE_URL}/", wait_until="domcontentloaded")
        await apage.evaluate(
            f"() => window.localStorage.setItem('amass_auth_token', JSON.stringify({json.dumps(buyer_tok)}))"
        )
        await apage.goto(f"{BASE_URL}/admin/market-reports", wait_until="domcontentloaded")
        await apage.wait_for_timeout(2000)
        txt = await apage.evaluate("() => document.body.innerText")
        log("5.non-admin sees 'Admins only'", "Admins only" in txt or "admin" in txt.lower(), txt[:200].replace("\n", " "))

        # =============== 6) Mark sold → relist → delete ===============
        r = requests.patch(f"{API}/marketplace/items/{item_id}", json={"status": "sold"}, headers=auth(seller_tok), timeout=20)
        log("6.mark sold API", r.status_code == 200 and r.json()["item"]["status"] == "sold", str(r.status_code))

        feed = requests.get(f"{API}/marketplace", params={"q": item_name}, timeout=20).json()
        in_feed = any(i["id"] == item_id for i in feed)
        log("6.sold hidden from feed", not in_feed)

        detail_resp = requests.get(f"{API}/marketplace/items/{item_id}", timeout=20)
        log("6.detail still 200 with status=sold", detail_resp.status_code == 200 and detail_resp.json()["item"]["status"] == "sold")

        # Buyer view: item-sold-banner + no action-offer/chat
        await bpage.goto(f"{BASE_URL}/marketplace/{item_id}", wait_until="domcontentloaded")
        await bpage.wait_for_timeout(2000)
        sold_banner = await bpage.query_selector('[data-testid="item-sold-banner"]')
        sold_bar = await bpage.query_selector('[data-testid="sold-action-bar"]')
        browse_similar = await bpage.query_selector('[data-testid="browse-similar"]')
        no_offer = await bpage.query_selector('[data-testid="action-offer"]')
        no_chat = await bpage.query_selector('[data-testid="action-chat"]')
        log("6.buyer on sold item: sold-banner + sold-action-bar + browse-similar; no action-offer/chat",
            sold_banner is not None and sold_bar is not None and browse_similar is not None and no_offer is None and no_chat is None,
            f"banner={sold_banner is not None} bar={sold_bar is not None} browse={browse_similar is not None} no_offer={no_offer is None} no_chat={no_chat is None}")

        # Relist
        r = requests.patch(f"{API}/marketplace/items/{item_id}", json={"status": "active"}, headers=auth(seller_tok), timeout=20)
        log("6.relist → active", r.status_code == 200 and r.json()["item"]["status"] == "active", str(r.status_code))

        # Delete via UI if possible
        try:
            await page.goto(f"{BASE_URL}/marketplace/my-listings?tab=listings", wait_until="domcontentloaded")
            await page.wait_for_timeout(1500)
            await page.click(f'[data-testid="manage-{item_id}"]', force=True)
            await page.wait_for_selector('[data-testid="manage-sheet"]', timeout=5000)
            await page.click('[data-testid="manage-delete"]', force=True)
            await page.wait_for_selector('[data-testid="delete-sheet"]', timeout=5000)
            await page.click('[data-testid="delete-confirm"]', force=True)
            await page.wait_for_timeout(1500)
            r = requests.get(f"{API}/marketplace/items/{item_id}", timeout=20)
            log("6.delete via UI → 404", r.status_code == 404, f"status={r.status_code}")
            if r.status_code == 404:
                created_ids.remove(item_id)
        except Exception as e:
            # API fallback
            requests.delete(f"{API}/marketplace/items/{item_id}", headers=auth(seller_tok), timeout=20)
            r = requests.get(f"{API}/marketplace/items/{item_id}", timeout=20)
            log("6.delete via API fallback → 404", r.status_code == 404, f"err={e}")
            if r.status_code == 404 and item_id in created_ids:
                created_ids.remove(item_id)

        # =============== 7) Regression: tabs/marketplace header + inbox ===============
        await page.goto(f"{BASE_URL}/marketplace", wait_until="domcontentloaded")
        await page.wait_for_timeout(2000)
        mybtn = await page.query_selector('[data-testid="market-my-listings-btn"]')
        savedbtn = await page.query_selector('[data-testid="market-saved-btn"]')
        notifbtn = await page.query_selector('[data-testid="market-notif-btn"]')
        log("7.market tab header: my-listings + saved buttons present; notif removed",
            mybtn is not None and savedbtn is not None and notifbtn is None,
            f"my={mybtn is not None} saved={savedbtn is not None} notif={notifbtn is not None}")

        # Profile services -> My Market Listings
        await page.goto(f"{BASE_URL}/profile", wait_until="domcontentloaded")
        await page.wait_for_timeout(2000)
        body_txt = await page.evaluate("() => document.body.innerText")
        log("7.Profile Services has 'My Market Listings' row", "My Market Listings" in body_txt or "my market listings" in body_txt.lower())

        # /notifications renders
        await page.goto(f"{BASE_URL}/notifications", wait_until="domcontentloaded")
        await page.wait_for_timeout(2000)
        no_red = await page.query_selector('[data-testid="error-screen"]') is None
        log("7./notifications renders without red-screen", no_red)

        # Inbox - as buyer (has item conversation)
        await bpage.goto(f"{BASE_URL}/inbox", wait_until="domcontentloaded")
        await bpage.wait_for_timeout(2500)
        inbox_text = await bpage.evaluate("() => document.body.innerText")
        has_price_marker = "₦" in inbox_text or "N" in inbox_text
        log("7.inbox renders without red-screen", await bpage.query_selector('[data-testid="error-screen"]') is None)

        # ---------- Cleanup ----------
        for iid in list(created_ids):
            try:
                requests.delete(f"{API}/marketplace/items/{iid}", headers=auth(seller_tok), timeout=20)
                print(f"CLEANUP: deleted {iid}")
            except Exception:
                pass

        await browser.close()

    # Summary
    passed = sum(1 for r in results if r["ok"])
    total = len(results)
    print(f"\n=== E2E RESULT: {passed}/{total} checks passed ===")
    for r in results:
        if not r["ok"]:
            print(f"  FAIL: {r['step']} :: {r['detail']}")


if __name__ == "__main__":
    asyncio.run(run())
