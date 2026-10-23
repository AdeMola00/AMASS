"""Setup helpers for Phase 3.6 UI testing (invoked from shell)."""
import os, sys, json, uuid, requests

BASE = "https://property-os-africa.preview.emergentagent.com/api"
IMG = "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800"

def login(email, pw):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": pw}, timeout=20)
    r.raise_for_status()
    return r.json()["access_token"]

def register():
    email = f"mkt.e2e+{uuid.uuid4().hex[:8]}@amass.africa"
    r = requests.post(f"{BASE}/auth/register", json={"email": email, "password": "Buyer2026!", "full_name": "E2E Buyer"}, timeout=20)
    r.raise_for_status()
    return r.json()["access_token"], email

def create_listing(tok):
    body = {
        "name": f"E2E Sofa {uuid.uuid4().hex[:5]}",
        "description": "Three seater fabric sofa in great condition",
        "price": 120000,
        "category": "furniture",
        "subcategory": "sofas",
        "condition": "used",
        "image": IMG,
        "images": [IMG],
        "city": "Lagos - Lekki",
        "negotiable": True,
    }
    r = requests.post(f"{BASE}/marketplace/items", json=body, headers={"Authorization": f"Bearer {tok}"}, timeout=20)
    r.raise_for_status()
    return r.json()["item"]

if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "setup"
    if cmd == "setup":
        seller_tok = login("demo@amass.africa", "amass2026")
        buyer_tok, buyer_email = register()
        item = create_listing(seller_tok)
        out = {"seller_tok": seller_tok, "buyer_tok": buyer_tok, "buyer_email": buyer_email, "item": item}
        with open("/tmp/phase36_ctx.json", "w") as f:
            json.dump(out, f)
        print(json.dumps({"item_id": item["id"], "name": item["name"], "price": item["price"], "status": item["status"]}))
    elif cmd == "api":
        ctx = json.load(open("/tmp/phase36_ctx.json"))
        method, path = sys.argv[2], sys.argv[3]
        who = sys.argv[4] if len(sys.argv) > 4 else "seller"
        payload = json.loads(sys.argv[5]) if len(sys.argv) > 5 else None
        tok = ctx["seller_tok"] if who == "seller" else ctx["buyer_tok"]
        hdr = {"Authorization": f"Bearer {tok}"}
        r = getattr(requests, method.lower())(f"{BASE}{path}", json=payload, headers=hdr, timeout=20)
        try:
            print(json.dumps({"status": r.status_code, "body": r.json()}))
        except Exception:
            print(json.dumps({"status": r.status_code, "body": r.text[:400]}))
