# Probe: agent home tile count (partner/me agent_listings) vs /agent/manager listing count by status
import collections, os, requests

B = os.environ["EXPO_BACKEND_URL"].rstrip("/")
tok = requests.post(f"{B}/api/auth/login", json={"email": "adaeze.okoye@amass.africa", "password": "Agent2026!"}).json()["access_token"]
h = {"Authorization": f"Bearer {tok}"}
me = requests.get(f"{B}/api/partner/me", headers=h).json()
d = requests.get(f"{B}/api/agent/manager", headers=h).json()
lst = d if isinstance(d, list) else (d.get("listings") or d.get("items") or [])
print("tile agent_listings", me["counts"].get("agent_listings"), "| manager keys", list(d.keys())[:8] if isinstance(d, dict) else "list", "| manager len", len(lst))
print("statuses", collections.Counter(x.get("status") for x in lst))
