"""My Home hub — homes · bills (mark paid advances the cycle, receipts, undo) · records (private files, folders,
expiry) · items (warranty) · repairs (done → history, interval restarts) · overview / calendar / badge ·
reminder sweep (in-app rows, once per key) · owner-only access to everything."""
import base64
import os
import uuid
from datetime import date, timedelta

import pytest
import requests

BASE = os.environ.get("EXPO_BACKEND_URL", "http://localhost:8001").rstrip("/")
ADMIN = ("demo@amass.africa", "amass2026")


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}"}


def _login(email, password):
    r = requests.post(f"{BASE}/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _new_user(name="Home Tester"):
    email = f"home_{uuid.uuid4().hex[:10]}@amass-qa.africa"
    r = requests.post(f"{BASE}/api/auth/register", json={"email": email, "password": "Test1234!", "full_name": name})
    assert r.status_code == 200, r.text
    tok = r.json()["access_token"]
    me = requests.get(f"{BASE}/api/auth/me", headers=_hdr(tok)).json()
    return tok, me["id"]


@pytest.fixture(scope="module")
def user():
    tok, uid = _new_user()
    ov = requests.get(f"{BASE}/api/home/overview", headers=_hdr(tok)).json()
    return {"tok": tok, "id": uid, "home_id": ov["home_id"]}


def test_catalog_and_default_home(user):
    r = requests.get(f"{BASE}/api/home/catalog", headers=_hdr(user["tok"]))
    assert r.status_code == 200
    j = r.json()
    assert {c["key"] for c in j["bill_categories"]} >= {"rent", "electricity", "water"}
    assert j["default_reminders"]["bill"] == [3, 0]
    homes = requests.get(f"{BASE}/api/home/homes", headers=_hdr(user["tok"])).json()["items"]
    assert len(homes) == 1 and homes[0]["is_default"] and homes[0]["name"] == "My home"


def test_homes_crud_and_switch(user):
    tok = user["tok"]
    r = requests.post(f"{BASE}/api/home/homes", headers=_hdr(tok), json={"name": "Beach house", "kind": "house", "color": "#14B8A6"})
    assert r.status_code == 201, r.text
    h2 = r.json()
    assert h2["color"] == "#14B8A6" and h2["is_default"] is False
    r = requests.put(f"{BASE}/api/home/homes/{h2['id']}", headers=_hdr(tok), json={"name": "Beach house", "kind": "house", "is_default": True})
    assert r.json()["is_default"] is True
    homes = requests.get(f"{BASE}/api/home/homes", headers=_hdr(tok)).json()["items"]
    assert sum(1 for h in homes if h["is_default"]) == 1
    # empty home deletes straight away; default moves back
    r = requests.delete(f"{BASE}/api/home/homes/{h2['id']}", headers=_hdr(tok))
    assert r.status_code == 200
    homes = requests.get(f"{BASE}/api/home/homes", headers=_hdr(tok)).json()["items"]
    assert len(homes) == 1 and homes[0]["is_default"]


def test_bill_lifecycle_pay_advances_and_undo(user):
    tok, home_id = user["tok"], user["home_id"]
    today = date.fromisoformat(requests.get(f"{BASE}/api/home/catalog", headers=_hdr(tok)).json()["today"])
    cid = str(uuid.uuid4())
    body = {"id": cid, "home_id": home_id, "name": "Electricity", "category": "electricity", "amount": 25000, "due_date": (today + timedelta(days=2)).isoformat(), "schedule": {"freq": "monthly", "interval": 1}, "reminders": [3, 0]}
    r = requests.post(f"{BASE}/api/home/bills", headers=_hdr(tok), json=body)
    assert r.status_code == 201, r.text
    b = r.json()
    assert b["status"] == "due_soon" and b["days_until"] == 2 and b["schedule_label"] == "Monthly"
    # idempotent retry with the same client id returns the same row (weak-connection safety)
    r2 = requests.post(f"{BASE}/api/home/bills", headers=_hdr(tok), json=body)
    assert r2.status_code == 201 and r2.json()["id"] == cid
    assert requests.get(f"{BASE}/api/home/bills", headers=_hdr(tok), params={"home_id": home_id}).json()["count"] == 1

    # overdue one-off bill
    r = requests.post(f"{BASE}/api/home/bills", headers=_hdr(tok), json={"home_id": home_id, "name": "Plumber invoice", "category": "other", "amount": 12000, "due_date": (today - timedelta(days=3)).isoformat(), "schedule": {"freq": "once"}})
    once = r.json()
    assert once["status"] == "overdue"

    # mark the monthly bill paid with a receipt photo → next_due advances one month, receipt record created & linked
    png = base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"0" * 64).decode()
    r = requests.post(f"{BASE}/api/home/bills/{cid}/pay", headers=_hdr(tok), json={"receipt": {"path": "amass/uploads/not-yours/x.png", "url": "/api/files/amass/uploads/not-yours/x.png"}})
    assert r.status_code == 403  # can't attach somebody else's file
    up = requests.post(f"{BASE}/api/home/uploads", headers=_hdr(tok), json={"data_url": f"data:image/png;base64,{png}", "name": "receipt.png"})
    assert up.status_code == 201, up.text
    f = up.json()
    assert f["path"].startswith(f"amass/uploads/{user['id']}/home/") and f["url"].startswith("/api/files/")
    r = requests.post(f"{BASE}/api/home/bills/{cid}/pay", headers=_hdr(tok), json={"receipt": f, "note": "Paid via transfer"})
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["bill"]["status"] == "paid" and j["bill"]["paid_count"] == 1
    expected = today + timedelta(days=2)
    m = expected.month % 12 + 1
    y = expected.year + (expected.month == 12)
    assert j["bill"]["next_due"].startswith(f"{y:04d}-{m:02d}")
    assert j["receipt"]["folder"] == "receipts" and j["receipt"]["bill_id"] == cid and j["payment"]["record_id"] == j["receipt"]["id"]

    detail = requests.get(f"{BASE}/api/home/bills/{cid}", headers=_hdr(tok)).json()
    assert len(detail["payments"]) == 1 and len(detail["records"]) == 1 and detail["home"]["id"] == home_id

    # the private file is readable by the owner only
    assert requests.get(f"{BASE}{f['url']}", headers=_hdr(tok)).status_code == 200
    other_tok, _ = _new_user("Stranger")
    assert requests.get(f"{BASE}{f['url']}", headers=_hdr(other_tok)).status_code == 403
    assert requests.get(f"{BASE}/api/home/bills/{cid}", headers=_hdr(other_tok)).status_code == 404

    # undo → back to the original cycle
    r = requests.delete(f"{BASE}/api/home/bills/{cid}/payments/{j['payment']['id']}", headers=_hdr(tok))
    assert r.status_code == 200 and r.json()["bill"]["next_due"] == expected.isoformat() and r.json()["bill"]["status"] == "due_soon"

    # one-off: pay → paid, pay again → 409, list filter
    r = requests.post(f"{BASE}/api/home/bills/{once['id']}/pay", headers=_hdr(tok), json={})
    assert r.json()["bill"]["status"] == "paid"
    assert requests.post(f"{BASE}/api/home/bills/{once['id']}/pay", headers=_hdr(tok), json={}).status_code == 409
    paid = requests.get(f"{BASE}/api/home/bills", headers=_hdr(tok), params={"home_id": home_id, "status": "paid"}).json()
    assert [x["id"] for x in paid["items"]] == [once["id"]]

    # edit keeps the cycle when the due date is unchanged
    r = requests.put(f"{BASE}/api/home/bills/{cid}", headers=_hdr(tok), json={**body, "amount": 26000})
    assert r.status_code == 200 and r.json()["amount"] == 26000 and r.json()["next_due"] == expected.isoformat()
    user["bill_id"] = cid
    user["once_id"] = once["id"]


def test_records_items_repairs(user):
    tok, home_id = user["tok"], user["home_id"]
    today = date.fromisoformat(requests.get(f"{BASE}/api/home/catalog", headers=_hdr(tok)).json()["today"])
    # chunked upload: 3 chunks, out of order, then complete
    raw = os.urandom(3000)
    chunks = [raw[i : i + 1000] for i in range(0, 3000, 1000)]
    st = requests.post(f"{BASE}/api/home/uploads/start", headers=_hdr(tok), json={"name": "agreement.pdf", "content_type": "application/pdf", "size": 3000, "total_chunks": 3})
    assert st.status_code == 201, st.text
    uid_ = st.json()["upload_id"]
    assert requests.post(f"{BASE}/api/home/uploads/{uid_}/complete", headers=_hdr(tok)).status_code == 409
    for i in (2, 0, 1):
        r = requests.put(f"{BASE}/api/home/uploads/{uid_}/chunks/{i}", headers=_hdr(tok), json={"data": base64.b64encode(chunks[i]).decode()})
        assert r.status_code == 200, r.text
    assert requests.get(f"{BASE}/api/home/uploads/{uid_}", headers=_hdr(tok)).json()["received"] == [0, 1, 2]
    done = requests.post(f"{BASE}/api/home/uploads/{uid_}/complete", headers=_hdr(tok))
    assert done.status_code == 200, done.text
    f = done.json()
    assert f["path"].endswith(".pdf") and f["size"] == 3000
    got = requests.get(f"{BASE}{f['url']}", headers=_hdr(tok))
    assert got.status_code == 200 and got.content == raw

    r = requests.post(f"{BASE}/api/home/records", headers=_hdr(tok), json={"home_id": home_id, "title": "Tenancy agreement", "folder": "agreements", "file": f, "expires_at": (today + timedelta(days=20)).isoformat(), "bill_id": user["bill_id"]})
    assert r.status_code == 201, r.text
    rec = r.json()
    assert rec["expiry_status"] == "expiring" and rec["expiry_reminders"] == [30, 7, 0]
    lst = requests.get(f"{BASE}/api/home/records", headers=_hdr(tok), params={"home_id": home_id}).json()
    assert lst["folders"]["agreements"] == 1 and lst["folders"]["receipts"] == 1  # receipt from the paid bill
    assert requests.get(f"{BASE}/api/home/records", headers=_hdr(tok), params={"bill_id": user["bill_id"]}).json()["count"] == 2

    # items
    r = requests.post(f"{BASE}/api/home/items", headers=_hdr(tok), json={"home_id": home_id, "name": "Fridge", "room": "Kitchen", "price": 350000, "warranty_until": (today + timedelta(days=10)).isoformat()})
    assert r.status_code == 201, r.text
    item = r.json()
    assert item["value"] == 350000 and item["warranty_status"] == "expiring"
    items = requests.get(f"{BASE}/api/home/items", headers=_hdr(tok), params={"home_id": home_id}).json()
    assert items["total_value"] == 350000 and items["rooms"]["Kitchen"] == 1

    # repairs: quarterly, overdue → done restarts the interval from today
    r = requests.post(f"{BASE}/api/home/repairs", headers=_hdr(tok), json={"home_id": home_id, "title": "Service AC", "trade": "AC Repair", "schedule": {"freq": "custom", "interval": 3, "unit": "months"}, "next_due": (today - timedelta(days=5)).isoformat(), "item_id": item["id"]})
    assert r.status_code == 201, r.text
    rep = r.json()
    assert rep["status"] == "overdue" and rep["schedule_label"] == "Every 3 months"
    r = requests.post(f"{BASE}/api/home/repairs/{rep['id']}/done", headers=_hdr(tok), json={"cost": 15000, "notes": "Gas top-up", "provider_name": "Engr. Adebayo"})
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["repair"]["status"] == "done" and j["repair"]["done_count"] == 1 and j["repair"]["total_cost"] == 15000
    nd = date.fromisoformat(j["repair"]["next_due"])
    assert 85 <= (nd - today).days <= 95
    det = requests.get(f"{BASE}/api/home/repairs/{rep['id']}", headers=_hdr(tok)).json()
    assert len(det["logs"]) == 1 and det["item"]["name"] == "Fridge"
    user.update({"record_id": rec["id"], "item_id": item["id"], "repair_id": rep["id"]})


def test_overview_calendar_badge(user):
    tok, home_id = user["tok"], user["home_id"]
    ov = requests.get(f"{BASE}/api/home/overview", headers=_hdr(tok), params={"home_id": home_id}).json()
    assert ov["counts"] == {"bills": 2, "records": 2, "items": 1, "repairs": 1, "saved": ov["counts"]["saved"]}
    assert 1 <= len(ov["next_due"]) <= 3
    first = ov["next_due"][0]
    assert first["type"] == "bill" and first["status"] == "due_soon" and first["path"].startswith("/home/bills/")
    assert ov["month"]["due_total"] >= 0 and "paid_total" in ov["month"] and ov["attention"]["due_soon"] >= 1
    today = date.fromisoformat(ov["today"])
    cal = requests.get(f"{BASE}/api/home/calendar", headers=_hdr(tok), params={"home_id": home_id, "month": today.strftime("%Y-%m")}).json()
    kinds = {e["type"] for e in cal["events"]}
    assert "bill" in kinds and "payment" in kinds and "repair_done" in kinds
    assert all(e["date"].startswith(today.strftime("%Y-%m")) for e in cal["events"])
    badge = requests.get(f"{BASE}/api/home/badge", headers=_hdr(tok)).json()
    assert badge["count"] >= 0


def test_reminder_sweep_once_per_key(user):
    tok, home_id = user["tok"], user["home_id"]
    admin = _login(*ADMIN)
    today = date.fromisoformat(requests.get(f"{BASE}/api/home/catalog", headers=_hdr(tok)).json()["today"])
    due = today + timedelta(days=3)
    r = requests.post(f"{BASE}/api/home/bills", headers=_hdr(tok), json={"home_id": home_id, "name": "Internet", "category": "internet", "amount": 19500, "due_date": due.isoformat(), "schedule": {"freq": "monthly"}, "reminders": [3, 0]})
    bill = r.json()
    run1 = requests.post(f"{BASE}/api/home/reminders/run", headers=_hdr(admin), params={"today": today.isoformat()})
    assert run1.status_code == 200, run1.text
    run2 = requests.post(f"{BASE}/api/home/reminders/run", headers=_hdr(admin), params={"today": today.isoformat()}).json()
    notes = requests.get(f"{BASE}/api/notifications/center", headers=_hdr(tok), params={"category": "home"}).json()
    mine = [n for n in notes["items"] if n["kind"] == "HOME_BILL_DUE" and n["meta"].get("bill_id") == bill["id"]]
    assert len(mine) == 1 and "Internet" in mine[0]["title"] and mine[0]["action_url"] == f"/home/bills/{bill['id']}"
    # running again sends nothing new for the same key
    run3 = requests.post(f"{BASE}/api/home/reminders/run", headers=_hdr(admin), params={"today": today.isoformat()}).json()
    assert run3["bills"] == 0 and run2["bills"] == 0
    # non-admins can't trigger the sweep
    assert requests.post(f"{BASE}/api/home/reminders/run", headers=_hdr(tok)).status_code in (401, 403)


def test_delete_home_requires_force_when_not_empty(user):
    tok, home_id = user["tok"], user["home_id"]
    r = requests.delete(f"{BASE}/api/home/homes/{home_id}", headers=_hdr(tok))
    assert r.status_code == 409 and r.json()["detail"]["code"] == "HOME_NOT_EMPTY"
    r = requests.delete(f"{BASE}/api/home/homes/{home_id}", headers=_hdr(tok), params={"force": "true"})
    assert r.status_code == 200
    assert requests.get(f"{BASE}/api/home/bills", headers=_hdr(tok)).json()["count"] == 0
    # a fresh default home is recreated on the next overview
    assert requests.get(f"{BASE}/api/home/overview", headers=_hdr(tok)).json()["home"]["name"] == "My home"
