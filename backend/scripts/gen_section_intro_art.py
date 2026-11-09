"""One-off: generate the artwork for the Marketplace section intros with Gemini (Nano Banana):

  brands  — colourful, photo-real product shots of new and pre-owned home items (6 squares)
  fixa    — candid snapshots of FIXA pros at work (3 squares)
  declutter — an open moving box + pre-owned finds (4 squares)

Saved as compact 512 px WebPs under frontend/assets/images/intro/.

Run:  cd /app/backend && python3 scripts/gen_section_intro_art.py [brands|fixa|declutter]
"""
import asyncio
import base64
import io
import os
import sys

from dotenv import load_dotenv
from PIL import Image

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
from emergentintegrations.llm.chat import LlmChat, UserMessage  # noqa: E402

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "assets", "images", "intro")

PRODUCT = (
    "Premium e-commerce product photograph, photo-realistic, ultra sharp, 8k detail, soft studio lighting, "
    "gentle floor shadow, square 1:1 composition, the item centred and filling about 70% of the frame on a smooth "
    "seamless {bg} studio background. No people, no text, no letters, no logos, no watermarks."
)
BRANDS = {
    "item-sofa": PRODUCT.format(bg="pastel coral pink") + " Subject: a brand-new modern three-seat sofa in deep emerald green velvet with brass legs.",
    "item-fridge": PRODUCT.format(bg="pale sky blue") + " Subject: a brand-new tall brushed-stainless-steel double-door refrigerator with the doors closed.",
    "item-tv": PRODUCT.format(bg="soft lavender") + " Subject: a brand-new 65-inch ultra-thin smart TV on a slim stand, screen showing an abstract colourful gradient.",
    "item-lamp": PRODUCT.format(bg="warm butter yellow") + " Subject: a brand-new designer pendant lamp with a hand-blown amber glass shade, switched on with a warm glow.",
    "item-armchair": PRODUCT.format(bg="sage green") + " Subject: a pre-owned, gently worn vintage cognac leather armchair with a beautiful patina — clearly second-hand but well cared for.",
    "item-mixer": PRODUCT.format(bg="pastel peach") + " Subject: a pre-owned retro cream-coloured stand mixer with a steel bowl, a few light signs of use, lovingly kept.",
}

SNAPSHOT = (
    "Candid documentary photograph, photo-realistic, natural light, shallow depth of field, square 1:1, "
    "a professional Nigerian tradesperson at work in a modern Lagos home, wearing a lime-green work shirt. "
    "No text, no letters, no logos, no watermarks."
)
FIXA = {
    "pro-plumber": SNAPSHOT + " Subject: a plumber kneeling under a kitchen sink, tightening a pipe fitting with a wrench, tools laid out beside him.",
    "pro-electrician": SNAPSHOT + " Subject: an electrician in safety glasses working on a wall-mounted distribution board with a screwdriver and a multimeter.",
    "pro-painter": SNAPSHOT + " Subject: a painter rolling fresh warm-white paint onto a living-room wall, paint tray and ladder nearby.",
}

# declutter — pre-owned finds that "fly into the box" + the open moving box they land in.
# Backgrounds use the Declutter teal so the squares sit naturally on the section gradient (#2DD4BF → #0F766E).
DECLUTTER = {
    "box-open": (
        "Premium product photograph, photo-realistic, ultra sharp, soft studio lighting, square 1:1, "
        "a single sturdy open cardboard moving box seen from the front and slightly above, all four flaps folded open "
        "outward, empty inside, centred and filling about 75% of the frame, gentle floor shadow, on a smooth seamless "
        "deep teal (#0F766E) studio background. No people, no text, no letters, no logos, no tape print, no watermarks."
    ),
    "item-bike": PRODUCT.format(bg="soft mint") + " Subject: a pre-owned classic city bicycle in dusty blue with a wicker basket, a few honest scuffs, clean and ready to ride.",
    "item-guitar": PRODUCT.format(bg="pale teal") + " Subject: a pre-owned acoustic guitar with a warm sunburst finish and light pick-wear around the sound hole, well loved.",
    "item-fan": PRODUCT.format(bg="light aqua") + " Subject: a pre-owned white pedestal standing fan, slightly used, clean, standing upright.",
}


async def gen(name: str, prompt: str, api_key: str):
    path = os.path.join(OUT, f"{name}.webp")
    if os.path.exists(path):
        print("skip (exists)", name)
        return
    chat = LlmChat(api_key=api_key, session_id=f"intro-{name}", system_message="You are a premium commercial photographer.")
    chat.with_model("gemini", "gemini-3.1-flash-image-preview").with_params(modalities=["image", "text"])
    _text, images = await chat.send_message_multimodal_response(UserMessage(text=prompt))
    if not images:
        print("✗ no image for", name)
        return
    img = Image.open(io.BytesIO(base64.b64decode(images[0]["data"]))).convert("RGB")
    # centre-crop to a square, then shrink
    w, h = img.size
    s = min(w, h)
    img = img.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s)).resize((512, 512), Image.LANCZOS)
    img.save(path, "WEBP", quality=84, method=6)
    print("✓", name, os.path.getsize(path) // 1024, "KB")


async def main(groups):
    os.makedirs(OUT, exist_ok=True)
    api_key = os.environ["EMERGENT_LLM_KEY"]
    jobs = {}
    if "brands" in groups:
        jobs.update(BRANDS)
    if "fixa" in groups:
        jobs.update(FIXA)
    if "declutter" in groups:
        jobs.update(DECLUTTER)
    # a few at a time — the image model is slow and rate-limited
    items = list(jobs.items())
    for i in range(0, len(items), 3):
        await asyncio.gather(*(gen(n, p, api_key) for n, p in items[i : i + 3]))


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1:] or ["brands", "fixa"]))
