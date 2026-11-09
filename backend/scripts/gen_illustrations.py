"""One-off: generate the AMASS illustration set with Gemini Nano Banana, knock out the white
background to transparency, downscale and save to the Expo assets folder.

Run:  cd /app/backend && python scripts/gen_illustrations.py [name ...]
"""
import asyncio
import base64
import io
import os
import sys
from collections import deque

from dotenv import load_dotenv
from PIL import Image

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
from emergentintegrations.llm.chat import LlmChat, UserMessage  # noqa: E402

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "assets", "illustrations")
os.makedirs(OUT, exist_ok=True)

STYLE = (
    "Flat vector illustration, playful and friendly, chunky rounded shapes, thick soft outlines, "
    "bold confident colours: AMASS red #E11B22, charcoal #111111, warm sand, gold #D4AF37, "
    "FIXA green #2E8B57, lime #7ED958 and sunny orange accents. Modern Nigerian / West African "
    "characters with natural hair and casual contemporary clothes, Lagos-style neighbourhood. "
    "Absolutely no text, letters, numbers, logos or watermarks. Single centred subject with generous "
    "empty margins on a PLAIN SOLID PURE WHITE background (#FFFFFF), no floor shadow, no scenery "
    "touching the edges. Square 1:1 composition."
)

MASCOT = (
    "The mascot 'Massi': a cheerful little bright-red house character with a dark charcoal roof, "
    "two big friendly eyes, a wide smile, and short stubby arms and legs."
)

PROMPTS = {
    "mascot-wave": f"{MASCOT} Waving hello with one arm, standing confidently. {STYLE}",
    "onboard-map": (
        "A smiling young Nigerian woman holding up her phone, a giant red map pin floating above a cluster of "
        f"colourful modern Lagos houses and a palm tree behind her. {STYLE}"
    ),
    "onboard-market": (
        "Two friendly neighbours, a young man and an older woman in ankara print, happily handing over a bright "
        f"yellow armchair in front of an estate gate; a few boxes and a plant beside them. {STYLE}"
    ),
    "onboard-fixa": (
        "A confident Nigerian handyman in green overalls and a lime-green cap holding a big wrench and a toolbox, "
        f"giving a thumbs up, small sparkle stars around a fixed tap. {STYLE}"
    ),
    "onboard-wallet": (
        f"{MASCOT} Happily juggling two big shiny coins — one gold coin and one green coin — with small sparkles, "
        f"a smartphone showing a simple wallet icon leaning beside it. No people. {STYLE}"
    ),
    "empty-saved": f"{MASCOT} Holding a big outlined empty heart with a curious expression. {STYLE}",
    "empty-search": f"{MASCOT} Peeking through a big magnifying glass over a small folded map, puzzled but cute. {STYLE}",
    "empty-messages": f"{MASCOT} Sitting beside two large empty rounded speech bubbles, waiting happily. {STYLE}",
    "empty-items": f"{MASCOT} Standing next to a big open empty cardboard box with a small plant beside it. {STYLE}",
    "empty-wallet": f"{MASCOT} Holding an open empty wallet upside down, one tiny gold coin falling out, shrugging. {STYLE}",
    "empty-notifications": f"{MASCOT} Snoozing beside a big round bell with a little 'z z' made of simple shapes (no letters). {STYLE}",
    "success": f"{MASCOT} Jumping for joy with both arms up, surrounded by confetti and a big green checkmark circle. {STYLE}",
    "offline": f"{MASCOT} Holding an unplugged cable, a small grey cloud with a slash above, mildly sad. {STYLE}",
}


def knockout_white(img: Image.Image, tol: int = 28) -> Image.Image:
    """Flood-fill transparency from the edges for every near-white pixel (keeps white inside the subject)."""
    img = img.convert("RGBA")
    w, h = img.size
    px = img.load()
    seen = bytearray(w * h)
    q: deque = deque()
    for x in range(w):
        q.append((x, 0))
        q.append((x, h - 1))
    for y in range(h):
        q.append((0, y))
        q.append((w - 1, y))

    def near_white(p):
        return p[0] >= 255 - tol and p[1] >= 255 - tol and p[2] >= 255 - tol

    while q:
        x, y = q.popleft()
        if x < 0 or y < 0 or x >= w or y >= h:
            continue
        i = y * w + x
        if seen[i]:
            continue
        seen[i] = 1
        p = px[x, y]
        if not near_white(p):
            continue
        # soften the edge: alpha based on how white it is
        d = max(255 - p[0], 255 - p[1], 255 - p[2])
        px[x, y] = (p[0], p[1], p[2], 0 if d < tol // 2 else int(255 * (d / tol)))
        q.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    return img


async def gen(name: str, prompt: str, api_key: str):
    chat = LlmChat(api_key=api_key, session_id=f"illus-{name}", system_message="You are an illustrator.")
    chat.with_model("gemini", "gemini-3.1-flash-image-preview").with_params(modalities=["image", "text"])
    text, images = await chat.send_message_multimodal_response(UserMessage(text=prompt))
    if not images:
        print(f"[{name}] no image returned: {str(text)[:120]}")
        return False
    raw = base64.b64decode(images[0]["data"])
    img = Image.open(io.BytesIO(raw))
    img = knockout_white(img)
    bbox = img.getbbox()
    if bbox:
        img = img.crop(bbox)
    # fit into 720x720 keeping aspect
    img.thumbnail((720, 720), Image.LANCZOS)
    img = img.quantize(colors=256, method=Image.Quantize.FASTOCTREE)  # 8-bit palette w/ alpha → ~1/3 size
    path = os.path.join(OUT, f"{name}.png")
    img.save(path, optimize=True)
    print(f"[{name}] saved {img.size} -> {os.path.getsize(path) // 1024} KB")
    return True


async def main():
    api_key = os.getenv("EMERGENT_LLM_KEY")
    names = sys.argv[1:] or list(PROMPTS)
    for n in names:
        try:
            await gen(n, PROMPTS[n], api_key)
        except Exception as e:  # keep going
            print(f"[{n}] FAILED: {e}")


if __name__ == "__main__":
    asyncio.run(main())
