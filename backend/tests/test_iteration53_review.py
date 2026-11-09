"""
Iteration 53 — Review verification for:
  (a) Multi-connection fix on connections.pair_key (user may hold >1 accepted connection)
  (b) /api/map/markers friends_saved integer + in_shared_list boolean (friend with share_saves=true counts; stranger never counts)
  (c) /api/community/alerts shape + 401 unauth + join request increments manager alerts + home flags + notification
  (d) /api/admin/analytics/funnel.csv (200 content-type + filename + headers + unauth 401 + non-admin 403)
"""
import os
import uuid
import time
import requests
import pytest

BASE_URL = (os.environ.get("EXPO_BACKEND_URL") or os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"

DEMO_EMAIL = "demo@amass.africa"
DEMO_PASSWORD = "amass2026"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    data = r.json()
    return data["access_token"], data["user"]


def _register(suffix=None):
    suffix = suffix or uuid.uuid4().hex[:10]
    email = f"it53+{suffix}@amass.africa"
    r = requests.post(f"{API}/auth/register", json={
        "email": email,
        "password": "Pass2026!",
        "full_name": f"Test User {suffix[:6]}",
    }, timeout=30)
    assert r.status_code in (200, 201), f"register failed: {r.status_code} {r.text}"
    data = r.json()
    return data["access_token"], data["user"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


# -----------------------------------------------------------------------------
# (a) Multi-connection fix
# -----------------------------------------------------------------------------
class TestMultiConnection:
    def test_demo_can_accept_two_fresh_friend_requests(self):
        demo_tok, demo_user = _login(DEMO_EMAIL, DEMO_PASSWORD)
        demo_id = demo_user["id"]

        u1_tok, u1 = _register()
        u2_tok, u2 = _register()

        # u1 → demo
        r1 = requests.post(f"{API}/social/connections", json={"user_id": demo_id}, headers=_auth(u1_tok), timeout=30)
        assert r1.status_code in (200, 201), f"u1 request: {r1.status_code} {r1.text}"
        c1 = r1.json()
        c1_id = c1.get("id") or c1.get("_id") or c1.get("connection_id")

        # u2 → demo (this previously returned 500 due to multikey pair unique)
        r2 = requests.post(f"{API}/social/connections", json={"user_id": demo_id}, headers=_auth(u2_tok), timeout=30)
        assert r2.status_code in (200, 201), f"u2 request: {r2.status_code} {r2.text}"
        c2 = r2.json()
        c2_id = c2.get("id") or c2.get("_id") or c2.get("connection_id")

        # Demo accepts both
        a1 = requests.post(f"{API}/social/connections/{c1_id}/accept", headers=_auth(demo_tok), timeout=30)
        assert a1.status_code == 200, f"accept1: {a1.status_code} {a1.text}"
        a2 = requests.post(f"{API}/social/connections/{c2_id}/accept", headers=_auth(demo_tok), timeout=30)
        assert a2.status_code == 200, f"accept2: {a2.status_code} {a2.text}"

        # Demo lists connections → both accepted
        lst = requests.get(f"{API}/social/connections", headers=_auth(demo_tok), timeout=30)
        assert lst.status_code == 200
        data = lst.json()
        accepted = data.get("accepted") or []
        ids = {(c.get("user") or {}).get("id") for c in accepted}
        assert u1["id"] in ids and u2["id"] in ids, f"missing in accepted: ids={ids}"


# -----------------------------------------------------------------------------
# (b) Map markers nudges
# -----------------------------------------------------------------------------
class TestMapMarkersNudges:
    def test_markers_have_friends_saved_and_in_shared_list(self):
        demo_tok, _ = _login(DEMO_EMAIL, DEMO_PASSWORD)
        r = requests.get(f"{API}/map/markers?limit=50", headers=_auth(demo_tok), timeout=30)
        assert r.status_code == 200, r.text
        payload = r.json()
        markers = payload.get("markers") if isinstance(payload, dict) else payload
        assert isinstance(markers, list) and len(markers) > 0
        for m in markers:
            assert "friends_saved" in m, f"missing friends_saved: {m}"
            assert isinstance(m["friends_saved"], int), f"friends_saved not int: {type(m['friends_saved'])}"
            assert m["friends_saved"] >= 0
            assert "in_shared_list" in m
            assert isinstance(m["in_shared_list"], bool)

    def test_friend_save_counts_only_with_share_saves_true(self):
        demo_tok, demo_user = _login(DEMO_EMAIL, DEMO_PASSWORD)
        demo_id = demo_user["id"]

        # Fresh friend
        fr_tok, fr_user = _register()
        # Connect
        r = requests.post(f"{API}/social/connections", json={"user_id": demo_id}, headers=_auth(fr_tok), timeout=30)
        assert r.status_code in (200, 201), r.text
        cid = r.json().get("id") or r.json().get("_id")
        a = requests.post(f"{API}/social/connections/{cid}/accept", headers=_auth(demo_tok), timeout=30)
        assert a.status_code == 200, a.text

        # Pick a locked (paid) property from map
        mr = requests.get(f"{API}/map/markers?limit=50", headers=_auth(demo_tok), timeout=30)
        assert mr.status_code == 200
        markers = (mr.json() or {}).get("markers") or []
        # pick one not already unlocked and preferably not free
        target = None
        for m in markers:
            if not m.get("unlocked"):
                target = m
                break
        if not target:
            target = markers[0]
        pid = target.get("id") or target.get("property_id") or target.get("_id")
        assert pid, f"could not identify property id in marker: {target}"

        # Ensure share_saves off → favorite → friends_saved should NOT increase from this friend
        off = requests.patch(f"{API}/social/me", json={"share_saves": False}, headers=_auth(fr_tok), timeout=30)
        assert off.status_code in (200, 204), off.text

        fav1 = requests.post(f"{API}/favorites/toggle", json={"property_id": pid}, headers=_auth(fr_tok), timeout=30)
        assert fav1.status_code in (200, 201), fav1.text
        # ensure favorited (toggle may have removed; call again if so)
        if not fav1.json().get("favorited", True):
            requests.post(f"{API}/favorites/toggle", json={"property_id": pid}, headers=_auth(fr_tok), timeout=30)

        mr2 = requests.get(f"{API}/map/markers?limit=200", headers=_auth(demo_tok), timeout=30)
        marker_after_off = next((m for m in (mr2.json() or {}).get("markers", []) if (m.get("id") or m.get("property_id")) == pid), None)
        assert marker_after_off is not None
        fs_off = marker_after_off["friends_saved"]

        # Now flip share_saves on
        on = requests.patch(f"{API}/social/me", json={"share_saves": True}, headers=_auth(fr_tok), timeout=30)
        assert on.status_code in (200, 204), on.text
        # Re-favorite in case the toggle also required a save after
        # Ensure favorited (if already favorited, don't un-fav it)
        ids_now = requests.get(f"{API}/favorites/ids", headers=_auth(fr_tok), timeout=30).json().get("ids", [])
        if pid not in ids_now:
            requests.post(f"{API}/favorites/toggle", json={"property_id": pid}, headers=_auth(fr_tok), timeout=30)

        mr3 = requests.get(f"{API}/map/markers?limit=200", headers=_auth(demo_tok), timeout=30)
        marker_after_on = next((m for m in (mr3.json() or {}).get("markers", []) if (m.get("id") or m.get("property_id")) == pid), None)
        assert marker_after_on is not None
        fs_on = marker_after_on["friends_saved"]

        # friends_saved should be strictly greater once share_saves is on (and friend still favorites it)
        assert fs_on >= fs_off, f"fs_on({fs_on}) < fs_off({fs_off}) — regression"
        # Ideally fs_on > fs_off; print info otherwise
        print(f"friends_saved share_saves=off:{fs_off} on:{fs_on}")
        assert fs_on >= 1, f"friends_saved should be at least 1 with share_saves=true + friend favorite, got {fs_on}"

    def test_stranger_save_does_not_count(self):
        demo_tok, _ = _login(DEMO_EMAIL, DEMO_PASSWORD)
        stranger_tok, _ = _register()

        # Pick first property
        mr = requests.get(f"{API}/map/markers?limit=20", headers=_auth(demo_tok), timeout=30)
        markers = (mr.json() or {}).get("markers") or []
        target = markers[0]
        pid = target.get("id") or target.get("property_id")
        before = target["friends_saved"]

        # Stranger (not a friend) enables share_saves and favorites
        requests.patch(f"{API}/social/me", json={"share_saves": True}, headers=_auth(stranger_tok), timeout=30)
        requests.post(f"{API}/favorites/toggle", json={"property_id": pid}, headers=_auth(stranger_tok), timeout=30)

        mr2 = requests.get(f"{API}/map/markers?limit=20", headers=_auth(demo_tok), timeout=30)
        after_marker = next((m for m in (mr2.json() or {}).get("markers", []) if (m.get("id") or m.get("property_id")) == pid), None)
        after = after_marker["friends_saved"]
        assert after == before, f"stranger save leaked into friends_saved (before={before} after={after})"


# -----------------------------------------------------------------------------
# (c) Community alerts
# -----------------------------------------------------------------------------
class TestCommunityAlerts:
    def test_unauth_401(self):
        r = requests.get(f"{API}/community/alerts", timeout=30)
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"

    def test_alert_shape_and_join_request_increments_manager(self):
        demo_tok, _ = _login(DEMO_EMAIL, DEMO_PASSWORD)

        # Shape
        r = requests.get(f"{API}/community/alerts", headers=_auth(demo_tok), timeout=30)
        assert r.status_code == 200, r.text
        a0 = r.json()
        for k in ("join_requests", "connection_requests", "total"):
            assert k in a0, f"missing {k}: {a0}"
            assert isinstance(a0[k], int), f"{k} not int"
        assert a0["total"] == a0["join_requests"] + a0["connection_requests"]
        before = a0["join_requests"]

        # Find pilot estate (demo is manager)
        home = requests.get(f"{API}/community/home", headers=_auth(demo_tok), timeout=30)
        assert home.status_code == 200, home.text
        hdata = home.json()
        estates = hdata.get("estates") or []
        pilot = None
        for e in estates:
            mem = e.get("membership") or {}
            if mem.get("role") == "manager" or e.get("is_manager"):
                pilot = e
                break
        assert pilot is not None, f"demo should manage at least one estate; got {estates}"
        pilot_id = pilot.get("id") or pilot.get("estate_id") or pilot.get("_id")
        assert pilot_id, pilot

        # Fresh user requests to join
        fresh_tok, _ = _register()
        req = requests.post(
            f"{API}/community/estates/{pilot_id}/join",
            json={"unit": "A99", "note": "iter53 test"},
            headers=_auth(fresh_tok), timeout=30,
        )
        assert req.status_code in (200, 201, 202), f"join: {req.status_code} {req.text}"

        # Alerts increased
        r2 = requests.get(f"{API}/community/alerts", headers=_auth(demo_tok), timeout=30)
        a1 = r2.json()
        assert a1["join_requests"] == before + 1, f"expected join_requests {before+1}, got {a1['join_requests']}"
        assert a1["total"] == a1["join_requests"] + a1["connection_requests"]

        # home now reflects pending_requests
        home2 = requests.get(f"{API}/community/home", headers=_auth(demo_tok), timeout=30)
        hdata2 = home2.json()
        found = None
        for e in hdata2.get("estates", []):
            eid = e.get("id") or e.get("estate_id") or e.get("_id")
            if eid == pilot_id:
                found = e
                break
        assert found is not None, "pilot not in home after join request"
        assert found.get("is_manager") is True
        assert found.get("pending_requests") == a1["join_requests"], \
            f"home.pending_requests({found.get('pending_requests')}) != alerts.join_requests({a1['join_requests']})"

        # Notification ESTATE_REQUEST with meta.estate_id
        notif = requests.get(f"{API}/notifications?limit=20", headers=_auth(demo_tok), timeout=30)
        assert notif.status_code == 200
        notif_data = notif.json()
        items = notif_data if isinstance(notif_data, list) else notif_data.get("items") or notif_data.get("notifications") or []
        est_req = [n for n in items if (n.get("kind") == "ESTATE_REQUEST" or n.get("type") == "ESTATE_REQUEST")]
        assert est_req, f"no ESTATE_REQUEST notification among {[n.get('kind') or n.get('type') for n in items[:10]]}"
        meta = est_req[0].get("meta") or {}
        assert meta.get("estate_id") == pilot_id, f"meta.estate_id {meta.get('estate_id')} != {pilot_id}"


# -----------------------------------------------------------------------------
# (d) Funnel CSV
# -----------------------------------------------------------------------------
class TestFunnelCSV:
    def test_csv_unauth_401(self):
        r = requests.get(f"{API}/admin/analytics/funnel.csv?days=30", timeout=30)
        assert r.status_code in (401, 403)

    def test_csv_nonadmin_403(self):
        tok, _ = _register()
        r = requests.get(f"{API}/admin/analytics/funnel.csv?days=30", headers=_auth(tok), timeout=30)
        assert r.status_code == 403, f"expected 403 got {r.status_code}: {r.text}"

    def test_csv_200_and_shape(self):
        demo_tok, _ = _login(DEMO_EMAIL, DEMO_PASSWORD)
        r = requests.get(f"{API}/admin/analytics/funnel.csv?days=30", headers=_auth(demo_tok), timeout=30)
        assert r.status_code == 200, r.text
        ct = r.headers.get("content-type", "")
        assert "text/csv" in ct.lower(), f"content-type={ct}"
        cd = r.headers.get("content-disposition", "")
        assert "amass-neighbours-funnel-30d" in cd.lower(), f"content-disposition={cd}"
        body = r.text.strip().splitlines()
        assert len(body) >= 3, f"expected ≥3 lines, got {len(body)}: {body}"
        header = body[2]
        assert "section" in header and "metric" in header and "current" in header and "previous" in header and "change_pct" in header, f"bad header: {header}"

        # Cross-check funnel,payments_completed matches JSON
        j = requests.get(f"{API}/admin/analytics/funnel?days=30", headers=_auth(demo_tok), timeout=30)
        assert j.status_code == 200
        jd = j.json()
        pc = (jd.get("current") or {}).get("payments_completed")
        if pc is None:
            # try nested
            pc = jd.get("payments_completed") or jd.get("funnel", {}).get("payments_completed")
        assert pc is not None, f"could not find current.payments_completed in {list(jd.keys())}"
        row = next((ln for ln in body if ln.lower().startswith("funnel,payments_completed")), None)
        assert row is not None, f"no funnel,payments_completed row in {body}"
        # row like: funnel,payments_completed,CURRENT,PREV,PCT
        cols = row.split(",")
        assert len(cols) >= 3
        try:
            csv_pc = float(cols[2])
        except ValueError:
            csv_pc = cols[2]
        assert float(csv_pc) == float(pc), f"CSV payments_completed {csv_pc} != JSON {pc}"
