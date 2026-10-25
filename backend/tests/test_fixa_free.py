"""FIXA (free) — Join FIXA → admin verification → visible → free booking → provider confirm → customer rates →
reputation (jobs, rating, auto badges) · reports auto-hide after 3 distinct users and admin reinstates.
No tokens are involved anywhere: wallets never move."""
import os
import uuid

import pytest
import requests

BASE = os.environ.get("EXPO_BACKEND_URL", "http://localhost:8001").rstrip("/")
ADMIN = ("demo@amass.africa", "amass2026")


def _login(email, password):
    r = requests.post(f"{BASE}/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _hdr(tok, **extra):
    return {"Authorization": f"Bearer {tok}", **extra}


def _new_user(name="FIXA Tester"):
    email = f"fixa_{uuid.uuid4().hex[:10]}@amass-qa.africa"
    r = requests.post(f"{BASE}/api/auth/register", json={"email": email, "password": "Test1234!", "full_name": name})
    assert r.status_code == 200, r.text
    tok = r.json()["access_token"]
    me = requests.get(f"{BASE}/api/auth/me", headers=_hdr(tok)).json()
    return tok, me["id"]


def _mass(tok):
    return requests.get(f"{BASE}/api/wallet/me", headers=_hdr(tok)).json()["spendable"]


def _book(tok, pid, date="2026-07-10"):
    return requests.post(f"{BASE}/api/marketplace/fixa/book", headers=_hdr(tok), json={"item_id": pid, "customer_name": "Chi", "customer_phone": "08012345678", "address": "12 Admiralty Way, Lekki", "scheduled_date": date, "scheduled_time": "Morning", "notes": "Leaking tap"})


@pytest.fixture(scope="module")
def admin_tok():
    return _login(*ADMIN)


APPLY = {"business_name": "Bolu Plumbing Works", "categories": ["Plumbing", "Tiling"], "city": "Lagos", "service_areas": ["Lekki", "Ajah"], "phone": "0803 555 0101", "whatsapp": "+2348035550101", "years_experience": 7, "bio": "Fast, tidy plumbing repairs across Lekki."}


def test_categories_and_badge_rules():
    r = requests.get(f"{BASE}/api/fixa/categories")
    assert r.status_code == 200
    j = r.json()
    assert "Plumbing" in j["categories"] and j["report_reasons"]["no_show"]
    names = [b["name"] for b in j["badge_rules"]]
    assert names == ["AMASS Verified", "Rising", "Top Pro", "Veteran"]


def test_join_fixa_pending_until_admin_verifies(admin_tok):
    pro_tok, pro_id = _new_user("Bolu Pro")
    cust_tok, _ = _new_user("Customer")
    assert requests.get(f"{BASE}/api/fixa/me", headers=_hdr(pro_tok)).json()["status"] == "none"

    r = requests.post(f"{BASE}/api/fixa/apply", headers=_hdr(pro_tok), json=APPLY)
    assert r.status_code == 201, r.text
    prof = r.json()
    pid = prof["id"]
    assert prof["status"] == "pending" and prof["phone"] == "08035550101" and prof["whatsapp"] == "+2348035550101"
    assert prof["categories"] == ["Plumbing", "Tiling"] and prof["verified"] is False
    # applying twice → 409
    assert requests.post(f"{BASE}/api/fixa/apply", headers=_hdr(pro_tok), json=APPLY).status_code == 409
    me = requests.get(f"{BASE}/api/fixa/me", headers=_hdr(pro_tok)).json()
    assert me["status"] == "pending" and me["profile"]["id"] == pid and me["stats"]["jobs_completed"] == 0

    # hidden from customers until verified: not in lists, 404 on profile, can't be booked
    ids = [i["id"] for i in requests.get(f"{BASE}/api/fixa/providers", headers=_hdr(cust_tok), params={"subcategory": "Plumbing", "limit": 200}).json()["items"]]
    assert pid not in ids
    assert requests.get(f"{BASE}/api/fixa/providers/{pid}", headers=_hdr(cust_tok)).status_code == 404
    assert _book(cust_tok, pid).status_code == 409
    # owner can still open their own (pending) profile
    assert requests.get(f"{BASE}/api/fixa/providers/{pid}", headers=_hdr(pro_tok)).json()["is_owner"] is True

    # admin sees the application
    apps = requests.get(f"{BASE}/api/admin/fixa/applications", headers=_hdr(admin_tok), params={"status": "pending"}).json()
    mine = next(a for a in apps["items"] if a["id"] == pid)
    assert mine["user"]["id"] == pro_id and mine["stats"]["jobs_completed"] == 0
    assert requests.get(f"{BASE}/api/admin/fixa/applications", headers=_hdr(cust_tok)).status_code in (401, 403)
    ov = requests.get(f"{BASE}/api/admin/fixa/overview", headers=_hdr(admin_tok)).json()
    assert ov["pending"] >= 1

    # approve → visible with AMASS Verified badge, provider notified
    ap = requests.post(f"{BASE}/api/admin/fixa/applications/{pid}/approve", headers=_hdr(admin_tok), json={"note": "Welcome aboard"})
    assert ap.status_code == 200 and ap.json()["status"] == "verified"
    me = requests.get(f"{BASE}/api/fixa/me", headers=_hdr(pro_tok)).json()
    assert me["status"] == "verified" and me["profile"]["verified"] is True and "AMASS Verified" in me["profile"]["badges"]
    ids = [i["id"] for i in requests.get(f"{BASE}/api/fixa/providers", headers=_hdr(cust_tok), params={"subcategory": "Plumbing", "limit": 200}).json()["items"]]
    assert pid in ids
    pub = requests.get(f"{BASE}/api/fixa/providers/{pid}", headers=_hdr(cust_tok)).json()
    assert pub["phone"] == "08035550101" and pub["whatsapp"] and pub["service_areas"] == ["Lekki", "Ajah"]
    notifs = requests.get(f"{BASE}/api/notifications/center", headers=_hdr(pro_tok)).json()
    kinds = [n.get("kind") or n.get("type") for n in (notifs.get("items") or notifs.get("notifications") or [])]
    assert "FIXA_VERIFIED" in kinds or "FIXA_APPLIED" in kinds

    pytest.fixa_pid = pid
    pytest.fixa_pro_tok = pro_tok
    pytest.fixa_cust_tok = cust_tok


def test_free_booking_confirm_complete_rate_and_reputation():
    pid, pro_tok, cust_tok = pytest.fixa_pid, pytest.fixa_pro_tok, pytest.fixa_cust_tok
    before = _mass(cust_tok)
    # provider can't book themselves
    assert _book(pro_tok, pid).status_code == 400
    b = _book(cust_tok, pid)
    assert b.status_code == 200, b.text
    booking = b.json()["booking"]
    assert booking["status"] == "pending" and booking["provider_phone"] == "08035550101"
    assert _mass(cust_tok) == before  # nothing charged
    assert _book(cust_tok, pid, "2026-07-11").status_code == 409  # one open booking per provider

    # customer sees it; provider sees it as a job
    mine = requests.get(f"{BASE}/api/marketplace/fixa/bookings", headers=_hdr(cust_tok)).json()
    assert any(x["id"] == booking["id"] for x in mine)
    jobs = requests.get(f"{BASE}/api/fixa/jobs", headers=_hdr(pro_tok)).json()
    assert jobs["stats"]["pending_requests"] == 1 and jobs["items"][0]["id"] == booking["id"]
    # stranger can't act on the job
    assert requests.post(f"{BASE}/api/fixa/jobs/{booking['id']}/confirm", headers=_hdr(cust_tok)).status_code == 404
    # customer can't complete before it's confirmed? (allowed — but not after cancel). Provider confirms:
    c = requests.post(f"{BASE}/api/fixa/jobs/{booking['id']}/confirm", headers=_hdr(pro_tok), json={"note": "See you at 9am"})
    assert c.status_code == 200 and c.json()["status"] == "confirmed"
    assert requests.post(f"{BASE}/api/fixa/jobs/{booking['id']}/confirm", headers=_hdr(pro_tok)).status_code == 409
    prov_view = requests.get(f"{BASE}/api/fixa/providers/{pid}", headers=_hdr(cust_tok)).json()
    assert prov_view["my_open_booking"]["status"] == "confirmed"

    # customer marks done + rates 5★ → reputation updates, no wallet movement anywhere
    pro_before = _mass(pro_tok)
    done = requests.post(f"{BASE}/api/marketplace/fixa/bookings/{booking['id']}/complete", headers=_hdr(cust_tok), json={"rating": 5, "review": "Fixed in 20 minutes, very neat."})
    assert done.status_code == 200, done.text
    assert done.json()["rating"] == 5 and "awards" not in done.json()
    assert _mass(pro_tok) == pro_before and _mass(cust_tok) == before
    # idempotent
    assert requests.post(f"{BASE}/api/marketplace/fixa/bookings/{booking['id']}/complete", headers=_hdr(cust_tok), json={"rating": 1}).json()["already_completed"] is True
    prov = requests.get(f"{BASE}/api/fixa/providers/{pid}", headers=_hdr(cust_tok)).json()
    assert prov["jobs_completed"] == 1 and prov["rating"] == 5.0 and prov["reviews"] == 1
    assert prov["reviews_list"][0]["rating"] == 5 and prov["reviews_list"][0]["review"].startswith("Fixed")
    assert "Rising" not in prov["badges"]  # needs 5 jobs
    me = requests.get(f"{BASE}/api/fixa/me", headers=_hdr(pro_tok)).json()
    assert me["stats"]["jobs_completed"] == 1 and me["badge_rules"]
    # rating out of range rejected
    tok2, _ = _new_user()
    b2 = _book(tok2, pid, "2026-07-12").json()["booking"]
    assert requests.post(f"{BASE}/api/marketplace/fixa/bookings/{b2['id']}/complete", headers=_hdr(tok2), json={"rating": 9}).status_code == 422
    # cancelled booking can't be completed; provider decline closes it for the customer
    cn = requests.post(f"{BASE}/api/marketplace/fixa/bookings/{b2['id']}/cancel", headers=_hdr(tok2), json={})
    assert cn.status_code == 200
    assert requests.post(f"{BASE}/api/marketplace/fixa/bookings/{b2['id']}/complete", headers=_hdr(tok2), json={"rating": 4}).status_code == 409
    tok3, _ = _new_user()
    b3 = _book(tok3, pid, "2026-07-13").json()["booking"]
    d = requests.post(f"{BASE}/api/fixa/jobs/{b3['id']}/decline", headers=_hdr(pro_tok), json={"note": "Fully booked"})
    assert d.status_code == 200 and d.json()["status"] == "declined"
    assert requests.post(f"{BASE}/api/marketplace/fixa/bookings/{b3['id']}/cancel", headers=_hdr(tok3), json={}).status_code == 409


def test_rising_badge_after_five_jobs():
    pid, pro_tok = pytest.fixa_pid, pytest.fixa_pro_tok
    for i in range(4):  # 1 already done above
        tok, _ = _new_user()
        bk = _book(tok, pid, f"2026-08-0{i + 1}").json()["booking"]
        assert requests.post(f"{BASE}/api/marketplace/fixa/bookings/{bk['id']}/complete", headers=_hdr(tok), json={"rating": 4}).status_code == 200
    prov = requests.get(f"{BASE}/api/fixa/providers/{pid}", headers=_hdr(pro_tok)).json()
    assert prov["jobs_completed"] == 5 and "Rising" in prov["badges"] and "AMASS Verified" in prov["badges"]
    assert prov["rating"] == 4.2  # (5 + 4*4) / 5


def test_three_reports_auto_hide_and_admin_reinstate(admin_tok):
    pid, pro_tok = pytest.fixa_pid, pytest.fixa_pro_tok
    reporters = [_new_user(f"Reporter {i}") for i in range(3)]
    # provider can't report themselves; a user can't report twice
    assert requests.post(f"{BASE}/api/fixa/providers/{pid}/report", headers=_hdr(pro_tok), json={"reason": "other"}).status_code == 400
    r1 = requests.post(f"{BASE}/api/fixa/providers/{pid}/report", headers=_hdr(reporters[0][0]), json={"reason": "no_show", "details": "Waited 3 hours"})
    assert r1.status_code == 201 and r1.json()["auto_hidden"] is False and r1.json()["open_reports"] == 1
    assert requests.post(f"{BASE}/api/fixa/providers/{pid}/report", headers=_hdr(reporters[0][0]), json={"reason": "no_show"}).status_code == 409
    r2 = requests.post(f"{BASE}/api/fixa/providers/{pid}/report", headers=_hdr(reporters[1][0]), json={"reason": "poor_work"})
    assert r2.json()["auto_hidden"] is False and r2.json()["open_reports"] == 2
    # still visible after 2
    assert requests.get(f"{BASE}/api/fixa/providers/{pid}", headers=_hdr(reporters[2][0])).status_code == 200
    r3 = requests.post(f"{BASE}/api/fixa/providers/{pid}/report", headers=_hdr(reporters[2][0]), json={"reason": "overcharging"})
    assert r3.status_code == 201 and r3.json()["auto_hidden"] is True and r3.json()["open_reports"] == 3
    # hidden from everyone but owner/admin, bookings blocked
    assert requests.get(f"{BASE}/api/fixa/providers/{pid}", headers=_hdr(reporters[0][0])).status_code == 404
    assert pid not in [i["id"] for i in requests.get(f"{BASE}/api/fixa/providers", headers=_hdr(reporters[0][0]), params={"limit": 200}).json()["items"]]
    assert _book(reporters[0][0], pid, "2026-09-01").status_code == 409
    me = requests.get(f"{BASE}/api/fixa/me", headers=_hdr(pro_tok)).json()
    assert me["status"] == "hidden" and me["stats"]["open_reports"] == 3
    # admin: reports list + overview + notification
    reps = requests.get(f"{BASE}/api/admin/fixa/reports", headers=_hdr(admin_tok), params={"status": "open"}).json()
    ours = [r for r in reps["items"] if r["provider_item_id"] == pid]
    assert len(ours) == 3 and all(r["provider_status"] == "hidden" for r in ours)
    admin_notifs = requests.get(f"{BASE}/api/notifications/center", headers=_hdr(admin_tok)).json()
    rows = admin_notifs.get("items") or admin_notifs.get("notifications") or []
    assert any((n.get("kind") or n.get("type")) == "FIXA_REPORT" for n in rows)
    # resolve one report with reinstate → visible again, all open reports closed
    rs = requests.post(f"{BASE}/api/admin/fixa/reports/{ours[0]['id']}/resolve", headers=_hdr(admin_tok), json={"outcome": "dismissed", "note": "Customer confirmed a mix-up", "reinstate": True})
    assert rs.status_code == 200
    assert requests.get(f"{BASE}/api/fixa/providers/{pid}", headers=_hdr(reporters[0][0])).status_code == 200
    assert requests.get(f"{BASE}/api/fixa/me", headers=_hdr(pro_tok)).json()["status"] == "verified"
    still_open = [r for r in requests.get(f"{BASE}/api/admin/fixa/reports", headers=_hdr(admin_tok), params={"status": "open"}).json()["items"] if r["provider_item_id"] == pid]
    assert still_open == []
    # suspend + reinstate round trip
    assert requests.post(f"{BASE}/api/admin/fixa/providers/{pid}/suspend", headers=_hdr(admin_tok), json={"note": "Docs expired"}).status_code == 200
    assert requests.get(f"{BASE}/api/fixa/providers/{pid}", headers=_hdr(reporters[0][0])).status_code == 404
    assert requests.post(f"{BASE}/api/admin/fixa/providers/{pid}/reinstate", headers=_hdr(admin_tok)).status_code == 200
    assert requests.get(f"{BASE}/api/fixa/providers/{pid}", headers=_hdr(reporters[0][0])).status_code == 200


def test_reject_then_reapply(admin_tok):
    pro_tok, _ = _new_user("Rejected Pro")
    r = requests.post(f"{BASE}/api/fixa/apply", headers=_hdr(pro_tok), json={**APPLY, "business_name": "Half Done Ltd", "categories": ["Painting"]})
    pid = r.json()["id"]
    assert requests.post(f"{BASE}/api/admin/fixa/applications/{pid}/reject", headers=_hdr(admin_tok), json={"note": "Add a real phone number"}).status_code == 200
    me = requests.get(f"{BASE}/api/fixa/me", headers=_hdr(pro_tok)).json()
    assert me["status"] == "rejected" and me["rejection_reason"] == "Add a real phone number"
    r2 = requests.post(f"{BASE}/api/fixa/apply", headers=_hdr(pro_tok), json={**APPLY, "business_name": "Half Done Ltd", "categories": ["Painting", "POP Ceiling"], "phone": "08099990000"})
    assert r2.status_code == 201 and r2.json()["status"] == "pending" and r2.json()["phone"] == "08099990000"
    # profile edits while pending
    up = requests.put(f"{BASE}/api/fixa/me", headers=_hdr(pro_tok), json={**APPLY, "business_name": "Half Done Painters", "categories": ["Painting"], "bio": "Interior & exterior."})
    assert up.status_code == 200 and up.json()["profile"]["display_name"] == "Half Done Painters"
    # validation
    assert requests.post(f"{BASE}/api/fixa/apply", headers=_hdr(_new_user()[0]), json={**APPLY, "phone": "12"}).status_code in (400, 422)
    assert requests.post(f"{BASE}/api/fixa/apply", headers=_hdr(_new_user()[0]), json={**APPLY, "phone": "abc-def-ghi"}).status_code == 400
    assert requests.post(f"{BASE}/api/fixa/apply", headers=_hdr(_new_user()[0]), json={**APPLY, "categories": []}).status_code == 422
