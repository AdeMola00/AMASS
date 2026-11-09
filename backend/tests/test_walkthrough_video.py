# Walkthrough video feature: has_video on markers/detail, owner PATCH, chunked upload, create-with-video
import os
import uuid
import pytest
import requests


def _load_base():
    url = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
    if not url:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("EXPO_PUBLIC_BACKEND_URL=") or line.startswith("EXPO_BACKEND_URL="):
                    url = line.split("=", 1)[1].strip().strip('"')
                    break
    return url.rstrip("/")


BASE_URL = _load_base()
API = f"{BASE_URL}/api"

DEMO = ("demo@amass.africa", "amass2026")
ADAEZE = ("adaeze.okoye@amass.africa", "Agent2026!")
VIDEO_PROP = "f2342766-9443-44ee-929c-a1b46b830f29"   # owned by adaeze
LOCKED_VIDEO_PROP = "a4ba0122-30ce-48ab-b9d2-520940b92120"  # adaeze's; locked for demo
DEMO_PROP = "7d769d80-fdf8-4778-932a-f938aa3c27cf"    # owned by demo
RESTORE_URL = "https://www.youtube.com/watch?v=XgfKgbQhtNs"

STATE = {}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json={"email": creds[0], "password": creds[1]}, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    tok = d.get("token") or d.get("access_token")
    assert tok
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def demo_h():
    return _login(DEMO)


@pytest.fixture(scope="module")
def ada_h():
    return _login(ADAEZE)


@pytest.fixture(scope="module", autouse=True)
def restore_demo(ada_h):
    yield
    # Restore the seeded demo walkthrough on f2342766
    requests.patch(f"{API}/properties/{VIDEO_PROP}/walkthrough", json={"url": RESTORE_URL}, headers=ada_h, timeout=30)


# --- Auth ---
class TestAuth:
    def test_login_demo(self, demo_h):
        assert demo_h["Authorization"].startswith("Bearer ")

    def test_login_adaeze(self, ada_h):
        assert ada_h["Authorization"].startswith("Bearer ")


# --- Visibility: markers + detail ---
class TestVisibility:
    def test_markers_has_video(self, demo_h):
        r = requests.get(f"{API}/map/markers", params={"listing_type": "buy"}, headers=demo_h, timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        markers = d if isinstance(d, list) else (d.get("markers") or d.get("items") or [])
        assert markers, f"no markers: keys={list(d) if isinstance(d, dict) else type(d)}"
        assert all(isinstance(m.get("has_video"), bool) for m in markers), "has_video missing / non-bool"
        n = sum(1 for m in markers if m.get("has_video"))
        print(f"markers={len(markers)} with_video={n}")
        assert n >= 5
        # markers must not leak the video url
        assert not any(m.get("walkthrough_video") for m in markers if not m.get("unlocked"))

    def test_locked_detail_hides_video(self, demo_h):
        r = requests.get(f"{API}/properties/{LOCKED_VIDEO_PROP}", headers=demo_h, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        print("unlocked=", d.get("unlocked"))
        assert d["has_video"] is True
        if d.get("unlocked") is False:
            assert not d.get("walkthrough_video")

    def test_anon_detail_hides_video(self):
        r = requests.get(f"{API}/properties/{LOCKED_VIDEO_PROP}", timeout=30)
        if r.status_code in (401, 403):
            pytest.skip("anon detail requires auth")
        d = r.json()
        assert d.get("has_video") is True
        if not d.get("unlocked"):
            assert not d.get("walkthrough_video")

    def test_owner_detail_shows_video(self, ada_h):
        r = requests.get(f"{API}/properties/{VIDEO_PROP}", headers=ada_h, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        wv = d.get("walkthrough_video")
        assert d["has_video"] is True and wv
        for k in ("url", "provider", "embed_url", "thumbnail"):
            assert wv.get(k), f"missing {k}"
        assert wv["provider"] == "youtube"


# --- PATCH walkthrough ---
class TestPatch:
    def test_owner_set_youtu_be(self, ada_h):
        r = requests.patch(f"{API}/properties/{VIDEO_PROP}/walkthrough", json={"url": "https://youtu.be/XgfKgbQhtNs"}, headers=ada_h, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["has_video"] is True and d["walkthrough_video"]["provider"] == "youtube"
        assert d["walkthrough_video"]["url"] == "https://www.youtube.com/watch?v=XgfKgbQhtNs"

    def test_admin_can_patch(self, demo_h):
        r = requests.patch(f"{API}/properties/{VIDEO_PROP}/walkthrough", json={"url": RESTORE_URL}, headers=demo_h, timeout=30)
        assert r.status_code == 200, r.text

    def test_vimeo(self, ada_h):
        r = requests.patch(f"{API}/properties/{VIDEO_PROP}/walkthrough", json={"url": "https://vimeo.com/76979871"}, headers=ada_h, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["walkthrough_video"]["provider"] == "vimeo"
        requests.patch(f"{API}/properties/{VIDEO_PROP}/walkthrough", json={"url": RESTORE_URL}, headers=ada_h, timeout=30)

    def test_non_owner_forbidden(self, ada_h):
        r = requests.patch(f"{API}/properties/{DEMO_PROP}/walkthrough", json={"url": RESTORE_URL}, headers=ada_h, timeout=30)
        assert r.status_code == 403, r.text

    def test_junk_url_400(self, ada_h):
        r = requests.patch(f"{API}/properties/{VIDEO_PROP}/walkthrough", json={"url": "https://example.com/x"}, headers=ada_h, timeout=30)
        assert r.status_code == 400, r.text

    def test_unknown_prop_404(self, ada_h):
        r = requests.patch(f"{API}/properties/nope-{uuid.uuid4()}/walkthrough", json={"url": RESTORE_URL}, headers=ada_h, timeout=30)
        assert r.status_code == 404

    def test_unauth_401(self):
        r = requests.patch(f"{API}/properties/{VIDEO_PROP}/walkthrough", json={"url": RESTORE_URL}, timeout=30)
        assert r.status_code in (401, 403)


# --- Chunked upload ---
def _fake_mp4(size):
    header = bytes.fromhex("0000001866747970") + b"mp42" + b"\x00\x00\x00\x00" + b"mp42isom"
    return header + os.urandom(size - len(header))


class TestUpload:
    def test_chunked_upload_and_range(self, ada_h):
        uid = "TEST" + uuid.uuid4().hex[:20]
        blob = _fake_mp4(3 * 1024 * 1024)
        half = len(blob) // 2
        for i, part in enumerate([blob[:half], blob[half:]]):
            r = requests.post(f"{API}/uploads/video/chunk", data={"upload_id": uid, "index": str(i), "total": "2"},
                              files={"chunk": (f"c{i}", part, "application/octet-stream")}, headers=ada_h, timeout=60)
            assert r.status_code == 200, r.text
            assert r.json()["received"] == i + 1
        r = requests.post(f"{API}/uploads/video/complete", json={"upload_id": uid, "total": 2, "mime": "video/mp4", "filename": "t.mp4"}, headers=ada_h, timeout=120)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "/api/public-files/" in d["url"] and d["bytes"] == len(blob)
        STATE["upload_url"] = d["url"]
        g = requests.get(d["url"], headers={"Range": "bytes=0-99"}, timeout=60)
        assert g.status_code == 206, f"{g.status_code} {g.headers}"
        assert g.headers.get("Content-Range", "").startswith("bytes 0-99/")
        assert g.content == blob[:100]

    def test_patch_with_upload_url(self, ada_h):
        url = STATE.get("upload_url")
        if not url:
            pytest.skip("upload failed")
        r = requests.patch(f"{API}/properties/{VIDEO_PROP}/walkthrough", json={"url": url}, headers=ada_h, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["walkthrough_video"]["provider"] == "upload"
        g = requests.get(f"{API}/properties/{VIDEO_PROP}", headers=ada_h, timeout=30).json()
        assert g["walkthrough_video"]["provider"] == "upload"
        r = requests.patch(f"{API}/properties/{VIDEO_PROP}/walkthrough", json={"url": RESTORE_URL}, headers=ada_h, timeout=30)
        assert r.status_code == 200

    def test_complete_wrong_total(self, ada_h):
        uid = "TEST" + uuid.uuid4().hex[:20]
        r = requests.post(f"{API}/uploads/video/chunk", data={"upload_id": uid, "index": "0", "total": "2"},
                          files={"chunk": ("c0", _fake_mp4(4096), "application/octet-stream")}, headers=ada_h, timeout=60)
        assert r.status_code == 200
        r = requests.post(f"{API}/uploads/video/complete", json={"upload_id": uid, "total": 2, "mime": "video/mp4"}, headers=ada_h, timeout=60)
        assert r.status_code == 400, r.text

    def test_chunk_too_large(self, ada_h):
        uid = "TEST" + uuid.uuid4().hex[:20]
        r = requests.post(f"{API}/uploads/video/chunk", data={"upload_id": uid, "index": "0", "total": "1"},
                          files={"chunk": ("c0", os.urandom(4 * 1024 * 1024 + 10), "application/octet-stream")}, headers=ada_h, timeout=120)
        print("big chunk ->", r.status_code, r.text[:200])
        assert r.status_code == 413

    def test_bad_upload_id(self, ada_h):
        r = requests.post(f"{API}/uploads/video/chunk", data={"upload_id": "../x", "index": "0", "total": "1"},
                          files={"chunk": ("c0", b"abc", "application/octet-stream")}, headers=ada_h, timeout=30)
        assert r.status_code == 400

    def test_non_video_mime(self, ada_h):
        uid = "TEST" + uuid.uuid4().hex[:20]
        requests.post(f"{API}/uploads/video/chunk", data={"upload_id": uid, "index": "0", "total": "1"},
                      files={"chunk": ("c0", os.urandom(4096), "application/octet-stream")}, headers=ada_h, timeout=60)
        r = requests.post(f"{API}/uploads/video/complete", json={"upload_id": uid, "total": 1, "mime": "image/png"}, headers=ada_h, timeout=60)
        assert r.status_code == 400


# --- Create property with walkthrough_video_url ---
class TestCreate:
    def test_create_with_video(self, ada_h, demo_h):
        body = {"title": "TEST_ walkthrough listing", "description": "TEST_ property created by walkthrough test suite",
                "price": 12345678, "listing_type": "buy", "property_type": "apartment", "bedrooms": 2, "bathrooms": 2,
                "size_sqm": 90, "location": "Test Street", "city": "Lagos", "state": "Lagos", "latitude": 6.45,
                "longitude": 3.40, "images": ["https://images.unsplash.com/photo-1560448204-e02f11c3d0e2"],
                "is_owner": True, "walkthrough_video_url": "https://www.youtube.com/watch?v=mRkfUz4BEro"}
        r = requests.post(f"{API}/properties", json=body, headers=ada_h, timeout=60)
        h = ada_h
        if r.status_code == 402:  # adaeze is on the Starter 5-listing quota -> fall back to demo (admin)
            print("adaeze quota 402, falling back to demo")
            h = demo_h
            r = requests.post(f"{API}/properties", json=body, headers=demo_h, timeout=60)
            if r.status_code == 402:  # both demo accounts are at quota -> use a fresh TEST_ user
                print("demo quota 402, registering fresh TEST_ user")
                email = f"test_wv_{uuid.uuid4().hex[:8]}@example.com"
                rr = requests.post(f"{API}/auth/register", json={"email": email, "password": "Test1234!", "full_name": "TEST_ Walkthrough"}, timeout=30)
                assert rr.status_code in (200, 201), rr.text
                h = {"Authorization": f"Bearer {rr.json().get('token') or rr.json().get('access_token')}"}
                STATE["test_user"] = email
                r = requests.post(f"{API}/properties", json=body, headers=h, timeout=60)
        STATE["creator_h"] = h
        assert r.status_code in (200, 201), r.text
        pid = r.json()["id"]
        STATE["created"] = pid
        print("CREATED_PROPERTY_ID", pid)
        g = requests.get(f"{API}/properties/{pid}", headers=h, timeout=30)
        assert g.status_code == 200
        d = g.json()
        assert d["has_video"] is True
        assert d["walkthrough_video"]["provider"] == "youtube"
        assert d["walkthrough_video"]["video_id"] == "mRkfUz4BEro"

    def test_unset_on_throwaway(self, ada_h):
        pid = STATE.get("created")
        if not pid:
            pytest.skip("no throwaway")
        h = STATE["creator_h"]
        r = requests.patch(f"{API}/properties/{pid}/walkthrough", json={"url": None}, headers=h, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["has_video"] is False
        d = requests.get(f"{API}/properties/{pid}", headers=h, timeout=30).json()
        assert d["has_video"] is False and not d.get("walkthrough_video")

    def test_create_with_junk_video_400(self, ada_h):
        body = {"title": "TEST_ junk", "description": "TEST_ junk", "price": 1000, "listing_type": "buy",
                "property_type": "apartment", "size_sqm": 50, "location": "x", "city": "Lagos", "state": "Lagos",
                "latitude": 6.45, "longitude": 3.4, "is_owner": True, "walkthrough_video_url": "https://example.com/x"}
        r = requests.post(f"{API}/properties", json=body, headers=ada_h, timeout=60)
        if r.status_code in (200, 201):
            STATE["junk_created"] = r.json()["id"]
        assert r.status_code in (400, 402), r.text
