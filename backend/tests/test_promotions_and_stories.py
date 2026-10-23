"""Agent Boost Tools (Promote · Feature · Boost) + Listing Stories.

Covers /app/backend/promotions.py and the story kit in share_routes.py:
  • config / placements shape (admin-editable tiers)
  • preview is owner-only and quotes balance_after + reach
  • promote debits MASS, stamps properties.promotion, surfaces promoted-first in
    /properties, annotates /agent/listings + /properties/{id}
  • same-tier re-activation EXTENDS the expiry; boost alerts matched saved searches
  • /agent/promotions/mine lists active promotions
  • admin PATCH validates step-up pricing and is reflected in /agent/promotions/config
  • story endpoint: owner OK, locked buyer 403, admin OK, "story" share channel accepted
"""
import os
import uuid
from datetime import datetime, timezone

import requests

BASE_URL = os.environ.get("EXPO_BACKEND_URL", "http://localhost:8001").rstrip("/")
DEMO = {"email": "demo@amass.africa", "password": "amass2026"}


def _new_user(prefix="boost"):
    email = f"TEST_{prefix}_{uuid.uuid4().hex[:10]}@example.com"
    r = requests.post(f"{BASE_URL}/api/auth/register", json={"email": email, "password": "TestPass123!", "full_name": f"TEST_{prefix} {uuid.uuid4().hex[:4]}"}, timeout=20)
    assert r.status_code == 200, r.text
    b = r.json()
    return {"token": b["access_token"], "user": b["user"], "email": email}


def _h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json=DEMO, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _fund(token, bundle="hunter"):
    requests.post(f"{BASE_URL}/api/tokens/purchase", headers=_h(token), json={"bundle_id": bundle, "provider": "mock"}, timeout=20)


def _sample_property(tag):
    return {
        "title": f"TEST Boost Villa {tag}",
        "description": "A test villa for the boost flow.",
        "property_type": "duplex",
        "listing_type": "buy",
        "price": 75_000_000,
        "bedrooms": 4,
        "bathrooms": 4,
        "size_sqm": 310,
        "city": "Lekki",
        "state": "Lagos",
        "location": "Chevron Drive, Lekki",
        "images": ["https://images.unsplash.com/photo-1613977257363-707ba9348227?w=1200"],
        "amenities": ["Parking", "Pool"],
        "latitude": round(6.43 + uuid.uuid4().int % 1000 / 100000, 5),
        "longitude": round(3.50 + uuid.uuid4().int % 1000 / 100000, 5),
        "is_owner": True,
        "has_mandate": False,
    }


def _create_property(token):
    r = requests.post(f"{BASE_URL}/api/properties", headers=_h(token), json=_sample_property(uuid.uuid4().hex[:4]), timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


def _spendable(token):
    return requests.get(f"{BASE_URL}/api/wallet/me", headers=_h(token), timeout=20).json()["spendable"]


class TestConfig:
    def test_config_shape_and_placements(self):
        r = requests.get(f"{BASE_URL}/api/agent/promotions/config", timeout=20)
        assert r.status_code == 200
        cfg = r.json()
        assert set(cfg) == {"promote", "feature", "boost"}
        for k in cfg:
            assert {"tokens", "days", "label", "perk", "placements", "uplift"} <= set(cfg[k])
        assert cfg["promote"]["tokens"] <= cfg["feature"]["tokens"] <= cfg["boost"]["tokens"]
        assert "alerts" in cfg["boost"]["placements"] and "map" in cfg["boost"]["placements"]
        assert "featured" in cfg["feature"]["placements"] and "map" not in cfg["feature"]["placements"]
        pl = requests.get(f"{BASE_URL}/api/agent/promotions/placements", timeout=20).json()
        assert set(pl) == {"results", "featured", "map", "alerts"}


class TestPreviewAndPromote:
    def test_preview_owner_only_and_quotes(self):
        agent = _new_user("agent")
        other = _new_user("other")
        _fund(agent["token"])
        prop = _create_property(agent["token"])
        r = requests.get(f"{BASE_URL}/api/agent/promotions/preview/{prop['id']}", headers=_h(other["token"]), timeout=20)
        assert r.status_code == 403
        r = requests.get(f"{BASE_URL}/api/agent/promotions/preview/{prop['id']}", headers=_h(agent["token"]), timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["property"]["id"] == prop["id"]
        assert body["active"] is None
        bal = body["balance"]
        for k, t in body["tiers"].items():
            assert t["balance_after"] == bal - t["tokens"]
            assert t["affordable"] is (bal >= t["tokens"])
            assert t["estimated_views"] >= 1
        reach = body["reach"]
        assert {"views_30d", "city_seekers_30d", "matched_buyers", "competing_listings", "current_rank", "estimated_views"} <= set(reach)
        assert reach["current_rank"] >= 1

    def test_promote_debits_and_surfaces_everywhere(self):
        agent = _new_user("agent2")
        _fund(agent["token"])
        prop = _create_property(agent["token"])
        before = _spendable(agent["token"])
        r = requests.post(f"{BASE_URL}/api/agent/promote", headers=_h(agent["token"]), json={"property_id": prop["id"], "tier": "feature"}, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] and body["tier"] == "feature" and body["cost"] == 50 and body["extended"] is False
        assert before - _spendable(agent["token"]) == 50
        assert body["balance_after"] == before - 50

        # /agent/listings annotates promotion with days_left
        mine = requests.get(f"{BASE_URL}/api/agent/listings", headers=_h(agent["token"]), timeout=20).json()
        me = next(p for p in mine if p["id"] == prop["id"])
        assert me["promotion"]["tier"] == "feature" and 13 <= me["promotion"]["days_left"] <= 14

        # /properties/{id} (owner) carries promotion
        d = requests.get(f"{BASE_URL}/api/properties/{prop['id']}", headers=_h(agent["token"]), timeout=20).json()
        assert d["promotion"]["tier"] == "feature"

        # /properties lists promoted listings first (within the city filter)
        lst = requests.get(f"{BASE_URL}/api/properties", params={"city": "Lekki", "listing_type": "buy", "limit": 50}, timeout=30).json()
        ids = [p["id"] for p in lst]
        assert prop["id"] in ids
        promoted_prefix = []
        for p in lst:
            if p.get("promotion"):
                promoted_prefix.append(p["id"])
            else:
                break
        assert prop["id"] in promoted_prefix, "promoted listing must be in the promoted-first prefix"

        # /map/markers exposes promotion_tier (buyer view)
        buyer = _new_user("buyer")
        mk = requests.get(f"{BASE_URL}/api/map/markers", headers=_h(buyer["token"]), params={"q": "TEST Boost Villa"}, timeout=30)
        assert mk.status_code == 200, mk.text
        m = next((x for x in mk.json()["markers"] if x["id"] == prop["id"]), None)
        assert m is not None and m["promotion_tier"] == "feature"

    def test_non_owner_cannot_promote(self):
        agent = _new_user("agent3")
        other = _new_user("other3")
        _fund(other["token"])
        prop = _create_property(agent["token"])
        r = requests.post(f"{BASE_URL}/api/agent/promote", headers=_h(other["token"]), json={"property_id": prop["id"], "tier": "promote"}, timeout=20)
        assert r.status_code == 403

    def test_insufficient_balance_402_no_charge(self):
        agent = _new_user("broke")
        prop = _create_property(agent["token"])  # welcome bonus only (+40 for upload) < 100
        before = _spendable(agent["token"])
        if before >= 100:
            return  # welcome config too generous for this check
        r = requests.post(f"{BASE_URL}/api/agent/promote", headers=_h(agent["token"]), json={"property_id": prop["id"], "tier": "boost"}, timeout=20)
        assert r.status_code == 402, r.text
        detail = r.json()["detail"]
        assert detail["error"] == "insufficient_tokens" and detail["shortfall"] == 100 - before
        assert _spendable(agent["token"]) == before

    def test_same_tier_extends_and_mine_lists_active(self):
        agent = _new_user("extend")
        _fund(agent["token"])
        prop = _create_property(agent["token"])
        r1 = requests.post(f"{BASE_URL}/api/agent/promote", headers=_h(agent["token"]), json={"property_id": prop["id"], "tier": "promote"}, timeout=20).json()
        r2 = requests.post(f"{BASE_URL}/api/agent/promote", headers=_h(agent["token"]), json={"property_id": prop["id"], "tier": "promote"}, timeout=20).json()
        assert r2["extended"] is True
        e1 = datetime.fromisoformat(r1["expires_at"])
        e2 = datetime.fromisoformat(r2["expires_at"])
        assert 6.9 <= (e2 - e1).total_seconds() / 86400 <= 7.1
        pv = requests.get(f"{BASE_URL}/api/agent/promotions/preview/{prop['id']}", headers=_h(agent["token"]), timeout=30).json()
        assert pv["active"]["tier"] == "promote" and pv["tiers"]["promote"]["extends_active"] is True
        mine = requests.get(f"{BASE_URL}/api/agent/promotions/mine", headers=_h(agent["token"]), timeout=30).json()
        assert any(a["id"] == prop["id"] and a["promotion"]["tier"] == "promote" for a in mine["active"])
        assert len(mine["history"]) >= 2 and mine["spent_total"] >= 40

    def test_boost_alerts_matching_saved_search(self):
        buyer = _new_user("alertbuyer")
        ss = requests.post(
            f"{BASE_URL}/api/saved-searches",
            headers=_h(buyer["token"]),
            json={"name": "Lekki villas", "criteria": {"city": "Lekki", "listing_type": "buy", "max_price": 80_000_000}, "alerts_enabled": True},
            timeout=20,
        )
        assert ss.status_code == 200, ss.text
        agent = _new_user("boostagent")
        _fund(agent["token"], "investor")
        prop = _create_property(agent["token"])
        pv = requests.get(f"{BASE_URL}/api/agent/promotions/preview/{prop['id']}", headers=_h(agent["token"]), timeout=30).json()
        assert pv["reach"]["matched_buyers"] >= 1
        r = requests.post(f"{BASE_URL}/api/agent/promote", headers=_h(agent["token"]), json={"property_id": prop["id"], "tier": "boost"}, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["alerts_sent"] >= 1
        notes = requests.get(f"{BASE_URL}/api/notifications?limit=50", headers=_h(buyer["token"]), timeout=20).json()
        items = notes if isinstance(notes, list) else notes.get("items", notes.get("notifications", []))
        hit = [n for n in items if n.get("kind") == "BOOSTED_LISTING" and (n.get("meta") or {}).get("property_id") == prop["id"]]
        assert hit, f"buyer should receive a BOOSTED_LISTING notification: {items[:3]}"
        assert hit[0]["action_url"].startswith(f"/property/{prop['id']}")


class TestAdminConfig:
    def test_patch_validates_and_applies(self):
        tok = _admin_token()
        cur = requests.get(f"{BASE_URL}/api/admin/promotions/config", headers=_h(tok), timeout=20)
        assert cur.status_code == 200, cur.text
        tiers = cur.json()["tiers"]
        bad = requests.patch(f"{BASE_URL}/api/admin/promotions/config", headers=_h(tok), json={"promote": {"tokens": 999}}, timeout=20)
        assert bad.status_code == 422
        ok = requests.patch(f"{BASE_URL}/api/admin/promotions/config", headers=_h(tok), json={"promote": {"tokens": 25, "days": 8}}, timeout=20)
        assert ok.status_code == 200, ok.text
        assert ok.json()["tiers"]["promote"]["tokens"] == 25 and ok.json()["tiers"]["promote"]["days"] == 8
        pub = requests.get(f"{BASE_URL}/api/agent/promotions/config", timeout=20).json()
        assert pub["promote"]["tokens"] == 25
        # restore defaults so other suites keep their 20/50/100 assertions
        restore = requests.patch(f"{BASE_URL}/api/admin/promotions/config", headers=_h(tok), json={"promote": {"tokens": tiers["promote"]["tokens"], "days": tiers["promote"]["days"]}}, timeout=20)
        assert restore.status_code == 200
        assert requests.get(f"{BASE_URL}/api/agent/promotions/config", timeout=20).json()["promote"]["tokens"] == tiers["promote"]["tokens"]

    def test_non_admin_forbidden(self):
        u = _new_user("notadmin")
        r = requests.get(f"{BASE_URL}/api/admin/promotions/config", headers=_h(u["token"]), timeout=20)
        assert r.status_code == 403


class TestStory:
    def test_owner_gets_story_kit(self):
        agent = _new_user("story")
        prop = _create_property(agent["token"])
        r = requests.get(f"{BASE_URL}/api/share/property/{prop['id']}/story", headers=_h(agent["token"]), timeout=20)
        assert r.status_code == 200, r.text
        s = r.json()
        assert s["role"] == "agent"
        assert s["share_url"].endswith(prop["id"])
        assert prop["id"][:8] not in s["caption"] or s["share_url"] in s["caption"]
        assert s["share_url"] in s["caption"]
        assert s["property"]["images"] and s["property"]["title"].startswith("TEST Boost Villa")
        assert s["brand"]["name"] == "AMASS"

    def test_locked_buyer_403_admin_ok(self):
        agent = _new_user("story2")
        buyer = _new_user("storybuyer")
        prop = _create_property(agent["token"])
        r = requests.get(f"{BASE_URL}/api/share/property/{prop['id']}/story", headers=_h(buyer["token"]), timeout=20)
        assert r.status_code == 403
        assert r.json()["detail"]["error"] == "locked"
        r = requests.get(f"{BASE_URL}/api/share/property/{prop['id']}/story", headers=_h(_admin_token()), timeout=20)
        assert r.status_code == 200 and r.json()["role"] == "admin"

    def test_story_channel_tracked(self):
        agent = _new_user("story3")
        prop = _create_property(agent["token"])
        for ch in ("story", "story_series"):
            r = requests.post(f"{BASE_URL}/api/share/property/{prop['id']}/event", headers=_h(agent["token"]), json={"channel": ch, "context": "cover"}, timeout=20)
            assert r.status_code == 200, r.text
        st = requests.get(f"{BASE_URL}/api/share/property/{prop['id']}/stats", headers=_h(agent["token"]), timeout=20).json()
        assert st["by_channel"].get("story") == 1 and st["by_channel"].get("story_series") == 1

    def test_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/share/property/anything/story", timeout=20)
        assert r.status_code in (401, 403)
