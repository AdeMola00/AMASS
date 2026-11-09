"""AMASS Auth: forgot-password enumeration-safety, reset happy-path (via Mongo
code injection), reset invalid-code error, and brute-force login lockout.

Covers backend requirements of iteration review:
  • /api/auth/forgot-password is enumeration-safe (same 200+message for both known/unknown emails)
  • /api/auth/reset-password 400 'invalid or has expired' for wrong code
  • Full happy path: register throwaway → forgot → inject code_hash → reset → login
  • Login lockout: 6 wrong attempts → 7th returns 429 with wait message
  • Throwaway user + login_attempts/password_resets rows cleaned up afterwards
"""
import os
import time
import uuid
import hashlib
import asyncio

import pytest
import requests
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") if os.environ.get("EXPO_PUBLIC_BACKEND_URL") else None
if not BASE_URL:
    # fallback to frontend env file
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")
                break
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL not set"

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

GENERIC_MSG = (
    "If an account exists for that email, a reset code is on its way. "
    "Check your inbox (and spam) for a 6-digit code."
)


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def mongo():
    client = MongoClient(MONGO_URL)
    db = client[DB_NAME]
    yield db
    client.close()


def _unique_email() -> str:
    return f"test_amass_{uuid.uuid4().hex[:10]}@amasstest.io"


# ─── Enumeration safety ──────────────────────────────────────────
class TestForgotPasswordEnumerationSafety:
    def test_known_email_returns_generic_200(self, api):
        r = api.post(f"{BASE_URL}/api/auth/forgot-password", json={"email": "demo@amass.africa"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert body.get("message") == GENERIC_MSG

    def test_unknown_email_returns_identical_generic_200(self, api):
        r = api.post(f"{BASE_URL}/api/auth/forgot-password", json={"email": "noexist99@gmail.com"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert body.get("message") == GENERIC_MSG

    def test_bodies_identical(self, api):
        r1 = api.post(f"{BASE_URL}/api/auth/forgot-password", json={"email": "demo@amass.africa"})
        r2 = api.post(f"{BASE_URL}/api/auth/forgot-password", json={"email": "noexist99@gmail.com"})
        assert r1.json() == r2.json()


# ─── Reset invalid-code error ────────────────────────────────────
class TestResetPasswordInvalid:
    def test_wrong_code_returns_400(self, api):
        r = api.post(
            f"{BASE_URL}/api/auth/reset-password",
            json={"email": "demo@amass.africa", "code": "000000", "new_password": "doesnotmatter123"},
        )
        assert r.status_code == 400, r.text
        detail = r.json().get("detail", "").lower()
        assert "invalid" in detail or "expired" in detail


# ─── Full reset happy path via Mongo code injection ──────────────
class TestResetPasswordHappyPath:
    email = None
    password = "OrigPass123!"
    new_password = "NewPass456!"

    def test_register_throwaway(self, api, mongo):
        TestResetPasswordHappyPath.email = _unique_email()
        r = api.post(
            f"{BASE_URL}/api/auth/register",
            json={
                "email": self.email,
                "password": self.password,
                "full_name": "Reset Test User",
            },
        )
        assert r.status_code in (200, 201), r.text
        body = r.json()
        assert "token" in body or "access_token" in body or body.get("user")

    def test_forgot_then_inject_code_and_reset(self, api, mongo):
        # 1) forgot-password → creates password_resets row
        r = api.post(f"{BASE_URL}/api/auth/forgot-password", json={"email": self.email})
        assert r.status_code == 200
        assert r.json().get("message") == GENERIC_MSG

        # 2) inject known code hash into Mongo (sync pymongo)
        code = "123456"
        code_hash = hashlib.sha256(code.encode()).hexdigest()

        res = mongo.password_resets.update_one(
            {"email": self.email},
            {"$set": {"code_hash": code_hash, "attempts": 0}},
        )
        assert res.matched_count == 1, "password_resets row not found for throwaway email"

        # 3) reset-password with injected code
        r = api.post(
            f"{BASE_URL}/api/auth/reset-password",
            json={"email": self.email, "code": code, "new_password": self.new_password},
        )
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

    def test_login_with_new_password(self, api):
        r = api.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": self.email, "password": self.new_password},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        token = body.get("token") or body.get("access_token")
        assert token, body

    def test_cleanup_throwaway_user(self, mongo):
        mongo.users.delete_many({"email": self.email})
        mongo.password_resets.delete_many({"email": self.email})
        mongo.login_attempts.delete_many({"email": self.email})


# ─── Brute-force lockout (uses throwaway, NEVER demo) ────────────
class TestLoginLockout:
    email = None
    password = "GoodPass123!"

    def test_setup_throwaway(self, api, mongo):
        TestLoginLockout.email = _unique_email()
        r = api.post(
            f"{BASE_URL}/api/auth/register",
            json={"email": self.email, "password": self.password, "full_name": "Lockout Test"},
        )
        assert r.status_code in (200, 201), r.text

    def test_six_fails_then_lockout(self, api):
        for i in range(6):
            r = api.post(
                f"{BASE_URL}/api/auth/login",
                json={"email": self.email, "password": f"wrong-{i}"},
            )
            assert r.status_code in (400, 401), f"attempt {i}: {r.status_code} {r.text}"
        # 7th should be locked
        r = api.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": self.email, "password": f"wrong-7"},
        )
        assert r.status_code == 429, f"expected 429 lock, got {r.status_code}: {r.text}"
        detail = r.json().get("detail", "").lower()
        # expect a wait-time message
        assert any(k in detail for k in ("try again", "minute", "second", "wait", "locked")), detail

    def test_locked_rejects_correct_password_too(self, api):
        r = api.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": self.email, "password": self.password},
        )
        # Correct password should also be rejected while locked
        assert r.status_code == 429, f"expected 429 while locked, got {r.status_code}: {r.text}"

    def test_cleanup(self, mongo):
        mongo.users.delete_many({"email": self.email})
        mongo.password_resets.delete_many({"email": self.email})
        mongo.login_attempts.delete_many({"email": self.email})
