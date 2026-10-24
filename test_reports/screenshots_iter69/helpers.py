import json
AUDIT = open('/tmp/audit.js').read()
BASE = "https://property-os-africa.preview.emergentagent.com"
ERRS = []
def _c(m):
    if m.type == "error" and "shadow" not in m.text and "pointerEvents" not in m.text:
        ERRS.append(m.text[:220])
page.on("console", _c)
async def skip_ad():
    for _ in range(2):
        if await page.locator('[data-testid="ad-skip"]').count():
            try: await page.locator('[data-testid="ad-skip"]').first.click(force=True, timeout=3000)
            except Exception:
                try: await page.get_by_text("Skip", exact=True).first.click(force=True, timeout=3000)
                except Exception: await page.wait_for_timeout(6000)
            await page.wait_for_timeout(800)
async def login(w=390, h=844):
    await page.set_viewport_size({"width": w, "height": h})
    await page.goto(BASE + "/login"); 
    await page.wait_for_selector('[data-testid="login-email"]', timeout=20000)
    await skip_ad()
    await page.fill('[data-testid="login-email"]', "demo@amass.africa")
    await page.fill('[data-testid="login-password"]', "amass2026")
    await page.click('[data-testid="login-submit-button"]', force=True)
    await page.wait_for_timeout(5000); await skip_ad()
async def audit(name, shot=True, filt=None):
    await skip_ad()
    a = await page.evaluate(AUDIT)
    iss = [i for i in a["issues"] if i["t"] != "lineClamp" and "Back online" not in i.get("txt","")]
    iss = [i for i in iss if not (i["t"]=="truncX" and len(i.get("txt",""))>28 and "₦" not in i["txt"])]
    seen=set(); u=[]
    for i in iss:
        k=(i["t"], i.get("txt","")[:20])
        if k not in seen: seen.add(k); u.append(i)
    iss=u
    if filt: iss = [i for i in iss if filt(i)]
    print(f"== {name} url={page.url} docW={a['docW']} vw={a['vw']} issues={len(iss)}")
    for i in iss[:14]: print("   ", json.dumps(i, ensure_ascii=False))
    if shot: await page.screenshot(path=f".screenshots/{name}.jpg", quality=40, full_page=False)
async def visit(path, name, wait=4000, shot=True):
    await page.goto(BASE + path); await page.wait_for_timeout(wait)
    await audit(name, shot)
