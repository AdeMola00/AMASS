"""
Demo homes — a believable, photo-rich catalogue so the map opens on real-looking listings.

* `purge_test_listings(db)` removes leftovers from automated test runs (TEST_* titles, chat/boost
  fixtures, example.com photos) together with the saves, boosts, chats and events that point at them.
* `seed_demo_homes(db, Property, hash_password)` is idempotent (keyed by `seed_key`): it creates four
  demo agents (approved, identity-verified) and ~40 homes across Lagos, Abuja, Port Harcourt, Ibadan,
  Abeokuta and Enugu. Nothing here touches wallets, pricing or unlock logic.
"""
from __future__ import annotations

import logging
import re
import uuid
from datetime import datetime, timedelta, timezone

logger = logging.getLogger("amass.demo_homes")

TEST_TITLE_RX = re.compile(r"^(TEST[_ ]|Test |Phase2 Chat|Chat Test|E2E[_ ]|Pytest|QA[_ ])", re.I)

AGENT_PASSWORD = "Agent2026!"

DEMO_AGENTS = [
    {"key": "adaeze", "full_name": "Adaeze Okoye", "email": "adaeze.okoye@amass.africa", "phone": "+2348031000001", "avatar": "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=300", "agency_name": "Okoye & Partners Realty", "state": "Lagos", "lga": "Eti-Osa", "years": 9, "areas": ["Lekki Phase 1", "Ikoyi", "Victoria Island"], "specs": ["Luxury homes", "Waterfront"], "level": 3},
    {"key": "tunde", "full_name": "Tunde Bakare", "email": "tunde.bakare@amass.africa", "phone": "+2348031000002", "avatar": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300", "agency_name": "Bakare Homes", "state": "Lagos", "lga": "Ikeja", "years": 6, "areas": ["Ikeja GRA", "Magodo", "Yaba", "Gbagada"], "specs": ["Family homes", "Rentals"], "level": 2},
    {"key": "ngozi", "full_name": "Ngozi Eze", "email": "ngozi.eze@amass.africa", "phone": "+2348031000003", "avatar": "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=300", "agency_name": "Eze Estates", "state": "FCT", "lga": "Abuja Municipal", "years": 11, "areas": ["Maitama", "Asokoro", "Wuse 2", "Gwarinpa"], "specs": ["Diplomatic lets", "Land"], "level": 3},
    {"key": "emeka", "full_name": "Emeka Obi", "email": "emeka.obi@amass.africa", "phone": "+2348031000004", "avatar": "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=300", "agency_name": "Obi Property Group", "state": "Rivers", "lga": "Port Harcourt", "years": 7, "areas": ["GRA Phase 2", "Trans Amadi", "Bodija", "Independence Layout"], "specs": ["Commercial", "New builds"], "level": 2},
]

U = "https://images.unsplash.com/photo-"
# Curated real-estate photography (exterior / interior / aerial). Broken links fall back to an icon in the UI.
EXT = [f"{U}1613977257363-707ba9348227?w=1200", f"{U}1600596542815-ffad4c1539a9?w=1200", f"{U}1600585154340-be6161a56a0c?w=1200", f"{U}1600607687939-ce8a6c25118c?w=1200", f"{U}1512917774080-9991f1c4c750?w=1200", f"{U}1568605114967-8130f3a36994?w=1200", f"{U}1570129477492-45c003edd2be?w=1200", f"{U}1580587771525-78b9dba3b914?w=1200", f"{U}1600047509807-ba8f99d2cdde?w=1200", f"{U}1600585154526-990dced4db0d?w=1200", f"{U}1600573472592-401b489a3cdc?w=1200", f"{U}1600210492486-724fe5c67fb0?w=1200", f"{U}1600121848594-d8644e57abab?w=1200", f"{U}1564013799919-ab600027ffc6?w=1200", f"{U}1605276374104-dee2a0ed3cd6?w=1200", f"{U}1598228723793-52759bba239c?w=1200", f"{U}1576941089067-2de3c901e126?w=1200", f"{U}1583608205776-bfd35f0d9f83?w=1200", f"{U}1523217582562-09d0def993a6?w=1200", f"{U}1480074568708-e7b720bb3f09?w=1200"]
INT = [f"{U}1600566753190-17f0baa2a6c3?w=1200", f"{U}1600566752355-35792bedcfea?w=1200", f"{U}1600585152220-90363fe7e115?w=1200", f"{U}1600607688969-a5bfcd646154?w=1200", f"{U}1600566753086-00f18fb6b3ea?w=1200", f"{U}1560448204-e02f11c3d0e2?w=1200", f"{U}1484154218962-a197022b5858?w=1200", f"{U}1502672260266-1c1ef2d93688?w=1200", f"{U}1522708323590-d24dbb6b0267?w=1200", f"{U}1554995207-c18c203602cb?w=1200", f"{U}1493809842364-78817add7ffb?w=1200", f"{U}1536376072261-38c75010e6c9?w=1200", f"{U}1631049307264-da0ec9d70304?w=1200", f"{U}1616594039964-ae9021a400a0?w=1200", f"{U}1616486338812-3dadae4b4ace?w=1200", f"{U}1617806118233-18e1de247200?w=1200", f"{U}1556909114-f6e7ad7d3136?w=1200", f"{U}1556911220-bff31c812dba?w=1200"]
LAND = [f"{U}1500382017468-9049fed747ef?w=1200", f"{U}1500530855697-b586d89ba3ee?w=1200", f"{U}1464146072230-91cabc968266?w=1200", f"{U}1416331108676-a22ccb276e35?w=1200"]
OFFICE = [f"{U}1497366216548-37526070297c?w=1200", f"{U}1497366811353-6870744d04b2?w=1200", f"{U}1524758631624-e2822e304c36?w=1200", f"{U}1497215728101-856f4ea42174?w=1200"]
APT = [f"{U}1545324418-cc1a3fa10c00?w=1200", f"{U}1515263487990-61b07816b324?w=1200", f"{U}1449844908441-8829872d2607?w=1200", f"{U}1460317442991-0ec209397118?w=1200", f"{U}1430285561322-7808604715df?w=1200", f"{U}1505843513577-22bb7d21e455?w=1200"]


def _pics(kind: str, i: int, n: int = 4) -> list[str]:
    pool = {"land": LAND, "office": OFFICE, "apt": APT + INT, "ext": EXT}[kind]
    cover = pool[i % len(pool)]
    rest = [p for p in (INT if kind in ("ext", "apt") else pool) if p != cover]
    out = [cover]
    for k in range(n - 1):
        out.append(rest[(i * 3 + k) % len(rest)])
    return out


def H(key, title, price, lt, pt, beds, baths, sqm, loc, city, state, lat, lng, agent, *, pics="ext", amenities=None, status="available", verified=True, source="mandated", year=None, parking=None, score=None, val=None, desc=None, n_pics=4, days_ago=3):
    return {
        "seed_key": key, "title": title, "price": price, "listing_type": lt, "property_type": pt, "bedrooms": beds, "bathrooms": baths, "size_sqm": sqm,
        "location": loc, "city": city, "state": state, "latitude": lat, "longitude": lng, "agent": agent, "pics": pics, "n_pics": n_pics,
        "amenities": amenities or [], "status": status, "verified": verified, "listing_source": source, "year_built": year, "parking": parking,
        "investment_score": score, "ai_valuation": val, "days_ago": days_ago,
        "description": desc or f"{title}. Well-finished, ready to move in, with secure estate access and reliable power. Inspection by appointment.",
    }


LUX = ["Swimming Pool", "24/7 Security", "Gym", "Solar Power", "Smart Home", "CCTV", "Elevator"]
FAM = ["24/7 Security", "Borehole", "Generator", "Fitted Kitchen", "Family Lounge", "BQ"]
APTA = ["Elevator", "24/7 Security", "Gym", "Backup Power", "Concierge", "Parking"]

DEMO_HOMES = [
    # ── Lekki Phase 1 (nearby-first default view) ─────────────────────────────
    H("lk1", "Contemporary 5-Bed Detached Duplex, Lekki Phase 1", 420_000_000, "buy", "duplex", 5, 6, 560, "Admiralty Way, Lekki Phase 1", "Lekki", "Lagos", 6.4478, 3.4723, "adaeze", amenities=LUX, status="premium", year=2024, parking=4, score=91, val=440_000_000, days_ago=2, n_pics=5),
    H("lk2", "Fully Serviced 3-Bed Apartment, Lekki Phase 1", 14_000_000, "rent", "apartment", 3, 3, 185, "Fola Osibo Road, Lekki Phase 1", "Lekki", "Lagos", 6.4420, 3.4690, "adaeze", pics="apt", amenities=APTA, year=2021, parking=2, days_ago=1),
    H("lk3", "Waterfront 4-Bed Terrace with BQ, Lekki Phase 1", 285_000_000, "buy", "terrace", 4, 5, 380, "Omorinre Johnson Street, Lekki Phase 1", "Lekki", "Lagos", 6.4505, 3.4780, "adaeze", amenities=FAM + ["Waterfront"], year=2022, parking=3, score=84, val=290_000_000, days_ago=5),
    H("lk4", "Luxury Shortlet Studio, Lekki Phase 1", 95_000, "shortlet", "apartment", 1, 1, 62, "Freedom Way, Lekki Phase 1", "Lekki", "Lagos", 6.4390, 3.4620, "adaeze", pics="apt", amenities=["Wi-Fi", "Netflix", "24/7 Power", "Pool", "Housekeeping"], verified=True, source="owner_listed", year=2023, parking=1, days_ago=4, n_pics=5),
    H("lk5", "Brand-New 4-Bed Semi-Detached Duplex, Lekki Phase 1", 310_000_000, "buy", "duplex", 4, 5, 420, "Chief Yesufu Abiodun Way, Lekki Phase 1", "Lekki", "Lagos", 6.4456, 3.4851, "adaeze", amenities=FAM + ["Rooftop Terrace"], status="coming_soon", year=2026, parking=3, score=88, val=320_000_000, days_ago=1),
    H("lk6", "Executive 2-Bed Flat, Lekki Phase 1", 9_500_000, "rent", "apartment", 2, 2, 120, "Bisola Durosinmi Etti Drive, Lekki Phase 1", "Lekki", "Lagos", 6.4445, 3.4650, "adaeze", pics="apt", amenities=APTA, year=2020, parking=1, days_ago=7),
    H("lk7", "Prime Commercial Plot (1,200 sqm), Lekki Phase 1", 950_000_000, "buy", "land", 0, 0, 1200, "Lekki–Epe Expressway, Lekki Phase 1", "Lekki", "Lagos", 6.4360, 3.4800, "adaeze", pics="land", amenities=["C of O", "Fenced", "Tarred Road"], source="owner_listed", score=86, days_ago=9, n_pics=3),
    # ── Lekki corridor: Osapa, Chevron, Ikota, Lekki Phase 2, Ajah, Sangotedo ──
    H("os1", "4-Bed Terrace in Gated Estate, Osapa London", 165_000_000, "buy", "terrace", 4, 4, 300, "Osapa London Estate, Lekki", "Lekki", "Lagos", 6.4420, 3.4950, "adaeze", amenities=FAM, year=2019, parking=2, score=79, val=170_000_000, days_ago=6),
    H("ch1", "5-Bed Detached Duplex with Pool, Chevron Drive", 240_000_000, "buy", "duplex", 5, 5, 480, "Chevron Drive, Lekki", "Lekki", "Lagos", 6.4440, 3.5060, "adaeze", amenities=LUX, year=2021, parking=4, score=83, val=250_000_000, days_ago=3, n_pics=5),
    H("ik1", "3-Bed Apartment, Ikota Villa Estate", 7_500_000, "rent", "apartment", 3, 3, 150, "Ikota Villa Estate, Lekki", "Lekki", "Lagos", 6.4530, 3.5390, "adaeze", pics="apt", amenities=FAM, year=2018, parking=2, days_ago=2),
    H("lp2", "4-Bed Semi-Detached Duplex, Lekki Phase 2", 135_000_000, "buy", "duplex", 4, 4, 340, "Lekki Phase 2, Lekki", "Lekki", "Lagos", 6.4580, 3.5280, "adaeze", amenities=FAM, verified=False, source="independent", year=2020, parking=2, days_ago=8),
    H("aj1", "4-Bed Fully Detached Duplex, Ajah", 118_000_000, "buy", "duplex", 4, 5, 320, "Thomas Estate, Ajah", "Ajah", "Lagos", 6.4690, 3.5740, "adaeze", amenities=FAM, year=2022, parking=3, score=76, val=120_000_000, days_ago=4),
    H("aj2", "2-Bed Flat, Abraham Adesanya Estate", 3_800_000, "rent", "apartment", 2, 2, 95, "Abraham Adesanya Estate, Ajah", "Ajah", "Lagos", 6.4620, 3.5600, "adaeze", pics="apt", amenities=["Security", "Borehole", "Prepaid Meter"], year=2016, parking=1, days_ago=11),
    H("sg1", "Dry Residential Plot (600 sqm), Sangotedo", 58_000_000, "buy", "land", 0, 0, 600, "Monastery Road, Sangotedo", "Ajah", "Lagos", 6.4750, 3.6150, "adaeze", pics="land", amenities=["Governor's Consent", "Gated Estate", "Dry Land"], source="owner_listed", score=81, days_ago=5, n_pics=3),
    H("sg2", "3-Bed Bungalow, Sangotedo", 68_000_000, "buy", "bungalow", 3, 3, 210, "Lekki Gardens Phase 2, Sangotedo", "Ajah", "Lagos", 6.4710, 3.6080, "adaeze", amenities=FAM, year=2017, parking=2, days_ago=12),
    # ── Ikoyi & Banana Island ─────────────────────────────────────────────────
    H("iy1", "Luxury 4-Bed Apartment, Bourdillon Road", 650_000_000, "buy", "apartment", 4, 5, 420, "Bourdillon Road, Ikoyi", "Ikoyi", "Lagos", 6.4541, 3.4316, "adaeze", pics="apt", amenities=LUX + ["Concierge"], status="premium", year=2023, parking=3, score=93, val=690_000_000, days_ago=2, n_pics=5),
    H("iy2", "Classic 5-Bed Detached House, Glover Road", 1_250_000_000, "buy", "duplex", 5, 6, 820, "Glover Road, Ikoyi", "Ikoyi", "Lagos", 6.4470, 3.4340, "adaeze", amenities=LUX + ["Staff Quarters", "Garden"], year=2015, parking=6, score=90, val=1_300_000_000, days_ago=6),
    H("iy3", "3-Bed Serviced Apartment, Ikoyi", 28_000_000, "rent", "apartment", 3, 3, 210, "Awolowo Road, Ikoyi", "Ikoyi", "Lagos", 6.4520, 3.4250, "adaeze", pics="apt", amenities=APTA, year=2022, parking=2, days_ago=3),
    H("bn1", "Waterfront 6-Bed Mansion, Banana Island", 3_200_000_000, "buy", "duplex", 6, 7, 1400, "Banana Island, Ikoyi", "Ikoyi", "Lagos", 6.4575, 3.4440, "adaeze", amenities=LUX + ["Private Jetty", "Cinema", "Staff Quarters"], status="premium", year=2024, parking=8, score=95, val=3_350_000_000, days_ago=1, n_pics=6),
    H("iy4", "Elegant 4-Bed Terrace, Old Ikoyi", 480_000_000, "buy", "terrace", 4, 4, 400, "Parkview Estate, Ikoyi", "Ikoyi", "Lagos", 6.4495, 3.4420, "adaeze", amenities=FAM + ["Pool"], status="sold", year=2019, parking=3, days_ago=30),
    # ── Victoria Island & Oniru ───────────────────────────────────────────────
    H("vi1", "Skyline 3-Bed Penthouse, Victoria Island", 520_000_000, "buy", "penthouse", 3, 4, 360, "Adeola Odeku Street, Victoria Island", "Victoria Island", "Lagos", 6.4281, 3.4219, "adaeze", pics="apt", amenities=LUX + ["Ocean View", "Private Lift"], status="premium", year=2023, parking=3, score=92, val=540_000_000, days_ago=2, n_pics=5),
    H("vi2", "Grade-A Office Floor (450 sqm), Victoria Island", 52_000_000, "lease", "commercial", 0, 4, 450, "Akin Adesola Street, Victoria Island", "Victoria Island", "Lagos", 6.4330, 3.4140, "adaeze", pics="office", amenities=["Central AC", "Backup Power", "Lifts", "Parking", "Fibre Internet"], year=2018, parking=12, days_ago=4),
    H("on1", "2-Bed Luxury Apartment, Oniru", 185_000_000, "buy", "apartment", 2, 3, 140, "Oniru Private Estate, Victoria Island", "Victoria Island", "Lagos", 6.4305, 3.4305, "adaeze", pics="apt", amenities=APTA + ["Pool"], year=2022, parking=1, score=85, val=190_000_000, days_ago=7),
    H("vi3", "Designer Shortlet 2-Bed, Victoria Island", 180_000, "shortlet", "apartment", 2, 2, 110, "Ligali Ayorinde Street, Victoria Island", "Victoria Island", "Lagos", 6.4262, 3.4388, "adaeze", pics="apt", amenities=["Wi-Fi", "Pool", "Gym", "24/7 Power", "Housekeeping"], source="owner_listed", year=2023, parking=1, days_ago=2, n_pics=5),
    # ── Ikeja GRA, Magodo, Yaba, Gbagada, Surulere ───────────────────────────
    H("gr1", "5-Bed Detached House with Pool, Ikeja GRA", 780_000_000, "buy", "duplex", 5, 6, 700, "Isaac John Street, Ikeja GRA", "Ikeja", "Lagos", 6.5833, 3.3530, "tunde", amenities=LUX + ["Garden", "BQ"], status="premium", year=2021, parking=5, score=89, val=800_000_000, days_ago=3, n_pics=5),
    H("gr2", "3-Bed Flat, Ikeja GRA", 9_000_000, "rent", "apartment", 3, 3, 160, "Oduduwa Crescent, Ikeja GRA", "Ikeja", "Lagos", 6.5790, 3.3600, "tunde", pics="apt", amenities=FAM, year=2017, parking=2, days_ago=5),
    H("gr3", "Short-Let Studio, Ikeja GRA", 65_000, "shortlet", "apartment", 1, 1, 48, "Joel Ogunnaike Street, Ikeja GRA", "Ikeja", "Lagos", 6.5890, 3.3480, "tunde", pics="apt", amenities=["Wi-Fi", "24/7 Power", "Netflix"], verified=False, source="owner_listed", year=2019, parking=1, days_ago=9),
    H("mg1", "4-Bed Semi-Detached Duplex, Magodo Phase 2", 210_000_000, "buy", "duplex", 4, 5, 380, "CMD Road, Magodo Phase 2", "Magodo", "Lagos", 6.6150, 3.3800, "tunde", amenities=FAM + ["Pool"], year=2020, parking=3, score=82, val=215_000_000, days_ago=4),
    H("yb1", "2-Bed Apartment near UNILAG, Yaba", 4_200_000, "rent", "apartment", 2, 2, 90, "Herbert Macaulay Way, Yaba", "Yaba", "Lagos", 6.5095, 3.3711, "tunde", pics="apt", amenities=["Security", "Prepaid Meter", "Water Treatment"], year=2015, parking=1, days_ago=2),
    H("yb2", "Mixed-Use Building (6 Flats), Yaba", 650_000_000, "buy", "commercial", 12, 12, 1100, "Commercial Avenue, Sabo, Yaba", "Yaba", "Lagos", 6.5120, 3.3780, "tunde", pics="office", amenities=["Rental Income", "Borehole", "Generator"], source="owner_listed", score=80, val=640_000_000, days_ago=14),
    H("gb1", "3-Bed Terrace, Gbagada Phase 2", 95_000_000, "buy", "terrace", 3, 3, 220, "Gbagada Phase 2, Gbagada", "Gbagada", "Lagos", 6.5540, 3.3880, "tunde", amenities=FAM, year=2018, parking=2, days_ago=6),
    H("su1", "3-Bed Bungalow, Surulere", 85_000_000, "buy", "bungalow", 3, 2, 200, "Adelabu Street, Surulere", "Surulere", "Lagos", 6.5010, 3.3540, "tunde", amenities=["Security", "Borehole", "Generator"], verified=False, source="independent", year=2010, parking=2, days_ago=16),
    # ── Abuja ────────────────────────────────────────────────────────────────
    H("mt1", "Ambassadorial 6-Bed Mansion, Maitama", 2_400_000_000, "buy", "duplex", 6, 7, 1500, "Maitama District, Abuja", "Abuja", "FCT", 9.0820, 7.4950, "ngozi", amenities=LUX + ["Staff Quarters", "Garden", "Cinema"], status="premium", year=2022, parking=8, score=94, val=2_500_000_000, days_ago=2, n_pics=6),
    H("as1", "5-Bed Detached Duplex, Asokoro", 950_000_000, "buy", "duplex", 5, 6, 820, "Asokoro District, Abuja", "Abuja", "FCT", 9.0470, 7.5260, "ngozi", amenities=LUX, year=2020, parking=5, score=88, val=980_000_000, days_ago=5),
    H("ws1", "3-Bed Serviced Apartment, Wuse 2", 18_000_000, "rent", "apartment", 3, 3, 190, "Aminu Kano Crescent, Wuse 2", "Abuja", "FCT", 9.0730, 7.4740, "ngozi", pics="apt", amenities=APTA, year=2021, parking=2, days_ago=3),
    H("gw1", "4-Bed Terrace Duplex, Gwarinpa", 185_000_000, "buy", "terrace", 4, 4, 320, "6th Avenue, Gwarinpa", "Abuja", "FCT", 9.1120, 7.3930, "ngozi", amenities=FAM, year=2019, parking=2, score=80, val=190_000_000, days_ago=7),
    H("jb1", "Office Suite (220 sqm), Jabi Lake", 24_000_000, "lease", "commercial", 0, 2, 220, "Jabi Lake District, Abuja", "Abuja", "FCT", 9.0640, 7.4250, "ngozi", pics="office", amenities=["Central AC", "Backup Power", "Parking", "Lake View"], year=2020, parking=6, days_ago=10),
    H("gz1", "Hilltop Residential Plot (1,000 sqm), Guzape", 320_000_000, "buy", "land", 0, 0, 1000, "Guzape District, Abuja", "Abuja", "FCT", 9.0380, 7.5080, "ngozi", pics="land", amenities=["C of O", "Hilltop View", "Tarred Road"], source="owner_listed", score=87, days_ago=4, n_pics=3),
    H("kt1", "2-Bed Apartment, Katampe Extension", 7_000_000, "rent", "apartment", 2, 2, 105, "Katampe Extension, Abuja", "Abuja", "FCT", 9.1030, 7.4580, "ngozi", pics="apt", amenities=FAM, verified=False, source="independent", year=2018, parking=1, days_ago=13),
    # ── Port Harcourt, Ibadan, Abeokuta, Enugu ───────────────────────────────
    H("ph1", "5-Bed Detached Duplex, GRA Phase 2", 420_000_000, "buy", "duplex", 5, 5, 600, "Tombia Street, GRA Phase 2", "Port Harcourt", "Rivers", 4.8150, 7.0160, "emeka", amenities=LUX, year=2021, parking=4, score=84, val=430_000_000, days_ago=3, n_pics=5),
    H("ph2", "3-Bed Flat, Old GRA", 6_500_000, "rent", "apartment", 3, 3, 150, "Forces Avenue, Old GRA", "Port Harcourt", "Rivers", 4.7850, 7.0100, "emeka", pics="apt", amenities=FAM, year=2016, parking=2, days_ago=6),
    H("ph3", "Warehouse & Office (900 sqm), Trans Amadi", 38_000_000, "lease", "commercial", 0, 2, 900, "Trans Amadi Industrial Layout", "Port Harcourt", "Rivers", 4.8030, 7.0450, "emeka", pics="office", amenities=["Loading Bay", "Security", "Generator"], source="owner_listed", year=2014, parking=10, days_ago=8),
    H("ib1", "4-Bed Detached Duplex, Bodija", 125_000_000, "buy", "duplex", 4, 4, 350, "Awolowo Avenue, Bodija", "Ibadan", "Oyo", 7.4300, 3.9100, "emeka", amenities=FAM, year=2019, parking=3, score=78, val=128_000_000, days_ago=5),
    H("ib2", "3-Bed Bungalow, Jericho GRA", 88_000_000, "buy", "bungalow", 3, 3, 240, "Jericho GRA, Ibadan", "Ibadan", "Oyo", 7.3990, 3.8740, "emeka", amenities=FAM + ["Garden"], year=2012, parking=2, days_ago=11),
    H("ab1", "Prime Land (2 Plots), Abeokuta", 18_000_000, "buy", "land", 0, 0, 1300, "Oke-Mosan, Abeokuta", "Abeokuta", "Ogun", 7.1500, 3.3500, "emeka", pics="land", amenities=["Survey Plan", "Deed of Assignment", "Dry Land"], source="owner_listed", score=74, days_ago=7, n_pics=3),
    H("en1", "4-Bed Duplex, Independence Layout", 140_000_000, "buy", "duplex", 4, 4, 380, "Independence Layout, Enugu", "Enugu", "Enugu", 6.4420, 7.5050, "emeka", amenities=FAM, year=2018, parking=3, score=77, val=142_000_000, days_ago=9),
]


async def purge_test_listings(db) -> dict:
    """Delete automated-test fixtures (and everything pointing at them). Safe to re-run."""
    rx = {"$regex": TEST_TITLE_RX.pattern, "$options": "i"}
    q = {"$or": [{"title": rx}, {"images": {"$regex": "example\\.com"}}, {"image": {"$regex": "example\\.com"}}]}
    ids = [d["id"] async for d in db.properties.find(q, {"_id": 0, "id": 1})]
    if not ids:
        return {"properties": 0}
    out = {"properties": len(ids)}
    conv_ids = [c["id"] async for c in db.conversations.find({"property_id": {"$in": ids}}, {"_id": 0, "id": 1})]
    out["conversations"] = (await db.conversations.delete_many({"id": {"$in": conv_ids}})).deleted_count if conv_ids else 0
    if conv_ids:
        out["chat_messages"] = (await db.chat_messages.delete_many({"conversation_id": {"$in": conv_ids}})).deleted_count
    for col, field in (("favorites", "property_id"), ("promotions", "property_id"), ("property_events", "property_id"), ("inspections", "property_id"), ("share_events", "property_id"), ("unlock_events", "target_id"), ("property_documents", "property_id")):
        out[col] = (await db[col].delete_many({field: {"$in": ids}})).deleted_count
    out["entitlements"] = (await db.entitlements.delete_many({"feature_key": "property", "target_id": {"$in": ids}})).deleted_count
    out["properties_deleted"] = (await db.properties.delete_many({"id": {"$in": ids}})).deleted_count
    logger.info("purged test listings: %s", out)
    return out


async def _ensure_agent(db, a: dict, hash_password) -> dict:
    user = await db.users.find_one({"email": a["email"]}, {"_id": 0})
    now = datetime.now(timezone.utc)
    if not user:
        user = {
            "id": str(uuid.uuid4()), "email": a["email"], "password_hash": hash_password(AGENT_PASSWORD), "full_name": a["full_name"], "phone": a["phone"],
            "phone_verified": True, "avatar_url": a["avatar"], "city": a["areas"][0], "bio": f"{a['agency_name']} · {a['years']} years in {', '.join(a['areas'][:2])}.",
            "is_agent": True, "is_admin": False, "identity_verified": True, "identity_verified_at": now, "created_at": now - timedelta(days=400), "seed_key": f"agent:{a['key']}",
        }
        await db.users.insert_one(dict(user))
    else:
        await db.users.update_one({"id": user["id"]}, {"$set": {"is_agent": True, "identity_verified": True, "avatar_url": user.get("avatar_url") or a["avatar"]}})
    if not await db.agent_applications.find_one({"user_id": user["id"]}, {"_id": 0, "id": 1}):
        await db.agent_applications.insert_one({
            "id": str(uuid.uuid4()), "user_id": user["id"], "full_name": a["full_name"], "phone": a["phone"], "email": a["email"], "nin": None,
            "id_document_url": None, "selfie_url": None, "agency_name": a["agency_name"], "cac_number": None, "office_address": f"{a['areas'][0]}, {a['state']}",
            "state": a["state"], "lga": a["lga"], "years_experience": a["years"], "areas_of_operation": a["areas"], "specialisations": a["specs"],
            "has_mandate_authority": a["level"] >= 3, "verification_level": a["level"], "status": "approved", "avatar_url": a["avatar"],
            "rating": 4.6 + (a["level"] - 2) * 0.2, "reviews_count": 12 + a["years"], "created_at": now - timedelta(days=380), "updated_at": now, "reviewed_at": now,
        })
    return user


async def seed_demo_homes(db, PropertyModel, hash_password) -> dict:
    """Insert any demo home not yet present (by `seed_key`). Never deletes or edits existing homes."""
    agents = {a["key"]: await _ensure_agent(db, a, hash_password) for a in DEMO_AGENTS}
    existing = {d["seed_key"]: d async for d in db.properties.find({"seed_key": {"$exists": True}}, {"_id": 0, "seed_key": 1, "id": 1, "agent_id": 1})}
    now = datetime.now(timezone.utc)
    created = 0
    repaired = 0
    for i, h in enumerate(DEMO_HOMES):
        agent = agents[h["agent"]]
        if h["seed_key"] in existing:
            # Keep every demo home with its intended agent (older boot hooks used to re-assign listings).
            if existing[h["seed_key"]].get("agent_id") != agent["id"]:
                await db.properties.update_one({"id": existing[h["seed_key"]]["id"]}, {"$set": {"agent_id": agent["id"], "agent_name": agent["full_name"], "agent_avatar": agent.get("avatar_url")}})
                repaired += 1
            continue
        base = {k: v for k, v in h.items() if k not in ("seed_key", "agent", "pics", "n_pics", "listing_source", "days_ago")}
        base["images"] = _pics(h["pics"], i, h["n_pics"])
        base["agent_id"] = agent["id"]
        base["agent_name"] = agent["full_name"]
        base["agent_avatar"] = agent.get("avatar_url")
        base["listing_source"] = h["listing_source"]
        if h["listing_source"] == "mandated":
            base["mandate"] = {"owner_name": "Private owner", "owner_phone": None, "mandate_type": "exclusive" if h["status"] == "premium" else "sole", "mandate_expiry": (now + timedelta(days=180)).strftime("%Y-%m-%d"), "documents": []}
        prop = PropertyModel(**base).model_dump()
        prop["seed_key"] = h["seed_key"]
        prop["created_at"] = now - timedelta(days=h["days_ago"], hours=i % 7)
        prop["views_count"] = 40 + (i * 37) % 260
        prop["image"] = base["images"][0]
        await db.properties.insert_one(prop)
        created += 1
    return {"created": created, "repaired": repaired, "agents": len(agents), "total_demo": len(DEMO_HOMES)}
