"""Focused Social feed API tests covering the review request.

Covers meta/feed (cursor pagination), post CRUD, status transitions,
like toggle, comments, hide/report, contact (chat conversation), uploads
(data_url → url), and non-owner interactions via a second fresh user.
"""
import base64
import os
import uuid

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://property-os-africa.preview.emergentagent.com").rstrip("/")
DEMO = {"email": "demo@amass.africa", "password": "amass2026"}

# tiny red 1x1 PNG
PNG_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="
)
PNG_DATA_URL = "data:image/png;base64," + base64.b64encode(PNG_BYTES).decode()


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=20)
    r.raise_for_status()
    return r.json()["access_token"]


def _register_fresh():
    uid = uuid.uuid4().hex[:10]
    email = f"TEST_social_{uid}@amass.africa"
    payload = {"email": email, "password": "Social2026!", "full_name": f"Test Social {uid}"}
    r = requests.post(f"{BASE_URL}/api/auth/register", json=payload, timeout=20)
    assert r.status_code in (200, 201), r.text
    return r.json()["access_token"], email


@pytest.fixture(scope="session")
def demo_token():
    return _login(DEMO["email"], DEMO["password"])


@pytest.fixture(scope="session")
def other_token():
    tok, _ = _register_fresh()
    return tok


def H(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ─── meta ───
class TestMeta:
    def test_meta(self, demo_token):
        r = requests.get(f"{BASE_URL}/api/social/posts/meta", headers=H(demo_token), timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data.get("categories"), list) and len(data["categories"]) > 0
        assert isinstance(data.get("conditions"), list) and len(data["conditions"]) > 0
        assert "scopes" in data and "defaults" in data and "counts" in data
        assert data["defaults"].get("visibility") in ("estate", "area", "city")


# ─── feed + cursor ───
class TestFeed:
    def test_feed_cursor_pagination_no_duplicates(self, demo_token):
        r1 = requests.get(f"{BASE_URL}/api/social/feed", params={"scope": "city", "limit": 5}, headers=H(demo_token), timeout=15)
        assert r1.status_code == 200, r1.text
        d1 = r1.json()
        assert len(d1["items"]) <= 5
        if not d1.get("next_cursor"):
            pytest.skip("Not enough seeded posts to test cursor")
        r2 = requests.get(
            f"{BASE_URL}/api/social/feed",
            params={"scope": "city", "limit": 5, "cursor": d1["next_cursor"]},
            headers=H(demo_token),
            timeout=15,
        )
        assert r2.status_code == 200, r2.text
        ids1 = {p["id"] for p in d1["items"]}
        ids2 = {p["id"] for p in r2.json()["items"]}
        assert ids1.isdisjoint(ids2), "Second page contains duplicates from first page"

    def test_feed_scope_variants(self, demo_token):
        for scope in ("city", "area", "estate"):
            r = requests.get(f"{BASE_URL}/api/social/feed", params={"scope": scope, "limit": 3}, headers=H(demo_token), timeout=15)
            assert r.status_code == 200, (scope, r.text)

    def test_feed_filter_kind_and_category_and_q(self, demo_token):
        r = requests.get(f"{BASE_URL}/api/social/feed", params={"scope": "city", "kind": "give", "limit": 10}, headers=H(demo_token), timeout=15)
        assert r.status_code == 200
        for item in r.json()["items"]:
            assert item["kind"] == "give"
        r = requests.get(f"{BASE_URL}/api/social/feed", params={"scope": "city", "category": "furniture", "limit": 10}, headers=H(demo_token), timeout=15)
        assert r.status_code == 200
        for item in r.json()["items"]:
            assert item["category"] == "furniture"
        r = requests.get(f"{BASE_URL}/api/social/feed", params={"scope": "city", "q": "sofa", "limit": 10}, headers=H(demo_token), timeout=15)
        assert r.status_code == 200


# ─── my posts ───
class TestMine:
    def test_posts_mine(self, demo_token):
        r = requests.get(f"{BASE_URL}/api/social/posts/mine", headers=H(demo_token), timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "items" in d and "counts" in d


# ─── CRUD + status transitions + like + comments + hide/report + contact + uploads ───
class TestLifecycle:
    created_ids: list[str] = []

    def test_create_give_without_price_ok(self, demo_token):
        payload = {
            "title": "TEST_automation give lamp",
            "body": "Automation test free lamp",
            "kind": "give",
            "category": "decor",
            "condition": "good",
            "visibility": "city",
        }
        r = requests.post(f"{BASE_URL}/api/social/posts", json=payload, headers=H(demo_token), timeout=15)
        assert r.status_code == 200, r.text
        post = r.json()["post"]
        assert post["kind"] == "give" and post["price"] in (None, 0)
        TestLifecycle.created_ids.append(post["id"])

    def test_create_sell_without_price_422(self, demo_token):
        payload = {"title": "TEST_automation sell no price", "kind": "sell", "category": "decor", "condition": "good", "visibility": "city"}
        r = requests.post(f"{BASE_URL}/api/social/posts", json=payload, headers=H(demo_token), timeout=15)
        assert r.status_code == 422, r.text

    def test_create_invalid_category_422(self, demo_token):
        payload = {"title": "TEST_automation bad cat", "kind": "give", "category": "nope-not-real", "condition": "good", "visibility": "city"}
        r = requests.post(f"{BASE_URL}/api/social/posts", json=payload, headers=H(demo_token), timeout=15)
        assert r.status_code == 422, r.text

    def test_create_sell_with_price_and_detail(self, demo_token):
        payload = {
            "title": "TEST_automation sell lamp",
            "body": "automation sell",
            "kind": "sell",
            "price": 5000,
            "category": "decor",
            "condition": "like_new",
            "visibility": "city",
        }
        r = requests.post(f"{BASE_URL}/api/social/posts", json=payload, headers=H(demo_token), timeout=15)
        assert r.status_code == 200, r.text
        pid = r.json()["post"]["id"]
        TestLifecycle.created_ids.append(pid)
        # detail
        r2 = requests.get(f"{BASE_URL}/api/social/posts/{pid}", headers=H(demo_token), timeout=15)
        assert r2.status_code == 200
        d = r2.json()
        for key in ("comments", "similar", "can_contact", "is_mine", "author_stats", "quick_messages"):
            assert key in d, f"missing {key}"
        assert d["is_mine"] is True
        assert d["can_contact"] is False  # own post

    def test_edit_title_and_status_transitions(self, demo_token):
        pid = TestLifecycle.created_ids[-1]
        # edit title
        r = requests.patch(f"{BASE_URL}/api/social/posts/{pid}", json={"title": "TEST_automation sell lamp (edited)"}, headers=H(demo_token), timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["post"]["title"].endswith("(edited)")
        assert r.json()["post"]["edited"] is True
        # active→reserved→gone→active→paused
        for status in ("reserved", "gone", "active", "paused"):
            r = requests.patch(f"{BASE_URL}/api/social/posts/{pid}", json={"status": status}, headers=H(demo_token), timeout=15)
            assert r.status_code == 200, (status, r.text)
            assert r.json()["post"]["status"] == status
        # paused post should not appear in city feed
        r = requests.get(f"{BASE_URL}/api/social/feed", params={"scope": "city", "limit": 50}, headers=H(demo_token), timeout=15)
        ids = [p["id"] for p in r.json()["items"]]
        assert pid not in ids, "paused post should not be in feed"
        # back to active for later tests
        requests.patch(f"{BASE_URL}/api/social/posts/{pid}", json={"status": "active"}, headers=H(demo_token), timeout=15)

    def test_like_toggle(self, demo_token, other_token):
        pid = TestLifecycle.created_ids[-1]
        # non-owner likes
        r = requests.post(f"{BASE_URL}/api/social/posts/{pid}/like", headers=H(other_token), timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["liked"] is True and d["like_count"] >= 1
        # toggle off
        r = requests.post(f"{BASE_URL}/api/social/posts/{pid}/like", headers=H(other_token), timeout=15)
        assert r.status_code == 200
        assert r.json()["liked"] is False

    def test_comment_lifecycle(self, demo_token, other_token):
        pid = TestLifecycle.created_ids[-1]
        r = requests.post(f"{BASE_URL}/api/social/posts/{pid}/comments", json={"body": "TEST_automation comment"}, headers=H(other_token), timeout=15)
        assert r.status_code == 200, r.text
        cid = r.json()["comment"]["id"]
        r = requests.get(f"{BASE_URL}/api/social/posts/{pid}/comments", headers=H(demo_token), timeout=15)
        assert r.status_code == 200
        assert any(c["id"] == cid for c in r.json()["items"])
        # delete own comment
        r = requests.delete(f"{BASE_URL}/api/social/posts/{pid}/comments/{cid}", headers=H(other_token), timeout=15)
        assert r.status_code == 200

    def test_hide_and_restore(self, demo_token, other_token):
        pid = TestLifecycle.created_ids[-1]
        r = requests.post(f"{BASE_URL}/api/social/posts/{pid}/hide", headers=H(other_token), timeout=15)
        assert r.status_code == 200
        r = requests.get(f"{BASE_URL}/api/social/feed", params={"scope": "city", "limit": 50}, headers=H(other_token), timeout=15)
        ids = [p["id"] for p in r.json()["items"]]
        assert pid not in ids
        r = requests.delete(f"{BASE_URL}/api/social/posts/{pid}/hide", headers=H(other_token), timeout=15)
        assert r.status_code == 200

    def test_report_scam_hides_for_reporter(self, demo_token, other_token):
        pid = TestLifecycle.created_ids[-1]
        r = requests.post(f"{BASE_URL}/api/social/posts/{pid}/report", json={"reason": "scam"}, headers=H(other_token), timeout=15)
        assert r.status_code == 200
        r = requests.get(f"{BASE_URL}/api/social/feed", params={"scope": "city", "limit": 50}, headers=H(other_token), timeout=15)
        ids = [p["id"] for p in r.json()["items"]]
        assert pid not in ids
        # cleanup hide for later queries
        requests.delete(f"{BASE_URL}/api/social/posts/{pid}/hide", headers=H(other_token), timeout=15)

    def test_contact_chat_other_user(self, demo_token, other_token):
        pid = TestLifecycle.created_ids[-1]
        r = requests.post(
            f"{BASE_URL}/api/social/posts/{pid}/contact",
            json={"channel": "chat", "message": "TEST_automation ping"},
            headers=H(other_token),
            timeout=15,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["channel"] == "chat" and d.get("conversation_id")

    def test_contact_own_post_rejected(self, demo_token):
        pid = TestLifecycle.created_ids[-1]
        r = requests.post(
            f"{BASE_URL}/api/social/posts/{pid}/contact",
            json={"channel": "chat", "message": "hi self"},
            headers=H(demo_token),
            timeout=15,
        )
        assert r.status_code == 400, r.text

    def test_upload_returns_fetchable_url(self, demo_token):
        r = requests.post(f"{BASE_URL}/api/social/posts/uploads", json={"data_url": PNG_DATA_URL}, headers=H(demo_token), timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("url") and d.get("path")
        # fetch
        fetch_url = d["url"] if d["url"].startswith("http") else BASE_URL + d["url"]
        fr = requests.get(fetch_url, timeout=20)
        assert fr.status_code == 200, f"public file not fetchable: {fr.status_code}"
        assert fr.content[:8] == b"\x89PNG\r\n\x1a\n", "Returned content isn't a PNG"

    def test_delete_post_then_404(self, demo_token):
        # delete all created
        for pid in TestLifecycle.created_ids:
            r = requests.delete(f"{BASE_URL}/api/social/posts/{pid}", headers=H(demo_token), timeout=15)
            assert r.status_code == 200, (pid, r.text)
            r2 = requests.get(f"{BASE_URL}/api/social/posts/{pid}", headers=H(demo_token), timeout=15)
            assert r2.status_code == 404
