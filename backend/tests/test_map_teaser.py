"""Empty-wallet map teaser: /api/map/markers with access=false returns a few ghost pins (no ids, fuzzed, price bands)
and a capped count — and nothing of the sort for a paying user."""
import os

import requests
from dotenv import dotenv_values
from pymongo import MongoClient

FE = dotenv_values("/app/frontend/.env")
BE = dotenv_values("/app/backend/.env")
BASE = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or FE["EXPO_PUBLIC_BACKEND_URL"]).rstrip("/") + "/api"
ZERO = ("gate-preview@amass-qa.africa", "GatePreview2026!")
PAID = ("demo@amass.africa", "amass2026")


def _login(email, pw):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": pw}, timeout=30)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json().get('token') or r.json().get('access_token')}"}


def _zero_wallet():
    db = MongoClient(BE["MONGO_URL"])[BE["DB_NAME"]]
    u = db.users.find_one({"email": ZERO[0]}, {"id": 1})
    assert u, "QA zero-MASS user missing — see memory/test_credentials.md"
    db.wallets.update_one({"user_id": u["id"], "currency": "MASS"}, {"$set": {"balance": 0, "bonus_balance": 0}})


def test_zero_wallet_gets_ghost_pins_only():
    _zero_wallet()
    r = requests.get(f"{BASE}/map/markers", headers=_login(*ZERO), params={"limit": 300}, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["access"] is False and d["markers"] == [] and d["count"] == 0
    assert 1 <= len(d["teaser"]) <= 6
    for g in d["teaser"]:
        assert set(g) == {"lat", "lng", "listing_type", "price_band"}  # no id, no title, no image
        assert g["price_band"].startswith("₦")
    assert 1 <= d["teaser_count"] <= 99


def test_teaser_respects_bounds_and_filters():
    h = _login(*ZERO)
    lagos = {"min_lat": 6.3, "max_lat": 6.75, "min_lng": 3.1, "max_lng": 3.7, "limit": 300}
    d = requests.get(f"{BASE}/map/markers", headers=h, params=lagos, timeout=30).json()
    assert d["access"] is False
    for g in d["teaser"]:
        assert 6.2 <= g["lat"] <= 6.85 and 3.0 <= g["lng"] <= 3.8  # inside the box (+ ≤400 m fuzz)
    none = requests.get(f"{BASE}/map/markers", headers=h, params={"min_lat": 0.1, "max_lat": 0.2, "min_lng": 0.1, "max_lng": 0.2}, timeout=30).json()
    assert none["teaser"] == [] and none["teaser_count"] == 0


def test_paying_user_gets_real_markers_no_teaser():
    d = requests.get(f"{BASE}/map/markers", headers=_login(*PAID), params={"limit": 5}, timeout=30).json()
    assert d["access"] is True and len(d["markers"]) > 0
    assert "teaser" not in d and "teaser_count" not in d
