"""
AMASS — Apple App Store marketing assets (iPhone 6.7" / 6.5").

Outputs (assets/images/appstore-ios/):
  • screenshots/ios-screenshot-01…10.png  → 1284 × 2778 portrait
  • app-previews/ios-preview-01…03.png     → 2778 × 1284 landscape

Slide 01 is the app-open moment (glossy lockup over the Lagos skyline); the rest are live captures from
scripts/capture_store_screens.py framed in an iPhone body with Dynamic Island. Shared toolkit: store_common.py.

Run:  python3 scripts/generate_appstore_ios.py
"""
from __future__ import annotations

import os

from store_common import PREVIEWS, SLIDES, build_landscape, build_portrait

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_BASE = os.path.normpath(os.path.join(HERE, "..", "assets", "images", "appstore-ios"))
OUT_PORTRAIT = os.path.join(OUT_BASE, "screenshots")
OUT_LANDSCAPE = os.path.join(OUT_BASE, "app-previews")
os.makedirs(OUT_PORTRAIT, exist_ok=True)
os.makedirs(OUT_LANDSCAPE, exist_ok=True)

# App Store allows up to 10 screenshots per device size.
ORDER = ["intro", "map", "property", "my_home", "chat", "ai", "market", "fixa", "wallet", "agent"]


def main() -> None:
    print("=== iOS PORTRAIT SCREENSHOTS (1284×2778) ===")
    for i, key in enumerate(ORDER, start=1):
        theme, shot, eyebrow, head, sub = SLIDES[key]
        out = build_portrait(i, len(ORDER), theme, shot, f"{i:02d} · {eyebrow}", head, sub, "ios", os.path.join(OUT_PORTRAIT, f"ios-screenshot-{i:02d}.png"))
        print(f"  [{i:02d}/{len(ORDER)}] {out} ({os.path.getsize(out) / 1024:.0f} KB)")
    print("\n=== iOS LANDSCAPE APP PREVIEWS (2778×1284) ===")
    for i, (theme, shots, eyebrow, head, sub) in enumerate(PREVIEWS, start=1):
        out = build_landscape(i, theme, shots, eyebrow, head, sub, "ios", os.path.join(OUT_LANDSCAPE, f"ios-preview-{i:02d}.png"), "AMASS · PREVIEW")
        print(f"  [{i:02d}/{len(PREVIEWS):02d}] {out} ({os.path.getsize(out) / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
