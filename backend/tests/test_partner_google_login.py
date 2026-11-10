"""AMASS Partner app — Google login bridge + email/password login regression (iteration 4)."""
import os
import pytest
import requests

BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")).rstrip("/")
GS = f"{BASE_URL}/api/auth/google-session"


@pytest.fixture(scope="module")
def s():
    x = requests.Session()
    x.headers.update({"Content-Type": "application/json"})
    return x


# Google session exchange: validation & invalid ids
class TestGoogleSession:
    def test_invalid_session_401(self, s):
        r = s.post(GS, json={"session_id": "fakeinvalid123"})
        assert r.status_code == 401, r.text
        assert "google" in r.json()["detail"].lower()

    def test_missing_session_422(self, s):
        assert s.post(GS, json={}).status_code == 422

    def test_short_session_422(self, s):
        assert s.post(GS, json={"session_id": "abc"}).status_code == 422

    def test_too_long_session_422(self, s):
        assert s.post(GS, json={"session_id": "x" * 600}).status_code == 422

    def test_non_string_session_422(self, s):
        assert s.post(GS, json={"session_id": None}).status_code == 422

    def test_get_not_allowed(self, s):
        assert s.get(GS).status_code == 405


# Email/password regression (user + brand)
class TestPasswordLogin:
    def test_agent_login_and_me(self, s):
        r = s.post(f"{BASE_URL}/api/auth/login", json={"email": "adaeze.okoye@amass.africa", "password": "Agent2026!"})
        assert r.status_code == 200, r.text
        tok = r.json()["access_token"]
        me = s.get(f"{BASE_URL}/api/partner/me", headers={"Authorization": f"Bearer {tok}"})
        assert me.status_code == 200
        assert me.json()["user"]["email"] == "adaeze.okoye@amass.africa"
        assert "agent" in me.json()["roles"]

    def test_agent_wrong_password_401(self, s):
        r = s.post(f"{BASE_URL}/api/auth/login", json={"email": "adaeze.okoye@amass.africa", "password": "WrongPass!1"})
        assert r.status_code == 401

    def test_brand_user_login_401_then_brand_login_200(self, s):
        r = s.post(f"{BASE_URL}/api/auth/login", json={"email": "brand.demo@amass.africa", "password": "Partner2026!"})
        assert r.status_code == 401, r.text
        b = s.post(f"{BASE_URL}/api/brand/auth/login", json={"email": "brand.demo@amass.africa", "password": "Partner2026!"})
        assert b.status_code == 200, b.text
        tok = b.json()["token"]
        me = s.get(f"{BASE_URL}/api/brand/me", headers={"Authorization": f"Bearer {tok}"})
        assert me.status_code == 200
        assert me.json()["account"]["email"] == "brand.demo@amass.africa"

    def test_brand_wrong_password_401(self, s):
        b = s.post(f"{BASE_URL}/api/brand/auth/login", json={"email": "brand.demo@amass.africa", "password": "nope12345"})
        assert b.status_code == 401
