import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_BACKEND_URL", "http://localhost:8001").rstrip("/")

DEMO_EMAIL = "demo@amass.africa"
DEMO_PASSWORD = "amass2026"


@pytest.fixture(scope="session")
def base_url():
    return BASE_URL


@pytest.fixture(scope="session")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def demo_token(api_client):
    """Ensure demo user exists and return access token."""
    # Try login first
    r = api_client.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD},
    )
    if r.status_code == 200:
        return r.json()["access_token"]
    # Register
    r = api_client.post(
        f"{BASE_URL}/api/auth/register",
        json={
            "email": DEMO_EMAIL,
            "password": DEMO_PASSWORD,
            "full_name": "Ada Demo",
        },
    )
    assert r.status_code == 200, f"Failed to register demo user: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def auth_headers(demo_token):
    return {"Authorization": f"Bearer {demo_token}", "Content-Type": "application/json"}
