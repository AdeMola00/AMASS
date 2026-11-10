# AMASS Partner app – iteration 10: Fixa job prices (POST /partner/fixa/jobs/{id}/paid), summary/trends money_earned, viewing hours (PUT /viewings/availability/me)
import os

import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"


def _login(email, pw):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"login failed {email}: {r.status_code}")
    s.headers.update({"Authorization": f"Bearer {r.json()['access_token']}"})
    return s


@pytest.fixture(scope="module")
def fixa():
    return _login("fixa.demo@amass.africa", "Partner2026!")


@pytest.fixture(scope="module")
def agent():
    return _login("adaeze.okoye@amass.africa", "Agent2026!")


@pytest.fixture(scope="module")
def jobs(fixa):
    r = fixa.get(f"{API}/fixa/jobs", timeout=30)
    assert r.status_code == 200
    return r.json()["items"]


def _finished(jobs):
    return [j for j in jobs if j.get("job_stage") == "finished" or j.get("status") == "completed"]


# --- Fixa: record paid amount
class TestFixaPaid:
    def test_jobs_list_has_finished(self, jobs):
        fin = _finished(jobs)
        print("finished:", [(j["id"][:8], j.get("status"), j.get("job_stage"), j.get("amount_paid")) for j in jobs])
        assert len(fin) >= 1

    def test_unfinished_returns_409(self, fixa, jobs):
        un = [j for j in jobs if j not in _finished(jobs)]
        if not un:
            pytest.skip("no unfinished jobs")
        r = fixa.post(f"{API}/partner/fixa/jobs/{un[0]['id']}/paid", json={"amount": 5000}, timeout=30)
        assert r.status_code == 409
        assert "Finish the job first" in r.text

    def test_unknown_job_404(self, fixa):
        r = fixa.post(f"{API}/partner/fixa/jobs/nonexistent-xyz/paid", json={"amount": 5000}, timeout=30)
        assert r.status_code == 404

    def test_other_pro_404(self, agent, jobs):
        # agent has no fixa profile / isn't owner of this job
        r = agent.post(f"{API}/partner/fixa/jobs/{_finished(jobs)[0]['id']}/paid", json={"amount": 5000}, timeout=30)
        assert r.status_code == 404

    @pytest.mark.parametrize("amount", [0, -5, "abc", 100_000_001])
    def test_invalid_amount_422(self, fixa, jobs, amount):
        r = fixa.post(f"{API}/partner/fixa/jobs/{_finished(jobs)[0]['id']}/paid", json={"amount": amount}, timeout=30)
        assert r.status_code == 422

    def test_unauth_401(self, jobs):
        r = requests.post(f"{API}/partner/fixa/jobs/{_finished(jobs)[0]['id']}/paid", json={"amount": 5000}, timeout=30)
        assert r.status_code in (401, 403)

    def test_record_and_correct_keeps_paid_at(self, fixa, jobs):
        jid = _finished(jobs)[0]["id"]
        r1 = fixa.post(f"{API}/partner/fixa/jobs/{jid}/paid", json={"amount": 15000}, timeout=30)
        assert r1.status_code == 200, r1.text
        d1 = r1.json()
        assert d1["ok"] is True and d1["amount_paid"] == 15000 and d1["paid_at"]
        r2 = fixa.post(f"{API}/partner/fixa/jobs/{jid}/paid", json={"amount": 18000}, timeout=30)
        assert r2.status_code == 200
        assert r2.json()["paid_at"] == d1["paid_at"]
        assert r2.json()["amount_paid"] == 18000
        # persisted in job list
        j = next(x for x in fixa.get(f"{API}/fixa/jobs", timeout=30).json()["items"] if x["id"] == jid)
        assert j.get("amount_paid") == 18000
        assert j.get("paid_at") == d1["paid_at"]

    def test_summary_money_earned(self, fixa):
        r = fixa.get(f"{API}/partner/summary", timeout=30)
        assert r.status_code == 200
        m = r.json()["fixa"]["metrics"]
        assert [x["key"] for x in m] == ["jobs_done", "money_earned", "rating"]
        me = m[1]
        assert me.get("money") is True
        assert isinstance(me["now"], int) and me["now"] >= 18000 or me["now"] > 0
        print("summary money_earned:", me)

    def test_trends_money_first(self, fixa):
        r = fixa.get(f"{API}/partner/trends", timeout=30)
        assert r.status_code == 200
        charts = r.json()["fixa"]["charts"]
        assert charts[0]["key"] == "money_earned" and charts[0].get("money") is True
        weeks = charts[0]["weeks"]
        print("money weeks tail:", weeks[-2:])
        # last bucket should match summary now
        s = fixa.get(f"{API}/partner/summary", timeout=30).json()["fixa"]["metrics"][1]["now"]
        last = weeks[-1]
        val = last.get("value", last.get("n", last)) if isinstance(last, dict) else last
        assert val == s, (last, s)


# --- Viewing hours
class TestViewingHours:
    def test_get_me(self, agent):
        r = agent.get(f"{API}/viewings/availability/me", timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert set(d) >= {"hours", "slot_minutes", "has_hours"}
        print("adaeze hours before:", d)

    def test_put_and_get(self, agent):
        body = {"hours": [{"weekday": 0, "start": "09:00", "end": "17:00"}, {"weekday": 5, "start": "10:30", "end": "14:00"}], "slot_minutes": 45}
        r = agent.put(f"{API}/viewings/availability/me", json=body, timeout=30)
        assert r.status_code == 200, r.text
        g = agent.get(f"{API}/viewings/availability/me", timeout=30).json()
        assert g["has_hours"] is True and g["slot_minutes"] == 45
        assert {(h["weekday"], h["start"], h["end"]) for h in g["hours"]} == {(0, "09:00", "17:00"), (5, "10:30", "14:00")}

    @pytest.mark.parametrize("hours,slot", [
        ([{"weekday": 0, "start": "17:00", "end": "09:00"}], 60),
        ([{"weekday": 0, "start": "09:00", "end": "12:00"}, {"weekday": 0, "start": "11:00", "end": "13:00"}], 60),
        ([{"weekday": 7, "start": "09:00", "end": "12:00"}], 60),
        ([{"weekday": 0, "start": "25:00", "end": "26:00"}], 60),
        ([], 15),
    ])
    def test_put_invalid(self, agent, hours, slot):
        r = agent.put(f"{API}/viewings/availability/me", json={"hours": hours, "slot_minutes": slot}, timeout=30)
        assert r.status_code in (400, 422), r.text

    def test_reset_empty(self, agent):
        r = agent.put(f"{API}/viewings/availability/me", json={"hours": [], "slot_minutes": 60}, timeout=30)
        assert r.status_code == 200
        assert r.json()["has_hours"] is False and r.json()["hours"] == []
