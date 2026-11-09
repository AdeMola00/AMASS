# Iter89 probe: notifications/inbox/social data checks for demo (read-only)
import os, requests, json, re
B = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
t = requests.post(f"{B}/api/auth/login", json={"email": "demo@amass.africa", "password": "amass2026"}).json()["access_token"]
H = {"Authorization": f"Bearer {t}"}
def g(p):
    r = requests.get(f"{B}{p}", headers=H, timeout=30)
    try: return r.status_code, r.json()
    except Exception: return r.status_code, r.text[:200]
allitems = []
for cat in ["all", "social"]:
    s, n = g(f"/api/notifications/center?category={cat}&limit=100")
    items = n if isinstance(n, list) else (n.get("items") or n.get("notifications") or [])
    print("notifications", cat, s, len(items))
    if cat == "all": allitems = items
    for i in items:
        if cat == "social": print("  social:", i.get("id"), i.get("kind"), i.get("title"), i.get("action_url"), i.get("meta"))
for i in allitems:
    if re.search(r"Test sofa|TEST_|List Friend", json.dumps(i)): print("  DIRTY notif:", i.get("title"), i.get("body"))
s, c = g("/api/chat/conversations")
cl = c if isinstance(c, list) else (c.get("items") or c.get("conversations") or [])
print("inbox", s, len(cl))
for x in cl:
    if re.search(r"test_[^\"]*@example\.com|TEST_|\"test", json.dumps(x), re.I): print("  DIRTY convo", json.dumps(x)[:250])
s, m = g("/api/social/posts/mine")
ml = m if isinstance(m, list) else (m.get("items") or m.get("posts") or [])
print("my posts", s, [(p.get("id"), p.get("title")) for p in ml][:5])
