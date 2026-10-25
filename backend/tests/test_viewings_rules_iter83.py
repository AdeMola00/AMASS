"""Iter83 — viewing booking rules: gating, time validation, duplicate/clash, side-of-awaiting, roles, notifications.
Uses demo (unlocked/admin) as buyer on Tunde's Yaba rental (no hours) + Adaeze's 2-Bed (hours set). Cleans up by cancelling."""
import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/") or os.environ["API_BASE"].rstrip("/")
LAGOS = timezone(timedelta(hours=1))
ADAEZE_4BED = "01909724-2b6b-40fd-811d-bd7c2815b90a"
ADAEZE_2BED = "6983469a-253b-49db-a149-e3166b2d6b56"
TUNDE_YABA = "bf3a95a5-be78-4c55-a8b8-210580ec7aa0"
CREATED = []


def _login(email, pw):
    r = requests.post(f"{BASE}/api/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _slot(days, hour, minute=0):
    d = (datetime.now(LAGOS) + timedelta(days=days)).replace(hour=hour, minute=minute, second=0, microsecond=0)
    return d.astimezone(timezone.utc).isoformat()


@pytest.fixture(scope="module")
def H():
    h = {
        "demo": _login("demo@amass.africa", "amass2026"),
        "adaeze": _login("adaeze.okoye@amass.africa", "Agent2026!"),
        "tunde": _login("tunde.bakare@amass.africa", "Agent2026!"),
        "fixa": _login("fixa.tester+15339@amass.africa", "Fixa2026!"),
    }
    h["ids"] = {k: requests.get(f"{BASE}/api/auth/me", headers=h[k]).json()["id"] for k in ("demo", "adaeze", "tunde", "fixa")}
    yield h
    for vid in CREATED:  # cleanup
        requests.post(f"{BASE}/api/viewings/{vid}/cancel", headers=h["demo"], json={"note": "TEST_cleanup"})


# Listing views
def test_mine_roles(H):
    for role in ("agent", "buyer", "all"):
        r = requests.get(f"{BASE}/api/viewings/mine", headers=H["adaeze"], params={"role": role})
        assert r.status_code == 200
        d = r.json()
        assert set(d) >= {"upcoming", "past", "pending_for_me"} and isinstance(d["pending_for_me"], int)
    assert requests.get(f"{BASE}/api/viewings/mine", headers=H["adaeze"], params={"role": "x"}).status_code == 422


# Availability validation (fresh user so we never touch real agents' hours)
def test_availability_put_validation():
    email = f"TEST_hours+{uuid.uuid4().hex[:6]}@amass.africa"
    r = requests.post(f"{BASE}/api/auth/register", json={"email": email, "password": "Hours2026!x", "full_name": "TEST Hours"})
    hdr = {"Authorization": f"Bearer {r.json()['access_token']}"}
    bad = requests.put(f"{BASE}/api/viewings/availability/me", headers=hdr, json={"hours": [{"weekday": 0, "start": "12:00", "end": "10:00"}]})
    assert bad.status_code == 400
    eq = requests.put(f"{BASE}/api/viewings/availability/me", headers=hdr, json={"hours": [{"weekday": 0, "start": "10:00", "end": "10:00"}]})
    assert eq.status_code == 400
    ok = requests.put(f"{BASE}/api/viewings/availability/me", headers=hdr, json={"hours": [{"weekday": 1, "start": "09:00", "end": "12:00"}], "slot_minutes": 45})
    assert ok.status_code == 200 and ok.json()["has_hours"] and ok.json()["slot_minutes"] == 45
    got = requests.get(f"{BASE}/api/viewings/availability/me", headers=hdr).json()
    assert got["hours"][0]["weekday"] == 1
    junk = requests.put(f"{BASE}/api/viewings/availability/me", headers=hdr, json={"hours": [{"weekday": 0, "start": "09:00", "end": "99:99"}]})
    print("invalid clock 99:99 ->", junk.status_code)


# Gate on availability + booking
def test_availability_gate(H):
    a = H["ids"]["adaeze"]
    assert requests.get(f"{BASE}/api/viewings/availability/{a}", headers=H["fixa"], params={"property_id": ADAEZE_2BED}).status_code == 402
    assert requests.get(f"{BASE}/api/viewings/availability/{H['ids']['tunde']}", headers=H["demo"], params={"property_id": ADAEZE_2BED}).status_code == 400
    ok = requests.get(f"{BASE}/api/viewings/availability/{a}", headers=H["demo"], params={"property_id": ADAEZE_2BED})
    assert ok.status_code == 200 and ok.json()["has_hours"] and isinstance(ok.json()["taken"], list)


def test_post_locked_and_time_rules(H):
    assert requests.post(f"{BASE}/api/viewings", headers=H["fixa"], json={"property_id": ADAEZE_2BED, "start": _slot(2, 10)}).status_code == 402
    soon = (datetime.now(timezone.utc) + timedelta(minutes=30)).isoformat()
    assert requests.post(f"{BASE}/api/viewings", headers=H["demo"], json={"property_id": TUNDE_YABA, "start": soon}).status_code == 400
    assert requests.post(f"{BASE}/api/viewings", headers=H["demo"], json={"property_id": TUNDE_YABA, "start": _slot(31, 10)}).status_code == 400
    # Adaeze has 09-17 hours: 07:00 and 16:30 (+60 > 17:00) are outside
    assert requests.post(f"{BASE}/api/viewings", headers=H["demo"], json={"property_id": ADAEZE_2BED, "start": _slot(3, 7)}).status_code == 400
    assert requests.post(f"{BASE}/api/viewings", headers=H["demo"], json={"property_id": ADAEZE_2BED, "start": _slot(3, 16, 30)}).status_code == 400
    # agent on own listing
    assert requests.post(f"{BASE}/api/viewings", headers=H["adaeze"], json={"property_id": ADAEZE_2BED, "start": _slot(3, 10)}).status_code == 400


def test_slot_clash_with_confirmed(H):
    """Adaeze already has a CONFIRMED viewing (demo, 4-bed). Same start on the 2-bed must 409."""
    mine = requests.get(f"{BASE}/api/viewings/mine", headers=H["adaeze"], params={"role": "agent"}).json()
    conf = [v for v in mine["upcoming"] if v["status"] == "confirmed" and datetime.fromisoformat(v["start"]) > datetime.now(timezone.utc) + timedelta(hours=1)]
    if not conf:
        pytest.skip("no confirmed future viewing for Adaeze")
    r = requests.post(f"{BASE}/api/viewings", headers=H["demo"], json={"property_id": ADAEZE_2BED, "start": conf[0]["start"]})
    assert r.status_code == 409, r.text
    taken = requests.get(f"{BASE}/api/viewings/availability/{H['ids']['adaeze']}", headers=H["demo"], params={"property_id": ADAEZE_2BED}).json()["taken"]
    assert any(t["start"] == conf[0]["start"] for t in taken)


def test_free_mode_full_flow(H):
    """Tunde: no hours → any hour ok. Request → buyer can't confirm → agent proposes → agent can't confirm → buyer confirms."""
    r = requests.post(f"{BASE}/api/viewings", headers=H["demo"], json={"property_id": TUNDE_YABA, "start": _slot(4, 7), "note": "TEST_iter83"})
    assert r.status_code == 201, r.text
    v = r.json()
    CREATED.append(v["id"])
    assert v["status"] == "requested" and v["awaiting"] == "agent" and v["role"] == "buyer" and not v["can_confirm"] and not v["can_decline"] and v["can_cancel"]
    assert requests.post(f"{BASE}/api/viewings", headers=H["demo"], json={"property_id": TUNDE_YABA, "start": _slot(5, 11)}).status_code == 409
    vid = v["id"]
    assert requests.get(f"{BASE}/api/viewings/{vid}", headers=H["fixa"]).status_code == 403
    assert requests.post(f"{BASE}/api/viewings/{vid}/confirm", headers=H["demo"]).status_code == 409
    assert requests.post(f"{BASE}/api/viewings/{vid}/decline", headers=H["demo"]).status_code == 403
    assert requests.post(f"{BASE}/api/viewings/{vid}/confirm", headers=H["fixa"]).status_code == 403
    ag = requests.get(f"{BASE}/api/viewings/{vid}", headers=H["tunde"]).json()
    assert ag["role"] == "agent" and ag["can_confirm"] and ag["can_decline"]
    p = requests.post(f"{BASE}/api/viewings/{vid}/propose", headers=H["tunde"], json={"start": _slot(4, 20), "note": "TEST evening"})
    assert p.status_code == 200 and p.json()["status"] == "rescheduled" and p.json()["awaiting"] == "buyer"
    assert requests.post(f"{BASE}/api/viewings/{vid}/confirm", headers=H["tunde"]).status_code == 409
    c = requests.post(f"{BASE}/api/viewings/{vid}/confirm", headers=H["demo"])
    assert c.status_code == 200 and c.json()["status"] == "confirmed"
    got = requests.get(f"{BASE}/api/viewings/{vid}", headers=H["demo"]).json()
    assert got["status"] == "confirmed" and [h["action"] for h in got["history"]] == ["requested", "proposed", "confirmed"]
    assert requests.post(f"{BASE}/api/viewings/{vid}/decline", headers=H["tunde"]).status_code == 409
    # complete must be rejected for a FUTURE confirmed viewing (review: agent-only on past-start)
    comp = requests.post(f"{BASE}/api/viewings/{vid}/complete", headers=H["tunde"])
    print("complete future viewing ->", comp.status_code, comp.text[:120])
    H["flow_vid"] = vid
    H["flow_complete_status"] = comp.status_code


def test_complete_future_rejected(H):
    assert H.get("flow_complete_status") == 409, "POST /complete accepted a viewing whose start is in the future"


def test_cancel_and_closed(H):
    vid = H.get("flow_vid")
    st = requests.get(f"{BASE}/api/viewings/{vid}", headers=H["demo"]).json()["status"]
    if st != "completed":
        assert requests.post(f"{BASE}/api/viewings/{vid}/cancel", headers=H["demo"]).status_code == 200
    assert requests.post(f"{BASE}/api/viewings/{vid}/cancel", headers=H["tunde"]).status_code == 409
    assert requests.post(f"{BASE}/api/viewings/{vid}/propose", headers=H["tunde"], json={"start": _slot(6, 10)}).status_code == 409


def test_notifications_land(H):
    r = requests.get(f"{BASE}/api/notifications/center", headers=H["tunde"], params={"limit": 50})
    assert r.status_code == 200
    body = r.json()
    items = body.get("items") or body.get("notifications") or body
    kinds = {n.get("kind") for n in items if (n.get("meta") or {}).get("viewing_id") == H["flow_vid"]}
    assert {"VIEWING_REQUESTED", "VIEWING_CONFIRMED"} <= kinds, kinds  # CANCELLED only if /complete was (correctly) refused
    n = next(n for n in items if (n.get("meta") or {}).get("viewing_id") == H["flow_vid"])
    assert n.get("action_url") == f"/viewings/{H['flow_vid']}"
    rb = requests.get(f"{BASE}/api/notifications/center", headers=H["demo"], params={"limit": 50}).json()
    ib = rb.get("items") or rb.get("notifications") or rb
    assert "VIEWING_RESCHEDULED" in {n.get("kind") for n in ib if (n.get("meta") or {}).get("viewing_id") == H["flow_vid"]}
