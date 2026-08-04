# 09 — Production Readiness Report

## Overall status: 🟢 **READY** for staged rollout, 🟡 hardening required before public GA

## Checklist scorecard

| Area | Status | Notes |
|---|---|---|
| Unified backend | ✅ | Single FastAPI, all 15 modules imported |
| Unified database | ✅ | MongoDB `amass_production`, all collections merged |
| Unified auth | ✅ | JWT, single users table, roles via flags |
| Landing → API wired | ✅ | Web frontend consumes `/api/*` exclusively |
| Admin Portal → API wired | ✅ | New `/api/admin/*` routes gated by `is_admin` |
| Mobile App → API wired | 🟡 | Compatible; requires `EXPO_PUBLIC_BACKEND_URL` change and EAS rebuild |
| Payments (Paystack/Flutterwave) | 🟡 | Code path present; MOCK mode enabled by default. Live keys required for GA |
| Email (Resend) | 🔴 | Not wired for password reset / email verify — P1 |
| Object storage | 🔴 | Not wired for user uploads — currently images are external URLs |
| Maps (Google Maps / mapbox) | 🟡 | Working on mobile; web uses static map images. Interactive web map is P2 |
| SEO | 🟡 | Landing has basic meta; need OG/Twitter cards + sitemap.xml + robots.txt |
| Analytics | 🟡 | Property view/favorite events tracked internally; no GA4/Plausible yet |
| Error monitoring | 🔴 | Not configured — add Sentry (P0) |
| Rate limiting | 🔴 | Not enforced — P0 |
| CORS locked to prod domains | 🔴 | Currently `*` — P0 |
| Backups | 🟡 | Manual `mongodump` works; automate for GA |
| CI/CD | 🔴 | Not configured — add GitHub Actions |

## Blockers before public GA
1. Sentry / error monitoring (Backend + Frontend)
2. Login rate-limit + brute-force lockout
3. Password reset via Resend
4. CORS lockdown
5. Rotate the hardcoded Google Maps key in mobile `app.json`
6. Live Paystack + Flutterwave keys and webhook URL registration
7. Real image upload wired to Emergent object storage
8. Play Store listing (icons, screenshots, privacy policy URL)

## Estimated effort to GA
| Task | Effort |
|---|---|
| Sentry integration (BE + FE) | 0.5 day |
| Login rate limit + password policy | 0.5 day |
| Password reset flow (Resend playbook) | 1 day |
| CORS lockdown + prod env | 0.25 day |
| Image upload via Emergent storage | 1 day |
| Payment live keys + webhook wiring | 0.5 day |
| CI/CD (GitHub Actions) | 1 day |
| Play Store metadata + submission | 1 day |
| **Total** | **~5.75 dev days** |

## Go/No-go recommendation
Ship as **private beta** immediately (invite-only via `ADMIN_EMAILS`) while completing the 5.75-day hardening sprint. GA in <2 weeks is realistic.

