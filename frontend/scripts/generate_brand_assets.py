#!/usr/bin/env python3
"""Brand assets from the client-supplied masters.

  AMASS LOGO 6  (assets/images/brand/amass-logo-master.png — pin + house + AMASS wordmark on off-white)
  FIXA PRO      (assets/images/fixa-logo.png — green card artwork)

Outputs (assets/images/):
  amass-lockup.png              full lockup, transparent, glossy red→crimson pin   (AmassLogo showWordmark)
  amass-emblem-glossy.png       pin + house only                                    (AmassLogo emblem / AmassPinIcon)
  amass-wordmark.png            AMASS wordmark only
  amass-icon-square.png / amass-adaptive-foreground.png / amass-splash.png / favicon.png /
  playstore-icon-512.png / notification-icon.png                                   (platform assets, from the emblem)
  fixa-pro-lockup.png           hard hat + PRO. + FIXA®, transparent
  fixa-hat.png                  hard hat + PRO. only, transparent

Usage: python3 scripts/generate_brand_assets.py
"""
from __future__ import annotations

import colorsys
import os
from collections import deque

import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
IMG = os.path.join(HERE, "..", "assets", "images")
MASTER = os.path.join(IMG, "brand", "amass-logo-master.png")
FIXA = os.path.join(IMG, "fixa-logo.png")

TOP = (0xF0, 0x26, 0x2E)     # brand red (lifted)
BOTTOM = (0x7A, 0x0C, 0x12)  # deep crimson


# ───────────────────────── white-matte removal ─────────────────────────
def _flood(mask: np.ndarray, seeds) -> np.ndarray:
    """Connected region of `mask` reachable from `seeds` (4-neighbour BFS)."""
    h, w = mask.shape
    out = np.zeros_like(mask, dtype=bool)
    q = deque()
    for y, x in seeds:
        if 0 <= y < h and 0 <= x < w and mask[y, x] and not out[y, x]:
            out[y, x] = True
            q.append((y, x))
    while q:
        y, x = q.popleft()
        for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not out[ny, nx]:
                out[ny, nx] = True
                q.append((ny, nx))
    return out


def key_out_background(rgb: np.ndarray, *, extra_seeds=(), protect: np.ndarray | None = None, light=228) -> np.ndarray:
    """Return RGBA where the border-connected light background is transparent.

    Anti-aliased edge pixels get partial alpha and are un-matted so dark/red
    edges don't carry a pale fringe onto photo or gradient backgrounds.
    """
    h, w, _ = rgb.shape
    f = rgb.astype(np.float32)
    mn = f.min(axis=2)
    mx = f.max(axis=2)
    lightish = (mn > light) & ((mx - mn) < 22)
    seeds = [(0, 0), (0, w - 1), (h - 1, 0), (h - 1, w - 1)] + [(0, x) for x in range(0, w, 40)] + [(h - 1, x) for x in range(0, w, 40)] + [(y, 0) for y in range(0, h, 40)] + [(y, w - 1) for y in range(0, h, 40)]
    seeds += list(extra_seeds)
    bg = _flood(lightish, seeds)
    if protect is not None:
        bg &= ~protect
    # background colour estimate (median of bg pixels)
    bgc = np.median(f[bg], axis=0) if bg.any() else np.array([255, 255, 255], np.float32)

    alpha = np.ones((h, w), np.float32)
    alpha[bg] = 0
    # soft 2-px ring around the background for anti-aliased edges
    ring = np.array(Image.fromarray((bg * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5))).astype(bool) & ~bg
    d = np.max((bgc[None, None, :] - f) / np.maximum(bgc[None, None, :], 1), axis=2)
    ring_alpha = np.clip(d * 1.25, 0, 1)
    alpha[ring] = ring_alpha[ring]
    # un-matte: c = (c_obs - bg*(1-a)) / a
    a3 = alpha[..., None]
    col = np.where(a3 > 0.02, (f - bgc[None, None, :] * (1 - a3)) / np.maximum(a3, 0.02), f)
    out = np.concatenate([np.clip(col, 0, 255), (alpha * 255)[..., None]], axis=2)
    return out.astype(np.uint8)


# ───────────────────────── pin gradient + gloss ─────────────────────────
def glossy_pin(rgba: np.ndarray) -> np.ndarray:
    arr = rgba.astype(np.float32)
    r, g, b, a = arr[..., 0], arr[..., 1], arr[..., 2], arr[..., 3]
    visible = a > 0
    red = visible & (r > 90) & (r > 1.5 * g) & (r > 1.5 * b)
    mask = np.array(Image.fromarray((red * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))).astype(np.float32) / 255
    mask *= visible
    h, w = red.shape
    ys = np.where(red.any(axis=1))[0]
    y0, y1 = ys.min(), ys.max()
    t = np.clip((np.arange(h) - y0) / max(1, y1 - y0), 0, 1)[:, None] * np.ones((1, w), np.float32)

    top_h, top_s, top_v = colorsys.rgb_to_hsv(*(c / 255 for c in TOP))
    bot_h, bot_s, bot_v = colorsys.rgb_to_hsv(*(c / 255 for c in BOTTOM))
    out = arr.copy()
    for y, x in zip(*np.where(mask > 0.02)):
        hh, ss, vv = colorsys.rgb_to_hsv(r[y, x] / 255, g[y, x] / 255, b[y, x] / 255)
        tt = t[y, x]
        rel = vv / 0.88
        nh = top_h + (bot_h - top_h) * tt
        ns = min(1.0, (top_s + (bot_s - top_s) * tt) * (0.85 + 0.15 * ss))
        nv = min(1.0, (top_v + (bot_v - top_v) * tt) * rel)
        nr, ng, nb = colorsys.hsv_to_rgb(nh % 1.0, ns, nv)
        m = mask[y, x]
        out[y, x, 0] = r[y, x] * (1 - m) + nr * 255 * m
        out[y, x, 1] = g[y, x] * (1 - m) + ng * 255 * m
        out[y, x, 2] = b[y, x] * (1 - m) + nb * 255 * m
    # soft highlight (upper-left ellipse) + glass band
    xs_, ys_ = np.where(red)[1], np.where(red)[0]
    px0, px1, py0, py1 = xs_.min(), xs_.max(), ys_.min(), ys_.max()
    pw, ph = px1 - px0, py1 - py0
    cx, cy = px0 + 0.36 * pw, py0 + 0.20 * ph
    rx, ry = 0.30 * pw, 0.17 * ph
    yy, xx = np.mgrid[0:h, 0:w]
    glow = np.exp(-(((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2) * 1.6) * 0.42
    band = np.clip(1 - t / 0.45, 0, 1) * 0.16
    sheen = np.clip(glow + band, 0, 0.5) * mask
    for c in range(3):
        out[..., c] = out[..., c] * (1 - sheen) + 255 * sheen
    out[..., 3] = a
    return np.clip(out, 0, 255).astype(np.uint8)


def crop_alpha(im: Image.Image, pad: int = 0) -> Image.Image:
    bbox = im.getbbox()
    if not bbox:
        return im
    l, t, r, b = bbox
    return im.crop((max(0, l - pad), max(0, t - pad), min(im.width, r + pad), min(im.height, b + pad)))


def fit(im: Image.Image, size: int, scale: float, bg=None) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0) if bg is None else bg + (255,))
    crop = crop_alpha(im)
    target = int(size * scale)
    ratio = min(target / crop.width, target / crop.height)
    resized = crop.resize((max(1, int(crop.width * ratio)), max(1, int(crop.height * ratio))), Image.LANCZOS)
    canvas.alpha_composite(resized, ((size - resized.width) // 2, (size - resized.height) // 2))
    return canvas


# ───────────────────────── AMASS ─────────────────────────
def build_amass():
    rgb = np.array(Image.open(MASTER).convert("RGB"))
    h, w, _ = rgb.shape
    f = rgb.astype(np.int32)
    dark = (f.max(axis=2) < 110)
    # The door is a light opening at the base of the (dark) house. It touches the
    # background along the bottom edge, so protect it from the flood fill: light
    # pixels in the lower third of the house that have dark wall on both sides.
    ys = np.where(dark.any(axis=1))[0]
    house_rows = ys[ys < int(h * 0.70)]  # above the wordmark
    hb = house_rows.max()
    protect = np.zeros((h, w), bool)
    for y in range(int(hb - 0.40 * (hb - house_rows.min())), hb + 1):
        row = dark[y]
        xs = np.where(row)[0]
        if len(xs) < 2:
            continue
        L, R = xs.min(), xs.max()
        light = (f[y, :, :].min(axis=1) > 200)
        for x in range(L, R):
            if light[x] and row[max(0, x - 80):x].any() and row[x:x + 80].any():
                protect[y, x] = True
    # pin hole → transparent (seed at hole centre = brightest light pixel inside the red ring bbox)
    red = (f[..., 0] > 90) & (f[..., 0] > 1.5 * f[..., 1]) & (f[..., 0] > 1.5 * f[..., 2])
    ry, rx = np.where(red)
    hole_seed = (int(ry.min() + 0.33 * (ry.max() - ry.min())), int(rx.min() + 0.5 * (rx.max() - rx.min())))
    rgba = key_out_background(rgb, extra_seeds=[hole_seed], protect=protect)
    # door: pure white, fully opaque
    rgba[protect] = (255, 255, 255, 255)
    rgba = glossy_pin(rgba)
    full = Image.fromarray(rgba, "RGBA")

    # split emblem / wordmark at the largest empty row gap
    alpha_rows = np.where((rgba[..., 3] > 0).any(axis=1))[0]
    gaps, prev = [], alpha_rows[0]
    for r_ in alpha_rows[1:]:
        if r_ - prev > 8:
            gaps.append((prev, r_))
        prev = r_
    split = max(gaps, key=lambda g: g[1] - g[0])
    emblem = crop_alpha(full.crop((0, 0, w, split[0] + 2)))
    wordmark = crop_alpha(full.crop((0, split[1] - 2, w, h)))
    lockup = crop_alpha(full, pad=6)

    lockup.save(os.path.join(IMG, "amass-lockup.png"))
    emblem.save(os.path.join(IMG, "amass-emblem-glossy.png"))
    wordmark.save(os.path.join(IMG, "amass-wordmark.png"))
    fit(emblem, 1024, 0.72, bg=(255, 255, 255)).convert("RGB").save(os.path.join(IMG, "amass-icon-square.png"))
    fit(emblem, 1024, 0.56).save(os.path.join(IMG, "amass-adaptive-foreground.png"))
    fit(emblem, 1024, 0.62).save(os.path.join(IMG, "amass-splash.png"))
    fit(emblem, 196, 0.80, bg=(255, 255, 255)).convert("RGB").save(os.path.join(IMG, "favicon.png"))
    fit(emblem, 512, 0.72, bg=(255, 255, 255)).convert("RGB").save(os.path.join(IMG, "playstore-icon-512.png"))
    white = Image.new("RGBA", emblem.size, (255, 255, 255, 0))
    white.putalpha(emblem.split()[3])
    fit(white, 96, 0.86).save(os.path.join(IMG, "notification-icon.png"))
    print("AMASS lockup", lockup.size, "emblem", emblem.size, "wordmark", wordmark.size)
    print("  aspect lockup %.4f emblem %.4f wordmark %.4f" % (lockup.width / lockup.height, emblem.width / emblem.height, wordmark.width / wordmark.height))


# ───────────────────────── FIXA ─────────────────────────
def build_fixa():
    rgb = np.array(Image.open(FIXA).convert("RGB"))
    f = rgb.astype(np.int32)
    white = (f.min(axis=2) > 240)
    ys, xs = np.where(white)
    cy0, cy1, cx0, cx1 = ys.min(), ys.max(), xs.min(), xs.max()
    # inset to escape the rounded corners of the card
    card = rgb[cy0 + 40 : cy1 - 40, cx0 + 40 : cx1 - 40]
    sub = card.astype(np.int32)
    content = ~(sub.min(axis=2) > 235)
    rows = np.where(content.any(axis=1))[0]
    gaps, prev = [], rows[0]
    for r_ in rows[1:]:
        if r_ - prev > 8:
            gaps.append((prev, r_))
        prev = r_
    # content blocks: [hat+PRO] gap [FIXA®] gap [tagline...]
    blocks, start = [], rows[0]
    for g0, g1 in gaps:
        blocks.append((start, g0))
        start = g1
    blocks.append((start, rows[-1]))
    blocks = [b for b in blocks if b[1] - b[0] > 20]
    hat_b, fixa_b = blocks[0], blocks[1]
    rgba = key_out_background(card, light=236)
    full = Image.fromarray(rgba, "RGBA")
    lockup = crop_alpha(full.crop((0, max(0, hat_b[0] - 6), full.width, fixa_b[1] + 8)), pad=4)
    hat = crop_alpha(full.crop((0, max(0, hat_b[0] - 6), full.width, hat_b[1] + 6)), pad=4)
    lockup.save(os.path.join(IMG, "fixa-pro-lockup.png"))
    hat.save(os.path.join(IMG, "fixa-hat.png"))
    print("FIXA lockup", lockup.size, "hat", hat.size, "aspect %.4f / %.4f" % (lockup.width / lockup.height, hat.width / hat.height))


if __name__ == "__main__":
    build_amass()
    build_fixa()
