"""One-off: generate the app-open backdrop (clean open sky over Lagos homes + an African skyline) with
Gemini Nano Banana, fade its top edge to transparency so it blends into the in-app gradient sky, and
save a compact WebP to the Expo assets folder.

Run:  cd /app/backend && python scripts/gen_intro_skyline.py
Prints the sky colours sampled at the blend edge — paste them into app/index.tsx (SKY_* constants).
"""
import asyncio
import base64
import io
import os

from dotenv import load_dotenv
from PIL import Image

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
from emergentintegrations.llm.chat import LlmChat, UserMessage  # noqa: E402

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "assets", "images", "intro-skyline.webp")

PROMPT = (
    "Premium cinematic illustration, painterly 3D-render style, soft golden morning light. Square 1:1 composition. "
    "BOTTOM 45%: a row of beautiful modern Lagos, Nigeria homes in the foreground — Lekki and Ikoyi style villas with "
    "flat roofs, warm cream and white walls, glass balconies, terracotta accents, lush palm trees and bougainvillea — "
    "and behind them the Lagos skyline: Eko Atlantic glass towers, Civic Towers, NECOM House, the Third Mainland Bridge "
    "curving across the lagoon in the hazy distance. "
    "TOP 55%: a clean, beautiful, calm open sky — smooth gradient from light azure blue at the very top to a pale warm "
    "peach-white glow just above the rooftops, with two or three soft wispy clouds low near the horizon only; the upper "
    "sky must be completely clear and uncluttered. "
    "No people, no cars, no birds, no text, no letters, no numbers, no logos, no watermarks, no map pins, no UI."
)


def fade_top(img: Image.Image, start: float = 0.0, end: float = 0.36) -> Image.Image:
    """Alpha-fade rows from fully transparent at `start` to opaque at `end` (fractions of height)."""
    img = img.convert("RGBA")
    w, h = img.size
    band = img.split()[3]
    alpha = band.load()
    y0, y1 = int(h * start), int(h * end)
    for y in range(0, y1):
        a = 0.0 if y <= y0 else (y - y0) / max(1, (y1 - y0))
        a = a * a * (3 - 2 * a)  # smoothstep
        for x in range(w):
            alpha[x, y] = int(alpha[x, y] * a)
    img.putalpha(band)
    return img


async def main():
    api_key = os.environ["EMERGENT_LLM_KEY"]
    chat = LlmChat(api_key=api_key, session_id="intro-skyline", system_message="You are a premium brand illustrator.")
    chat.with_model("gemini", "gemini-3.1-flash-image-preview").with_params(modalities=["image", "text"])
    _text, images = await chat.send_message_multimodal_response(UserMessage(text=PROMPT))
    if not images:
        raise SystemExit("no image returned")
    img = Image.open(io.BytesIO(base64.b64decode(images[0]["data"]))).convert("RGB")
    img.thumbnail((1080, 1080), Image.LANCZOS)
    w, h = img.size
    # Sky colours for the in-app gradient: top row, blend edge (36 %) and just above the rooftops (~52 %).
    px = img.load()
    def row_avg(frac):
        y = min(h - 1, int(h * frac)); r = g = b = 0
        for x in range(0, w, 8):
            pr, pg, pb = px[x, y]; r += pr; g += pg; b += pb
        n = len(range(0, w, 8)); return "#%02X%02X%02X" % (r // n, g // n, b // n)
    print("SKY_TOP", row_avg(0.02), " SKY_BLEND", row_avg(0.36), " SKY_HORIZON", row_avg(0.52))
    img.save(OUT.replace(".webp", "-raw.png"))
    faded = fade_top(img)
    faded.save(OUT, "WEBP", quality=86, method=6)
    print("saved", OUT, faded.size, os.path.getsize(OUT) // 1024, "KB")


if __name__ == "__main__":
    asyncio.run(main())
