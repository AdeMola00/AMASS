"""
AMASS — Apple App Store marketing assets generator (iPhone 6.7" / 6.5").

Outputs (all in /app/frontend/assets/images/appstore-ios/):
  • screenshots/ios-screenshot-01…10.png  → 1284 × 2778 (portrait)
  • app-previews/ios-preview-01…03.png     → 2778 × 1284 (landscape)

Design language: Apple-grade proptech. Alternating ivory (light) and jet-black
(dark) canvases, AMASS red accents, real iPhone-style device frame with
Dynamic Island + iOS status bar, soft depth shadows and film grain.

Raw captures (1170 × 2532, 3× DPR) live in assets/images/ios-raw/.
The home map is synthesised (vector-style Lagos map + AMASS price pins) and
composited under the real, chroma-keyed app chrome.

Run:  python3 scripts/generate_appstore_ios.py
"""
from __future__ import annotations

import math
import os
import random

from PIL import Image, ImageDraw, ImageFilter, ImageFont

random.seed(7)

PORTRAIT = (1284, 2778)
LANDSCAPE = (2778, 1284)

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.normpath(os.path.join(HERE, "..", "assets", "images", "ios-raw"))
OUT_BASE = os.path.normpath(os.path.join(HERE, "..", "assets", "images", "appstore-ios"))
OUT_PORTRAIT = os.path.join(OUT_BASE, "screenshots")
OUT_LANDSCAPE = os.path.join(OUT_BASE, "app-previews")
os.makedirs(OUT_PORTRAIT, exist_ok=True)
os.makedirs(OUT_LANDSCAPE, exist_ok=True)

# ─── palette ──────────────────────────────────────────────────────────
RED = (220, 38, 38)            # AMASS red  #DC2626
RED_SOFT = (225, 29, 72)
INK = (10, 10, 10)
GRAPHITE = (31, 41, 55)
IVORY = (247, 247, 248)
WHITE = (255, 255, 255)
SOFT = (229, 231, 235)
MUTED_DARK = (82, 82, 91)      # subline on light
MUTED_LIGHT = (212, 212, 216)  # subline on dark

SCREEN_W, SCREEN_H = 1170, 2532     # raw capture size
STATUS_H = 141                      # 47pt × 3 — iOS status bar strip
FULL_H = SCREEN_H + STATUS_H        # 2673 — iPhone 6.1" display incl. status bar


def font(size: int, bold: bool = True) -> ImageFont.FreeTypeFont:
    p = (
        "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf"
        if bold
        else "/usr/share/fonts/truetype/freefont/FreeSans.ttf"
    )
    return ImageFont.truetype(p, size)


# ══════════════════════════════════════════════════════════════════════
#  iOS status bar + Dynamic Island
# ══════════════════════════════════════════════════════════════════════
def _luma(c) -> float:
    return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]


def _top_color(shot: Image.Image) -> tuple[int, int, int]:
    """Median colour of the top rows → status-bar strip colour."""
    row = shot.crop((0, 0, shot.width, 6)).convert("RGB")
    px = list(row.getdata())
    px.sort(key=_luma)
    return px[len(px) // 2]


def with_status_bar(shot: Image.Image, bg: tuple[int, int, int] | None = None) -> Image.Image:
    """1170×2532 capture → 1170×2673 with iOS status bar + Dynamic Island."""
    shot = shot.convert("RGB")
    if shot.size != (SCREEN_W, SCREEN_H):
        shot = shot.resize((SCREEN_W, SCREEN_H), Image.LANCZOS)
    bgc = bg or _top_color(shot)
    canvas = Image.new("RGB", (SCREEN_W, FULL_H), bgc)
    canvas.paste(shot, (0, STATUS_H))
    d = ImageDraw.Draw(canvas)
    fg = WHITE if _luma(bgc) < 140 else INK

    # Dynamic Island (126 × 37 pt)
    iw, ih = 378, 111
    ix, iy = (SCREEN_W - iw) // 2, 33
    d.rounded_rectangle([ix, iy, ix + iw, iy + ih], radius=ih // 2, fill=(0, 0, 0))

    # time
    tf = font(50, bold=True)
    d.text((112, 52), "9:41", font=tf, fill=fg)

    # right cluster: signal · wifi · battery
    x = SCREEN_W - 112
    # battery
    bw, bh = 82, 40
    bx, by = x - bw, 60
    d.rounded_rectangle([bx, by, bx + bw, by + bh], radius=12, outline=fg, width=4)
    d.rounded_rectangle([bx + 6, by + 6, bx + bw - 6, by + bh - 6], radius=7, fill=fg)
    d.rounded_rectangle([bx + bw + 4, by + 13, bx + bw + 10, by + bh - 13], radius=3, fill=fg)
    # wifi (3 arcs)
    cx, cy = bx - 62, by + 36
    for r, w in ((40, 7), (26, 7), (12, 7)):
        d.arc([cx - r, cy - r, cx + r, cy + r], start=225, end=315, fill=fg, width=w)
    d.ellipse([cx - 6, cy - 6, cx + 6, cy + 6], fill=fg)
    # signal bars
    sx = cx - 60 - 70
    for i, h in enumerate((14, 22, 30, 38)):
        bxx = sx + i * 18
        d.rounded_rectangle([bxx, by + bh - h, bxx + 12, by + bh], radius=3, fill=fg)
    return canvas


# ══════════════════════════════════════════════════════════════════════
#  iPhone device frame
# ══════════════════════════════════════════════════════════════════════
def device_frame(screen: Image.Image, target_w: int, shadow: bool = True) -> Image.Image:
    """
    Wrap a 1170×2673 screen into a titanium iPhone-style frame.
    Returns RGBA image (with soft drop shadow) scaled so the OUTER body is target_w wide.
    """
    B = 44                     # bezel
    R_OUT, R_IN = 212, 168     # corner radii
    W, H = SCREEN_W + 2 * B, FULL_H + 2 * B
    body = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(body)

    # body: dark graphite with subtle vertical sheen
    d.rounded_rectangle([0, 0, W, H], radius=R_OUT, fill=(22, 22, 24, 255))
    sheen = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sheen)
    for y in range(H):
        t = y / H
        a = int(70 * (1 - abs(t - 0.5) * 2))
        sd.line([(0, y), (W, y)], fill=(255, 255, 255, a))
    mask = Image.new("L", (W, H), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, W, H], radius=R_OUT, fill=255)
    sheen_masked = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sheen_masked.paste(sheen, (0, 0), mask)
    body.alpha_composite(sheen_masked)
    # titanium edge highlight
    d = ImageDraw.Draw(body)
    d.rounded_rectangle([2, 2, W - 2, H - 2], radius=R_OUT, outline=(120, 120, 126, 255), width=5)
    d.rounded_rectangle([8, 8, W - 8, H - 8], radius=R_OUT - 6, outline=(0, 0, 0, 255), width=3)

    # side buttons (drawn outside body → enlarge canvas)
    pad = 14
    full = Image.new("RGBA", (W + pad * 2, H), (0, 0, 0, 0))
    fd = ImageDraw.Draw(full)
    btn = (70, 70, 75, 255)
    # left: action + volume up/down
    fd.rounded_rectangle([0, 520, pad + 2, 620], radius=6, fill=btn)
    fd.rounded_rectangle([0, 700, pad + 2, 900], radius=6, fill=btn)
    fd.rounded_rectangle([0, 940, pad + 2, 1140], radius=6, fill=btn)
    # right: power
    fd.rounded_rectangle([W + pad - 2, 760, W + pad * 2, 1080], radius=6, fill=btn)
    full.alpha_composite(body, (pad, 0))

    # screen with rounded corners
    scr = screen.convert("RGB").resize((SCREEN_W, FULL_H), Image.LANCZOS)
    smask = Image.new("L", scr.size, 0)
    ImageDraw.Draw(smask).rounded_rectangle([0, 0, SCREEN_W, FULL_H], radius=R_IN, fill=255)
    scr_rgba = Image.new("RGBA", scr.size, (0, 0, 0, 0))
    scr_rgba.paste(scr, (0, 0), smask)
    full.alpha_composite(scr_rgba, (pad + B, B))

    # scale
    scale = target_w / W
    full = full.resize((int(full.width * scale), int(full.height * scale)), Image.LANCZOS)

    if not shadow:
        return full
    spad = int(120 * scale) + 60
    canvas = Image.new("RGBA", (full.width + spad * 2, full.height + spad * 2), (0, 0, 0, 0))
    sh = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle(
        [spad + 12, spad + 48, spad + full.width - 12, spad + full.height + 48],
        radius=int(R_OUT * scale),
        fill=(0, 0, 0, 200),
    )
    sh = sh.filter(ImageFilter.GaussianBlur(56))
    canvas.alpha_composite(sh)
    canvas.alpha_composite(full, (spad, spad))
    return canvas


# ══════════════════════════════════════════════════════════════════════
#  Synthesised Lagos map + AMASS price pins (home screen)
# ══════════════════════════════════════════════════════════════════════
def _vector_map(w: int, h: int) -> Image.Image:
    LAND = (241, 239, 233)
    WATER = (190, 219, 240)
    WATER_DEEP = (170, 205, 232)
    PARK = (212, 230, 200)
    ROAD = (255, 255, 255)
    ROAD_CASE = (218, 214, 206)
    MAJOR = (255, 246, 214)
    MAJOR_CASE = (228, 214, 170)
    BUILDING = (231, 229, 222)
    LABEL = (120, 120, 128)
    WATER_LABEL = (90, 130, 165)

    m = Image.new("RGB", (w, h), LAND)
    d = ImageDraw.Draw(m)

    # ── water: Lagos Lagoon (top-right) + Five Cowrie creek (diagonal) + Atlantic (bottom)
    lagoon = [(w * 0.62, -40), (w + 60, -40), (w + 60, h * 0.34), (w * 0.86, h * 0.30),
              (w * 0.74, h * 0.24), (w * 0.66, h * 0.16), (w * 0.60, h * 0.06)]
    d.polygon(lagoon, fill=WATER)
    creek = [(-40, h * 0.42), (w * 0.18, h * 0.40), (w * 0.36, h * 0.44), (w * 0.52, h * 0.43),
             (w * 0.70, h * 0.40), (w * 0.86, h * 0.33), (w + 60, h * 0.34),
             (w + 60, h * 0.39), (w * 0.86, h * 0.385), (w * 0.70, h * 0.455), (w * 0.52, h * 0.485),
             (w * 0.36, h * 0.495), (w * 0.18, h * 0.455), (-40, h * 0.475)]
    d.polygon(creek, fill=WATER)
    atlantic = [(-40, h * 0.86), (w * 0.2, h * 0.845), (w * 0.45, h * 0.86), (w * 0.7, h * 0.85),
                (w + 60, h * 0.865), (w + 60, h + 40), (-40, h + 40)]
    d.polygon(atlantic, fill=WATER_DEEP)
    # beach strip
    d.polygon([(-40, h * 0.845), (w * 0.2, h * 0.83), (w * 0.45, h * 0.845), (w * 0.7, h * 0.835),
               (w + 60, h * 0.85), (w + 60, h * 0.865), (w * 0.7, h * 0.85), (w * 0.45, h * 0.86),
               (w * 0.2, h * 0.845), (-40, h * 0.86)], fill=(236, 226, 196))

    # ── parks
    for (cx, cy, rx, ry) in [(w * 0.22, h * 0.60, 110, 70), (w * 0.78, h * 0.62, 90, 60),
                             (w * 0.40, h * 0.74, 120, 55), (w * 0.14, h * 0.25, 80, 60),
                             (w * 0.58, h * 0.57, 70, 50)]:
        d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=PARK)

    # ── road grid (rotated), drawn on an oversize layer then pasted through a land mask
    big = int(math.hypot(w, h)) + 400
    roads = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    rd = ImageDraw.Draw(roads)
    step = 150
    for i in range(0, big, step):
        major = (i // step) % 4 == 0
        case_w, road_w = (40, 28) if major else (20, 12)
        case_c, road_c = (MAJOR_CASE, MAJOR) if major else (ROAD_CASE, ROAD)
        rd.line([(i, 0), (i, big)], fill=case_c, width=case_w)
        rd.line([(0, i), (big, i)], fill=case_c, width=case_w)
    for i in range(0, big, step):
        major = (i // step) % 4 == 0
        case_w, road_w = (40, 28) if major else (20, 12)
        case_c, road_c = (MAJOR_CASE, MAJOR) if major else (ROAD_CASE, ROAD)
        rd.line([(i, 0), (i, big)], fill=road_c, width=road_w)
        rd.line([(0, i), (big, i)], fill=road_c, width=road_w)
    # buildings inside blocks
    for gx in range(0, big, step):
        for gy in range(0, big, step):
            if random.random() < 0.55:
                n = random.randint(1, 3)
                for _ in range(n):
                    bw_, bh_ = random.randint(26, 60), random.randint(26, 60)
                    bx = gx + random.randint(28, step - 28 - bw_)
                    by = gy + random.randint(28, step - 28 - bh_)
                    rd.rectangle([bx, by, bx + bw_, by + bh_], fill=BUILDING)
    roads = roads.rotate(-14, resample=Image.BICUBIC)
    ox, oy = (big - w) // 2, (big - h) // 2
    roads = roads.crop((ox, oy, ox + w, oy + h))

    # land mask = everything that is not water
    land_mask = Image.new("L", (w, h), 255)
    lm = ImageDraw.Draw(land_mask)
    lm.polygon(lagoon, fill=0)
    lm.polygon(creek, fill=0)
    lm.polygon(atlantic, fill=0)
    roads_rgb = Image.new("RGB", (w, h), LAND)
    roads_rgb.paste(roads, (0, 0), roads)
    m.paste(roads_rgb, (0, 0), land_mask)

    # ── a sweeping expressway (Lekki–Epe) across the middle
    d = ImageDraw.Draw(m)
    pts = [(-40, h * 0.56), (w * 0.2, h * 0.545), (w * 0.45, h * 0.555), (w * 0.7, h * 0.54), (w + 60, h * 0.55)]
    d.line(pts, fill=MAJOR_CASE, width=52, joint="curve")
    d.line(pts, fill=MAJOR, width=38, joint="curve")
    # bridge over the creek (Lekki–Ikoyi link)
    d.line([(w * 0.47, h * 0.36), (w * 0.60, h * 0.52)], fill=(210, 200, 190), width=30)
    d.line([(w * 0.47, h * 0.36), (w * 0.60, h * 0.52)], fill=(252, 250, 244), width=18)

    # ── labels
    lf = font(30, bold=True)
    sf = font(26, bold=False)
    labels = [("IKOYI", w * 0.10, h * 0.30), ("VICTORIA ISLAND", w * 0.12, h * 0.655),
              ("LEKKI PHASE 1", w * 0.56, h * 0.63), ("BANANA ISLAND", w * 0.70, h * 0.12),
              ("ONIRU", w * 0.40, h * 0.78)]
    for t, x, y in labels:
        d.text((x + 1, y + 1), t, font=lf, fill=(255, 255, 255))
        d.text((x, y), t, font=lf, fill=LABEL)
    wf = ImageFont.truetype("/usr/share/fonts/truetype/freefont/FreeSansBoldOblique.ttf", 30)
    d.text((w * 0.72, h * 0.22), "Lagos Lagoon", font=wf, fill=WATER_LABEL)
    d.text((w * 0.30, h * 0.455), "Five Cowrie Creek", font=ImageFont.truetype(
        "/usr/share/fonts/truetype/freefont/FreeSansOblique.ttf", 26), fill=WATER_LABEL)
    d.text((w * 0.40, h * 0.92), "Atlantic Ocean", font=wf, fill=(70, 110, 150))
    d.text((w * 0.62, h * 0.575), "Lekki–Epe Expressway", font=sf, fill=(150, 130, 90))
    return m


def _chroma_key(img: Image.Image) -> Image.Image:
    """
    Magenta (255,0,255) → transparent. Magenta-tinted pixels (white glass /
    anti-aliased edges rendered over the magenta key) are rebuilt as white
    with alpha = green channel, which is exactly the coverage they had.
    """
    import numpy as np

    a = np.array(img.convert("RGBA")).astype(np.int16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    tinted = (r > g + 3) & (b > g + 3) & (r > 150) & (b > 150)
    out = a.copy()
    out[tinted, 0] = 255
    out[tinted, 1] = 255
    out[tinted, 2] = 255
    out[tinted, 3] = np.clip(g[tinted], 0, 255)
    return Image.fromarray(out.astype(np.uint8), "RGBA")


def _price_pin(d: ImageDraw.ImageDraw, x: int, y: int, label: str, *, selected=False, verified=False):
    f = font(36 if selected else 32, bold=True)
    tw = d.textlength(label, font=f)
    padx = 26
    ph = 74 if selected else 64
    pw = int(tw) + padx * 2 + (48 if verified else 0)
    x0, y0 = x - pw // 2, y - ph - 18
    fill = INK if selected else RED
    # shadow
    d.rounded_rectangle([x0 + 3, y0 + 8, x0 + pw + 3, y0 + ph + 8], radius=ph // 2, fill=(0, 0, 0, 70))
    d.rounded_rectangle([x0, y0, x0 + pw, y0 + ph], radius=ph // 2, fill=fill)
    d.polygon([(x - 14, y0 + ph - 2), (x + 14, y0 + ph - 2), (x, y + 2)], fill=fill)
    tx = x0 + padx
    if verified:
        cx, cy = x0 + padx + 16, y0 + ph // 2
        d.ellipse([cx - 16, cy - 16, cx + 16, cy + 16], fill=WHITE)
        d.line([(cx - 8, cy), (cx - 2, cy + 6), (cx + 9, cy - 6)], fill=fill, width=4, joint="curve")
        tx += 48
    d.text((tx, y0 + (ph - f.size) // 2 - 4), label, font=f, fill=WHITE)
    # anchor dot
    d.ellipse([x - 7, y - 7, x + 7, y + 7], fill=WHITE, outline=fill, width=4)


def _cluster(d: ImageDraw.ImageDraw, x: int, y: int, n: int):
    r = 52
    d.ellipse([x - r - 10, y - r - 10, x + r + 10, y + r + 10], fill=(220, 38, 38, 60))
    d.ellipse([x - r, y - r, x + r, y + r], fill=INK)
    f = font(40, True)
    t = str(n)
    tw = d.textlength(t, font=f)
    d.text((x - tw / 2, y - 26), t, font=f, fill=WHITE)


def build_map_screen() -> Image.Image:
    """Synth map under the real (chroma-keyed) home-screen chrome → 1170×2532."""
    base = _vector_map(SCREEN_W, SCREEN_H).convert("RGBA")
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer, "RGBA")

    pins = [
        (300, 760, "₦145M", dict(verified=True)),
        (640, 980, "₦320M", dict(selected=True, verified=True)),
        (170, 1120, "₦85M", {}),
        (470, 1310, "₦480M", dict(verified=True)),
        (820, 1480, "₦62M", {}),
        (260, 1560, "₦210M", dict(verified=True)),
        (690, 1720, "₦1.2B", dict(verified=True)),
        (420, 1800, "₦38M", {}),
        (900, 1840, "₦95M", {}),
        (160, 1760, "₦560M", dict(verified=True)),
    ]
    for x, y, lbl, kw in pins:
        _price_pin(d, x, y, lbl, **kw)
    _cluster(d, 820, 1200, 12)
    _cluster(d, 560, 1600, 7)

    # docked property card (above the Legend chip + tab bar)
    cx0, cy0, cw, ch = 40, 1880, SCREEN_W - 80, 200
    d.rounded_rectangle([cx0 + 2, cy0 + 10, cx0 + cw + 2, cy0 + ch + 10], radius=36, fill=(0, 0, 0, 60))
    d.rounded_rectangle([cx0, cy0, cx0 + cw, cy0 + ch], radius=36, fill=WHITE)
    # thumbnail from the property capture
    prop = os.path.join(RAW, "03_property.png")
    if os.path.exists(prop):
        th = Image.open(prop).convert("RGB").crop((0, 0, 1170, 640)).resize((236, 160), Image.LANCZOS)
        tmask = Image.new("L", th.size, 0)
        ImageDraw.Draw(tmask).rounded_rectangle([0, 0, 236, 160], radius=26, fill=255)
        layer.paste(th, (cx0 + 20, cy0 + 20), tmask)
        d = ImageDraw.Draw(layer, "RGBA")
    tx = cx0 + 20 + 236 + 28
    d.text((tx, cy0 + 26), "₦320M", font=font(44, True), fill=INK)
    d.text((tx, cy0 + 84), "Serene 4-Bedroom Terrace", font=font(30, True), fill=INK)
    d.text((tx, cy0 + 126), "Ikoyi, Lagos · 4 bd · 5 ba · 420 sqm", font=font(26, False), fill=MUTED_DARK)
    # verified chip
    vf = font(24, True)
    vt = "✓ VERIFIED"
    vw = int(d.textlength(vt, font=vf)) + 32
    vx = cx0 + cw - vw - 24
    d.rounded_rectangle([vx, cy0 + 26, vx + vw, cy0 + 70], radius=22, fill=(5, 150, 105))
    d.text((vx + 16, cy0 + 32), vt, font=vf, fill=WHITE)

    base.alpha_composite(layer)

    chrome_path = os.path.join(RAW, "02_map_chrome.png")
    if os.path.exists(chrome_path):
        chrome = _chroma_key(Image.open(chrome_path))
        if chrome.size != base.size:
            chrome = chrome.resize(base.size, Image.LANCZOS)
        # The glass search bar is rendered with backdrop-filter on web and
        # leaves a few transparent slivers after keying — back it with a
        # solid white pill so it reads as the real frosted bar.
        bd = ImageDraw.Draw(base, "RGBA")
        bd.rounded_rectangle([51, 219, 1118, 320], radius=50, fill=WHITE)
        base.alpha_composite(chrome)
    return base.convert("RGB")


# ══════════════════════════════════════════════════════════════════════
#  Canvas helpers
# ══════════════════════════════════════════════════════════════════════
def canvas_bg(size, theme: str) -> Image.Image:
    w, h = size
    img = Image.new("RGB", size, IVORY if theme == "light" else INK)
    px = img.load()
    if theme == "light":
        a, b = IVORY, WHITE
    else:
        a, b = GRAPHITE, INK
    for y in range(h):
        t = min(1.0, y / (h * 0.65))
        c = tuple(int(a[i] * (1 - t) + b[i] * t) for i in range(3))
        for x in range(w):
            px[x, y] = c
    img = img.convert("RGBA")
    # red glow accents
    glow = Image.new("RGBA", size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    strength = 0.14 if theme == "light" else 0.26
    r1 = int(min(w, h) * 0.6)
    gd.ellipse([w - r1 // 2 - 200, -r1 // 2, w + r1 // 2 - 200, r1 // 2], fill=(*RED_SOFT, int(255 * strength)))
    r2 = int(min(w, h) * 0.45)
    gd.ellipse([-r2 // 2, h - r2 // 2, r2 // 2, h + r2 // 2], fill=(*RED_SOFT, int(255 * strength * 0.7)))
    glow = glow.filter(ImageFilter.GaussianBlur(radius=220))
    img.alpha_composite(glow)
    return img


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


def wordmark(d, x, y, size, color):
    # red pin-dot + AMASS
    r = int(size * 0.20)
    d.ellipse([x, y + int(size * 0.22), x + 2 * r, y + int(size * 0.22) + 2 * r], fill=RED)
    d.text((x + 2 * r + 14, y - int(size * 0.08)), "AMASS", font=font(size, True), fill=color)


def chip(img, text, x, y, theme):
    d = ImageDraw.Draw(img, "RGBA")
    f = font(30, True)
    tw = d.textlength(text, font=f)
    padx, pady = 26, 14
    box = (x, y, x + int(tw) + padx * 2, y + 32 + pady * 2)
    d.rounded_rectangle(box, radius=999, fill=(*RED, 255))
    d.text((x + padx, y + pady - 4), text, font=f, fill=WHITE)
    return box[3]


def load_screen(name: str) -> Image.Image:
    if name == "MAP":
        return with_status_bar(build_map_screen(), bg=(241, 239, 233))
    return with_status_bar(Image.open(os.path.join(RAW, name)))


# ══════════════════════════════════════════════════════════════════════
#  Portrait screenshot 1284 × 2778
# ══════════════════════════════════════════════════════════════════════
def build_portrait(idx, theme, shot, eyebrow, headline, subline) -> str:
    W, H = PORTRAIT
    img = canvas_bg((W, H), theme)
    d = ImageDraw.Draw(img, "RGBA")
    ink = INK if theme == "light" else WHITE
    muted = MUTED_DARK if theme == "light" else MUTED_LIGHT

    wordmark(d, 96, 118, 50, ink)
    cb = chip(img, eyebrow, 96, 236, theme)
    d = ImageDraw.Draw(img, "RGBA")

    hf = font(108, True)
    y = cb + 44
    for ln in wrap(d, headline, hf, W - 192):
        d.text((96, y), ln, font=hf, fill=ink)
        y += hf.size + 6
    sf = font(46, False)
    y += 22
    for ln in wrap(d, subline, sf, W - 192):
        d.text((96, y), ln, font=sf, fill=muted)
        y += sf.size + 8
    d.rectangle([96, y + 26, 236, y + 34], fill=(*RED, 255))

    # device — bleeds off the bottom edge
    phone = device_frame(load_screen(shot), target_w=1020)
    px = (W - phone.width) // 2
    py = max(y + 90, 900) - 60
    img.alpha_composite(phone, (px, py))

    # page indicator (top-right, clear of the device)
    d = ImageDraw.Draw(img, "RGBA")
    pf = font(26, True)
    t = f"{idx:02d} / 10"
    tw = d.textlength(t, font=pf)
    d.text((W - tw - 96, 132), t, font=pf, fill=(*ink, 120))

    img = grain(img, 5200)
    out = os.path.join(OUT_PORTRAIT, f"ios-screenshot-{idx:02d}.png")
    img.convert("RGB").save(out, "PNG", optimize=True)
    return out


# ══════════════════════════════════════════════════════════════════════
#  Landscape app preview 2778 × 1284
# ══════════════════════════════════════════════════════════════════════
def build_landscape(idx, theme, shots, eyebrow, headline, subline) -> str:
    W, H = LANDSCAPE
    img = canvas_bg((W, H), theme)
    d = ImageDraw.Draw(img, "RGBA")
    ink = INK if theme == "light" else WHITE
    muted = MUTED_DARK if theme == "light" else MUTED_LIGHT

    wordmark(d, 130, 130, 58, ink)
    cb = chip(img, eyebrow, 130, 258, theme)
    d = ImageDraw.Draw(img, "RGBA")

    hf = font(122, True)
    max_w = int(W * 0.46)
    y = cb + 64
    for ln in wrap(d, headline, hf, max_w):
        d.text((130, y), ln, font=hf, fill=ink)
        y += hf.size + 6
    sf = font(50, False)
    y += 30
    for ln in wrap(d, subline, sf, max_w):
        d.text((130, y), ln, font=sf, fill=muted)
        y += sf.size + 8
    d.rectangle([130, y + 30, 290, y + 38], fill=(*RED, 255))

    # two phones on the right, slight tilt, bleeding off top/bottom
    cx = int(W * 0.745)
    p1 = device_frame(load_screen(shots[0]), target_w=600).rotate(-7, resample=Image.BICUBIC, expand=True)
    p2 = device_frame(load_screen(shots[1]), target_w=600).rotate(5, resample=Image.BICUBIC, expand=True)
    img.alpha_composite(p1, (cx - p1.width // 2 - 300, (H - p1.height) // 2 + 120))
    img.alpha_composite(p2, (cx - p2.width // 2 + 300, (H - p2.height) // 2 + 200))

    d = ImageDraw.Draw(img, "RGBA")
    pf = font(26, True)
    t = f"AMASS · PREVIEW {idx:02d}"
    tw = d.textlength(t, font=pf)
    d.text((130, H - 92), t, font=pf, fill=(*ink, 110))

    img = grain(img, 6800)
    out = os.path.join(OUT_LANDSCAPE, f"ios-preview-{idx:02d}.png")
    img.convert("RGB").save(out, "PNG", optimize=True)
    return out


# ══════════════════════════════════════════════════════════════════════
#  Specs
# ══════════════════════════════════════════════════════════════════════
SCREENSHOTS = [
    ("dark",  "MAP",                    "01 · MAP-FIRST SEARCH",   "Every property. One map.",
     "Redfin-style live map of verified homes, land and commercial deals across Lagos, Abuja and beyond."),
    ("light", "03_property.png",        "02 · PROPERTY PASSPORT",  "Verified. Titled. Trusted.",
     "Title checks, GPS-verified location, AI valuation and full documents on every listing."),
    ("dark",  "04_discover.png",        "03 · NEIGHBOURHOOD INTEL", "Know the street before you buy.",
     "Trending areas, livability scores and market signals — updated as the city moves."),
    ("light", "06_chat.png",            "04 · IN-APP CHAT",        "Talk to verified agents. Instantly.",
     "Secure messaging with photos and voice notes. Book inspections without leaving the thread."),
    ("dark",  "10_ai_search.png",       "05 · AMASS AI",           "Ask. Compare. Decide.",
     "Natural-language search powered by Claude — from “duplex under ₦150M in Lekki” to rental yields."),
    ("light", "05_marketplace.png",     "06 · MARKETPLACE",        "Homes, cars, gear — one place.",
     "Shop verified stores for appliances, electronics, vehicles and FIXA home services."),
    ("dark",  "08_wallet.png",          "07 · MASS WALLET",        "Unlock premium details with tokens.",
     "Pay only for what you open — exact addresses, agent contacts, documents and AI insights."),
    ("light", "09_agent_dashboard.png", "08 · FOR AGENTS",         "Your listings. Your leads. One cockpit.",
     "Portfolio value, verification tasks and plan upgrades for professionals who move fast."),
    ("dark",  "01_onboarding.png",      "09 · CURATED FOR AFRICA", "Extraordinary homes, curated.",
     "From Lekki to Abuja — a hand-picked map of verified homes, land and investments."),
    ("light", "12_profile.png",         "10 · SECURE BY DESIGN",   "Your account, your control.",
     "Google & Apple sign-in, encrypted sessions and one-tap account deletion — privacy first."),
]

PREVIEWS = [
    ("dark",  ["MAP", "03_property.png"],              "AMASS · AFRICA'S PROPERTY OS",
     "Discover. Verify. Own.", "Every verified property on one living map — with the passport to prove it."),
    ("light", ["06_chat.png", "10_ai_search.png"],      "CHAT + AI",
     "From question to keys.", "Ask AMASS AI, chat with verified agents and book inspections in minutes."),
    ("dark",  ["05_marketplace.png", "08_wallet.png"],  "MARKETPLACE + MASS WALLET",
     "Everything for the home you’re building.", "Verified stores, FIXA services and a token wallet that pays only for what you open."),
]


def main() -> None:
    print("=== iOS PORTRAIT SCREENSHOTS (1284×2778) ===")
    for i, (theme, shot, eyebrow, head, sub) in enumerate(SCREENSHOTS, start=1):
        out = build_portrait(i, theme, shot, eyebrow, head, sub)
        print(f"  [{i:02d}/10] {out} ({os.path.getsize(out) / 1024:.0f} KB)")
    print("\n=== iOS LANDSCAPE APP PREVIEWS (2778×1284) ===")
    for i, (theme, shots, eyebrow, head, sub) in enumerate(PREVIEWS, start=1):
        out = build_landscape(i, theme, shots, eyebrow, head, sub)
        print(f"  [{i:02d}/03] {out} ({os.path.getsize(out) / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
