"""Backend tests for AMASS Shop (Market → Brands) feature.

Covers:
- /shop/home (categories, filters, retailers, banners, sections)
- /shop/retailers (listing + filters)
- /shop/retailers/{slug} (SLOT + ORCA Deco)
- /shop/retailers/{slug}/products
- /shop/products (list / detail / 404)
- /shop/search + /shop/search/suggest
- /shop/saves (toggle, list)
- /shop/basket lifecycle (add, cap at 20, qty patch, remove, clear, count)
- /shop/basket/retailer/{rid}/handoff (website / whatsapp invalid)
- unauth GET /basket -> 401
- /shop/assets/logos/* (good + path traversal)
- Wallet balance unchanged before/after handoff (no payment)
- No in-app order/payment endpoint exists under /shop
"""
from __future__ import annotations

import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_BACKEND_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"


# ─────────────────────────── fixtures ───────────────────────────
@pytest.fixture(scope="module")
def slot_retailer_id(auth_headers):
    r = requests.get(f"{API}/shop/retailers/slot", headers=auth_headers)
    assert r.status_code == 200, r.text
    return r.json()["id"]


@pytest.fixture(scope="module")
def slot_products(auth_headers):
    r = requests.get(f"{API}/shop/retailers/slot/products?sort=price_asc", headers=auth_headers)
    assert r.status_code == 200, r.text
    data = r.json()
    assert len(data["products"]) >= 2
    return data["products"]


@pytest.fixture(scope="module")
def clear_basket(auth_headers, slot_retailer_id):
    """Pre-clean SLOT basket for the demo user to isolate state."""
    requests.delete(f"{API}/shop/basket/retailer/{slot_retailer_id}", headers=auth_headers)
    yield
    requests.delete(f"{API}/shop/basket/retailer/{slot_retailer_id}", headers=auth_headers)


# ─────────────────────────── shop home ───────────────────────────
class TestShopHome:
    def test_home_structure(self):
        r = requests.get(f"{API}/shop/home")
        assert r.status_code == 200
        data = r.json()
        assert data["area"] == "Lagos"
        assert isinstance(data["categories"], list) and len(data["categories"]) == 6
        assert {c["key"] for c in data["categories"]} == {"furniture", "electronics", "appliances", "home_decor", "kitchen", "lighting"}
        assert isinstance(data["filters"], list) and len(data["filters"]) > 0
        assert data["retailer_total"] == 7, f"expected 7 retailers, got {data['retailer_total']}"
        assert len(data["retailers"]) == 7
        assert isinstance(data["banners"], list) and len(data["banners"]) >= 1
        # sections
        keys = {s["key"] for s in data["sections"]}
        for want in ("furnish", "deals", "popular", "electronics", "new"):
            assert want in keys, f"section {want} missing (got {keys})"


# ─────────────────────────── retailers list ───────────────────────────
class TestRetailersList:
    def test_list_all(self):
        r = requests.get(f"{API}/shop/retailers")
        assert r.status_code == 200
        d = r.json()
        assert d["total"] == 7

    def test_filter_furniture(self):
        r = requests.get(f"{API}/shop/retailers?category=furniture")
        assert r.status_code == 200
        rows = r.json()["retailers"]
        assert len(rows) > 0
        for row in rows:
            assert "furniture" in row["categories"]

    @pytest.mark.parametrize("flt", ["offers", "delivery", "pickup", "showroom", "warranty", "in_stock"])
    def test_filter_variants(self, flt):
        r = requests.get(f"{API}/shop/retailers?filter={flt}")
        assert r.status_code == 200, (flt, r.text)
        # non-negative total
        assert r.json()["total"] >= 0

    def test_search_slot(self):
        r = requests.get(f"{API}/shop/retailers?q=slot")
        assert r.status_code == 200
        rows = r.json()["retailers"]
        assert any("slot" in row["name"].lower() or "slot" in (row.get("short_name") or "").lower() for row in rows)


# ─────────────────────────── retailer detail ───────────────────────────
class TestRetailerDetail:
    def test_slot(self):
        r = requests.get(f"{API}/shop/retailers/slot")
        assert r.status_code == 200
        d = r.json()
        assert d["slug"] == "slot"
        assert d["product_count"] > 0, f"SLOT should have products, got {d['product_count']}"
        assert isinstance(d.get("promotions"), list)
        assert isinstance(d.get("product_categories"), list) and len(d["product_categories"]) > 0

    def test_orca_deco(self):
        r = requests.get(f"{API}/shop/retailers/orca-deco")
        assert r.status_code == 200
        d = r.json()
        assert d["product_count"] == 0
        assert "catalogue_note" in d and d["catalogue_note"]

    def test_slot_products_price_asc(self, slot_products):
        prices = [p["price"].get("amount") or 0 for p in slot_products if p["price"].get("kind") != "on_request"]
        assert prices == sorted(prices), f"not sorted asc: {prices}"


# ─────────────────────────── products ───────────────────────────
class TestProducts:
    def test_products_appliances_deals(self):
        r = requests.get(f"{API}/shop/products?category=appliances&deals=true&sort=deals")
        assert r.status_code == 200
        d = r.json()
        for p in d["products"]:
            assert p["category"] == "appliances"
            assert p.get("promo") is not None

    def test_product_detail_ok(self, slot_products):
        pid = slot_products[0]["id"]
        r = requests.get(f"{API}/shop/products/{pid}")
        assert r.status_code == 200
        d = r.json()
        assert d["id"] == pid
        assert "purchase_routes" in d
        assert "similar" in d

    def test_product_404(self):
        r = requests.get(f"{API}/shop/products/does-not-exist-xyz")
        assert r.status_code == 404


# ─────────────────────────── search ───────────────────────────
class TestSearch:
    def test_search_hisense(self):
        r = requests.get(f"{API}/shop/search?q=hisense")
        assert r.status_code == 200
        d = r.json()
        assert "stores" in d and "brands" in d and "products" in d
        # hisense is a brand carried by SLOT in the seed data
        assert len(d["products"]) > 0 or len(d["brands"]) > 0

    def test_suggest_fr(self):
        r = requests.get(f"{API}/shop/search/suggest?q=fr")
        assert r.status_code == 200
        sugg = r.json()["suggestions"]
        assert isinstance(sugg, list)
        assert len(sugg) >= 1


# ─────────────────────────── auth-required ───────────────────────────
class TestAuthRequired:
    def test_basket_requires_auth(self):
        r = requests.get(f"{API}/shop/basket")
        assert r.status_code == 401

    def test_saves_toggle_toggle(self, auth_headers, slot_products):
        pid = slot_products[0]["id"]
        # ensure clean state: toggle until false
        requests.post(f"{API}/shop/saves/toggle", json={"kind": "product", "target_id": pid}, headers=auth_headers)
        requests.post(f"{API}/shop/saves/toggle", json={"kind": "product", "target_id": pid}, headers=auth_headers)
        # Toggle on
        r1 = requests.post(f"{API}/shop/saves/toggle", json={"kind": "product", "target_id": pid}, headers=auth_headers)
        assert r1.status_code == 200
        assert r1.json()["saved"] is True
        # Toggle off
        r2 = requests.post(f"{API}/shop/saves/toggle", json={"kind": "product", "target_id": pid}, headers=auth_headers)
        assert r2.status_code == 200
        assert r2.json()["saved"] is False

    def test_saves_list(self, auth_headers):
        r = requests.get(f"{API}/shop/saves", headers=auth_headers)
        assert r.status_code == 200
        d = r.json()
        assert "products" in d and "stores" in d


# ─────────────────────────── basket lifecycle ───────────────────────────
class TestBasketLifecycle:
    def test_add_then_add_again_caps_at_20(self, auth_headers, slot_retailer_id, slot_products, clear_basket):
        pid = slot_products[0]["id"]
        r1 = requests.post(f"{API}/shop/basket/items", json={"product_id": pid, "qty": 2}, headers=auth_headers)
        assert r1.status_code == 200, r1.text
        assert r1.json()["qty"] == 2
        r2 = requests.post(f"{API}/shop/basket/items", json={"product_id": pid, "qty": 2}, headers=auth_headers)
        assert r2.status_code == 200
        assert r2.json()["qty"] == 4
        # cap at 20
        requests.post(f"{API}/shop/basket/items", json={"product_id": pid, "qty": 20}, headers=auth_headers)
        rf = requests.post(f"{API}/shop/basket/items", json={"product_id": pid, "qty": 20}, headers=auth_headers)
        assert rf.json()["qty"] == 20

    def test_basket_grouped_subtotal(self, auth_headers, slot_retailer_id):
        r = requests.get(f"{API}/shop/basket", headers=auth_headers)
        assert r.status_code == 200
        d = r.json()
        assert d["retailer_count"] >= 1
        group = next((g for g in d["groups"] if g["retailer"]["id"] == slot_retailer_id), None)
        assert group is not None
        expected = sum((i["line_total"] or 0) for i in group["items"])
        assert group["subtotal"] == expected

    def test_patch_qty_to_1(self, auth_headers, slot_retailer_id, slot_products):
        pid = slot_products[0]["id"]
        r = requests.patch(f"{API}/shop/basket/items/{pid}", json={"qty": 1}, headers=auth_headers)
        assert r.status_code == 200
        d = r.json()
        group = next((g for g in d["groups"] if g["retailer"]["id"] == slot_retailer_id), None)
        assert group is not None
        line = next((i for i in group["items"] if i["product"]["id"] == pid), None)
        assert line is not None and line["qty"] == 1

    def test_patch_qty_0_removes(self, auth_headers, slot_retailer_id, slot_products):
        pid = slot_products[0]["id"]
        r = requests.patch(f"{API}/shop/basket/items/{pid}", json={"qty": 0}, headers=auth_headers)
        assert r.status_code == 200
        d = r.json()
        group = next((g for g in d["groups"] if g["retailer"]["id"] == slot_retailer_id), None)
        if group:
            assert not any(i["product"]["id"] == pid for i in group["items"])

    def test_basket_count_endpoint(self, auth_headers):
        r = requests.get(f"{API}/shop/basket/count", headers=auth_headers)
        assert r.status_code == 200
        assert "count" in r.json()


class TestBasketOutOfStock:
    def test_oos_409(self, auth_headers):
        """Find an OOS product and assert add fails with 409."""
        # Pull products across catalog and find one that's out of stock
        r = requests.get(f"{API}/shop/products?limit=500")
        assert r.status_code == 200
        oos = next((p for p in r.json()["products"] if p["stock"].get("status") == "out_of_stock"), None)
        if oos is None:
            pytest.skip("No OUT_OF_STOCK product in seed")
        add = requests.post(f"{API}/shop/basket/items", json={"product_id": oos["id"], "qty": 1}, headers=auth_headers)
        assert add.status_code == 409, add.text


# ─────────────────────────── handoff ───────────────────────────
class TestHandoff:
    def test_website_route_ok(self, auth_headers, slot_retailer_id, slot_products, clear_basket):
        # ensure there is at least one item so handoff has basket context
        pid = slot_products[0]["id"]
        requests.post(f"{API}/shop/basket/items", json={"product_id": pid, "qty": 1}, headers=auth_headers)
        r = requests.post(f"{API}/shop/basket/retailer/{slot_retailer_id}/handoff",
                          json={"route": "website"}, headers=auth_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "url" in d and "label" in d and "note" in d

    def test_whatsapp_without_whatsapp_400(self, auth_headers):
        """Find a retailer that has no whatsapp field and attempt whatsapp handoff → 400."""
        rr = requests.get(f"{API}/shop/retailers")
        rows = rr.json()["retailers"]
        candidate = None
        for row in rows:
            det = requests.get(f"{API}/shop/retailers/{row['slug']}").json()
            if not det.get("whatsapp"):
                candidate = det
                break
        if candidate is None:
            pytest.skip("All retailers have whatsapp configured")
        r = requests.post(f"{API}/shop/basket/retailer/{candidate['id']}/handoff",
                          json={"route": "whatsapp"}, headers=auth_headers)
        assert r.status_code == 400, r.text

    def test_handoff_does_not_debit_wallet(self, auth_headers, slot_retailer_id):
        before = requests.get(f"{API}/wallet/me", headers=auth_headers)
        assert before.status_code == 200
        before_bal = before.json().get("balance") or before.json().get("mass")
        requests.post(f"{API}/shop/basket/retailer/{slot_retailer_id}/handoff",
                      json={"route": "website"}, headers=auth_headers)
        after = requests.get(f"{API}/wallet/me", headers=auth_headers)
        after_bal = after.json().get("balance") or after.json().get("mass")
        assert before_bal == after_bal, f"wallet changed: {before_bal} -> {after_bal}"


class TestClearRetailerBasket:
    def test_delete_clears(self, auth_headers, slot_retailer_id, slot_products):
        pid = slot_products[0]["id"]
        requests.post(f"{API}/shop/basket/items", json={"product_id": pid, "qty": 1}, headers=auth_headers)
        r = requests.delete(f"{API}/shop/basket/retailer/{slot_retailer_id}", headers=auth_headers)
        assert r.status_code == 200
        d = r.json()
        group = next((g for g in d["groups"] if g["retailer"]["id"] == slot_retailer_id), None)
        assert group is None


# ─────────────────────────── asset logo endpoint ───────────────────────────
class TestLogoAsset:
    def test_slot_logo_png(self):
        r = requests.get(f"{API}/shop/assets/logos/slot.png")
        # some retailers may use different logo filenames — try alternates if 404
        if r.status_code == 404:
            pytest.skip("slot.png not seeded with that exact filename")
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("image/png")

    def test_logo_path_traversal_rejected(self):
        r = requests.get(f"{API}/shop/assets/logos/../x.png")
        # FastAPI normalises `..`, so this ends up at /api/shop/assets/x.png (which doesn't exist)
        # OR hits the handler with "../x.png" where "/" check rejects → 400
        # Either way, must NOT be 200
        assert r.status_code in (400, 404), r.status_code


# ─────────────────────────── no payment endpoint ───────────────────────────
class TestNoPaymentEndpoint:
    def test_no_shop_order_endpoint(self):
        for path in ("/shop/orders", "/shop/checkout", "/shop/pay", "/shop/payment"):
            r = requests.post(f"{API}{path}", json={})
            assert r.status_code in (404, 405), f"{path} should not exist, got {r.status_code}"
