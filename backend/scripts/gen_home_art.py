"""Generate photo-real artwork for the My Home centre (Nano Banana via the Emergent LLM key).

    python3 scripts/gen_home_art.py            # all
    python3 scripts/gen_home_art.py sec-protect cat-ac

Writes WebP squares to frontend/assets/images/home/. Existing files are kept unless --force.
"""
from __future__ import annotations

import asyncio
import io
import os
import sys

from dotenv import load_dotenv
from PIL import Image

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
from emergentintegrations.llm.chat import LlmChat, UserMessage  # noqa: E402

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "assets", "images", "home")

PRODUCT = (
    "Premium e-commerce product photograph, photo-realistic, ultra sharp, soft studio lighting, square 1:1, "
    "the single item centred and filling about 70% of the frame on a smooth seamless {bg} studio background, "
    "gentle floor shadow. No people, no text, no letters, no logos, no watermarks."
)
SCENE = (
    "Warm, bright, editorial lifestyle photograph for a premium home-management app, photo-realistic, natural light, "
    "shallow depth of field, square 1:1, colourful but tasteful, West African urban home setting where relevant. "
    "No readable text, no letters, no logos, no watermarks, no visible faces."
)

JOBS = {
    # hero (used behind the home profile when no photo is set)
    "hero-home": SCENE + " Subject: the front of a modern two-storey family house in Lagos at golden hour, cream walls, warm lights on, lush green hedge and a paved drive, blue-pink sky.",
    # appliance categories
    "cat-washer": PRODUCT.format(bg="pale sky-blue") + " Subject: a modern white front-loading washing machine with a round glass door, slightly angled.",
    "cat-ac": PRODUCT.format(bg="soft mint") + " Subject: a sleek white split-unit wall air conditioner indoor unit, slightly angled.",
    "cat-generator": PRODUCT.format(bg="light warm grey") + " Subject: a compact red-and-black portable petrol generator with wheels and a handle.",
    "cat-inverter": PRODUCT.format(bg="pale lavender") + " Subject: a home power inverter unit beside a deep-cycle battery, clean and new.",
    "cat-laptop": PRODUCT.format(bg="soft peach") + " Subject: a slim silver laptop open at a slight angle, screen showing a soft gradient wallpaper.",
    "cat-phone": PRODUCT.format(bg="light aqua") + " Subject: a modern smartphone standing upright at a slight angle, screen showing a soft gradient wallpaper.",
    "cat-furniture": PRODUCT.format(bg="warm cream") + " Subject: a stylish teal three-seater fabric sofa with two mustard cushions.",
    "cat-kitchen": PRODUCT.format(bg="soft butter yellow") + " Subject: a group of small kitchen appliances — a red stand mixer, a kettle and a toaster — arranged together.",
    "cat-other": PRODUCT.format(bg="light sand") + " Subject: a wooden storage box with a few household objects (a lamp, a fan, a framed picture) neatly beside it.",
    # section covers
    "sec-appliances": SCENE + " Subject: a bright modern kitchen corner with a tall silver refrigerator, a washing machine and a wall air conditioner, sunlight through the window.",
    "sec-records": SCENE + " Subject: neatly organised receipts, warranty cards and a folder on a light wooden desk, a plant and a pen beside them, top-down view.",
    "sec-reminders": SCENE + " Subject: a wall calendar with colourful round stickers and a small analogue clock beside a potted plant on a shelf.",
    "sec-spending": SCENE + " Subject: a glass jar of coins, a few folded banknotes and a calculator on a kitchen table, morning light.",
    "sec-services": SCENE + " Subject: a technician's open toolbox with spanners, pliers and a screwdriver set on a tiled floor next to a kitchen cabinet.",
    "sec-protect": SCENE + " Subject: a small white model house sheltered under a bright red umbrella on a wooden table, soft daylight, calm and reassuring.",
    "sec-bills": SCENE + " Subject: a pin-board with utility bill envelopes clipped to it, a glowing LED bulb and a water tap icon made of paper, playful and tidy.",
}


async def gen(name: str, prompt: str, api_key: str, force: bool) -> None:
    dest = os.path.join(OUT, f"{name}.webp")
    if os.path.exists(dest) and not force:
        print(f"· {name} exists")
        return
    chat = LlmChat(api_key=api_key, session_id=f"home-art-{name}", system_message="You are a premium commercial photographer.")
    chat.with_model("gemini", "gemini-3.1-flash-image-preview").with_params(modalities=["image", "text"])
    _text, images = await chat.send_message_multimodal_response(UserMessage(text=prompt))
    if not images:
        print(f"✗ {name}: no image")
        return
    import base64

    raw = base64.b64decode(images[0]["data"])
    im = Image.open(io.BytesIO(raw)).convert("RGB")
    im.thumbnail((1024, 1024))
    im.save(dest, "WEBP", quality=82, method=6)
    print(f"✓ {name} {os.path.getsize(dest) // 1024} KB")


async def main(names: list[str], force: bool) -> None:
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise SystemExit("EMERGENT_LLM_KEY missing")
    os.makedirs(OUT, exist_ok=True)
    jobs = {k: v for k, v in JOBS.items() if not names or k in names}
    sem = asyncio.Semaphore(3)

    async def run(k, p):
        async with sem:
            try:
                await gen(k, p, api_key, force)
            except Exception as e:  # noqa: BLE001
                print(f"✗ {k}: {e}")

    await asyncio.gather(*(run(k, p) for k, p in jobs.items()))


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    asyncio.run(main(args, "--force" in sys.argv))
