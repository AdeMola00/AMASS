"""Property viewings — booking is gated behind the MASS unlock; agent confirms / proposes / declines; both sides notified.

Buyer = a fresh user who REALLY unlocks one of Adaeze's homes (welcome tokens, topped up through the mock
checkout when short) — the gate is the point, so nothing bypasses it.
"""
import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE = os.getenv("API_BASE", "http://localhost:8001").rstrip("/")
AGENT = ("adaeze.okoye@amass.africa", "Agent2026!")


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}"}


def _login(email, pw):
    r = requests.post(f"{BASE}/api/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def agent_tok():
    return _login(*AGENT)


@pytest.fixture(scope="module")
def buyer():
    email = f"viewing+{uuid.uuid4().hex[:8]}@amass.africa"
    r = requests.post(f"{BASE}/api/auth/register", json={"email": email, "password": "View2026!x", "full_name": "Viewing Buyer"})
    assert r.status_code in (200, 201), r.text
    tok = r.json()["access_token"]
    requests.get(f"{BASE}/api/wallet/me", headers=_hdr(tok))  # welcome tokens
    return tok


@pytest.fixture(scope="module")
def home(agent_tok, buyer):
    """One of the agent's live homes that the buyer has NOT unlocked yet (cheapest access cost)."""
    me = requests.get(f"{BASE}/api/auth/me", headers=_hdr(agent_tok)).json()
    r = requests.get(f"{BASE}/api/map/markers", headers=_hdr(buyer), params={"limit": 400})
    assert r.status_code == 200
    mine = [m for m in r.json()["markers"] if not m["unlocked"] and m.get("status", "available") == "available"]
    props = requests.get(f"{BASE}/api/agents/{me['id']}/listings", headers=_hdr(buyer)).json()
    ids = {p["id"] for p in props}
    cands = sorted([m for m in mine if m["id"] in ids], key=lambda m: m.get("access_cost") or 0)
    assert cands, "agent needs a locked live listing"
    return {**cands[0], "agent_id": me["id"]}


def _slot(days=2, hour=10):
    lagos = timezone(timedelta(hours=1))
    d = (datetime.now(lagos) + timedelta(days=days)).replace(hour=hour, minute=0, second=0, microsecond=0)
    return d.astimezone(timezone.utc).isoformat()


def test_locked_home_cannot_book(buyer, home):
    r = requests.post(f"{BASE}/api/viewings", headers=_hdr(buyer), json={"property_id": home["id"], "start": _slot()})
    assert r.status_code == 402, r.text
    r = requests.get(f"{BASE}/api/viewings/availability/{home['agent_id']}", headers=_hdr(buyer), params={"property_id": home["id"]})
    assert r.status_code == 402


def test_agent_sets_hours(agent_tok):
    hours = [{"weekday": d, "start": "09:00", "end": "17:00"} for d in range(7)]
    r = requests.put(f"{BASE}/api/viewings/availability/me", headers=_hdr(agent_tok), json={"hours": hours, "slot_minutes": 60})
    assert r.status_code == 200, r.text
    assert r.json()["has_hours"] and len(r.json()["hours"]) == 7
    r = requests.put(f"{BASE}/api/viewings/availability/me", headers=_hdr(agent_tok), json={"hours": [{"weekday": 0, "start": "12:00", "end": "11:00"}]})
    assert r.status_code == 400


def test_unlock_then_book_confirm_flow(buyer, agent_tok, home):
    # Unlock (real MASS spend — the gate is the point). Top up through the mock checkout if the welcome tokens are short.
    cost = home.get("access_cost") or 0
    w = requests.get(f"{BASE}/api/wallet/me", headers=_hdr(buyer)).json()
    if (w.get("spendable") or 0) < cost:
        init = requests.post(f"{BASE}/api/payments/initialize", headers=_hdr(buyer), json={"provider": "paystack", "bundle_id": "investor", "currency": "MASS", "platform": "web"})
        assert init.status_code == 200, init.text
        ref = init.json()["reference"]
        requests.get(f"{BASE}/api/payments/mock/{ref}", allow_redirects=False)  # mock checkout auto-fulfils
        assert requests.get(f"{BASE}/api/payments/status/{ref}", headers=_hdr(buyer)).json()["status"] == "paid"
    r = requests.post(f"{BASE}/api/unlocks", headers={**_hdr(buyer), "Idempotency-Key": str(uuid.uuid4())}, json={"featureKey": "property", "targetId": home["id"]})
    assert r.status_code == 200, r.text

    av = requests.get(f"{BASE}/api/viewings/availability/{home['agent_id']}", headers=_hdr(buyer), params={"property_id": home["id"]})
    assert av.status_code == 200, av.text
    assert av.json()["has_hours"] and av.json()["existing"] is None

    # Outside hours → 400; in the past → 400
    r = requests.post(f"{BASE}/api/viewings", headers=_hdr(buyer), json={"property_id": home["id"], "start": _slot(hour=20)})
    assert r.status_code == 400
    r = requests.post(f"{BASE}/api/viewings", headers=_hdr(buyer), json={"property_id": home["id"], "start": _slot(days=-1)})
    assert r.status_code == 400

    start = _slot(days=2, hour=10)
    r = requests.post(f"{BASE}/api/viewings", headers=_hdr(buyer), json={"property_id": home["id"], "start": start, "note": "TEST viewing"})
    assert r.status_code == 201, r.text
    v = r.json()
    assert v["status"] == "requested" and v["awaiting"] == "agent" and v["role"] == "buyer" and v["can_confirm"] is False
    assert v["agent"]["id"] == home["agent_id"]

    # Second open request for the same home → 409
    r = requests.post(f"{BASE}/api/viewings", headers=_hdr(buyer), json={"property_id": home["id"], "start": _slot(days=3)})
    assert r.status_code == 409

    # Agent sees it, pending for them; notification landed
    mine = requests.get(f"{BASE}/api/viewings/mine", headers=_hdr(agent_tok), params={"role": "agent"}).json()
    assert any(x["id"] == v["id"] and x["can_confirm"] for x in mine["upcoming"]) and mine["pending_for_me"] >= 1
    items = requests.get(f"{BASE}/api/notifications/center", headers=_hdr(agent_tok)).json()["items"]
    assert any(n.get("kind") == "VIEWING_REQUESTED" and (n.get("meta") or {}).get("viewing_id") == v["id"] for n in items)

    # Buyer can't confirm their own request
    r = requests.post(f"{BASE}/api/viewings/{v['id']}/confirm", headers=_hdr(buyer))
    assert r.status_code == 409

    # Agent proposes another time → buyer's turn
    new_start = _slot(days=3, hour=14)
    r = requests.post(f"{BASE}/api/viewings/{v['id']}/propose", headers=_hdr(agent_tok), json={"start": new_start, "note": "Afternoon works better"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "rescheduled" and r.json()["awaiting"] == "buyer"
    b = requests.get(f"{BASE}/api/viewings/{v['id']}", headers=_hdr(buyer)).json()
    assert b["can_confirm"] is True and b["start"] == new_start

    # Buyer confirms → confirmed; agent notified
    r = requests.post(f"{BASE}/api/viewings/{v['id']}/confirm", headers=_hdr(buyer))
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "confirmed" and r.json()["awaiting"] is None
    items = requests.get(f"{BASE}/api/notifications/center", headers=_hdr(agent_tok)).json()["items"]
    assert any(n.get("kind") == "VIEWING_CONFIRMED" and (n.get("meta") or {}).get("viewing_id") == v["id"] for n in items)

    # The slot is now taken for everyone else
    av = requests.get(f"{BASE}/api/viewings/availability/{home['agent_id']}", headers=_hdr(buyer), params={"property_id": home["id"]}).json()
    assert any(t["start"] == r.json()["start"] for t in av["taken"]) and av["existing"]["id"] == v["id"]

    # Buyer cancels → closed; a new request is possible again
    r = requests.post(f"{BASE}/api/viewings/{v['id']}/cancel", headers=_hdr(buyer), json={"note": "TEST cancel"})
    assert r.status_code == 200 and r.json()["status"] == "cancelled"
    r = requests.post(f"{BASE}/api/viewings/{v['id']}/cancel", headers=_hdr(buyer))
    assert r.status_code == 409


def test_agent_decline_and_stranger_access(buyer, agent_tok, home):
    r = requests.post(f"{BASE}/api/viewings", headers=_hdr(buyer), json={"property_id": home["id"], "start": _slot(days=4, hour=11)})
    assert r.status_code == 201, r.text
    vid = r.json()["id"]
    # Buyer can't decline (only cancel)
    assert requests.post(f"{BASE}/api/viewings/{vid}/decline", headers=_hdr(buyer)).status_code == 403
    # A third party can't read it
    other = requests.post(f"{BASE}/api/auth/register", json={"email": f"stranger+{uuid.uuid4().hex[:6]}@amass.africa", "password": "View2026!x", "full_name": "Stranger"}).json()["access_token"]
    assert requests.get(f"{BASE}/api/viewings/{vid}", headers=_hdr(other)).status_code == 403
    r = requests.post(f"{BASE}/api/viewings/{vid}/decline", headers=_hdr(agent_tok), json={"note": "Away that week"})
    assert r.status_code == 200 and r.json()["status"] == "declined"
    items = requests.get(f"{BASE}/api/notifications/center", headers=_hdr(buyer)).json()["items"]
    assert any(n.get("kind") == "VIEWING_DECLINED" and (n.get("meta") or {}).get("viewing_id") == vid for n in items)


def test_hours_validation_rejects_bad_times_and_overlaps(agent_tok):
    r = requests.put(f"{BASE}/api/viewings/availability/me", headers=_hdr(agent_tok), json={"hours": [{"weekday": 0, "start": "09:00", "end": "99:99"}]})
    assert r.status_code == 400, r.text
    r = requests.put(f"{BASE}/api/viewings/availability/me", headers=_hdr(agent_tok), json={"hours": [{"weekday": 0, "start": "09:00", "end": "12:00"}, {"weekday": 0, "start": "11:00", "end": "14:00"}]})
    assert r.status_code == 400, r.text
    # Adjacent windows on the same day are fine; restore the default week afterwards
    r = requests.put(f"{BASE}/api/viewings/availability/me", headers=_hdr(agent_tok), json={"hours": [{"weekday": 0, "start": "09:00", "end": "12:00"}, {"weekday": 0, "start": "12:00", "end": "14:00"}]})
    assert r.status_code == 200, r.text
    hours = [{"weekday": d, "start": "09:00", "end": "17:00"} for d in range(7)]
    assert requests.put(f"{BASE}/api/viewings/availability/me", headers=_hdr(agent_tok), json={"hours": hours, "slot_minutes": 60}).status_code == 200


def test_cannot_complete_before_it_happens(buyer, agent_tok, home):
    r = requests.post(f"{BASE}/api/viewings", headers=_hdr(buyer), json={"property_id": home["id"], "start": _slot(days=5, hour=12)})
    assert r.status_code == 201, r.text
    vid = r.json()["id"]
    # Not confirmed yet → 409
    assert requests.post(f"{BASE}/api/viewings/{vid}/complete", headers=_hdr(agent_tok)).status_code == 409
    r = requests.post(f"{BASE}/api/viewings/{vid}/confirm", headers=_hdr(agent_tok))
    assert r.status_code == 200 and r.json()["status"] == "confirmed" and r.json()["can_complete"] is False
    # Confirmed but still in the future → 409, and the buyer can't complete at all
    r = requests.post(f"{BASE}/api/viewings/{vid}/complete", headers=_hdr(agent_tok))
    assert r.status_code == 409, r.text
    assert requests.post(f"{BASE}/api/viewings/{vid}/complete", headers=_hdr(buyer)).status_code == 409
    assert requests.get(f"{BASE}/api/viewings/{vid}", headers=_hdr(buyer)).json()["status"] == "confirmed"
    # Clean up so the buyer can book again in later tests
    assert requests.post(f"{BASE}/api/viewings/{vid}/cancel", headers=_hdr(agent_tok)).status_code == 200
