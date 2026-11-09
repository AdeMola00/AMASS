"""
Shared toolkit for the AMASS store-listing generators (App Store + Google Play + feature graphic).

  • brand: fonts (Plus Jakarta Sans / DM Serif Display — the app's own), the glossy-pin lockup (light & dark)
  • raw phone captures from assets/images/store-raw/ (scripts/capture_store_screens.py, 1170 × 2532 @3×)
  • status bars + device frames for both platforms (iPhone w/ Dynamic Island · Android w/ punch-hole)
  • the Find Home map: synthesised vector Lagos + app-styled price pins under the real, alpha-recovered chrome
  • canvases (ivory / jet / open-sky), copy helpers, the portrait + landscape slide builders

Used by generate_appstore_ios.py, generate_playstore_v2.py and generate_feature_graphic.py.
"""
from __future__ import annotations

import math
import os
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

random.seed(7)

HERE = os.path.dirname(os.path.abspath(__file__))
IMG = os.path.normpath(os.path.join(HERE, "..", "assets", "images"))
RAW = os.path.join(IMG, "store-raw")
FONTS = os.path.normpath(os.path.join(HERE, "..", "assets", "fonts"))

PORTRAIT = (1284, 2778)
LANDSCAPE = (2778, 1284)
SCREEN_W, SCREEN_H = 1170, 2532  # raw capture size (390 × 844 @3×)

# ─── palette (mirrors src/theme/tokens.ts) ────────────────────────────
RED = (240, 38, 46)            # brand #F0262E
RED_DEEP = (184, 21, 26)       # #B8151A
INK = (17, 17, 17)
GRAPHITE = (31, 41, 55)
IVORY = (247, 247, 248)
WHITE = (255, 255, 255)
MUTED_DARK = (82, 82, 91)      # subline on light
MUTED_LIGHT = (200, 200, 206)  # subline on dark
SKY_TOP = (0x93, 0xD4, 0xEF)
SKY_BLEND = (0xCB, 0xE6, 0xEB)
SKY_HORIZON = (0xF2, 0xEA, 0xDE)
SKY_INK = (0x24, 0x3B, 0x4A)
KIND = {"sale": (31, 157, 85), "rent": (225, 27, 34), "lease": (37, 99, 235), "shortlet": (212, 175, 55)}
MASS_GOLD = (217, 181, 71)


def font(size: int, weight: int | str = 800) -> ImageFont.FreeTypeFont:
    name = "DMSerifDisplay-Regular.ttf" if weight == "serif" else f"PlusJakartaSans-{weight}.ttf"
    return ImageFont.truetype(os.path.join(FONTS, name), size)


def _luma(c) -> float:
    return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]


# ══════════════════════════════════════════════════════════════════════
#  Brand lockup — the supplied glossy artwork, never redrawn
# ══════════════════════════════════════════════════════════════════════
_EMBLEM = Image.open(os.path.join(IMG, "amass-emblem-glossy.png")).convert("RGBA")
_WORDMARK = Image.open(os.path.join(IMG, "amass-wordmark.png")).convert("RGBA")
_LOCKUP = Image.open(os.path.join(IMG, "amass-lockup.png")).convert("RGBA")


def to_light_ink(img: Image.Image) -> Image.Image:
    """Dark-canvas variant: every non-red mark (roof, chimney, door, wordmark) becomes white; the glossy pin stays."""
    a = np.asarray(img).astype(int)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    red = (r > 90) & (r > g * 1.6) & (r > b * 1.6)
    out = a.copy()
    out[~red, 0:3] = 255
    return Image.fromarray(out.astype(np.uint8), "RGBA")


def lockup_horizontal(height: int, dark: bool = False) -> Image.Image:
    """Emblem + wordmark side by side; `height` is the emblem height."""
    em = _EMBLEM.resize((round(height * _EMBLEM.width / _EMBLEM.height), height), Image.LANCZOS)
    wh = round(height * 0.40)
    wm = _WORDMARK.resize((round(wh * _WORDMARK.width / _WORDMARK.height), wh), Image.LANCZOS)
    gap = round(height * 0.22)
    out = Image.new("RGBA", (em.width + gap + wm.width, height), (0, 0, 0, 0))
    out.alpha_composite(em, (0, 0))
    out.alpha_composite(wm, (em.width + gap, round(height * 0.72) - wh))
    return to_light_ink(out) if dark else out


def lockup_stacked(height: int, dark: bool = False) -> Image.Image:
    """The master lockup (pin + house over AMASS); `height` is the full lockup height."""
    lk = _LOCKUP.resize((round(height * _LOCKUP.width / _LOCKUP.height), height), Image.LANCZOS)
    return to_light_ink(lk) if dark else lk


# ══════════════════════════════════════════════════════════════════════
#  Status bars
# ══════════════════════════════════════════════════════════════════════
STATUS_H = {"ios": 141, "android": 120}


def _top_color(shot: Image.Image) -> tuple[int, int, int]:
    row = shot.crop((0, 0, shot.width, 6)).convert("RGB")
    px = sorted(row.getdata(), key=_luma)
    return px[len(px) // 2]


def _status_icons(d: ImageDraw.ImageDraw, right: int, cy: int, fg) -> None:
    """signal · wifi · battery, right-aligned at `right`, vertically centred on `cy`."""
    bw, bh = 82, 40
    bx, by = right - bw, cy - bh // 2
    d.rounded_rectangle([bx, by, bx + bw, by + bh], radius=12, outline=fg, width=4)
    d.rounded_rectangle([bx + 6, by + 6, bx + bw - 6, by + bh - 6], radius=7, fill=fg)
    d.rounded_rectangle([bx + bw + 4, by + 13, bx + bw + 10, by + bh - 13], radius=3, fill=fg)
    cx = bx - 62
    for r in (40, 26, 12):
        d.arc([cx - r, cy + 16 - r, cx + r, cy + 16 + r], start=225, end=315, fill=fg, width=7)
    d.ellipse([cx - 6, cy + 10, cx + 6, cy + 22], fill=fg)
    sx = cx - 130
    for i, h in enumerate((14, 22, 30, 38)):
        d.rounded_rectangle([sx + i * 18, by + bh - h, sx + i * 18 + 12, by + bh], radius=3, fill=fg)


def with_status_bar(shot: Image.Image, platform: str = "ios", bg: tuple[int, int, int] | None = None) -> Image.Image:
    """1170×2532 capture → full display with the platform's status bar on top."""
    shot = shot.convert("RGB")
    if shot.size != (SCREEN_W, SCREEN_H):
        shot = shot.resize((SCREEN_W, SCREEN_H), Image.LANCZOS)
    sh = STATUS_H[platform]
    bgc = bg or _top_color(shot)
    canvas = Image.new("RGB", (SCREEN_W, SCREEN_H + sh), bgc)
    canvas.paste(shot, (0, sh))
    d = ImageDraw.Draw(canvas)
    fg = WHITE if _luma(bgc) < 140 else INK
    tf = font(50, 700)
    if platform == "ios":
        iw, ih = 378, 111  # Dynamic Island
        d.rounded_rectangle([(SCREEN_W - iw) // 2, 33, (SCREEN_W + iw) // 2, 33 + ih], radius=ih // 2, fill=(0, 0, 0))
        d.text((112, 52), "9:41", font=tf, fill=fg)
        _status_icons(d, SCREEN_W - 112, 80, fg)
    else:
        d.ellipse([SCREEN_W // 2 - 33, 27, SCREEN_W // 2 + 33, 93], fill=(0, 0, 0))  # punch-hole camera
        d.text((72, 34), "9:41", font=tf, fill=fg)
        _status_icons(d, SCREEN_W - 72, 60, fg)
    return canvas


# ══════════════════════════════════════════════════════════════════════
#  Device frames
# ══════════════════════════════════════════════════════════════════════
def device_frame(screen: Image.Image, target_w: int, platform: str = "ios", shadow: bool = True) -> Image.Image:
    """Wrap a full-display screen in a phone body (RGBA, soft drop shadow), scaled so the OUTER body is `target_w` wide."""
    full_h = SCREEN_H + STATUS_H[platform]
    if platform == "ios":
        B, R_OUT, R_IN = 44, 212, 168
        body_c, edge_c = (22, 22, 24, 255), (120, 120, 126, 255)
    else:
        B, R_OUT, R_IN = 30, 176, 148
        body_c, edge_c = (16, 16, 18, 255), (92, 92, 98, 255)
    W, H = SCREEN_W + 2 * B, full_h + 2 * B
    body = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(body)
    d.rounded_rectangle([0, 0, W, H], radius=R_OUT, fill=body_c)
    sheen = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sheen)
    for y in range(H):
        sd.line([(0, y), (W, y)], fill=(255, 255, 255, int(70 * (1 - abs(y / H - 0.5) * 2))))
    mask = Image.new("L", (W, H), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, W, H], radius=R_OUT, fill=255)
    sheen_m = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sheen_m.paste(sheen, (0, 0), mask)
    body.alpha_composite(sheen_m)
    d = ImageDraw.Draw(body)
    d.rounded_rectangle([2, 2, W - 2, H - 2], radius=R_OUT, outline=edge_c, width=5)
    d.rounded_rectangle([8, 8, W - 8, H - 8], radius=R_OUT - 6, outline=(0, 0, 0, 255), width=3)

    pad = 14
    full = Image.new("RGBA", (W + pad * 2, H), (0, 0, 0, 0))
    fd = ImageDraw.Draw(full)
    btn = (70, 70, 75, 255)
    if platform == "ios":
        fd.rounded_rectangle([0, 520, pad + 2, 620], radius=6, fill=btn)
        fd.rounded_rectangle([0, 700, pad + 2, 900], radius=6, fill=btn)
        fd.rounded_rectangle([0, 940, pad + 2, 1140], radius=6, fill=btn)
        fd.rounded_rectangle([W + pad - 2, 760, W + pad * 2, 1080], radius=6, fill=btn)
    else:
        fd.rounded_rectangle([W + pad - 2, 560, W + pad * 2, 860], radius=6, fill=btn)   # volume
        fd.rounded_rectangle([W + pad - 2, 920, W + pad * 2, 1080], radius=6, fill=btn)  # power
    full.alpha_composite(body, (pad, 0))

    scr = screen.convert("RGB").resize((SCREEN_W, full_h), Image.LANCZOS)
    smask = Image.new("L", scr.size, 0)
    ImageDraw.Draw(smask).rounded_rectangle([0, 0, SCREEN_W, full_h], radius=R_IN, fill=255)
    scr_rgba = Image.new("RGBA", scr.size, (0, 0, 0, 0))
    scr_rgba.paste(scr, (0, 0), smask)
    full.alpha_composite(scr_rgba, (pad + B, B))

    scale = target_w / W
    full = full.resize((int(full.width * scale), int(full.height * scale)), Image.LANCZOS)
    if not shadow:
        return full
    spad = int(120 * scale) + 60
    canvas = Image.new("RGBA", (full.width + spad * 2, full.height + spad * 2), (0, 0, 0, 0))
    sh = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle([spad + 12, spad + 48, spad + full.width - 12, spad + full.height + 48], radius=int(R_OUT * scale), fill=(0, 0, 0, 200))
    canvas.alpha_composite(sh.filter(ImageFilter.GaussianBlur(56)))
    canvas.alpha_composite(full, (spad, spad))
    return canvas


# ══════════════════════════════════════════════════════════════════════
#  Find Home — synthesised Lagos map under the real chrome
# ══════════════════════════════════════════════════════════════════════
def alpha_from_pair(white_path: str, black_path: str) -> Image.Image:
    """Exact alpha recovery from the same frame captured over white and over black."""
    w = np.asarray(Image.open(white_path).convert("RGB")).astype(float)
    b = np.asarray(Image.open(black_path).convert("RGB")).astype(float)
    alpha = np.clip(1 - (w - b).mean(axis=2) / 255.0, 0, 1)
    rgb = np.where(alpha[..., None] > 0.004, b / np.maximum(alpha[..., None], 0.004), 0)
    out = np.dstack([np.clip(rgb, 0, 255), alpha * 255]).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def vector_map(w: int, h: int) -> Image.Image:
    LAND, WATER, WATER_DEEP, PARK = (241, 239, 233), (190, 219, 240), (170, 205, 232), (212, 230, 200)
    ROAD, ROAD_CASE, MAJOR, MAJOR_CASE, BUILDING = (255, 255, 255), (218, 214, 206), (255, 246, 214), (228, 214, 170), (231, 229, 222)
    LABEL, WATER_LABEL = (120, 120, 128), (90, 130, 165)
    m = Image.new("RGB", (w, h), LAND)
    d = ImageDraw.Draw(m)
    lagoon = [(w * 0.62, -40), (w + 60, -40), (w + 60, h * 0.34), (w * 0.86, h * 0.30), (w * 0.74, h * 0.24), (w * 0.66, h * 0.16), (w * 0.60, h * 0.06)]
    creek = [(-40, h * 0.42), (w * 0.18, h * 0.40), (w * 0.36, h * 0.44), (w * 0.52, h * 0.43), (w * 0.70, h * 0.40), (w * 0.86, h * 0.33), (w + 60, h * 0.34),
             (w + 60, h * 0.39), (w * 0.86, h * 0.385), (w * 0.70, h * 0.455), (w * 0.52, h * 0.485), (w * 0.36, h * 0.495), (w * 0.18, h * 0.455), (-40, h * 0.475)]
    atlantic = [(-40, h * 0.86), (w * 0.2, h * 0.845), (w * 0.45, h * 0.86), (w * 0.7, h * 0.85), (w + 60, h * 0.865), (w + 60, h + 40), (-40, h + 40)]
    d.polygon(lagoon, fill=WATER)
    d.polygon(creek, fill=WATER)
    d.polygon(atlantic, fill=WATER_DEEP)
    d.polygon([(-40, h * 0.845), (w * 0.2, h * 0.83), (w * 0.45, h * 0.845), (w * 0.7, h * 0.835), (w + 60, h * 0.85), (w + 60, h * 0.865), (w * 0.7, h * 0.85),
               (w * 0.45, h * 0.86), (w * 0.2, h * 0.845), (-40, h * 0.86)], fill=(236, 226, 196))
    for cx, cy, rx, ry in [(w * 0.22, h * 0.60, 110, 70), (w * 0.78, h * 0.62, 90, 60), (w * 0.40, h * 0.74, 120, 55), (w * 0.14, h * 0.25, 80, 60), (w * 0.58, h * 0.57, 70, 50)]:
        d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=PARK)
    big = int(math.hypot(w, h)) + 400
    roads = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    rd = ImageDraw.Draw(roads)
    step = 150
    for pass_ in ("case", "road"):
        for i in range(0, big, step):
            major = (i // step) % 4 == 0
            width = ((40, 28) if major else (20, 12))[0 if pass_ == "case" else 1]
            colour = ((MAJOR_CASE, MAJOR) if major else (ROAD_CASE, ROAD))[0 if pass_ == "case" else 1]
            rd.line([(i, 0), (i, big)], fill=colour, width=width)
            rd.line([(0, i), (big, i)], fill=colour, width=width)
    for gx in range(0, big, step):
        for gy in range(0, big, step):
            if random.random() < 0.55:
                for _ in range(random.randint(1, 3)):
                    bw_, bh_ = random.randint(26, 60), random.randint(26, 60)
                    bx, by = gx + random.randint(28, step - 28 - bw_), gy + random.randint(28, step - 28 - bh_)
                    rd.rectangle([bx, by, bx + bw_, by + bh_], fill=BUILDING)
    roads = roads.rotate(-14, resample=Image.BICUBIC)
    ox, oy = (big - w) // 2, (big - h) // 2
    roads = roads.crop((ox, oy, ox + w, oy + h))
    land_mask = Image.new("L", (w, h), 255)
    lm = ImageDraw.Draw(land_mask)
    for poly in (lagoon, creek, atlantic):
        lm.polygon(poly, fill=0)
    roads_rgb = Image.new("RGB", (w, h), LAND)
    roads_rgb.paste(roads, (0, 0), roads)
    m.paste(roads_rgb, (0, 0), land_mask)
    d = ImageDraw.Draw(m)
    pts = [(-40, h * 0.56), (w * 0.2, h * 0.545), (w * 0.45, h * 0.555), (w * 0.7, h * 0.54), (w + 60, h * 0.55)]
    d.line(pts, fill=MAJOR_CASE, width=52, joint="curve")
    d.line(pts, fill=MAJOR, width=38, joint="curve")
    d.line([(w * 0.47, h * 0.36), (w * 0.60, h * 0.52)], fill=(210, 200, 190), width=30)
    d.line([(w * 0.47, h * 0.36), (w * 0.60, h * 0.52)], fill=(252, 250, 244), width=18)
    lf, sf, wf = font(30, 700), font(26, 500), font(30, "serif")
    for t, x, y in [("IKOYI", w * 0.10, h * 0.30), ("VICTORIA ISLAND", w * 0.12, h * 0.655), ("LEKKI PHASE 1", w * 0.56, h * 0.63), ("BANANA ISLAND", w * 0.70, h * 0.12), ("ONIRU", w * 0.40, h * 0.78)]:
        d.text((x + 1, y + 1), t, font=lf, fill=WHITE)
        d.text((x, y), t, font=lf, fill=LABEL)
    d.text((w * 0.72, h * 0.22), "Lagos Lagoon", font=wf, fill=WATER_LABEL)
    d.text((w * 0.30, h * 0.455), "Five Cowrie Creek", font=font(26, "serif"), fill=WATER_LABEL)
    d.text((w * 0.40, h * 0.92), "Atlantic Ocean", font=wf, fill=(70, 110, 150))
    d.text((w * 0.62, h * 0.575), "Lekki–Epe Expressway", font=sf, fill=(150, 130, 90))
    return m


def price_pin(d: ImageDraw.ImageDraw, x: int, y: int, label: str, kind: str = "sale", selected: bool = False, unlocked: bool = False) -> None:
    """The app's PricePin at 3×: 34 pt pill, 1.5 pt white border, 7 pt caret; anchor = bottom-centre."""
    tint = KIND[kind]
    bg, border = (INK, WHITE) if selected else (tint, MASS_GOLD if unlocked else WHITE)
    f = font(44, 800)
    tw = d.textlength(label, font=f)
    ph = 102
    pw = int(tw) + 2 * 33 + (40 if unlocked else 0)
    x0, y0 = x - pw // 2, y - 21 - ph
    d.rounded_rectangle([x0 + 2, y0 + 9, x0 + pw + 2, y0 + ph + 9], radius=ph // 2, fill=(0, 0, 0, 55))
    d.rounded_rectangle([x0, y0, x0 + pw, y0 + ph], radius=ph // 2, fill=bg, outline=border, width=5)
    d.polygon([(x - 21, y0 + ph - 3), (x + 21, y0 + ph - 3), (x, y)], fill=bg)
    tx = x0 + 33
    if unlocked:
        cx, cy = tx + 14, y0 + ph // 2
        d.rounded_rectangle([cx - 11, cy - 2, cx + 11, cy + 14], radius=4, fill=MASS_GOLD)
        d.arc([cx - 8, cy - 16, cx + 8, cy + 2], start=180, end=360, fill=MASS_GOLD, width=5)
        tx += 40
    d.text((tx, y0 + (ph - 44) // 2 - 6), label, font=f, fill=WHITE)


def cluster(d: ImageDraw.ImageDraw, x: int, y: int, n: int) -> None:
    r = (58 if n >= 100 else 52 if n >= 10 else 46) * 3 // 2
    d.ellipse([x - r + 2, y - r + 9, x + r + 2, y + r + 9], fill=(0, 0, 0, 50))
    d.ellipse([x - r, y - r, x + r, y + r], fill=RED, outline=WHITE, width=6)
    f = font(46, 800)
    tw = d.textlength(str(n), font=f)
    d.text((x - tw / 2, y - 30), str(n), font=f, fill=WHITE)


def build_map_screen() -> Image.Image:
    """Vector Lagos + a busy, app-styled pin field under the real Find Home chrome → 1170×2532 RGB."""
    base = vector_map(SCREEN_W, SCREEN_H).convert("RGBA")
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer, "RGBA")
    # free area: below the segment bar (y≈400), left of the FAB column (x<960 for y<1150), above the tab bar (y<2080)
    pins = [
        (250, 560, "₦185M", "sale", {}),
        (640, 520, "₦4.5M/yr", "rent", {}),
        (420, 760, "₦320M", "sale", dict(selected=True)),
        (170, 920, "₦95M", "sale", {}),
        (760, 880, "₦180k/night", "shortlet", {}),
        (330, 1140, "₦2.8M/yr", "rent", {}),
        (980, 1300, "₦65M/yr", "lease", {}),
        (600, 1320, "₦250M", "sale", dict(unlocked=True)),
        (210, 1480, "₦1.2B", "sale", {}),
        (840, 1560, "₦38M", "sale", {}),
        (470, 1720, "₦9M/yr", "rent", {}),
        (1000, 1820, "₦560M", "sale", {}),
        (150, 1920, "₦120M", "sale", {}),
        (680, 1960, "₦6.5M/yr", "lease", {}),
    ]
    for x, y, lbl, kind, kw in pins:
        price_pin(d, x, y, lbl, kind, **kw)
    cluster(d, 900, 1120, 12)
    cluster(d, 380, 1900, 7)
    cluster(d, 560, 1050, 3)
    base.alpha_composite(layer)
    chrome = alpha_from_pair(os.path.join(RAW, "map_white.png"), os.path.join(RAW, "map_black.png"))
    base.alpha_composite(chrome)
    return base.convert("RGB")


# ══════════════════════════════════════════════════════════════════════
#  Canvases + copy helpers
# ══════════════════════════════════════════════════════════════════════
def vgradient(size, stops: list[tuple[float, tuple[int, int, int]]]) -> Image.Image:
    """Vertical multi-stop gradient (stops as (position 0..1, colour))."""
    w, h = size
    ys = np.linspace(0, 1, h)
    pos = [p for p, _ in stops]
    cols = np.array([c for _, c in stops], dtype=float)
    rows = np.stack([np.interp(ys, pos, cols[:, i]) for i in range(3)], axis=1)
    arr = np.repeat(rows[:, None, :], w, axis=1).astype(np.uint8)
    return Image.fromarray(arr, "RGB")


def canvas_bg(size, theme: str) -> Image.Image:
    """'light' ivory → white · 'dark' graphite → jet · 'sky' the intro's open sky."""
    w, h = size
    if theme == "sky":
        return vgradient(size, [(0, SKY_TOP), (0.62, SKY_BLEND), (1, SKY_HORIZON)]).convert("RGBA")
    a, b = (IVORY, WHITE) if theme == "light" else (GRAPHITE, INK)
    img = vgradient(size, [(0, a), (0.65, b), (1, b)]).convert("RGBA")
    glow = Image.new("RGBA", size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    strength = 0.14 if theme == "light" else 0.26
    r1 = int(min(w, h) * 0.6)
    gd.ellipse([w - r1 // 2 - 200, -r1 // 2, w + r1 // 2 - 200, r1 // 2], fill=(*RED, int(255 * strength)))
    r2 = int(min(w, h) * 0.45)
    gd.ellipse([-r2 // 2, h - r2 // 2, r2 // 2, h + r2 // 2], fill=(*RED, int(255 * strength * 0.7)))
    img.alpha_composite(glow.filter(ImageFilter.GaussianBlur(radius=220)))
    return img


def skyline_backdrop(canvas: Image.Image, width: int, bottom: int, opacity: float = 1.0) -> None:
    """Paste the intro skyline (top already faded to transparent) `width` wide with its bottom edge at `bottom`."""
    sky = Image.open(os.path.join(IMG, "intro-skyline.webp")).convert("RGBA").resize((width, width), Image.LANCZOS)
    if opacity < 1:
        a = sky.getchannel("A").point(lambda v: int(v * opacity))
        sky.putalpha(a)
    x = (canvas.width - width) // 2
    canvas.alpha_composite(sky, (x, bottom - width))


def grain(img: Image.Image, density: int) -> Image.Image:
    w, h = img.size
    g = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    gd = ImageDraw.Draw(g)
    for _ in range(density):
        gd.point((random.randint(0, w - 1), random.randint(0, h - 1)), fill=(255, 255, 255, random.randint(3, 9)))
    for _ in range(density // 2):
        gd.point((random.randint(0, w - 1), random.randint(0, h - 1)), fill=(0, 0, 0, random.randint(3, 9)))
    return Image.alpha_composite(img, g)


def wrap(d, text, f, max_w):
    words, lines, cur = text.split(), [], ""
    for w_ in words:
        t = (cur + " " + w_).strip()
        if d.textlength(t, font=f) <= max_w:
            cur = t
        else:
            if cur:
                lines.append(cur)
            cur = w_
    if cur:
        lines.append(cur)
    return lines


def chip(img, text, x, y, fill=RED, fg=WHITE) -> int:
    d = ImageDraw.Draw(img, "RGBA")
    f = font(28, 700)
    tw = d.textlength(text, font=f)
    padx, pady = 26, 15
    box = (x, y, x + int(tw) + padx * 2, y + 30 + pady * 2)
    d.rounded_rectangle(box, radius=999, fill=fill)
    d.text((x + padx, y + pady - 4), text, font=f, fill=fg)
    return box[3]


def load_screen(name: str, platform: str) -> Image.Image:
    if name == "MAP":
        return with_status_bar(build_map_screen(), platform, bg=(241, 239, 233))
    return with_status_bar(Image.open(os.path.join(RAW, f"{name}.png")), platform)


def copy_block(img, x, y, headline, subline, max_w, ink, muted, head_size=108, sub_size=46) -> int:
    """Headline + subline + brand rule; returns the y below the rule."""
    d = ImageDraw.Draw(img, "RGBA")
    hf = font(head_size, 800)
    for ln in wrap(d, headline, hf, max_w):
        d.text((x, y), ln, font=hf, fill=ink)
        y += hf.size + 6
    sf = font(sub_size, 500)
    y += 22
    for ln in wrap(d, subline, sf, max_w):
        d.text((x, y), ln, font=sf, fill=muted)
        y += sf.size + 8
    d.rounded_rectangle([x, y + 26, x + 140, y + 34], radius=4, fill=RED)
    return y + 34


# ══════════════════════════════════════════════════════════════════════
#  Slide builders
# ══════════════════════════════════════════════════════════════════════
def build_portrait(idx: int, total: int, theme: str, shot: str, eyebrow: str, headline: str, subline: str, platform: str, out_path: str) -> str:
    W, H = PORTRAIT
    img = canvas_bg((W, H), theme)
    dark = theme == "dark"
    ink, muted = (WHITE, MUTED_LIGHT) if dark else ((SKY_INK, (70, 95, 110)) if theme == "sky" else (INK, MUTED_DARK))

    if theme == "sky":
        # the intro: open sky with the Lagos skyline rising behind the phone, which plays the brand moment itself
        skyline_backdrop(img, W + 160, H + 40)
        lk = lockup_horizontal(68)
        img.alpha_composite(lk, (96, 104))
        cb = chip(img, eyebrow, 96, 236, fill=(*SKY_INK, 255))
        d = ImageDraw.Draw(img, "RGBA")
        hf = font(118, "serif")
        y = cb + 44
        for ln in wrap(d, headline, hf, W - 192):
            d.text((96, y), ln, font=hf, fill=ink)
            y += hf.size + 4
        sf = font(46, 500)
        y += 22
        for ln in wrap(d, subline, sf, W - 192):
            d.text((96, y), ln, font=sf, fill=muted)
            y += sf.size + 8
        d.rounded_rectangle([96, y + 26, 236, y + 34], radius=4, fill=RED)
        py, phone_w = max(y + 90, 940), 860  # a touch smaller so the markers over the rooftops stay in frame
    else:
        lk = lockup_horizontal(68, dark=dark)
        img.alpha_composite(lk, (96, 104))
        cb = chip(img, eyebrow, 96, 236)
        y = copy_block(img, 96, cb + 44, headline, subline, W - 192, ink, muted)
        py, phone_w = max(y + 90, 900) - 60, 1020

    phone = device_frame(load_screen(shot, platform), target_w=phone_w, platform=platform)
    img.alpha_composite(phone, ((W - phone.width) // 2, py))

    d = ImageDraw.Draw(img, "RGBA")
    pf = font(26, 700)
    t = f"{idx:02d} / {total:02d}"
    tw = d.textlength(t, font=pf)
    d.text((W - tw - 96, 128), t, font=pf, fill=(*ink, 130))

    img = grain(img, 5200)
    img.convert("RGB").save(out_path, "PNG", optimize=True)
    return out_path


def build_landscape(idx: int, theme: str, shots: list[str], eyebrow: str, headline: str, subline: str, platform: str, out_path: str, footer: str) -> str:
    W, H = LANDSCAPE
    img = canvas_bg((W, H), theme)
    dark = theme == "dark"
    ink, muted = (WHITE, MUTED_LIGHT) if dark else ((SKY_INK, (70, 95, 110)) if theme == "sky" else (INK, MUTED_DARK))
    if theme == "sky":
        skyline_backdrop(img, int(W * 0.62), H + 60, opacity=0.9)
        # soft veil so the copy stays legible over the rooftops
        veil = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        ImageDraw.Draw(veil).rectangle([0, 0, int(W * 0.52), H], fill=(*SKY_BLEND, 150))
        img.alpha_composite(veil.filter(ImageFilter.GaussianBlur(90)))
    lk = lockup_horizontal(80, dark=dark)
    img.alpha_composite(lk, (130, 118))
    cb = chip(img, eyebrow, 130, 258, fill=(*SKY_INK, 255) if theme == "sky" else RED)
    copy_block(img, 130, cb + 64, headline, subline, int(W * 0.46), ink, muted, head_size=122, sub_size=50)

    cx = int(W * 0.745)
    p1 = device_frame(load_screen(shots[0], platform), target_w=600, platform=platform).rotate(-7, resample=Image.BICUBIC, expand=True)
    p2 = device_frame(load_screen(shots[1], platform), target_w=600, platform=platform).rotate(5, resample=Image.BICUBIC, expand=True)
    img.alpha_composite(p1, (cx - p1.width // 2 - 300, (H - p1.height) // 2 + 120))
    img.alpha_composite(p2, (cx - p2.width // 2 + 300, (H - p2.height) // 2 + 200))

    d = ImageDraw.Draw(img, "RGBA")
    pf = font(26, 700)
    d.text((130, H - 92), f"{footer} {idx:02d}", font=pf, fill=(*ink, 120))
    img = grain(img, 6800)
    img.convert("RGB").save(out_path, "PNG", optimize=True)
    return out_path


# ══════════════════════════════════════════════════════════════════════
#  Shared listing copy — one source of truth for both stores
# ══════════════════════════════════════════════════════════════════════
# (theme, raw capture, eyebrow, headline, subline)
SLIDES = {
    "intro": ("sky", "intro", "WELCOME TO AMASS", "Africa’s property operating system.",
              "Verified homes, land and investments on one living map — and FIXA pros for everything after you move in."),
    "map": ("dark", "MAP", "MAP-FIRST SEARCH", "Every property. One map.",
            "A live map of verified homes, land and shortlets across Lagos, Abuja and beyond — priced pins, no guesswork."),
    "property": ("light", "property", "PROPERTY PASSPORT", "Verified. Titled. Trusted.",
                 "Title checks, GPS-verified location, AI valuation and full documents on every listing."),
    "my_home": ("dark", "my_home", "MY HOME", "Run your home from one hub.",
                "Bills, estate dues, documents and maintenance — everything about the place you live, in one tap."),
    "chat": ("light", "chat", "IN-APP CHAT", "Talk to verified agents. Instantly.",
             "Secure messaging with photos and voice notes. Book inspections without leaving the thread."),
    "ai": ("dark", "ai", "AMASS AI", "Ask. Compare. Decide.",
           "Natural-language search — from “duplex under ₦150M in Lekki” to rental yields and area insights."),
    "market": ("light", "market", "MARKET · BRANDS", "Big brands. Great finds.",
               "Shop verified stores for furniture, appliances and electronics — new and pre-owned, delivered to your door."),
    "fixa": ("dark", "fixa", "FIXA", "Vetted pros. Free to contact.",
             "Plumbers, electricians, AC techs and more — verified, rated and one call away."),
    "wallet": ("light", "wallet", "MASS WALLET", "Unlock premium details with MASS.",
               "Pay only for what you open — exact addresses, agent contacts, documents and AI insights."),
    "agent": ("dark", "agent", "FOR AGENTS", "Your listings. Your leads. One cockpit.",
              "Portfolio value, verification tasks and boosts for professionals who move fast."),
    "onboarding": ("light", "onboarding", "CURATED FOR AFRICA", "Extraordinary homes, curated.",
                   "From Lekki to Abuja — a hand-picked map of verified homes, land and investments."),
}

PREVIEWS = [
    ("sky", ["intro", "MAP"], "AMASS · AFRICA’S PROPERTY OS", "Discover. Verify. Own.",
     "Every verified property on one living map — with the passport to prove it."),
    ("light", ["chat", "ai"], "CHAT + AI", "From question to keys.",
     "Ask AMASS AI, chat with verified agents and book inspections in minutes."),
    ("dark", ["market", "fixa"], "MARKET + FIXA", "Everything for the home you’re building.",
     "Verified stores, new and pre-owned finds, and vetted pros for every job around the house."),
]
