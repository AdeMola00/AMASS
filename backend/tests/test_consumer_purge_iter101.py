# Iteration 101 — consumer-app purge regression: backend smoke for demo user + admin guard checks
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL").rstrip("/")
DEMO = {"email": "demo@amass.africa", "password": "amass2026"}


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json=DEMO, timeout=20)
    if r.status_code != 200:
        pytest.skip(f"login failed {r.status_code}")
    d = r.json()
    assert "access_token" in d and d["user"]["email"] == DEMO["email"]
    return d["access_token"]


@pytest.fixture(scope="module")
def h(token):
    return {"Authorization": f"Bearer {token}"}


# Auth
def test_login_bad_password():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": DEMO["email"], "password": "wrong"}, timeout=20)
    assert r.status_code in (400, 401)


def test_me(h):
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=h, timeout=20)
    assert r.status_code == 200
    assert r.json()["email"] == DEMO["email"]


# Consumer smoke endpoints
@pytest.mark.parametrize("path", [
    "/api/wallet/me",
    "/api/properties",
    "/api/marketplace",
    "/api/fixa/providers",
    "/api/ads/mine",
    "/api/viewings/mine?role=all",
    "/api/notifications",
    "/api/marketplace/fixa/bookings",
])
def test_consumer_endpoints_200(h, path):
    r = requests.get(f"{BASE_URL}{path}", headers=h, timeout=30)
    assert r.status_code == 200, f"{path} -> {r.status_code} {r.text[:200]}"
    assert r.json() is not None


def test_properties_shape(h):
    r = requests.get(f"{BASE_URL}/api/properties", headers=h, timeout=30)
    data = r.json()
    items = data if isinstance(data, list) else data.get("items", [])
    assert len(items) > 0
    assert "id" in items[0] and "_id" not in items[0]
    d = requests.get(f"{BASE_URL}/api/properties/{items[0]['id']}", headers=h, timeout=30)
    assert d.status_code == 200 and d.json()["id"] == items[0]["id"]


def test_fixa_provider_detail(h):
    r = requests.get(f"{BASE_URL}/api/fixa/providers", headers=h, timeout=30).json()
    if not r["items"]:
        pytest.skip("no providers")
    pid = r["items"][0]["id"]
    d = requests.get(f"{BASE_URL}/api/fixa/providers/{pid}", headers=h, timeout=30)
    assert d.status_code == 200


# Admin endpoints must be guarded (401/403), never 500
@pytest.mark.parametrize("path", ["/api/admin/fixa/overview", "/api/admin/kyc/queue"])
def test_admin_endpoints_for_demo_admin(h, path):
    # demo is is_admin=true -> 200, must never be 500
    r = requests.get(f"{BASE_URL}{path}", headers=h, timeout=20)
    assert r.status_code == 200, f"{path} -> {r.status_code}"


@pytest.mark.parametrize("path", ["/api/admin/fixa/overview", "/api/admin/kyc/queue", "/api/wallet/me"])
def test_unauth_rejected(path):
    r = requests.get(f"{BASE_URL}{path}", timeout=20)
    assert r.status_code in (401, 403), f"{path} -> {r.status_code}"


# NOTE: demo@amass.africa is in ADMIN_EMAILS (is_admin=true) by design, so admin endpoints return 200 for demo.
# Guard verification therefore uses a fresh non-admin TEST_ user.
@pytest.fixture(scope="module")
def non_admin_h():
    import uuid
    email = f"test_iter101_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{BASE_URL}/api/auth/register", json={"email": email, "password": "testpass123", "full_name": "TEST_ Iter101"}, timeout=20)
    if r.status_code not in (200, 201):
        pytest.skip(f"register failed {r.status_code}")
    hdr = {"Authorization": f"Bearer {r.json()['access_token']}"}
    yield hdr
    # cleanup: delete only the TEST_ user this run created
    requests.post(f"{BASE_URL}/api/agent-platform/account/delete", headers=hdr, timeout=20)


@pytest.mark.parametrize("path", ["/api/admin/fixa/overview", "/api/admin/kyc/queue"])
def test_admin_guarded_for_non_admin(non_admin_h, path):
    r = requests.get(f"{BASE_URL}{path}", headers=non_admin_h, timeout=20)
    assert r.status_code in (401, 403), f"{path} -> {r.status_code}"
