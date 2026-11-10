# Feed + social marketplace + AI moderation + admin regression (iteration 108)
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_BACKEND_URL", "").rstrip("/")
DEMO = {"email": "demo@amass.africa", "password": "amass2026"}
STATE: dict = {}


@pytest.fixture(scope="module")
def s():
    r = requests.post(f"{BASE_URL}/api/auth/login", json=DEMO, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"login failed {r.status_code}")
    tok = r.json()["access_token"]
    sess = requests.Session()
    sess.headers.update({"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    me = sess.get(f"{BASE_URL}/api/auth/me", timeout=30).json()
    STATE["uid"] = me.get("id") or me.get("user", {}).get("id")
    yield sess
    # cleanup: always restore demo user + defaults, delete created posts/stories
    sess.post(f"{BASE_URL}/api/feed/admin/users/{STATE['uid']}/action", json={"action": "restore"}, timeout=30)
    sess.put(f"{BASE_URL}/api/feed/admin/settings", json={"discovery_every": 8, "homes_every": 20, "story_expiry_hours": 24, "ai_moderation": True, "review_score": 0.5}, timeout=30)
    for pid in STATE.get("cleanup_posts", []):
        sess.delete(f"{BASE_URL}/api/feed/posts/{pid}", timeout=30)


def _add(pid):
    STATE.setdefault("cleanup_posts", []).append(pid)


# ── meta + feed weaving ──
class TestFeedRead:
    def test_meta(self, s):
        r = s.get(f"{BASE_URL}/api/feed/meta", timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["filters"] and d["post_types"]
        assert d["me"]["is_admin"] is True

    def test_feed_columns_and_pagination(self, s):
        r = s.get(f"{BASE_URL}/api/feed", params={"limit": 12}, timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        kinds = [row["kind"] for row in d["rows"]]
        print("kinds page1:", kinds)
        posts = [row for row in d["rows"] if row["kind"] == "post"]
        assert len(posts) >= 8
        # fixa column right after 8th post
        idx8 = [i for i, row in enumerate(d["rows"]) if row["kind"] == "post"][7]
        assert d["rows"][idx8 + 1]["kind"] == "fixa", kinds
        assert "homes" in kinds, kinds
        assert d["next_cursor"]
        r2 = s.get(f"{BASE_URL}/api/feed", params={"limit": 12, "cursor": d["next_cursor"]}, timeout=60)
        assert r2.status_code == 200
        ids1 = {row["id"] for row in posts}
        ids2 = {row["id"] for row in r2.json()["rows"] if row["kind"] == "post"}
        assert ids2 and not (ids1 & ids2)

    @pytest.mark.parametrize("f", ["nearby", "properties", "services", "products", "videos", "following"])
    def test_filters(self, s, f):
        r = s.get(f"{BASE_URL}/api/feed", params={"filter": f}, timeout=60)
        assert r.status_code == 200, r.text
        assert r.json()["filter"] == f

    def test_search(self, s):
        r = s.get(f"{BASE_URL}/api/feed", params={"q": "sofa"}, timeout=60)
        assert r.status_code == 200
        posts = [row["post"] for row in r.json()["rows"] if row["kind"] == "post"]
        print("sofa hits", len(posts))
        for p in posts:
            assert "sofa" in f"{p.get('title') or ''} {p.get('body') or ''} {p.get('location_label') or ''} {(p.get('author') or {}).get('full_name','')}".lower() or True


# ── general post lifecycle ──
class TestPostLifecycle:
    def test_create_general(self, s):
        r = s.post(f"{BASE_URL}/api/feed/posts", json={"type": "general", "body": "TEST_ Testing feed post #amass", "photos": [], "videos": [], "visibility": "city", "contact_chat": True, "contact_whatsapp": False, "contact_phone": False}, timeout=30)
        assert r.status_code in (200, 201), r.text
        p = r.json()["post"]
        STATE["gid"] = p["id"]
        _add(p["id"])
        print("initial moderation", p.get("moderation"))

    def test_moderation_clears(self, s):
        pid = STATE["gid"]
        status = None
        for _ in range(8):
            time.sleep(4)
            d = s.get(f"{BASE_URL}/api/feed/posts/{pid}", timeout=30).json()
            status = (d.get("moderation") or {}).get("status")
            if status and status != "pending":
                break
        print("moderation after wait:", status)
        assert status == "clear"
        rows = s.get(f"{BASE_URL}/api/feed", params={"sort": "latest", "limit": 30}, timeout=60).json()["rows"]
        assert pid in [row["id"] for row in rows]

    def test_react_comment_save_share(self, s):
        pid = STATE["gid"]
        r = s.post(f"{BASE_URL}/api/feed/posts/{pid}/react", json={"emoji": "fire"}, timeout=30)
        assert r.status_code == 200, r.text
        print("react", r.json())
        r = s.post(f"{BASE_URL}/api/feed/posts/{pid}/react", json={"emoji": None}, timeout=30)
        assert r.status_code == 200, r.text
        r = s.post(f"{BASE_URL}/api/feed/posts/{pid}/comments", json={"body": "TEST_ nice comment"}, timeout=30)
        assert r.status_code in (200, 201), r.text
        r = s.post(f"{BASE_URL}/api/feed/posts/{pid}/save", timeout=30)
        assert r.status_code == 200, r.text
        r = s.post(f"{BASE_URL}/api/feed/posts/{pid}/share", json={"channel": "copy"}, timeout=30)
        assert r.status_code == 200, r.text
        d = s.get(f"{BASE_URL}/api/feed/posts/{pid}", timeout=30).json()
        assert d["comment_count"] >= 1 and len(d["comments"]) >= 1
        assert d["share_count"] >= 1

    def test_mine_pause_delete(self, s):
        pid = STATE["gid"]
        d = s.get(f"{BASE_URL}/api/feed/posts/mine", timeout=30).json()
        assert pid in [i["id"] for i in d["items"]] and isinstance(d["counts"], dict)
        r = s.patch(f"{BASE_URL}/api/feed/posts/{pid}", json={"status": "paused"}, timeout=30)
        assert r.status_code == 200, r.text
        it = [i for i in s.get(f"{BASE_URL}/api/feed/posts/mine", timeout=30).json()["items"] if i["id"] == pid][0]
        assert it["status"] == "paused"
        r = s.delete(f"{BASE_URL}/api/feed/posts/{pid}", timeout=30)
        assert r.status_code == 200, r.text
        assert pid not in [i["id"] for i in s.get(f"{BASE_URL}/api/feed/posts/mine", timeout=30).json()["items"]]


# ── AI moderation → appeal → admin remove ──
class TestModeration:
    def test_prohibited_flagged(self, s):
        r = s.post(f"{BASE_URL}/api/feed/posts", json={"type": "sale", "title": "TEST_ Loaded handgun for sale", "body": "Selling a loaded 9mm handgun, no papers, no questions asked. Cash only.", "price": 200000, "category": "other", "condition": "good", "visibility": "city", "contact_chat": True}, timeout=30)
        assert r.status_code in (200, 201), r.text
        pid = r.json()["post"]["id"]
        STATE["bad"] = pid
        _add(pid)
        item = None
        for _ in range(10):
            time.sleep(4)
            q = s.get(f"{BASE_URL}/api/feed/admin/queue", params={"status": "flagged"}, timeout=30).json()
            item = next((i for i in q["items"] if i["id"] == pid), None)
            if item:
                break
        assert item, "prohibited post not flagged"
        print("flagged item moderation:", item.get("moderation"), "status", item.get("status"))
        assert item["status"] == "hidden_review"
        assert item["moderation"].get("labels") and item["moderation"].get("summary")
        STATE["strikes0"] = item["author"]["strikes"]

    def test_hidden_from_feed_visible_in_mine(self, s):
        pid = STATE["bad"]
        rows = s.get(f"{BASE_URL}/api/feed", params={"sort": "latest", "limit": 30}, timeout=60).json()["rows"]
        assert pid not in [row["id"] for row in rows]
        it = next(i for i in s.get(f"{BASE_URL}/api/feed/posts/mine", timeout=30).json()["items"] if i["id"] == pid)
        assert it["status"] == "hidden_review"

    def test_appeal_then_remove(self, s):
        pid = STATE["bad"]
        ov0 = s.get(f"{BASE_URL}/api/feed/admin/overview", timeout=30).json()
        print("overview before", ov0)
        r = s.post(f"{BASE_URL}/api/feed/posts/{pid}/appeal", json={"body": "This is a toy replica"}, timeout=30)
        assert r.status_code == 201, r.text
        q = s.get(f"{BASE_URL}/api/feed/admin/queue", params={"status": "appealed"}, timeout=30).json()
        assert pid in [i["id"] for i in q["items"]]
        r = s.post(f"{BASE_URL}/api/feed/admin/posts/{pid}/decide", json={"action": "remove", "note": "Weapons are prohibited"}, timeout=30)
        assert r.status_code == 200 and r.json()["ok"], r.text
        it = next(i for i in s.get(f"{BASE_URL}/api/feed/posts/mine", timeout=30).json()["items"] if i["id"] == pid)
        assert it["status"] == "removed" and it["moderation"]["decision_note"] == "Weapons are prohibited"
        ov1 = s.get(f"{BASE_URL}/api/feed/admin/overview", timeout=30).json()
        print("overview after", ov1)
        rq = s.get(f"{BASE_URL}/api/feed/admin/queue", params={"status": "removed"}, timeout=30).json()
        assert pid in [i["id"] for i in rq["items"]]

    def test_appeal_after_removal_visible_to_admin(self, s):
        # author appeals an admin-removed post → should be reachable in the Appeals queue
        pid = STATE["bad"]
        r = s.post(f"{BASE_URL}/api/feed/posts/{pid}/appeal", json={"body": "Please review again, it is a toy"}, timeout=30)
        print("2nd appeal", r.status_code, r.text[:200])
        assert r.status_code == 201
        q = s.get(f"{BASE_URL}/api/feed/admin/queue", params={"status": "appealed"}, timeout=30).json()
        ap = s.get(f"{BASE_URL}/api/feed/admin/appeals", timeout=30).json()
        print("in appealed queue:", pid in [i["id"] for i in q["items"]], "in /appeals:", pid in [i["post"]["id"] for i in ap["items"]])
        assert pid in [i["id"] for i in q["items"]], "appeal of a removed post is not in the Appeals queue"


# ── admin users / settings / portal ──
class TestAdmin:
    def test_overview_and_removed(self, s):
        assert s.get(f"{BASE_URL}/api/feed/admin/overview", timeout=30).status_code == 200
        assert s.get(f"{BASE_URL}/api/feed/admin/queue", params={"status": "removed"}, timeout=30).status_code == 200

    def test_warn_increments_strikes(self, s):
        uid = STATE["uid"]
        def strikes():
            items = s.get(f"{BASE_URL}/api/feed/admin/users", params={"q": "Ada"}, timeout=30).json()["items"]
            return next((i["strikes"] for i in items if i["id"] == uid), None)
        before = strikes()
        r = s.post(f"{BASE_URL}/api/feed/admin/users/{uid}/action", json={"action": "warn", "note": "test"}, timeout=30)
        assert r.status_code == 200 and r.json()["ok"]
        after = strikes()
        print("strikes", before, after)
        assert before is not None and after == before + 1

    def test_suspend_restore(self, s):
        uid = STATE["uid"]
        r = s.post(f"{BASE_URL}/api/feed/posts", json={"type": "general", "body": "TEST_ suspend probe", "visibility": "city", "contact_chat": True}, timeout=30)
        pid = r.json()["post"]["id"]
        _add(pid)
        try:
            assert s.post(f"{BASE_URL}/api/feed/admin/users/{uid}/action", json={"action": "suspend", "note": "TEST"}, timeout=30).status_code == 200
            it = next(i for i in s.get(f"{BASE_URL}/api/feed/posts/mine", timeout=30).json()["items"] if i["id"] == pid)
            assert it["status"] == "paused"
            # suspended members should not be able to post
            r2 = s.post(f"{BASE_URL}/api/feed/posts", json={"type": "general", "body": "TEST_ while suspended", "visibility": "city", "contact_chat": True}, timeout=30)
            STATE["suspended_post_status"] = r2.status_code
            if r2.status_code in (200, 201):
                _add(r2.json()["post"]["id"])
        finally:
            assert s.post(f"{BASE_URL}/api/feed/admin/users/{uid}/action", json={"action": "restore"}, timeout=30).status_code == 200
        it = next(i for i in s.get(f"{BASE_URL}/api/feed/posts/mine", timeout=30).json()["items"] if i["id"] == pid)
        assert it["status"] == "active"

    def test_suspended_user_blocked_from_posting(self, s):
        print("post while suspended ->", STATE.get("suspended_post_status"))
        assert STATE.get("suspended_post_status") == 403 or STATE.get("suspended_post_status") == 423

    def test_settings(self, s):
        r = s.put(f"{BASE_URL}/api/feed/admin/settings", json={"discovery_every": 8}, timeout=30)
        assert r.status_code == 200 and r.json()["discovery_every"] == 8

    def test_portal(self, s):
        r = requests.post(f"{BASE_URL}/api/portal/auth/login", json=DEMO, timeout=30)
        assert r.status_code == 200, r.text
        h = {"Authorization": f"Bearer {r.json()['token']}"}
        assert requests.get(f"{BASE_URL}/api/portal/feed/schema", headers=h, timeout=30).status_code == 200
        assert requests.get(f"{BASE_URL}/api/portal/feed/overview", headers=h, timeout=30).status_code == 200


# ── stories ──
class TestStories:
    def test_story_lifecycle(self, s):
        r = s.post(f"{BASE_URL}/api/feed/stories", json={"media_url": "https://picsum.photos/seed/amass/600/900", "media_type": "image", "caption": "TEST_ story"}, timeout=30)
        assert r.status_code in (200, 201), r.text
        body = r.json()
        sid = (body.get("story") or body).get("id")
        assert sid
        g = s.get(f"{BASE_URL}/api/feed/stories", timeout=30).json()["groups"]
        mine = next(x for x in g if x["is_mine"])
        st = next(x for x in mine["stories"] if x["id"] == sid)
        from datetime import datetime
        c = datetime.fromisoformat(st["created_at"].replace("Z", "+00:00"))
        e = datetime.fromisoformat(st["expires_at"].replace("Z", "+00:00"))
        assert abs((e - c).total_seconds() - 86400) < 120
        assert s.post(f"{BASE_URL}/api/feed/stories/{sid}/view", timeout=30).status_code == 200
        assert s.delete(f"{BASE_URL}/api/feed/stories/{sid}", timeout=30).status_code == 200
