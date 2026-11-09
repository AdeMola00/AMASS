"""
Jan 2026 — Admin Neighbours review backend verification.
Focused regression against the review brief items:
  - /admin/cockpit/dashboard includes pending_estates + open_social_reports (ints)
  - /seed dry_run safe (auth gated, does not change db.properties count)
  - /agent/properties/mine returns newest-first
  - Admin social endpoints auth-gated: 401 unauth / 403 non-admin
    (funnel, community/admin/estates, estate review, social/admin/reports, resolve)
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("TEST_BASE_URL", "http://localhost:8001/api").rstrip("/")

ADMIN_EMAIL = "demo@amass.africa"
ADMIN_PASSWORD = "amass2026"


@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_token(api_client):
    r = api_client.post(f"{BASE_URL}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    body = r.json()
    return body.get("access_token") or body.get("token")


@pytest.fixture(scope="module")
def user_token(api_client):
    email = f"TEST_review_{uuid.uuid4().hex[:8]}@amass.africa"
    r = api_client.post(f"{BASE_URL}/auth/register", json={
        "email": email, "password": "Testing123!", "full_name": "Review User"
    })
    assert r.status_code in (200, 201), r.text
    body = r.json()
    return body.get("access_token") or body.get("token")


def h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# --- 1. Admin cockpit dashboard new fields -----------------------------------
class TestCockpitDashboard:
    def test_dashboard_includes_social_fields(self, api_client, admin_token):
        r = api_client.get(f"{BASE_URL}/admin/cockpit/dashboard", headers=h(admin_token))
        assert r.status_code == 200, r.text
        body = r.json()
        assert "pending_estates" in body, body.keys()
        assert "open_social_reports" in body, body.keys()
        assert isinstance(body["pending_estates"], int)
        assert isinstance(body["open_social_reports"], int)
        assert body["pending_estates"] >= 0
        assert body["open_social_reports"] >= 0

    def test_dashboard_unauth(self, api_client):
        r = api_client.get(f"{BASE_URL}/admin/cockpit/dashboard")
        assert r.status_code in (401, 403)

    def test_dashboard_non_admin_forbidden(self, api_client, user_token):
        r = api_client.get(f"{BASE_URL}/admin/cockpit/dashboard", headers=h(user_token))
        assert r.status_code == 403


# --- 2. /seed dry_run safety -------------------------------------------------
class TestSeedDryRun:
    def test_seed_unauth_401(self, api_client):
        r = api_client.post(f"{BASE_URL}/seed?dry_run=true")
        assert r.status_code in (401, 403)

    def test_seed_non_admin_403(self, api_client, user_token):
        r = api_client.post(f"{BASE_URL}/seed?dry_run=true", headers=h(user_token))
        assert r.status_code == 403

    def test_seed_dry_run_does_not_wipe(self, api_client, admin_token):
        # Snapshot /properties count via admin DB count route if available, else via list
        def _count():
            rr = api_client.get(f"{BASE_URL}/properties?limit=200")
            if rr.status_code != 200:
                return None
            b = rr.json()
            if isinstance(b, dict):
                return b.get("total") if "total" in b else len(b.get("items", []))
            return len(b) if isinstance(b, list) else None

        total_before = _count()
        assert total_before is not None and total_before > 0

        r = api_client.post(f"{BASE_URL}/seed?dry_run=true", headers=h(admin_token))
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("dry_run") is True

        total_after = _count()
        assert total_after == total_before, f"properties count changed {total_before} -> {total_after}"


# --- 3. /agent/properties/mine newest-first ---------------------------------
class TestAgentPropertiesMine:
    def test_mine_sorted_newest_first(self, api_client, admin_token):
        r = api_client.get(f"{BASE_URL}/agent/properties/mine", headers=h(admin_token))
        assert r.status_code == 200, r.text
        items = r.json()
        # Accept either a list or {items: [...]}
        if isinstance(items, dict):
            items = items.get("items") or items.get("data") or []
        assert isinstance(items, list)
        if len(items) >= 2:
            # Extract created_at from each
            dates = [it.get("created_at") or it.get("createdAt") for it in items]
            # Only compare if dates present
            dates_present = [d for d in dates if d]
            if len(dates_present) >= 2:
                assert dates_present == sorted(dates_present, reverse=True), \
                    f"Not newest-first: {dates_present[:5]}"


# --- 4. Admin analytics funnel shape + auth gating ---------------------------
class TestAdminFunnel:
    def test_unauth_401(self, api_client):
        r = api_client.get(f"{BASE_URL}/admin/analytics/funnel?days=30")
        assert r.status_code in (401, 403)

    def test_non_admin_403(self, api_client, user_token):
        r = api_client.get(f"{BASE_URL}/admin/analytics/funnel?days=30", headers=h(user_token))
        assert r.status_code == 403

    def test_funnel_shape(self, api_client, admin_token):
        r = api_client.get(f"{BASE_URL}/admin/analytics/funnel?days=30", headers=h(admin_token))
        assert r.status_code == 200, r.text
        body = r.json()
        for key in ("current", "previous", "attribution", "signin", "social", "moderation"):
            assert key in body, f"missing {key}: keys={list(body.keys())}"
        # Attribution has the 7 vias
        for v in ("friend", "collection", "estate", "recommendation", "share", "search", "direct"):
            assert v in body["attribution"], f"missing attribution.{v}"
            assert "payments_completed" in body["attribution"][v]
            assert "paid_action_starts" in body["attribution"][v]


# --- 5. Community admin estates + review ------------------------------------
class TestCommunityAdminEstates:
    def test_pending_list_unauth(self, api_client):
        r = api_client.get(f"{BASE_URL}/community/admin/estates?status=pending")
        assert r.status_code in (401, 403)

    def test_pending_list_non_admin(self, api_client, user_token):
        r = api_client.get(f"{BASE_URL}/community/admin/estates?status=pending", headers=h(user_token))
        assert r.status_code == 403

    def test_pending_list_admin_ok(self, api_client, admin_token):
        r = api_client.get(f"{BASE_URL}/community/admin/estates?status=pending", headers=h(admin_token))
        assert r.status_code == 200, r.text
        body = r.json()
        assert "items" in body
        assert isinstance(body["items"], list)

    def test_review_unauth(self, api_client):
        r = api_client.post(f"{BASE_URL}/community/admin/estates/fake-id/review?action=approve")
        assert r.status_code in (401, 403)

    def test_review_non_admin(self, api_client, user_token):
        r = api_client.post(f"{BASE_URL}/community/admin/estates/fake-id/review?action=approve", headers=h(user_token))
        assert r.status_code == 403


# --- 6. Social admin reports + resolve --------------------------------------
class TestSocialAdminReports:
    def test_reports_unauth(self, api_client):
        r = api_client.get(f"{BASE_URL}/social/admin/reports?status=OPEN")
        assert r.status_code in (401, 403)

    def test_reports_non_admin(self, api_client, user_token):
        r = api_client.get(f"{BASE_URL}/social/admin/reports?status=OPEN", headers=h(user_token))
        assert r.status_code == 403

    def test_reports_admin_ok(self, api_client, admin_token):
        r = api_client.get(f"{BASE_URL}/social/admin/reports?status=OPEN", headers=h(admin_token))
        assert r.status_code == 200, r.text
        body = r.json()
        assert "items" in body
        assert "open_total" in body
        assert isinstance(body["items"], list)
        assert isinstance(body["open_total"], int)

    def test_resolve_unauth(self, api_client):
        r = api_client.post(f"{BASE_URL}/social/admin/reports/fake-id/resolve?action=dismiss")
        assert r.status_code in (401, 403)

    def test_resolve_non_admin(self, api_client, user_token):
        r = api_client.post(f"{BASE_URL}/social/admin/reports/fake-id/resolve?action=dismiss", headers=h(user_token))
        assert r.status_code == 403


# --- 7. End-to-end estate approve flow (safe: creates then approves) --------
class TestEstateApproveFlow:
    def test_create_and_approve_estate(self, api_client, admin_token):
        # Register a fresh user (proposer)
        email = f"TEST_proposer_{uuid.uuid4().hex[:8]}@amass.africa"
        r = api_client.post(f"{BASE_URL}/auth/register", json={
            "email": email, "password": "Testing123!", "full_name": "Estate Proposer"
        })
        assert r.status_code in (200, 201), r.text
        proposer_token = r.json().get("access_token") or r.json().get("token")

        # Propose estate
        payload = {
            "name": f"TEST_Estate_{uuid.uuid4().hex[:6]}",
            "city": "Lagos",
            "state": "Lagos",
            "area": "Ikoyi",
            "description": "A quiet residential enclave for testing admin approval.",
            "i_am_manager": True,
            "latitude": 6.43,
            "longitude": 3.44,
        }
        r = api_client.post(f"{BASE_URL}/community/estates/request", json=payload, headers=h(proposer_token))
        assert r.status_code in (200, 201), r.text
        estate = r.json()
        estate_id = estate.get("id") or estate.get("_id") or estate.get("estate_id")
        assert estate_id, estate

        # Verify shows in admin pending list
        r = api_client.get(f"{BASE_URL}/community/admin/estates?status=pending", headers=h(admin_token))
        assert r.status_code == 200
        ids = [e.get("id") for e in r.json()["items"]]
        assert estate_id in ids, f"created estate not in pending: {ids[:5]}"

        # Approve
        r = api_client.post(
            f"{BASE_URL}/community/admin/estates/{estate_id}/review?action=approve",
            headers=h(admin_token),
        )
        assert r.status_code == 200, r.text

        # Verify now in active list via public estates
        r = api_client.get(f"{BASE_URL}/community/estates", headers=h(proposer_token))
        assert r.status_code == 200
        bodies = r.json()
        items = bodies.get("items") if isinstance(bodies, dict) else bodies
        if isinstance(items, list):
            active_ids = [e.get("id") for e in items]
            # Not strict — public lookup may be gated. Just report, don't fail.
            if estate_id not in active_ids:
                # Also check admin active list
                r2 = api_client.get(f"{BASE_URL}/community/admin/estates?status=active", headers=h(admin_token))
                assert r2.status_code == 200
                admin_active = [e.get("id") for e in r2.json()["items"]]
                assert estate_id in admin_active, f"approved estate missing from active lists"
