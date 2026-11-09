"""Key the studio backdrop out of box-open.webp (Declutter intro) → RGBA WebP with a soft alpha matte."""
import os

import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(__file__)
SRC = os.path.join(HERE, "..", "..", "frontend", "assets", "images", "intro", "box-open.webp")
OUT = os.path.join(HERE, "..", "..", "frontend", "assets", "images", "intro", "box-cutout.webp")

img = Image.open(SRC).convert("RGB")
a = np.asarray(img).astype(np.float32)
h, w, _ = a.shape

# Backdrop colour per row: the studio background is a smooth vertical gradient, so sample the
# left/right 4 % of every row (the box never reaches the edges) and interpolate across the row.
edge = max(4, w // 25)
left = a[:, :edge].mean(axis=1)  # (h, 3)
right = a[:, -edge:].mean(axis=1)
t = np.linspace(0, 1, w)[None, :, None]
bg = left[:, None, :] * (1 - t) + right[:, None, :] * t

dist = np.sqrt(((a - bg) ** 2).sum(axis=2))  # colour distance to the backdrop
# soft matte: fully transparent within ~22 of the backdrop, fully opaque beyond ~60
alpha = np.clip((dist - 22.0) / 38.0, 0, 1)
# the box's floor shadow is darker teal → keep a hint of it (looks grounded on the gradient)
shadow = np.clip((bg.mean(axis=2) - a.mean(axis=2)) / 60.0, 0, 1) * (alpha < 0.5)
alpha = np.maximum(alpha, shadow * 0.35)

alpha_img = Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))
rgba = img.copy().convert("RGBA")
rgba.putalpha(alpha_img)
# tight crop to the opaque area + a small margin
bbox = Image.fromarray((np.asarray(alpha_img) > 40).astype(np.uint8) * 255).getbbox()
if bbox:
    m = 12
    rgba = rgba.crop((max(0, bbox[0] - m), max(0, bbox[1] - m), min(w, bbox[2] + m), min(h, bbox[3] + m)))
rgba.save(OUT, "WEBP", quality=90, method=6)
print("saved", OUT, rgba.size, os.path.getsize(OUT) // 1024, "KB")
