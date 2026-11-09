# Map/Home/Property Passport redesign: markers teaser fields + locked/unlocked property detail
import os
import pytest
import requests
from concurrent.futures import ThreadPoolExecutor

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", os.environ.get("EXPO_BACKEND_URL", "")).rstrip("/")
DEMO = ("demo@amass.africa", "amass2026")
FIXA = ("fixa.tester+15339@amass.africa", "Fixa2026!")
TEASER = ["title", "price", "listing_type", "cover", "bedrooms", "bathrooms", "size_sqm", "city", "place",
          "status", "access_cost", "is_free_amass_sale", "unlocked", "approx", "lat", "lng"]


def _login(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": creds[0], "password": creds[1]}, timeout=20)
    assert r.status_code == 200, r.text
    d = r.json()
    assert "access_token" in d and d["user"]["email"] == creds[0]
    return d["access_token"]


@pytest.fixture(scope="module")
def demo_token():
    return _login(DEMO)


@pytest.fixture(scope="module")
def fixa_token():
    return _login(FIXA)


def _markers(tok, **params):
    r = requests.get(f"{BASE_URL}/api/map/markers", params={"limit": 400, **params},
                     headers={"Authorization": f"Bearer {tok}"}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["markers"]


# Auth
def test_login_demo(demo_token):
    assert demo_token


def test_login_fixa(fixa_token):
    assert fixa_token


# Markers teaser fields
@pytest.mark.skip(reason="Pre-'pay to browse' assumption: demo >50% unlocked / fixa user never unlocked. State-dependent since iter84 map-time gate.")
def test_markers_teaser_fields_demo(demo_token):
    m = _markers(demo_token)
    assert len(m) > 0
    for k in TEASER:
        assert k in m[0], k
    unlocked = sum(1 for x in m if x["unlocked"])
    print(f"demo markers={len(m)} unlocked={unlocked}")
    assert unlocked / len(m) > 0.5


@pytest.mark.skip(reason="Pre-'pay to browse' assumption: demo >50% unlocked / fixa user never unlocked. State-dependent since iter84 map-time gate.")
def test_markers_fixa_all_locked(fixa_token):
    m = _markers(fixa_token)
    assert len(m) > 0
    bad = [x["id"] for x in m if x["unlocked"] or not x["approx"]]
    free = [x["id"] for x in m if x["is_free_amass_sale"]]
    print(f"fixa markers={len(m)} non-locked={len(bad)} free_sale={len(free)}")
    assert not bad, f"unlocked/non-approx markers for fixa: {bad[:5]}"
    # locked place must be city only
    for x in m:
        assert x["place"] == x["city"]
        assert x["access_cost"] > 0


def test_markers_listing_type_filter(demo_token):
    allm = _markers(demo_token)
    rent = _markers(demo_token, listing_type="rent")
    assert all(x["listing_type"] == "rent" for x in rent)
    assert len(rent) < len(allm)


def test_markers_q_filter(demo_token):
    m = _markers(demo_token, q="Ikoyi")
    print(f"Ikoyi markers={len(m)}")
    assert isinstance(m, list)


# Property detail locked vs unlocked; no 500s across all markers
def _get(tok, pid):
    return requests.get(f"{BASE_URL}/api/properties/{pid}", headers={"Authorization": f"Bearer {tok}"}, timeout=30)


@pytest.mark.skip(reason="Pre-'pay to browse' assumption: demo >50% unlocked / fixa user never unlocked. State-dependent since iter84 map-time gate.")
def test_locked_property_detail_all_markers(fixa_token):
    m = _markers(fixa_token)
    with ThreadPoolExecutor(8) as ex:
        resps = list(ex.map(lambda x: (x, _get(fixa_token, x["id"])), m))
    errors, mism = [], []
    for mk, r in resps:
        if r.status_code != 200:
            errors.append((mk["id"], r.status_code))
            continue
        d = r.json()
        assert d["approx"] is True and d["unlocked"] is False
        assert "image_count" in d
        assert len(d["images"]) <= 1
        assert d["location"] == d["city"]
        assert d["agent_name"] is None and d["amenities"] == []
        if abs(d["latitude"] - mk["lat"]) > 1e-9 or abs(d["longitude"] - mk["lng"]) > 1e-9:
            mism.append(mk["id"])
    print(f"locked checked={len(resps)} errors={errors[:5]} coord_mismatch={len(mism)}")
    assert not errors
    assert not mism, mism[:5]


def test_unlocked_property_detail_all_markers(demo_token):
    m = _markers(demo_token)
    with ThreadPoolExecutor(8) as ex:
        resps = list(ex.map(lambda x: (x, _get(demo_token, x["id"])), m))
    errors, mism = [], []
    for mk, r in resps:
        if r.status_code != 200:
            errors.append((mk["id"], r.status_code))
            continue
        d = r.json()
        if mk["unlocked"]:
            assert d["unlocked"] is True, mk["id"]
            assert not d.get("approx")
            if abs(d["latitude"] - mk["lat"]) > 1e-9:
                mism.append(mk["id"])
    print(f"unlocked checked={len(resps)} errors={errors[:5]} coord_mismatch={len(mism)}")
    assert not errors
    assert not mism


def test_locked_coords_differ_from_exact(demo_token, fixa_token):
    dm = {x["id"]: x for x in _markers(demo_token) if x["unlocked"]}
    fm = _markers(fixa_token)
    same = [x["id"] for x in fm if x["id"] in dm and x["lat"] == dm[x["id"]]["lat"] and x["lng"] == dm[x["id"]]["lng"]]
    assert not same, same[:5]


# Iteration 64: locked detail on a sample of 20 locked ids never 500s; cover/image_count coherent
def test_locked_detail_sample_no_500(fixa_token):
    ms = [m for m in _markers(fixa_token) if not m.get("unlocked")][:20]
    assert len(ms) >= 5
    h = {"Authorization": f"Bearer {fixa_token}"}
    for m in ms:
        r = requests.get(f"{BASE_URL}/api/properties/{m['id']}", headers=h, timeout=20)
        assert r.status_code == 200, (m["id"], r.status_code, r.text[:200])
        d = r.json()
        assert "_id" not in d
        imgs = d.get("images") or []
        assert len(imgs) <= 1, (m["id"], "locked leaks gallery")
        if imgs:
            assert d.get("image_count", 0) >= 1


# Iteration 64: Ikoyi search returns results; rent filter returns only rentals
def test_markers_search_ikoyi(demo_token):
    ms = _markers(demo_token, q="Ikoyi")
    assert len(ms) >= 1
    assert all(isinstance(m["lat"], (int, float)) for m in ms)


def test_markers_rent_filter(demo_token):
    ms = _markers(demo_token, listing_type="rent")
    assert len(ms) >= 1
    assert all(m["listing_type"] == "rent" for m in ms), {m["listing_type"] for m in ms}
