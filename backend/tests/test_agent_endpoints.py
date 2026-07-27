"""AMASS backend — Agent endpoints test suite (iteration 2).

Covers new endpoints:
  - POST   /api/properties            (create property, auto-promotes user to agent)
  - GET    /api/agent/listings        (agent's listings)
  - GET    /api/agent/dashboard       (stats + recent listings)
  - GET    /api/agent/leads           (mock leads based on real listings)
"""
import uuid
import requests
import pytest


# ─── helpers ────────────────────────────────────────────────
VALID_PAYLOAD = {
    "title": "TEST_Agent Duplex Lekki",
    "description": "Test-created duplex used by agent endpoint tests.",
    "price": 123_456_789,
    "listing_type": "buy",
    "property_type": "duplex",
    "bedrooms": 4,
    "bathrooms": 5,
    "size_sqm": 480,
    "location": "Test Ave, Lekki",
    "city": "Lekki",
    "state": "Lagos",
    "latitude": 6.4361,
    "longitude": 3.4739,
    "images": [
        "https://images.unsplash.com/photo-1613977257363-707ba9348227?w=800",
        "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800",
    ],
    "amenities": ["Pool", "Solar", "Security"],
    "year_built": 2024,
    "parking": 3,
}


def _register_fresh_user(base_url, api_client):
    """Register a brand-new user and return (headers, user)."""
    email = f"TEST_agent_{uuid.uuid4().hex[:10]}@example.com"
    password = "testpass123"
    r = api_client.post(
        f"{base_url}/api/auth/register",
        json={"email": email, "password": password, "full_name": "TEST Agent User"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    token = body["access_token"]
    user = body["user"]
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    return headers, user


# ─── POST /api/properties ───────────────────────────────────
class TestCreateProperty:
    def test_create_property_no_auth_401(self, base_url, api_client):
        r = requests.post(f"{base_url}/api/properties", json=VALID_PAYLOAD)
        assert r.status_code == 401

    def test_create_property_invalid_listing_type_422(self, base_url, api_client, auth_headers):
        bad = {**VALID_PAYLOAD, "listing_type": "invalid"}
        r = api_client.post(f"{base_url}/api/properties", json=bad, headers=auth_headers)
        assert r.status_code == 422, r.text

    def test_create_property_success_and_persistence(self, base_url, api_client, auth_headers):
        # Get current user
        me_r = api_client.get(f"{base_url}/api/auth/me", headers=auth_headers)
        assert me_r.status_code == 200
        me = me_r.json()

        payload = {**VALID_PAYLOAD, "title": f"TEST_prop_{uuid.uuid4().hex[:6]}"}
        r = api_client.post(f"{base_url}/api/properties", json=payload, headers=auth_headers)
        assert r.status_code == 200, r.text
        prop = r.json()

        # Structural
        assert "_id" not in prop
        assert "id" in prop and isinstance(prop["id"], str)
        assert prop["title"] == payload["title"]
        assert prop["listing_type"] == "buy"
        assert prop["property_type"] == "duplex"
        assert prop["price"] == payload["price"]
        assert prop["status"] == "coming_soon"
        assert prop["verified"] is False
        assert prop["agent_id"] == me["id"]
        assert prop["agent_name"] == me["full_name"]

        # Persistence — public GET works
        pid = prop["id"]
        get_r = api_client.get(f"{base_url}/api/properties/{pid}")
        assert get_r.status_code == 200
        got = get_r.json()
        assert "_id" not in got
        assert got["id"] == pid
        assert got["agent_id"] == me["id"]

        # Visible from public list
        list_r = api_client.get(f"{base_url}/api/properties", params={"q": payload["title"]})
        assert list_r.status_code == 200
        found = [p for p in list_r.json() if p["id"] == pid]
        assert len(found) == 1, "Newly created property must appear on public list"

    def test_create_property_promotes_user_to_agent(self, base_url, api_client):
        # Fresh user (guaranteed not-yet an agent)
        headers, user = _register_fresh_user(base_url, api_client)
        assert user["is_agent"] is False

        # Baseline /me — is_agent False
        me1 = api_client.get(f"{base_url}/api/auth/me", headers=headers).json()
        assert me1["is_agent"] is False

        # Create first listing
        payload = {**VALID_PAYLOAD, "title": f"TEST_promote_{uuid.uuid4().hex[:6]}"}
        r = api_client.post(f"{base_url}/api/properties", json=payload, headers=headers)
        assert r.status_code == 200, r.text

        # /me should now show is_agent True
        me2 = api_client.get(f"{base_url}/api/auth/me", headers=headers).json()
        assert me2["is_agent"] is True, "User must be auto-promoted to agent on first listing"


# ─── GET /api/agent/listings ────────────────────────────────
class TestAgentListings:
    def test_agent_listings_requires_auth(self, base_url):
        r = requests.get(f"{base_url}/api/agent/listings")
        assert r.status_code == 401

    def test_agent_listings_contains_created_property(self, base_url, api_client):
        headers, user = _register_fresh_user(base_url, api_client)

        # Empty at first
        r0 = api_client.get(f"{base_url}/api/agent/listings", headers=headers)
        assert r0.status_code == 200
        assert r0.json() == []

        # Create two listings
        created_ids = []
        for i in range(2):
            payload = {**VALID_PAYLOAD, "title": f"TEST_listing_{i}_{uuid.uuid4().hex[:6]}"}
            r = api_client.post(f"{base_url}/api/properties", json=payload, headers=headers)
            assert r.status_code == 200, r.text
            created_ids.append(r.json()["id"])

        # GET listings
        r = api_client.get(f"{base_url}/api/agent/listings", headers=headers)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) == 2
        returned_ids = {p["id"] for p in data}
        for cid in created_ids:
            assert cid in returned_ids
        for p in data:
            assert "_id" not in p
            assert p["agent_id"] == user["id"]


# ─── GET /api/agent/dashboard ───────────────────────────────
class TestAgentDashboard:
    def test_agent_dashboard_requires_auth(self, base_url):
        r = requests.get(f"{base_url}/api/agent/dashboard")
        assert r.status_code == 401

    def test_agent_dashboard_shape_and_totals(self, base_url, api_client):
        headers, _user = _register_fresh_user(base_url, api_client)

        # Create three listings with distinct prices
        prices = [50_000_000, 75_000_000, 120_000_000]
        for i, price in enumerate(prices):
            payload = {**VALID_PAYLOAD, "title": f"TEST_dash_{i}_{uuid.uuid4().hex[:6]}", "price": price}
            r = api_client.post(f"{base_url}/api/properties", json=payload, headers=headers)
            assert r.status_code == 200

        r = api_client.get(f"{base_url}/api/agent/dashboard", headers=headers)
        assert r.status_code == 200, r.text
        data = r.json()

        # Shape
        assert "stats" in data and "recent" in data
        stats = data["stats"]
        for key in ("listings", "active", "verified", "views_30d", "favorites_30d", "total_value"):
            assert key in stats, f"Missing stats.{key}"
        # Removed keys should NOT be present
        assert "leads_30d" not in stats
        assert "appointments_30d" not in stats

        # Counts
        assert stats["listings"] == 3
        # None are sold or verified — all active, none verified
        assert stats["active"] == 3
        assert stats["verified"] == 0

        # total_value must be >= sum of active prices (equal here since none sold)
        assert stats["total_value"] >= sum(prices)
        assert stats["total_value"] == sum(prices)

        # Recent
        assert isinstance(data["recent"], list)
        assert len(data["recent"]) <= 5
        for p in data["recent"]:
            assert "_id" not in p


# ─── GET /api/agent/leads ───────────────────────────────────
class TestAgentLeads:
    def test_agent_leads_requires_auth(self, base_url):
        r = requests.get(f"{base_url}/api/agent/leads")
        assert r.status_code == 401

    def test_agent_leads_empty_when_no_listings(self, base_url, api_client):
        headers, _user = _register_fresh_user(base_url, api_client)
        r = api_client.get(f"{base_url}/api/agent/leads", headers=headers)
        assert r.status_code == 200
        assert r.json() == []

    def test_agent_leads_returns_5_mock_leads(self, base_url, api_client):
        headers, _user = _register_fresh_user(base_url, api_client)

        # Create at least one listing so leads can reference a real property
        payload = {**VALID_PAYLOAD, "title": f"TEST_leads_{uuid.uuid4().hex[:6]}"}
        create_r = api_client.post(f"{base_url}/api/properties", json=payload, headers=headers)
        assert create_r.status_code == 200
        created = create_r.json()

        # Snapshot listing ids we own
        listings = api_client.get(f"{base_url}/api/agent/listings", headers=headers).json()
        my_prop_ids = {p["id"] for p in listings}

        r = api_client.get(f"{base_url}/api/agent/leads", headers=headers)
        assert r.status_code == 200, r.text
        leads = r.json()
        assert isinstance(leads, list)
        assert len(leads) == 5, f"Expected 5 mock leads, got {len(leads)}"

        required_fields = {
            "id", "name", "avatar", "channel", "message",
            "property_id", "property_title", "property_image",
            "created_at", "unread",
        }
        for lead in leads:
            missing = required_fields - set(lead.keys())
            assert not missing, f"Lead missing fields: {missing}"
            # property_id must reference a real listing owned by user
            assert lead["property_id"] in my_prop_ids

        # created_at newest first — leads[0].created_at >= leads[-1].created_at
        assert leads[0]["created_at"] >= leads[-1]["created_at"], "Leads should be ordered newest first"

        # Since only 1 listing, all leads should reference the created property
        assert all(lead["property_id"] == created["id"] for lead in leads)


# ─── Regression: seed endpoint still 200 ────────────────────
class TestSeedRegression:
    def test_seed_endpoint_returns_200(self, base_url, api_client):
        r = api_client.post(f"{base_url}/api/seed")
        assert r.status_code == 200, r.text
        body = r.json()
        # Structural sanity
        assert "properties" in body and body["properties"] >= 9
        assert "marketplace" in body and body["marketplace"] >= 1
        assert "neighborhoods" in body and body["neighborhoods"] >= 5
