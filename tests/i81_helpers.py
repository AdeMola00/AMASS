# Iteration 81 helpers: money-rain observer + login. exec(open('/app/tests/i81_helpers.py').read(), globals())
RAIN_INIT = """
(() => {
  if (window.__rainObs) return;
  window.__rains = [];
  const seen = new WeakMap();
  const check = () => {
    const now = performance.now();
    const els = document.querySelectorAll('[data-testid^="money-rain-"]');
    els.forEach((el) => {
      if (!seen.has(el)) {
        const rec = { v: el.getAttribute('data-testid'), t0: Math.round(now), t1: null, path: location.pathname + location.search,
          ariaHidden: el.getAttribute('aria-hidden'), pe: getComputedStyle(el).pointerEvents, notes: el.children.length };
        seen.set(el, rec); window.__rains.push(rec);
      }
    });
    window.__rains.forEach((r) => {
      if (r.t1 == null) {
        const still = Array.from(els).some((el) => seen.get(el) === r);
        if (!still) r.t1 = Math.round(now);
      }
    });
  };
  const start = () => {
    window.__rainObs = new MutationObserver(check);
    window.__rainObs.observe(document.documentElement, { childList: true, subtree: true });
  };
  if (document.documentElement) start(); else document.addEventListener('DOMContentLoaded', start);
})();
"""

async def rains(page):
    return await page.evaluate("() => (window.__rains || []).map(r => ({...r, dur: r.t1 ? r.t1 - r.t0 : null}))")

async def reset_rains(page):
    await page.evaluate("() => { window.__rains = []; }")

async def login(page, email, pw):
    await page.wait_for_timeout(4000)
    for i in range(4):
        if await page.is_visible('[data-testid="login-email"]'):
            break
        if await page.is_visible('[data-testid="onboarding-signin"]'):
            await page.click('[data-testid="onboarding-signin"]', force=True)
        await page.wait_for_timeout(3000)
    e = page.locator('input[data-testid="login-email"]')
    if await e.count() == 0:
        e = page.locator('[data-testid="login-email"] input')
    await e.fill(email)
    p = page.locator('input[data-testid="login-password"]')
    if await p.count() == 0:
        p = page.locator('[data-testid="login-password"] input')
    await p.fill(pw)
    await page.click('[data-testid="login-submit-button"]', force=True)
    await page.wait_for_selector('[data-testid="home-search-input"], [data-testid="intent-sheet"]', timeout=25000)
    await page.wait_for_timeout(4000)
    if await page.is_visible('[data-testid="intent-all"]'):
        await page.click('[data-testid="intent-all"]', force=True)
        await page.wait_for_timeout(2500)

async def visible_pins(page):
    return await page.evaluate("""() => Array.from(document.querySelectorAll('[data-testid^="pin-"]')).filter(el => {
      const id = el.getAttribute('data-testid'); if (id.startsWith('pin-boost-')) return false;
      const r = el.getBoundingClientRect(); return r.width > 0 && r.top > 130 && r.bottom < 700 && r.left >= 0 && r.right <= 390; })
      .map(el => ({id: el.getAttribute('data-testid').slice(4), text: el.innerText.replace(/\\n/g,' ')}))""")
