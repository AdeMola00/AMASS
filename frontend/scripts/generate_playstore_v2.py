"""
AMASS Google Play Store marketing assets generator.

Outputs (all in /app/frontend/assets/images/playstore-v2/):
  • screenshots/screenshot-01…10.png  → 1284 × 2778 (portrait, Play Store spec)
  • app-previews/preview-01…03.png    → 2778 × 1284 (landscape hero previews)

Design language: premium fintech / proptech.
Palette: red #E11D48 accents on jet black #0A0A0A with graphite #1F2937 panels
         and soft white text.  No rose gradient — clean, minimalist, Apple-grade.

Run:  python3 scripts/generate_playstore_v2.py
"""
from __future__ import annotations

import math
import os
import random

from PIL import Image, ImageDraw, ImageFilter, ImageFont

# ─── canvas ────────────────────────────────────────────────────────────
PORTRAIT = (1284, 2778)
LANDSCAPE = (2778, 1284)

SHOTS = "/app/frontend/assets/images/raw-shots"
OUT_BASE = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "assets", "images", "playstore-v2")
)
OUT_PORTRAIT = os.path.join(OUT_BASE, "screenshots")
OUT_LANDSCAPE = os.path.join(OUT_BASE, "app-previews")
os.makedirs(OUT_PORTRAIT, exist_ok=True)
os.makedirs(OUT_LANDSCAPE, exist_ok=True)

# ─── AMASS brand palette (red · black · white · graphite) ─────────────
RED = (225, 29, 72)          # #E11D48
RED_DARK = (159, 18, 57)     # #9F1239
BLACK = (10, 10, 10)         # #0A0A0A
GRAPHITE = (31, 41, 55)      # #1F2937
GRAPHITE_LIGHT = (55, 65, 81)  # #374151
WHITE = (255, 255, 255)
SOFT = (229, 231, 235)       # #E5E7EB


def _font(size: int, bold: bool = True) -> ImageFont.FreeTypeFont:
    p = (
        "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf"
        if bold
        else "/usr/share/fonts/truetype/freefont/FreeSans.ttf"
    )
    return ImageFont.truetype(p, size)


# ─── background: near-black with subtle vertical gradient + red glow ──
def bg_black(size: tuple[int, int]) -> Image.Image:
    w, h = size
    bg = Image.new("RGB", (w, h), BLACK)
    px = bg.load()
    for y in range(h):
        # graphite bloom in top-half → pure black at bottom
        t = min(1.0, y / (h * 0.6))
        r = int(GRAPHITE[0] * (1 - t) + BLACK[0] * t)
        g = int(GRAPHITE[1] * (1 - t) + BLACK[1] * t)
        b = int(GRAPHITE[2] * (1 - t) + BLACK[2] * t)
        for x in range(w):
            px[x, y] = (r, g, b)
    return bg.convert("RGBA")


def add_red_glow(img: Image.Image, cx: int, cy: int, radius: int, strength: float = 0.35) -> None:
    glow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(glow)
    d.ellipse(
        [cx - radius, cy - radius, cx + radius, cy + radius],
        fill=(*RED, int(255 * strength)),
    )
    glow = glow.filter(ImageFilter.GaussianBlur(radius=radius // 2))
    img.alpha_composite(glow)


# ─── decorative red accent bar top-right ──────────────────────────────
def add_accent_bar(img: Image.Image, portrait: bool) -> None:
    d = ImageDraw.Draw(img, "RGBA")
    w, h = img.size
    if portrait:
        # slim vertical red bar top-right
        d.rectangle([w - 24, 0, w - 12, 220], fill=(*RED, 240))
        d.rectangle([w - 8, 0, w, 120], fill=(*RED, 220))
    else:
        # top horizontal accent strip (thin)
        d.rectangle([0, 0, w, 8], fill=(*RED, 240))


# ─── phone-framed screenshot with drop shadow ─────────────────────────
def framed_phone(shot_path: str, target_w: int, corner: int = 62) -> Image.Image:
    src = Image.open(shot_path).convert("RGB")
    aspect = src.height / src.width
    target_h = int(target_w * aspect)
    src = src.resize((target_w, target_h), Image.LANCZOS)

    # rounded mask
    mask = Image.new("L", (target_w, target_h), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, target_w, target_h], radius=corner, fill=255
    )
    rounded = Image.new("RGBA", (target_w, target_h), (0, 0, 0, 0))
    rounded.paste(src, (0, 0), mask)

    # subtle white hairline border for definition against black
    border = Image.new("RGBA", (target_w, target_h), (0, 0, 0, 0))
    ImageDraw.Draw(border).rounded_rectangle(
        [2, 2, target_w - 2, target_h - 2],
        radius=corner,
        outline=(255, 255, 255, 60),
        width=3,
    )
    rounded = Image.alpha_composite(rounded, border)

    # drop shadow canvas
    pad = 80
    canvas = Image.new("RGBA", (target_w + pad * 2, target_h + pad * 2), (0, 0, 0, 0))
    sh = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(sh)
    sd.rounded_rectangle(
        [pad + 10, pad + 34, pad + target_w + 10, pad + target_h + 34],
        radius=corner,
        fill=(0, 0, 0, 220),
    )
    sh = sh.filter(ImageFilter.GaussianBlur(48))
    canvas.alpha_composite(sh)
    canvas.paste(rounded, (pad, pad), rounded)
    return canvas


# ─── grain overlay for premium finish ─────────────────────────────────
def add_grain(img: Image.Image, density: int = 4200) -> Image.Image:
    w, h = img.size
    grain = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grain)
    for _ in range(density):
        gd.point(
            (random.randint(0, w - 1), random.randint(0, h - 1)),
            fill=(255, 255, 255, random.randint(3, 10)),
        )
    for _ in range(density // 2):
        gd.point(
            (random.randint(0, w - 1), random.randint(0, h - 1)),
            fill=(0, 0, 0, random.randint(3, 10)),
        )
    return Image.alpha_composite(img, grain)


# ─── text helpers ────────────────────────────────────────────────────
def wrap(draw, text: str, font, max_width: int) -> list[str]:
    words, lines, cur = text.split(), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if draw.textlength(t, font=font) <= max_width:
            cur = t
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def draw_amass_mark(draw, x: int, y: int, size: int = 40, color=WHITE) -> None:
    dot_r = int(size * 0.18)
    draw.ellipse(
        [x, y + int(size * 0.25), x + dot_r * 2, y + int(size * 0.25) + dot_r * 2],
        fill=color,
    )
    font = _font(size, bold=True)
    draw.text((x + dot_r * 2 + 12, y - 4), "AMASS", font=font, fill=color)


def draw_chip(bg: Image.Image, text: str, x: int, y: int, red_bg: bool = True) -> tuple[int, int]:
    """Draws a pill chip. Returns (bottom-right x, y+height)."""
    draw = ImageDraw.Draw(bg, "RGBA")
    font = _font(30, bold=True)
    tw = draw.textlength(text, font=font)
    padx, pady = 24, 14
    box = (x, y, x + int(tw) + padx * 2, y + 32 + pady * 2)
    layer = Image.new("RGBA", bg.size, (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    if red_bg:
        ld.rounded_rectangle(box, radius=999, fill=(*RED, 255))
    else:
        ld.rounded_rectangle(box, radius=999, fill=(255, 255, 255, 40))
        ld.rounded_rectangle(box, radius=999, outline=(255, 255, 255, 170), width=3)
    bg.alpha_composite(layer)
    draw = ImageDraw.Draw(bg, "RGBA")
    draw.text((x + padx, y + pady - 4), text, font=font, fill=WHITE)
    return box[2], box[3]


# ─── PORTRAIT SCREENSHOT COMPOSER (1284 × 2778) ───────────────────────
def build_portrait(
    idx: int,
    shot: str,
    chip: str,
    headline: str,
    subline: str,
) -> str:
    W, H = PORTRAIT
    bg = bg_black((W, H))

    # brand accents
    add_red_glow(bg, W - 300, 380, 720, strength=0.24)
    add_red_glow(bg, 0, H - 200, 520, strength=0.16)
    add_accent_bar(bg, portrait=True)

    draw = ImageDraw.Draw(bg, "RGBA")

    # top: AMASS wordmark
    draw_amass_mark(draw, 90, 110, size=52, color=WHITE)

    # chip / eyebrow
    _, chip_bottom = draw_chip(bg, chip, 90, 230, red_bg=True)
    draw = ImageDraw.Draw(bg, "RGBA")

    # headline (2-3 lines, ~96pt)
    head_font = _font(104, bold=True)
    max_w = W - 220
    lines = wrap(draw, headline, head_font, max_w)
    y = chip_bottom + 40
    for ln in lines:
        # subtle red shadow tick under first line? just soft black shadow
        draw.text((94, y + 4), ln, font=head_font, fill=(0, 0, 0, 130))
        draw.text((90, y), ln, font=head_font, fill=WHITE)
        y += head_font.size + 8

    # subline (up to 2 lines, ~44pt)
    sub_font = _font(46, bold=False)
    sub_lines = wrap(draw, subline, sub_font, max_w)
    y += 20
    for ln in sub_lines:
        draw.text((90, y), ln, font=sub_font, fill=SOFT)
        y += sub_font.size + 6

    # red accent bar under text
    draw.rectangle([90, y + 24, 220, y + 32], fill=(*RED, 255))

    # phone screenshot at bottom
    if os.path.exists(shot):
        phone = framed_phone(shot, target_w=880, corner=62)
        # center horizontally, anchor near bottom with 60px safe margin
        px = (W - phone.width) // 2
        py = H - phone.height - 30
        bg.alpha_composite(phone, (px, py))

    # footer step indicator (subtle)
    draw = ImageDraw.Draw(bg, "RGBA")
    step_font = _font(24, bold=True)
    step_text = f"{idx:02d} / 10"
    tw = draw.textlength(step_text, font=step_font)
    draw.text((W - int(tw) - 90, H - 60), step_text, font=step_font, fill=(255, 255, 255, 120))

    bg = add_grain(bg, density=5200)

    out = os.path.join(OUT_PORTRAIT, f"screenshot-{idx:02d}.png")
    bg.convert("RGB").save(out, "PNG", optimize=True)
    return out


# ─── LANDSCAPE APP-PREVIEW COMPOSER (2778 × 1284) ─────────────────────
def build_landscape(
    idx: int,
    shots: list[str],
    chip: str,
    headline: str,
    subline: str,
) -> str:
    W, H = LANDSCAPE
    bg = bg_black((W, H))
    add_red_glow(bg, W - 400, H // 2, 900, strength=0.22)
    add_red_glow(bg, 300, 200, 600, strength=0.14)
    add_accent_bar(bg, portrait=False)

    draw = ImageDraw.Draw(bg, "RGBA")

    # left half — copy
    draw_amass_mark(draw, 120, 120, size=60, color=WHITE)

    _, cb = draw_chip(bg, chip, 120, 240, red_bg=True)
    draw = ImageDraw.Draw(bg, "RGBA")

    head_font = _font(120, bold=True)
    max_w = int(W * 0.48) - 120
    lines = wrap(draw, headline, head_font, max_w)
    y = cb + 60
    for ln in lines:
        draw.text((124, y + 5), ln, font=head_font, fill=(0, 0, 0, 130))
        draw.text((120, y), ln, font=head_font, fill=WHITE)
        y += head_font.size + 8

    sub_font = _font(48, bold=False)
    sub_lines = wrap(draw, subline, sub_font, max_w)
    y += 30
    for ln in sub_lines:
        draw.text((120, y), ln, font=sub_font, fill=SOFT)
        y += sub_font.size + 6

    draw.rectangle([120, y + 28, 260, y + 36], fill=(*RED, 255))

    # right half — up to 2 overlapping phones
    right_center_x = int(W * 0.74)
    if len(shots) >= 1 and os.path.exists(shots[0]):
        phone1 = framed_phone(shots[0], target_w=520, corner=48)
        # rotate slightly for dynamic feel
        phone1 = phone1.rotate(-6, resample=Image.BICUBIC, expand=True)
        px1 = right_center_x - phone1.width // 2 - 220
        py1 = (H - phone1.height) // 2
        bg.alpha_composite(phone1, (px1, py1))

    if len(shots) >= 2 and os.path.exists(shots[1]):
        phone2 = framed_phone(shots[1], target_w=520, corner=48)
        phone2 = phone2.rotate(4, resample=Image.BICUBIC, expand=True)
        px2 = right_center_x - phone2.width // 2 + 220
        py2 = (H - phone2.height) // 2 + 40
        bg.alpha_composite(phone2, (px2, py2))

    # footer wordmark bottom-right
    draw = ImageDraw.Draw(bg, "RGBA")
    step_font = _font(28, bold=True)
    step_text = f"PREVIEW {idx:02d}"
    tw = draw.textlength(step_text, font=step_font)
    draw.text(
        (W - int(tw) - 120, H - 80),
        step_text,
        font=step_font,
        fill=(255, 255, 255, 130),
    )

    bg = add_grain(bg, density=6800)

    out = os.path.join(OUT_LANDSCAPE, f"preview-{idx:02d}.png")
    bg.convert("RGB").save(out, "PNG", optimize=True)
    return out


# ─── screenshot spec (10 shots covering every requested feature) ─────
SCREENSHOTS = [
    dict(
        shot=f"{SHOTS}/B_map.png",
        chip="01 · DISCOVER",
        headline="Every property. One map.",
        subline="Live property discovery across Lagos, Abuja, Nairobi and beyond.",
    ),
    dict(
        shot=f"{SHOTS}/01_onboard_a.png",
        chip="02 · LISTING GALLERY",
        headline="Every angle. Every detail.",
        subline="Immersive galleries, floor plans and 360° tours of every listing.",
    ),
    dict(
        shot=f"{SHOTS}/C_discover.png",
        chip="03 · PROPERTY PASSPORT",
        headline="Verified. Titled. Trusted.",
        subline="Live neighborhood scores, market intel and title verification on every home.",
    ),
    dict(
        shot=f"{SHOTS}/I_agent_workspace.png",
        chip="04 · AGENTS & DEVELOPERS",
        headline="Meet vetted pros.",
        subline="Direct-connect with verified agents, developers and property managers.",
    ),
    dict(
        shot=f"{SHOTS}/D_marketplace.png",
        chip="05 · MARKETPLACE",
        headline="Homes, cars, gear — one wallet.",
        subline="Vehicles, appliances, electronics & building materials from verified stores.",
    ),
    dict(
        shot=f"{SHOTS}/L_buy_tokens.png",
        chip="06 · PAY FLEXIBLY",
        headline="Own now. Pay smart.",
        subline="BNPL, installments, tokens & subscriptions — pick what fits your cashflow.",
    ),
    dict(
        shot=f"{SHOTS}/P_notifications.png",
        chip="07 · INSPECT & VISIT",
        headline="Book inspections. GPS-verified.",
        subline="Schedule visits, get directions and confirm on-site with geolocation.",
    ),
    dict(
        shot=f"{SHOTS}/K_inbox.png",
        chip="08 · YOUR DASHBOARD",
        headline="Enquiries, saved, deals — sorted.",
        subline="Track messages, saved homes, offers and closings from one command center.",
    ),
    dict(
        shot=f"{SHOTS}/Q_settings.png",
        chip="09 · SECURE ONBOARDING",
        headline="Bank-grade sign-in.",
        subline="Biometrics, encrypted vault, KYC verification — all in under 60 seconds.",
    ),
    dict(
        shot=f"{SHOTS}/H_wallet.png",
        chip="10 · AFRICA'S PROPERTY OS",
        headline="Modern ownership. Built for Africa.",
        subline="MASS tokens, FIXA services, verified deals — the future of proptech is here.",
    ),
]

# ─── app-preview spec (3 landscape hero previews) ─────────────────────
PREVIEWS = [
    dict(
        shots=[f"{SHOTS}/B_map.png", f"{SHOTS}/C_discover.png"],
        chip="AMASS · AFRICA'S PROPERTY OS",
        headline="Discover. Verify. Own.",
        subline="Every property, every neighborhood, every deal — on one map, in one app.",
    ),
    dict(
        shots=[f"{SHOTS}/D_marketplace.png", f"{SHOTS}/L_buy_tokens.png"],
        chip="MARKETPLACE + BNPL",
        headline="Everything you need for African living.",
        subline="Homes, cars, appliances & building gear with flexible pay-later options.",
    ),
    dict(
        shots=[f"{SHOTS}/H_wallet.png", f"{SHOTS}/I_agent_workspace.png"],
        chip="FOR BUYERS · AGENTS · DEVELOPERS",
        headline="One platform. Every player.",
        subline="Tokenised ownership, verified agents, developer listings — end to end.",
    ),
]


def main() -> None:
    print("=== PORTRAIT SCREENSHOTS ===")
    for i, s in enumerate(SCREENSHOTS, start=1):
        out = build_portrait(i, s["shot"], s["chip"], s["headline"], s["subline"])
        print(f"  [{i:02d}/10] {out}  ({os.path.getsize(out)/1024:.1f} KB)")

    print("\n=== LANDSCAPE APP PREVIEWS ===")
    for i, p in enumerate(PREVIEWS, start=1):
        out = build_landscape(i, p["shots"], p["chip"], p["headline"], p["subline"])
        print(f"  [{i:02d}/03] {out}  ({os.path.getsize(out)/1024:.1f} KB)")


if __name__ == "__main__":
    main()
