"""One-off: split the AMASS lockup master into layers so the app-open intro can swing the door open.

  amass-lockup-doorless.png  — the lockup exactly as supplied, with the door cut out (transparent)
  amass-door.png             — the door alone, tight crop (hinge = its left edge)
  amass-door-glow.png        — soft golden "welcome home" light that spills out behind the opening door

Run:  cd /app/backend && python3 scripts/gen_logo_door_layers.py
Prints the door's box as fractions of the lockup — paste into src/components/intro/DoorLockup.tsx (DOOR constant).
"""
import os

import numpy as np
from PIL import Image, ImageFilter

IMG = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "assets", "images")
SRC = os.path.join(IMG, "amass-lockup.png")


def main():
    lockup = Image.open(SRC).convert("RGBA")
    W, H = lockup.size
    arr = np.asarray(lockup).astype(int)
    a, r, g, b = arr[..., 3], arr[..., 0], arr[..., 1], arr[..., 2]
    # Ink = opaque-ish and dark (the roof, chimney, door and wordmark; never the red pin).
    ink = (a > 40) & (r < 110) & (g < 110) & (b < 110)

    # The door is the dark arch under the roof apex: seed a flood fill where the artwork puts it
    # (≈ 61 % across, 85 % down the emblem; the emblem is the top 618 px of the 876 px master).
    emblem_h = round(H * 618 / 876)
    seed = (int(W * 0.615), int(emblem_h * 0.86))
    sx, sy = seed
    if not ink[sy, sx]:
        raise SystemExit(f"seed {seed} is not on the artwork's ink — adjust it")
    # Flood fill = binary reconstruction: grow the seed one pixel at a time, never leaving the ink.
    door = np.zeros_like(ink)
    door[sy, sx] = True
    while True:
        grown = door.copy()
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dx or dy:
                    grown |= np.roll(np.roll(door, dy, axis=0), dx, axis=1)
        grown &= ink
        if np.array_equal(grown, door):
            break
        door = grown
    ys, xs = np.where(door)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    print(f"door px box: x {x0}-{x1}  y {y0}-{y1}  ({x1 - x0}×{y1 - y0}) of {W}×{H}")
    assert (x1 - x0) < W * 0.25 and (y1 - y0) < H * 0.3, "flood fill escaped the door — check the seed"

    # Soft cut: grow the door mask 2 px so anti-aliased edge pixels travel with the door, not the house.
    door_mask = Image.fromarray((door * 255).astype(np.uint8), "L").filter(ImageFilter.MaxFilter(5))
    dm = np.asarray(door_mask) > 0

    rgba = np.asarray(lockup).copy()
    doorless = rgba.copy()
    doorless[..., 3] = np.where(dm, 0, doorless[..., 3])
    Image.fromarray(doorless, "RGBA").save(os.path.join(IMG, "amass-lockup-doorless.png"), optimize=True)

    door_only = rgba.copy()
    door_only[..., 3] = np.where(dm, door_only[..., 3], 0)
    pad = 2
    crop = Image.fromarray(door_only, "RGBA").crop((x0 - pad, y0 - pad, x1 + pad, y1 + pad))
    crop.save(os.path.join(IMG, "amass-door.png"), optimize=True)

    # Golden glow — radial, warm, premultiplied-looking soft falloff.
    S = 320
    yy, xx = np.mgrid[0:S, 0:S]
    d = np.sqrt((xx - S / 2) ** 2 + (yy - S / 2) ** 2) / (S / 2)
    alpha = np.clip(1 - d, 0, 1) ** 2.2
    glow = np.zeros((S, S, 4), np.uint8)
    glow[..., 0] = 255
    glow[..., 1] = (200 + 40 * (1 - alpha)).astype(np.uint8)   # #FFC8.. → paler at the rim
    glow[..., 2] = (90 + 120 * (1 - alpha)).astype(np.uint8)
    glow[..., 3] = (alpha * 235).astype(np.uint8)
    Image.fromarray(glow, "RGBA").save(os.path.join(IMG, "amass-door-glow.png"), optimize=True)

    bx, by, bw, bh = (x0 - pad) / W, (y0 - pad) / H, (x1 - x0 + 2 * pad) / W, (y1 - y0 + 2 * pad) / H
    print("DOOR = { left: %.4f, top: %.4f, width: %.4f, height: %.4f }  // fractions of the lockup" % (bx, by, bw, bh))
    print("lockup", W, H, "aspect", round(W / H, 4))


if __name__ == "__main__":
    main()
