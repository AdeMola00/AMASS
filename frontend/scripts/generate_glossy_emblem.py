#!/usr/bin/env python3
"""Generate the glossy AMASS emblem (brand red → deep crimson + soft highlight)
and regenerate every platform asset that derives from it.

Usage:  python3 scripts/generate_glossy_emblem.py

Inputs : assets/images/amass-emblem.png (authoritative client emblem, unaltered master)
Outputs: assets/images/amass-emblem-glossy.png        (in-app logo)
         assets/images/amass-icon-square.png          (iOS icon, 1024, white)
         assets/images/amass-adaptive-foreground.png  (Android adaptive fg, 1024, transparent)
         assets/images/amass-splash.png               (splash, 1024, transparent)
         assets/images/favicon.png                    (web, 196)
         assets/images/playstore-icon-512.png         (Play hi-res, 512, white)
         assets/images/notification-icon.png          (Android status-bar glyph, 96, white silhouette)
"""
from __future__ import annotations

import colorsys
import os

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.join(os.path.dirname(__file__), "..", "assets", "images")
SRC = os.path.join(ROOT, "amass-emblem.png")

# Brand gradient — matches frontend/src/theme/tokens.ts `gradients.brand`.
TOP = (0xF0, 0x26, 0x2E)     # brand red (lifted)
BOTTOM = (0x7A, 0x0C, 0x12)  # deep crimson


def _hsv(rgb):
    return colorsys.rgb_to_hsv(*(c / 255 for c in rgb))


def recolor(im: Image.Image) -> Image.Image:
    arr = np.array(im.convert("RGBA")).astype(np.float32)
    r, g, b, a = arr[..., 0], arr[..., 1], arr[..., 2], arr[..., 3]
    visible = a > 0
    red = visible & (r > 90) & (r > 1.5 * g) & (r > 1.5 * b)
    # Soften the mask edge so recolouring never leaves a hard seam.
    mask = np.array(Image.fromarray((red * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))).astype(np.float32) / 255
    mask *= visible

    h, w = red.shape
    xs = np.arange(w)[None, :]
    # Two red shapes: the pin (left) and the door (right). Each gets its own
    # top→bottom ramp so the door isn't uniformly dark.
    shapes = [red & (xs <= 430), red & (xs > 430)]
    t = np.zeros_like(r)
    for shp in shapes:
        ys = np.where(shp.any(axis=1))[0]
        if not len(ys):
            continue
        y0, y1 = ys.min(), ys.max()
        ramp = np.clip((np.arange(h) - y0) / max(1, y1 - y0), 0, 1)[:, None]
        t = np.where(shp, ramp, t)
    # Extend ramp to the blurred fringe
    t = np.where((mask > 0) & (t == 0), 0.5, t)

    top_h, top_s, top_v = _hsv(TOP)
    bot_h, bot_s, bot_v = _hsv(BOTTOM)

    out = arr.copy()
    idx = np.where(mask > 0.02)
    for y, x in zip(*idx):
        hh, ss, vv = colorsys.rgb_to_hsv(r[y, x] / 255, g[y, x] / 255, b[y, x] / 255)
        tt = t[y, x]
        # Preserve the original 3-D shading (V, relative to brand V) while sliding
        # the hue/sat/brightness along the brand gradient.
        rel = vv / 0.88
        nh = top_h + (bot_h - top_h) * tt
        ns = min(1.0, (top_s + (bot_s - top_s) * tt) * (0.85 + 0.15 * ss))
        nv = min(1.0, (top_v + (bot_v - top_v) * tt) * rel)
        nr, ng, nb = colorsys.hsv_to_rgb(nh % 1.0, ns, nv)
        m = mask[y, x]
        out[y, x, 0] = r[y, x] * (1 - m) + nr * 255 * m
        out[y, x, 1] = g[y, x] * (1 - m) + ng * 255 * m
        out[y, x, 2] = b[y, x] * (1 - m) + nb * 255 * m

    # ── Soft glossy highlight on the pin (upper-left ellipse, gaussian falloff) ──
    pin = red & (xs <= 430)
    ys_, xs_ = np.where(pin)
    px0, px1, py0, py1 = xs_.min(), xs_.max(), ys_.min(), ys_.max()
    pw, ph = px1 - px0, py1 - py0
    cx, cy = px0 + 0.36 * pw, py0 + 0.20 * ph
    rx, ry = 0.30 * pw, 0.17 * ph
    yy, xx = np.mgrid[0:h, 0:w]
    d = ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2
    glow = np.exp(-d * 1.6) * 0.42
    # Top-edge glass band on both shapes
    band = np.clip(1 - t / 0.45, 0, 1) * 0.16
    sheen = np.clip(glow + band, 0, 0.5) * mask
    for c in range(3):
        out[..., c] = out[..., c] * (1 - sheen) + 255 * sheen
    out[..., 3] = a
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGBA")


def fit(im: Image.Image, size: int, scale: float, bg=None) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0) if bg is None else bg + (255,))
    bbox = im.getbbox()
    crop = im.crop(bbox)
    target = int(size * scale)
    ratio = min(target / crop.width, target / crop.height)
    resized = crop.resize((max(1, int(crop.width * ratio)), max(1, int(crop.height * ratio))), Image.LANCZOS)
    canvas.alpha_composite(resized, ((size - resized.width) // 2, (size - resized.height) // 2))
    return canvas


def notification_glyph(im: Image.Image, size: int = 96) -> Image.Image:
    """Android status-bar icon: white silhouette on transparent."""
    alpha = im.split()[3]
    white = Image.new("RGBA", im.size, (255, 255, 255, 0))
    white.putalpha(alpha)
    return fit(white, size, 0.86)


def main():
    src = Image.open(SRC).convert("RGBA")
    glossy = recolor(src)
    glossy.save(os.path.join(ROOT, "amass-emblem-glossy.png"))
    fit(glossy, 1024, 0.72, bg=(255, 255, 255)).convert("RGB").save(os.path.join(ROOT, "amass-icon-square.png"))
    fit(glossy, 1024, 0.56).save(os.path.join(ROOT, "amass-adaptive-foreground.png"))  # 66% safe zone
    fit(glossy, 1024, 0.62).save(os.path.join(ROOT, "amass-splash.png"))
    fit(glossy, 196, 0.80, bg=(255, 255, 255)).convert("RGB").save(os.path.join(ROOT, "favicon.png"))
    fit(glossy, 512, 0.72, bg=(255, 255, 255)).convert("RGB").save(os.path.join(ROOT, "playstore-icon-512.png"))
    notification_glyph(glossy).save(os.path.join(ROOT, "notification-icon.png"))
    print("glossy emblem + platform assets regenerated")


if __name__ == "__main__":
    main()
