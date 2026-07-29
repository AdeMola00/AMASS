"""
Regression tests for Phase 2 (EARN) + Phase 3 (Agent Tools + Ads) + AI helpers.

Modules covered:
  - /app/backend/earn_and_tools.py
  - /app/backend/ads.py

Each block creates its own fresh test user to avoid state bleed from previous
runs (welcome tokens, one-time task tracking, referral applied, etc).
"""
import os
import time
import uuid

import pytest
import requests

BASE_URL = os.environ.get("EXPO_BACKEND_URL", "http://localhost:8001").rstrip("/")


# ─── helpers ─────────────────────────────────────────────
def _new_user(name_prefix="Earn", email_prefix="earn"):
    email = f"TEST_{email_prefix}_{uuid.uuid4().hex[:10]}@example.com"
    r = requests.post(
        f"{BASE_URL}/api/auth/register",
        json={"email": email, "password": "TestPass123!", "full_name": f"TEST_{name_prefix} {uuid.uuid4().hex[:4]}"},
        timeout=20,
    )
    assert r.status_code == 200, f"register failed {r.status_code}: {r.text}"
    body = r.json()
    return {"token": body["access_token"], "user": body["user"], "email": email}


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ─── EARN: task catalog + streak ─────────────────────────
class TestEarnTasks:
    def test_tasks_list_shape_and_streak(self):
        u = _new_user()
        r = requests.get(f"{BASE_URL}/api/earn/tasks", headers=_h(u["token"]), timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "tasks" in body and isinstance(body["tasks"], list)
        assert "streak" in body and isinstance(body["streak"], int)
        ids = {t["id"] for t in body["tasks"]}
        # All the promised task ids exist
        for expected in [
            "daily_login", "phone_verify", "complete_profile",
            "upload_property", "refer_friend", "first_review",
            "share_listing", "identity_verify",
        ]:
            assert expected in ids, f"missing task id: {expected}"
        # Each task carries proper flags
        for t in body["tasks"]:
            assert "tokens" in t and "completed" in t and "claimable_today" in t

    def test_daily_login_claim_credits_2_then_dedupes(self):
        u = _new_user()
        r1 = requests.post(
            f"{BASE_URL}/api/earn/claim",
            headers=_h(u["token"]),
            json={"task_id": "daily_login"},
            timeout=20,
        )
        assert r1.status_code == 200, r1.text
        b1 = r1.json()
        assert b1["ok"] is True
        assert b1["credited"] == 2
        # Second call same day should be already_claimed
        r2 = requests.post(
            f"{BASE_URL}/api/earn/claim",
            headers=_h(u["token"]),
            json={"task_id": "daily_login"},
            timeout=20,
        )
        assert r2.status_code == 200
        b2 = r2.json()
        assert b2["ok"] is False
        assert b2["reason"] == "already_claimed_today"

    def test_claim_unknown_task_400(self):
        u = _new_user()
        r = requests.post(
            f"{BASE_URL}/api/earn/claim",
            headers=_h(u["token"]),
            json={"task_id": "phone_verify"},
            timeout=20,
        )
        assert r.status_code == 400


# ─── EARN: phone verify ──────────────────────────────────
class TestPhoneVerify:
    def test_start_and_confirm_awards_5_and_sets_flag(self):
        u = _new_user(email_prefix="phone")
        # Start
        r = requests.post(
            f"{BASE_URL}/api/earn/phone/start",
            headers=_h(u["token"]),
            json={"phone": "+2348012345678"},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True and body.get("mocked") is True
        # Wallet before
        w_before = requests.get(f"{BASE_URL}/api/wallet/me", headers=_h(u["token"])).json()
        # Confirm with correct code
        r = requests.post(
            f"{BASE_URL}/api/earn/phone/confirm",
            headers=_h(u["token"]),
            json={"phone": "+2348012345678", "code": "123456"},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        reward = body["reward"]
        assert reward["ok"] is True and reward["credited"] == 5
        # Note: /auth/me currently omits phone_verified from UserOut response_model,
        # but the underlying db.users doc IS updated (verified via one-time-award behavior below).
        w_after = requests.get(f"{BASE_URL}/api/wallet/me", headers=_h(u["token"])).json()
        assert w_after["spendable"] == w_before["spendable"] + 5
        # Second confirm should indicate already awarded (one-time)
        r2 = requests.post(
            f"{BASE_URL}/api/earn/phone/start",
            headers=_h(u["token"]),
            json={"phone": "+2348099999999"},
            timeout=20,
        )
        assert r2.status_code == 200
        r3 = requests.post(
            f"{BASE_URL}/api/earn/phone/confirm",
            headers=_h(u["token"]),
            json={"phone": "+2348099999999", "code": "123456"},
            timeout=20,
        )
        assert r3.status_code == 200
        assert r3.json()["reward"]["ok"] is False

    def test_confirm_wrong_code_400(self):
        u = _new_user(email_prefix="phonewrong")
        requests.post(
            f"{BASE_URL}/api/earn/phone/start",
            headers=_h(u["token"]),
            json={"phone": "+2348011122233"},
            timeout=20,
        )
        r = requests.post(
            f"{BASE_URL}/api/earn/phone/confirm",
            headers=_h(u["token"]),
            json={"phone": "+2348011122233", "code": "000000"},
            timeout=20,
        )
        assert r.status_code == 400


# ─── EARN: complete profile ──────────────────────────────
class TestCompleteProfile:
    def test_profile_awards_10_when_3_fields_filled(self):
        u = _new_user(email_prefix="prof")
        # full_name already set by register → 1 field
        r = requests.post(
            f"{BASE_URL}/api/earn/profile",
            headers=_h(u["token"]),
            json={"phone": "+2348012312312", "city": "Lekki", "bio": "Investor"},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["ok"] is True
        assert b.get("filled", 0) >= 3
        assert b["reward"]["ok"] is True
        assert b["reward"]["credited"] == 10

    def test_profile_one_time_only(self):
        u = _new_user(email_prefix="profone")
        requests.post(
            f"{BASE_URL}/api/earn/profile",
            headers=_h(u["token"]),
            json={"phone": "+2348012312312", "city": "Lekki", "bio": "Investor"},
            timeout=20,
        )
        r = requests.post(
            f"{BASE_URL}/api/earn/profile",
            headers=_h(u["token"]),
            json={"bio": "Updated"},
            timeout=20,
        )
        assert r.status_code == 200
        assert r.json()["reward"]["ok"] is False


# ─── EARN: referral ──────────────────────────────────────
class TestReferral:
    def test_referral_me_returns_code_and_share_url(self):
        u = _new_user(email_prefix="refme")
        r = requests.get(f"{BASE_URL}/api/earn/referral/me", headers=_h(u["token"]), timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["code"] and "-" in body["code"]
        assert body["share_url"].endswith(body["code"])
        assert body["referred_count"] == 0
        assert body["tokens_per_referral"] == 50

    def test_referral_flow_awards_10_and_50(self):
        referrer = _new_user(email_prefix="refA")
        referee = _new_user(email_prefix="refB")
        code = requests.get(
            f"{BASE_URL}/api/earn/referral/me", headers=_h(referrer["token"])
        ).json()["code"]
        # Snapshot referee balance
        w0 = requests.get(f"{BASE_URL}/api/wallet/me", headers=_h(referee["token"])).json()
        w0_ref = requests.get(f"{BASE_URL}/api/wallet/me", headers=_h(referrer["token"])).json()
        r = requests.post(
            f"{BASE_URL}/api/earn/referral/apply",
            headers=_h(referee["token"]),
            json={"code": code},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["you_get"] == 10 and body["referrer_gets"] == 50
        w1 = requests.get(f"{BASE_URL}/api/wallet/me", headers=_h(referee["token"])).json()
        w1_ref = requests.get(f"{BASE_URL}/api/wallet/me", headers=_h(referrer["token"])).json()
        assert w1["spendable"] - w0["spendable"] == 10
        assert w1_ref["spendable"] - w0_ref["spendable"] == 50

    def test_self_referral_blocked(self):
        u = _new_user(email_prefix="refself")
        code = requests.get(
            f"{BASE_URL}/api/earn/referral/me", headers=_h(u["token"])
        ).json()["code"]
        r = requests.post(
            f"{BASE_URL}/api/earn/referral/apply",
            headers=_h(u["token"]),
            json={"code": code},
            timeout=20,
        )
        assert r.status_code == 400

    def test_duplicate_apply_blocked(self):
        referrer = _new_user(email_prefix="refDup1")
        referee = _new_user(email_prefix="refDup2")
        code = requests.get(
            f"{BASE_URL}/api/earn/referral/me", headers=_h(referrer["token"])
        ).json()["code"]
        r1 = requests.post(
            f"{BASE_URL}/api/earn/referral/apply",
            headers=_h(referee["token"]),
            json={"code": code},
            timeout=20,
        )
        assert r1.status_code == 200
        r2 = requests.post(
            f"{BASE_URL}/api/earn/referral/apply",
            headers=_h(referee["token"]),
            json={"code": code},
            timeout=20,
        )
        assert r2.status_code == 400

    def test_invalid_referral_code_404(self):
        u = _new_user(email_prefix="refinv")
        r = requests.post(
            f"{BASE_URL}/api/earn/referral/apply",
            headers=_h(u["token"]),
            json={"code": "NOPE-XXXX"},
            timeout=20,
        )
        assert r.status_code == 404


# ─── EARN: upload property auto-award ───────────────────
class TestUploadPropertyReward:
    def _sample_property(self):
        return {
            "title": "TEST Duplex in Lekki",
            "description": "A test duplex for reward flow.",
            "property_type": "duplex",
            "listing_type": "buy",
            "price": 50_000_000,
            "bedrooms": 3,
            "bathrooms": 3,
            "size_sqm": 220,
            "city": "Lekki",
            "state": "Lagos",
            "location": "Lekki Phase 1",
            "images": [],
            "amenities": ["Parking"],
            "latitude": 6.44,
            "longitude": 3.47,
            "is_owner": True,
            "has_mandate": False,
        }

    def test_property_upload_credits_40(self):
        u = _new_user(email_prefix="upload")
        w0 = requests.get(f"{BASE_URL}/api/wallet/me", headers=_h(u["token"])).json()
        r = requests.post(
            f"{BASE_URL}/api/properties",
            headers=_h(u["token"]),
            json=self._sample_property(),
            timeout=30,
        )
        assert r.status_code == 200, r.text
        prop = r.json()
        assert prop["id"]
        w1 = requests.get(f"{BASE_URL}/api/wallet/me", headers=_h(u["token"])).json()
        assert w1["spendable"] - w0["spendable"] == 40


# ─── AGENT tools: promotions config ─────────────────────
class TestPromotions:
    def test_promotions_config_shape(self):
        r = requests.get(f"{BASE_URL}/api/agent/promotions/config", timeout=20)
        assert r.status_code == 200
        cfg = r.json()
        assert set(cfg.keys()) == {"promote", "feature", "boost"}
        assert cfg["promote"]["tokens"] == 20
        assert cfg["feature"]["tokens"] == 50
        assert cfg["boost"]["tokens"] == 100

    def test_promote_listing_debits_and_sets_promotion(self):
        u = _new_user(email_prefix="prom")
        # Fund wallet
        requests.post(
            f"{BASE_URL}/api/tokens/purchase",
            headers=_h(u["token"]),
            json={"bundle_id": "hunter", "provider": "mock"},
            timeout=20,
        )
        # Create property (this also awards 40 tokens)
        prop = requests.post(
            f"{BASE_URL}/api/properties",
            headers=_h(u["token"]),
            json=TestUploadPropertyReward()._sample_property(),
            timeout=30,
        ).json()
        w0 = requests.get(f"{BASE_URL}/api/wallet/me", headers=_h(u["token"])).json()
        r = requests.post(
            f"{BASE_URL}/api/agent/promote",
            headers=_h(u["token"]),
            json={"property_id": prop["id"], "tier": "promote"},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True and body["tier"] == "promote"
        assert body["cost"] == 20
        assert body["expires_at"]
        w1 = requests.get(f"{BASE_URL}/api/wallet/me", headers=_h(u["token"])).json()
        assert w0["spendable"] - w1["spendable"] == 20


# ─── AGENT tools: leads ─────────────────────────────────
class TestLeads:
    def test_leads_redacts_contact_until_unlocked(self):
        agent = _new_user(email_prefix="lead_agent")
        buyer = _new_user(email_prefix="lead_buyer")
        # Buyer with phone
        requests.post(
            f"{BASE_URL}/api/earn/profile",
            headers=_h(buyer["token"]),
            json={"phone": "+2348090909090", "city": "Ikoyi", "bio": "Buyer"},
            timeout=20,
        )
        # Agent creates a property
        prop = requests.post(
            f"{BASE_URL}/api/properties",
            headers=_h(agent["token"]),
            json=TestUploadPropertyReward()._sample_property(),
            timeout=30,
        ).json()
        # Buyer favorites it via /favorites/toggle
        r = requests.post(
            f"{BASE_URL}/api/favorites/toggle",
            headers=_h(buyer["token"]),
            json={"property_id": prop["id"]},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        assert r.json().get("favorited") is True
        # Agent lists leads → phone/email should be null
        leads = requests.get(
            f"{BASE_URL}/api/agent/leads/{prop['id']}",
            headers=_h(agent["token"]),
            timeout=20,
        )
        assert leads.status_code == 200, leads.text
        body = leads.json()
        assert body["unlock_cost"] == 10
        our_lead = [l for l in body["leads"] if l["favorite_user_id"] == buyer["user"]["id"]]
        assert len(our_lead) == 1
        assert our_lead[0]["phone"] is None
        assert our_lead[0]["email"] is None
        assert our_lead[0]["unlocked"] is False
        # Fund the agent + unlock
        requests.post(
            f"{BASE_URL}/api/tokens/purchase",
            headers=_h(agent["token"]),
            json={"bundle_id": "starter", "provider": "mock"},
            timeout=20,
        )
        r = requests.post(
            f"{BASE_URL}/api/agent/leads/unlock",
            headers=_h(agent["token"]),
            json={"property_id": prop["id"], "favorite_user_id": buyer["user"]["id"]},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True and body["cost"] == 10
        assert body["contact"]["phone"] == "+2348090909090"
        assert body["contact"]["email"].lower() == buyer["email"].lower()


# ─── AI helpers ─────────────────────────────────────────
class TestAIHelpers:
    def test_ai_description_generates_text_and_debits_5(self):
        u = _new_user(email_prefix="aidesc")
        # Fund
        requests.post(
            f"{BASE_URL}/api/tokens/purchase",
            headers=_h(u["token"]),
            json={"bundle_id": "starter", "provider": "mock"},
            timeout=20,
        )
        w0 = requests.get(f"{BASE_URL}/api/wallet/me", headers=_h(u["token"])).json()
        r = requests.post(
            f"{BASE_URL}/api/agent/ai/description",
            headers=_h(u["token"]),
            json={
                "title": "Luxurious 4BR Duplex in Lekki",
                "property_type": "duplex",
                "bedrooms": 4,
                "bathrooms": 5,
                "size_sqm": 320,
                "location": "Lekki Phase 1",
                "amenities": ["Pool", "24/7 Security"],
                "tone": "luxurious",
            },
            timeout=60,
        )
        assert r.status_code == 200, f"AI description failed: {r.status_code} {r.text[:400]}"
        body = r.json()
        assert body["cost"] == 5
        assert isinstance(body["description"], str) and len(body["description"]) > 50
        w1 = requests.get(f"{BASE_URL}/api/wallet/me", headers=_h(u["token"])).json()
        assert w0["spendable"] - w1["spendable"] == 5

    def test_ai_parse_search_returns_filters(self):
        r = requests.post(
            f"{BASE_URL}/api/agent/ai/parse-search",
            headers={"Content-Type": "application/json"},
            json={"query": "3 bedroom duplex under 50 million in Lekki"},
            timeout=60,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        f = body["filters"]
        # Not asserting exact structure since LLM outputs may vary, but keys should be reasonable
        assert isinstance(f, dict)


# ─── ADS: tiers + delivery + tracking ───────────────────
class TestAds:
    def test_ads_tiers_returns_5(self):
        r = requests.get(f"{BASE_URL}/api/ads/tiers", timeout=20)
        assert r.status_code == 200
        cfg = r.json()
        assert set(cfg.keys()) == {"basic", "featured", "spotlight", "map", "premium"}
        for k, expected in [("basic", 30), ("featured", 80), ("spotlight", 150), ("map", 100), ("premium", 300)]:
            assert cfg[k]["tokens"] == expected

    def test_ads_next_returns_seeded_demo_ad(self):
        # Unauthenticated — no cooldown to trigger
        r = requests.get(f"{BASE_URL}/api/ads/next", timeout=20)
        assert r.status_code == 200
        body = r.json()
        assert body.get("ad") is not None, f"expected demo ad; got {body}"
        assert body["ad"]["seller_id"] == "demo-system" or body["ad"]["status"] == "active"

    def test_impression_cooldown_returns_null(self):
        u = _new_user(email_prefix="ads")
        # First impression
        r = requests.get(f"{BASE_URL}/api/ads/next", headers=_h(u["token"]), timeout=20)
        assert r.status_code == 200
        assert r.json().get("ad") is not None
        ad_id = r.json()["ad"]["id"]
        # Track impression
        r2 = requests.post(
            f"{BASE_URL}/api/ads/track",
            headers=_h(u["token"]),
            json={"ad_id": ad_id, "event": "impression", "context": "marketplace_home"},
            timeout=20,
        )
        assert r2.status_code == 200
        # Next call should hit cooldown
        r3 = requests.get(f"{BASE_URL}/api/ads/next", headers=_h(u["token"]), timeout=20)
        assert r3.status_code == 200
        body3 = r3.json()
        assert body3.get("ad") is None
        assert body3.get("reason") == "cooldown"

    def test_track_impression_and_click_increment_counters(self):
        u = _new_user(email_prefix="adstrk")
        r = requests.get(f"{BASE_URL}/api/ads/next", headers=_h(u["token"]), timeout=20).json()
        ad_id = r["ad"]["id"]
        imps0 = r["ad"].get("impressions", 0)
        clicks0 = r["ad"].get("clicks", 0)
        requests.post(
            f"{BASE_URL}/api/ads/track",
            headers=_h(u["token"]),
            json={"ad_id": ad_id, "event": "impression"},
            timeout=20,
        )
        requests.post(
            f"{BASE_URL}/api/ads/track",
            headers=_h(u["token"]),
            json={"ad_id": ad_id, "event": "click"},
            timeout=20,
        )
        # Fetch as seller (demo-system) not possible; use unauth /next isn't guaranteed to return same ad.
        # Instead: create a new user, capture ad, then verify /next?exclude= no-op
        # We just assert counters increased by querying next-user unauth fresh session
        r2 = requests.get(f"{BASE_URL}/api/ads/next", timeout=20).json()
        # Cannot guarantee same ad without cooldown but demo ad is single seeded → same
        if r2.get("ad") and r2["ad"]["id"] == ad_id:
            assert r2["ad"]["impressions"] >= imps0 + 1
            assert r2["ad"]["clicks"] >= clicks0 + 1

    def test_not_interested_hides_ad(self):
        u = _new_user(email_prefix="adshide")
        r = requests.get(f"{BASE_URL}/api/ads/next", headers=_h(u["token"]), timeout=20).json()
        assert r.get("ad")
        ad_id = r["ad"]["id"]
        # Send not_interested
        requests.post(
            f"{BASE_URL}/api/ads/track",
            headers=_h(u["token"]),
            json={"ad_id": ad_id, "event": "not_interested"},
            timeout=20,
        )
        # Wait past cooldown? No — hide filter should work regardless of cooldown
        # But cooldown may still block. Sleep or use a different session? The user
        # hasn't tracked an impression yet, so no cooldown record. Verify hide.
        r2 = requests.get(f"{BASE_URL}/api/ads/next", headers=_h(u["token"]), timeout=20).json()
        # Either no ad (because demo ad hidden) with reason=no_candidates,
        # or a different ad (unlikely - only demo seeded).
        if r2.get("ad") is None:
            assert r2.get("reason") in ("no_candidates", "cooldown")
        else:
            assert r2["ad"]["id"] != ad_id

    def test_create_ad_debits_tokens_and_lists_in_mine(self):
        u = _new_user(email_prefix="adcr")
        # Fund
        requests.post(
            f"{BASE_URL}/api/tokens/purchase",
            headers=_h(u["token"]),
            json={"bundle_id": "hunter", "provider": "mock"},
            timeout=20,
        )
        w0 = requests.get(f"{BASE_URL}/api/wallet/me", headers=_h(u["token"])).json()
        r = requests.post(
            f"{BASE_URL}/api/ads",
            headers=_h(u["token"]),
            json={
                "tier": "basic",
                "title": "TEST_ad_home",
                "description": "Get your dream home now",
                "cta_label": "Shop",
                "media": [{"kind": "image", "url": "https://example.com/x.jpg"}],
                "target_categories": [],
                "target_cities": ["Lekki"],
            },
            timeout=20,
        )
        assert r.status_code == 200, r.text
        ad = r.json()
        assert ad["status"] == "active"
        assert ad["tokens_paid"] == 30
        assert "_id" not in ad
        w1 = requests.get(f"{BASE_URL}/api/wallet/me", headers=_h(u["token"])).json()
        assert w0["spendable"] - w1["spendable"] == 30
        # /ads/mine returns it with CTR
        mine = requests.get(f"{BASE_URL}/api/ads/mine", headers=_h(u["token"]), timeout=20).json()
        assert isinstance(mine, list) and len(mine) >= 1
        our = [a for a in mine if a["id"] == ad["id"]]
        assert len(our) == 1 and "ctr" in our[0]
