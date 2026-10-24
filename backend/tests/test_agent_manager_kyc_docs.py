# Sprint 4/5: Agent listing manager + KYC identity + title documents
import base64
import os
import uuid

import pytest
import requests

BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")).rstrip("/")
PNG = "data:image/png;base64," + base64.b64encode(bytes.fromhex(
    "89504e470d0a1a0a0000000d4948445200000001000000010806000000"
    "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082")).decode()
DEMO_PID = "3998e99b-80f9-4ce1-b04e-6f16c4feae01"


def _login(email, pw):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw}, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"login failed {email}: {r.status_code} {r.text[:200]}")
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def demo():
    return _login("demo@amass.africa", "amass2026")


@pytest.fixture(scope="module")
def adaeze():
    return _login("adaeze.okoye@amass.africa", "Agent2026!")


@pytest.fixture(scope="module")
def fresh():
    email = f"test_kyc_{uuid.uuid4().hex[:8]}@amass.africa"
    r = requests.post(f"{BASE_URL}/api/auth/register", json={"email": email, "password": "TestPass2026!", "full_name": "TEST KYC User"}, timeout=30)
    assert r.status_code in (200, 201), r.text
    d = r.json()
    return {"h": {"Authorization": f"Bearer {d['access_token']}"}, "id": d["user"]["id"], "email": email}


@pytest.fixture(scope="module")
def fresh2():
    email = f"test_kyc2_{uuid.uuid4().hex[:8]}@amass.africa"
    r = requests.post(f"{BASE_URL}/api/auth/register", json={"email": email, "password": "TestPass2026!", "full_name": "TEST Other"}, timeout=30)
    assert r.status_code in (200, 201), r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


# ── Listing manager ──
class TestManager:
    def test_manager_shape(self, demo):
        r = requests.get(f"{BASE_URL}/api/agent/manager", headers=demo, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("listings", "active", "boosted", "views_30d", "saves", "leads_30d", "docs_pending", "docs_missing"):
            assert k in d["summary"]
        assert d["summary"]["listings"] == len(d["listings"]) and len(d["listings"]) > 0
        row = d["listings"][0]
        for k in ("views_total", "views_30d", "saves", "leads", "documents_status", "documents_verified", "boost_active", "status"):
            assert k in row
        assert "total" in row["leads"]
        pytest.demo_ids = [x["id"] for x in d["listings"]]
        assert DEMO_PID in pytest.demo_ids

    def test_leads_own_and_forbidden(self, demo, adaeze):
        r = requests.get(f"{BASE_URL}/api/agent/listings/{DEMO_PID}/leads", headers=demo, timeout=30)
        assert r.status_code == 200 and "leads" in r.json() and "counts" in r.json()
        r2 = requests.get(f"{BASE_URL}/api/agent/listings/{DEMO_PID}/leads", headers=adaeze, timeout=30)
        assert r2.status_code == 403
        assert requests.get(f"{BASE_URL}/api/agent/listings/nope-xyz/leads", headers=demo, timeout=30).status_code == 404

    def test_status_cycle(self, demo, adaeze):
        pid = [i for i in pytest.demo_ids if i != DEMO_PID][0]
        orig = requests.get(f"{BASE_URL}/api/properties/{pid}", headers=demo, timeout=30).json().get("status", "available")
        r = requests.patch(f"{BASE_URL}/api/agent/listings/{pid}/status", json={"status": "coming_soon"}, headers=demo, timeout=30)
        assert r.status_code == 200 and r.json()["status"] == "coming_soon"
        assert requests.get(f"{BASE_URL}/api/properties/{pid}", headers=demo, timeout=30).json()["status"] == "coming_soon"
        assert requests.patch(f"{BASE_URL}/api/agent/listings/{pid}/status", json={"status": "bogus"}, headers=demo, timeout=30).status_code == 422
        assert requests.patch(f"{BASE_URL}/api/agent/listings/{pid}/status", json={"status": "sold"}, headers=adaeze, timeout=30).status_code == 403
        r = requests.patch(f"{BASE_URL}/api/agent/listings/{pid}/status", json={"status": orig or "available"}, headers=demo, timeout=30)
        assert r.status_code == 200
        assert requests.get(f"{BASE_URL}/api/properties/{pid}", headers=demo, timeout=30).json()["status"] == (orig or "available")


# ── KYC identity ──
class TestKyc:
    def test_flow(self, fresh, fresh2, demo):
        h, uid = fresh["h"], fresh["id"]
        me = requests.get(f"{BASE_URL}/api/kyc/me", headers=h, timeout=30).json()
        assert me["status"] == "none" and len(me["id_types"]) == 4
        body = {"id_type": "nin", "id_document": PNG, "selfie": PNG}
        r = requests.post(f"{BASE_URL}/api/kyc/identity", json=body, headers=h, timeout=60)
        assert r.status_code == 200, r.text
        sub = r.json()
        assert sub["status"] == "pending" and sub["id_document_url"].startswith("/api/files/amass/")
        assert requests.post(f"{BASE_URL}/api/kyc/identity", json=body, headers=h, timeout=60).status_code == 409
        # non-admin cannot see queue
        assert requests.get(f"{BASE_URL}/api/admin/kyc/queue", headers=h, timeout=30).status_code in (401, 403)
        q = requests.get(f"{BASE_URL}/api/admin/kyc/queue?status=pending", headers=demo, timeout=30)
        assert q.status_code == 200 and any(x["user_id"] == uid for x in q.json()["identity"])
        assert requests.get(f"{BASE_URL}/api/admin/kyc/queue?status=bad", headers=demo, timeout=30).status_code == 422
        # files access
        fpath = sub["id_document_url"]
        assert requests.get(f"{BASE_URL}{fpath}", headers=h, timeout=30).status_code == 200
        assert requests.get(f"{BASE_URL}{fpath}", headers=demo, timeout=30).status_code == 200
        assert requests.get(f"{BASE_URL}{fpath}", headers=fresh2, timeout=30).status_code == 403
        # reject w/o reason
        rv = f"{BASE_URL}/api/admin/kyc/identity/{uid}/review"
        assert requests.post(rv, json={"approve": False}, headers=demo, timeout=30).status_code == 422
        r = requests.post(rv, json={"approve": False, "reason": "Blurry photo"}, headers=demo, timeout=30)
        assert r.status_code == 200 and r.json()["status"] == "rejected"
        me = requests.get(f"{BASE_URL}/api/kyc/me", headers=h, timeout=30).json()
        assert me["status"] == "rejected" and me["reason"] == "Blurry photo"
        r = requests.post(f"{BASE_URL}/api/kyc/identity", json=body, headers=h, timeout=60)
        assert r.status_code == 200 and r.json()["status"] == "pending"
        r = requests.post(rv, json={"approve": True}, headers=demo, timeout=30)
        assert r.status_code == 200 and r.json()["status"] == "approved"
        me = requests.get(f"{BASE_URL}/api/auth/me", headers=h, timeout=30).json()
        assert me.get("identity_verified") is True, me
        assert requests.post(f"{BASE_URL}/api/kyc/identity", json=body, headers=h, timeout=60).status_code == 409


# ── Title documents ──
class TestDocs:
    def test_doc_flow(self, demo, fresh2):
        ids = getattr(pytest, "demo_ids", None) or [x["id"] for x in requests.get(f"{BASE_URL}/api/agent/manager", headers=demo, timeout=30).json()["listings"]]
        # pick a listing that has no documents yet for a clean check
        pid = None
        for i in ids:
            d = requests.get(f"{BASE_URL}/api/properties/{i}/documents", headers=demo, timeout=30).json()
            if not d["documents"]:
                pid = i
                break
        if not pid:
            pytest.skip("no doc-free listing")
        r = requests.post(f"{BASE_URL}/api/properties/{pid}/documents", json={"kind": "c_of_o", "file": PNG, "title": "TEST_ C of O"}, headers=demo, timeout=60)
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["status"] == "pending" and doc["documents_status"] == "pending"
        assert requests.post(f"{BASE_URL}/api/properties/{pid}/documents", json={"kind": "nope", "file": PNG}, headers=demo, timeout=30).status_code == 422
        assert requests.post(f"{BASE_URL}/api/properties/{pid}/documents", json={"kind": "c_of_o", "file": PNG}, headers=fresh2, timeout=30).status_code == 403
        nd = requests.get(f"{BASE_URL}/api/properties/{pid}/documents", headers=fresh2, timeout=30).json()
        assert nd["owner"] is False and nd["documents"] == []
        r = requests.post(f"{BASE_URL}/api/admin/kyc/documents/{doc['id']}/review", json={"approve": True}, headers=demo, timeout=30)
        assert r.status_code == 200 and r.json()["documents_verified"] is True
        p = requests.get(f"{BASE_URL}/api/properties/{pid}", headers=demo, timeout=30).json()
        assert p.get("documents_verified") is True and "Certificate of Occupancy" in (p.get("verified_documents") or []), {k: p.get(k) for k in ("documents_verified", "verified_documents")}
        lat, lng = p.get("latitude") or p.get("lat"), p.get("longitude") or p.get("lng")
        pytest.doc_ctx = (pid, doc["id"], lat, lng)
        # marker flag while approved (same source of truth as the detail page)
        mr = requests.get(f"{BASE_URL}/api/map/markers", params={"min_lat": lat - 0.05, "max_lat": lat + 0.05, "min_lng": lng - 0.05, "max_lng": lng + 0.05}, headers=demo, timeout=30)
        assert mr.status_code == 200, mr.text
        m = [x for x in mr.json()["markers"] if x.get("id") == pid]
        assert m and m[0].get("documents_verified") is True
        # cleanup by admin
        dr = requests.delete(f"{BASE_URL}/api/properties/{pid}/documents/{doc['id']}", headers=demo, timeout=30)
        assert dr.status_code == 200 and dr.json()["documents_status"] == "none"
        assert requests.get(f"{BASE_URL}/api/properties/{pid}", headers=demo, timeout=30).json().get("documents_verified") is False

    def test_non_admin_cannot_delete_approved(self, adaeze, demo):
        ml = requests.get(f"{BASE_URL}/api/agent/manager", headers=adaeze, timeout=30).json()["listings"]
        pid = ml[0]["id"]
        doc = requests.post(f"{BASE_URL}/api/properties/{pid}/documents", json={"kind": "survey_plan", "file": PNG, "title": "TEST_ survey"}, headers=adaeze, timeout=60).json()
        assert requests.post(f"{BASE_URL}/api/admin/kyc/documents/{doc['id']}/review", json={"approve": True}, headers=demo, timeout=30).status_code == 200
        assert requests.delete(f"{BASE_URL}/api/properties/{pid}/documents/{doc['id']}", headers=adaeze, timeout=30).status_code == 409
        assert requests.delete(f"{BASE_URL}/api/properties/{pid}/documents/{doc['id']}", headers=demo, timeout=30).status_code == 200
