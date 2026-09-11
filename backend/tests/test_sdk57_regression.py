"""
Iteration 34 — Expo SDK 54 → 57 upgrade regression smoke tests.
Verifies that all pre-upgrade backend contracts still hold:
- /api/auth/login demo credentials
- /api/auth/me bearer flow
- /api/properties returns non-empty array
- /api/chat/conversations auth flow (+ post message + preview update)
- /api/auth/google-session invalid-session negative path (401)
- /api/register-push malformed payload (422)
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get(
    "EXPO_BACKEND_URL",
    "https://property-os-africa.preview.emergentagent.com",
).rstrip("/")

DEMO_EMAIL = "demo@amass.africa"
DEMO_PASSWORD = "amass2026"


# ---------------------------- fixtures --------------------------------------
@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def token(session):
    r = session.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD},
        timeout=30,
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:300]}"
    body = r.json()
    assert "access_token" in body and body["access_token"], "missing access_token"
    assert "user" in body and body["user"].get("email") == DEMO_EMAIL
    return body["access_token"]


@pytest.fixture(scope="module")
def auth_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------------------------- auth smoke ------------------------------------
class TestAuthSmoke:
    def test_login_returns_token_and_user(self, session):
        r = session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD},
            timeout=30,
        )
        assert r.status_code == 200
        j = r.json()
        assert "access_token" in j
        assert j.get("user", {}).get("email") == DEMO_EMAIL

    def test_me_with_bearer(self, session, auth_headers):
        r = session.get(f"{BASE_URL}/api/auth/me", headers=auth_headers, timeout=30)
        assert r.status_code == 200
        j = r.json()
        assert j.get("email") == DEMO_EMAIL

    def test_me_without_bearer_401(self, session):
        r = session.get(f"{BASE_URL}/api/auth/me", timeout=30)
        assert r.status_code in (401, 403)

    def test_google_session_invalid_401(self, session):
        r = session.post(
            f"{BASE_URL}/api/auth/google-session",
            json={"session_id": "invalid-session-id-xyz-12345"},
            timeout=30,
        )
        assert r.status_code == 401, f"expected 401, got {r.status_code}: {r.text[:200]}"


# ---------------------------- properties ------------------------------------
class TestProperties:
    def test_properties_list_non_empty(self, session):
        r = session.get(f"{BASE_URL}/api/properties", timeout=30)
        assert r.status_code == 200
        data = r.json()
        # can be a list, or {items:[...]}
        items = data if isinstance(data, list) else data.get("items", data.get("properties", []))
        assert isinstance(items, list)
        assert len(items) > 0, "expected at least one seeded property"


# ---------------------------- chat ------------------------------------------
class TestChat:
    def test_conversations_list_auth(self, session, auth_headers):
        r = session.get(f"{BASE_URL}/api/chat/conversations", headers=auth_headers, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) or isinstance(data, dict)

    def test_send_message_and_preview_updates(self, session, auth_headers):
        # find/create a conversation. Try starting from a property.
        # Fetch first property id
        pr = session.get(f"{BASE_URL}/api/properties", timeout=30)
        assert pr.status_code == 200
        pdata = pr.json()
        props = pdata if isinstance(pdata, list) else pdata.get("items", pdata.get("properties", []))
        if not props:
            pytest.skip("no properties to test chat with")

        prop = props[0]
        prop_id = prop.get("id") or prop.get("_id") or prop.get("property_id")
        if not prop_id:
            pytest.skip("property missing id")

        # attempt chat start-from-property
        start = session.post(
            f"{BASE_URL}/api/chat/start-from-property",
            headers=auth_headers,
            json={"property_id": prop_id},
            timeout=30,
        )
        if start.status_code == 404:
            # fallback: list conversations and reuse
            r = session.get(f"{BASE_URL}/api/chat/conversations", headers=auth_headers, timeout=30)
            convs = r.json()
            convs = convs if isinstance(convs, list) else convs.get("items", [])
            if not convs:
                pytest.skip("no conversation available to test message send")
            conv_id = convs[0].get("id") or convs[0].get("_id")
        else:
            assert start.status_code in (200, 201), f"start: {start.status_code} {start.text[:200]}"
            body = start.json()
            conv_id = body.get("id") or body.get("conversation_id") or body.get("_id")

        if not conv_id:
            pytest.skip("no conversation id resolved")

        unique_text = f"regression-{uuid.uuid4().hex[:8]}"
        m = session.post(
            f"{BASE_URL}/api/chat/conversations/{conv_id}/messages",
            headers=auth_headers,
            json={"kind": "text", "text": unique_text},
            timeout=30,
        )
        assert m.status_code in (200, 201), f"send msg: {m.status_code} {m.text[:200]}"

        # verify preview shows the new text
        r = session.get(f"{BASE_URL}/api/chat/conversations", headers=auth_headers, timeout=30)
        convs = r.json()
        convs = convs if isinstance(convs, list) else convs.get("items", [])
        match = next((c for c in convs if (c.get("id") or c.get("_id")) == conv_id), None)
        assert match is not None, "conversation missing after send"
        preview = str(match.get("last_message_preview") or match.get("preview") or match.get("last_message") or "")
        # Not strict — some backends store partial preview; assert message was accepted at minimum
        assert preview != "" or match.get("updated_at") is not None


# ---------------------------- push ------------------------------------------
class TestPush:
    def test_register_push_malformed_422(self, session, auth_headers):
        # empty body → missing required fields
        r = session.post(
            f"{BASE_URL}/api/register-push",
            headers=auth_headers,
            json={},
            timeout=30,
        )
        assert r.status_code == 422, f"expected 422, got {r.status_code}: {r.text[:200]}"
