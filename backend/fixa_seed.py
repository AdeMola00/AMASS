"""FIXA verified service-provider seed data.

Rich, professional Nigerian tradespeople to power the "FIXA Services" section
of the AMASS Marketplace. Each entry is stored as a `services` marketplace item
so it flows through the existing `/api/marketplace` endpoint, but carries
provider-specific fields (years of experience, jobs completed, badges) used by
the ProviderCard component on the frontend.

Photographs are professional Unsplash portraits of Black/African men and women
in workwear or business attire, chosen to feel trustworthy and premium.
"""

from datetime import datetime, timedelta, timezone


def _iso_days_ago(days: float) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()


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


# ─── FIXA Providers ─────────────────────────────────────────────
# Each dict becomes a `services` marketplace listing. The `subcategory`
# field is the trade (Plumbing, Electrical, …) so the FIXA trade chips
# also work as filters via the existing `q` search param.
FIXA_PROVIDERS: list[dict] = [
    # 1. Plumbing ──────────────────────────────────────────────
    {
        "category": "services", "subcategory": "Plumbing",
        "name": "Chuka Emenike — Master Plumber",
        "description": (
            "Certified master plumber with 12 years of experience across Lekki, "
            "Ikoyi and V.I. Specialises in overhead tank installation, PEX repiping, "
            "leak detection, WC/shower fittings and emergency call-outs. Same-day "
            "response, transparent pricing, 12-month workmanship warranty."
        ),
        "price": 15000, "brand": None, "condition": "new", "negotiable": True,
        "image": "https://images.unsplash.com/photo-1622398925373-3f91b1e275f2?w=800",
        "images": [
            "https://images.unsplash.com/photo-1622398925373-3f91b1e275f2?w=1200",
            "https://images.unsplash.com/photo-1607472586893-edb57bdc0e39?w=1200",
        ],
        "vendor": "Chuka Emenike", "verified": True, "rating": 4.9, "reviews": 187,
        "specs": {
            "Trade": "Plumbing",
            "Experience": "12 years",
            "Jobs Completed": "340+",
            "Response Time": "Under 1 hour",
            "Warranty": "12 months workmanship",
        },
        "tags": ["fixa", "top_pro"],
        **_loc("Lagos - Lekki"), "posted_at": _iso_days_ago(2), "views": 1240, "saves": 96,
        # Seller identity
        "seller_id": "fixa_chuka", "seller_name": "Chuka Emenike",
        "seller_avatar": "https://images.unsplash.com/photo-1531384441138-2736e62e0919?w=400",
        "seller_phone": "+2348012345001", "seller_whatsapp": "+2348012345001",
        "seller_type": "individual", "seller_verified": True,
        "seller_rating": 4.9, "seller_reviews": 187, "seller_joined_year": 2020,
        "seller_response_time_hours": 1, "seller_response_rate": 98,
        "seller_bio": "Lagos-based master plumber. Emergency call-outs 24/7.",
        # FIXA-specific
        "provider_years_experience": 12,
        "provider_jobs_completed": 340,
        "provider_specializations": ["Overhead tanks", "Leak detection", "PEX repiping", "Emergency call-outs"],
        "provider_service_areas": ["Lekki", "Ikoyi", "Victoria Island", "Ajah"],
        "is_fixa_verified": True,
        "fixa_badges": ["Background Checked", "Insured", "Top Pro"],
    },
    # 2. Electrical ────────────────────────────────────────────
    {
        "category": "services", "subcategory": "Electrical",
        "name": "Engr. Adebayo Ogunleye — Certified Electrician",
        "description": (
            "COREN-registered electrical engineer with 15 years wiring homes, "
            "showrooms and office fit-outs. Full-house rewiring, inverter/solar "
            "changeover panels, LED lighting design, generator ATS installs, and "
            "safety audits. Bonded and fully insured."
        ),
        "price": 25000, "brand": None, "condition": "new", "negotiable": True,
        "image": "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=800",
        "images": [
            "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=1200",
            "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1200",
        ],
        "vendor": "Adebayo Ogunleye", "verified": True, "rating": 5.0, "reviews": 231,
        "specs": {
            "Trade": "Electrical",
            "Experience": "15 years",
            "Jobs Completed": "410+",
            "Certification": "COREN + NECA",
            "Insurance": "Full public liability",
        },
        "tags": ["fixa", "top_pro", "featured"],
        "is_featured": True,
        **_loc("Lagos - Ikeja"), "posted_at": _iso_days_ago(4), "views": 2140, "saves": 178,
        "seller_id": "fixa_adebayo", "seller_name": "Engr. Adebayo Ogunleye",
        "seller_avatar": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400",
        "seller_phone": "+2348012345002", "seller_whatsapp": "+2348012345002",
        "seller_type": "individual", "seller_verified": True,
        "seller_rating": 5.0, "seller_reviews": 231, "seller_joined_year": 2018,
        "seller_response_time_hours": 1, "seller_response_rate": 99,
        "seller_bio": "COREN-registered. Rewiring, solar changeover, generator ATS.",
        "provider_years_experience": 15,
        "provider_jobs_completed": 410,
        "provider_specializations": ["Full-house rewiring", "Solar / inverter", "Generator ATS", "LED design"],
        "provider_service_areas": ["Ikeja", "GRA", "Magodo", "Ogba", "Yaba"],
        "is_fixa_verified": True,
        "fixa_badges": ["COREN Certified", "Background Checked", "Insured", "Top Pro"],
    },
    # 3. Painting ──────────────────────────────────────────────
    {
        "category": "services", "subcategory": "Painting",
        "name": "Ibrahim Aliyu — Interior & Exterior Painter",
        "description": (
            "8 years painting luxury homes and boutique offices. Premium finishes "
            "including textured walls, Venetian stucco, epoxy floors, ceiling "
            "moldings and colour consulting. Dulux & Berger authorised applicator. "
            "Dust-controlled process — furniture stays."
        ),
        "price": 8000, "brand": None, "condition": "new", "negotiable": True,
        "image": "https://images.unsplash.com/photo-1562259949-e8e7689d7828?w=800",
        "images": [
            "https://images.unsplash.com/photo-1562259949-e8e7689d7828?w=1200",
            "https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=1200",
        ],
        "vendor": "Ibrahim Aliyu", "verified": True, "rating": 4.8, "reviews": 96,
        "specs": {
            "Trade": "Painting",
            "Experience": "8 years",
            "Jobs Completed": "180+",
            "Specialty": "Textured & Venetian finishes",
            "Rate": "From ₦8,000 / room",
        },
        "tags": ["fixa"],
        **_loc("Lagos - Yaba"), "posted_at": _iso_days_ago(1.5), "views": 680, "saves": 42,
        "seller_id": "fixa_ibrahim", "seller_name": "Ibrahim Aliyu",
        "seller_avatar": "https://images.unsplash.com/photo-1552058544-f2b08422138a?w=400",
        "seller_phone": "+2348012345003", "seller_whatsapp": "+2348012345003",
        "seller_type": "individual", "seller_verified": True,
        "seller_rating": 4.8, "seller_reviews": 96, "seller_joined_year": 2021,
        "seller_response_time_hours": 2, "seller_response_rate": 94,
        "seller_bio": "Premium interior finishes. Dulux & Berger authorised applicator.",
        "provider_years_experience": 8,
        "provider_jobs_completed": 180,
        "provider_specializations": ["Textured walls", "Venetian stucco", "Epoxy floors", "Colour consulting"],
        "provider_service_areas": ["Yaba", "Surulere", "Lekki", "Ikoyi"],
        "is_fixa_verified": True,
        "fixa_badges": ["Background Checked", "Authorised Applicator"],
    },
    # 4. Masonry ───────────────────────────────────────────────
    {
        "category": "services", "subcategory": "Masonry",
        "name": "Emeka Nwachukwu — Master Mason & Bricklayer",
        "description": (
            "20 years building homes across Lagos and Anambra. Blockwork, plastering, "
            "screeding, foundation work, garden walls, driveways and stone cladding. "
            "Runs a 4-man crew — clean sites, on-time delivery. Free site visit."
        ),
        "price": 12000, "brand": None, "condition": "new", "negotiable": True,
        "image": "https://images.unsplash.com/photo-1541888946425-d81bb19240f5?w=800",
        "images": [
            "https://images.unsplash.com/photo-1541888946425-d81bb19240f5?w=1200",
            "https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=1200",
        ],
        "vendor": "Emeka Nwachukwu", "verified": True, "rating": 4.9, "reviews": 142,
        "specs": {
            "Trade": "Masonry",
            "Experience": "20 years",
            "Jobs Completed": "260+",
            "Crew Size": "4 people",
            "Rate": "From ₦12,000 / day",
        },
        "tags": ["fixa", "top_pro"],
        **_loc("Lagos - Ajah"), "posted_at": _iso_days_ago(5), "views": 890, "saves": 61,
        "seller_id": "fixa_emeka", "seller_name": "Emeka Nwachukwu",
        "seller_avatar": "https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=400",
        "seller_phone": "+2348012345004", "seller_whatsapp": "+2348012345004",
        "seller_type": "individual", "seller_verified": True,
        "seller_rating": 4.9, "seller_reviews": 142, "seller_joined_year": 2016,
        "seller_response_time_hours": 3, "seller_response_rate": 95,
        "seller_bio": "Bricklayer & plaster specialist. Free site visits.",
        "provider_years_experience": 20,
        "provider_jobs_completed": 260,
        "provider_specializations": ["Blockwork", "Plastering", "Screeding", "Stone cladding", "Driveways"],
        "provider_service_areas": ["Ajah", "Lekki", "Ibeju-Lekki", "Sangotedo"],
        "is_fixa_verified": True,
        "fixa_badges": ["Background Checked", "Top Pro"],
    },
    # 5. AC Repair ─────────────────────────────────────────────
    {
        "category": "services", "subcategory": "AC Repair",
        "name": "Yusuf Bello — AC & Refrigeration Engineer",
        "description": (
            "10 years servicing split units, cassette ACs, VRF systems and "
            "commercial cold rooms. Gas top-ups, deep cleans, board repairs, "
            "installation and preventive maintenance contracts for offices. "
            "LG, Samsung & Daikin trained."
        ),
        "price": 10000, "brand": None, "condition": "new", "negotiable": True,
        "image": "https://images.unsplash.com/photo-1621274790572-7c32596bc67f?w=800",
        "images": [
            "https://images.unsplash.com/photo-1621274790572-7c32596bc67f?w=1200",
        ],
        "vendor": "Yusuf Bello", "verified": True, "rating": 4.8, "reviews": 118,
        "specs": {
            "Trade": "AC Repair",
            "Experience": "10 years",
            "Jobs Completed": "220+",
            "Manufacturer Training": "LG, Samsung, Daikin",
            "Rate": "From ₦10,000 / unit",
        },
        "tags": ["fixa"],
        **_loc("Abuja - Wuse 2"), "posted_at": _iso_days_ago(3), "views": 540, "saves": 38,
        "seller_id": "fixa_yusuf", "seller_name": "Yusuf Bello",
        "seller_avatar": "https://images.unsplash.com/photo-1618077360395-f3068be8e001?w=400",
        "seller_phone": "+2348012345005", "seller_whatsapp": "+2348012345005",
        "seller_type": "individual", "seller_verified": True,
        "seller_rating": 4.8, "seller_reviews": 118, "seller_joined_year": 2020,
        "seller_response_time_hours": 2, "seller_response_rate": 96,
        "seller_bio": "AC & refrigeration engineer. Preventive maintenance contracts available.",
        "provider_years_experience": 10,
        "provider_jobs_completed": 220,
        "provider_specializations": ["Split & cassette ACs", "VRF systems", "Cold rooms", "Gas top-ups"],
        "provider_service_areas": ["Wuse 2", "Maitama", "Asokoro", "Jabi"],
        "is_fixa_verified": True,
        "fixa_badges": ["Manufacturer Trained", "Background Checked"],
    },
    # 6. Carpentry ─────────────────────────────────────────────
    {
        "category": "services", "subcategory": "Carpentry",
        "name": "Segun Adeoye — Bespoke Carpenter & Joiner",
        "description": (
            "14 years crafting bespoke wardrobes, kitchen cabinetry, TV consoles, "
            "wall panels and hardwood staircases. CNC-cut precision, imported "
            "hinges, soft-close everything. Site measurements within 48hrs."
        ),
        "price": 40000, "brand": None, "condition": "new", "negotiable": True,
        "image": "https://images.unsplash.com/photo-1601058272856-4b8a83a1c73d?w=800",
        "images": [
            "https://images.unsplash.com/photo-1601058272856-4b8a83a1c73d?w=1200",
            "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200",
        ],
        "vendor": "Segun Adeoye", "verified": True, "rating": 4.9, "reviews": 164,
        "specs": {
            "Trade": "Carpentry",
            "Experience": "14 years",
            "Jobs Completed": "310+",
            "Specialty": "Wardrobes & kitchen cabinetry",
            "Rate": "From ₦40,000 / linear metre",
        },
        "tags": ["fixa", "top_pro", "featured"],
        "is_featured": True,
        **_loc("Lagos - Surulere"), "posted_at": _iso_days_ago(6), "views": 1120, "saves": 84,
        "seller_id": "fixa_segun", "seller_name": "Segun Adeoye",
        "seller_avatar": "https://images.unsplash.com/photo-1568602471122-7832951cc4c5?w=400",
        "seller_phone": "+2348012345006", "seller_whatsapp": "+2348012345006",
        "seller_type": "individual", "seller_verified": True,
        "seller_rating": 4.9, "seller_reviews": 164, "seller_joined_year": 2019,
        "seller_response_time_hours": 2, "seller_response_rate": 97,
        "seller_bio": "Bespoke joinery. CNC-cut. Soft-close everything.",
        "provider_years_experience": 14,
        "provider_jobs_completed": 310,
        "provider_specializations": ["Wardrobes", "Kitchen cabinetry", "Wall panels", "Staircases"],
        "provider_service_areas": ["Surulere", "Yaba", "Lekki", "Ikoyi"],
        "is_fixa_verified": True,
        "fixa_badges": ["Background Checked", "Top Pro"],
    },
    # 7. Cleaning ──────────────────────────────────────────────
    {
        "category": "services", "subcategory": "Cleaning",
        "name": "Ngozi Okonkwo — Deep Cleaning Specialist",
        "description": (
            "6 years running a 6-person crew across Victoria Island and Ikoyi. "
            "Move-in / move-out deep cleans, post-construction cleaning, sofa & "
            "carpet steam wash, kitchen deep-scrub, marble polishing. Same-day "
            "booking available."
        ),
        "price": 45000, "brand": None, "condition": "new", "negotiable": True,
        "image": "https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=800",
        "images": [
            "https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=1200",
            "https://images.unsplash.com/photo-1584820927498-cfe5211fd8bf?w=1200",
        ],
        "vendor": "Ngozi Okonkwo", "verified": True, "rating": 5.0, "reviews": 208,
        "specs": {
            "Trade": "Cleaning",
            "Experience": "6 years",
            "Jobs Completed": "480+",
            "Crew Size": "6 people",
            "Rate": "From ₦45,000 / apartment",
        },
        "tags": ["fixa", "top_pro"],
        **_loc("Lagos - Victoria Island"), "posted_at": _iso_days_ago(0.5), "views": 720, "saves": 58,
        "seller_id": "fixa_ngozi", "seller_name": "Ngozi Okonkwo",
        "seller_avatar": "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=400",
        "seller_phone": "+2348012345007", "seller_whatsapp": "+2348012345007",
        "seller_type": "individual", "seller_verified": True,
        "seller_rating": 5.0, "seller_reviews": 208, "seller_joined_year": 2022,
        "seller_response_time_hours": 1, "seller_response_rate": 100,
        "seller_bio": "Deep cleaning specialist. Same-day bookings welcome.",
        "provider_years_experience": 6,
        "provider_jobs_completed": 480,
        "provider_specializations": ["Move-in/out cleans", "Post-construction", "Sofa steam", "Marble polishing"],
        "provider_service_areas": ["Victoria Island", "Ikoyi", "Lekki Phase 1"],
        "is_fixa_verified": True,
        "fixa_badges": ["Background Checked", "Insured", "Top Pro"],
    },
    # 8. Tiling ────────────────────────────────────────────────
    {
        "category": "services", "subcategory": "Tiling",
        "name": "Adebola Bakare — Master Tiler",
        "description": (
            "11 years laying porcelain, ceramic, marble and travertine. Bathrooms, "
            "kitchens, feature walls, swimming pool surrounds and staircases. "
            "Uses laser levels — dead-flat surfaces guaranteed. Waterproofing "
            "included on all wet-area jobs."
        ),
        "price": 6500, "brand": None, "condition": "new", "negotiable": True,
        "image": "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800",
        "images": [
            "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200",
            "https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=1200",
        ],
        "vendor": "Adebola Bakare", "verified": True, "rating": 4.8, "reviews": 87,
        "specs": {
            "Trade": "Tiling",
            "Experience": "11 years",
            "Jobs Completed": "195+",
            "Specialty": "Marble & porcelain",
            "Rate": "From ₦6,500 / sqm",
        },
        "tags": ["fixa"],
        **_loc("Abuja - Maitama"), "posted_at": _iso_days_ago(2.5), "views": 460, "saves": 33,
        "seller_id": "fixa_adebola", "seller_name": "Adebola Bakare",
        "seller_avatar": "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=400",
        "seller_phone": "+2348012345008", "seller_whatsapp": "+2348012345008",
        "seller_type": "individual", "seller_verified": True,
        "seller_rating": 4.8, "seller_reviews": 87, "seller_joined_year": 2020,
        "seller_response_time_hours": 2, "seller_response_rate": 93,
        "seller_bio": "Master tiler. Laser-levelled, waterproofed.",
        "provider_years_experience": 11,
        "provider_jobs_completed": 195,
        "provider_specializations": ["Porcelain", "Marble", "Travertine", "Pool surrounds"],
        "provider_service_areas": ["Maitama", "Asokoro", "Wuse", "Gwarinpa"],
        "is_fixa_verified": True,
        "fixa_badges": ["Background Checked"],
    },
    # 9. Solar ─────────────────────────────────────────────────
    {
        "category": "services", "subcategory": "Solar",
        "name": "Chidi Okoro — Solar & Inverter Engineer",
        "description": (
            "9 years designing residential and light-commercial solar systems. "
            "Load audits, panel sizing (3kVA–30kVA), lithium battery banks, hybrid "
            "inverter installs and net-metering. Free 12-month system health check."
        ),
        "price": 350000, "brand": None, "condition": "new", "negotiable": True,
        "image": "https://images.unsplash.com/photo-1613665813446-82a78c468a1d?w=800",
        "images": [
            "https://images.unsplash.com/photo-1613665813446-82a78c468a1d?w=1200",
            "https://images.unsplash.com/photo-1509391366360-2e959784a276?w=1200",
        ],
        "vendor": "Chidi Okoro", "verified": True, "rating": 4.9, "reviews": 74,
        "specs": {
            "Trade": "Solar",
            "Experience": "9 years",
            "Jobs Completed": "120+",
            "System Range": "3kVA – 30kVA",
            "Warranty": "Panels 10y · Inverter 5y",
        },
        "tags": ["fixa", "top_pro"],
        **_loc("Abuja - Gwarinpa"), "posted_at": _iso_days_ago(7), "views": 830, "saves": 71,
        "seller_id": "fixa_chidi", "seller_name": "Chidi Okoro",
        "seller_avatar": "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=400",
        "seller_phone": "+2348012345009", "seller_whatsapp": "+2348012345009",
        "seller_type": "individual", "seller_verified": True,
        "seller_rating": 4.9, "seller_reviews": 74, "seller_joined_year": 2019,
        "seller_response_time_hours": 3, "seller_response_rate": 92,
        "seller_bio": "Solar engineer. 3kVA to 30kVA hybrid systems.",
        "provider_years_experience": 9,
        "provider_jobs_completed": 120,
        "provider_specializations": ["Solar panels", "Lithium banks", "Hybrid inverters", "Load audits"],
        "provider_service_areas": ["Gwarinpa", "Kubwa", "Life Camp", "Wuse"],
        "is_fixa_verified": True,
        "fixa_badges": ["Certified Installer", "Background Checked", "Top Pro"],
    },
    # 10. CCTV ─────────────────────────────────────────────────
    {
        "category": "services", "subcategory": "CCTV",
        "name": "Musa Umar — CCTV & Smart Security Installer",
        "description": (
            "7 years installing Hikvision, Dahua and Ring smart-home systems. "
            "4K IP camera arrays, video doorbells, biometric access control, "
            "gate automation and cloud NVR configuration. Free 6-month remote "
            "monitoring app support."
        ),
        "price": 180000, "brand": None, "condition": "new", "negotiable": True,
        "image": "https://images.unsplash.com/photo-1558002038-1055907df827?w=800",
        "images": [
            "https://images.unsplash.com/photo-1558002038-1055907df827?w=1200",
        ],
        "vendor": "Musa Umar", "verified": True, "rating": 4.7, "reviews": 63,
        "specs": {
            "Trade": "CCTV",
            "Experience": "7 years",
            "Jobs Completed": "140+",
            "Brands": "Hikvision, Dahua, Ring",
            "Rate": "From ₦180,000 / 4-cam kit",
        },
        "tags": ["fixa"],
        **_loc("Port Harcourt"), "posted_at": _iso_days_ago(4.5), "views": 390, "saves": 27,
        "seller_id": "fixa_musa", "seller_name": "Musa Umar",
        "seller_avatar": "https://images.unsplash.com/photo-1590086782957-93c06ef21604?w=400",
        "seller_phone": "+2348012345010", "seller_whatsapp": "+2348012345010",
        "seller_type": "individual", "seller_verified": True,
        "seller_rating": 4.7, "seller_reviews": 63, "seller_joined_year": 2021,
        "seller_response_time_hours": 4, "seller_response_rate": 90,
        "seller_bio": "Smart security installer. Hikvision & Dahua certified.",
        "provider_years_experience": 7,
        "provider_jobs_completed": 140,
        "provider_specializations": ["4K IP arrays", "Video doorbells", "Access control", "Gate automation"],
        "provider_service_areas": ["Port Harcourt", "GRA", "Trans-Amadi"],
        "is_fixa_verified": True,
        "fixa_badges": ["Background Checked", "Manufacturer Certified"],
    },
    # 11. Movers ───────────────────────────────────────────────
    {
        "category": "services", "subcategory": "Movers",
        "name": "Femi Adeyemi — Home & Office Movers",
        "description": (
            "5 years running a bonded moving company. Full-service packing, "
            "professional wrapping for glass and art, disassembly / reassembly, "
            "and inventoried delivery. Fleet of 3 trucks (small to 5-ton). "
            "In-transit insurance up to ₦20M."
        ),
        "price": 120000, "brand": None, "condition": "new", "negotiable": True,
        "image": "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800",
        "images": [
            "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200",
        ],
        "vendor": "Femi Adeyemi", "verified": True, "rating": 4.8, "reviews": 92,
        "specs": {
            "Trade": "Movers",
            "Experience": "5 years",
            "Jobs Completed": "260+",
            "Fleet": "3 trucks (S / M / 5-ton)",
            "Insurance": "Up to ₦20M in-transit",
        },
        "tags": ["fixa"],
        **_loc("Lagos - Ikeja"), "posted_at": _iso_days_ago(1.2), "views": 560, "saves": 44,
        "seller_id": "fixa_femi_mv", "seller_name": "Femi Adeyemi",
        "seller_avatar": "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400",
        "seller_phone": "+2348012345011", "seller_whatsapp": "+2348012345011",
        "seller_type": "individual", "seller_verified": True,
        "seller_rating": 4.8, "seller_reviews": 92, "seller_joined_year": 2022,
        "seller_response_time_hours": 2, "seller_response_rate": 95,
        "seller_bio": "Bonded movers. In-transit insurance up to ₦20M.",
        "provider_years_experience": 5,
        "provider_jobs_completed": 260,
        "provider_specializations": ["Home moving", "Office relocation", "Art wrapping", "Storage"],
        "provider_service_areas": ["Lagos-wide", "Abuja", "Ibadan"],
        "is_fixa_verified": True,
        "fixa_badges": ["Insured", "Background Checked"],
    },
    # 12. Interior Design ──────────────────────────────────────
    {
        "category": "services", "subcategory": "Interior",
        "name": "Zainab Yakubu — Interior Designer",
        "description": (
            "8 years crafting warm, contemporary Nigerian homes. Full design "
            "packages: moodboards, 3D renders, sourcing, project management "
            "and installation. Featured in Casa Lagos Magazine 2024. "
            "Complimentary discovery call."
        ),
        "price": 250000, "brand": None, "condition": "new", "negotiable": True,
        "image": "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=800",
        "images": [
            "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=1200",
            "https://images.unsplash.com/photo-1615873968403-89e068629265?w=1200",
        ],
        "vendor": "Zainab Yakubu", "verified": True, "rating": 4.9, "reviews": 51,
        "specs": {
            "Trade": "Interior Design",
            "Experience": "8 years",
            "Jobs Completed": "72",
            "Featured In": "Casa Lagos Magazine 2024",
            "Starting Package": "₦250,000 / room",
        },
        "tags": ["fixa", "featured"],
        "is_featured": True,
        **_loc("Lagos - Ikoyi"), "posted_at": _iso_days_ago(8), "views": 940, "saves": 78,
        "seller_id": "fixa_zainab", "seller_name": "Zainab Yakubu",
        "seller_avatar": "https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=400",
        "seller_phone": "+2348012345012", "seller_whatsapp": "+2348012345012",
        "seller_type": "individual", "seller_verified": True,
        "seller_rating": 4.9, "seller_reviews": 51, "seller_joined_year": 2019,
        "seller_response_time_hours": 4, "seller_response_rate": 91,
        "seller_bio": "Contemporary Nigerian interiors. Full-package design & sourcing.",
        "provider_years_experience": 8,
        "provider_jobs_completed": 72,
        "provider_specializations": ["3D renders", "Moodboards", "Sourcing", "Project management"],
        "provider_service_areas": ["Ikoyi", "Lekki", "Victoria Island", "Banana Island"],
        "is_fixa_verified": True,
        "fixa_badges": ["Background Checked", "Top Pro"],
    },
]
