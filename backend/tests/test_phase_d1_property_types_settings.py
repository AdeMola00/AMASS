"""Phase D-1 backend tests — property types registry + app_settings.

Verifies:
 - Public GET /api/property-types (9 seed types, expected slugs, colors, order)
 - Admin CRUD on property types (create/patch/delete/soft-delete/color validation)
 - Public GET /api/settings/feature-flags (9 default flags)
 - Admin GET/PATCH/RESET /api/admin/settings
 - RBAC (401 unauth, 403 non-admin)
 - Regression on Phase 6C /api/passport and Phase 6D cockpit
 - Idempotent seeding on backend restart
"""
from __future__ import annotations

import copy
import os
import time
import uuid

import pytest
import requests

BASE_URL = os.environ.get("EXPO_BACKEND_URL", "https://property-os-africa.preview.emergentagent.com").rstrip("/")

EXPECTED_TYPES = {
    "residential":   ("#2563EB", 1),
    "apartment":     ("#7C3AED", 2),
    "estate":        ("#059669", 3),
    "land":          ("#92400E", 4),
    "commercial":    ("#EA580C", 5),
    "industrial":    ("#374151", 6),
    "hospitality":   ("#0D9488", 7),
    "institutional": ("#4338CA", 8),
    "other":         ("#6B7280", 99),
}

DEFAULT_FLAG_KEYS = {
    "PROPERTY_DISCOVERY_ENABLED",
    "GOOGLE_PLACES_ENABLED",
    "PROPERTY_CLAIMS_ENABLED",
    "PROPERTY_VERIFICATION_ENABLED",
    "PROPERTY_PASSPORT_ENABLED",
    "AI_VALUATION_ENABLED",
    "AI_VALUATION_NARRATIVE_ENABLED",
    "BACKGROUND_DISCOVERY_JOBS_ENABLED",
    "VERIFICATION_EXPIRY_SWEEPER_ENABLED",
}

DEFAULT_FLAG_VALUES = {
    "PROPERTY_DISCOVERY_ENABLED": True,
    "GOOGLE_PLACES_ENABLED": False,
    "PROPERTY_CLAIMS_ENABLED": True,
    "PROPERTY_VERIFICATION_ENABLED": True,
    "PROPERTY_PASSPORT_ENABLED": True,
    "AI_VALUATION_ENABLED": True,
    "AI_VALUATION_NARRATIVE_ENABLED": True,
    "BACKGROUND_DISCOVERY_JOBS_ENABLED": True,
    "VERIFICATION_EXPIRY_SWEEPER_ENABLED": True,
}

SETTING_KEYS = [
    "feature_flags",
    "verification_weights",
    "verification_accuracy_m",
    "verification_expiry",
    "google_pricing",
    "google_limits",
    "valuation_config",
    "duplicate_classification",
]


# ── Fixtures ─────────────────────────────────────────────────
@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="module")
def admin_headers(s):
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": "demo@amass.africa", "password": "amass2026"})
    if r.status_code != 200:
        # try register
        r = s.post(f"{BASE_URL}/api/auth/register",
                   json={"email": "demo@amass.africa",
                         "password": "amass2026", "full_name": "Ada Demo"})
    assert r.status_code == 200, f"auth failed: {r.status_code} {r.text}"
    token = r.json()["access_token"]
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def non_admin_headers(s):
    email = f"nonadmin_{uuid.uuid4().hex[:8]}@example.com"
    r = s.post(f"{BASE_URL}/api/auth/register",
               json={"email": email, "password": "pass1234", "full_name": "Non Admin"})
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    return {"Authorization": f"Bearer {r.json()['access_token']}",
            "Content-Type": "application/json"}


# ── Property Types (public) ──────────────────────────────────
class TestPropertyTypesPublic:
    def test_list_returns_9_seeds_with_expected_slugs_and_colors(self, s):
        r = s.get(f"{BASE_URL}/api/property-types")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        by_slug = {d["slug"]: d for d in data}
        for slug, (hexcode, order) in EXPECTED_TYPES.items():
            assert slug in by_slug, f"missing {slug}"
            assert by_slug[slug]["color"].upper() == hexcode.upper(), f"{slug} color mismatch"
            assert by_slug[slug]["order"] == order
            assert by_slug[slug]["active"] is True
        # All 9 exist
        for slug in EXPECTED_TYPES:
            assert slug in by_slug

    def test_sorted_by_order_asc(self, s):
        r = s.get(f"{BASE_URL}/api/property-types")
        assert r.status_code == 200
        orders = [d["order"] for d in r.json()
                  if d["slug"] in EXPECTED_TYPES]
        assert orders == sorted(orders), "not ordered ascending"

    def test_include_inactive_no_auth(self, s):
        r = s.get(f"{BASE_URL}/api/property-types", params={"include_inactive": "true"})
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ── Property Types (admin CRUD) ──────────────────────────────
class TestPropertyTypesAdminCRUD:
    NEW_SLUG = f"coliving_{uuid.uuid4().hex[:6]}"

    def test_create_requires_admin_401_unauth(self, s):
        r = s.post(f"{BASE_URL}/api/admin/property-types",
                   json={"slug": self.NEW_SLUG, "label": "Coliving",
                         "color": "#123456"})
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"

    def test_create_forbidden_for_non_admin(self, s, non_admin_headers):
        r = s.post(f"{BASE_URL}/api/admin/property-types",
                   headers=non_admin_headers,
                   json={"slug": self.NEW_SLUG, "label": "Coliving",
                         "color": "#123456"})
        assert r.status_code == 403, f"expected 403, got {r.status_code}"

    def test_create_new_slug_by_admin(self, s, admin_headers):
        r = s.post(f"{BASE_URL}/api/admin/property-types",
                   headers=admin_headers,
                   json={"slug": self.NEW_SLUG, "label": "Coliving",
                         "color": "#123456", "order": 50,
                         "subtypes": ["shared", "private"]})
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["slug"] == self.NEW_SLUG
        assert doc["active"] is True
        assert doc.get("is_system") is False

    def test_create_duplicate_slug_409(self, s, admin_headers):
        r = s.post(f"{BASE_URL}/api/admin/property-types",
                   headers=admin_headers,
                   json={"slug": "residential", "label": "Dup",
                         "color": "#123456"})
        assert r.status_code == 409

    def test_patch_invalid_hex_color_rejected(self, s, admin_headers):
        r = s.patch(f"{BASE_URL}/api/admin/property-types/residential",
                    headers=admin_headers, json={"color": "red"})
        assert r.status_code in (400, 422), f"expected 4xx, got {r.status_code}"

    def test_patch_non_admin_forbidden(self, s, non_admin_headers):
        r = s.patch(f"{BASE_URL}/api/admin/property-types/residential",
                    headers=non_admin_headers, json={"label": "X"})
        assert r.status_code == 403

    def test_patch_updates_label_and_subtypes(self, s, admin_headers):
        # Update the newly-created slug (not a system one)
        r = s.patch(f"{BASE_URL}/api/admin/property-types/{self.NEW_SLUG}",
                    headers=admin_headers,
                    json={"label": "CoLiving Updated",
                          "subtypes": ["shared", "private", "pod"],
                          "color": "#ABCDEF"})
        assert r.status_code == 200, r.text
        # verify via public GET (include_inactive=true so we see any state)
        listing = s.get(f"{BASE_URL}/api/property-types",
                        params={"include_inactive": "true"}).json()
        by_slug = {d["slug"]: d for d in listing}
        assert by_slug[self.NEW_SLUG]["label"] == "CoLiving Updated"
        assert "pod" in by_slug[self.NEW_SLUG]["subtypes"]
        assert by_slug[self.NEW_SLUG]["color"].upper() == "#ABCDEF"

    def test_delete_non_system_hard_deletes(self, s, admin_headers):
        r = s.delete(f"{BASE_URL}/api/admin/property-types/{self.NEW_SLUG}",
                     headers=admin_headers)
        assert r.status_code == 200, r.text
        assert r.json().get("action") == "deleted"
        # verify absent
        r2 = s.get(f"{BASE_URL}/api/property-types",
                   params={"include_inactive": "true"}).json()
        assert self.NEW_SLUG not in {d["slug"] for d in r2}

    def test_delete_system_type_soft_deactivates(self, s, admin_headers):
        # Deactivate 'other' (system) then re-activate to restore state
        r = s.delete(f"{BASE_URL}/api/admin/property-types/other",
                     headers=admin_headers)
        assert r.status_code == 200, r.text
        assert r.json().get("action") == "deactivated_system_type"
        # Confirm doc still present but inactive
        all_types = s.get(f"{BASE_URL}/api/property-types",
                          params={"include_inactive": "true"}).json()
        by = {d["slug"]: d for d in all_types}
        assert "other" in by
        assert by["other"]["active"] is False
        # Restore for regression cleanliness
        r_restore = s.patch(f"{BASE_URL}/api/admin/property-types/other",
                            headers=admin_headers, json={"active": True})
        assert r_restore.status_code == 200


# ── App Settings — public ────────────────────────────────────
class TestFeatureFlagsPublic:
    def test_public_flags_no_auth(self, s):
        r = s.get(f"{BASE_URL}/api/settings/feature-flags")
        assert r.status_code == 200
        flags = r.json()
        assert isinstance(flags, dict)
        assert DEFAULT_FLAG_KEYS.issubset(set(flags.keys())), \
            f"missing flags: {DEFAULT_FLAG_KEYS - set(flags.keys())}"
        # Also verify all are booleans
        for k in DEFAULT_FLAG_KEYS:
            assert isinstance(flags[k], bool)


# ── App Settings — admin RBAC + CRUD ────────────────────────
class TestAppSettingsAdmin:
    def test_admin_list_all(self, s, admin_headers):
        r = s.get(f"{BASE_URL}/api/admin/settings", headers=admin_headers)
        assert r.status_code == 200
        data = r.json()
        for k in SETTING_KEYS:
            assert k in data, f"missing setting {k}"

    def test_admin_list_forbidden_for_non_admin(self, s, non_admin_headers):
        r = s.get(f"{BASE_URL}/api/admin/settings", headers=non_admin_headers)
        assert r.status_code == 403

    def test_admin_list_unauth_401(self, s):
        r = s.get(f"{BASE_URL}/api/admin/settings")
        assert r.status_code in (401, 403)

    @pytest.mark.parametrize("key", SETTING_KEYS)
    def test_get_each_known_key(self, s, admin_headers, key):
        r = s.get(f"{BASE_URL}/api/admin/settings/{key}", headers=admin_headers)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["key"] == key
        assert "value" in body

    def test_get_unknown_key_404(self, s, admin_headers):
        r = s.get(f"{BASE_URL}/api/admin/settings/nonexistent_key_xxx",
                  headers=admin_headers)
        assert r.status_code == 404

    def test_get_key_forbidden_non_admin(self, s, non_admin_headers):
        r = s.get(f"{BASE_URL}/api/admin/settings/feature_flags",
                  headers=non_admin_headers)
        assert r.status_code == 403

    def test_patch_feature_flags_updates_and_persists(self, s, admin_headers):
        # flip GOOGLE_PLACES_ENABLED -> True, verify, then reset
        r = s.patch(f"{BASE_URL}/api/admin/settings/feature_flags",
                    headers=admin_headers,
                    json={"value": {"GOOGLE_PLACES_ENABLED": True}})
        assert r.status_code == 200, r.text
        # verify
        g = s.get(f"{BASE_URL}/api/settings/feature-flags").json()
        assert g.get("GOOGLE_PLACES_ENABLED") is True
        # reset
        rr = s.post(f"{BASE_URL}/api/admin/settings/feature_flags/reset",
                    headers=admin_headers)
        assert rr.status_code == 200
        g2 = s.get(f"{BASE_URL}/api/settings/feature-flags").json()
        assert g2.get("GOOGLE_PLACES_ENABLED") is False

    def test_patch_feature_flags_unknown_flag_400(self, s, admin_headers):
        r = s.patch(f"{BASE_URL}/api/admin/settings/feature_flags",
                    headers=admin_headers,
                    json={"value": {"NOT_A_REAL_FLAG": True}})
        assert r.status_code == 400

    def test_patch_feature_flags_non_boolean_400(self, s, admin_headers):
        r = s.patch(f"{BASE_URL}/api/admin/settings/feature_flags",
                    headers=admin_headers,
                    json={"value": {"GOOGLE_PLACES_ENABLED": "yes"}})
        assert r.status_code == 400

    def test_patch_verification_weights_valid(self, s, admin_headers):
        payload = {
            "gps_verified": 30, "physical_inspection": 20,
            "fresh_amass_photos": 15, "agent_verified": 10,
            "authorization_verified": 15, "details_completed": 5,
            "address_confirmed": 5, "recent_verification": 5,
        }
        r = s.patch(f"{BASE_URL}/api/admin/settings/verification_weights",
                    headers=admin_headers, json={"value": payload})
        assert r.status_code == 200, r.text
        # reset for cleanliness
        rr = s.post(f"{BASE_URL}/api/admin/settings/verification_weights/reset",
                    headers=admin_headers)
        assert rr.status_code == 200

    def test_patch_verification_weights_over_100_rejected(self, s, admin_headers):
        payload = {"gps_verified": 150, "physical_inspection": 20,
                   "fresh_amass_photos": 15, "agent_verified": 10,
                   "authorization_verified": 15, "details_completed": 5,
                   "address_confirmed": 5, "recent_verification": 5}
        r = s.patch(f"{BASE_URL}/api/admin/settings/verification_weights",
                    headers=admin_headers, json={"value": payload})
        assert r.status_code == 400

    def test_patch_verification_weights_negative_rejected(self, s, admin_headers):
        payload = {"gps_verified": -1}
        r = s.patch(f"{BASE_URL}/api/admin/settings/verification_weights",
                    headers=admin_headers, json={"value": payload})
        assert r.status_code == 400

    def test_patch_verification_weights_non_int_rejected(self, s, admin_headers):
        payload = {"gps_verified": "high"}
        r = s.patch(f"{BASE_URL}/api/admin/settings/verification_weights",
                    headers=admin_headers, json={"value": payload})
        assert r.status_code == 400

    def test_patch_unknown_setting_400(self, s, admin_headers):
        r = s.patch(f"{BASE_URL}/api/admin/settings/nonexistent_key_xxx",
                    headers=admin_headers, json={"value": {"a": 1}})
        assert r.status_code == 400

    def test_reset_restores_defaults(self, s, admin_headers):
        # Mutate google_limits, then reset, then verify defaults
        orig = s.get(f"{BASE_URL}/api/admin/settings/google_limits",
                     headers=admin_headers).json()["value"]
        mutated = copy.deepcopy(orig)
        mutated["daily_cap_usd"] = 999.99
        r = s.patch(f"{BASE_URL}/api/admin/settings/google_limits",
                    headers=admin_headers, json={"value": mutated})
        assert r.status_code == 200
        g = s.get(f"{BASE_URL}/api/admin/settings/google_limits",
                  headers=admin_headers).json()["value"]
        assert g["daily_cap_usd"] == 999.99
        # reset
        rr = s.post(f"{BASE_URL}/api/admin/settings/google_limits/reset",
                    headers=admin_headers)
        assert rr.status_code == 200
        g2 = s.get(f"{BASE_URL}/api/admin/settings/google_limits",
                   headers=admin_headers).json()["value"]
        assert g2["daily_cap_usd"] == 5.0


# ── Regression: Phase 6 endpoints still work ────────────────
class TestPhase6Regression:
    def test_passport_legacy_amass_id_still_works(self, s):
        r = s.get(f"{BASE_URL}/api/passport/AMASS-LAG-00000233")
        # Passport must not 500; 200 or 404 both acceptable but not server error
        assert r.status_code in (200, 404), \
            f"passport endpoint broke: {r.status_code} {r.text[:200]}"

    def test_admin_cockpit_dashboard(self, s, admin_headers):
        r = s.get(f"{BASE_URL}/api/admin/cockpit/dashboard", headers=admin_headers)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), dict)


# ── Idempotent seeding after backend restart ────────────────
class TestIdempotentSeeding:
    @pytest.mark.restarts_backend
    def test_restart_backend_no_duplicate_seed(self, s, admin_headers):
        # Count property_types + app_settings before
        before_types = s.get(f"{BASE_URL}/api/property-types",
                             params={"include_inactive": "true"}).json()
        before_settings = s.get(f"{BASE_URL}/api/admin/settings",
                                headers=admin_headers).json()
        count_types_before = len(before_types)
        count_settings_before = len(before_settings)

        # Restart backend
        import subprocess
        subprocess.run(["sudo", "supervisorctl", "restart", "backend"],
                       check=False, capture_output=True)
        # wait for /api/property-types to come back
        for _ in range(30):
            try:
                r = s.get(f"{BASE_URL}/api/property-types", timeout=3)
                if r.status_code == 200:
                    break
            except Exception:
                pass
            time.sleep(1)
        else:
            pytest.fail("Backend did not come back up within 30s")

        after_types = s.get(f"{BASE_URL}/api/property-types",
                            params={"include_inactive": "true"}).json()
        after_settings = s.get(f"{BASE_URL}/api/admin/settings",
                               headers=admin_headers).json()
        assert len(after_types) == count_types_before, \
            f"property_types duplicated: was {count_types_before}, now {len(after_types)}"
        assert len(after_settings) == count_settings_before, \
            f"app_settings duplicated: was {count_settings_before}, now {len(after_settings)}"

    def test_no_startup_errors_in_backend_err_log(self):
        import subprocess
        out = subprocess.run(
            ["tail", "-n", "80", "/var/log/supervisor/backend.err.log"],
            capture_output=True, text=True, check=False,
        )
        combined = (out.stdout or "") + (out.stderr or "")
        lowered = combined.lower()
        # Fail if any Python traceback / index error at startup
        bad_signals = ["traceback (most recent call last)", "duplicate key error"]
        for sig in bad_signals:
            assert sig not in lowered, f"backend.err.log contains '{sig}':\n{combined[-2000:]}"
