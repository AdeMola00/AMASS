"""Iteration 73 — concurrency: parallel unlocks (different keys) charge once; parallel mock
checkout loads credit once and issue one receipt."""
import os
import uuid
from concurrent.futures import ThreadPoolExecutor

import requests

BASE = (os.environ.get("EXPO_BACKEND_URL") or os.environ.get("EXPO_PUBLIC_BACKEND_URL")).rstrip("/")


def H(t, **k):
    return {"Authorization": f"Bearer {t}", **k}


def _user():
    r = requests.post(f"{BASE}/api/auth/register", json={"email": f"TEST_cc_{uuid.uuid4().hex[:8]}@amass-qa.africa", "password": "Test1234!", "full_name": "CC QA"})
    return r.json()["access_token"]


def _bal(t):
    return requests.get(f"{BASE}/api/wallet/mass", headers=H(t)).json()["spendable"]


# Parallel unlock attempts with distinct idempotency keys → exactly one charge + one receipt
def test_parallel_unlock_single_charge():
    t = _user()
    admin = requests.post(f"{BASE}/api/auth/login", json={"email": "demo@amass.africa", "password": "amass2026"}).json()["access_token"]
    items = requests.get(f"{BASE}/api/properties?limit=100", headers=H(admin)).json()
    pid = next(p["id"] for p in items if p.get("token_cost") == 10 and (p.get("listing_type") or "") == "rent")
    b0 = _bal(t)

    def go(_):
        return requests.post(f"{BASE}/api/unlocks", headers=H(t, **{"Idempotency-Key": uuid.uuid4().hex}), json={"featureKey": "property", "targetId": pid}).status_code

    with ThreadPoolExecutor(6) as ex:
        codes = list(ex.map(go, range(6)))
    print("codes", codes)
    assert b0 - _bal(t) == 10
    recs = requests.get(f"{BASE}/api/receipts", headers=H(t)).json()["items"]
    assert len([r for r in recs if r["kind"] == "property_access"]) == 1


# Parallel mock checkout loads → credited once, one receipt
def test_parallel_mock_fulfil_once():
    t = _user()
    b0 = _bal(t)
    ref = requests.post(f"{BASE}/api/payments/initialize", headers=H(t), json={"bundle_id": "explorer", "currency": "MASS", "provider": "flutterwave"}).json()["reference"]
    with ThreadPoolExecutor(5) as ex:
        list(ex.map(lambda _: requests.get(f"{BASE}/api/payments/mock/{ref}", allow_redirects=False).status_code, range(5)))
    st = requests.get(f"{BASE}/api/payments/status/{ref}", headers=H(t)).json()
    assert st["status"] == "paid"
    assert _bal(t) - b0 == st["credits"] + st["bonus"] == 10
    recs = [r for r in requests.get(f"{BASE}/api/receipts", headers=H(t)).json()["items"] if r["kind"] == "topup"]
    assert len(recs) == 1 and recs[0]["provider"] == "flutterwave" and recs[0]["amount_ngn"] == 1000
