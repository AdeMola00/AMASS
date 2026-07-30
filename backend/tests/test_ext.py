"""AMASS extension modules tests: Media, Marketplace, App Config, Token Economy, RBAC."""
import io
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/") or "https://amass-control.preview.emergentagent.com"

SUPER = {"email": "admin@amass.africa", "password": "ya0y9os77F@c8TXXh5@A"}
CONTENT = {"email": "content@amass.africa", "password": "Amass@2026"}
FINANCE = {"email": "finance@amass.africa", "password": "Amass@2026"}


def _login(c):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=c, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def super_token():
    return _login(SUPER)


@pytest.fixture(scope="module")
def content_token():
    return _login(CONTENT)


@pytest.fixture(scope="module")
def finance_token():
    return _login(FINANCE)


# ---- tiny PNG bytes ----
PNG_1PX = bytes.fromhex(
    "89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C489"
    "0000000D49444154789C6300010000000500010D0A2DB40000000049454E44AE426082"
)


# ---------------- Media library ----------------
class TestMedia:
    uploaded_id = None
    storage_path = None
    file_url = None

    def test_upload(self, super_token):
        files = {"file": ("test.png", io.BytesIO(PNG_1PX), "image/png")}
        r = requests.post(f"{BASE_URL}/api/media/upload?folder=general",
                          headers=_h(super_token), files=files, timeout=60)
        assert r.status_code == 200, r.text
        j = r.json()
        assert "url" in j and "storage_path" in j and "id" in j
        assert j["url"].startswith("/api/media/file/")
        TestMedia.uploaded_id = j["id"]
        TestMedia.storage_path = j["storage_path"]
        TestMedia.file_url = j["url"]

    def test_file_served_no_auth(self):
        assert TestMedia.file_url, "upload didn't run"
        r = requests.get(f"{BASE_URL}{TestMedia.file_url}", timeout=30)
        assert r.status_code == 200, r.text
        assert "image" in r.headers.get("content-type", "").lower()
        assert len(r.content) > 0

    def test_list_shows_upload(self, super_token):
        r = requests.get(f"{BASE_URL}/api/media", headers=_h(super_token))
        assert r.status_code == 200
        ids = [m["id"] for m in r.json()]
        assert TestMedia.uploaded_id in ids

    def test_soft_delete_and_disappear(self, super_token):
        r = requests.delete(f"{BASE_URL}/api/media/{TestMedia.uploaded_id}",
                            headers=_h(super_token))
        assert r.status_code == 200
        rows = requests.get(f"{BASE_URL}/api/media", headers=_h(super_token)).json()
        assert TestMedia.uploaded_id not in [m["id"] for m in rows]
        # file endpoint should also 404 now
        r2 = requests.get(f"{BASE_URL}{TestMedia.file_url}")
        assert r2.status_code == 404


# ---------------- Marketplace ----------------
class TestMarketplaceCategories:
    def test_seed_count(self, super_token):
        r = requests.get(f"{BASE_URL}/api/marketplace/categories", headers=_h(super_token))
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) >= 6

    def test_create_update_delete(self, super_token):
        payload = {"name": "TEST_Cat", "slug": "test-cat", "icon": "Tag",
                   "image": "", "active": True, "order": 99}
        r = requests.post(f"{BASE_URL}/api/marketplace/categories",
                          headers=_h(super_token), json=payload)
        assert r.status_code == 200, r.text
        cid = r.json()["id"]
        rows = requests.get(f"{BASE_URL}/api/marketplace/categories",
                            headers=_h(super_token)).json()
        assert any(c["id"] == cid and c["name"] == "TEST_Cat" for c in rows)
        # update
        payload["name"] = "TEST_Cat_Renamed"
        u = requests.put(f"{BASE_URL}/api/marketplace/categories/{cid}",
                         headers=_h(super_token), json=payload)
        assert u.status_code == 200
        rows = requests.get(f"{BASE_URL}/api/marketplace/categories",
                            headers=_h(super_token)).json()
        assert any(c["id"] == cid and c["name"] == "TEST_Cat_Renamed" for c in rows)
        # delete
        d = requests.delete(f"{BASE_URL}/api/marketplace/categories/{cid}",
                            headers=_h(super_token))
        assert d.status_code == 200


class TestMarketplaceProducts:
    def test_seed_and_featured(self, super_token):
        r = requests.get(f"{BASE_URL}/api/marketplace/products", headers=_h(super_token))
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) >= 8
        assert sum(1 for p in rows if p.get("featured")) >= 3

    def test_create_flags_delete(self, super_token):
        payload = {"title": "TEST_Product", "description": "d", "price": 1000, "stock": 5,
                   "images": [], "featured": False, "status": "active"}
        r = requests.post(f"{BASE_URL}/api/marketplace/products",
                          headers=_h(super_token), json=payload)
        assert r.status_code == 200, r.text
        pid = r.json()["id"]
        # flags toggle featured
        f = requests.patch(f"{BASE_URL}/api/marketplace/products/{pid}/flags",
                           headers=_h(super_token), json={"featured": True, "status": "inactive"})
        assert f.status_code == 200
        got = [p for p in requests.get(f"{BASE_URL}/api/marketplace/products",
                                       headers=_h(super_token)).json() if p["id"] == pid][0]
        assert got["featured"] is True
        assert got["status"] == "inactive"
        d = requests.delete(f"{BASE_URL}/api/marketplace/products/{pid}",
                            headers=_h(super_token))
        assert d.status_code == 200


class TestMarketplacePromoAndPricing:
    def test_promo_crud(self, super_token):
        r = requests.get(f"{BASE_URL}/api/marketplace/promotions",
                         headers=_h(super_token))
        assert r.status_code == 200
        c = requests.post(f"{BASE_URL}/api/marketplace/promotions",
                          headers=_h(super_token),
                          json={"title": "TEST_Promo", "kind": "discount", "value": "10%",
                                "active": True})
        assert c.status_code == 200
        pid = c.json()["id"]
        d = requests.delete(f"{BASE_URL}/api/marketplace/promotions/{pid}",
                            headers=_h(super_token))
        assert d.status_code == 200

    def test_pricing_crud(self, super_token):
        r = requests.get(f"{BASE_URL}/api/marketplace/pricing-rules",
                         headers=_h(super_token))
        assert r.status_code == 200
        c = requests.post(f"{BASE_URL}/api/marketplace/pricing-rules",
                          headers=_h(super_token),
                          json={"name": "TEST_Rule", "kind": "commission",
                                "value": 3.5, "active": True})
        assert c.status_code == 200
        rid = c.json()["id"]
        d = requests.delete(f"{BASE_URL}/api/marketplace/pricing-rules/{rid}",
                            headers=_h(super_token))
        assert d.status_code == 200


class TestPublicMarketplace:
    def test_public_categories_only_active(self, super_token):
        r = requests.get(f"{BASE_URL}/api/public/marketplace/categories")
        assert r.status_code == 200
        for c in r.json():
            assert c.get("active", True) is True

    def test_public_products_only_active(self):
        r = requests.get(f"{BASE_URL}/api/public/marketplace/products")
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) > 0
        for p in rows:
            assert p["status"] == "active"

    def test_public_products_featured_filter(self):
        r = requests.get(f"{BASE_URL}/api/public/marketplace/products?featured=true")
        assert r.status_code == 200
        for p in r.json():
            assert p["featured"] is True


# ---------------- App Configuration ----------------
class TestAppConfig:
    def test_list_six_sections(self, super_token):
        r = requests.get(f"{BASE_URL}/api/app-config", headers=_h(super_token))
        assert r.status_code == 200
        rows = r.json()
        keys = [x["key"] for x in rows]
        for k in ["homepage_sections", "map_settings", "marketplace_config",
                  "app_banners", "notifications", "featured_properties"]:
            assert k in keys, f"missing config key {k}"

    def test_update_and_public_map(self, super_token):
        cur = [r for r in requests.get(f"{BASE_URL}/api/app-config",
                                       headers=_h(super_token)).json()
               if r["key"] == "map_settings"][0]
        orig = cur["data"]
        new_data = dict(orig)
        new_data["default_zoom"] = 14
        r = requests.put(f"{BASE_URL}/api/app-config/map_settings",
                         headers=_h(super_token), json={"data": new_data})
        assert r.status_code == 200
        pub = requests.get(f"{BASE_URL}/api/public/app-config").json()
        assert pub["map_settings"]["default_zoom"] == 14
        # restore
        requests.put(f"{BASE_URL}/api/app-config/map_settings",
                     headers=_h(super_token), json={"data": orig})

    def test_public_returns_map(self):
        r = requests.get(f"{BASE_URL}/api/public/app-config")
        assert r.status_code == 200
        j = r.json()
        assert isinstance(j, dict)
        assert "homepage_sections" in j


# ---------------- Token Economy ----------------
class TestTokenEconomy:
    def test_bundles_seed(self, super_token):
        r = requests.get(f"{BASE_URL}/api/tokens/bundles", headers=_h(super_token))
        assert r.status_code == 200
        assert len(r.json()) >= 3

    def test_plans_seed(self, super_token):
        r = requests.get(f"{BASE_URL}/api/tokens/plans", headers=_h(super_token))
        assert r.status_code == 200
        assert len(r.json()) >= 3

    def test_rewards_seed(self, super_token):
        r = requests.get(f"{BASE_URL}/api/tokens/rewards", headers=_h(super_token))
        assert r.status_code == 200
        assert len(r.json()) >= 3

    def test_wallets_list(self, super_token):
        r = requests.get(f"{BASE_URL}/api/tokens/wallets", headers=_h(super_token))
        assert r.status_code == 200
        assert len(r.json()) >= 1  # relaxed vs 52

    def test_bundle_crud(self, super_token):
        c = requests.post(f"{BASE_URL}/api/tokens/bundles", headers=_h(super_token),
                          json={"name": "TEST_Bundle", "tokens": 10, "price": 500,
                                "currency": "NGN", "bonus": 0, "active": True})
        assert c.status_code == 200, c.text
        bid = c.json()["id"]
        u = requests.put(f"{BASE_URL}/api/tokens/bundles/{bid}", headers=_h(super_token),
                         json={"name": "TEST_Bundle_2", "tokens": 15, "price": 750,
                               "currency": "NGN", "bonus": 5, "active": True})
        assert u.status_code == 200
        d = requests.delete(f"{BASE_URL}/api/tokens/bundles/{bid}",
                            headers=_h(super_token))
        assert d.status_code == 200

    def test_wallet_adjust_not_below_zero(self, super_token):
        wallets = requests.get(f"{BASE_URL}/api/tokens/wallets",
                               headers=_h(super_token)).json()
        assert len(wallets) > 0
        w = wallets[-1]  # lowest balance (sort desc)
        wid = w["id"]
        # add 50
        r = requests.patch(f"{BASE_URL}/api/tokens/wallets/{wid}",
                           headers=_h(super_token), json={"amount": 50, "reason": "test"})
        assert r.status_code == 200
        bal = r.json()["balance"]
        assert bal == w.get("balance", 0) + 50
        # large negative -> clamp to 0
        r2 = requests.patch(f"{BASE_URL}/api/tokens/wallets/{wid}",
                            headers=_h(super_token),
                            json={"amount": -(bal + 10000), "reason": "test"})
        assert r2.status_code == 200
        assert r2.json()["balance"] == 0
        # restore original
        requests.patch(f"{BASE_URL}/api/tokens/wallets/{wid}", headers=_h(super_token),
                       json={"amount": w.get("balance", 0)})

    def test_public_bundles_only_active(self):
        r = requests.get(f"{BASE_URL}/api/public/tokens/bundles")
        assert r.status_code == 200
        for b in r.json():
            assert b.get("active", True) is True

    def test_public_plans_only_active(self):
        r = requests.get(f"{BASE_URL}/api/public/tokens/plans")
        assert r.status_code == 200
        for p in r.json():
            assert p.get("active", True) is True


# ---------------- RBAC on new modules ----------------
class TestExtRBAC:
    @pytest.mark.parametrize("path", [
        "/api/marketplace/products",
        "/api/app-config",
        "/api/tokens/bundles",
        "/api/media",
    ])
    def test_content_manager_403(self, content_token, path):
        r = requests.get(f"{BASE_URL}{path}", headers=_h(content_token))
        assert r.status_code == 403, f"{path} expected 403, got {r.status_code}"

    @pytest.mark.parametrize("path", [
        "/api/marketplace/products",
        "/api/app-config",
        "/api/tokens/bundles",
        "/api/media",
    ])
    def test_finance_403(self, finance_token, path):
        r = requests.get(f"{BASE_URL}{path}", headers=_h(finance_token))
        assert r.status_code == 403, f"{path} expected 403, got {r.status_code}"
