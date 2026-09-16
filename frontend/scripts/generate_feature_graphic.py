"""
AMASS Play Store Feature Graphic generator.

Output: 1024x500 PNG, brand-styled, PIL-only (no AI).
Design: rose-gradient background, wordmark + tagline on the left,
stylized map/property art on the right.

Run:  python3 scripts/generate_feature_graphic.py
"""
from __future__ import annotations

import math
import os
import random

from PIL import Image, ImageDraw, ImageFilter, ImageFont

# ─── canvas ────────────────────────────────────────────────────────────
W, H = 1024, 500
OUT = os.path.join(
    os.path.dirname(__file__), "..", "assets", "images", "playstore-feature-graphic.png"
)
OUT = os.path.normpath(OUT)

# ─── brand palette (locked to /app/frontend/app.json splash + theme) ───
ROSE_DEEP = (159, 18, 57)      # #9F1239  – bottom-right anchor
ROSE_CORE = (225, 29, 72)      # #E11D48  – main brand
ROSE_WARM = (244, 63, 94)      # #F43F5E  – highlight
INK = (28, 8, 16)              # near-black w/ magenta bias
WHITE = (255, 255, 255)
CHIP_BG = (255, 255, 255, 38)  # translucent chip
LINE = (255, 255, 255, 55)     # thin dividers


# ─── font resolver ────────────────────────────────────────────────────
def _font(size: int, bold: bool = True) -> ImageFont.FreeTypeFont:
    for path in (
        "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf"
        if bold
        else "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"
        if bold
        else "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ):
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


# ─── gradient helper (diagonal, top-left → bottom-right) ──────────────
def diagonal_gradient(
    size: tuple[int, int],
    top_left: tuple[int, int, int],
    bottom_right: tuple[int, int, int],
    mid: tuple[int, int, int] | None = None,
) -> Image.Image:
    w, h = size
    grad = Image.new("RGB", (w, h), top_left)
    px = grad.load()
    diag = math.hypot(w, h)
    for y in range(h):
        for x in range(w):
            # 0.0 at top-left, 1.0 at bottom-right
            t = (x + y) / (w + h - 2)
            if mid and t < 0.55:
                # blend top_left → mid on first half
                k = t / 0.55
                r = int(top_left[0] * (1 - k) + mid[0] * k)
                g = int(top_left[1] * (1 - k) + mid[1] * k)
                b = int(top_left[2] * (1 - k) + mid[2] * k)
            elif mid:
                k = (t - 0.55) / 0.45
                r = int(mid[0] * (1 - k) + bottom_right[0] * k)
                g = int(mid[1] * (1 - k) + bottom_right[1] * k)
                b = int(mid[2] * (1 - k) + bottom_right[2] * k)
            else:
                r = int(top_left[0] * (1 - t) + bottom_right[0] * t)
                g = int(top_left[1] * (1 - t) + bottom_right[1] * t)
                b = int(top_left[2] * (1 - t) + bottom_right[2] * t)
            px[x, y] = (r, g, b)
    return grad


# ─── soft glow blob (elliptical radial highlight) ─────────────────────
def add_glow(
    img: Image.Image,
    center: tuple[int, int],
    radius: int,
    color: tuple[int, int, int],
    strength: float = 0.35,
) -> None:
    glow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(glow)
    cx, cy = center
    d.ellipse(
        [cx - radius, cy - radius, cx + radius, cy + radius],
        fill=(*color, int(255 * strength)),
    )
    glow = glow.filter(ImageFilter.GaussianBlur(radius=radius // 2))
    img.alpha_composite(glow)


# ─── main compose ─────────────────────────────────────────────────────
def build() -> None:
    # Background — diagonal rose gradient
    bg = diagonal_gradient((W, H), ROSE_WARM, ROSE_DEEP, mid=ROSE_CORE).convert("RGBA")

    # Twin glow highlights for depth
    add_glow(bg, (170, 90), 360, (255, 190, 205), strength=0.28)
    add_glow(bg, (900, 470), 320, (110, 5, 40), strength=0.30)

    # ── Right-side art: abstract map lattice + property pins ─────────
    art = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ad = ImageDraw.Draw(art)

    # subtle grid (map-plate feel) in the right 45% of canvas
    grid_area = (int(W * 0.55), 0, W, H)
    step = 40
    for x in range(grid_area[0], grid_area[2] + 1, step):
        ad.line([(x, 0), (x, H)], fill=(255, 255, 255, 22), width=1)
    for y in range(0, H + 1, step):
        ad.line([(grid_area[0], y), (W, y)], fill=(255, 255, 255, 22), width=1)

    # Curved "route" line snaking through the map area
    route_points = [
        (600, 380),
        (660, 300),
        (740, 340),
        (820, 240),
        (900, 300),
        (970, 200),
    ]
    ad.line(route_points, fill=(255, 255, 255, 130), width=3, joint="curve")
    for x, y in route_points[::2]:
        ad.ellipse([x - 4, y - 4, x + 4, y + 4], fill=(255, 255, 255, 220))

    # Property markers (Redfin-style teardrop pins in white with rose dot)
    pins = [
        (640, 130, 46),   # x, y, size
        (760, 200, 62),   # bigger, closer feel
        (880, 100, 40),
        (940, 320, 52),
        (680, 400, 44),
    ]

    def draw_pin(cx: int, cy: int, s: int) -> None:
        # teardrop shape: circle on top + downward triangle
        r = s // 2
        # shadow
        shadow = Image.new("RGBA", (s + 24, s + 40), (0, 0, 0, 0))
        sd = ImageDraw.Draw(shadow)
        sd.ellipse([12, s - 4, s + 12, s + 8], fill=(0, 0, 0, 90))
        shadow = shadow.filter(ImageFilter.GaussianBlur(6))
        art.alpha_composite(shadow, (cx - r - 12, cy - r + 8))
        # pin body
        ad.ellipse([cx - r, cy - r, cx + r, cy + r], fill=WHITE)
        ad.polygon(
            [
                (cx - r * 0.5, cy + r * 0.4),
                (cx + r * 0.5, cy + r * 0.4),
                (cx, cy + r * 1.4),
            ],
            fill=WHITE,
        )
        # rose dot inside
        dot = int(r * 0.42)
        ad.ellipse(
            [cx - dot, cy - dot, cx + dot, cy + dot], fill=ROSE_CORE
        )

    for x, y, s in pins:
        draw_pin(x, y, s)

    # composite art onto bg
    bg = Image.alpha_composite(bg, art)

    # ── Left-side content: badge, wordmark, tagline ───────────────────
    draw = ImageDraw.Draw(bg, "RGBA")

    # Small pill/chip on top with "AFRICA'S PROPERTY OS"
    chip_text = "AFRICA'S PROPERTY OS"
    chip_font = _font(18)
    chip_w = draw.textlength(chip_text, font=chip_font)
    chip_padx, chip_pady = 18, 10
    chip_x, chip_y = 60, 84
    chip_box = (
        chip_x,
        chip_y,
        chip_x + int(chip_w) + chip_padx * 2,
        chip_y + 18 + chip_pady * 2,
    )
    # translucent chip w/ white outline
    chip_layer = Image.new("RGBA", bg.size, (0, 0, 0, 0))
    cd = ImageDraw.Draw(chip_layer)
    cd.rounded_rectangle(chip_box, radius=999, fill=(255, 255, 255, 42))
    cd.rounded_rectangle(chip_box, radius=999, outline=(255, 255, 255, 150), width=2)
    bg = Image.alpha_composite(bg, chip_layer)
    draw = ImageDraw.Draw(bg, "RGBA")
    draw.text(
        (chip_x + chip_padx, chip_y + chip_pady - 2),
        chip_text,
        font=chip_font,
        fill=WHITE,
    )

    # Wordmark "AMASS" — huge, bold, tight letter-spacing
    wm_font = _font(180)
    wm_text = "AMASS"
    # Draw wordmark twice: soft drop-shadow then main
    draw.text((66, 138), wm_text, font=wm_font, fill=(0, 0, 0, 55))
    draw.text((60, 130), wm_text, font=wm_font, fill=WHITE)

    # Tagline underneath
    tag_font = _font(34)
    tag = "Discover. Verify. Own — the smart way."
    draw.text((64, 336), tag, font=tag_font, fill=(255, 255, 255, 235))

    # Sub-tag with brand promise
    sub_font = _font(20, bold=False)
    sub = "Property discovery, verified passports & AI valuations across Africa."
    draw.text((64, 386), sub, font=sub_font, fill=(255, 255, 255, 190))

    # Thin accent bar next to sub-tag
    draw.rectangle([64, 430, 120, 434], fill=(255, 255, 255, 230))

    # Corner "MADE FOR PROPERTY PROS" watermark bottom-right
    corner_font = _font(14, bold=True)
    corner = "MADE FOR PROPERTY PROS"
    cw = draw.textlength(corner, font=corner_font)
    draw.text(
        (W - int(cw) - 32, H - 30),
        corner,
        font=corner_font,
        fill=(255, 255, 255, 140),
    )

    # ── grain overlay for premium finish ─────────────────────────────
    random.seed(42)
    grain = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grain)
    for _ in range(1400):
        x = random.randint(0, W - 1)
        y = random.randint(0, H - 1)
        gd.point((x, y), fill=(255, 255, 255, random.randint(4, 18)))
    for _ in range(700):
        x = random.randint(0, W - 1)
        y = random.randint(0, H - 1)
        gd.point((x, y), fill=(0, 0, 0, random.randint(4, 18)))
    bg = Image.alpha_composite(bg, grain)

    # save PNG (Play Store accepts PNG up to 15 MB)
    bg.convert("RGB").save(OUT, "PNG", optimize=True)
    print(f"Wrote: {OUT}  ({os.path.getsize(OUT)/1024:.1f} KB, size {bg.size})")


if __name__ == "__main__":
    build()
