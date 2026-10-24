# Helper (iteration 76): every bundle listed by the catalog must initialize (no 422 min top-up). Creates pending intents only (not paid).
import os, requests
BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
r = requests.post(f"{BASE}/api/auth/login", json={"email": "demo@amass.africa", "password": "amass2026"}, timeout=20)
h = {"Authorization": f"Bearer {r.json()['access_token']}"}
for cur, url in [("MASS", "/api/tokens/bundles?currency=MASS"), ("FIX", "/api/wallet/fix/bundles")]:
    b = requests.get(BASE + url, headers=h, timeout=20).json()
    b = b.get("bundles", b) if isinstance(b, dict) else b
    for x in b:
        i = requests.post(f"{BASE}/api/payments/initialize", headers=h, json={"provider": "paystack", "currency": cur, "bundle_id": x["id"]}, timeout=20)
        print(cur, x["id"], x.get("price_ngn"), "->", i.status_code, i.text[:90])
