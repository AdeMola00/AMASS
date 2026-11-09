"""
AMASS — Google Play Store marketing assets.

Outputs (assets/images/playstore-v2/):
  • screenshots/screenshot-01…08.png   → 1284 × 2778 portrait (Play accepts 2–8 phone screenshots)
  • app-previews/preview-01…03.png     → 2778 × 1284 landscape (7"/10" tablet slots or listing hero art)

Slide 01 is the app-open moment (glossy lockup over the Lagos skyline); the rest are live captures from
scripts/capture_store_screens.py framed in an Android body with a punch-hole camera. Shared toolkit: store_common.py.
The 1024 × 500 feature graphic lives in generate_feature_graphic.py.

Run:  python3 scripts/generate_playstore_v2.py
"""
from __future__ import annotations

import os

from store_common import PREVIEWS, SLIDES, build_landscape, build_portrait

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_BASE = os.path.normpath(os.path.join(HERE, "..", "assets", "images", "playstore-v2"))
OUT_PORTRAIT = os.path.join(OUT_BASE, "screenshots")
OUT_LANDSCAPE = os.path.join(OUT_BASE, "app-previews")
os.makedirs(OUT_PORTRAIT, exist_ok=True)
os.makedirs(OUT_LANDSCAPE, exist_ok=True)

ORDER = ["intro", "map", "property", "my_home", "chat", "market", "fixa", "wallet"]


def main() -> None:
    print("=== PLAY PORTRAIT SCREENSHOTS (1284×2778) ===")
    for i, key in enumerate(ORDER, start=1):
        theme, shot, eyebrow, head, sub = SLIDES[key]
        out = build_portrait(i, len(ORDER), theme, shot, f"{i:02d} · {eyebrow}", head, sub, "android", os.path.join(OUT_PORTRAIT, f"screenshot-{i:02d}.png"))
        print(f"  [{i:02d}/{len(ORDER)}] {out} ({os.path.getsize(out) / 1024:.0f} KB)")
    print("\n=== PLAY LANDSCAPE PREVIEWS (2778×1284) ===")
    for i, (theme, shots, eyebrow, head, sub) in enumerate(PREVIEWS, start=1):
        out = build_landscape(i, theme, shots, eyebrow, head, sub, "android", os.path.join(OUT_LANDSCAPE, f"preview-{i:02d}.png"), "AMASS · GOOGLE PLAY")
        print(f"  [{i:02d}/{len(PREVIEWS):02d}] {out} ({os.path.getsize(out) / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
