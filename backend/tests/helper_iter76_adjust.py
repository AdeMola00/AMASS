# Helper (iteration 76): admin MASS adjust for fixa tester (usage: python helper_iter76_adjust.py <amount> <reason>)
import os, sys, requests
BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")

def login(e, p):
    r = requests.post(f"{BASE}/api/auth/login", json={"email": e, "password": p}, timeout=20)
    r.raise_for_status()
    j = r.json()
    return {"Authorization": f"Bearer {j['access_token']}"}, j.get("user", {}).get("id")

admin, _ = login("demo@amass.africa", "amass2026")
fh, fid = login("fixa.tester+15339@amass.africa", "Fixa2026!")
if not fid:
    fid = requests.get(f"{BASE}/api/auth/me", headers=fh, timeout=20).json()["id"]
amt = int(sys.argv[1]) if len(sys.argv) > 1 else 0
if amt:
    r = requests.post(f"{BASE}/api/admin/wallet/{fid}/adjust", headers=admin,
                      json={"amount": amt, "currency": "MASS", "reason": sys.argv[2] if len(sys.argv) > 2 else "TEST iter76"}, timeout=20)
    print("adjust", r.status_code, r.text[:200])
print("fixa", fid, requests.get(f"{BASE}/api/wallet/mass", headers=fh, timeout=20).json().get("spendable"))
print("demo", requests.get(f"{BASE}/api/wallet/mass", headers=admin, timeout=20).json().get("spendable"))
