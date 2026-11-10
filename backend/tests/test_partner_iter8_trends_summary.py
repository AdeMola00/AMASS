# AMASS Partner app – iteration 8: Earnings charts (GET /api/partner/trends) + summary regression after _ts refactor
import os
from datetime import date, timedelta

import pytest
import requests

BASE_URL = (os.environ.get("EXPO_BACKEND_URL") or os.environ.get("EXPO_PUBLIC_BACKEND_URL")).rstrip("/")

EXPECTED = {
    "agent": ["money_sold", "new_leads", "visits_confirmed"],
    "seller": ["money_won", "offers_won", "offers_received"],
    "fixa": ["jobs_done", "jobs_accepted"],
}
ACCOUNTS = {
    "agent": ("adaeze.okoye@amass.africa", "Agent2026!"),
    "seller": ("seller.demo@amass.africa", "Partner2026!"),
    "fixa": ("fixa.demo@amass.africa", "Partner2026!"),
}


def login(email, pw):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw}, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"login failed {email}: {r.status_code}")
    s = requests.Session()
    s.headers["Authorization"] = f"Bearer {r.json()['access_token']}"
    return s


@pytest.fixture(scope="module")
def sessions():
    return {k: login(*v) for k, v in ACCOUNTS.items()}


# --- auth guard
def test_trends_requires_auth():
    r = requests.get(f"{BASE_URL}/api/partner/trends", timeout=30)
    assert r.status_code in (401, 403)


# --- per-role chart shape
@pytest.mark.parametrize("role", ["agent", "seller", "fixa"])
def test_trends_shape(sessions, role):
    r = sessions[role].get(f"{BASE_URL}/api/partner/trends", timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert role in data, data.keys()
    charts = data[role]["charts"]
    assert [c["key"] for c in charts] == EXPECTED[role]
    today = date.today()
    for c in charts:
        assert len(c["weeks"]) == 8
        starts = [date.fromisoformat(w["start"]) for w in c["weeks"]]
        assert starts == sorted(starts), "oldest first"
        for a, b in zip(starts, starts[1:]):
            assert (b - a).days == 7
        assert abs((today - starts[-1]).days - 7) <= 1, "last bucket starts ~7 days ago"
        assert all(isinstance(w["n"], int) and w["n"] >= 0 for w in c["weeks"])
        if c["key"].startswith("money_"):
            assert c.get("money") is True
        else:
            assert not c.get("money")
    print(role, {c["key"]: [w["n"] for w in c["weeks"]] for c in charts})


# --- role isolation: brand-only / buyer shouldn't get partner charts
def test_trends_buyer_empty():
    s = login("buyer.demo@amass.africa", "Partner2026!")
    r = s.get(f"{BASE_URL}/api/partner/trends", timeout=30)
    assert r.status_code == 200
    assert not ({"agent", "seller", "fixa"} & set(r.json().keys())), r.json().keys()


# --- summary regression (ts helper refactor)
@pytest.mark.parametrize("role", ["agent", "seller", "fixa"])
def test_summary_still_ok(sessions, role):
    r = sessions[role].get(f"{BASE_URL}/api/partner/summary", timeout=30)
    assert r.status_code == 200, r.text
    b = r.json()[role]
    assert len(b["metrics"]) == 3
    assert len(b["series"]) == 7
    assert all("now" in m and "key" in m for m in b["metrics"])


# --- consistency: last trends bucket ~= summary "now" for shared counters
def test_trends_consistent_with_summary(sessions):
    pairs = {"agent": [("new_leads", "new_leads"), ("visits_confirmed", "visits_confirmed")],
             "seller": [("offers_won", "offers_won"), ("offers_received", "offers_received"), ("money_won", "money_won")],
             "fixa": [("jobs_done", "jobs_done"), ("jobs_accepted", "jobs_accepted")]}
    mismatches = []
    for role, ps in pairs.items():
        t = sessions[role].get(f"{BASE_URL}/api/partner/trends", timeout=30).json()[role]["charts"]
        s = sessions[role].get(f"{BASE_URL}/api/partner/summary", timeout=30).json()[role]["metrics"]
        tm = {c["key"]: c["weeks"][-1]["n"] for c in t}
        sm = {m["key"]: m["now"] for m in s}
        for tk, sk in ps:
            if tm[tk] != sm[sk]:
                mismatches.append((role, tk, tm[tk], sm[sk]))
    assert not mismatches, mismatches
