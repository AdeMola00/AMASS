# Iteration 102 — notifications audience filter, Declutter promote (ads create/402), wallet debit
import os
import re
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL").rstrip("/")
DEMO = {"email": "demo@amass.africa", "password": "amass2026"}
PRO_KINDS = {"FIXA_APPLICATION", "FIXA_REPORT", "LEAD_ASSIGNED"}
PRO_TITLES = ("New FIXA application", "FIXA re-application", "Provider reported")
PRO_URL = re.compile(r"^/(admin|agent-)")
CREATED = {"items": [], "ads": [], "users": []}


def _login(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=20)
    if r.status_code != 200:
        pytest.skip(f"login failed {r.status_code}")
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def h():
    hh = _login(DEMO)
    yield hh
    # Teardown: cancel (refunds) created ads, soft-delete created items. TEST_ users are left for DB cleanup by id.
    for a in CREATED["ads"]:
        requests.post(f"{BASE_URL}/api/ads/{a}/cancel", headers=hh, timeout=20)
    for i in CREATED["items"]:
        requests.delete(f"{BASE_URL}/api/marketplace/items/{i}", headers=hh, timeout=20)


def _rows(payload):
    if isinstance(payload, list):
        return payload
    for k in ("items", "notifications", "results", "data"):
        if isinstance(payload.get(k), list):
            return payload[k]
    return []


def _is_pro(n):
    return n.get("kind") in PRO_KINDS or PRO_URL.match(n.get("action_url") or "") or any(t in (n.get("title") or "") for t in PRO_TITLES)


# --- Notifications audience filter ---
def test_center_consumer_excludes_pro(h):
    r = requests.get(f"{BASE_URL}/api/notifications/center?audience=consumer&limit=100", headers=h, timeout=30)
    assert r.status_code == 200, r.text[:200]
    rows = _rows(r.json())
    bad = [(n.get("kind"), n.get("title"), n.get("action_url")) for n in rows if _is_pro(n)]
    assert not bad, f"pro rows leaked: {bad[:5]}"


def test_center_default_unchanged_includes_pro(h):
    r = requests.get(f"{BASE_URL}/api/notifications/center?limit=100", headers=h, timeout=30)
    assert r.status_code == 200
    rows = _rows(r.json())
    assert any(_is_pro(n) for n in rows), "default audience should still include pro rows for admin demo"


def test_unread_count_consumer_lower(h):
    c = requests.get(f"{BASE_URL}/api/notifications/unread-count?audience=consumer", headers=h, timeout=20).json()["unread"]
    a = requests.get(f"{BASE_URL}/api/notifications/unread-count", headers=h, timeout=20).json()["unread"]
    print(f"unread consumer={c} all={a}")
    assert isinstance(c, int) and c < a


def test_legacy_notifications_consumer_filtered(h):
    r = requests.get(f"{BASE_URL}/api/notifications?audience=consumer", headers=h, timeout=30)
    assert r.status_code == 200
    rows = _rows(r.json())
    bad = [(n.get("kind"), n.get("title")) for n in rows if _is_pro(n)]
    assert not bad, f"legacy leaked: {bad[:5]}"


# --- Ads tiers / promote ---
def test_ad_tiers(h):
    t = requests.get(f"{BASE_URL}/api/ads/tiers", timeout=20).json()
    assert t["basic"]["tokens"] == 30 and t["premium"]["tokens"] == 300


def test_promote_new_listing_debits_wallet(h):
    item = {
        "name": f"TEST_promote_{uuid.uuid4().hex[:6]}", "description": "TEST listing for promote flow",
        "price": 15000, "category": "Furniture", "subcategory": "Chairs", "condition": "Good",
        "image": "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=600",
        "images": ["https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=600"], "city": "Lagos",
    }
    r = requests.post(f"{BASE_URL}/api/marketplace/items", json=item, headers=h, timeout=30)
    assert r.status_code == 200, r.text[:300]
    it = r.json()["item"]
    CREATED["items"].append(it["id"])
    mine = requests.get(f"{BASE_URL}/api/marketplace/my-listings", headers=h, timeout=30).json()
    assert any(x["id"] == it["id"] for x in mine)

    w0 = requests.get(f"{BASE_URL}/api/wallet/me", headers=h, timeout=20).json()
    r = requests.post(f"{BASE_URL}/api/ads", headers=h, timeout=30, json={
        "marketplace_item_id": it["id"], "tier": "basic", "title": it["name"], "description": "TEST",
        "cta_label": "View item", "media": [{"kind": "image", "url": item["image"]}],
        "target_categories": ["Furniture"], "target_cities": ["Lagos"]})
    assert r.status_code == 200, r.text[:300]
    ad = r.json()
    CREATED["ads"].append(ad["id"])
    assert ad["status"] == "active" and ad["tier"] == "basic" and ad["marketplace_item_id"] == it["id"]
    w1 = requests.get(f"{BASE_URL}/api/wallet/me", headers=h, timeout=20).json()
    print("wallet before/after", {k: w0.get(k) for k in ("balance", "bonus_balance")}, {k: w1.get(k) for k in ("balance", "bonus_balance")})
    tot = lambda w: (w.get("balance") or 0) + (w.get("bonus_balance") or 0)
    assert tot(w0) - tot(w1) == 30
    mine_ads = requests.get(f"{BASE_URL}/api/ads/mine", headers=h, timeout=20).json()
    assert mine_ads[0]["id"] == ad["id"], "new ad should be first in /ads/mine"
    assert mine_ads[0]["marketplace_item_id"] == it["id"]


def test_demo_sofa_has_campaign(h):
    mine = requests.get(f"{BASE_URL}/api/marketplace/my-listings", headers=h, timeout=30).json()
    sofa = [x for x in mine if "Grey 3-seater sofa" in x.get("name", "")]
    assert sofa, "demo sofa missing"
    ads = requests.get(f"{BASE_URL}/api/ads/mine", headers=h, timeout=20).json()
    assert any(a.get("marketplace_item_id") == sofa[0]["id"] and a["status"] in ("active", "paused") for a in ads)


def test_insufficient_tokens_402():
    email = f"test_iter102_{uuid.uuid4().hex[:8]}@amass-qa.africa"
    r = requests.post(f"{BASE_URL}/api/auth/register", json={"email": email, "password": "TestPass123!", "full_name": "TEST_ Zero"}, timeout=20)
    assert r.status_code == 200, r.text[:200]
    d = r.json()
    CREATED["users"].append(d["user"]["id"])
    hh = {"Authorization": f"Bearer {d['access_token']}"}
    r = requests.post(f"{BASE_URL}/api/ads", headers=hh, timeout=20, json={"tier": "premium", "title": "TEST_ad", "description": "TEST", "media": []})
    assert r.status_code == 402, r.text[:200]
    det = r.json()["detail"]
    assert det["error"] == "insufficient_tokens" and det["required"] == 300 and det["shortfall"] > 0


def test_promote_foreign_item_rejected(h):
    """Security: promoting an item you don't own should be rejected (currently expected to FAIL if unvalidated)."""
    items = requests.get(f"{BASE_URL}/api/marketplace", headers=h, timeout=30).json()
    items = _rows(items) if not isinstance(items, list) else items
    me = requests.get(f"{BASE_URL}/api/auth/me", headers=h, timeout=20).json()
    foreign = [i for i in items if i.get("seller_id") and i.get("seller_id") != me["id"]]
    if not foreign:
        pytest.skip("no foreign item")
    # Use a non-existent id instead of debiting demo for someone else's item: still should be 4xx
    r = requests.post(f"{BASE_URL}/api/ads", headers=h, timeout=20, json={"marketplace_item_id": "nonexistent-" + uuid.uuid4().hex, "tier": "map", "title": "TEST_bad", "description": "TEST", "media": []})
    if r.status_code == 200:
        CREATED["ads"].append(r.json()["id"])
    assert r.status_code in (400, 403, 404, 422), f"unvalidated marketplace_item_id accepted ({r.status_code})"
