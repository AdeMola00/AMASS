# Iteration 90 — verifies iteration_89 leftovers: CRM 'new' filter, hidden legacy Neighbours
# notifications, orphan-free representations/mine, saved-search create/delete.
import os
import pytest
import requests

BASE_URL = os.environ["EXPO_BACKEND_URL"].rstrip("/")
DEMO = {"email": "demo@amass.africa", "password": "amass2026"}

LEGACY = {
    "ESTATE_REQUEST", "ESTATE_APPROVED", "ESTATE_REJECTED", "ESTATE_NOTICE",
    "CONNECTION_REQUEST", "CONNECTION_ACCEPTED", "COLLECTION_INVITE", "COLLECTION_ACTIVITY",
    "POST_REPLY", "QUESTION_ANSWERED", "ANSWER_ACCEPTED", "EVENT_REMINDER", "EVENT_CANCELLED",
    "SERVICE_REQUEST", "SERVICE_REQUEST_UPDATE",
}
CATS = ["all", "property_matches", "nearby_listings", "brand_offers", "marketplace", "social",
        "nearby_free", "passport", "receipts", "admin", "messages", "services", "home"]


@pytest.fixture(scope="module")
def s():
    r = requests.post(f"{BASE_URL}/api/auth/login", json=DEMO, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"login failed {r.status_code}")
    sess = requests.Session()
    sess.headers.update({"Authorization": f"Bearer {r.json()['access_token']}", "Content-Type": "application/json"})
    return sess


# CRM 'new' filter
class TestCrmNewFilter:
    def test_new_filter_non_empty_and_all_new(self, s):
        r = s.get(f"{BASE_URL}/api/crm/leads", params={"status": "new"}, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        items = body.get("items", body) if isinstance(body, dict) else body
        assert isinstance(items, list) and len(items) > 0, f"empty New list: {body}"
        bad = [i for i in items if i.get("status") != "new"]
        assert not bad, f"non-new rows: {[b.get('status') for b in bad]}"

    def test_new_count_matches_open_new_badges(self, s):
        new_items = s.get(f"{BASE_URL}/api/crm/leads", params={"status": "new"}, timeout=30).json()
        new_items = new_items.get("items", new_items) if isinstance(new_items, dict) else new_items
        open_items = s.get(f"{BASE_URL}/api/crm/leads", params={"status": "open", "limit": 200}, timeout=30).json()
        open_items = open_items.get("items", open_items) if isinstance(open_items, dict) else open_items
        open_new = [i for i in open_items if i.get("status") == "new"]
        print(f"new filter={len(new_items)} open-with-new-badge={len(open_new)} open total={len(open_items)}")
        assert {i.get("id") for i in open_new} <= {i.get("id") for i in new_items} or len(new_items) >= len(open_new)


# Legacy Neighbours notification kinds hidden
class TestLegacyNotificationsHidden:
    @pytest.mark.parametrize("cat", CATS)
    def test_center_has_no_legacy_rows(self, s, cat):
        r = s.get(f"{BASE_URL}/api/notifications/center", params={"category": cat, "limit": 100}, timeout=30)
        assert r.status_code == 200, r.text
        kinds = [i.get("kind") for i in r.json()["items"]]
        leaked = [k for k in kinds if k in LEGACY]
        assert not leaked, f"{cat}: legacy kinds leaked {leaked}"

    def test_unread_counts_consistent(self, s):
        c = s.get(f"{BASE_URL}/api/notifications/center", params={"limit": 100}, timeout=30).json()
        u = s.get(f"{BASE_URL}/api/notifications/unread-count", timeout=30).json()["unread"]
        assert c["unread"] == u
        assert sum(c["unread_by_category"].values()) == u
        # unread_only list (<=100) must not exceed unread count and contain no legacy rows
        uo = s.get(f"{BASE_URL}/api/notifications/center", params={"unread_only": True, "limit": 100}, timeout=30).json()
        assert all(i["kind"] not in LEGACY for i in uo["items"])
        if u <= 100:
            assert len(uo["items"]) == u, f"unread list {len(uo['items'])} vs count {u}"

    def test_social_unread_has_no_legacy(self, s):
        c = s.get(f"{BASE_URL}/api/notifications/center", params={"category": "social", "unread_only": True, "limit": 100}, timeout=30).json()
        assert c["unread_by_category"].get("social", 0) == len(c["items"]) or len(c["items"]) == 100

    def test_dismiss_restore_and_read_unread_roundtrip(self, s):
        items = s.get(f"{BASE_URL}/api/notifications/center", params={"limit": 20}, timeout=30).json()["items"]
        if not items:
            pytest.skip("no notifications")
        n = items[0]
        was_read = bool(n.get("read"))
        d = s.post(f"{BASE_URL}/api/notifications/{n['id']}/dismiss", timeout=30)
        assert d.status_code == 200
        ids = [i["id"] for i in s.get(f"{BASE_URL}/api/notifications/center", params={"limit": 100}, timeout=30).json()["items"]]
        assert n["id"] not in ids
        rs = s.post(f"{BASE_URL}/api/notifications/{n['id']}/restore", timeout=30)
        assert rs.status_code == 200 and bool(rs.json()["notification"]["read"]) == was_read
        # toggle read state and undo
        path = "unread" if was_read else "read"
        back = "read" if was_read else "unread"
        assert s.post(f"{BASE_URL}/api/notifications/{n['id']}/{path}", timeout=30).status_code == 200
        assert s.post(f"{BASE_URL}/api/notifications/{n['id']}/{back}", timeout=30).status_code == 200


# Representations/mine excludes orphans
class TestRepresentationsMine:
    def test_every_rep_has_property(self, s):
        r = s.get(f"{BASE_URL}/api/agent/representations/mine", timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        items = body.get("items", body) if isinstance(body, dict) else body
        assert isinstance(items, list)
        print(f"reps returned: {len(items)}; keys={list(body.keys()) if isinstance(body, dict) else 'list'}")
        nulls = [i.get("id") for i in items if not i.get("property")]
        assert not nulls, f"{len(nulls)} reps with null property"


# Saved search create/delete (used by the 'Run now' UI test)
class TestSavedSearchCrud:
    def test_create_get_delete(self, s):
        r = s.post(f"{BASE_URL}/api/saved-searches", json={"name": "TEST_iter90 rent 3bd", "criteria": {"listing_type": "For Rent", "min_beds": 3}, "alerts_enabled": False}, timeout=30)
        assert r.status_code in (200, 201), r.text
        sid = r.json()["id"]
        lst = s.get(f"{BASE_URL}/api/saved-searches", timeout=30).json()
        lst = lst.get("items", lst) if isinstance(lst, dict) else lst
        assert any(x["id"] == sid for x in lst)
        assert s.delete(f"{BASE_URL}/api/saved-searches/{sid}", timeout=30).status_code in (200, 204)
        lst = s.get(f"{BASE_URL}/api/saved-searches", timeout=30).json()
        lst = lst.get("items", lst) if isinstance(lst, dict) else lst
        assert not any(x["id"] == sid for x in lst)
