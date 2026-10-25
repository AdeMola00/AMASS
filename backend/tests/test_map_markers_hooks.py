# Map markers teaser hook fields (iteration 81): ai_valuation, investment_score, amenities, year_built, etc.
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_BACKEND_URL", os.environ.get("EXPO_PUBLIC_BACKEND_URL")).rstrip("/")
HOOKS = ["ai_valuation", "investment_score", "amenities", "year_built", "parking", "saves_count", "views_count", "agent_identity_verified"]
LEAKS = ["location", "agent_id", "agent_name", "agent_phone", "agent_email"]


@pytest.fixture(scope="module")
def markers():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "demo@amass.africa", "password": "amass2026"}, timeout=20)
    if r.status_code != 200:
        pytest.skip("login failed")
    tok = r.json().get("access_token") or r.json().get("token")
    m = requests.get(f"{BASE_URL}/api/map/markers", headers={"Authorization": f"Bearer {tok}"}, timeout=30)
    assert m.status_code == 200
    data = m.json()
    return data if isinstance(data, list) else data.get("markers", data.get("items", []))


def test_hook_fields_present(markers):
    assert len(markers) > 0
    for mk in markers:
        for k in HOOKS:
            assert k in mk, f"{mk.get('id')} missing {k}"
        assert mk["amenities"] is None or len(mk["amenities"]) <= 4


def test_locked_markers_no_leak(markers):
    locked = [m for m in markers if not m.get("unlocked")]
    assert locked, "no locked markers"
    for mk in locked:
        assert mk.get("images") is None
        assert mk.get("approx") is True
        for k in LEAKS:
            assert k not in mk, f"locked {mk['id']} leaks {k}"


def test_lekki_ai_value(markers):
    hits = [m for m in markers if m.get("ai_valuation") and m.get("price") == 145_000_000]
    print([(m.get("title"), m.get("ai_valuation"), m.get("unlocked")) for m in hits])
    assert hits, "no ₦145M marker with ai_valuation"
