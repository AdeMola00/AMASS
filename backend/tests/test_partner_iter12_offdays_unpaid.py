"""Iter12: agent days off (viewing availability off_days + booking/propose guard) and FIXA unpaid-job reminder counts."""
import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", os.environ.get("EXPO_BACKEND_URL", "")).rstrip("/")
AGENT = ("adaeze.okoye@amass.africa", "Agent2026!")
FIXA = ("fixa.demo@amass.africa", "Partner2026!")
LAGOS = timezone(timedelta(hours=1))
AV = f"{BASE}/api/viewings/availability/me"


def _hdr(t):
    return {"Authorization": f"Bearer {t}"}


def _login(email, pw):
    r = requests.post(f"{BASE}/api/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _day(n):
    return (datetime.now(LAGOS).date() + timedelta(days=n)).isoformat()


def _slot(days, hour=10):
    d = (datetime.now(LAGOS) + timedelta(days=days)).replace(hour=hour, minute=0, second=0, microsecond=0)
    return d.astimezone(timezone.utc).isoformat()


@pytest.fixture(scope="module")
def agent_tok():
    return _login(*AGENT)


@pytest.fixture(scope="module", autouse=True)
def restore_agent(agent_tok):
    before = requests.get(AV, headers=_hdr(agent_tok)).json()
    yield
    # Reset adaeze to no hours and no off days (as requested)
    requests.put(AV, headers=_hdr(agent_tok), json={"hours": [], "slot_minutes": 60, "off_days": []})


# ── off_days on PUT/GET availability/me ──
class TestOffDaysApi:
    def test_set_sorted_dedup_past_dropped(self, agent_tok):
        body = {"hours": [], "slot_minutes": 60, "off_days": [_day(5), _day(3), _day(5), _day(-2)]}
        r = requests.put(AV, headers=_hdr(agent_tok), json=body)
        assert r.status_code == 200, r.text
        assert r.json()["off_days"] == [_day(3), _day(5)]
        g = requests.get(AV, headers=_hdr(agent_tok)).json()
        assert g["off_days"] == [_day(3), _day(5)]

    def test_omitted_and_null_keep_saved(self, agent_tok):
        r = requests.put(AV, headers=_hdr(agent_tok), json={"hours": [], "slot_minutes": 60})
        assert r.status_code == 200 and r.json()["off_days"] == [_day(3), _day(5)], r.text
        r = requests.put(AV, headers=_hdr(agent_tok), json={"hours": [], "slot_minutes": 60, "off_days": None})
        assert r.status_code == 200 and r.json()["off_days"] == [_day(3), _day(5)], r.text

    def test_today_is_kept(self, agent_tok):
        r = requests.put(AV, headers=_hdr(agent_tok), json={"hours": [], "off_days": [_day(0), _day(3), _day(5)]})
        assert r.status_code == 200 and r.json()["off_days"] == [_day(0), _day(3), _day(5)], r.text

    @pytest.mark.parametrize("bad", ["2026-13-01", "not-a-date", "2026-02-30", "05/01/2026"])
    def test_invalid_date_400(self, agent_tok, bad):
        r = requests.put(AV, headers=_hdr(agent_tok), json={"hours": [], "off_days": [bad]})
        assert r.status_code == 400, r.text

    def test_too_far_ahead_400_and_near_limit_ok(self, agent_tok):
        r = requests.put(AV, headers=_hdr(agent_tok), json={"hours": [], "off_days": [_day(150)]})
        assert r.status_code == 400, r.text
        r = requests.put(AV, headers=_hdr(agent_tok), json={"hours": [], "off_days": [_day(85)]})
        assert r.status_code == 200 and r.json()["off_days"] == [_day(85)], r.text
        # invalid request did not wipe saved days
        assert requests.get(AV, headers=_hdr(agent_tok)).json()["off_days"] == [_day(85)]

    def test_clear_with_empty_list(self, agent_tok):
        r = requests.put(AV, headers=_hdr(agent_tok), json={"hours": [], "off_days": []})
        assert r.status_code == 200 and r.json()["off_days"] == [], r.text

    def test_requires_auth(self):
        assert requests.get(AV).status_code in (401, 403)


# ── booking + propose guard ──
@pytest.fixture(scope="module")
def buyer_ctx(agent_tok):
    email = f"test_offdays+{uuid.uuid4().hex[:8]}@amass.africa"
    r = requests.post(f"{BASE}/api/auth/register", json={"email": email, "password": "View2026!x", "full_name": "TEST_ Offdays Buyer"})
    assert r.status_code in (200, 201), r.text
    tok = r.json()["access_token"]
    requests.get(f"{BASE}/api/wallet/me", headers=_hdr(tok))
    me = requests.get(f"{BASE}/api/auth/me", headers=_hdr(agent_tok)).json()
    markers = requests.get(f"{BASE}/api/map/markers", headers=_hdr(tok), params={"limit": 400}).json()["markers"]
    ids = {p["id"] for p in requests.get(f"{BASE}/api/agents/{me['id']}/listings", headers=_hdr(tok)).json()}
    cands = sorted([m for m in markers if m["id"] in ids and m.get("status", "available") == "available"], key=lambda m: m.get("access_cost") or 0)
    if not cands:
        pytest.skip("no live listing for adaeze")
    home = cands[0]
    if not home.get("unlocked"):
        cost = home.get("access_cost") or 0
        w = requests.get(f"{BASE}/api/wallet/me", headers=_hdr(tok)).json()
        if (w.get("spendable") or 0) < cost:
            init = requests.post(f"{BASE}/api/payments/initialize", headers=_hdr(tok), json={"provider": "paystack", "bundle_id": "investor", "currency": "MASS", "platform": "web"})
            ref = init.json()["reference"]
            requests.get(f"{BASE}/api/payments/mock/{ref}", allow_redirects=False)
        u = requests.post(f"{BASE}/api/unlocks", headers={**_hdr(tok), "Idempotency-Key": str(uuid.uuid4())}, json={"featureKey": "property", "targetId": home["id"]})
        assert u.status_code == 200, u.text
    ctx = {"tok": tok, "home": home["id"], "agent_id": me["id"], "viewing": None}
    yield ctx
    if ctx["viewing"]:
        requests.post(f"{BASE}/api/viewings/{ctx['viewing']}/cancel", headers=_hdr(tok), json={"note": "TEST cleanup"})


class TestBookingGuard:
    def test_public_availability_returns_off_days(self, agent_tok, buyer_ctx):
        r = requests.put(AV, headers=_hdr(agent_tok), json={"hours": [], "off_days": [_day(4), _day(6)]})
        assert r.status_code == 200
        g = requests.get(f"{BASE}/api/viewings/availability/{buyer_ctx['agent_id']}", headers=_hdr(buyer_ctx["tok"]), params={"property_id": buyer_ctx["home"]})
        assert g.status_code == 200, g.text
        assert g.json()["off_days"] == [_day(4), _day(6)]

    def test_book_on_off_day_400(self, buyer_ctx):
        r = requests.post(f"{BASE}/api/viewings", headers=_hdr(buyer_ctx["tok"]), json={"property_id": buyer_ctx["home"], "start": _slot(4)})
        assert r.status_code == 400, r.text
        assert "away that day" in r.json().get("detail", ""), r.text

    def test_late_evening_lagos_on_off_day_blocked(self, buyer_ctx):
        # 23:30 Lagos on the off day = 22:30 UTC same date; must still be blocked (Lagos-date check)
        r = requests.post(f"{BASE}/api/viewings", headers=_hdr(buyer_ctx["tok"]), json={"property_id": buyer_ctx["home"], "start": _slot(6, 23)})
        assert r.status_code == 400 and "away" in r.text, r.text

    def test_book_normal_day_then_buyer_propose_on_off_day_400(self, buyer_ctx):
        r = requests.post(f"{BASE}/api/viewings", headers=_hdr(buyer_ctx["tok"]), json={"property_id": buyer_ctx["home"], "start": _slot(5), "note": "TEST_ offdays"})
        assert r.status_code == 201, r.text
        buyer_ctx["viewing"] = r.json()["id"]
        p = requests.post(f"{BASE}/api/viewings/{buyer_ctx['viewing']}/propose", headers=_hdr(buyer_ctx["tok"]), json={"start": _slot(4, 11)})
        assert p.status_code == 400 and "away that day" in p.text, p.text

    def test_agent_can_propose_on_own_off_day(self, agent_tok, buyer_ctx):
        if not buyer_ctx["viewing"]:
            pytest.skip("no viewing")
        p = requests.post(f"{BASE}/api/viewings/{buyer_ctx['viewing']}/propose", headers=_hdr(agent_tok), json={"start": _slot(4, 12)})
        assert p.status_code == 200, p.text
        assert p.json()["status"] == "rescheduled" and p.json()["awaiting"] == "buyer"


# ── /api/partner/me unpaid counts for fixa ──
class TestFixaUnpaid:
    def test_counts_present(self):
        tok = _login(*FIXA)
        r = requests.get(f"{BASE}/api/partner/me", headers=_hdr(tok))
        assert r.status_code == 200, r.text
        c = r.json().get("counts") or {}
        assert isinstance(c.get("fixa_jobs_unpaid"), int), c
        assert c["fixa_jobs_unpaid"] >= 1
        assert isinstance(c.get("fixa_unpaid_first"), str)
        print("fixa counts:", {k: v for k, v in c.items() if k.startswith("fixa")})

    def test_non_fixa_no_crash(self):
        tok = _login("seller.demo@amass.africa", "Partner2026!")
        r = requests.get(f"{BASE}/api/partner/me", headers=_hdr(tok))
        assert r.status_code == 200, r.text
        c = r.json().get("counts") or {}
        assert not c.get("fixa_jobs_unpaid")
