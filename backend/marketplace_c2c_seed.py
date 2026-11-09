"""Nigerian C2C + B2C classifieds seed data — OfferUp / Letgo style.

Rich, realistic listings across Vehicles, Phones, Electronics, Furniture,
Fashion, Real Estate cross-references, Tools, Business Assets and Services.
"""

from datetime import datetime, timedelta, timezone


def _iso_days_ago(days: float) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()


# ─── Seller archetypes (some individuals, some dealers/brands) ───────
SELLERS = {
    "s_femi": {
        "seller_id": "s_femi",
        "seller_name": "Femi Adebayo",
        "seller_avatar": "https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=200",
        "seller_phone": "+2348023456789",
        "seller_whatsapp": "+2348023456789",
        "seller_type": "individual",
        "seller_verified": True,
        "seller_rating": 4.9,
        "seller_reviews": 47,
        "seller_joined_year": 2022,
        "seller_response_time_hours": 1,
        "seller_response_rate": 98,
        "seller_bio": "Lekki-based professional. Sell only what I've personally used and maintained.",
    },
    "s_chi": {
        "seller_id": "s_chi",
        "seller_name": "Chinedu Okafor",
        "seller_avatar": "https://images.unsplash.com/photo-1531891437562-4301cf35b7e4?w=200",
        "seller_phone": "+2347031234567",
        "seller_whatsapp": "+2347031234567",
        "seller_type": "individual",
        "seller_verified": True,
        "seller_rating": 4.7,
        "seller_reviews": 22,
        "seller_joined_year": 2023,
        "seller_response_time_hours": 3,
        "seller_response_rate": 90,
        "seller_bio": "Ikeja-based. Fast responder. Trade-ins welcome.",
    },
    "s_ada": {
        "seller_id": "s_ada",
        "seller_name": "Ada Nwosu",
        "seller_avatar": "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200",
        "seller_phone": "+2348156677889",
        "seller_whatsapp": "+2348156677889",
        "seller_type": "individual",
        "seller_verified": False,
        "seller_rating": 4.6,
        "seller_reviews": 8,
        "seller_joined_year": 2024,
        "seller_response_time_hours": 4,
        "seller_response_rate": 82,
        "seller_bio": "Selling my personal items — moving abroad.",
    },
    "s_musa": {
        "seller_id": "s_musa",
        "seller_name": "Musa Ibrahim",
        "seller_avatar": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200",
        "seller_phone": "+2349012345678",
        "seller_whatsapp": "+2349012345678",
        "seller_type": "individual",
        "seller_verified": True,
        "seller_rating": 4.8,
        "seller_reviews": 31,
        "seller_joined_year": 2021,
        "seller_response_time_hours": 2,
        "seller_response_rate": 94,
        "seller_bio": "Abuja-based. Genuine items only.",
    },
    "s_tolu": {
        "seller_id": "s_tolu",
        "seller_name": "Toluwalase Bello",
        "seller_avatar": "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=200",
        "seller_phone": "+2348134455667",
        "seller_whatsapp": "+2348134455667",
        "seller_type": "individual",
        "seller_verified": True,
        "seller_rating": 5.0,
        "seller_reviews": 15,
        "seller_joined_year": 2023,
        "seller_response_time_hours": 1,
        "seller_response_rate": 100,
        "seller_bio": "Yaba tech corridor. Instant response.",
    },
    "s_auto_lekki": {
        "seller_id": "s_auto_lekki",
        "seller_name": "Lekki Auto Hub",
        "seller_avatar": "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=200",
        "seller_phone": "+2348088002200",
        "seller_whatsapp": "+2348088002200",
        "seller_type": "dealer",
        "seller_verified": True,
        "seller_rating": 4.8,
        "seller_reviews": 312,
        "seller_joined_year": 2018,
        "seller_response_time_hours": 1,
        "seller_response_rate": 99,
        "seller_bio": "Certified pre-owned dealer. All cars inspected. Financing available.",
    },
    "s_gadget_plaza": {
        "seller_id": "s_gadget_plaza",
        "seller_name": "Ikeja Gadget Plaza",
        "seller_avatar": "https://images.unsplash.com/photo-1512428559087-560fa5ceab42?w=200",
        "seller_phone": "+2349077115500",
        "seller_whatsapp": "+2349077115500",
        "seller_type": "dealer",
        "seller_verified": True,
        "seller_rating": 4.7,
        "seller_reviews": 890,
        "seller_joined_year": 2019,
        "seller_response_time_hours": 1,
        "seller_response_rate": 96,
        "seller_bio": "Verified reseller. Original UK-used phones. 3-month warranty on every device.",
    },
    "s_slot_home": {
        "seller_id": "s_slot_home",
        "seller_name": "Slot Home",
        "seller_avatar": "https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?w=200",
        "seller_phone": "+2349065557700",
        "seller_whatsapp": "+2349065557700",
        "seller_type": "brand",
        "seller_verified": True,
        "seller_rating": 4.8,
        "seller_reviews": 5860,
        "seller_joined_year": 2010,
        "seller_response_time_hours": 2,
        "seller_response_rate": 95,
        "seller_bio": "Retail arm of Slot Nigeria. Manufacturer warranty on every product.",
    },
    "s_casa_milano": {
        "seller_id": "s_casa_milano",
        "seller_name": "Casa Milano",
        "seller_avatar": "https://images.unsplash.com/photo-1449247709967-d4461a6a6103?w=200",
        "seller_phone": "+2348120001101",
        "seller_whatsapp": "+2348120001101",
        "seller_type": "brand",
        "seller_verified": True,
        "seller_rating": 4.9,
        "seller_reviews": 1284,
        "seller_joined_year": 2012,
        "seller_response_time_hours": 3,
        "seller_response_rate": 92,
        "seller_bio": "Italian-designed furniture, Lagos-delivered. White-glove service.",
    },
}


def _s(key: str) -> dict:
    return dict(SELLERS[key])


# ─── City coords (approximate) ────────────────────────────────────
_CITY_COORDS = {
    "Lagos - Lekki": (6.4494, 3.4739),
    "Lagos - Ikeja": (6.6018, 3.3515),
    "Lagos - Yaba": (6.5158, 3.3696),
    "Lagos - Victoria Island": (6.4281, 3.4219),
    "Lagos - Ajah": (6.4667, 3.5820),
    "Lagos - Surulere": (6.4931, 3.3610),
    "Abuja - Maitama": (9.0863, 7.4906),
    "Abuja - Wuse 2": (9.0700, 7.4900),
    "Abuja - Gwarinpa": (9.1027, 7.4085),
    "Port Harcourt": (4.8156, 7.0498),
    "Ibadan": (7.3775, 3.9470),
    "Kano": (12.0022, 8.5920),
}


def _loc(city_key: str):
    lat, lng = _CITY_COORDS.get(city_key, (6.5244, 3.3792))
    return {"city": city_key, "location": city_key, "latitude": lat, "longitude": lng}


# ─── Listings ────────────────────────────────────────────────────
C2C_ITEMS: list[dict] = [
    # ═══ VEHICLES ══════════════════════════════════════════════
    {
        "category": "vehicles", "subcategory": "Cars",
        "name": "2018 Toyota Camry SE — Foreign Used",
        "description": (
            "Clean 2018 Toyota Camry SE, direct Belgium tokunbo. "
            "First body, no accident, custom duty paid. AC ice-cold, "
            "reverse camera, cruise control, 62,000 km on the clock. "
            "Serviced by Elizade last month."
        ),
        "price": 22500000, "original_price": 24000000, "on_sale": True,
        "brand": "Toyota", "condition": "used", "negotiable": True,
        "image": "https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?w=1200",
        "images": [
            "https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?w=1200",
            "https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=1200",
            "https://images.unsplash.com/photo-1502877338535-766e1452684a?w=1200",
            "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=1200",
        ],
        "vendor": "Lekki Auto Hub", "vendor_id": None,
        "rating": 4.8, "reviews": 24, "verified": True, "delivery": False,
        "specs": {"Mileage": "62,000 km", "Transmission": "Automatic", "Fuel": "Petrol", "Year": "2018", "Color": "Pearl White"},
        "tags": ["boosted"], "popular": True, "is_boosted": True, "is_featured": True,
        **_loc("Lagos - Lekki"), "posted_at": _iso_days_ago(2), "views": 421, "saves": 38,
        **_s("s_auto_lekki"),
    },
    {
        "category": "vehicles", "subcategory": "Cars",
        "name": "2016 Honda Accord — Nigerian Used",
        "description": (
            "Registered 2016 Honda Accord EX-L. Leather seats, sunroof, "
            "chilling AC, alloy rims, 2 keys available. Very neat, no dent. "
            "Fuel efficient. Reason for sale: upgrading."
        ),
        "price": 12800000, "brand": "Honda", "condition": "used", "negotiable": True,
        "image": "https://images.unsplash.com/photo-1571095839087-5f237247ee28?w=1200",
        "images": [
            "https://images.unsplash.com/photo-1571095839087-5f237247ee28?w=1200",
        ],
        "vendor": "Femi Adebayo", "verified": True, "rating": 4.9, "reviews": 12,
        "specs": {"Mileage": "98,000 km", "Transmission": "Automatic", "Fuel": "Petrol", "Year": "2016"},
        "tags": ["new_listing"],
        **_loc("Lagos - Lekki"), "posted_at": _iso_days_ago(0.2), "views": 87, "saves": 6,
        **_s("s_femi"),
    },
    {
        "category": "vehicles", "subcategory": "SUVs",
        "name": "2020 Lexus RX 350 — Foreign Used",
        "description": (
            "Very clean 2020 Lexus RX 350 F-Sport. Panoramic roof, "
            "360° camera, wireless charging, heated & ventilated seats, "
            "Mark Levinson sound. First body. Duty paid."
        ),
        "price": 48500000, "brand": "Lexus", "condition": "used", "negotiable": True,
        "image": "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=1200",
        "images": [
            "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=1200",
            "https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=1200",
            "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=1200",
        ],
        "vendor": "Lekki Auto Hub", "verified": True, "rating": 4.9, "reviews": 8,
        "specs": {"Mileage": "38,000 km", "Transmission": "Automatic", "Fuel": "Petrol", "Year": "2020", "Trim": "F-Sport"},
        "tags": ["boosted", "premium"], "popular": True, "is_boosted": True,
        **_loc("Lagos - Victoria Island"), "posted_at": _iso_days_ago(5), "views": 892, "saves": 74,
        **_s("s_auto_lekki"),
    },
    {
        "category": "vehicles", "subcategory": "SUVs",
        "name": "2019 Mercedes-Benz GLE 400 — Foreign Used",
        "description": "Panoramic sunroof, cream leather, 4Matic, harman/kardon sound.",
        "price": 62000000, "brand": "Mercedes-Benz", "condition": "used", "negotiable": True,
        "image": "https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=1200",
        "images": [
            "https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=1200",
            "https://images.unsplash.com/photo-1580414057403-c5f451f30e1c?w=1200",
        ],
        "vendor": "Musa Ibrahim", "verified": True, "rating": 4.7, "reviews": 3,
        "specs": {"Mileage": "44,000 km", "Year": "2019", "Trim": "4Matic"},
        **_loc("Abuja - Maitama"), "posted_at": _iso_days_ago(8), "views": 640, "saves": 51,
        **_s("s_musa"),
    },

    # ═══ MOTORCYCLES ═══════════════════════════════════════════
    {
        "category": "motorcycles", "subcategory": "Motorcycles",
        "name": "Bajaj Boxer 150 — Barely used",
        "description": "1 year old, low mileage, papers complete, ready for delivery.",
        "price": 720000, "brand": "Bajaj", "condition": "used", "negotiable": True,
        "image": "https://images.unsplash.com/photo-1558981285-6f0c94958bb6?w=1200",
        "images": ["https://images.unsplash.com/photo-1558981285-6f0c94958bb6?w=1200"],
        "vendor": "Chinedu Okafor", "verified": True, "rating": 4.7, "reviews": 4,
        "specs": {"Year": "2024", "Engine": "150cc"},
        **_loc("Lagos - Ikeja"), "posted_at": _iso_days_ago(1.5), "views": 128, "saves": 9,
        **_s("s_chi"),
    },

    # ═══ PHONES ════════════════════════════════════════════════
    {
        "category": "phones", "subcategory": "iPhone",
        "name": "iPhone 15 Pro Max 256GB — Natural Titanium",
        "description": (
            "UK-used iPhone 15 Pro Max, 256GB, Natural Titanium. "
            "Battery health 96%. Face ID working. No scratch, no dent. "
            "Original charger + box included. 3-month shop warranty."
        ),
        "price": 1750000, "original_price": 1900000, "on_sale": True,
        "brand": "Apple", "condition": "used", "negotiable": True,
        "image": "https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=1200",
        "images": [
            "https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=1200",
            "https://images.unsplash.com/photo-1592286927505-1def25115558?w=1200",
            "https://images.unsplash.com/photo-1580910051074-3eb694886505?w=1200",
        ],
        "vendor": "Ikeja Gadget Plaza", "verified": True, "rating": 4.8, "reviews": 62,
        "specs": {"Storage": "256GB", "Color": "Natural Titanium", "Battery Health": "96%", "Warranty": "3 months"},
        "tags": ["boosted"], "popular": True, "is_boosted": True, "is_featured": True,
        **_loc("Lagos - Ikeja"), "posted_at": _iso_days_ago(3), "views": 1240, "saves": 145,
        **_s("s_gadget_plaza"),
    },
    {
        "category": "phones", "subcategory": "iPhone",
        "name": "iPhone 13 128GB — Blue, Nigerian Used",
        "description": "Battery 87%, clean condition, no crack. Face ID + True Tone working.",
        "price": 620000, "brand": "Apple", "condition": "used", "negotiable": True,
        "image": "https://images.unsplash.com/photo-1580910051074-3eb694886505?w=1200",
        "images": ["https://images.unsplash.com/photo-1580910051074-3eb694886505?w=1200"],
        "vendor": "Toluwalase Bello", "verified": True, "rating": 5.0, "reviews": 6,
        "specs": {"Storage": "128GB", "Color": "Blue", "Battery Health": "87%"},
        "tags": ["new_listing"],
        **_loc("Lagos - Yaba"), "posted_at": _iso_days_ago(0.5), "views": 58, "saves": 4,
        **_s("s_tolu"),
    },
    {
        "category": "phones", "subcategory": "Android",
        "name": "Samsung Galaxy S23 Ultra 512GB — Brand New Sealed",
        "description": "Brand new, sealed pack. Original Samsung Nigeria warranty. Green.",
        "price": 1450000, "brand": "Samsung", "condition": "new", "negotiable": False,
        "image": "https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?w=1200",
        "images": ["https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?w=1200"],
        "vendor": "Slot Home", "verified": True, "rating": 4.9, "reviews": 40,
        "specs": {"Storage": "512GB", "Color": "Green"},
        "tags": ["featured"], "popular": True, "is_featured": True,
        **_loc("Lagos - Ikeja"), "posted_at": _iso_days_ago(4), "views": 512, "saves": 63,
        **_s("s_slot_home"),
    },

    # ═══ LAPTOPS / ELECTRONICS ═════════════════════════════════
    {
        "category": "electronics", "subcategory": "Laptops",
        "name": "MacBook Pro 14\" M2 Pro 16GB/512GB — Space Grey",
        "description": (
            "US Spec, cycles 82, 100% battery health. Comes with box, "
            "original 96W charger, spare USB-C hub. Purchased Feb 2024."
        ),
        "price": 2150000, "original_price": 2350000, "on_sale": True,
        "brand": "Apple", "condition": "used", "negotiable": True,
        "image": "https://images.unsplash.com/photo-1541746972996-4e0b0f43e02a?w=1200",
        "images": [
            "https://images.unsplash.com/photo-1541746972996-4e0b0f43e02a?w=1200",
            "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=1200",
        ],
        "vendor": "Femi Adebayo", "verified": True, "rating": 4.9, "reviews": 12,
        "specs": {"Chip": "M2 Pro", "RAM": "16GB", "Storage": "512GB", "Screen": "14\""},
        "tags": ["boosted"], "is_boosted": True,
        **_loc("Lagos - Lekki"), "posted_at": _iso_days_ago(1), "views": 340, "saves": 41,
        **_s("s_femi"),
    },
    {
        "category": "electronics", "subcategory": "Laptops",
        "name": "Dell XPS 15 (2023) i7 32GB/1TB — RTX 4060",
        "description": "Powerhouse creator laptop. Barely used — 8 charge cycles.",
        "price": 1650000, "brand": "Dell", "condition": "used", "negotiable": True,
        "image": "https://images.unsplash.com/photo-1587202372775-e229f172b9d7?w=1200",
        "images": ["https://images.unsplash.com/photo-1587202372775-e229f172b9d7?w=1200"],
        "vendor": "Toluwalase Bello", "verified": True, "rating": 5.0, "reviews": 6,
        "specs": {"CPU": "i7-13700H", "RAM": "32GB", "Storage": "1TB NVMe", "GPU": "RTX 4060"},
        **_loc("Lagos - Yaba"), "posted_at": _iso_days_ago(2.5), "views": 176, "saves": 22,
        **_s("s_tolu"),
    },
    {
        "category": "electronics", "subcategory": "TV",
        "name": "Samsung 65\" QLED 4K TV — Barely Used",
        "description": "Neo Quantum 4K, HDR10+, still on 22-month warranty.",
        "price": 850000, "original_price": 1200000, "on_sale": True,
        "brand": "Samsung", "condition": "used", "negotiable": True,
        "image": "https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?w=1200",
        "images": ["https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?w=1200"],
        "vendor": "Ada Nwosu", "verified": False, "rating": 4.5, "reviews": 2,
        "specs": {"Screen": "65\"", "Resolution": "4K"},
        **_loc("Lagos - Ajah"), "posted_at": _iso_days_ago(1.2), "views": 210, "saves": 18,
        **_s("s_ada"),
    },

    # ═══ FURNITURE ═════════════════════════════════════════════
    {
        "category": "furniture", "subcategory": "Sofa",
        "name": "L-Shaped 7-Seater Grey Fabric Sofa",
        "description": "6 months old, no stain, no tear. Bought new for ₦850k. Moving abroad.",
        "price": 380000, "brand": None, "condition": "used", "negotiable": True,
        "image": "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=1200",
        "images": [
            "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=1200",
            "https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?w=1200",
        ],
        "vendor": "Ada Nwosu", "verified": False, "rating": 4.6, "reviews": 5,
        "specs": {"Seats": "7", "Color": "Grey", "Material": "Fabric"},
        "tags": ["new_listing"],
        **_loc("Lagos - Ajah"), "posted_at": _iso_days_ago(0.3), "views": 44, "saves": 5,
        **_s("s_ada"),
    },
    {
        "category": "furniture", "subcategory": "Bed",
        "name": "King-Size Platform Bed — Walnut Frame",
        "description": "Solid walnut king platform, under-bed storage, imported.",
        "price": 680000, "brand": "Casa Milano", "condition": "new", "negotiable": False,
        "image": "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=1200",
        "images": ["https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=1200"],
        "vendor": "Casa Milano", "verified": True, "rating": 4.9, "reviews": 51,
        "specs": {"Size": "King", "Material": "Walnut"},
        "tags": ["featured"], "is_featured": True,
        **_loc("Lagos - Victoria Island"), "posted_at": _iso_days_ago(7), "views": 302, "saves": 26,
        **_s("s_casa_milano"),
    },

    # ═══ APPLIANCES ════════════════════════════════════════════
    {
        "category": "appliances", "subcategory": "Fridge",
        "name": "LG Double-Door Fridge 620L — Brand New",
        "description": "Inverter linear compressor, energy A+. Sealed box.",
        "price": 950000, "brand": "LG", "condition": "new", "negotiable": False,
        "image": "https://images.unsplash.com/photo-1571175443880-49e1d25b2bc5?w=1200",
        "images": ["https://images.unsplash.com/photo-1571175443880-49e1d25b2bc5?w=1200"],
        "vendor": "Slot Home", "verified": True, "rating": 4.7, "reviews": 220,
        "specs": {"Capacity": "620L", "Warranty": "2 years"},
        **_loc("Lagos - Ikeja"), "posted_at": _iso_days_ago(9), "views": 480, "saves": 40,
        **_s("s_slot_home"),
    },
    {
        "category": "appliances", "subcategory": "Generator",
        "name": "Elepaq 3.5KVA Generator — Fairly Used",
        "description": "Serviced, runs perfectly. Includes spare plug set.",
        "price": 320000, "brand": "Elepaq", "condition": "used", "negotiable": True,
        "image": "https://images.unsplash.com/photo-1631017872020-ad51fe3fe6a5?w=1200",
        "images": ["https://images.unsplash.com/photo-1631017872020-ad51fe3fe6a5?w=1200"],
        "vendor": "Chinedu Okafor", "verified": True, "rating": 4.7, "reviews": 4,
        "specs": {"Capacity": "3.5KVA", "Type": "Petrol"},
        **_loc("Lagos - Ikeja"), "posted_at": _iso_days_ago(2), "views": 76, "saves": 7,
        **_s("s_chi"),
    },

    # ═══ FASHION ═══════════════════════════════════════════════
    {
        "category": "fashion", "subcategory": "Watches",
        "name": "Rolex Datejust 41mm — Steel/Gold — With Papers",
        "description": (
            "2021 Rolex Datejust 41mm two-tone jubilee bracelet. "
            "Full box + papers. Serviced by Rolex Service Centre 2024."
        ),
        "price": 8500000, "brand": "Rolex", "condition": "used", "negotiable": True,
        "image": "https://images.unsplash.com/photo-1587836374828-4dbafa94cf0e?w=1200",
        "images": [
            "https://images.unsplash.com/photo-1587836374828-4dbafa94cf0e?w=1200",
            "https://images.unsplash.com/photo-1524805444758-089113d48a6d?w=1200",
        ],
        "vendor": "Musa Ibrahim", "verified": True, "rating": 4.9, "reviews": 8,
        "specs": {"Year": "2021", "Material": "Steel/Gold", "Papers": "Yes"},
        "tags": ["boosted", "premium"], "is_boosted": True,
        **_loc("Abuja - Wuse 2"), "posted_at": _iso_days_ago(4), "views": 512, "saves": 47,
        **_s("s_musa"),
    },
    {
        "category": "fashion", "subcategory": "Bags",
        "name": "Louis Vuitton Neverfull MM — Authentic",
        "description": "Bought Paris 2022. Date-code intact, dust bag included.",
        "price": 950000, "brand": "Louis Vuitton", "condition": "used", "negotiable": True,
        "image": "https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=1200",
        "images": ["https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=1200"],
        "vendor": "Ada Nwosu", "verified": False, "rating": 4.6, "reviews": 3,
        "specs": {"Model": "Neverfull MM", "Year": "2022"},
        **_loc("Lagos - Ajah"), "posted_at": _iso_days_ago(3), "views": 199, "saves": 24,
        **_s("s_ada"),
    },

    # ═══ REAL ESTATE (cross-ref) ══════════════════════════════
    {
        "category": "real_estate", "subcategory": "Rent",
        "name": "3-Bed Serviced Apartment — Lekki Phase 1",
        "description": "Fully-serviced, 24/7 power, gym & pool. ₦12M/year, 1yr upfront.",
        "price": 12000000, "brand": None, "condition": "new", "negotiable": True,
        "image": "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200",
        "images": [
            "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200",
            "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200",
        ],
        "vendor": "Femi Adebayo", "verified": True, "rating": 4.9, "reviews": 12,
        "specs": {"Bedrooms": "3", "Bathrooms": "3", "Type": "Serviced Apartment", "Rent": "₦12M/year"},
        "tags": ["boosted"], "is_boosted": True,
        **_loc("Lagos - Lekki"), "posted_at": _iso_days_ago(5), "views": 640, "saves": 55,
        **_s("s_femi"),
    },

    # ═══ TOOLS / EQUIPMENT ════════════════════════════════════
    {
        "category": "tools", "subcategory": "Power Tools",
        "name": "DeWalt 20V Cordless Drill Combo Kit",
        "description": "3-tool combo: drill + impact + saw. 2 batteries + charger. Bought abroad.",
        "price": 285000, "brand": "DeWalt", "condition": "new", "negotiable": True,
        "image": "https://images.unsplash.com/photo-1504148455328-c376907d081c?w=1200",
        "images": ["https://images.unsplash.com/photo-1504148455328-c376907d081c?w=1200"],
        "vendor": "Musa Ibrahim", "verified": True, "rating": 4.8, "reviews": 6,
        "specs": {"Voltage": "20V", "Includes": "Drill, Impact, Saw"},
        **_loc("Abuja - Gwarinpa"), "posted_at": _iso_days_ago(6), "views": 88, "saves": 9,
        **_s("s_musa"),
    },

    # ═══ BUSINESS / EQUIPMENT ═════════════════════════════════
    {
        "category": "business", "subcategory": "Business Assets",
        "name": "Full Restaurant Setup — 40 Cover",
        "description": (
            "Complete restaurant setup for sale. 40-cover dining, "
            "commercial kitchen (6-burner Falcon range, twin fryer, "
            "combi-oven), full crockery + cutlery, bar setup. "
            "Location transfer possible."
        ),
        "price": 18500000, "brand": None, "condition": "used", "negotiable": True,
        "image": "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200",
        "images": [
            "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200",
            "https://images.unsplash.com/photo-1552566626-52f8b828add9?w=1200",
        ],
        "vendor": "Chinedu Okafor", "verified": True, "rating": 4.7, "reviews": 2,
        "specs": {"Cover": "40", "Location Transfer": "Yes"},
        "tags": ["premium"],
        **_loc("Lagos - Ikeja"), "posted_at": _iso_days_ago(10), "views": 420, "saves": 33,
        **_s("s_chi"),
    },

    # ═══ SERVICES ═════════════════════════════════════════════
    # NOTE: FIXA verified service providers are seeded from /app/backend/fixa_seed.py
    # instead — richer, professional profiles with headshots, badges and booking.
]


# ─── Categories (surface-ready) ──────────────────────────────────
CATEGORIES = [
    {"key": "vehicles",     "label": "Vehicles",     "emoji": "🚗", "icon": "car-sport",      "color": "#0EA5E9"},
    {"key": "real_estate",  "label": "Real Estate",  "emoji": "🏠", "icon": "home",           "color": "#DC2626"},
    {"key": "phones",       "label": "Phones",       "emoji": "📱", "icon": "phone-portrait", "color": "#059669"},
    {"key": "electronics",  "label": "Electronics",  "emoji": "💻", "icon": "laptop",         "color": "#7C3AED"},
    {"key": "furniture",    "label": "Furniture",    "emoji": "🛋", "icon": "bed",            "color": "#B45309"},
    {"key": "appliances",   "label": "Appliances",   "emoji": "🏡", "icon": "flash",          "color": "#0369A1"},
    {"key": "fashion",      "label": "Fashion",      "emoji": "👕", "icon": "shirt",          "color": "#DB2777"},
    {"key": "motorcycles",  "label": "Motorcycles",  "emoji": "🏍", "icon": "bicycle",        "color": "#F59E0B"},
    {"key": "tools",        "label": "Tools",        "emoji": "🛠", "icon": "hammer",         "color": "#374151"},
    {"key": "business",     "label": "Business",     "emoji": "📦", "icon": "briefcase",      "color": "#0A0A0A"},
    {"key": "services",     "label": "Services",     "emoji": "🧰", "icon": "construct",      "color": "#065F46"},
]

TRENDING_SEARCHES = [
    "iPhone 15", "Toyota Camry", "Lekki apartment", "3 bedroom", "Generator",
    "Sofa", "MacBook", "Rolex", "Land in Ibeju", "Furnished apartment",
]

POPULAR_BRANDS = [
    "Toyota", "Honda", "Lexus", "Mercedes-Benz", "Apple", "Samsung",
    "Dell", "HP", "LG", "Bosch", "Louis Vuitton", "Rolex", "DeWalt",
]
