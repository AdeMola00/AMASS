"""AMASS backend — Analytics endpoints test suite (iteration 3).

Covers NEW / CHANGED endpoints:
  - POST  /api/properties/{id}/view          (new)
  - POST  /api/favorites/toggle              (now writes favorite/unfavorite events)
  - GET   /api/agent/dashboard               (views_30d/favorites_30d are REAL; leads_30d/appointments_30d REMOVED)
  - GET   /api/agent/listings-analytics      (new)
  - Regression: /api/auth/login, /api/properties, /api/properties/{id}, /api/agent/listings, /api/agent/leads
"""
import uuid
import requests
import pytest


# ─── helpers ────────────────────────────────────────────────
PAYLOAD = {
    "title": "TEST_analytics_seed",
    "description": "Analytics test listing.",
    "price": 100_000_000,
    "listing_type": "buy",
    "property_type": "duplex",
    "bedrooms": 4,
    "bathrooms": 5,
    "size_sqm": 400,
    "location": "Analytics Ave, Lekki",
    "city": "Lekki",
    "state": "Lagos",
    "latitude": 6.4361,
    "longitude": 3.4739,
    "images": ["https://images.unsplash.com/photo-1613977257363-707ba9348227?w=800"],
    "amenities": ["Pool"],
}


def _register_fresh_user(base_url, api_client, tag="user"):
    email = f"TEST_{tag}_{uuid.uuid4().hex[:10]}@example.com"
    r = api_client.post(
        f"{base_url}/api/auth/register",
        json={"email": email, "password": "testpass123", "full_name": f"TEST {tag}"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    return (
        {"Authorization": f"Bearer {body['access_token']}", "Content-Type": "application/json"},
        body["user"],
    )


def _create_listing(base_url, api_client, headers, title_suffix=""):
    payload = {**PAYLOAD, "title": f"TEST_{title_suffix or uuid.uuid4().hex[:6]}"}
    r = api_client.post(f"{base_url}/api/properties", json=payload, headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


# ─── POST /api/properties/{id}/view ─────────────────────────
class TestViewEndpoint:
    def test_view_no_auth_returns_ok(self, base_url, api_client):
        headers, _ = _register_fresh_user(base_url, api_client, "owner")
        prop = _create_listing(base_url, api_client, headers, "view_anon")

        r = requests.post(f"{base_url}/api/properties/{prop['id']}/view")
        assert r.status_code == 200, r.text
        assert r.json() == {"ok": True}

    def test_view_with_auth_returns_ok(self, base_url, api_client):
        owner_h, _ = _register_fresh_user(base_url, api_client, "owner")
        prop = _create_listing(base_url, api_client, owner_h, "view_auth")

        viewer_h, _ = _register_fresh_user(base_url, api_client, "viewer")
        r = api_client.post(
            f"{base_url}/api/properties/{prop['id']}/view", headers=viewer_h
        )
        assert r.status_code == 200
        assert r.json() == {"ok": True}

    def test_view_nonexistent_returns_404(self, base_url, api_client):
        r = requests.post(f"{base_url}/api/properties/does-not-exist-{uuid.uuid4().hex}/view")
        assert r.status_code == 404


# ─── Dedupe + counting semantics ────────────────────────────
class TestViewDedupe:
    def test_same_user_same_day_counts_once(self, base_url, api_client):
        owner_h, _ = _register_fresh_user(base_url, api_client, "ownerA")
        prop = _create_listing(base_url, api_client, owner_h, "dedupe")

        # user B views 3 times
        user_b_h, _ = _register_fresh_user(base_url, api_client, "userB")
        for _ in range(3):
            r = api_client.post(
                f"{base_url}/api/properties/{prop['id']}/view", headers=user_b_h
            )
            assert r.status_code == 200

        # owner checks dashboard → views_30d for this listing == 1
        dash = api_client.get(f"{base_url}/api/agent/dashboard", headers=owner_h).json()
        assert dash["stats"]["views_30d"] == 1, dash["stats"]

    def test_different_users_count_separately(self, base_url, api_client):
        owner_h, _ = _register_fresh_user(base_url, api_client, "ownerB")
        prop = _create_listing(base_url, api_client, owner_h, "multi_user")

        user_b_h, _ = _register_fresh_user(base_url, api_client, "userB2")
        user_c_h, _ = _register_fresh_user(base_url, api_client, "userC2")
        # B views 3 times → 1
        for _ in range(3):
            api_client.post(f"{base_url}/api/properties/{prop['id']}/view", headers=user_b_h)
        # C views 2 times → 1
        for _ in range(2):
            api_client.post(f"{base_url}/api/properties/{prop['id']}/view", headers=user_c_h)

        dash = api_client.get(f"{base_url}/api/agent/dashboard", headers=owner_h).json()
        assert dash["stats"]["views_30d"] == 2, dash["stats"]

    def test_anonymous_view_increments_and_dedupes(self, base_url, api_client):
        owner_h, _ = _register_fresh_user(base_url, api_client, "ownerC")
        prop = _create_listing(base_url, api_client, owner_h, "anon_view")

        # Anonymous calls twice — dedupe key is null user_id per day → counts once
        requests.post(f"{base_url}/api/properties/{prop['id']}/view")
        requests.post(f"{base_url}/api/properties/{prop['id']}/view")

        dash = api_client.get(f"{base_url}/api/agent/dashboard", headers=owner_h).json()
        assert dash["stats"]["views_30d"] == 1, dash["stats"]


# ─── Favorites events ───────────────────────────────────────
class TestFavoritesEvents:
    def test_favorite_toggle_writes_event_and_counts_dashboard(self, base_url, api_client):
        owner_h, _ = _register_fresh_user(base_url, api_client, "ownerFav")
        prop = _create_listing(base_url, api_client, owner_h, "fav")

        # Baseline
        dash0 = api_client.get(f"{base_url}/api/agent/dashboard", headers=owner_h).json()
        base_fav = dash0["stats"]["favorites_30d"]

        # Another user favorites the listing
        user_h, _ = _register_fresh_user(base_url, api_client, "favUser")
        r = api_client.post(
            f"{base_url}/api/favorites/toggle",
            json={"property_id": prop["id"]},
            headers=user_h,
        )
        assert r.status_code == 200
        assert r.json() == {"favorited": True}

        dash1 = api_client.get(f"{base_url}/api/agent/dashboard", headers=owner_h).json()
        assert dash1["stats"]["favorites_30d"] == base_fav + 1

    def test_unfavorite_does_not_decrement(self, base_url, api_client):
        owner_h, _ = _register_fresh_user(base_url, api_client, "ownerUnfav")
        prop = _create_listing(base_url, api_client, owner_h, "unfav")

        user_h, _ = _register_fresh_user(base_url, api_client, "unfavUser")

        # Favorite ON
        r1 = api_client.post(
            f"{base_url}/api/favorites/toggle",
            json={"property_id": prop["id"]},
            headers=user_h,
        )
        assert r1.json() == {"favorited": True}
        dash_on = api_client.get(f"{base_url}/api/agent/dashboard", headers=owner_h).json()
        count_after_fav = dash_on["stats"]["favorites_30d"]

        # Favorite OFF (unfavorite)
        r2 = api_client.post(
            f"{base_url}/api/favorites/toggle",
            json={"property_id": prop["id"]},
            headers=user_h,
        )
        assert r2.json() == {"favorited": False}

        dash_off = api_client.get(f"{base_url}/api/agent/dashboard", headers=owner_h).json()
        # favorites_30d must NOT decrement — favorite is a running interest counter
        assert dash_off["stats"]["favorites_30d"] == count_after_fav, dash_off["stats"]


# ─── /api/agent/dashboard shape ─────────────────────────────
class TestDashboardShape:
    def test_dashboard_shape_new_keys(self, base_url, api_client):
        owner_h, _ = _register_fresh_user(base_url, api_client, "ownerShape")
        _create_listing(base_url, api_client, owner_h, "shape")

        r = api_client.get(f"{base_url}/api/agent/dashboard", headers=owner_h)
        assert r.status_code == 200
        stats = r.json()["stats"]

        expected = {"listings", "active", "verified", "views_30d", "favorites_30d", "total_value"}
        assert expected.issubset(set(stats.keys())), stats.keys()
        # Removed keys
        assert "leads_30d" not in stats
        assert "appointments_30d" not in stats
        # Real numeric types
        assert isinstance(stats["views_30d"], int)
        assert isinstance(stats["favorites_30d"], int)


# ─── /api/agent/listings-analytics ──────────────────────────
class TestListingsAnalytics:
    def test_analytics_requires_auth(self, base_url):
        r = requests.get(f"{base_url}/api/agent/listings-analytics")
        assert r.status_code == 401

    def test_analytics_empty_when_no_listings(self, base_url, api_client):
        headers, _ = _register_fresh_user(base_url, api_client, "empty")
        r = api_client.get(f"{base_url}/api/agent/listings-analytics", headers=headers)
        assert r.status_code == 200
        assert r.json() == []

    def test_analytics_row_shape_and_counts(self, base_url, api_client):
        owner_h, _ = _register_fresh_user(base_url, api_client, "ownerAn")
        prop = _create_listing(base_url, api_client, owner_h, "an_row")

        # Two distinct viewers + one favoriter
        viewer1_h, _ = _register_fresh_user(base_url, api_client, "v1")
        viewer2_h, _ = _register_fresh_user(base_url, api_client, "v2")
        api_client.post(f"{base_url}/api/properties/{prop['id']}/view", headers=viewer1_h)
        api_client.post(f"{base_url}/api/properties/{prop['id']}/view", headers=viewer1_h)  # dedupe
        api_client.post(f"{base_url}/api/properties/{prop['id']}/view", headers=viewer2_h)

        fav_h, _ = _register_fresh_user(base_url, api_client, "favA")
        api_client.post(
            f"{base_url}/api/favorites/toggle",
            json={"property_id": prop["id"]},
            headers=fav_h,
        )

        r = api_client.get(f"{base_url}/api/agent/listings-analytics", headers=owner_h)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list) and len(data) == 1

        row = data[0]
        expected_keys = {
            "property_id", "title", "image", "price", "status", "verified", "views", "favorites",
        }
        assert expected_keys.issubset(set(row.keys())), row.keys()
        assert row["property_id"] == prop["id"]
        assert row["title"] == prop["title"]
        assert row["price"] == prop["price"]
        assert row["verified"] is False
        assert row["views"] == 2
        assert row["favorites"] == 1

    def test_analytics_isolation_between_agents(self, base_url, api_client):
        agent_a_h, _ = _register_fresh_user(base_url, api_client, "agentA")
        agent_b_h, _ = _register_fresh_user(base_url, api_client, "agentB")

        prop_a = _create_listing(base_url, api_client, agent_a_h, "iso_a")
        prop_b1 = _create_listing(base_url, api_client, agent_b_h, "iso_b1")
        prop_b2 = _create_listing(base_url, api_client, agent_b_h, "iso_b2")

        an_a = api_client.get(
            f"{base_url}/api/agent/listings-analytics", headers=agent_a_h
        ).json()
        an_b = api_client.get(
            f"{base_url}/api/agent/listings-analytics", headers=agent_b_h
        ).json()

        ids_a = {r["property_id"] for r in an_a}
        ids_b = {r["property_id"] for r in an_b}
        assert ids_a == {prop_a["id"]}
        assert ids_b == {prop_b1["id"], prop_b2["id"]}
        # No leakage
        assert prop_a["id"] not in ids_b
        assert prop_b1["id"] not in ids_a
        assert prop_b2["id"] not in ids_a


# ─── Regression on unchanged endpoints ──────────────────────
class TestRegression:
    def test_login_still_works(self, base_url, api_client):
        r = api_client.post(
            f"{base_url}/api/auth/login",
            json={"email": "demo@amass.africa", "password": "amass2026"},
        )
        assert r.status_code == 200
        assert "access_token" in r.json()

    def test_properties_list_200(self, base_url, api_client):
        r = api_client.get(f"{base_url}/api/properties")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) > 0
        assert all("_id" not in p for p in data)

    def test_property_detail_200(self, base_url, api_client):
        lst = api_client.get(f"{base_url}/api/properties").json()
        pid = lst[0]["id"]
        r = api_client.get(f"{base_url}/api/properties/{pid}")
        assert r.status_code == 200
        assert r.json()["id"] == pid

    def test_favorites_toggle_regression(self, base_url, api_client):
        h, _ = _register_fresh_user(base_url, api_client, "regFav")
        lst = api_client.get(f"{base_url}/api/properties").json()
        pid = lst[0]["id"]
        r = api_client.post(
            f"{base_url}/api/favorites/toggle",
            json={"property_id": pid},
            headers=h,
        )
        assert r.status_code == 200
        assert r.json()["favorited"] is True

    def test_agent_leads_still_works(self, base_url, api_client, auth_headers):
        r = api_client.get(f"{base_url}/api/agent/leads", headers=auth_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_agent_listings_still_works(self, base_url, api_client, auth_headers):
        r = api_client.get(f"{base_url}/api/agent/listings", headers=auth_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)
