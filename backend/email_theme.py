"""AMASS email theme — one branded layout for every email the app sends.

  render_email(...)  → full HTML document: red brand bar, AMASS logo header, a real photo of African homes and
                       cities as the hero, the message, an optional 6-digit code / details table / CTA button, and
                       a footer carrying the FIXA logo. Table layout + inline styles so it renders in Gmail,
                       Outlook, Apple Mail and on phones.

Guardrails (auth_security._assert_safe_email): no forms, every link/asset absolute https. Hero photos are served
from the Unsplash CDN (free licence, the same source the listing seed uses). Logos are served by this API from
`assets/email/` — the public origin comes from public_url.public_api_base(); until it is known the header falls
back to a text wordmark so an email is never blocked on a missing image.

Callers pass already-escaped HTML for `body_html`; the helpers below (p, details_table, code_block, amount_block)
escape their inputs.
"""
from __future__ import annotations

import os
from html import escape
from typing import Iterable, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from public_url import public_api_base

RED = "#E11B22"
INK = "#111111"
INK_2 = "#444444"
MUTED = "#8A8680"
LINE = "#F0ECE6"
PAPER = "#F3F0EA"
FOOT = "#FAF8F5"
FONT = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

ASSET_DIR = os.path.join(os.path.dirname(__file__), "assets", "email")
_ASSETS = {"amass-logo.png": "AMASS", "fixa-logo.png": "FIXA PRO", "amass-wordmark.png": "AMASS"}

# Real photos of African homes and cities (Unsplash, free licence). Sized for a 600 px card at 2× density.
_UNSPLASH = "https://images.unsplash.com/photo-{id}?w=1200&h=560&fit=crop&q=75&auto=format"
HEROES: dict[str, dict[str, str]] = {
    "city": {"id": "1618828665011-0abd973f7bb8", "alt": "Victoria Island, Lagos from above"},
    "skyline": {"id": "1618828665347-d870c38c95c7", "alt": "Lagos skyline on a clear day"},
    "lagoon": {"id": "1765475467677-579353b25ce0", "alt": "Boats on the Lagos lagoon beside the bridge"},
    "night": {"id": "1648023200201-8fcede127835", "alt": "Lekki-Ikoyi Link Bridge at night"},
    "mainland": {"id": "1594538756542-8c88bda491c5", "alt": "Lagos mainland skyline"},
    "estate": {"id": "1639774275491-71d62502a4e0", "alt": "Leafy residential estate"},
    "home": {"id": "1628144688607-c373d8e3f31b", "alt": "Modern family home"},
    "luxury": {"id": "1613977257363-707ba9348227", "alt": "Contemporary home with a pool"},
    "garden": {"id": "1600585154340-be6161a56a0c", "alt": "Home with a garden at dusk"},
}


def hero_url(key: str) -> tuple[str, str]:
    h = HEROES.get(key) or HEROES["city"]
    return _UNSPLASH.format(id=h["id"]), h["alt"]


def asset_url(name: str) -> Optional[str]:
    base = public_api_base()
    if not base.startswith("https://") or name not in _ASSETS:
        return None
    return f"{base}/api/email-assets/{name}"


# ─── Block helpers ──────────────────────────────────────────────────────────
def p(text: str, *, muted: bool = False, size: int = 15) -> str:
    color = MUTED if muted else INK_2
    return f'<p style="margin:0 0 12px;font-size:{size}px;line-height:{size + 8}px;color:{color}">{escape(text)}</p>'


def raw_p(inner_html: str, *, muted: bool = False, size: int = 15) -> str:
    color = MUTED if muted else INK_2
    return f'<p style="margin:0 0 12px;font-size:{size}px;line-height:{size + 8}px;color:{color}">{inner_html}</p>'


def code_block(code: str, caption: Optional[str] = None) -> str:
    cap = f'<div style="font-size:12px;color:{MUTED};margin-top:8px">{escape(caption)}</div>' if caption else ""
    return (
        '<div style="margin:18px 0 20px">'
        f'<div style="display:inline-block;background:{INK};color:#FFFFFF;font-size:32px;line-height:40px;font-weight:800;'
        f'letter-spacing:10px;padding:12px 16px 12px 26px;border-radius:14px;font-family:{FONT}">{escape(code)}</div>'
        f"{cap}</div>"
    )


def amount_block(amount: str, sub: Optional[str] = None) -> str:
    s = f'<div style="font-size:15px;line-height:22px;color:{INK_2};margin-top:2px">{escape(sub)}</div>' if sub else ""
    return (
        f'<div style="margin:6px 0 18px;padding:18px 20px;background:{FOOT};border:1px solid {LINE};border-radius:16px">'
        f'<div style="font-size:30px;line-height:36px;font-weight:800;letter-spacing:-.5px;color:{INK}">{escape(amount)}</div>{s}</div>'
    )


def details_table(rows: Iterable[tuple[str, str]]) -> str:
    trs = "".join(
        f'<tr><td style="padding:10px 0;border-bottom:1px solid {LINE};font-size:14px;color:{MUTED};vertical-align:top">{escape(str(k))}</td>'
        f'<td align="right" style="padding:10px 0 10px 16px;border-bottom:1px solid {LINE};font-size:14px;font-weight:700;color:{INK};vertical-align:top">{escape(str(v))}</td></tr>'
        for k, v in rows
        if v not in (None, "")
    )
    return f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 18px;border-collapse:collapse">{trs}</table>' if trs else ""


def button(label: str, url: str) -> str:
    if not url.startswith("https://"):
        return ""
    return (
        '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 10px"><tr><td align="center" style="border-radius:999px;background:' + RED + '">'
        f'<a href="{escape(url)}" style="display:inline-block;padding:14px 26px;font-size:15px;line-height:18px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:999px;font-family:{FONT}">{escape(label)}</a>'
        "</td></tr></table>"
    )


# ─── The layout ─────────────────────────────────────────────────────────────
def render_email(
    *,
    title: str,
    body_html: str,
    hero: str = "city",
    kicker: str = "",
    greeting: Optional[str] = None,
    preheader: Optional[str] = None,
    cta: Optional[tuple[str, str]] = None,
    note: Optional[str] = None,
    footer_links_html: str = "",
) -> str:
    img, alt = hero_url(hero)
    amass_logo = asset_url("amass-logo.png")
    fixa_logo = asset_url("fixa-logo.png")

    logo_html = (
        f'<img src="{amass_logo}" width="118" alt="AMASS" style="display:block;border:0;outline:none;width:118px;height:auto">'
        if amass_logo
        else f'<div style="font-size:26px;line-height:30px;font-weight:900;letter-spacing:-.8px;color:{INK}">AMASS</div>'
    )
    fixa_html = (
        f'<img src="{fixa_logo}" width="72" alt="FIXA PRO" style="display:inline-block;border:0;outline:none;width:72px;height:auto;vertical-align:middle">'
        if fixa_logo
        else f'<div style="font-size:18px;line-height:22px;font-weight:900;letter-spacing:-.4px;color:{INK}">FIXA</div>'
    )
    kicker_html = f'<div style="font-size:11px;line-height:16px;letter-spacing:1.4px;text-transform:uppercase;color:{RED};font-weight:800">{escape(kicker)}</div>' if kicker else ""
    greet_html = p(greeting) if greeting else ""
    cta_html = button(*cta) if cta else ""
    note_html = p(note, muted=True, size=13) if note else ""
    pre = escape(preheader or title)

    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>{escape(title)}</title></head>
<body style="margin:0;padding:0;background:{PAPER};font-family:{FONT}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">{pre}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{PAPER};padding:28px 12px 36px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#FFFFFF;border-radius:20px;overflow:hidden;border:1px solid {LINE}">
  <tr><td style="height:6px;background:{RED};font-size:0;line-height:6px">&nbsp;</td></tr>
  <tr><td style="padding:20px 28px 16px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td align="left" valign="middle">{logo_html}</td>
      <td align="right" valign="middle">{kicker_html}</td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:0;line-height:0;font-size:0"><img src="{img}" width="600" alt="{escape(alt)}" style="display:block;border:0;outline:none;width:100%;max-width:600px;height:auto"></td></tr>
  <tr><td style="padding:28px 28px 10px">
    <h1 style="margin:0 0 14px;font-size:26px;line-height:32px;font-weight:800;letter-spacing:-.4px;color:{INK}">{escape(title)}</h1>
    {greet_html}
    {body_html}
    {cta_html}
    {note_html}
  </td></tr>
  <tr><td style="padding:20px 28px 24px;background:{FOOT};border-top:1px solid {LINE}">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td align="left" valign="middle" style="font-size:12px;line-height:18px;color:{MUTED}">
        <div style="font-size:13px;font-weight:800;color:{INK}">AMASS · Africa's Property OS</div>
        Find a home · Fix it with FIXA · Finance it
      </td>
      <td align="right" valign="middle" style="font-size:11px;line-height:16px;color:{MUTED}">{fixa_html}<div style="margin-top:4px">Trusted pros, free to contact</div></td>
    </tr></table>
    <p style="margin:16px 0 0;font-size:12px;line-height:18px;color:{MUTED}">AMASS will never ask you to share a password or code by reply.{(" " + footer_links_html) if footer_links_html else ""}</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>"""


# ─── Public asset route (logos used inside emails) ──────────────────────────
def register_email_asset_routes() -> APIRouter:
    router = APIRouter(prefix="/api/email-assets", tags=["email-assets"])

    @router.get("/{name}")
    async def email_asset(name: str):
        if name not in _ASSETS:
            raise HTTPException(404, "Not found")
        return FileResponse(os.path.join(ASSET_DIR, name), media_type="image/png", headers={"Cache-Control": "public, max-age=604800"})

    return router


# ─── Admin previews — render every template with sample data in the browser ─
PREVIEW_KINDS = ("reset", "receipt", "unlock", "viewing", "viewing-confirmed", "home", "digest", "agency")


def _sample(kind: str) -> tuple[str, str]:
    from datetime import datetime, timezone

    if kind == "reset":
        return "Your AMASS password reset code", render_email(
            title="Your password reset code", kicker="Account security", hero="night", greeting="Hi Ada,",
            body_html=p("Use this code to reset your AMASS password. It expires in 15 minutes.") + code_block("482913", "Valid for 15 minutes · single use")
            + p("If you did not request this, you can safely ignore this email — your password will not change."),
            note="For your security, AMASS will never ask you to share this code by reply.",
        )
    if kind in ("receipt", "unlock"):
        from receipts import receipt_html

        unlock = kind == "unlock"
        return "Your AMASS receipt", receipt_html({
            "receipt_no": "AMS-20260612-7F3A9C", "kind": "property_access" if unlock else "topup", "reference": "unlock_8c1d2e" if unlock else "PSK_3f9a2b7c",
            "user_name": "Ada Demo", "description": "Unlocked · Waterfront 4-Bed Terrace with BQ, Lekki Phase 1" if unlock else "MASS top-up · Starter bundle",
            "amount_ngn": 800 if unlock else 10000, "tokens": 8 if unlock else 100, "currency": "MASS", "rate_ngn": 100,
            "items": [{"label": "Zone", "value": "A · Lekki Phase 1"}] if unlock else [{"label": "Bundle", "value": "Starter · 100 MASS"}],
            "provider": None if unlock else "paystack", "balance_after": 42, "created_at": datetime.now(timezone.utc),
        })
    if kind in ("viewing", "viewing-confirmed"):
        from viewings import _email_html

        if kind == "viewing":
            return "AMASS · New viewing request", _email_html("New viewing request", ["Ada Demo would like to view Serene 4-Bedroom Terrace, Ikoyi (Ikoyi).", "Proposed time: Sat 14 Jun · 10:00 (Lagos time).", "Confirm, suggest another time or decline in the app."])
        return "AMASS · Viewing confirmed", _email_html("Your viewing is confirmed", ["Serene 4-Bedroom Terrace, Ikoyi (Ikoyi).", "When: Sat 14 Jun · 10:00 (Lagos time).", "We'll remind you a day before."], hero="luxury")
    if kind == "home":
        return "Bill due in 3 days", render_email(
            title="EKEDC electricity is due in 3 days", kicker="My Home", hero="home", greeting="Hi Ada,",
            body_html=p("₦28,500 for 12 Admiralty Way is due on Sun 15 Jun. Tap below to see the bill and mark it paid when you have settled it."),
            cta=("Open in My Home", "https://amass.africa/home/bills"),
            note="AMASS reminds you — it never takes payments for your bills. Manage reminders under My Home or Notification preferences.",
        )
    if kind == "agency":
        return "You're invited to Lekki Prime Realty", render_email(
            title="You're invited to Lekki Prime Realty", kicker="Agency team", hero="skyline",
            body_html=raw_p("Adaeze Okoye invited you to join <b>Lekki Prime Realty</b> on AMASS as an agent. Team leads are shared in one CRM so nothing falls through the cracks.")
            + p("Open AMASS → My AMASS → Agency team and tap Accept."),
            cta=("Open AMASS", "https://amass.africa/agency"), note="If you weren't expecting this, you can ignore this email.",
        )
    from notification_center import digest_email_html

    return digest_email_html(
        {"id": "preview", "full_name": "Ada Demo"},
        [
            {"id": "1", "kind": "SAVED_SEARCH_MATCH", "category": "property_matches", "title": "3 new homes match “Lekki · 3-bed · ≤ ₦120m”", "body": "Fully Serviced 3-Bed Apartment, Lekki Phase 1 and 2 more", "read": False, "action_url": "/saved-searches", "created_at": "2026-06-12T07:00:00+00:00"},
            {"id": "2", "kind": "PRICE_DROP", "category": "property_matches", "title": "Price drop · Skyline Penthouse, Victoria Island", "body": "Now ₦310m (was ₦340m)", "read": False, "action_url": "/property/abc", "created_at": "2026-06-11T16:20:00+00:00"},
            {"id": "3", "kind": "MARKET_AD", "category": "marketplace", "title": "7 verified price drops in Lagos", "body": "", "read": True, "action_url": "/(tabs)/marketplace", "created_at": "2026-06-11T09:00:00+00:00"},
        ],
        frequency="daily", unread_total=4,
    )


def register_email_preview_routes(require_admin) -> APIRouter:
    from fastapi import Depends
    from fastapi.responses import HTMLResponse, JSONResponse

    router = APIRouter(prefix="/api/admin/email-previews", tags=["email-previews"])

    @router.get("")
    async def list_previews(_admin: dict = Depends(require_admin)):
        return {"kinds": list(PREVIEW_KINDS), "heroes": {k: hero_url(k)[0] for k in HEROES}, "logo": asset_url("amass-logo.png")}

    @router.get("/{kind}", response_class=HTMLResponse)
    async def preview(kind: str, format: str = "html", _admin: dict = Depends(require_admin)):
        if kind not in PREVIEW_KINDS:
            raise HTTPException(404, f"Unknown preview — one of {', '.join(PREVIEW_KINDS)}")
        subject, html = _sample(kind)
        if format == "json":
            return JSONResponse({"kind": kind, "subject": subject, "html": html})
        return HTMLResponse(html, headers={"X-Email-Subject": subject})

    return router
