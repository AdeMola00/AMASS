"""Iteration 5: verify GET /api/properties enriches with views_recent/favorites_recent.
Also verify POST /api/properties/{id}/view increments and dedupes per day.
"""
import requests
import uuid


class TestHotHomeEnrichment:
    def test_properties_include_recent_counts(self, base_url, api_client):
        r = api_client.get(f"{base_url}/api/properties")
        assert r.status_code == 200
        data = r.json()
        assert len(data) >= 9
        for p in data:
            assert "views_recent" in p, f"missing views_recent in {p['id']}"
            assert "favorites_recent" in p, f"missing favorites_recent in {p['id']}"
            assert isinstance(p["views_recent"], int)
            assert isinstance(p["favorites_recent"], int)
            assert p["views_recent"] >= 0
            assert p["favorites_recent"] >= 0

    def test_view_increments_views_recent(self, base_url, api_client):
        # Pick a property
        lst = api_client.get(f"{base_url}/api/properties").json()
        pid = lst[0]["id"]
        before = lst[0]["views_recent"]

        # Register a brand-new user to bypass daily dedupe (per-user)
        email = f"TEST_hot_{uuid.uuid4().hex[:8]}@example.com"
        reg = api_client.post(
            f"{base_url}/api/auth/register",
            json={"email": email, "password": "testpass123", "full_name": "Hot Test"},
        )
        assert reg.status_code == 200
        token = reg.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

        # Record a view
        rv = api_client.post(
            f"{base_url}/api/properties/{pid}/view", headers=headers
        )
        assert rv.status_code == 200
        assert rv.json() == {"ok": True}

        # Views_recent should be >= before + 1
        after = api_client.get(f"{base_url}/api/properties").json()
        after_p = next((x for x in after if x["id"] == pid), None)
        assert after_p is not None
        assert after_p["views_recent"] >= before + 1, (before, after_p["views_recent"])

        # Second view same user same day → dedupe (no increment)
        rv2 = api_client.post(
            f"{base_url}/api/properties/{pid}/view", headers=headers
        )
        assert rv2.status_code == 200
        after2 = api_client.get(f"{base_url}/api/properties").json()
        after_p2 = next((x for x in after2 if x["id"] == pid), None)
        assert after_p2["views_recent"] == after_p["views_recent"], "dedupe failed"

    def test_view_nonexistent_property_404(self, base_url, api_client):
        r = api_client.post(f"{base_url}/api/properties/does-not-exist/view")
        assert r.status_code == 404

    def test_property_detail_has_mandate_and_listing_source(self, base_url, api_client):
        lst = api_client.get(f"{base_url}/api/properties").json()
        pid = lst[0]["id"]
        r = api_client.get(f"{base_url}/api/properties/{pid}")
        assert r.status_code == 200
        p = r.json()
        assert "listing_source" in p
        assert p["listing_source"] in (
            "owner_listed", "mandated", "independent", "pending"
        )
        assert "mandate" in p  # can be None but must be present in the doc

    def test_filter_combination(self, base_url, api_client):
        r = api_client.get(
            f"{base_url}/api/properties",
            params={"listing_type": "buy", "bedrooms": 3, "verified": "true"},
        )
        assert r.status_code == 200
        for p in r.json():
            assert p["listing_type"] == "buy"
            assert p["bedrooms"] >= 3
            assert p["verified"] is True
