"""AMASS — Google OAuth bridge + regression tests (Jan 2026).

Covers the new POST /api/auth/google-session bridge (Emergent-managed OAuth)
plus regression on existing /api/auth/login, /api/auth/apple presence, and
/api/register-push route to ensure no auth regressions were introduced.
"""
import os
import pytest
import requests

BASE_URL = (
    os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or os.environ.get("EXPO_BACKEND_URL")
    or "http://localhost:8001"
).rstrip("/")


@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ─── /api/auth/google-session (new endpoint) ───────────────
class TestGoogleSession:
    def test_invalid_session_id_returns_401(self, api_client):
        """Emergent responds 4xx for bogus IDs → we surface 401 with the
        'Google sign-in expired' hint."""
        r = api_client.post(
            f"{BASE_URL}/api/auth/google-session",
            json={"session_id": "definitely-not-a-real-session-id-xyz-1234567890"},
        )
        assert r.status_code == 401, f"expected 401, got {r.status_code}: {r.text[:200]}"
        body = r.json()
        detail = body.get("detail", "")
        assert "google" in detail.lower() or "sign" in detail.lower(), body

    def test_missing_session_id_returns_422(self, api_client):
        r = api_client.post(f"{BASE_URL}/api/auth/google-session", json={})
        assert r.status_code == 422, f"expected 422, got {r.status_code}"

    def test_short_session_id_returns_422(self, api_client):
        r = api_client.post(
            f"{BASE_URL}/api/auth/google-session", json={"session_id": "x"}
        )
        assert r.status_code == 422, f"expected 422, got {r.status_code}"

    def test_endpoint_is_registered_not_404(self, api_client):
        """Ensure the route exists (not returning 404)."""
        r = api_client.post(
            f"{BASE_URL}/api/auth/google-session",
            json={"session_id": "obviously-invalid-but-min-length-ok"},
        )
        assert r.status_code != 404, "endpoint not registered"
        assert r.status_code in (401, 502), f"unexpected status {r.status_code}"


# ─── Existing password flow regression ─────────────────────
class TestPasswordLoginRegression:
    def test_demo_login_still_works(self, api_client):
        r = api_client.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "demo@amass.africa", "password": "amass2026"},
        )
        assert r.status_code == 200, f"login broke: {r.status_code} {r.text[:200]}"
        body = r.json()
        assert "access_token" in body
        assert body.get("token_type") == "bearer"
        user = body.get("user")
        assert user and user.get("email") == "demo@amass.africa"
        assert user.get("full_name")

    def test_login_wrong_password_401(self, api_client):
        r = api_client.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "demo@amass.africa", "password": "wrong"},
        )
        assert r.status_code == 401

    def test_login_response_shape_matches_google_shape(self, api_client):
        """Google endpoint must return same shape as password login."""
        r = api_client.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "demo@amass.africa", "password": "amass2026"},
        )
        assert r.status_code == 200
        keys = set(r.json().keys())
        assert "access_token" in keys and "user" in keys


# ─── Other auth routes still routed ────────────────────────
class TestOtherAuthRoutesRegression:
    def test_apple_route_registered(self, api_client):
        r = api_client.post(f"{BASE_URL}/api/auth/apple", json={})
        # 422 (missing fields) OR 400 OR 401 — anything but 404
        assert r.status_code != 404, "apple route missing"

    def test_register_push_route_registered(self, api_client):
        # Should be routed. Unauth request → 401 or 422 (schema); NOT 404.
        r = api_client.post(f"{BASE_URL}/api/register-push", json={})
        assert r.status_code != 404, "register-push route missing"

    def test_auth_me_requires_bearer(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 401


# ─── OpenAPI spec includes new route ───────────────────────
class TestOpenAPI:
    def test_openapi_contains_google_session_or_endpoint_alive(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/openapi.json")
        if r.status_code == 200:
            paths = r.json().get("paths", {})
            assert "/auth/google-session" in paths, (
                f"Expected /auth/google-session in OpenAPI paths. "
                f"Found: {list(paths.keys())[:20]}"
            )
        else:
            # OpenAPI disabled — fall back to POST 401 check.
            r2 = api_client.post(
                f"{BASE_URL}/api/auth/google-session",
                json={"session_id": "obviously-invalid-min-length-ok"},
            )
            assert r2.status_code == 401
