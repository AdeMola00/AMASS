DUMP_JS = """() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 ? r : null; };
  const seg = document.querySelector('[data-testid="intent-segment"]');
  const pill = document.querySelector('[data-testid="results-count-pill"],[data-testid="explore-wider-pill"]');
  const card = Array.from(document.querySelectorAll('[data-testid^="preview-card-"]')).filter(vis);
  const segB = seg ? seg.getBoundingClientRect().bottom : 126;
  const pillR = pill ? pill.getBoundingClientRect() : null;
  const cardR = card.length ? card[0].getBoundingClientRect() : null;
  const bottom = cardR ? cardR.top : (pillR ? pillR.top : 714);
  const out = [];
  let readable = 0;
  document.querySelectorAll('[data-testid^="pin-"],[data-testid^="cluster-"]').forEach((el) => {
    const id = el.getAttribute('data-testid');
    if (id.startsWith('pin-boost-')) return;
    const r = vis(el); if (!r) return;
    const isC = id.startsWith('cluster-');
    const n = isC ? parseInt(el.innerText) : 1;
    const inside = r.left >= 0 && r.right <= 390 && r.top >= segB && r.bottom <= bottom;
    if (inside) readable += n;
    out.push(`${isC ? 'C' : 'P'}:${el.innerText.replace(/\\n/g,' ').slice(0,14)} [${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}]${inside ? '' : ' CLIPPED'}`);
  });
  const shA = document.querySelector('[data-testid="search-this-area"]') || Array.from(document.querySelectorAll('div')).find(d => d.innerText === 'Search this area');
  return {segB: Math.round(segB), pillTop: pillR ? Math.round(pillR.top) : null, pillText: pill ? pill.innerText : null, pillId: pill ? pill.getAttribute('data-testid') : null, cardTop: cardR ? Math.round(cardR.top) : null, cards: card.length, readable, searchArea: !!shA, items: out};
}"""

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
    await page.wait_for_selector('[data-testid="home-search-input"]', timeout=25000)
    await page.wait_for_timeout(5000)
