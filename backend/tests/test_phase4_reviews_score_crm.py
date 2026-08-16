"""Phase 4 backend tests — Reviews · Agent Score · Analytics · Lead CRM.

Exercises /app/backend/reviews_score_crm.py end-to-end via the public preview URL,
plus regression sweep for prior AMASS phases.
"""
from __future__ import annotations

import os
import time
import uuid
from datetime import datetime, timezone

import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get(
    "EXPO_BACKEND_URL",
    "https://property-os-africa.preview.emergentagent.com",
).rstrip("/")
DEMO_EMAIL = "demo@amass.africa"
DEMO_PASSWORD = "amass2026"
DEMO_SLUG = "ada-demo-a8d30c"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "amass_db")


# ─── Helpers ─────────────────────────────────────────────
def _register(email: str, password: str = "test1234", name: str | None = None):
    r = requests.post(
        f"{BASE_URL}/api/auth/register",
        json={"email": email, "password": password, "full_name": name or email.split("@")[0]},
        timeout=30,
    )
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    return r.json()


def _login(email: str, password: str):
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": email, "password": password},
        timeout=30,
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()


def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ─── Session fixtures ────────────────────────────────────
@pytest.fixture(scope="session")
def mongo():
    client = MongoClient(MONGO_URL)
    return client[DB_NAME]


@pytest.fixture(scope="session")
def demo():
    data = _login(DEMO_EMAIL, DEMO_PASSWORD)
    token = data["access_token"]
    me = requests.get(f"{BASE_URL}/api/auth/me", headers=_headers(token), timeout=30).json()
    return {"token": token, "id": me["id"], "me": me}


@pytest.fixture(scope="session")
def reviewer(mongo):
    ts = int(time.time())
    email = f"reviewer1_{ts}@example.com"
    r = _register(email, "test1234", "Reviewer One")
    return {"token": r["access_token"], "id": r["user"]["id"], "email": email}


# ─── 1. Reviews — anti-spam guardrail ────────────────────
class TestReviewsGuardrail:
    def test_guardrail_blocks_first_attempt(self, demo, reviewer):
        r = requests.post(
            f"{BASE_URL}/api/reviews/agent/{demo['id']}",
            json={"rating": 5, "review_text": "Great agent"},
            headers=_headers(reviewer["token"]),
            timeout=30,
        )
        assert r.status_code == 403, r.text
        assert "unlocked" in r.text.lower() or "inspected" in r.text.lower() or "shared" in r.text.lower()

    def test_self_review_blocked(self, demo):
        r = requests.post(
            f"{BASE_URL}/api/reviews/agent/{demo['id']}",
            json={"rating": 4},
            headers=_headers(demo["token"]),
            timeout=30,
        )
        # demo is admin -> guardrail bypassed but self-check should still block
        assert r.status_code == 400, r.text

    def test_after_lead_unlock_seed_review_accepted(self, demo, reviewer, mongo):
        mongo.lead_unlocks.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": reviewer["id"],
            "agent_id": demo["id"],
            "property_id": None,
            "created_at": datetime.now(timezone.utc),
        })
        r = requests.post(
            f"{BASE_URL}/api/reviews/agent/{demo['id']}",
            json={"rating": 5, "review_text": "Amazing service"},
            headers=_headers(reviewer["token"]),
            timeout=30,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "pending"
        assert body["rating"] == 5
        # persist for later tests
        pytest.review_id = body["id"]

    def test_reposting_upserts_single_row(self, demo, reviewer, mongo):
        # Post again — should update, not duplicate
        r = requests.post(
            f"{BASE_URL}/api/reviews/agent/{demo['id']}",
            json={"rating": 4, "review_text": "Updated my review"},
            headers=_headers(reviewer["token"]),
            timeout=30,
        )
        assert r.status_code == 200, r.text
        assert r.json()["id"] == pytest.review_id
        n = mongo.agent_reviews.count_documents(
            {"reviewer_id": reviewer["id"], "agent_id": demo["id"]}
        )
        assert n == 1


# ─── 2. Reviews — moderation & publication ───────────────
class TestReviewModeration:
    def test_pending_not_public(self):
        r = requests.get(f"{BASE_URL}/api/reviews/agent/{DEMO_SLUG}", timeout=30)
        assert r.status_code == 200
        # rating from earlier iteration may still be present in the list from previous runs
        # but our new review (pending) should not be in it
        ids = [x["id"] for x in r.json()]
        assert getattr(pytest, "review_id", None) not in ids

    def test_approve_moderation(self, demo):
        r = requests.post(
            f"{BASE_URL}/api/admin/reviews/{pytest.review_id}/moderate",
            json={"action": "approve"},
            headers=_headers(demo["token"]),
            timeout=30,
        )
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "approved"

    def test_public_list_shows_approved(self):
        r = requests.get(f"{BASE_URL}/api/reviews/agent/{DEMO_SLUG}", timeout=30)
        assert r.status_code == 200
        ids = [x["id"] for x in r.json()]
        assert pytest.review_id in ids
        found = [x for x in r.json() if x["id"] == pytest.review_id][0]
        assert found["status"] == "approved"

    def test_rating_recomputed_on_public_profile(self):
        r = requests.get(f"{BASE_URL}/api/agent-platform/public/{DEMO_SLUG}", timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        # rating may be nested under agent key; try common shapes
        rating = body.get("rating") or (body.get("agent") or {}).get("rating")
        reviews_count = body.get("reviews_count") or (body.get("agent") or {}).get("reviews_count")
        assert rating and rating > 0, f"rating not > 0 in {body}"
        assert reviews_count and reviews_count >= 1, f"reviews_count not >=1 in {body}"

    def test_reject_removes_from_public_list(self, demo):
        r = requests.post(
            f"{BASE_URL}/api/admin/reviews/{pytest.review_id}/moderate",
            json={"action": "reject"},
            headers=_headers(demo["token"]),
            timeout=30,
        )
        assert r.status_code == 200
        r2 = requests.get(f"{BASE_URL}/api/reviews/agent/{DEMO_SLUG}", timeout=30)
        ids = [x["id"] for x in r2.json()]
        assert pytest.review_id not in ids


# ─── 3. Reviews — reporting → auto-flag ──────────────────
class TestReviewReports:
    def test_reapprove_then_two_reports_auto_flag(self, demo, mongo):
        # Re-approve first
        rr = requests.post(
            f"{BASE_URL}/api/admin/reviews/{pytest.review_id}/moderate",
            json={"action": "approve"},
            headers=_headers(demo["token"]),
            timeout=30,
        )
        assert rr.status_code == 200

        # Register 2 fresh users
        ts = int(time.time())
        u1 = _register(f"reporter1_{ts}@example.com")
        u2 = _register(f"reporter2_{ts}@example.com")
        for t in (u1["access_token"], u2["access_token"]):
            r = requests.post(
                f"{BASE_URL}/api/reviews/{pytest.review_id}/report",
                json={"reason": "spam"},
                headers=_headers(t),
                timeout=30,
            )
            assert r.status_code == 200, r.text

        # After 2nd report → flagged
        doc = mongo.agent_reviews.find_one({"id": pytest.review_id})
        assert doc["status"] == "flagged", f"expected flagged, got {doc.get('status')}"

    def test_flagged_review_hidden_from_public(self):
        r = requests.get(f"{BASE_URL}/api/reviews/agent/{DEMO_SLUG}", timeout=30)
        assert r.status_code == 200
        ids = [x["id"] for x in r.json()]
        assert pytest.review_id not in ids


# ─── 4. Agent Score ──────────────────────────────────────
EXPECTED_WEIGHTS = {
    "profile_completeness": 15,
    "listing_quality": 25,
    "response_rate": 20,
    "customer_rating": 20,
    "activity": 10,
    "deals_closed": 10,
}


class TestAgentScore:
    def test_my_score_shape(self, demo):
        r = requests.get(f"{BASE_URL}/api/agent/score", headers=_headers(demo["token"]), timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert 0 <= body["score"] <= 100
        assert body["tier"] in ("Top Agent", "Trusted Agent", "Verified Agent", "Registered Agent")
        assert len(body["factors"]) == 6
        weights = {f["id"]: f["weight"] for f in body["factors"]}
        assert weights == EXPECTED_WEIGHTS, weights
        total_w = sum(f["weight"] for f in body["factors"])
        assert total_w == 100
        for f in body["factors"]:
            assert set(f.keys()) >= {"id", "label", "value", "weight", "weighted", "hint"}
        # sum(weighted) ≈ score ±1
        s = sum(f["weighted"] for f in body["factors"])
        assert abs(s - body["score"]) <= 1

    def test_tier_mapping(self, demo):
        r = requests.get(f"{BASE_URL}/api/agent/score", headers=_headers(demo["token"]), timeout=30)
        body = r.json()
        score = body["score"]
        tier = body["tier"]
        expected = (
            "Top Agent" if score >= 85
            else "Trusted Agent" if score >= 70
            else "Verified Agent" if score >= 50
            else "Registered Agent"
        )
        assert tier == expected

    def test_public_score_by_slug(self):
        r = requests.get(f"{BASE_URL}/api/agent/{DEMO_SLUG}/score", timeout=30)
        assert r.status_code == 200, r.text
        assert 0 <= r.json()["score"] <= 100

    def test_non_agent_score_404(self):
        ts = int(time.time())
        u = _register(f"nonagent_{ts}@example.com")
        r = requests.get(f"{BASE_URL}/api/agent/score", headers=_headers(u["access_token"]), timeout=30)
        assert r.status_code == 404, r.text
        assert "have not applied" in r.text.lower() or "agent" in r.text.lower()


# ─── 5. Analytics ────────────────────────────────────────
class TestAnalytics:
    def test_default_30d(self, demo):
        r = requests.get(f"{BASE_URL}/api/agent/analytics", headers=_headers(demo["token"]), timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["period_days"] == 30
        for k in (
            "property_views", "profile_views", "leads", "inspection_requests",
            "shares_total", "shares_by_channel", "response_rate", "lead_pipeline",
        ):
            assert k in body, k
        assert isinstance(body["shares_by_channel"], dict)
        assert isinstance(body["lead_pipeline"], dict)
        for s in ("new", "contacted", "inspection_scheduled", "negotiating", "won", "lost"):
            assert s in body["lead_pipeline"]
        assert 0.0 <= body["response_rate"] <= 1.0

    def test_period_days_query(self, demo):
        r = requests.get(
            f"{BASE_URL}/api/agent/analytics?period_days=7",
            headers=_headers(demo["token"]),
            timeout=30,
        )
        assert r.status_code == 200, r.text
        assert r.json()["period_days"] == 7


# ─── 6. Lead CRM ─────────────────────────────────────────
class TestLeadCRM:
    def test_list_and_seed(self, demo, mongo):
        r = requests.get(f"{BASE_URL}/api/crm/leads", headers=_headers(demo["token"]), timeout=30)
        assert r.status_code == 200, r.text
        leads = r.json()
        if not leads:
            mongo.lead_unlocks.insert_one({
                "id": str(uuid.uuid4()),
                "user_id": "seed-buyer",
                "agent_id": demo["id"],
                "property_id": None,
                "created_at": datetime.now(timezone.utc),
            })
            r = requests.get(f"{BASE_URL}/api/crm/leads", headers=_headers(demo["token"]), timeout=30)
            leads = r.json()
        assert len(leads) >= 1
        pytest.lead_id = leads[0]["id"]

    def test_patch_contacted_sets_responded_at(self, demo, mongo):
        r = requests.patch(
            f"{BASE_URL}/api/crm/leads/{pytest.lead_id}",
            json={"status": "contacted"},
            headers=_headers(demo["token"]),
            timeout=30,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert "crm_status" in body["updated"]
        assert "responded_at" in body["updated"]
        doc = mongo.lead_unlocks.find_one({"id": pytest.lead_id})
        assert doc["crm_status"] == "contacted"
        assert doc.get("responded_at") is not None
        pytest.responded_at = doc["responded_at"]

    def test_patch_second_status_preserves_responded_at(self, demo, mongo):
        r = requests.patch(
            f"{BASE_URL}/api/crm/leads/{pytest.lead_id}",
            json={"status": "negotiating"},
            headers=_headers(demo["token"]),
            timeout=30,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        # responded_at should NOT be in the updated keys this time
        assert "responded_at" not in body["updated"]
        doc = mongo.lead_unlocks.find_one({"id": pytest.lead_id})
        assert doc["responded_at"] == pytest.responded_at
        assert doc["crm_status"] == "negotiating"

    def test_patch_invalid_status_400(self, demo):
        r = requests.patch(
            f"{BASE_URL}/api/crm/leads/{pytest.lead_id}",
            json={"status": "banana"},
            headers=_headers(demo["token"]),
            timeout=30,
        )
        assert r.status_code == 400, r.text
        assert "status" in r.text.lower()

    def test_add_note(self, demo, mongo):
        r = requests.post(
            f"{BASE_URL}/api/crm/leads/{pytest.lead_id}/note",
            json={"text": "Called back today"},
            headers=_headers(demo["token"]),
            timeout=30,
        )
        assert r.status_code == 200, r.text
        note = r.json()["note"]
        for k in ("id", "text", "author_id", "created_at"):
            assert k in note
        # verify last_contact_at synced with note.created_at
        r2 = requests.get(f"{BASE_URL}/api/crm/leads", headers=_headers(demo["token"]), timeout=30)
        row = [l for l in r2.json() if l["id"] == pytest.lead_id][0]
        assert len(row.get("crm_notes") or []) >= 1
        assert row.get("last_contact_at") is not None

    def test_non_owner_patch_403(self, demo):
        ts = int(time.time())
        outsider = _register(f"outsider_{ts}@example.com")
        r = requests.patch(
            f"{BASE_URL}/api/crm/leads/{pytest.lead_id}",
            json={"status": "won"},
            headers=_headers(outsider["access_token"]),
            timeout=30,
        )
        assert r.status_code == 403, r.text
        assert "not your lead" in r.text.lower()

    def test_empty_body_400(self, demo):
        r = requests.patch(
            f"{BASE_URL}/api/crm/leads/{pytest.lead_id}",
            json={},
            headers=_headers(demo["token"]),
            timeout=30,
        )
        assert r.status_code == 400, r.text
        assert "nothing to update" in r.text.lower()

    def test_filter_by_status(self, demo):
        r = requests.get(
            f"{BASE_URL}/api/crm/leads?status=contacted",
            headers=_headers(demo["token"]),
            timeout=30,
        )
        assert r.status_code == 200
        for l in r.json():
            assert l.get("status") == "contacted" or l.get("crm_status") == "contacted"

    def test_filter_open_excludes_won_lost(self, demo, mongo):
        # Push one lead to lost
        mongo.lead_unlocks.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": "seed-buyer-lost",
            "agent_id": demo["id"],
            "property_id": None,
            "crm_status": "lost",
            "created_at": datetime.now(timezone.utc),
        })
        r = requests.get(
            f"{BASE_URL}/api/crm/leads?status=open",
            headers=_headers(demo["token"]),
            timeout=30,
        )
        assert r.status_code == 200
        for l in r.json():
            s = l.get("status") or l.get("crm_status")
            assert s not in ("won", "lost"), s


# ─── 7. Regression sweep ─────────────────────────────────
class TestRegression:
    def test_plans(self):
        r = requests.get(f"{BASE_URL}/api/agent-platform/plans", timeout=30)
        assert r.status_code == 200

    def test_subscription_me(self, demo):
        r = requests.get(
            f"{BASE_URL}/api/agent-platform/subscription/me",
            headers=_headers(demo["token"]),
            timeout=30,
        )
        assert r.status_code == 200

    def test_public_agent(self):
        r = requests.get(f"{BASE_URL}/api/agent-platform/public/{DEMO_SLUG}", timeout=30)
        assert r.status_code == 200

    def test_badge_progress(self, demo):
        r = requests.get(
            f"{BASE_URL}/api/agent-platform/badge/progress",
            headers=_headers(demo["token"]),
            timeout=30,
        )
        assert r.status_code == 200

    def test_share_property(self, demo):
        # fetch any property for demo
        pr = requests.get(f"{BASE_URL}/api/properties?limit=1", timeout=30)
        assert pr.status_code == 200
        items = pr.json() if isinstance(pr.json(), list) else pr.json().get("items", [])
        if not items:
            pytest.skip("no properties available")
        pid = items[0]["id"]
        r = requests.get(f"{BASE_URL}/api/share/property/{pid}", timeout=30)
        assert r.status_code == 200

    def test_properties_list(self):
        r = requests.get(f"{BASE_URL}/api/properties", timeout=30)
        assert r.status_code == 200

    def test_starter_quota_first_upload(self):
        ts = int(time.time())
        u = _register(f"starter_{ts}@example.com")
        payload = {
            "title": f"TEST_regression_prop_{ts}",
            "description": "Regression test listing",
            "price": 1000000,
            "currency": "NGN",
            "type": "sale",
            "bedrooms": 2,
            "bathrooms": 2,
            "size_sqm": 80,
            "address": "Lekki, Lagos",
            "city": "Lagos",
            "state": "Lagos",
            "country": "Nigeria",
            "amenities": [],
            "images": [],
            "category": "residential",
            "property_type": "apartment",
            "listing_type": "buy",
            "location": "Lekki, Lagos",
            "latitude": 6.4319,
            "longitude": 3.4737,
        }
        r = requests.post(
            f"{BASE_URL}/api/properties",
            json=payload,
            headers=_headers(u["access_token"]),
            timeout=30,
        )
        # Starter allows first listing (should be 200 or 201). 402 = quota exceeded (unexpected on first).
        assert r.status_code in (200, 201), f"first-upload starter failed: {r.status_code} {r.text}"
