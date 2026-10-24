import json
AUDIT = open('/tmp/audit.js').read()
MEAS = open('/tmp/measure.js').read()
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
            except Exception: await page.wait_for_timeout(6000)
            await page.wait_for_timeout(800)
async def login(email="demo@amass.africa", pw="amass2026", w=390, h=844):
    await page.set_viewport_size({"width": w, "height": h})
    await page.goto(BASE + "/login")
    await page.wait_for_selector('[data-testid="login-email"]', timeout=25000)
    await skip_ad()
    await page.fill('[data-testid="login-email"]', email)
    await page.fill('[data-testid="login-password"]', pw)
    await page.click('[data-testid="login-submit-button"]', force=True)
    await page.wait_for_timeout(5000); await skip_ad()
async def meas(sel, label=""):
    res = await page.evaluate(MEAS, sel)
    print(f"-- MEAS {label} {sel}: n={len(res)}")
    for b in res:
        bad = [k for k in b['kids'] if k['out'] or k['trunc']]
        print("   ", json.dumps({k:v for k,v in b.items() if k!='kids'}), "kids:", json.dumps([(k['tag'][:3],k['txt'][:30],k['l'],k['r'],'TRUNC' if k['trunc'] else '','OUT' if k['out'] else '') for k in b['kids']], ensure_ascii=False))
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
    if filt: iss=[i for i in iss if filt(i)]
    print(f"== {name} url={page.url} docW={a['docW']} vw={a['vw']} issues={len(iss)}")
    for i in iss[:14]: print("   ", json.dumps(i, ensure_ascii=False))
    if shot: await page.screenshot(path=f"/app/test_reports/screenshots_iter71/{name}.jpg", quality=40, full_page=False)
async def visit(path, name, wait=4000, shot=True):
    await page.goto(BASE + path); await page.wait_for_timeout(wait)
    await audit(name, shot)
