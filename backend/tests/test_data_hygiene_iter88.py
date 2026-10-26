# Data hygiene regression (iteration 88): user-visible content must not contain QA/test artefacts.
import os, re
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", os.environ.get("EXPO_BACKEND_URL", "")).rstrip("/")
PAT = re.compile(r"^(test|qa\b|chat test)|tester|test_", re.I)


@pytest.fixture(scope="module")
def H():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "demo@amass.africa", "password": "amass2026"}, timeout=30)
    if r.status_code != 200:
        pytest.skip("demo login failed")
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _items(d):
    if isinstance(d, list):
        return d
    for k in ("items", "markers", "providers"):
        if isinstance(d.get(k), list):
            return d[k]
    return []


# Find Home listings
def test_properties_clean(H):
    its = _items(requests.get(f"{BASE_URL}/api/properties?limit=500", headers=H).json())
    assert [p["title"] for p in its if PAT.search(p.get("title") or "")] == []


# Market / Declutter
def test_marketplace_clean(H):
    its = _items(requests.get(f"{BASE_URL}/api/marketplace?limit=300", headers=H).json())
    assert [p["name"] for p in its if PAT.search(p.get("name") or "")] == []


# FIXA directory
def test_fixa_clean(H):
    its = _items(requests.get(f"{BASE_URL}/api/fixa/providers?limit=200", headers=H).json())
    assert [p.get("name") for p in its if PAT.search(str(p.get("name") or ""))] == []


# Feeds (social feed) — known failing in iteration 88 (TEST_alert / TEST_spot posts)
def test_feed_clean(H):
    its = _items(requests.get(f"{BASE_URL}/api/social/feed?limit=50", headers=H).json())
    bad = [p.get("title") for p in its if PAT.search(str(p.get("title") or ""))]
    assert bad == [], f"{len(bad)} test posts in feed: {bad[:5]}"
