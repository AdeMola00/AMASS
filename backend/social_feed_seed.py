"""Seed for the Social feed — ~20 realistic Lagos give-away / for-sale posts so the tab feels alive.

Idempotent: keyed on `seed_key`. Creates 8 demo neighbours (social.seed.N@amass.africa, no login),
joins them to the pilot estates (Lekki Gardens Phase 2 — the demo user's estate — and Magodo GRA),
and gives the demo user (Ada Demo) three posts of her own so "My posts" has content.
Photos are stable Unsplash CDN URLs; avatars from pravatar.
"""
from __future__ import annotations

import random
from datetime import timedelta

from social_common import new_id, now

U = "https://images.unsplash.com/photo-{}?w=1000&q=80&auto=format&fit=crop"
IMG = {
    "sofa_green": U.format("1555041469-a586c61ea9bc"), "dining": U.format("1617806118233-18e1de247200"), "armchair_white": U.format("1567538096630-e0c55bd6374c"),
    "bike": U.format("1485965120184-e220f721d03e"), "books": U.format("1512820790803-83ca734da794"), "cactus": U.format("1459411552884-841db9b3cc2a"),
    "lamp": U.format("1507473885765-e6ed057f782c"), "fridge": U.format("1571175443880-49e1d25b2bc5"), "tv": U.format("1593359677879-a4bb92f829d1"),
    "office_chair": U.format("1580480055273-228ff5388ef8"), "oven": U.format("1574269909862-7e1d70bb8078"), "rug": U.format("1600166898405-da9535204843"),
    "washer": U.format("1626806787461-102c1bfaaea1"), "bed": U.format("1505693416388-ac5ce068fe85"), "kitchen": U.format("1556911220-bff31c812dba"),
    "living": U.format("1513694203232-719a280e022f"), "toys": U.format("1596461404969-9ae70f2830c1"), "wardrobe": U.format("1558997519-83ea9252edf8"),
    "armchair_yellow": U.format("1586023492125-27b2c045efd7"), "sofa_leather": U.format("1540574163026-643ea20ade25"), "bedroom": U.format("1522771739844-6a9f6d5f14af"),
    "sofa_grey": U.format("1493663284031-b7e3aefcae8e"), "side_table": U.format("1532372320572-cda25653a26d"), "table_chairs": U.format("1519710164239-da123dc03ef4"),
    "sofa_orange": U.format("1618220179428-22790b461013"), "stool": U.format("1503602642458-232111445657"), "chair_grey": U.format("1598300042247-d088f8ab3a91"),
    "chair_wood": U.format("1549497538-303791108f95"), "watch": U.format("1434056886845-dac89ffe9b56"), "sofa_blanket": U.format("1583847268964-b28dc8f51f92"),
}

NEIGHBOURS = [
    {"n": 1, "name": "Tunde Bakare", "img": 12, "estate": "lekki-gardens-phase-2-lagos"},
    {"n": 2, "name": "Chiamaka Okoye", "img": 47, "estate": "lekki-gardens-phase-2-lagos"},
    {"n": 3, "name": "Femi Adeyemi", "img": 33, "estate": "lekki-gardens-phase-2-lagos"},
    {"n": 4, "name": "Ngozi Eze", "img": 45, "estate": "lekki-gardens-phase-2-lagos"},
    {"n": 5, "name": "Kemi Lawal", "img": 26, "estate": "magodo-gra-phase-1-lagos"},
    {"n": 6, "name": "Ibrahim Musa", "img": 59, "estate": "magodo-gra-phase-1-lagos"},
    {"n": 7, "name": "Yetunde Alabi", "img": 32, "estate": None},
    {"n": 8, "name": "Emeka Nwosu", "img": 15, "estate": None},
]

# (author n | "demo", kind, title, body, price, category, condition, photos, visibility, hours_ago, pickup_note, whatsapp)
POSTS = [
    (1, "give", "3-seater green velvet sofa — free to a good home", "Moving to a smaller flat and this won't fit. Very comfortable, one small scuff on the left arm. You'll need two people and a van. Pickup from the estate gate.", None, "furniture", "good", ["sofa_green", "living"], "estate", 3, "Pickup Saturday 10am–2pm", True),
    ("demo", "sell", "Dining table + 4 chairs (glass top)", "Bought from Lagom two years ago. Glass is spotless, chairs reupholstered in green last year. Selling because we're changing the dining room layout.", 185000, "furniture", "like_new", ["dining", "table_chairs"], "area", 6, None, False),
    (2, "give", "Box of children's books — ages 4 to 9", "About 40 books: Ladybird classics, a few Nigerian folktales and some early readers. All in good shape. First to collect takes the lot.", None, "books", "good", ["books"], "estate", 9, "Any evening after 6pm", False),
    (3, "sell", "Samsung 55\" smart TV — works perfectly", "Upgrading to a bigger screen. Comes with remote and wall bracket. No dead pixels. Can show it working before you pay.", 240000, "electronics", "good", ["tv"], "city", 14, None, True),
    (4, "give", "Potted cactus & two succulents", "They've outgrown my balcony. Low-maintenance and healthy. Bring your own box, pots included.", None, "garden", "good", ["cactus"], "area", 20, None, False),
    (5, "sell", "Standing floor lamp — matte black", "Minimal arc lamp, bulb included. Bought for a photoshoot and barely used.", 35000, "decor", "like_new", ["lamp"], "area", 26, None, False),
    (6, "sell", "Haier Thermocool double-door fridge", "Four years old, cools very well, inverter-friendly. Selling because we got a bigger one. Buyer arranges transport.", 320000, "appliances", "good", ["fridge"], "city", 30, "Weekdays after 5pm", True),
    (1, "sell", "Ergonomic office chair (mesh back)", "Height and tilt adjustable, lumbar support. A few minor marks on the base. Great for WFH.", 55000, "furniture", "good", ["office_chair"], "estate", 38, None, False),
    ("demo", "give", "Kids' wooden train set — complete", "My son has outgrown it. All tracks, trains and signs are here. Perfect for ages 2–6.", None, "kids", "good", ["toys"], "estate", 44, "Collect from the clubhouse", False),
    (7, "sell", "Microwave oven 25L — barely used", "Bought for a short let that didn't happen. Still has the manual. Pickup in Ajah.", 48000, "kitchen", "like_new", ["oven", "kitchen"], "city", 52, None, True),
    (2, "sell", "Persian-style living room rug 200×290", "Deep red and cream, thick pile, professionally cleaned last month. No stains.", 95000, "decor", "good", ["rug"], "area", 60, None, False),
    (8, "sell", "LG front-load washing machine 8kg", "Works perfectly, serviced in March. Selling because we're relocating abroad next month. Serious buyers only please.", 210000, "appliances", "good", ["washer"], "city", 70, "Collect before the 30th", True),
    (3, "give", "Queen bed frame (frame only, no mattress)", "Solid wood, light grey upholstered headboard. Needs re-assembly — I'll include the bolts. Free, just come and carry.", None, "furniture", "fair", ["bed", "bedroom"], "estate", 80, None, False),
    (4, "sell", "Mountain bike — 21 speed", "Rides well, new brake pads. Perfect for the estate loop in the mornings. Helmet included.", 85000, "other", "good", ["bike"], "area", 92, None, True),
    (5, "sell", "Two-door wardrobe, oak finish", "Sturdy, with a hanging rail and three shelves. Small chip on the top-left corner. You'll need a van.", 60000, "furniture", "fair", ["wardrobe"], "area", 110, None, False),
    (6, "sell", "Yellow accent armchair", "Statement piece, very comfortable. Clearing space for a reading nook rebuild.", 70000, "furniture", "like_new", ["armchair_yellow"], "city", 130, None, False),
    (7, "give", "Assorted kitchen pots and pans", "Six pieces, non-stick, perfectly usable. Giving away because we're switching to a new set.", None, "kitchen", "fair", ["kitchen"], "city", 150, None, False),
    (8, "sell", "Tan leather 3-seater sofa", "Genuine leather, no tears, lovely patina. Comes from a smoke-free home.", 275000, "furniture", "good", ["sofa_leather", "sofa_blanket"], "city", 170, None, True),
    (1, "give", "Side table — reclaimed wood", "Little side table with a shelf. A bit wobbly, nothing a screw won't fix.", None, "furniture", "fair", ["side_table"], "estate", 190, None, False),
    ("demo", "sell", "White boucle armchair", "Barely used, from our guest room. Price slightly negotiable for a quick pickup.", 120000, "furniture", "like_new", ["armchair_white"], "area", 200, None, False),
    (2, "sell", "Grey fabric sofa, 2-seater", "Compact and comfortable, ideal for a studio. Removable cushion covers (just washed).", 95000, "furniture", "good", ["sofa_grey"], "area", 230, None, False),
    (3, "give", "Two bar stools (wood)", "Height 65cm. Free — one has a slightly loose leg.", None, "furniture", "fair", ["stool", "chair_wood"], "estate", 260, None, False),
]

COMMENTS = [
    "Is this still available?", "Lovely! Can I come by this weekend?", "Interested — sending you a message.", "What are the dimensions please?",
    "Still available? I'm two streets away.", "Would you take a bit less for cash today?", "Great condition for the price 👏", "Does it come with the cushions?",
]


async def seed_social_feed(db, demo_user_id: str | None, hash_password) -> dict:
    if await db.social_posts.count_documents({"seed_key": "social_v1"}) >= 10:
        return {"skipped": True}
    rnd = random.Random(42)
    estates = {e["slug"]: e for e in await db.estates.find({"slug": {"$in": ["lekki-gardens-phase-2-lagos", "magodo-gra-phase-1-lagos"]}}, {"_id": 0}).to_list(5)}
    # demo neighbours
    users: dict[int, dict] = {}
    for nb in NEIGHBOURS:
        email = f"social.seed.{nb['n']}@amass.africa"
        u = await db.users.find_one({"email": email}, {"_id": 0})
        if not u:
            u = {
                "id": new_id(), "email": email, "full_name": nb["name"], "password_hash": hash_password(f"seed-{new_id()}"), "city": "Lagos",
                "avatar_url": f"https://i.pravatar.cc/200?img={nb['img']}", "phone": f"+23480{rnd.randint(10000000, 99999999)}", "phone_verified": True, "is_agent": False, "is_admin": False,
                "created_at": now() - timedelta(days=rnd.randint(60, 400)), "seed_key": "social_v1",
            }
            await db.users.insert_one(u)
        users[nb["n"]] = u
        est = estates.get(nb["estate"] or "")
        if est and not await db.estate_members.find_one({"estate_id": est["id"], "user_id": u["id"]}):
            await db.estate_members.insert_one({"id": new_id(), "estate_id": est["id"], "user_id": u["id"], "role": "resident", "status": "approved", "verification_method": "pilot", "created_at": now(), "approved_at": now()})
    demo = await db.users.find_one({"id": demo_user_id}, {"_id": 0}) if demo_user_id else None
    lekki = estates.get("lekki-gardens-phase-2-lagos")
    magodo = estates.get("magodo-gra-phase-1-lagos")

    def estate_for(author_key):
        if author_key == "demo":
            return lekki
        nb = next(x for x in NEIGHBOURS if x["n"] == author_key)
        return estates.get(nb["estate"] or "")

    created = 0
    post_ids: list[str] = []
    for (author_key, kind, title, body, price, category, condition, photos, visibility, hours_ago, pickup, whatsapp) in POSTS:
        author = demo if author_key == "demo" else users.get(author_key)
        if not author:
            continue
        est = estate_for(author_key)
        if visibility == "estate" and not est:
            visibility = "area"
        area = (est or {}).get("area") or ("Ajah, Lekki" if author_key in ("demo", 1, 2, 3, 4, 7) else "Magodo, Isheri")
        created_at = now() - timedelta(hours=hours_ago, minutes=rnd.randint(0, 59))
        p = {
            "id": new_id(), "author_id": author["id"], "author_name": author.get("full_name"), "author_avatar": author.get("avatar_url"),
            "title": title, "body": body, "kind": kind, "price": price if kind == "sell" else None, "negotiable": kind == "sell",
            "category": category, "condition": condition, "photos": [IMG[k] for k in photos],
            "visibility": visibility, "estate_id": (est or {}).get("id"), "estate_name": (est or {}).get("name"), "area": area, "city": "Lagos",
            "pickup_note": pickup, "contact_chat": True, "contact_whatsapp": bool(whatsapp), "contact_phone": False, "cross_list_market": False, "market_item_id": None,
            "status": "active", "like_count": 0, "comment_count": 0, "view_count": rnd.randint(8, 140), "edited": False, "created_at": created_at, "updated_at": created_at, "seed_key": "social_v1",
        }
        await db.social_posts.insert_one(p)
        post_ids.append(p["id"])
        created += 1
        # likes + comments from other neighbours
        likers = rnd.sample([u for k, u in users.items() if u["id"] != author["id"]], k=rnd.randint(0, 5))
        for lu in likers:
            await db.social_post_likes.update_one({"post_id": p["id"], "user_id": lu["id"]}, {"$set": {"post_id": p["id"], "user_id": lu["id"], "created_at": created_at + timedelta(minutes=rnd.randint(5, 600))}}, upsert=True)
        n_comments = rnd.choice([0, 0, 1, 1, 2, 3])
        commenters = rnd.sample([u for k, u in users.items() if u["id"] != author["id"]], k=min(n_comments, len(users) - 1))
        for cu in commenters:
            await db.social_post_comments.insert_one({"id": new_id(), "post_id": p["id"], "author_id": cu["id"], "body": rnd.choice(COMMENTS), "status": "active", "created_at": created_at + timedelta(minutes=rnd.randint(10, 900)), "seed_key": "social_v1"})
        await db.social_posts.update_one({"id": p["id"]}, {"$set": {"like_count": len(likers), "comment_count": len(commenters)}})
    # one of the demo's posts was already given away → shows "Given away" in My posts
    if demo:
        gone = await db.social_posts.find_one({"author_id": demo["id"], "seed_key": "social_v1", "kind": "give"}, {"_id": 0, "id": 1})
        if gone:
            await db.social_posts.update_one({"id": gone["id"]}, {"$set": {"status": "gone"}})
    return {"created": created, "neighbours": len(users), "magodo": bool(magodo)}
