# Iteration 109 retest: feed moderation quick checks (overview counts, strikes, suspend/restore, 403 on suspended)
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", os.environ.get("EXPO_BACKEND_URL", "")).rstrip("/")
DEMO = {"email": "demo@amass.africa", "password": "amass2026"}
CREATED = []


@pytest.fixture(scope="module")
def s():
    r = requests.post(f"{BASE_URL}/api/auth/login", json=DEMO, timeout=30)
    assert r.status_code == 200
    sess = requests.Session()
    sess.headers.update({"Authorization": f"Bearer {r.json()['access_token']}"})
    sess.uid = sess.get(f"{BASE_URL}/api/auth/me", timeout=30).json()["id"]
    yield sess
    # ALWAYS restore + clear strikes for demo, delete created posts
    sess.post(f"{BASE_URL}/api/feed/admin/users/{sess.uid}/action", json={"action": "restore"}, timeout=30)
    sess.post(f"{BASE_URL}/api/feed/admin/users/{sess.uid}/action", json={"action": "clear_strikes"}, timeout=30)
    for pid in CREATED:
        sess.delete(f"{BASE_URL}/api/feed/posts/{pid}", timeout=30)


def _strikes(s):
    items = s.get(f"{BASE_URL}/api/feed/admin/users", params={"q": "demo"}, timeout=30).json()["items"]
    me = [i for i in items if i["id"] == s.uid]
    return me[0]["strikes"] if me else 0


def _general(s, body):
    r = s.post(f"{BASE_URL}/api/feed/posts", json={"type": "general", "body": body, "photos": [], "videos": [], "visibility": "city", "contact_chat": True}, timeout=30)
    assert r.status_code == 201, r.text
    pid = r.json()["post"]["id"] if "post" in r.json() else r.json()["id"]
    CREATED.append(pid)
    return pid


def _wait_mod(s, pid, secs=30):
    for _ in range(secs // 3):
        d = s.get(f"{BASE_URL}/api/feed/posts/mine", timeout=30).json()["items"]
        it = next((i for i in d if i["id"] == pid), None)
        if it and (it.get("moderation") or {}).get("status") not in (None, "pending"):
            return it
        time.sleep(3)
    return it


class TestOverview:
    # overview flagged/review exclude author-deleted posts
    def test_counts_unchanged_after_create_delete(self, s):
        ov0 = s.get(f"{BASE_URL}/api/feed/admin/overview", timeout=30).json()
        pid = _general(s, "TEST_ overview check post")
        _wait_mod(s, pid, 15)
        assert s.delete(f"{BASE_URL}/api/feed/posts/{pid}", timeout=30).status_code == 200
        ov1 = s.get(f"{BASE_URL}/api/feed/admin/overview", timeout=30).json()
        assert ov1["flagged"] == ov0["flagged"] and ov1["review"] == ov0["review"], (ov0, ov1)


class TestStrikes:
    # removing an already-removed post adds no second strike; clear_strikes resets
    def test_double_remove_single_strike(self, s):
        s.post(f"{BASE_URL}/api/feed/admin/users/{s.uid}/action", json={"action": "clear_strikes"}, timeout=30)
        assert _strikes(s) == 0
        pid = _general(s, "TEST_ strike check post")
        r = s.post(f"{BASE_URL}/api/feed/admin/posts/{pid}/decide", json={"action": "remove", "note": "retest"}, timeout=30)
        assert r.status_code == 200 and r.json()["status"] == "removed"
        assert _strikes(s) == 1
        r = s.post(f"{BASE_URL}/api/feed/admin/posts/{pid}/decide", json={"action": "remove", "note": "retest again"}, timeout=30)
        assert r.status_code == 200
        assert _strikes(s) == 1

    def test_clear_strikes(self, s):
        r = s.post(f"{BASE_URL}/api/feed/admin/users/{s.uid}/action", json={"action": "clear_strikes"}, timeout=30)
        assert r.status_code == 200, r.text
        assert _strikes(s) == 0


class TestSuspend:
    # suspend -> restore preserves reserved; suspended author cannot post
    def test_suspend_restore_reserved(self, s):
        r = s.post(f"{BASE_URL}/api/feed/posts", json={"type": "sale", "title": "TEST_ retest wooden chair", "body": "Solid wooden dining chair, light wear.", "price": 15000, "category": "furniture", "condition": "good", "visibility": "city", "contact_chat": True}, timeout=30)
        if r.status_code == 422:
            r = s.post(f"{BASE_URL}/api/feed/posts", json={"type": "sale", "title": "TEST_ retest wooden chair", "body": "Solid wooden dining chair, light wear.", "price": 15000, "category": "other", "condition": "good", "visibility": "city", "contact_chat": True}, timeout=30)
        assert r.status_code == 201, r.text
        pid = r.json()["post"]["id"] if "post" in r.json() else r.json()["id"]
        CREATED.append(pid)
        _wait_mod(s, pid, 24)
        r = s.patch(f"{BASE_URL}/api/feed/posts/{pid}", json={"status": "reserved"}, timeout=30)
        assert r.status_code == 200, r.text
        mine = lambda: next(i for i in s.get(f"{BASE_URL}/api/feed/posts/mine", timeout=30).json()["items"] if i["id"] == pid)
        assert mine()["status"] == "reserved"
        try:
            r = s.post(f"{BASE_URL}/api/feed/admin/users/{s.uid}/action", json={"action": "suspend", "note": "retest"}, timeout=30)
            assert r.status_code == 200, r.text
            assert mine()["status"] == "paused"
            r = s.post(f"{BASE_URL}/api/feed/posts", json={"type": "general", "body": "TEST_ suspended post", "photos": [], "videos": [], "visibility": "city", "contact_chat": True}, timeout=30)
            if r.status_code == 201:
                CREATED.append(r.json().get("post", r.json()).get("id"))
            assert r.status_code == 403, r.text
        finally:
            s.post(f"{BASE_URL}/api/feed/admin/users/{s.uid}/action", json={"action": "restore"}, timeout=30)
        assert mine()["status"] == "reserved"
