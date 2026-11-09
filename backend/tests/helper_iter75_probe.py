# Probe helper (iteration 75): balances + locked property candidates for UI tests
import os, sys, requests
BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")

def login(e, p):
    r = requests.post(f"{BASE}/api/auth/login", json={"email": e, "password": p}, timeout=20)
    r.raise_for_status()
    return {"Authorization": f"Bearer {r.json()['access_token']}"}

for e, p in [("demo@amass.africa", "amass2026"), ("fixa.tester+15339@amass.africa", "Fixa2026!")]:
    h = login(e, p)
    w = requests.get(f"{BASE}/api/wallet/mass", headers=h, timeout=20)
    if w.status_code != 200:
        w = requests.get(f"{BASE}/api/wallet/me", headers=h, timeout=20)
    print(e, "wallet", w.status_code, str(w.json())[:300])
    props = requests.get(f"{BASE}/api/properties?limit=60", headers=h, timeout=20).json()
    if isinstance(props, dict):
        props = props.get("items") or props.get("properties") or []
    n = 0
    for pr in props:
        if pr.get("is_amass_exclusive"):
            continue
        q = requests.get(f"{BASE}/api/unlocks/quote", params={"featureKey": "property", "targetId": pr["id"]}, headers=h, timeout=20).json()
        if q.get("already_unlocked") or q.get("is_owner"):
            continue
        print("  ", pr["id"], pr.get("title", "")[:30], pr.get("area") or pr.get("location", ""), pr.get("listing_type"), "cost", q.get("cost"), "afford", q.get("can_afford"), "zone", q.get("zone") or q.get("tier"))
        n += 1
        if n >= 6:
            break
