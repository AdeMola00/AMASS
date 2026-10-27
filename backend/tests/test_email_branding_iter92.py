# Iteration 92 — branded emails: public logo assets, admin previews, guardrail, real send smoke
import os
import re
import sys

import pytest
import requests

BASE_URL = os.environ["EMAIL_TEST_BASE_URL"].rstrip("/") if os.environ.get("EMAIL_TEST_BASE_URL") else os.environ["EXPO_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"
KINDS = ["reset", "receipt", "unlock", "viewing", "viewing-confirmed", "home", "digest", "agency"]
EXPECTED_SUBJECTS = {"unlock": "Your AMASS receipt", "receipt": "Your AMASS receipt", "digest": "3 new updates on AMASS today"}

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": "demo@amass.africa", "password": "amass2026"}, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"admin login failed {r.status_code}")
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def agent_token():
    r = requests.post(f"{API}/auth/login", json={"email": "adaeze.okoye@amass.africa", "password": "Agent2026!"}, timeout=30)
    if r.status_code != 200:
        pytest.skip("agent login failed")
    return r.json()["access_token"], r.json()["user"]


# Public logo assets (no auth)
class TestEmailAssets:
    @pytest.mark.parametrize("name", ["amass-logo.png", "fixa-logo.png", "amass-wordmark.png"])
    def test_asset_ok(self, name):
        r = requests.get(f"{API}/email-assets/{name}", timeout=30)
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("image/png")
        # preview edge (Cloudflare) rewrites Cache-Control to no-store; check the app's own header on the upstream
        direct = requests.get(f"http://localhost:8001/api/email-assets/{name}", timeout=10)
        assert "public" in direct.headers.get("cache-control", "")
        assert r.content[:8] == b"\x89PNG\r\n\x1a\n"

    def test_asset_unknown_404(self):
        assert requests.get(f"{API}/email-assets/evil.png", timeout=30).status_code == 404

    def test_asset_traversal_404(self):
        r = requests.get(f"{API}/email-assets/..%2F..%2Fserver.py", timeout=30)
        assert r.status_code == 404


# Admin preview list + per-kind HTML
class TestEmailPreviews:
    def test_list_requires_auth(self):
        assert requests.get(f"{API}/admin/email-previews", timeout=30).status_code in (401, 403)

    def test_list_non_admin_forbidden(self, agent_token):
        tok, user = agent_token
        if user.get("is_admin"):
            pytest.skip("agent is admin")
        r = requests.get(f"{API}/admin/email-previews", headers={"Authorization": f"Bearer {tok}"}, timeout=30)
        assert r.status_code == 403

    def test_list_admin(self, admin_token):
        r = requests.get(f"{API}/admin/email-previews", headers={"Authorization": f"Bearer {admin_token}"}, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["kinds"] == KINDS
        assert isinstance(d["heroes"], dict) and len(d["heroes"]) >= 8
        assert all(v.startswith("https://images.unsplash.com/photo-") for v in d["heroes"].values())
        assert d["logo"].startswith("https://") and d["logo"].endswith("/api/email-assets/amass-logo.png")

    @pytest.mark.parametrize("kind", KINDS)
    def test_preview_html(self, admin_token, kind):
        from auth_security import _assert_safe_email

        r = requests.get(f"{API}/admin/email-previews/{kind}", headers={"Authorization": f"Bearer {admin_token}"}, timeout=30)
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("text/html")
        subject = r.headers.get("x-email-subject")
        assert subject
        html = r.text
        srcs = re.findall(r'<img[^>]+src="([^"]+)"', html)
        assert any(s.startswith("https://") and s.endswith("/api/email-assets/amass-logo.png") for s in srcs), srcs
        assert any(s.startswith("https://") and s.endswith("/api/email-assets/fixa-logo.png") for s in srcs), srcs
        assert any(s.startswith("https://images.unsplash.com/photo-") for s in srcs), srcs
        _assert_safe_email(subject, html)  # raises on forms / non-https
        if kind in EXPECTED_SUBJECTS:
            assert subject == EXPECTED_SUBJECTS[kind]

    @pytest.mark.parametrize("kind", ["unlock", "digest", "reset"])
    def test_preview_json(self, admin_token, kind):
        r = requests.get(f"{API}/admin/email-previews/{kind}?format=json", headers={"Authorization": f"Bearer {admin_token}"}, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["kind"] == kind and d["subject"] and "<html" in d["html"]

    def test_preview_unknown_404(self, admin_token):
        r = requests.get(f"{API}/admin/email-previews/nope", headers={"Authorization": f"Bearer {admin_token}"}, timeout=30)
        assert r.status_code == 404

    def test_preview_kind_requires_auth(self):
        assert requests.get(f"{API}/admin/email-previews/reset", timeout=30).status_code in (401, 403)


# Real send smoke (max 2 real sends)
class TestRealSends:
    def test_forgot_password_delivered(self):
        r = requests.post(f"{API}/auth/forgot-password", json={"email": "delivered@resend.dev"}, timeout=60)
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

    def test_digest_test_send(self):
        creds = {"email": "delivered@resend.dev", "password": "Digest2026!"}
        r = requests.post(f"{API}/auth/login", json=creds, timeout=30)
        if r.status_code != 200:
            r = requests.post(f"{API}/auth/register", json={**creds, "full_name": "TEST Digest"}, timeout=30)
        assert r.status_code in (200, 201), r.text
        tok = r.json()["access_token"]
        s = requests.post(f"{API}/notifications/email/test", headers={"Authorization": f"Bearer {tok}"}, timeout=60)
        assert s.status_code == 200, s.text
