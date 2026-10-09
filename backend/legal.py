"""AMASS — Legal pages (Privacy Policy + Terms of Service).

Serves publicly-reachable HTML under the /api ingress prefix so the Play Store
/ App Store review (and the in-app WebBrowser links) can load them without auth.

Public URLs after deploy:
  https://<domain>/api/legal/privacy
  https://<domain>/api/legal/terms
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter
from fastapi.responses import HTMLResponse

LAST_UPDATED = "June 2026"
CONTACT_EMAIL = "privacy@amass.africa"
SUPPORT_EMAIL = "hello@amass.africa"
COMPANY = "AMASS — Africa's Property Operating System"

_BASE_CSS = """
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: #F7F8F7; color: #1A1A1A;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    line-height: 1.6; -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 760px; margin: 0 auto; padding: 32px 20px 72px; }
  header.brand {
    display: flex; align-items: center; gap: 12px; margin-bottom: 28px;
    padding-bottom: 20px; border-bottom: 1px solid #E5E7EB;
  }
  .logo {
    width: 40px; height: 40px; border-radius: 10px; background: #059669;
    color: #fff; display: flex; align-items: center; justify-content: center;
    font-weight: 800; font-size: 18px; letter-spacing: 0.5px;
  }
  .brand-name { font-weight: 800; font-size: 18px; color: #111; }
  .brand-sub { font-size: 12px; color: #6B7280; }
  h1 { font-size: 28px; font-weight: 800; margin: 8px 0 6px; letter-spacing: -0.3px; }
  .updated { color: #6B7280; font-size: 13px; margin-bottom: 28px; }
  h2 { font-size: 18px; font-weight: 700; margin: 32px 0 10px; color: #111; }
  p, li { font-size: 15px; color: #374151; }
  ul { padding-left: 20px; }
  li { margin-bottom: 6px; }
  a { color: #059669; }
  .card {
    background: #fff; border: 1px solid #E5E7EB; border-radius: 14px;
    padding: 18px 20px; margin: 18px 0;
  }
  footer { margin-top: 48px; padding-top: 20px; border-top: 1px solid #E5E7EB; color: #6B7280; font-size: 13px; }
"""


def _page(title: str, body_html: str) -> str:
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="index,follow" />
  <title>{title} · AMASS</title>
  <style>{_BASE_CSS}</style>
</head>
<body>
  <div class="wrap">
    <header class="brand">
      <div class="logo">A</div>
      <div>
        <div class="brand-name">AMASS</div>
        <div class="brand-sub">Africa's Property Operating System</div>
      </div>
    </header>
    {body_html}
    <footer>
      © {datetime.now(timezone.utc).year} {COMPANY}. All rights reserved.<br/>
      Questions? Email <a href="mailto:{CONTACT_EMAIL}">{CONTACT_EMAIL}</a>.
    </footer>
  </div>
</body>
</html>"""


_PRIVACY_BODY = f"""
    <h1>Privacy Policy</h1>
    <div class="updated">Last updated: {LAST_UPDATED}</div>

    <p>This Privacy Policy explains how AMASS ("AMASS", "we", "us") collects, uses,
    and protects your information when you use the AMASS mobile application and
    related services (the "Service"). By using AMASS you agree to this policy.</p>

    <h2>1. Information we collect</h2>
    <ul>
      <li><strong>Account information</strong> — your name, email address, phone
      number, and password (passwords are stored only as a secure one-way hash).</li>
      <li><strong>Profile &amp; agent details</strong> — profile photo, bio, agency
      information, and verification documents you choose to submit.</li>
      <li><strong>Location data</strong> — approximate or precise device location to
      show nearby properties and let agents verify a property's GPS position. You can
      control this in your device settings.</li>
      <li><strong>Camera &amp; photos</strong> — images you capture or select when
      listing a property, verifying a property, or sending them in chat. We only
      access media you explicitly choose.</li>
      <li><strong>Transactions</strong> — your in-app wallet balance, token purchases,
      property unlocks, and payment references. Card details are handled by our
      payment processors and are never stored by AMASS.</li>
      <li><strong>Messages</strong> — messages, voice notes, and images you exchange
      with agents and support through in-app chat.</li>
      <li><strong>Device &amp; usage data</strong> — device type, operating system,
      app version, and diagnostic data used to keep the Service reliable and secure.</li>
    </ul>

    <h2>2. How we use your information</h2>
    <ul>
      <li>Provide property discovery, listings, verification, chat, and marketplace
      features.</li>
      <li>Process wallet top-ups, token spending, and agent subscriptions.</li>
      <li>Authenticate you, protect your account, and prevent fraud or abuse.</li>
      <li>Send transactional emails such as password resets and account notices.</li>
      <li>Generate AI-assisted property insights and valuations (estimates only, not a
      professional appraisal).</li>
      <li>Improve and troubleshoot the Service.</li>
    </ul>

    <h2>3. How we share information</h2>
    <p>We do not sell your personal data. We share limited data only with:</p>
    <ul>
      <li><strong>Agents and users you interact with</strong> — when you unlock a
      listing or start a chat, the relevant party receives the information needed to
      respond (for example, your display name).</li>
      <li><strong>Service providers</strong> — payment processors, email delivery,
      cloud hosting and storage, maps, and AI providers, strictly to operate the
      Service.</li>
      <li><strong>Legal</strong> — where required by law or to protect the rights,
      safety, and security of AMASS and its users.</li>
    </ul>

    <h2>4. Payments</h2>
    <p>In-app purchases and agent subscriptions are processed by third-party payment
    providers. AMASS receives a transaction reference and status but does not receive
    or store your full card or banking credentials.</p>

    <h2>5. Data retention</h2>
    <p>We keep your information for as long as your account is active or as needed to
    provide the Service, comply with legal obligations, resolve disputes, and enforce
    our agreements.</p>

    <h2>6. Your rights &amp; account deletion</h2>
    <p>You can access and update your profile at any time in the app. You may delete
    your account from <strong>Settings → Delete account</strong>; this permanently
    erases your profile, wallet, saved searches, favourites, notifications, and chat
    data. Properties you listed are anonymised so historical records remain accurate.
    You may also request deletion by emailing
    <a href="mailto:{CONTACT_EMAIL}">{CONTACT_EMAIL}</a>.</p>

    <h2>7. Security</h2>
    <p>We use industry-standard safeguards including encrypted transport, hashed
    passwords, brute-force login protection, and access controls. No method of
    transmission or storage is 100% secure, but we work hard to protect your data.</p>

    <h2>8. Children</h2>
    <p>AMASS is not directed to children under 18 and we do not knowingly collect
    personal data from them.</p>

    <h2>9. Changes to this policy</h2>
    <p>We may update this policy from time to time. Material changes will be reflected
    by the "Last updated" date above and, where appropriate, by an in-app notice.</p>

    <h2>10. Contact us</h2>
    <div class="card">
      <p style="margin:0">
        <strong>{COMPANY}</strong><br/>
        Privacy enquiries: <a href="mailto:{CONTACT_EMAIL}">{CONTACT_EMAIL}</a><br/>
        General support: <a href="mailto:{SUPPORT_EMAIL}">{SUPPORT_EMAIL}</a>
      </p>
    </div>
"""


_TERMS_BODY = f"""
    <h1>Terms of Service</h1>
    <div class="updated">Last updated: {LAST_UPDATED}</div>

    <p>These Terms govern your use of the AMASS application and services. By using
    AMASS you agree to these Terms.</p>

    <h2>1. Your account</h2>
    <p>You are responsible for keeping your login credentials secure and for all
    activity under your account. Provide accurate information and keep it up to date.</p>

    <h2>2. Listings &amp; conduct</h2>
    <ul>
      <li>List only properties you are authorised to market, with accurate details.</li>
      <li>Do not post unlawful, misleading, fraudulent, or infringing content.</li>
      <li>Do not harass other users or misuse chat, reviews, or reporting tools.</li>
    </ul>

    <h2>3. Wallet, tokens &amp; subscriptions</h2>
    <p>AMASS uses in-app tokens to unlock property details and contact information, and
    offers agent subscriptions. Token and subscription prices are shown before you
    pay. Except where required by law, purchases are non-refundable once the related
    digital content has been unlocked or consumed.</p>

    <h2>4. AI insights</h2>
    <p>AI-generated valuations and insights are estimates based on available data and
    are not professional appraisals, financial advice, or guarantees of market value.</p>

    <h2>5. Disclaimers</h2>
    <p>The Service is provided "as is". AMASS does not guarantee the accuracy of any
    listing, valuation, or user-provided content, and is not a party to transactions
    between buyers, sellers, agents, or service providers.</p>

    <h2>6. Limitation of liability</h2>
    <p>To the maximum extent permitted by law, AMASS is not liable for indirect,
    incidental, or consequential damages arising from your use of the Service.</p>

    <h2>7. Termination</h2>
    <p>We may suspend or terminate accounts that violate these Terms or applicable law.
    You may stop using the Service and delete your account at any time.</p>

    <h2>8. Contact</h2>
    <div class="card">
      <p style="margin:0">Questions about these Terms? Email
      <a href="mailto:{SUPPORT_EMAIL}">{SUPPORT_EMAIL}</a>.</p>
    </div>
"""


def register_legal_routes() -> APIRouter:
    r = APIRouter(prefix="/api/legal", tags=["legal"])

    @r.get("/privacy", response_class=HTMLResponse)
    async def privacy_policy():
        return HTMLResponse(content=_page("Privacy Policy", _PRIVACY_BODY))

    @r.get("/terms", response_class=HTMLResponse)
    async def terms_of_service():
        return HTMLResponse(content=_page("Terms of Service", _TERMS_BODY))

    return r
