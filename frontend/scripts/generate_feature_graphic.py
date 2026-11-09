"""
AMASS — Google Play feature graphic (1024 × 500).

The app-open moment as a banner: open sky, the Lagos skyline with price markers popping over the rooftops on
the right, the glossy AMASS lockup and tagline on the left. Shared toolkit: store_common.py.

Run:  python3 scripts/generate_feature_graphic.py
"""
from __future__ import annotations

import os

from PIL import Image, ImageDraw, ImageFilter

from store_common import IMG, RED, SKY_INK, canvas_bg, font, grain, lockup_stacked, price_pin

W, H = 1024, 500
OUT = os.path.join(IMG, "playstore-feature-graphic.png")


def build() -> None:
    img = canvas_bg((W, H), "sky")

    # skyline on the right, bottom-anchored, top edge already faded by the asset
    sky = Image.open(os.path.join(IMG, "intro-skyline.webp")).convert("RGBA")
    sw = 760
    sky = sky.resize((sw, sw), Image.LANCZOS)
    img.alpha_composite(sky, (W - sw + 40, H - sw + 150))
    # soften the left edge of the artwork so it melts into the sky behind the copy
    veil = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(veil).rectangle([0, 0, 500, H], fill=(0xCB, 0xE6, 0xEB, 200))
    img.alpha_composite(veil.filter(ImageFilter.GaussianBlur(70)))

    # price markers over the rooftops (app pins at 3× → scaled to banner size)
    pins = Image.new("RGBA", (W * 3, H * 3), (0, 0, 0, 0))
    pd = ImageDraw.Draw(pins, "RGBA")
    price_pin(pd, 1860, 1120, "₦185M", "sale")
    price_pin(pd, 2340, 1010, "₦4.5M/yr", "rent")
    price_pin(pd, 2760, 1150, "₦250M", "sale")
    price_pin(pd, 2140, 1300, "₦180k/night", "shortlet")
    img.alpha_composite(pins.resize((W, H), Image.LANCZOS))

    # lockup + copy on the left
    lk = lockup_stacked(230)
    img.alpha_composite(lk, (72, 58))
    d = ImageDraw.Draw(img, "RGBA")
    tf = font(21, 700)
    tag = "AFRICA’S PROPERTY OPERATING SYSTEM"
    d.rounded_rectangle([72, 318, 72 + 44, 318 + 4], radius=2, fill=RED)
    d.text((72, 336), tag, font=tf, fill=SKY_INK)
    sf = font(19, 500)
    d.text((72, 372), "Verified homes · Live map · FIXA pros", font=sf, fill=(70, 95, 110))

    # store-style pill
    pf = font(17, 700)
    label = "Download free"
    tw = d.textlength(label, font=pf)
    d.rounded_rectangle([72, 414, 72 + tw + 44, 414 + 44], radius=22, fill=(*SKY_INK, 255))
    d.text((72 + 22, 414 + 12), label, font=pf, fill=(255, 255, 255))

    img = grain(img, 1800)
    img.convert("RGB").save(OUT, "PNG", optimize=True)
    print("saved", OUT, f"{os.path.getsize(OUT) / 1024:.0f} KB")


if __name__ == "__main__":
    build()
