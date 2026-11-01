"""Iter97 extra checks for the empty-wallet map teaser (filters, unauth, no leaks)."""
import os

import requests
from dotenv import dotenv_values

FE = dotenv_values("/app/frontend/.env")
BASE = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or FE["EXPO_PUBLIC_BACKEND_URL"]).rstrip("/") + "/api"
ZERO = ("gate-preview@amass-qa.africa", "GatePreview2026!")


def _h():
    r = requests.post(f"{BASE}/auth/login", json={"email": ZERO[0], "password": ZERO[1]}, timeout=30)
    assert r.status_code == 200, r.text
    j = r.json()
    return {"Authorization": f"Bearer {j.get('token') or j.get('access_token')}"}, j.get("user", {})


# Listing-type filter applies to the teaser too
def test_teaser_listing_type_filter():
    h, _ = _h()
    for lt in ("rent", "lease", "sale"):
        d = requests.get(f"{BASE}/map/markers", headers=h, params={"listing_type": lt, "limit": 400}, timeout=30).json()
        assert d["access"] is False and d["markers"] == []
        ok = {"sale", "buy"} if lt == "sale" else {lt}  # sale filter matches DB value "buy" too
        assert all(g["listing_type"] in ok for g in d["teaser"]), (lt, d["teaser"])
        assert 0 <= d["teaser_count"] <= 99


# Gate user is not phone-verified (drives the nudge)
def test_gate_user_not_phone_verified():
    h, _ = _h()
    me = requests.get(f"{BASE}/auth/me", headers=h, timeout=30).json()
    assert not me.get("phone_verified")


# Unauthenticated access must not return teaser/markers
def test_markers_unauth():
    r = requests.get(f"{BASE}/map/markers", timeout=30)
    assert r.status_code in (401, 403) or (r.status_code == 200 and not r.json().get("markers")), r.text
