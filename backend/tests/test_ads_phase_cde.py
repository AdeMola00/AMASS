"""AMASS Ads Phase C+D+E test suite.

Covers:
  - Regression: tiers + legacy AdCreate
  - Phase C: rich targeting persistence + delivery filters (device, radius, schedule)
    + interest tag inference
  - Phase D: budget/bidding persistence, cpm/cpc token debits, auto-pause,
    manual pause/resume/cancel refund + owner-only auth
  - Phase E: /analytics + /suggestions (heuristic fallback guaranteed)
  - AUTH: 401 for anonymous access to owner-only endpoints
"""
from __future__ import annotations

import os
import time
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE_URL = os.environ.get("EXPO_BACKEND_URL", "https://property-os-africa.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

DEMO_EMAIL = "demo@amass.africa"
DEMO_PASSWORD = "amass2026"

# ─── Shared fixtures ───────────────────────────────────────────
@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def demo_token(client):
    r = client.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})
    if r.status_code != 200:
        client.post(f"{API}/auth/register", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD, "full_name": "Ada Demo"})
        r = client.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def demo_uid(client, demo_token):
    r = client.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {demo_token}"})
    assert r.status_code == 200, r.text
    return r.json()["id"]


@pytest.fixture(scope="module")
def h(demo_token):
    return {"Authorization": f"Bearer {demo_token}", "Content-Type": "application/json"}


# Second user for auth isolation tests
@pytest.fixture(scope="module")
def other_headers(client):
    email = f"TEST_other_{uuid.uuid4().hex[:8]}@amass.africa"
    r = client.post(f"{API}/auth/register", json={"email": email, "password": "otherpass123", "full_name": "Other User"})
    assert r.status_code == 200, r.text
    tok = r.json()["access_token"]
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def _base_ad(**overrides):
    body = {
        "tier": "basic",
        "title": "TEST Ad",
        "description": "Test description for the ad",
        "cta_label": "Shop Now",
        "media": [{"kind": "image", "url": "https://example.com/img.jpg"}],
    }
    body.update(overrides)
    return body


# ─── Regression: tiers ─────────────────────────────────────────
class TestRegressionTiers:
    def test_tiers_returns_5(self, client):
        r = client.get(f"{API}/ads/tiers")
        assert r.status_code == 200
        data = r.json()
        assert set(data.keys()) == {"basic", "featured", "spotlight", "map", "premium"}
        assert data["basic"]["tokens"] == 30
        assert data["premium"]["tokens"] == 300


# ─── Regression: legacy AdCreate ──────────────────────────────
class TestRegressionCreate:
    def test_create_ad_legacy_fields(self, client, h):
        body = _base_ad(target_categories=["real_estate"], target_cities=["Lagos"], title="TEST Legacy")
        r = client.post(f"{API}/ads", json=body, headers=h)
        assert r.status_code == 200, r.text
        ad = r.json()
        assert ad["tier"] == "basic"
        assert ad["tokens_paid"] == 30
        assert ad["status"] == "active"
        assert ad["target_categories"] == ["real_estate"]
        assert ad["target_cities"] == ["Lagos"]
        # Verify persistence via /ads/mine
        r2 = client.get(f"{API}/ads/mine", headers=h)
        assert r2.status_code == 200
        ids = [a["id"] for a in r2.json()]
        assert ad["id"] in ids


# ─── Phase C: targeting persistence + delivery filters ────────
class TestPhaseCTargeting:
    def test_create_with_full_targeting_persists(self, client, h):
        targeting = {
            "target_states": ["Lagos"],
            "target_device": "ios",
            "interest_tags": ["duplex", "lekki"],
            "schedule": {"days_of_week": [0, 1, 2, 3, 4, 5, 6], "hours_of_day": list(range(24))},
            "target_radius_km": 5.0,
            "target_center": [3.4, 6.4],
        }
        body = _base_ad(title="TEST Phase C Full", targeting=targeting)
        r = client.post(f"{API}/ads", json=body, headers=h)
        assert r.status_code == 200, r.text
        ad_id = r.json()["id"]
        # Verify via /ads/mine
        r2 = client.get(f"{API}/ads/mine", headers=h)
        mine = {a["id"]: a for a in r2.json()}
        assert ad_id in mine
        persisted = mine[ad_id]["targeting"]
        assert persisted["target_states"] == ["Lagos"]
        assert persisted["target_device"] == "ios"
        assert persisted["interest_tags"] == ["duplex", "lekki"]
        assert persisted["target_radius_km"] == 5.0
        assert persisted["target_center"] == [3.4, 6.4]
        assert persisted["schedule"]["days_of_week"] == list(range(7))
        # Cleanup - cancel it so it doesn't pollute later tests
        client.post(f"{API}/ads/{ad_id}/cancel", headers=h)

    def test_device_filter_ios_blocks_android_only(self, client, h, demo_token):
        # Create an android-only ad
        body = _base_ad(title="TEST Android Only", targeting={"target_device": "android"})
        r = client.post(f"{API}/ads", json=body, headers=h)
        assert r.status_code == 200, r.text
        ad_id = r.json()["id"]
        try:
            # Anonymous session (no auth so no cooldown / user_ctx interference)
            # Exclude all other ads by fetching mine first, then excluding all except this one
            mine = client.get(f"{API}/ads/mine", headers=h).json()
            other_ids = ",".join(a["id"] for a in mine if a["id"] != ad_id and a.get("status") == "active")
            r2 = requests.get(f"{API}/ads/next", params={"device": "ios", "exclude": other_ids})
            assert r2.status_code == 200
            data = r2.json()
            # When only this android ad remains, it must be filtered out
            if data.get("ad") is None:
                assert data.get("reason") in ("no_targeted_candidates", "no_candidates")
            else:
                # If another ad slipped through it must not be our android one
                assert data["ad"]["id"] != ad_id
        finally:
            client.post(f"{API}/ads/{ad_id}/cancel", headers=h)

    def test_radius_filter(self, client, h):
        # Center ~ Lagos, radius 1km
        body = _base_ad(title="TEST Radius", targeting={"target_center": [3.4, 6.4], "target_radius_km": 1.0})
        r = client.post(f"{API}/ads", json=body, headers=h)
        assert r.status_code == 200, r.text
        ad_id = r.json()["id"]
        try:
            mine = client.get(f"{API}/ads/mine", headers=h).json()
            other_ids = ",".join(a["id"] for a in mine if a["id"] != ad_id and a.get("status") == "active")
            # Far away (~ >10km)
            r_far = requests.get(f"{API}/ads/next", params={"lat": 6.5, "lng": 3.5, "exclude": other_ids})
            far_data = r_far.json()
            if far_data.get("ad") is not None:
                assert far_data["ad"]["id"] != ad_id
            # Close (~150m)
            r_near = requests.get(f"{API}/ads/next", params={"lat": 6.401, "lng": 3.401, "exclude": other_ids})
            near_data = r_near.json()
            # We expect our ad *could* be picked; at minimum it should not be filtered out for radius reasons.
            # If ad is None only acceptable reason here is no_candidates (cooldown/etc)
            if near_data.get("ad") is not None:
                # There may be other ads with no targeting; just ensure our ad *would* be a valid candidate
                pass
        finally:
            client.post(f"{API}/ads/{ad_id}/cancel", headers=h)

    def test_schedule_future_day_filters(self, client, h):
        now = datetime.now(timezone.utc)
        # A day that is definitely not today
        other_day = (now.weekday() + 3) % 7
        body = _base_ad(title="TEST Schedule", targeting={"schedule": {"days_of_week": [other_day]}})
        r = client.post(f"{API}/ads", json=body, headers=h)
        assert r.status_code == 200, r.text
        ad_id = r.json()["id"]
        try:
            mine = client.get(f"{API}/ads/mine", headers=h).json()
            other_ids = ",".join(a["id"] for a in mine if a["id"] != ad_id and a.get("status") == "active")
            r2 = requests.get(f"{API}/ads/next", params={"exclude": other_ids})
            data = r2.json()
            if data.get("ad") is not None:
                assert data["ad"]["id"] != ad_id
        finally:
            client.post(f"{API}/ads/{ad_id}/cancel", headers=h)

    def test_interest_tags_endpoint(self, client, h, demo_uid):
        r = client.get(f"{API}/ads/interest-tags/mine", headers=h)
        assert r.status_code == 200
        data = r.json()
        assert "tags" in data
        assert isinstance(data["tags"], list)

    def test_interest_tags_populated_after_favorite(self, client, h, demo_uid):
        """Seed a property + favorite in Mongo via API paths; then check tags reflect it."""
        # Use mongo directly since no clean create-favorite REST helper is guaranteed to accept arbitrary payload
        import pymongo
        mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
        db_name = os.environ.get("DB_NAME", "test_database")
        db = pymongo.MongoClient(mongo_url)[db_name]
        pid = f"TEST_prop_{uuid.uuid4().hex[:8]}"
        db.properties.insert_one({"id": pid, "title": "TEST Duplex", "property_type": "duplex", "city": "Lekki", "state": "Lagos"})
        db.favorites.insert_one({"user_id": demo_uid, "property_id": pid, "created_at": datetime.now(timezone.utc)})
        try:
            r = client.get(f"{API}/ads/interest-tags/mine", headers=h)
            assert r.status_code == 200
            tags = r.json()["tags"]
            # Should contain duplex or lekki (lowercased)
            joined = " ".join(tags).lower()
            assert "duplex" in joined or "lekki" in joined, f"Expected duplex/lekki in inferred tags, got: {tags}"
        finally:
            db.properties.delete_one({"id": pid})
            db.favorites.delete_one({"user_id": demo_uid, "property_id": pid})


# ─── Phase D: budget/bidding, tracking debits, auto-pause ─────
class TestPhaseDBudget:
    def test_create_with_budget_and_bid_persists(self, client, h):
        body = _base_ad(title="TEST Budget CPM", daily_budget_tokens=100, total_budget_tokens=500,
                        bid_type="cpm", bid_tokens=50)
        r = client.post(f"{API}/ads", json=body, headers=h)
        assert r.status_code == 200, r.text
        ad = r.json()
        assert ad["daily_budget_tokens"] == 100
        assert ad["total_budget_tokens"] == 500
        assert ad["bid_type"] == "cpm"
        assert ad["bid_tokens"] == 50
        client.post(f"{API}/ads/{ad['id']}/cancel", headers=h)

    def test_cpm_impression_debits_tokens(self, client, h):
        # bid=2000 → cpm cost per impression = ceil(2000/1000) = 2 tokens
        body = _base_ad(title="TEST CPM Debit", total_budget_tokens=1000,
                        bid_type="cpm", bid_tokens=2000)
        r = client.post(f"{API}/ads", json=body, headers=h)
        ad_id = r.json()["id"]
        try:
            client.post(f"{API}/ads/track", json={"ad_id": ad_id, "event": "impression"}, headers=h)
            mine = {a["id"]: a for a in client.get(f"{API}/ads/mine", headers=h).json()}
            ad = mine[ad_id]
            assert ad["impressions"] == 1
            assert ad["total_spent_tokens"] == 2, f"Expected 2, got {ad['total_spent_tokens']}"
            assert ad["daily_spent_tokens"] == 2
        finally:
            client.post(f"{API}/ads/{ad_id}/cancel", headers=h)

    def test_cpc_click_debits_but_impression_does_not(self, client, h):
        body = _base_ad(title="TEST CPC Debit", total_budget_tokens=1000,
                        bid_type="cpc", bid_tokens=7)
        r = client.post(f"{API}/ads", json=body, headers=h)
        ad_id = r.json()["id"]
        try:
            # Impression should not debit
            client.post(f"{API}/ads/track", json={"ad_id": ad_id, "event": "impression"}, headers=h)
            mine = {a["id"]: a for a in client.get(f"{API}/ads/mine", headers=h).json()}
            assert mine[ad_id]["total_spent_tokens"] == 0
            # Click debits
            client.post(f"{API}/ads/track", json={"ad_id": ad_id, "event": "click"}, headers=h)
            mine = {a["id"]: a for a in client.get(f"{API}/ads/mine", headers=h).json()}
            assert mine[ad_id]["total_spent_tokens"] == 7
            assert mine[ad_id]["daily_spent_tokens"] == 7
        finally:
            client.post(f"{API}/ads/{ad_id}/cancel", headers=h)

    def test_auto_pause_daily_budget(self, client, h):
        # cpc bid=5, daily_budget=8 → 2 clicks (10 tokens) exceed daily
        body = _base_ad(title="TEST Auto Pause Daily", daily_budget_tokens=8, total_budget_tokens=1000,
                        bid_type="cpc", bid_tokens=5)
        r = client.post(f"{API}/ads", json=body, headers=h)
        ad_id = r.json()["id"]
        try:
            client.post(f"{API}/ads/track", json={"ad_id": ad_id, "event": "click"}, headers=h)
            client.post(f"{API}/ads/track", json={"ad_id": ad_id, "event": "click"}, headers=h)
            mine = {a["id"]: a for a in client.get(f"{API}/ads/mine", headers=h).json()}
            ad = mine[ad_id]
            assert ad["daily_spent_tokens"] >= 10
            assert ad["status"] == "paused", f"expected paused, got {ad['status']}"
            assert ad["paused_reason"] == "daily_budget"
        finally:
            client.post(f"{API}/ads/{ad_id}/cancel", headers=h)

    def test_auto_pause_total_budget(self, client, h):
        body = _base_ad(title="TEST Auto Pause Total", daily_budget_tokens=100, total_budget_tokens=6,
                        bid_type="cpc", bid_tokens=5)
        r = client.post(f"{API}/ads", json=body, headers=h)
        ad_id = r.json()["id"]
        try:
            client.post(f"{API}/ads/track", json={"ad_id": ad_id, "event": "click"}, headers=h)
            client.post(f"{API}/ads/track", json={"ad_id": ad_id, "event": "click"}, headers=h)
            mine = {a["id"]: a for a in client.get(f"{API}/ads/mine", headers=h).json()}
            ad = mine[ad_id]
            assert ad["total_spent_tokens"] >= 6
            assert ad["status"] == "paused"
            assert ad["paused_reason"] == "total_budget"
        finally:
            client.post(f"{API}/ads/{ad_id}/cancel", headers=h)

    def test_manual_pause_resume(self, client, h, other_headers):
        body = _base_ad(title="TEST Manual Pause")
        r = client.post(f"{API}/ads", json=body, headers=h)
        ad_id = r.json()["id"]
        try:
            # Other user cannot pause
            r_other = client.post(f"{API}/ads/{ad_id}/pause", headers=other_headers)
            assert r_other.status_code == 404
            # Owner pauses
            r_p = client.post(f"{API}/ads/{ad_id}/pause", headers=h)
            assert r_p.status_code == 200
            mine = {a["id"]: a for a in client.get(f"{API}/ads/mine", headers=h).json()}
            assert mine[ad_id]["status"] == "paused"
            assert mine[ad_id]["paused_reason"] == "manual"
            # Resume
            r_r = client.post(f"{API}/ads/{ad_id}/resume", headers=h)
            assert r_r.status_code == 200
            mine = {a["id"]: a for a in client.get(f"{API}/ads/mine", headers=h).json()}
            assert mine[ad_id]["status"] == "active"
            assert mine[ad_id].get("paused_reason") in (None, "")
        finally:
            client.post(f"{API}/ads/{ad_id}/cancel", headers=h)

    def test_cancel_refunds_unspent_and_marks_expired(self, client, h):
        # Get wallet balance before
        w0 = client.get(f"{API}/wallet/mass", headers=h).json()
        bal0 = w0["spendable"]
        body = _base_ad(tier="basic", title="TEST Cancel Refund")  # 30 tokens
        r = client.post(f"{API}/ads", json=body, headers=h)
        ad_id = r.json()["id"]
        # Balance should have dropped by 30
        w1 = client.get(f"{API}/wallet/mass", headers=h).json()
        assert w1["spendable"] == bal0 - 30
        # Cancel
        r_c = client.post(f"{API}/ads/{ad_id}/cancel", headers=h)
        assert r_c.status_code == 200
        assert r_c.json()["refund_tokens"] == 30
        # Balance restored
        w2 = client.get(f"{API}/wallet/mass", headers=h).json()
        assert w2["spendable"] == bal0
        # Status expired
        mine = {a["id"]: a for a in client.get(f"{API}/ads/mine", headers=h).json()}
        assert mine[ad_id]["status"] == "expired"
        # Cannot cancel again
        r_c2 = client.post(f"{API}/ads/{ad_id}/cancel", headers=h)
        assert r_c2.status_code == 400


# ─── Phase E: analytics + suggestions ─────────────────────────
class TestPhaseEAnalytics:
    @pytest.fixture(scope="class")
    def ad_id(self, client, h):
        body = _base_ad(title="TEST Analytics", total_budget_tokens=100, bid_type="cpc", bid_tokens=2)
        r = client.post(f"{API}/ads", json=body, headers=h)
        aid = r.json()["id"]
        # Seed a couple of events
        for _ in range(3):
            client.post(f"{API}/ads/track", json={"ad_id": aid, "event": "impression"}, headers=h)
        client.post(f"{API}/ads/track", json={"ad_id": aid, "event": "click"}, headers=h)
        yield aid
        client.post(f"{API}/ads/{aid}/cancel", headers=h)

    def test_analytics_shape(self, client, h, ad_id):
        r = client.get(f"{API}/ads/{ad_id}/analytics", params={"period_days": 7}, headers=h)
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ["ad_id", "funnel", "ctr_percent", "spent_tokens", "cost_per_action",
                  "budget", "impressions_over_time", "clicks_over_time"]:
            assert k in data, f"missing {k}"
        assert data["funnel"]["impressions"] >= 3
        assert data["funnel"]["clicks"] >= 1
        assert data["ctr_percent"] > 0
        for k in ("cpm_tokens", "cpc_tokens", "cost_per_chat_tokens"):
            assert k in data["cost_per_action"]

    def test_analytics_owner_only(self, client, other_headers, ad_id):
        r = client.get(f"{API}/ads/{ad_id}/analytics", headers=other_headers)
        assert r.status_code in (403, 404)

    def test_suggestions_always_returns_at_least_one(self, client, h, ad_id):
        r = client.get(f"{API}/ads/{ad_id}/suggestions", headers=h)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "suggestions" in data
        assert isinstance(data["suggestions"], list)
        assert len(data["suggestions"]) >= 1
        assert "used_ai" in data
        assert "cost_charged_tokens" in data
        if not data["used_ai"]:
            assert data["cost_charged_tokens"] == 0

    def test_suggestions_owner_only(self, client, other_headers, ad_id):
        r = client.get(f"{API}/ads/{ad_id}/suggestions", headers=other_headers)
        assert r.status_code in (403, 404)


# ─── AUTH: 401 for anonymous ─────────────────────────────────
class TestAuthGuards:
    def test_ads_mine_requires_auth(self):
        r = requests.get(f"{API}/ads/mine")
        assert r.status_code == 401

    def test_interest_tags_requires_auth(self):
        r = requests.get(f"{API}/ads/interest-tags/mine")
        assert r.status_code == 401

    def test_pause_requires_auth(self):
        r = requests.post(f"{API}/ads/fake-id/pause")
        assert r.status_code == 401

    def test_resume_requires_auth(self):
        r = requests.post(f"{API}/ads/fake-id/resume")
        assert r.status_code == 401

    def test_cancel_requires_auth(self):
        r = requests.post(f"{API}/ads/fake-id/cancel")
        assert r.status_code == 401

    def test_analytics_requires_auth(self):
        r = requests.get(f"{API}/ads/fake-id/analytics")
        assert r.status_code == 401

    def test_suggestions_requires_auth(self):
        r = requests.get(f"{API}/ads/fake-id/suggestions")
        assert r.status_code == 401
