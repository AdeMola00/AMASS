# AMASS — Product Requirements Document (Unified)

## Problem statement (verbatim from user)

> AMASS Production Synchronization & System Integration — three separate Emergent projects (Landing Page, Mobile App, Admin Portal) must operate as one unified production platform. One backend, one database, one auth, one API. Preserve existing functionality; do not rebuild.

## User personas
- **Homebuyer / Renter** — browses on Landing web or Mobile app, saves favorites, unlocks premium listings with MASS tokens.
- **Verified Agent** — lists mandated properties, gets analytics, promotes listings, receives leads.
- **Service Provider (FIXA)** — offers home services, earns FIX tokens for completed jobs.
- **Admin / Ops** — approves listings, moderates users, verifies agents, monitors platform via Admin Portal.

## Architecture (unified)
- Backend: FastAPI at `/api/*` on port 8001, 15 modules, MongoDB `amass_production`
- Web frontend: React (CRA) at port 3000 — Landing + Admin Portal in one app
- Mobile: Expo React Native — separate repo, same backend URL
- Auth: JWT + bcrypt, single `users` collection
- Tokens: MASS (property utility) + FIX (FIXA service utility) via `WalletService`
- Payments: Paystack + Flutterwave with MOCK fallback + webhook fulfillment
- AI: Claude Sonnet 4.5 via `emergentintegrations` + Emergent Universal LLM Key

## Core requirements (delivered)
1. ✅ Single production backend consolidating landing/app/admin logic
2. ✅ Single MongoDB with unified schemas, no duplicated collections
3. ✅ Single JWT auth working across web + mobile
4. ✅ Landing Page connected to production API
5. ✅ Admin Portal connected to production API (new `/api/admin/*` routes)
6. ✅ Mobile app ready to connect (env change only, no code change)
7. ✅ Ten integration reports in `/app/reports/`

## What's implemented (2026-02)
- **Backend (`/app/backend/`)** — 15 modules from mobile-app repo consolidated + new `admin.py`
- **Web frontend (`/app/frontend/src/`)** — Landing, Properties, PropertyDetail, Marketplace, Discover, About, Login, Register, Dashboard, Admin (Layout + Dashboard + Properties + Users + Agents + Marketplace + AuditLog)
- **Design system** — AMASS red (#E11B22) + charcoal + Instrument Serif display font + Manrope body
- **Admin bootstrap** — `admin@amass.africa` and `demo@amass.africa` auto-elevated to admin

## Prioritized backlog (P0 = pre-GA)
- **P0** Sentry integration (backend + web + mobile)
- **P0** Login rate-limit + brute-force lockout
- **P0** CORS lockdown to production origins
- **P0** Rotate hardcoded Google Maps key in mobile `app.json`
- **P1** Password reset flow via Resend
- **P1** Image upload via Emergent object storage
- **P1** Automated CI/CD via GitHub Actions
- **P1** MongoDB indexes on startup (see report 05)
- **P2** Interactive Mapbox / Leaflet on web (currently static)
- **P2** Real-time notifications via WebSocket or SSE
- **P2** Play Store listing metadata + submission

## Not in scope (deferred)
- Multi-language i18n
- Multi-currency beyond NGN
- Native iOS build (Android-first per user request)

## Test credentials
See `/app/memory/test_credentials.md`
