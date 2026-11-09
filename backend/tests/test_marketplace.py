"""Tests for marketplace, vendor, collection, cart & checkout endpoints (iteration 4)."""
import uuid
import pytest
import requests


# ─── Auth prep ────────────────────────────────────────────
def test_demo_login(base_url, api_client):
    r = api_client.post(
        f"{base_url}/api/auth/login",
        json={"email": "demo@amass.africa", "password": "amass2026"},
    )
    assert r.status_code == 200, r.text
    assert "access_token" in r.json()


# ─── Collections ─────────────────────────────────────────
class TestCollections:
    def test_collections_no_auth(self, base_url, api_client):
        r = api_client.get(f"{base_url}/api/marketplace/collections")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) == 6
        keys = {"id", "slug", "title", "subtitle", "banner", "accent"}
        for c in data:
            assert keys.issubset(c.keys())
            assert "_id" not in c


# ─── Vendors ─────────────────────────────────────────────
class TestVendors:
    def test_vendors_list_no_auth(self, base_url, api_client):
        r = api_client.get(f"{base_url}/api/marketplace/vendors")
        assert r.status_code == 200
        data = r.json()
        assert len(data) == 6
        keys = {
            "id", "name", "tagline", "logo", "cover", "verified", "rating",
            "reviews", "followers", "location", "about", "contact_phone",
            "contact_email", "joined_year",
        }
        for v in data:
            assert keys.issubset(v.keys())
            assert "_id" not in v

    def test_vendor_detail_with_items(self, base_url, api_client):
        vlist = api_client.get(f"{base_url}/api/marketplace/vendors").json()
        vid = "vendor-casa-milano"
        assert any(v["id"] == vid for v in vlist)
        r = api_client.get(f"{base_url}/api/marketplace/vendors/{vid}")
        assert r.status_code == 200
        body = r.json()
        assert "vendor" in body and "items" in body
        assert body["vendor"]["id"] == vid
        assert len(body["items"]) > 0
        for it in body["items"]:
            assert it["vendor_id"] == vid

    def test_vendor_404(self, base_url, api_client):
        r = api_client.get(f"{base_url}/api/marketplace/vendors/nonexistent-xyz")
        assert r.status_code == 404


# ─── Items ───────────────────────────────────────────────
class TestItems:
    def test_item_detail_and_related(self, base_url, api_client):
        items = api_client.get(f"{base_url}/api/marketplace").json()
        assert len(items) >= 28
        # pick one with a subcategory that has siblings
        target = next(
            it for it in items
            if sum(1 for x in items if x["subcategory"] == it["subcategory"]) >= 2
        )
        r = api_client.get(f"{base_url}/api/marketplace/items/{target['id']}")
        assert r.status_code == 200
        body = r.json()
        assert body["item"]["id"] == target["id"]
        assert isinstance(body["related"], list)
        assert len(body["related"]) <= 6
        for rel in body["related"]:
            assert rel["subcategory"] == target["subcategory"]
            assert rel["id"] != target["id"]

    def test_item_404(self, base_url, api_client):
        r = api_client.get(f"{base_url}/api/marketplace/items/nonexistent-xyz")
        assert r.status_code == 404


# ─── Marketplace list & filters ──────────────────────────
class TestMarketplaceFilters:
    def test_full_list_shape(self, base_url, api_client):
        r = api_client.get(f"{base_url}/api/marketplace")
        assert r.status_code == 200
        items = r.json()
        assert len(items) >= 28
        expected_fields = {
            "images", "vendor_id", "verified", "delivery", "delivery_days",
            "brand", "condition", "stock", "specs", "tags", "popular", "on_sale",
        }
        it = items[0]
        for f in expected_fields:
            assert f in it, f"Missing field {f} in item"

    def test_filter_category_home(self, base_url, api_client):
        r = api_client.get(f"{base_url}/api/marketplace", params={"category": "home"})
        assert r.status_code == 200
        items = r.json()
        assert len(items) > 0
        assert all(i["category"] == "home" for i in items)

    def test_filter_subcategory_furniture(self, base_url, api_client):
        r = api_client.get(f"{base_url}/api/marketplace", params={"subcategory": "Furniture"})
        assert r.status_code == 200
        items = r.json()
        assert len(items) > 0
        assert all(i["subcategory"] == "Furniture" for i in items)

    def test_filter_verified_true(self, base_url, api_client):
        r = api_client.get(f"{base_url}/api/marketplace", params={"verified": "true"})
        assert r.status_code == 200
        items = r.json()
        assert len(items) > 0
        assert all(i["verified"] is True for i in items)

    def test_filter_on_sale_true(self, base_url, api_client):
        r = api_client.get(f"{base_url}/api/marketplace", params={"on_sale": "true"})
        assert r.status_code == 200
        items = r.json()
        assert len(items) > 0
        assert all(i["on_sale"] is True for i in items)

    def test_filter_price_range(self, base_url, api_client):
        r = api_client.get(
            f"{base_url}/api/marketplace",
            params={"min_price": 100000, "max_price": 500000},
        )
        assert r.status_code == 200
        items = r.json()
        assert len(items) > 0
        assert all(100000 <= i["price"] <= 500000 for i in items)

    def test_filter_q_chandelier(self, base_url, api_client):
        r = api_client.get(f"{base_url}/api/marketplace", params={"q": "chandelier"})
        assert r.status_code == 200
        items = r.json()
        assert len(items) >= 1
        assert any("chandelier" in i["name"].lower() or "chandelier" in i["description"].lower() for i in items)


# ─── Recently viewed ─────────────────────────────────────
class TestRecentlyViewed:
    @pytest.fixture(scope="class")
    def fresh_user(self, base_url, api_client):
        """Register a fresh user for clean recently-viewed state."""
        email = f"TEST_recent_{uuid.uuid4().hex[:8]}@example.com"
        r = api_client.post(
            f"{base_url}/api/auth/register",
            json={"email": email, "password": "test1234", "full_name": "TEST Recent"},
        )
        assert r.status_code == 200, r.text
        token = r.json()["access_token"]
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    def test_recent_empty_new_user(self, base_url, api_client, fresh_user):
        r = api_client.get(f"{base_url}/api/marketplace/recently-viewed", headers=fresh_user)
        assert r.status_code == 200
        assert r.json() == []

    def test_view_requires_auth(self, base_url, api_client):
        items = api_client.get(f"{base_url}/api/marketplace").json()
        r = requests.post(f"{base_url}/api/marketplace/items/{items[0]['id']}/view")
        assert r.status_code in (401, 403)

    def test_view_and_order(self, base_url, api_client, fresh_user):
        items = api_client.get(f"{base_url}/api/marketplace").json()
        a, b, c = items[0]["id"], items[1]["id"], items[2]["id"]
        for iid in [a, b, c]:
            r = api_client.post(
                f"{base_url}/api/marketplace/items/{iid}/view", headers=fresh_user
            )
            assert r.status_code == 200

        r = api_client.get(f"{base_url}/api/marketplace/recently-viewed", headers=fresh_user)
        assert r.status_code == 200
        rv = r.json()
        # newest-first: c then b then a
        ids = [x["id"] for x in rv]
        assert ids[:3] == [c, b, a]

        # re-view 'a' → should move to front & no dupe
        api_client.post(f"{base_url}/api/marketplace/items/{a}/view", headers=fresh_user)
        rv2 = api_client.get(
            f"{base_url}/api/marketplace/recently-viewed", headers=fresh_user
        ).json()
        ids2 = [x["id"] for x in rv2]
        assert ids2[0] == a
        assert ids2.count(a) == 1

    def test_view_nonexistent_item(self, base_url, api_client, fresh_user):
        r = api_client.post(
            f"{base_url}/api/marketplace/items/nonexistent-xyz/view", headers=fresh_user
        )
        assert r.status_code == 404


# ─── Cart & Checkout ─────────────────────────────────────
class TestCartCheckout:
    @pytest.fixture(scope="class")
    def cart_user(self, base_url, api_client):
        email = f"TEST_cart_{uuid.uuid4().hex[:8]}@example.com"
        r = api_client.post(
            f"{base_url}/api/auth/register",
            json={"email": email, "password": "test1234", "full_name": "TEST Cart"},
        )
        assert r.status_code == 200, r.text
        token = r.json()["access_token"]
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    def test_cart_requires_auth(self, base_url):
        for method, path in [
            ("get", "/api/cart"),
            ("post", "/api/cart/add"),
            ("post", "/api/cart/update"),
            ("delete", "/api/cart/abc"),
            ("post", "/api/cart/clear"),
            ("post", "/api/checkout"),
        ]:
            r = requests.request(method, f"{base_url}{path}", json={"item_id": "x", "quantity": 1})
            assert r.status_code in (401, 403), f"{method} {path} → {r.status_code}"

    def test_empty_cart(self, base_url, api_client, cart_user):
        r = api_client.get(f"{base_url}/api/cart", headers=cart_user)
        assert r.status_code == 200
        assert r.json() == {"items": [], "subtotal": 0}

    def test_add_item_and_subtotal(self, base_url, api_client, cart_user):
        items = api_client.get(f"{base_url}/api/marketplace").json()
        it = items[0]
        r = api_client.post(
            f"{base_url}/api/cart/add",
            headers=cart_user,
            json={"item_id": it["id"], "quantity": 2},
        )
        assert r.status_code == 200
        body = r.json()
        assert len(body["items"]) == 1
        assert body["items"][0]["item"]["id"] == it["id"]
        assert body["items"][0]["quantity"] == 2
        assert body["subtotal"] == it["price"] * 2

    def test_add_same_item_increments(self, base_url, api_client, cart_user):
        items = api_client.get(f"{base_url}/api/marketplace").json()
        it = items[0]
        r = api_client.post(
            f"{base_url}/api/cart/add",
            headers=cart_user,
            json={"item_id": it["id"], "quantity": 1},
        )
        assert r.status_code == 200
        body = r.json()
        # should be a single line with qty 3 now (2 + 1)
        matching = [l for l in body["items"] if l["item"]["id"] == it["id"]]
        assert len(matching) == 1
        assert matching[0]["quantity"] == 3
        assert body["subtotal"] == it["price"] * 3

    def test_add_nonexistent(self, base_url, api_client, cart_user):
        r = api_client.post(
            f"{base_url}/api/cart/add",
            headers=cart_user,
            json={"item_id": "nonexistent-xyz", "quantity": 1},
        )
        assert r.status_code == 404

    def test_update_quantity(self, base_url, api_client, cart_user):
        items = api_client.get(f"{base_url}/api/marketplace").json()
        it = items[0]
        r = api_client.post(
            f"{base_url}/api/cart/update",
            headers=cart_user,
            json={"item_id": it["id"], "quantity": 5},
        )
        assert r.status_code == 200
        body = r.json()
        matching = [l for l in body["items"] if l["item"]["id"] == it["id"]]
        assert matching[0]["quantity"] == 5
        assert body["subtotal"] == it["price"] * 5

    def test_update_quantity_zero_removes(self, base_url, api_client, cart_user):
        items = api_client.get(f"{base_url}/api/marketplace").json()
        it = items[0]
        # first add fresh
        api_client.post(
            f"{base_url}/api/cart/add",
            headers=cart_user,
            json={"item_id": items[1]["id"], "quantity": 1},
        )
        r = api_client.post(
            f"{base_url}/api/cart/update",
            headers=cart_user,
            json={"item_id": it["id"], "quantity": 0},
        )
        assert r.status_code == 200
        ids = [l["item"]["id"] for l in r.json()["items"]]
        assert it["id"] not in ids

    def test_delete_line(self, base_url, api_client, cart_user):
        items = api_client.get(f"{base_url}/api/marketplace").json()
        other = items[1]
        r = api_client.delete(
            f"{base_url}/api/cart/{other['id']}", headers=cart_user
        )
        assert r.status_code == 200
        ids = [l["item"]["id"] for l in r.json()["items"]]
        assert other["id"] not in ids

    def test_clear_cart(self, base_url, api_client, cart_user):
        items = api_client.get(f"{base_url}/api/marketplace").json()
        api_client.post(
            f"{base_url}/api/cart/add",
            headers=cart_user,
            json={"item_id": items[2]["id"], "quantity": 2},
        )
        r = api_client.post(f"{base_url}/api/cart/clear", headers=cart_user)
        assert r.status_code == 200
        assert r.json() == {"items": [], "subtotal": 0}
        # verify persistence
        r2 = api_client.get(f"{base_url}/api/cart", headers=cart_user)
        assert r2.json() == {"items": [], "subtotal": 0}

    def test_checkout_empty_cart_400(self, base_url, api_client, cart_user):
        # cart is empty from previous test
        r = api_client.post(f"{base_url}/api/checkout", headers=cart_user)
        assert r.status_code == 400

    def test_checkout_success_and_clears(self, base_url, api_client, cart_user):
        items = api_client.get(f"{base_url}/api/marketplace").json()
        it = items[3]
        api_client.post(
            f"{base_url}/api/cart/add",
            headers=cart_user,
            json={"item_id": it["id"], "quantity": 2},
        )
        r = api_client.post(f"{base_url}/api/checkout", headers=cart_user)
        assert r.status_code == 200
        body = r.json()
        assert "order_id" in body
        assert body["order_id"].startswith("AMS-")
        assert body["subtotal"] == it["price"] * 2
        assert body["eta_days"] == 3

        # cart should be empty now
        r2 = api_client.get(f"{base_url}/api/cart", headers=cart_user)
        assert r2.json() == {"items": [], "subtotal": 0}


# ─── Regression: prior endpoints ─────────────────────────
class TestRegression:
    def test_auth_login(self, base_url, api_client):
        r = api_client.post(
            f"{base_url}/api/auth/login",
            json={"email": "demo@amass.africa", "password": "amass2026"},
        )
        assert r.status_code == 200

    def test_properties_list(self, base_url, api_client):
        r = api_client.get(f"{base_url}/api/properties")
        assert r.status_code == 200
        assert len(r.json()) > 0

    def test_favorites_requires_auth(self, base_url, api_client):
        r = requests.get(f"{base_url}/api/favorites")
        assert r.status_code in (401, 403)

    def test_agent_dashboard(self, base_url, api_client, auth_headers):
        r = api_client.get(f"{base_url}/api/agent/dashboard", headers=auth_headers)
        assert r.status_code == 200
        assert "stats" in r.json()

    def test_neighborhoods(self, base_url, api_client):
        r = api_client.get(f"{base_url}/api/neighborhoods")
        assert r.status_code == 200
        assert len(r.json()) > 0
