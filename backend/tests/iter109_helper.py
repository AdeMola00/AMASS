# Helper for iter109 manual flows: login, create prohibited post, poll, admin actions
import os, sys, json, time, requests

BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
tok = requests.post(f"{BASE}/api/auth/login", json={"email": "demo@amass.africa", "password": "amass2026"}, timeout=30).json()["access_token"]
H = {"Authorization": f"Bearer {tok}"}
cmd = sys.argv[1]


def mine(pid):
    return next((i for i in requests.get(f"{BASE}/api/feed/posts/mine", headers=H, timeout=30).json()["items"] if i["id"] == pid), None)


if cmd == "token":
    print(tok)
elif cmd == "create_bad":
    r = requests.post(f"{BASE}/api/feed/posts", headers=H, json={"type": "sale", "title": "TEST_ handgun retest", "body": "Selling a handgun, no papers needed, cash only, no questions asked.", "price": 150000, "category": "other", "condition": "good", "visibility": "city", "contact_chat": True}, timeout=30)
    print(r.status_code)
    pid = r.json().get("post", r.json())["id"]
    print("PID", pid)
    for _ in range(12):
        time.sleep(3)
        it = mine(pid)
        print(it["status"], (it.get("moderation") or {}).get("status"))
        if it["status"] == "hidden_review":
            break
elif cmd == "state":
    pid = sys.argv[2]
    it = mine(pid)
    print("mine:", it and it["status"], it and it.get("moderation", {}).get("status"))
    q = requests.get(f"{BASE}/api/feed/admin/queue", headers=H, params={"status": "appealed"}, timeout=30).json()
    row = next((i for i in q.get("items", q.get("rows", [])) if i["id"] == pid), None)
    print("in appealed queue:", bool(row), row and row.get("status"), row and (row.get("moderation") or {}).get("status"), row and bool(row.get("appeal")))
elif cmd == "remove":
    print(requests.post(f"{BASE}/api/feed/admin/posts/{sys.argv[2]}/decide", headers=H, json={"action": "remove", "note": "retest"}, timeout=30).json())
elif cmd == "appeal":
    r = requests.post(f"{BASE}/api/feed/posts/{sys.argv[2]}/appeal", headers=H, json={"body": sys.argv[3]}, timeout=30)
    print(r.status_code, r.text[:200])
elif cmd == "delete":
    print(requests.delete(f"{BASE}/api/feed/posts/{sys.argv[2]}", headers=H, timeout=30).json())
elif cmd == "cleanup_user":
    me = requests.get(f"{BASE}/api/auth/me", headers=H, timeout=30).json()["id"]
    for a in ("restore", "clear_strikes"):
        print(a, requests.post(f"{BASE}/api/feed/admin/users/{me}/action", headers=H, json={"action": a}, timeout=30).status_code)
