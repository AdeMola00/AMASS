"""Pilot seed for the Neighbours layer — 3 estates (Lagos ×2, Abuja ×1) with amenities,
nearby places, a welcome notice, an open question and an upcoming event each.
Idempotent: keyed on estate slug. The demo admin is made a manager of the first estate so
the approval flow can be exercised end-to-end; join codes are deterministic for the pilot.
"""
from __future__ import annotations

from datetime import timedelta

from social_common import new_id, now

PILOT_ESTATES = [
    {
        "name": "Lekki Gardens Phase 2", "slug": "lekki-gardens-phase-2-lagos", "city": "Lagos", "state": "Lagos", "area": "Ajah, Lekki", "latitude": 6.4654, "longitude": 3.5706,
        "description": "Gated family estate off the Lekki–Epe Expressway. Central generator, 24/7 security, kids' park and a residents' hall.",
        "cover_image": "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200", "amenities": ["24/7 security", "Central power", "Kids' park", "Residents' hall", "Borehole water"], "join_code": "LEKKI2",
        "places": [
            {"name": "Estate Gate House", "category": "security", "lat": 6.4660, "lng": 3.5700, "is_amenity": True},
            {"name": "Phase 2 Kids' Park", "category": "park", "lat": 6.4649, "lng": 3.5712, "is_amenity": True},
            {"name": "Medplus Pharmacy Ajah", "category": "pharmacy", "lat": 6.4681, "lng": 3.5742, "address_label": "Lekki–Epe Expressway, Ajah"},
            {"name": "Shoprite Sangotedo", "category": "supermarket", "lat": 6.4706, "lng": 3.5793, "address_label": "Novare Mall, Sangotedo"},
            {"name": "Tunde's Auto Clinic", "category": "mechanic", "lat": 6.4632, "lng": 3.5665, "address_label": "Abraham Adesanya roundabout"},
            {"name": "Blue Sky Laundry", "category": "laundry", "lat": 6.4640, "lng": 3.5720, "address_label": "Lekki Gardens Road"},
        ],
    },
    {
        "name": "Magodo GRA Phase 1", "slug": "magodo-gra-phase-1-lagos", "city": "Lagos", "state": "Lagos", "area": "Magodo, Isheri", "latitude": 6.6156, "longitude": 3.3873,
        "description": "Established residential GRA with tree-lined streets, an active residents' association and weekly waste collection.",
        "cover_image": "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200", "amenities": ["Residents' association", "Street lighting", "Weekly waste pickup", "Tennis court"], "join_code": "MAGODO",
        "places": [
            {"name": "Magodo Tennis Club", "category": "gym", "lat": 6.6160, "lng": 3.3880, "is_amenity": True},
            {"name": "Ebeano Supermarket", "category": "supermarket", "lat": 6.6182, "lng": 3.3851, "address_label": "CMD Road, Magodo"},
            {"name": "Reddington Clinic", "category": "clinic", "lat": 6.6141, "lng": 3.3895, "address_label": "Emmanuel Keshi St"},
            {"name": "Chrisland School Magodo", "category": "school", "lat": 6.6125, "lng": 3.3860},
            {"name": "GTBank CMD Road", "category": "atm", "lat": 6.6190, "lng": 3.3840},
        ],
    },
    {
        "name": "Sunnyvale Estate Dakwo", "slug": "sunnyvale-estate-dakwo-abuja", "city": "Abuja", "state": "FCT", "area": "Dakwo District", "latitude": 8.9864, "longitude": 7.4411,
        "description": "Serviced estate along the Airport Road corridor with a clubhouse, pool and well-run facility management.",
        "cover_image": "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=1200", "amenities": ["Clubhouse", "Swimming pool", "Facility management", "Backup power"], "join_code": "SUNNY1",
        "places": [
            {"name": "Sunnyvale Clubhouse", "category": "amenity", "lat": 8.9860, "lng": 7.4418, "is_amenity": True},
            {"name": "H-Medix Pharmacy Lokogoma", "category": "pharmacy", "lat": 8.9890, "lng": 7.4450, "address_label": "Lokogoma Expressway"},
            {"name": "Next Cash & Carry", "category": "supermarket", "lat": 9.0012, "lng": 7.4390, "address_label": "Kado"},
            {"name": "Ola's Kitchen", "category": "restaurant", "lat": 8.9875, "lng": 7.4402},
        ],
    },
]


async def seed_neighbours_pilot(db, demo_user_id: str | None) -> dict:
    created = 0
    for e in PILOT_ESTATES:
        existing = await db.estates.find_one({"slug": e["slug"]}, {"_id": 0, "id": 1})
        if existing:
            continue
        created += 1
        estate_id = new_id()
        await db.estates.insert_one({
            "id": estate_id, "name": e["name"], "slug": e["slug"], "city": e["city"], "state": e["state"], "area": e["area"], "latitude": e["latitude"], "longitude": e["longitude"],
            "description": e["description"], "cover_image": e["cover_image"], "amenities": e["amenities"], "rules": "Be kind. No selling in the feed — use Declutter. Report safety issues through Service requests, not posts.",
            "verification": ["join_code", "proof_upload"], "join_code": e["join_code"], "status": "active", "created_by": demo_user_id, "requested_manager": False, "pilot": True, "created_at": now(), "updated_at": now(),
        })
        manager_id = demo_user_id if (demo_user_id and e is PILOT_ESTATES[0]) else None
        if manager_id:
            await db.estate_members.update_one({"estate_id": estate_id, "user_id": manager_id}, {"$set": {"id": new_id(), "estate_id": estate_id, "user_id": manager_id, "role": "manager", "status": "approved", "verification_method": "pilot", "created_at": now(), "approved_at": now()}}, upsert=True)
        for p in e["places"]:
            await db.places.insert_one({
                "id": new_id(), "name": p["name"], "category": p["category"], "latitude": p["lat"], "longitude": p["lng"], "address_label": p.get("address_label"), "estate_id": estate_id,
                "is_amenity": bool(p.get("is_amenity")), "is_promoted": False, "added_by": manager_id, "recommended_by": [manager_id] if manager_id else [], "notes": [], "status": "active", "pilot": True, "created_at": now(), "updated_at": now(),
            })
        if manager_id:
            await db.estate_posts.insert_one({
                "id": new_id(), "estate_id": estate_id, "group_id": None, "author_id": manager_id, "type": "notice", "is_official": True, "title": "Welcome to the Neighbours pilot",
                "body": "This is your estate's private space on AMASS. Ask questions, recommend places, RSVP to events and report maintenance issues — management sees requests immediately.",
                "place_id": None, "tags": ["welcome"], "answers_count": 0, "accepted_reply_id": None, "upvotes": [], "pinned": True, "status": "active", "created_at": now(), "updated_at": now(),
            })
            await db.estate_posts.insert_one({
                "id": new_id(), "estate_id": estate_id, "group_id": None, "author_id": manager_id, "type": "question", "is_official": False, "title": "Reliable generator technician nearby?",
                "body": "Our inverter keeps tripping after the rains. Anyone used a technician around here they'd recommend?", "place_id": None, "tags": ["generator", "recommendation"],
                "answers_count": 0, "accepted_reply_id": None, "upvotes": [], "pinned": False, "status": "active", "created_at": now() - timedelta(hours=5), "updated_at": now() - timedelta(hours=5),
            })
            ev_id = new_id()
            await db.events.insert_one({
                "id": ev_id, "title": "Residents' meet & greet", "description": "Meet your neighbours over small chops. Kids welcome.", "kind": "gathering", "starts_at": now() + timedelta(days=6, hours=3), "ends_at": now() + timedelta(days=6, hours=5),
                "location_label": "Residents' hall", "latitude": e["latitude"], "longitude": e["longitude"], "audience": "estate", "estate_id": estate_id, "property_id": None, "capacity": 80, "host_id": manager_id, "conversation_id": None, "status": "active", "created_at": now(), "updated_at": now(),
            })
            await db.event_rsvps.update_one({"event_id": ev_id, "user_id": manager_id}, {"$set": {"status": "going", "created_at": now()}}, upsert=True)
    return {"created": created}
