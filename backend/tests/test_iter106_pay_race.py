# Home Protect: concurrent double-pay of one quote must debit once (race check)
import os
import uuid
from concurrent.futures import ThreadPoolExecutor

import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    for line in open("/app/frontend/.env"):
        if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")
API = f"{BASE_URL}/api"


def test_concurrent_pay_single_debit():
    tok = requests.post(f"{API}/auth/login", json={"email": "demo@amass.africa", "password": "amass2026"}, timeout=20).json()["access_token"]
    H = {"Authorization": f"Bearer {tok}"}
    h = requests.post(f"{API}/home/homes", headers=H, json={"name": f"TEST_race_{uuid.uuid4().hex[:5]}", "ownership": "renting"}, timeout=20).json()
    h = h.get("home", h)
    try:
        q = requests.post(f"{API}/home/protect/quote", headers=H, json={"home_id": h["id"], "plan_key": "basic"}, timeout=20).json()
        b0 = requests.get(f"{API}/wallet/me", headers=H, timeout=20).json()["balance"]
        with ThreadPoolExecutor(4) as ex:
            res = list(ex.map(lambda _: requests.post(f"{API}/home/protect/quotes/{q['id']}/pay", headers=H, timeout=30), range(4)))
        b1 = requests.get(f"{API}/wallet/me", headers=H, timeout=20).json()["balance"]
        pols = requests.get(f"{API}/home/protect/policies?home_id={h['id']}", headers=H, timeout=20).json()["items"]
        print("codes", [r.status_code for r in res], "debited", b0 - b1, "expected", q["total_mass"], "policies", [p["id"] for p in pols])
        open("/tmp/race_policies.txt", "w").write("\n".join(p["id"] for p in pols))
        assert b0 - b1 == q["total_mass"] and len(pols) == 1
    finally:
        requests.delete(f"{API}/home/homes/{h['id']}?force=true", headers=H, timeout=20)
