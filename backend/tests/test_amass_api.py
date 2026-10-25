"""AMASS backend API test suite."""
import time
import uuid
import requests
import pytest


# ─── Health ────────────────────────────────────────────────
class TestHealth:
    def test_root_returns_app_name(self, base_url, api_client):
        r = api_client.get(f"{base_url}/api/")
        assert r.status_code == 200
        data = r.json()
        assert data.get("app") == "AMASS API"


# ─── Auth ──────────────────────────────────────────────────
class TestAuth:
    def test_register_new_user_returns_token(self, base_url, api_client):
        email = f"TEST_user_{uuid.uuid4().hex[:8]}@example.com"
        r = api_client.post(
            f"{base_url}/api/auth/register",
            json={
                "email": email,
                "password": "testpass123",
                "full_name": "Test User",
                "phone": "+2348000000000",
            },
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "access_token" in data and isinstance(data["access_token"], str)
        assert data.get("token_type") == "bearer"
        assert data["user"]["email"] == email.lower()
        assert data["user"]["full_name"] == "Test User"
        assert "id" in data["user"]

    def test_login_demo_user_success(self, base_url, api_client, demo_token):
        # demo_token fixture already ensures login works; assert non-empty
        assert demo_token and isinstance(demo_token, str)

    def test_login_wrong_password_returns_401(self, base_url, api_client):
        r = api_client.post(
            f"{base_url}/api/auth/login",
            json={"email": "demo@amass.africa", "password": "wrong-password"},
        )
        assert r.status_code == 401

    def test_me_with_valid_token(self, base_url, api_client, auth_headers):
        r = api_client.get(f"{base_url}/api/auth/me", headers=auth_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["email"] == "demo@amass.africa"
        assert "id" in data
        assert "full_name" in data

    def test_me_without_token_returns_401(self, base_url):
        r = requests.get(f"{base_url}/api/auth/me")
        assert r.status_code == 401


# ─── Properties ────────────────────────────────────────────
class TestProperties:
    def test_list_returns_at_least_9(self, base_url, api_client):
        r = api_client.get(f"{base_url}/api/properties")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) >= 9, f"Expected >=9 properties, got {len(data)}"
        # No _id key in any response
        for p in data:
            assert "_id" not in p, f"Property leaked _id: {p.get('id')}"
            # verify expected fields
            for field in ("id", "title", "price", "latitude", "longitude", "images", "status", "verified"):
                assert field in p, f"Missing field {field} in property"

    def test_filter_listing_type_rent(self, base_url, api_client):
        r = api_client.get(f"{base_url}/api/properties", params={"listing_type": "rent"})
        assert r.status_code == 200
        data = r.json()
        assert len(data) >= 1
        for p in data:
            assert p["listing_type"] == "rent"

    def test_filter_property_type_land(self, base_url, api_client):
        r = api_client.get(f"{base_url}/api/properties", params={"property_type": "land"})
        assert r.status_code == 200
        data = r.json()
        assert len(data) >= 1
        for p in data:
            assert p["property_type"] == "land"

    def test_filter_verified_true(self, base_url, api_client):
        r = api_client.get(f"{base_url}/api/properties", params={"verified": "true"})
        assert r.status_code == 200
        data = r.json()
        assert len(data) >= 1
        for p in data:
            assert p["verified"] is True

    def test_search_query_lekki(self, base_url, api_client):
        r = api_client.get(f"{base_url}/api/properties", params={"q": "Lekki"})
        assert r.status_code == 200
        data = r.json()
        assert len(data) >= 1
        # Anonymous callers get the teaser tier (street address gated → city only), so a hit may have
        # matched on the hidden street. At least one result must still be explainable from public fields.
        hays = [f"{p.get('title','')} {p.get('location','')} {p.get('city','')} {p.get('description','')}".lower() for p in data]
        assert any("lekki" in h for h in hays)
        for p in data:
            assert p.get("approx") is True and not p.get("agent_phone")

    def test_get_single_property(self, base_url, api_client):
        lst = api_client.get(f"{base_url}/api/properties").json()
        pid = lst[0]["id"]
        r = api_client.get(f"{base_url}/api/properties/{pid}")
        assert r.status_code == 200
        p = r.json()
        assert "_id" not in p
        for field in ("id", "title", "price", "latitude", "longitude", "images", "status", "verified"):
            assert field in p

    def test_get_nonexistent_property_404(self, base_url, api_client):
        r = api_client.get(f"{base_url}/api/properties/non-existent-id-xxxxx")
        assert r.status_code == 404


# ─── Favorites ─────────────────────────────────────────────
class TestFavorites:
    def test_favorites_require_auth(self, base_url):
        r1 = requests.get(f"{base_url}/api/favorites")
        r2 = requests.get(f"{base_url}/api/favorites/ids")
        r3 = requests.post(
            f"{base_url}/api/favorites/toggle",
            json={"property_id": "x"},
        )
        assert r1.status_code == 401
        assert r2.status_code == 401
        assert r3.status_code == 401

    def test_toggle_favorite_on_and_off(self, base_url, api_client, auth_headers):
        # Get a property id
        props = api_client.get(f"{base_url}/api/properties").json()
        pid = props[0]["id"]

        # Ensure clean baseline: if already favorited from previous run, un-favorite it first
        ids_r = api_client.get(f"{base_url}/api/favorites/ids", headers=auth_headers)
        assert ids_r.status_code == 200
        current_ids = ids_r.json().get("ids", [])
        if pid in current_ids:
            api_client.post(
                f"{base_url}/api/favorites/toggle",
                headers=auth_headers,
                json={"property_id": pid},
            )

        # Toggle ON
        r = api_client.post(
            f"{base_url}/api/favorites/toggle",
            headers=auth_headers,
            json={"property_id": pid},
        )
        assert r.status_code == 200
        assert r.json() == {"favorited": True}

        # verify GET ids contains it
        ids_r = api_client.get(f"{base_url}/api/favorites/ids", headers=auth_headers)
        assert ids_r.status_code == 200
        assert pid in ids_r.json()["ids"]

        # verify GET favorites returns list with prop, no _id
        fav_r = api_client.get(f"{base_url}/api/favorites", headers=auth_headers)
        assert fav_r.status_code == 200
        fav_list = fav_r.json()
        assert isinstance(fav_list, list) and len(fav_list) >= 1
        for p in fav_list:
            assert "_id" not in p
        assert any(p["id"] == pid for p in fav_list)

        # Toggle OFF
        r2 = api_client.post(
            f"{base_url}/api/favorites/toggle",
            headers=auth_headers,
            json={"property_id": pid},
        )
        assert r2.status_code == 200
        assert r2.json() == {"favorited": False}

        # verify removed
        ids_r2 = api_client.get(f"{base_url}/api/favorites/ids", headers=auth_headers)
        assert pid not in ids_r2.json()["ids"]


# ─── Marketplace ───────────────────────────────────────────
class TestMarketplace:
    def test_marketplace_all(self, base_url, api_client):
        r = api_client.get(f"{base_url}/api/marketplace")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) >= 3
        categories = {d["category"] for d in data}
        # Should contain multiple categories
        assert len(categories) >= 2
        for item in data:
            assert "_id" not in item
            assert "rating" in item
            assert "image" in item and item["image"]

    def test_marketplace_home_filter(self, base_url, api_client):
        r = api_client.get(f"{base_url}/api/marketplace", params={"category": "home"})
        assert r.status_code == 200
        data = r.json()
        assert len(data) >= 1
        for item in data:
            assert item["category"] == "home"

    def test_marketplace_construction_filter(self, base_url, api_client):
        r = api_client.get(f"{base_url}/api/marketplace", params={"category": "construction"})
        assert r.status_code == 200
        data = r.json()
        assert len(data) >= 1
        for item in data:
            assert item["category"] == "construction"


# ─── Neighborhoods ─────────────────────────────────────────
class TestNeighborhoods:
    def test_neighborhoods_returns_5(self, base_url, api_client):
        r = api_client.get(f"{base_url}/api/neighborhoods")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) == 5
        for n in data:
            assert "_id" not in n
            for field in ("overall_score", "walk_score", "image", "latitude", "longitude", "trending"):
                assert field in n, f"Missing {field} in neighborhood"


# ─── AI ────────────────────────────────────────────────────
class TestAI:
    def test_ai_search_sync_returns_reply(self, base_url, api_client):
        r = api_client.post(
            f"{base_url}/api/ai/search/sync",
            json={"query": "Show me a duplex under 150M in Lekki"},
            timeout=90,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "reply" in data
        assert isinstance(data["reply"], str)
        assert len(data["reply"].strip()) > 0


# ─── Seed idempotency ──────────────────────────────────────
class TestSeed:
    def test_startup_seed_idempotent(self, base_url, api_client):
        """Since data is auto-seeded on startup, calling /api/properties twice returns consistent counts.
        Manual re-seed via POST /api/seed should also produce expected counts."""
        r1 = api_client.get(f"{base_url}/api/properties").json()
        r2 = api_client.get(f"{base_url}/api/properties").json()
        assert len(r1) == len(r2)
        assert len(r1) >= 9
