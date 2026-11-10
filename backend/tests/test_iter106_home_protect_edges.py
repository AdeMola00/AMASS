# Home Protect edge cases + My Home integration (iter106)
import base64
import io
import os
import time
import uuid
from datetime import date, timedelta

import pytest
import requests
from PIL import Image, ImageDraw

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    for line in open("/app/frontend/.env"):
        if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")
API = f"{BASE_URL}/api"
STATE: dict = {}


def _login(email, pw):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=20)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def H():
    return _login("demo@amass.africa", "amass2026")


@pytest.fixture(scope="module")
def homes(H):
    r = requests.get(f"{API}/home/homes", headers=H, timeout=20)
    assert r.status_code == 200
    data = r.json()
    items = data.get("items", data) if isinstance(data, dict) else data
    return items


@pytest.fixture(scope="module")
def lekki(homes):
    h = next((h for h in homes if "lekki" in (h.get("name") or "").lower()), None)
    if not h:
        pytest.skip("No Lekki home")
    return h


@pytest.fixture(scope="module")
def tmp_home(H):
    r = requests.post(f"{API}/home/homes", headers=H, json={"name": f"TEST_rent_{uuid.uuid4().hex[:5]}", "kind": "flat", "ownership": "renting"}, timeout=20)
    assert r.status_code == 201, r.text
    h = r.json()
    h = h.get("home", h)
    yield h
    requests.delete(f"{API}/home/homes/{h['id']}?force=true", headers=H, timeout=20)


def _jpeg(text=None, size=(320, 320)):
    img = Image.new("RGB", size, "white")
    if text:
        d = ImageDraw.Draw(img)
        for i, t in enumerate(text):
            d.text((10, 10 + i * 22), t, fill="black")
    else:
        img = Image.new("RGB", size, (200, 200, 210))
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=70)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


# Status without home_id
def test_status_no_home(H):
    r = requests.get(f"{API}/home/protect/status", headers=H, timeout=20)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["open"] is True and isinstance(d["policies"], list) and "items_protected" in d
    assert d["live"] is not None


# Non-admin → 403 on admin routes
def test_non_admin_forbidden():
    email = f"test_hp_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": "secret123", "full_name": "TEST HP"}, timeout=20)
    assert r.status_code in (200, 201), r.text
    h = {"Authorization": f"Bearer {r.json()['access_token']}"}
    for p in ("summary", "rate-cards", "policies", "claims"):
        rr = requests.get(f"{API}/home/protect/admin/{p}", headers=h, timeout=20)
        assert rr.status_code == 403, (p, rr.status_code)
    rr = requests.post(f"{API}/home/protect/admin/claims/x/decide", headers=h, json={"status": "paid", "payout_ngn": 1000}, timeout=20)
    assert rr.status_code == 403


# Renting home: building excluded; foreign item ids ignored
def test_renting_quote_and_foreign_items(H, tmp_home, lekki):
    items = requests.get(f"{API}/home/items?home_id={lekki['id']}", headers=H, timeout=20).json()
    rows = items.get("items", items)
    foreign = [i["id"] for i in rows][:2]
    assert foreign
    r = requests.post(f"{API}/home/protect/quote", headers=H, json={"home_id": tmp_home["id"], "plan_key": "basic", "include_building": True, "item_ids": foreign}, timeout=20)
    assert r.status_code == 201, r.text
    q = r.json()
    assert q["include_building"] is False
    assert q["breakdown"]["building_ngn"] == 0
    assert q["items"] == [] and q["breakdown"]["appliances_ngn"] == 0
    STATE["quote"] = q


# Pay twice → single debit, same policy
def test_pay_twice_idempotent(H):
    q = STATE.get("quote") or pytest.skip("no quote")
    w0 = requests.get(f"{API}/wallet/me", headers=H, timeout=20).json()
    r1 = requests.post(f"{API}/home/protect/quotes/{q['id']}/pay", headers=H, timeout=30)
    assert r1.status_code == 200, r1.text
    r2 = requests.post(f"{API}/home/protect/quotes/{q['id']}/pay", headers=H, timeout=30)
    assert r2.status_code == 200, r2.text
    assert r1.json()["id"] == r2.json()["id"]
    w1 = requests.get(f"{API}/wallet/me", headers=H, timeout=20).json()
    bal = lambda w: (w.get("balance", 0) + w.get("bonus_balance", 0)) if "balance" in w else w["wallet"]["balance"]
    STATE["policy"] = r1.json()
    STATE["debit"] = (bal(w0), bal(w1), q["total_mass"])
    assert bal(w0) - bal(w1) == q["total_mass"], STATE["debit"]


# Claim date before policy start → 422
def test_claim_before_start(H):
    p = STATE.get("policy") or pytest.skip("no policy")
    before = (date.fromisoformat(p["starts_at"]) - timedelta(days=3)).isoformat()
    r = requests.post(f"{API}/home/protect/claims", headers=H, json={"policy_id": p["id"], "scope": "contents", "incident_type": "theft", "incident_date": before, "description": "TEST_ something was stolen"}, timeout=20)
    assert r.status_code == 422, r.text


# Second new-policy quote on covered home → 409
def test_quote_on_covered_home_409(H, tmp_home):
    r = requests.post(f"{API}/home/protect/quote", headers=H, json={"home_id": tmp_home["id"], "plan_key": "basic"}, timeout=20)
    assert r.status_code == 409


# My Home integration
def test_items_protection(H, lekki):
    d = requests.get(f"{API}/home/items?home_id={lekki['id']}", headers=H, timeout=20).json()
    rows = d.get("items", [])
    active = [i for i in rows if (i.get("protection") or {}).get("status") == "active"]
    assert active, [i.get("protection") for i in rows]
    STATE["items_summary"] = {k: v for k, v in d.items() if k != "items"}
    flat = str(STATE["items_summary"])
    assert "protected" in flat, flat


def test_overview_protection(H, lekki):
    d = requests.get(f"{API}/home/overview?home_id={lekki['id']}", headers=H, timeout=20).json()
    assert d["protection"]["status"] in ("active", "expiring"), d.get("protection")


def test_spending_insurance(H, lekki):
    d = requests.get(f"{API}/home/spending?home_id={lekki['id']}", headers=H, timeout=20).json()
    assert float(d["totals"]["insurance"]) > 0, d.get("totals")


def test_notifications_center(H):
    r = requests.get(f"{API}/notifications/center?audience=consumer", headers=H, timeout=20)
    assert r.status_code == 200
    s = r.text
    assert "HOME_PROTECT_POLICY" in s and "HOME_PROTECT_CLAIM" in s


# AI scan sanity
def test_ai_identify(H):
    r = requests.post(f"{API}/home/ai/identify", headers=H, json={"data_url": _jpeg()}, timeout=90)
    assert r.status_code == 200, r.text
    d = r.json()
    STATE["identify"] = d
    assert "is_household_item" in d and "confidence" in d and "missing" in d, d


def test_ai_receipt(H):
    url = _jpeg(["SHOPRITE LEKKI", "Date: 14/03/2026", "Hisense Fridge 1x", "TOTAL NGN 250,000", "Warranty 12 months"], (360, 200))
    r = requests.post(f"{API}/home/ai/receipt", headers=H, json={"data_url": url}, timeout=90)
    assert r.status_code == 200, r.text
    d = r.json()
    STATE["receipt"] = d
    assert "is_receipt" in d and "confidence" in d and "missing" in d, d


def test_zz_print_state():
    print("STATE", {k: v for k, v in STATE.items() if k not in ("quote",)})
