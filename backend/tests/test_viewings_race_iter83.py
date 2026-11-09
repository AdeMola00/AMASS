"""Iter83 — race: parallel duplicate POST /viewings by the same buyer must yield only ONE open request."""
import os
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

import requests

BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
TUNDE_YABA = "bf3a95a5-be78-4c55-a8b8-210580ec7aa0"


def test_parallel_duplicate_request():
    tok = requests.post(f"{BASE}/api/auth/login", json={"email": "demo@amass.africa", "password": "amass2026"}).json()["access_token"]
    h = {"Authorization": f"Bearer {tok}"}
    lagos = timezone(timedelta(hours=1))
    start = (datetime.now(lagos) + timedelta(days=6)).replace(hour=10, minute=0, second=0, microsecond=0).isoformat()
    with ThreadPoolExecutor(6) as ex:
        rs = list(ex.map(lambda _: requests.post(f"{BASE}/api/viewings", headers=h, json={"property_id": TUNDE_YABA, "start": start, "note": "TEST_race"}), range(6)))
    created = [r.json()["id"] for r in rs if r.status_code == 201]
    print("statuses:", [r.status_code for r in rs])
    for vid in created:
        requests.post(f"{BASE}/api/viewings/{vid}/cancel", headers=h, json={"note": "TEST_cleanup"})
    assert len(created) == 1, f"{len(created)} open requests created for the same home"
