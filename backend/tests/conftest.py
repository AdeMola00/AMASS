import os
import pytest
import requests

# pytest runs inside the backend container → default every suite to the local
# uvicorn instead of the Cloudflare-fronted preview edge (which 502s during
# reloads). Explicit env vars still win.
os.environ.setdefault("EXPO_BACKEND_URL", "http://localhost:8001")
os.environ.setdefault("EXPO_PUBLIC_BACKEND_URL", os.environ["EXPO_BACKEND_URL"])
os.environ.setdefault("TEST_BASE_URL", os.environ["EXPO_BACKEND_URL"].rstrip("/") + "/api")

BASE_URL = os.environ["EXPO_BACKEND_URL"].rstrip("/")


def pytest_collection_modifyitems(config, items):
    """Tests that `supervisorctl restart backend` knock every other xdist worker
    offline mid-request. Only run them serially (`-n 0`)."""
    if int(os.environ.get("PYTEST_XDIST_WORKER_COUNT", "1") or 1) <= 1:
        return
    skip = pytest.mark.skip(reason="restarts the backend — run serially with -n 0")
    for item in items:
        if item.get_closest_marker("restarts_backend"):
            item.add_marker(skip)


def pytest_xdist_make_scheduler(config, log):
    """`--dist loadscope` splits a module's classes across workers, but these
    suites hand state between classes (module-level STATE dicts, pytest.<attr>
    stashes). Keep every class of a file on one worker while still spreading
    files across the 2 workers."""
    if config.getvalue("dist") != "loadscope":
        return None
    from xdist.scheduler import LoadScopeScheduling

    class FileScopeScheduling(LoadScopeScheduling):
        def _split_scope(self, nodeid: str) -> str:
            return nodeid.split("::", 1)[0]

    return FileScopeScheduling(config, log)

DEMO_EMAIL = "demo@amass.africa"
DEMO_PASSWORD = "amass2026"


@pytest.fixture(scope="session")
def base_url():
    return BASE_URL


@pytest.fixture(scope="session")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def demo_token(api_client):
    """Ensure demo user exists and return access token."""
    # Try login first
    r = api_client.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD},
    )
    if r.status_code == 200:
        return r.json()["access_token"]
    # Register
    r = api_client.post(
        f"{BASE_URL}/api/auth/register",
        json={
            "email": DEMO_EMAIL,
            "password": DEMO_PASSWORD,
            "full_name": "Ada Demo",
        },
    )
    assert r.status_code == 200, f"Failed to register demo user: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def auth_headers(demo_token):
    return {"Authorization": f"Bearer {demo_token}", "Content-Type": "application/json"}
