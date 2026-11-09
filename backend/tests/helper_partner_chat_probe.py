# Probe: chat messages GET response shape (partner app expects {items: [...]}) + brand product description restore
import json, os, requests

B = os.environ["EXPO_BACKEND_URL"].rstrip("/")
tok = requests.post(f"{B}/api/auth/login", json={"email": "adaeze.okoye@amass.africa", "password": "Agent2026!"}).json()["access_token"]
h = {"Authorization": f"Bearer {tok}"}
cid = "b8375940-6c20-4aad-a534-cb6634d2ee41"
r = requests.get(f"{B}/api/chat/conversations/{cid}/messages?limit=60", headers=h)
d = r.json()
print("status", r.status_code, "type", type(d).__name__, "keys", list(d.keys()) if isinstance(d, dict) else len(d))
lst = d if isinstance(d, list) else (d.get("items") or d.get("messages") or [])
for m in lst[:6]:
    print(" -", m.get("sender_id", "")[:8], m.get("text", "")[:50], m.get("created_at"))

# restore brand product description from seed data
seed = json.load(open("/app/backend/shop_seed_data.json"))
found = None
def walk(o):
    global found
    if isinstance(o, dict):
        if "WSPA503" in str(o.get("name", "")) and "description" in o:
            found = o
        for v in o.values():
            walk(v)
    elif isinstance(o, list):
        for v in o:
            walk(v)
walk(seed)
print("seed desc:", (found or {}).get("description", "")[:120] if found else "NOT FOUND")
if found and os.environ.get("RESTORE") == "1":
    bt = requests.post(f"{B}/api/brand/auth/login", json={"email": "brand.demo@amass.africa", "password": "Partner2026!"}).json()["token"]
    pr = requests.patch(f"{B}/api/brand/products/151d47aa-9efd-5606-810a-4553a41406dc", json={"description": found["description"]}, headers={"Authorization": f"Bearer {bt}"})
    print("restore", pr.status_code, pr.json().get("description", "")[:80] if pr.ok else pr.text[:200])
