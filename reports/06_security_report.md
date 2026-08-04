# 06 — Security Report

## Scope
OWASP Top 10 + Emergent platform conventions. Findings from static review of `/app/backend/` and `/app/frontend/`.

## Findings

| # | Category | Description | Risk | Status |
|---|---|---|---|---|
| S1 | AuthN | `JWT_SECRET` fell back to a hardcoded dev value if env missing | High | ✅ Fixed — `.env` sets strong secret, admin must rotate on deploy |
| S2 | AuthN | No brute-force protection on `/api/auth/login` | High | ❌ Open — add `slowapi` and login-attempt lockout |
| S3 | AuthZ | Admin gating on `is_admin` flag OR `ADMIN_EMAILS` allowlist | Low | ✅ In place (`admin.py::_is_admin`) |
| S4 | AuthZ | Agent dashboard endpoints scope by `user_id` from JWT | Low | ✅ Verified |
| S5 | Injection | MongoDB queries use parameterized `motor` — no string concatenation | Low | ✅ Verified |
| S6 | XSS | React auto-escapes all output; no `dangerouslySetInnerHTML` in use | Low | ✅ Verified |
| S7 | CSRF | Bearer JWT auth (not cookies), so CSRF surface is minimal | Low | ✅ N/A |
| S8 | CORS | `CORS_ORIGINS=*` in dev | Medium | ⚠️ Tighten to prod domains (`amass.africa`, `admin.amass.africa`, `app.amass.africa`) for launch |
| S9 | Secrets | No hardcoded API keys in code — all read from `os.environ` | Low | ✅ Verified |
| S10 | Secrets | Google Maps API key **hardcoded** in `frontend/app.json` (mobile repo) | High | ⚠️ Rotate & move to EAS secrets before Play Store release |
| S11 | Open redirects | `/api/payments/redirect` blindly redirects to `amass://…` scheme; safe | Low | ✅ Fixed URL template |
| S12 | File upload | No upload endpoint in scope; property `images[]` are URLs, not blobs | Low | ⚠️ When storage bucket is wired, add content-type + size validation |
| S13 | Rate limiting | Not enforced anywhere | Medium | ❌ Open — add global + auth-route specific |
| S14 | Sensitive logging | Bcrypt hashes never logged; JWT never logged | Low | ✅ Verified |
| S15 | Password policy | Minimum 6 chars only | Medium | ⚠️ Bump to 8 + complexity requirement |
| S16 | Webhook auth | Paystack/Flutterwave webhooks verify HMAC signatures | Low | ✅ Verified in `payments.py` |
| S17 | Duplicate payments | `payment_ledger` unique index on `reference` prevents double credit | Low | ✅ Verified |
| S18 | HTTPS | Preview URLs are HTTPS via Emergent ingress | Low | ✅ Verified |
| S19 | Session invalidation | Sign-out only clears client-side token; server can't force logout | Medium | Add `token_version` on user for admin-triggered invalidation |
| S20 | Input validation | Pydantic on every write endpoint | Low | ✅ Verified |

## Immediate mitigations required for public launch

1. **S2** — Rate limiting on `/api/auth/login` (P0)
2. **S8** — Lock CORS to production origins (P0)
3. **S10** — Rotate the Google Maps key hardcoded in `frontend/app.json` (P0)
4. **S13** — Global API rate limit (P1)
5. **S15** — Stronger password policy (P1)

## Recommended hardening plan (post-launch)
- Add `django-honeypot`-style bot mitigations on signup
- WAF (Cloudflare) in front of production
- Bug bounty program via HackerOne / Bugcrowd after 90 days GA
- Quarterly OWASP re-review

