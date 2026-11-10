# Iteration 9 helper: create two TEST_ agent+seller users for per-user draft and offline photo tests
import json
import os
import time

import requests

BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") + "/api"
out = []
for tag in ("a", "b"):
    email = f"test_iter9_{tag}_{int(time.time())}@example.com"
    r = requests.post(f"{BASE}/auth/register", json={"email": email, "password": "Test2026!", "full_name": f"TEST_ Iter9 {tag.upper()}"})
    r.raise_for_status()
    tok = r.json()["access_token"]
    h = {"Authorization": f"Bearer {tok}"}
    r2 = requests.post(f"{BASE}/partner/roles", json={"roles": ["agent", "seller"]}, headers=h)
    me = requests.get(f"{BASE}/partner/me", headers=h).json()
    out.append({"email": email, "password": "Test2026!", "id": me.get("user", {}).get("id"), "roles_status": r2.status_code, "quota": me.get("listing_quota")})
print(json.dumps(out, indent=1))
json.dump(out, open("/tmp/iter9_users.json", "w"))
