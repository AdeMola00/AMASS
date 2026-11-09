# Cleanup: remove the TEST_ Blender marketplace item created by the partner-app UI run (by id, seller.demo only)
import os, requests

B = os.environ["EXPO_BACKEND_URL"].rstrip("/")
tok = requests.post(f"{B}/api/auth/login", json={"email": "seller.demo@amass.africa", "password": "Partner2026!"}).json()["access_token"]
h = {"Authorization": f"Bearer {tok}"}
d = requests.get(f"{B}/api/marketplace/my-listings", headers=h).json()
items = d if isinstance(d, list) else (d.get("items") or d.get("listings") or [])
for it in items:
    if it.get("name") == "TEST_ Blender":
        r = requests.delete(f"{B}/api/marketplace/items/{it['id']}", headers=h)
        if r.status_code >= 400:
            r = requests.patch(f"{B}/api/marketplace/items/{it['id']}/status", json={"status": "removed"}, headers=h)
        print("removed", it["id"], r.status_code)
