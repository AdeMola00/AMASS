
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
