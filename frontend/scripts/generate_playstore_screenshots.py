"""
AMASS Play Store phone screenshots generator.

Creates 5 marketing screenshots at 1080x1920 (9:16, native Play Store phone spec).
Each composite = branded rose header + big headline + framed app screenshot below.

Source screenshots captured via Playwright at /tmp/amass_shots/*.png at 390x844.

Run: python3 scripts/generate_playstore_screenshots.py
"""
from __future__ import annotations

import math
import os
import random

from PIL import Image, ImageDraw, ImageFilter, ImageFont

# ─── target canvas ────────────────────────────────────────────────────
W, H = 1080, 1920

SHOTS_IN = "/tmp/amass_shots"
OUT_DIR = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "assets", "images", "playstore-screenshots")
)
os.makedirs(OUT_DIR, exist_ok=True)

# ─── brand palette (locked to feature graphic) ────────────────────────
ROSE_DEEP = (159, 18, 57)
ROSE_CORE = (225, 29, 72)
ROSE_WARM = (244, 63, 94)
INK = (28, 8, 16)
WHITE = (255, 255, 255)


def _font(size: int, bold: bool = True) -> ImageFont.FreeTypeFont:
    p = (
        "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf"
        if bold
        else "/usr/share/fonts/truetype/freefont/FreeSans.ttf"
    )
    if os.path.exists(p):
        return ImageFont.truetype(p, size)
    return ImageFont.load_default()


# ─── diagonal rose gradient (reused from feature graphic) ─────────────
def diagonal_gradient(size, top_left, bottom_right, mid=None):
    w, h = size
    grad = Image.new("RGB", (w, h), top_left)
    px = grad.load()
    for y in range(h):
        for x in range(w):
            t = (x + y) / (w + h - 2)
            if mid and t < 0.55:
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


def add_glow(img, center, radius, color, strength=0.35):
    glow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(glow)
    cx, cy = center
    d.ellipse(
        [cx - radius, cy - radius, cx + radius, cy + radius],
        fill=(*color, int(255 * strength)),
    )
    glow = glow.filter(ImageFilter.GaussianBlur(radius=radius // 2))
    img.alpha_composite(glow)


# ─── phone frame: rounded rect with drop shadow ───────────────────────
def framed_phone(shot_path: str, target_w: int, corner: int = 46) -> Image.Image:
    """Return an RGBA image of the screenshot with rounded corners + shadow."""
    src = Image.open(shot_path).convert("RGB")
    # scale to target_w preserving aspect
    aspect = src.height / src.width
    target_h = int(target_w * aspect)
    src = src.resize((target_w, target_h), Image.LANCZOS)

    # rounded-corner mask
    mask = Image.new("L", (target_w, target_h), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, target_w, target_h], radius=corner, fill=255
    )
    rounded = Image.new("RGBA", (target_w, target_h), (0, 0, 0, 0))
    rounded.paste(src, (0, 0), mask)

    # thin white border
    border = Image.new("RGBA", (target_w, target_h), (0, 0, 0, 0))
    ImageDraw.Draw(border).rounded_rectangle(
        [1, 1, target_w - 1, target_h - 1],
        radius=corner,
        outline=(255, 255, 255, 210),
        width=4,
    )
    rounded = Image.alpha_composite(rounded, border)

    # composite onto larger transparent canvas with room for shadow
    pad = 60
    canvas = Image.new("RGBA", (target_w + pad * 2, target_h + pad * 2), (0, 0, 0, 0))

    # shadow layer
    sh = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(sh)
    sd.rounded_rectangle(
        [pad + 6, pad + 22, pad + target_w + 6, pad + target_h + 22],
        radius=corner,
        fill=(0, 0, 0, 170),
    )
    sh = sh.filter(ImageFilter.GaussianBlur(30))
    canvas.alpha_composite(sh)

    canvas.paste(rounded, (pad, pad), rounded)
    return canvas


# ─── build one screenshot ─────────────────────────────────────────────
def build_one(
    idx: int,
    shot: str,
    headline: str,
    subline: str,
    chip: str,
) -> str:
    # background
    bg = diagonal_gradient((W, H), ROSE_WARM, ROSE_DEEP, mid=ROSE_CORE).convert("RGBA")
    add_glow(bg, (240, 260), 640, (255, 200, 215), strength=0.30)
    add_glow(bg, (900, 1700), 600, (120, 6, 40), strength=0.32)

    draw = ImageDraw.Draw(bg, "RGBA")

    # ── chip / eyebrow at top ────────────────────────────────────────
    chip_font = _font(30)
    chip_w = draw.textlength(chip, font=chip_font)
    chip_padx, chip_pady = 26, 16
    chip_x, chip_y = 90, 100
    chip_box = (
        chip_x, chip_y,
        chip_x + int(chip_w) + chip_padx * 2,
        chip_y + 32 + chip_pady * 2,
    )
    chip_layer = Image.new("RGBA", bg.size, (0, 0, 0, 0))
    cd = ImageDraw.Draw(chip_layer)
    cd.rounded_rectangle(chip_box, radius=999, fill=(255, 255, 255, 50))
    cd.rounded_rectangle(chip_box, radius=999, outline=(255, 255, 255, 170), width=3)
    bg = Image.alpha_composite(bg, chip_layer)
    draw = ImageDraw.Draw(bg, "RGBA")
    draw.text((chip_x + chip_padx, chip_y + chip_pady - 2), chip, font=chip_font, fill=WHITE)

    # ── big headline (wrap manually into 2-3 lines) ──────────────────
    head_font = _font(76)
    max_w = W - 180

    def wrap(text: str, font, max_width: int) -> list[str]:
        words = text.split()
        lines, cur = [], ""
        for w in words:
            trial = (cur + " " + w).strip()
            if draw.textlength(trial, font=font) <= max_width:
                cur = trial
            else:
                if cur:
                    lines.append(cur)
                cur = w
        if cur:
            lines.append(cur)
        return lines

    lines = wrap(headline, head_font, max_w)
    y = chip_y + 32 + chip_pady * 2 + 44
    for ln in lines:
        # subtle shadow
        draw.text((92, y + 4), ln, font=head_font, fill=(0, 0, 0, 70))
        draw.text((90, y), ln, font=head_font, fill=WHITE)
        y += head_font.size + 8

    # ── subline (1-2 lines) ──────────────────────────────────────────
    sub_font = _font(34, bold=False)
    sub_lines = wrap(subline, sub_font, max_w)
    y += 8
    for ln in sub_lines:
        draw.text((90, y), ln, font=sub_font, fill=(255, 255, 255, 230))
        y += sub_font.size + 6

    # thin accent bar
    draw.rectangle([90, y + 12, 190, y + 18], fill=(255, 255, 255, 230))

    # ── phone screenshot ─────────────────────────────────────────────
    if os.path.exists(shot):
        phone = framed_phone(shot, target_w=620, corner=48)
        # position lower-center — leave clean headline zone on top
        px_x = (W - phone.width) // 2
        px_y = H - phone.height - 30
        bg.alpha_composite(phone, (px_x, px_y))

    # ── AMASS wordmark bottom-left tag ───────────────────────────────
    tag_font = _font(28, bold=True)
    tag = "AMASS"
    dot_r = 10
    tag_x, tag_y = 90, H - 84
    draw = ImageDraw.Draw(bg, "RGBA")
    draw.ellipse(
        [tag_x, tag_y + 8, tag_x + dot_r * 2, tag_y + 8 + dot_r * 2],
        fill=(255, 255, 255, 240),
    )
    draw.text((tag_x + dot_r * 2 + 12, tag_y - 2), tag, font=tag_font, fill=(255, 255, 255, 240))

    # subtle grain
    random.seed(idx * 7 + 3)
    grain = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grain)
    for _ in range(2400):
        gd.point(
            (random.randint(0, W - 1), random.randint(0, H - 1)),
            fill=(255, 255, 255, random.randint(4, 14)),
        )
    for _ in range(1200):
        gd.point(
            (random.randint(0, W - 1), random.randint(0, H - 1)),
            fill=(0, 0, 0, random.randint(4, 14)),
        )
    bg = Image.alpha_composite(bg, grain)

    out = os.path.join(OUT_DIR, f"screenshot-{idx:02d}.png")
    bg.convert("RGB").save(out, "PNG", optimize=True)
    return out


# ─── screenshot spec (5 shots for Play Store) ─────────────────────────
SPECS = [
    dict(
        shot=f"{SHOTS_IN}/B_map.png",
        chip="STEP 01 · DISCOVER",
        headline="Every home on one map — from Lekki to Abuja.",
        subline="Redfin-style filters for sale, rent, land & commercial.",
    ),
    dict(
        shot=f"{SHOTS_IN}/C_discover.png",
        chip="STEP 02 · INTELLIGENCE",
        headline="Trending areas & live neighborhood scores.",
        subline="Walk, schools, safety, infra — score every block before you buy.",
    ),
    dict(
        shot=f"{SHOTS_IN}/D_marketplace.png",
        chip="STEP 03 · MARKETPLACE",
        headline="Buy, sell & book — all in one place.",
        subline="Homes, appliances, furniture, decluttering & FIXA services.",
    ),
    dict(
        shot=f"{SHOTS_IN}/H_wallet.png",
        chip="STEP 04 · EARN & UNLOCK",
        headline="Earn MASS tokens. Unlock verified listings.",
        subline="Refer friends, complete tasks, and save on premium features.",
    ),
    dict(
        shot=f"{SHOTS_IN}/01_onboard_a.png",
        chip="STEP 05 · BUILT FOR AFRICA",
        headline="Africa's property OS — verified, valued, yours.",
        subline="AI valuations, property passports, GPS verification — end to end.",
    ),
]


def main() -> None:
    for i, s in enumerate(SPECS, start=1):
        out = build_one(i, s["shot"], s["headline"], s["subline"], s["chip"])
        print(
            f"[{i}/{len(SPECS)}] {out}  "
            f"({os.path.getsize(out)/1024:.1f} KB)"
        )


if __name__ == "__main__":
    main()
