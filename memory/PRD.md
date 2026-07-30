# AMASS Admin Portal — PRD

## Original Problem Statement
Build a secure, scalable AMASS Admin Portal at `/admin` to manage both the AMASS Landing Page and the AMASS Application from one dashboard. JWT auth with seeded Super Admin (admin@amass.africa), dashboard metrics, database-driven Landing Page CMS, Lead Management inbox, RBAC (8 roles), and a structured foundation for ~18 future modules. Stack: React + Tailwind + Framer Motion + FastAPI + MongoDB. Premium UI (Stripe/Vercel/Linear inspired), AMASS brand colours (emerald, white, charcoal, gold), dark mode, responsive.

## Architecture
- **Backend** (`/app/backend/server.py`): FastAPI, all routes under `/api`. JWT (Bearer) auth, bcrypt hashing, RBAC via `require(module, action)` dependency. MongoDB collections: `admin_users`, `roles`, `cms_sections`, `leads`, `activities`, `properties`, `agents`, `platform_users`. Auto-seeds admin accounts, 8 roles, 11 CMS sections, and demo data on startup.
- **Frontend** (`/app/frontend/src`): React Router (`/admin/*`), `AuthContext` (token in localStorage `amass_token`), `next-themes` light/dark, AdminLayout (Sidebar + Topbar with search/notifications/breadcrumbs/profile), pages: Login, Dashboard, Leads, LandingCMS, RolesPermissions, Settings, Placeholder. Recharts for charts, shadcn/ui + Framer Motion.

## User Personas
- Super Admin / Administrator — full platform control
- Content Manager, Property Manager, Agent Manager, Customer Support, Finance, Marketing — scoped module access

## Core Requirements (static)
Auth · Dashboard · Landing CMS · Lead Management · RBAC · Foundation modules · Premium responsive UI with dark mode.

## Implemented (2026-07-25)
- JWT auth + seeded Super Admin (temp password in `/app/memory/test_credentials.md`) + 3 role-based test accounts.
- Dashboard: 7 stat cards, 14-day leads trend, lead-sources donut, recent activities, quick actions.
- Landing Page CMS: 11 editable sections with visibility toggles; public `/api/public/landing` reflects changes instantly.
- Lead Management: 7 form types, search, type/status filters, detail dialog, status assignment, CSV export, delete.
- RBAC: 8 roles with configurable module×action permission matrix (super_admin locked).
- Settings: profile update, change password, team member add/remove.
- 16 foundation module placeholder pages (models + nav + RBAC wired).
- Verified: 31/31 backend tests pass, all critical frontend flows pass.

## Updated (2026-07-26)
- Reviewed the live AMASS landing page (discover-properties-1.preview) and rebuilt the CMS to mirror it exactly (CMS_VERSION=2, version-gated re-seed).
- CMS now manages 17 real sections: Hero, Category Map, 6 Pillars, Property Showcase, Statistics (Why Choose AMASS), How It Works, For Agents, Construction Professionals, Home Marketplace, AMASS Mobile, Testimonials, FAQ, Final CTA, Contact, Social, Footer, SEO — all with real headings, stats, listings, testimonials and answered FAQs.
- Fixed a CMS editor bug: recursive `ValueEditor` crashed the visual-edits babel plugin (stack overflow). Replaced with non-recursive `ArrayEditor` + `ObjectEditor`; nested item cards (e.g. showcase properties) now edit correctly and save round-trips through `/api/public/landing`.

## Updated (2026-07-30) — Unified platform: Media, Marketplace, App Config, Token Economy
- This repo is confirmed the **single shared backend + DB** for Admin Portal, Mobile App and Landing Page. Real-time sync = lightweight polling of shared `/api` + `/api/public` endpoints (best for low-bandwidth African networks).
- **Media Library** on Emergent object storage: admin uploads (`POST /api/media/upload`, 20MB + image/video/pdf allow-list), public serving `GET /api/media/file/{path}` (no-auth, cached), soft-delete. Reusable `ImageUploader` used across modules.
- **Marketplace**: categories, products (featured/sponsored/status), promotions, pricing rules — admin CRUD + public `/api/public/marketplace/*` (active/featured only).
- **App Configuration**: homepage sections, map settings, marketplace config, app banners, notifications, featured properties — admin edits, `GET /api/public/app-config` drives the app with no code changes.
- **Token Economy**: token bundles, subscription plans, rewards, user wallets (atomic `$inc` adjust, clamped ≥0) — admin CRUD + public catalog endpoints.
- New RBAC modules (marketplace, app_config, tokens, media) enforced; new **Platform** nav group; mobile bottom tab bar retained.
- Verified: **81/81 backend tests pass** (49 core + 32 new), all 4 new admin pages pass frontend flows; hardening applied (upload limits, atomic wallet, product-status validation).

## Updated (2026-07-30b) — Wiring, Analytics & Notifications
- **Wire the apps**: added `GET /api/public/bootstrap` (one parallelized call → landing, app_config, categories, featured products/properties, token bundles/plans, announcements) + a drop-in client `integrations/amassClient.js` and `integrations/INTEGRATION_GUIDE.md`. The Landing Page & Mobile App copy the client, set the base URL, and every admin change shows up live (poll-based). Actual paste happens in those separate projects.
- **Analytics** module (real charts): `GET /api/analytics/overview` → 11 KPIs (active users, listings, approved, verified agents, products, token circulation, est. revenue, plans) + listings-by-status donut, listings-by-city bars, top-agents, 14-day leads trend.
- **Notifications** broadcaster: in-app delivers live via `GET /api/public/announcements`; push/email/sms stored as **queued** (no provider connected yet — MOCKED). Channel input validated; toggle/delete history.
- UX: locked admin routes now show a proper "Not authorized" state instead of an empty shell.
- Verified: **93/93 backend tests pass**; Analytics + Notifications frontend flows pass.

## Architecture note (extensibility)
- New modules live in `/app/backend/modules_ext.py` registering on the shared `api` router — future modules (vehicles, auctions, tokenization, AI valuation, multi-country) follow the same additive pattern. Tech debt: extract a `routers/` package + `deps.py` as this grows.


- Confirmed the AMASS consumer app runs on **this same FastAPI + MongoDB backend**.
- Converted placeholders into real shared modules: **Properties** (CRUD, status pending/approved/rejected/sold, verification, filters, rich schema), **Property Verification** (Approve/Reject + Verify queue), **Agents** (CRUD/verify + listings_count), **Users** (suspend/reactivate).
- Public no-auth app endpoints: `GET/POST /api/public/properties` (approved-only reads; validated agent_id on submit), `GET /api/public/properties/{id}`, `GET /api/public/agents` (verified-only).
- Rebranded to the AMASS logo palette (red primary + charcoal + white) with the red location-pin mark.
- Verified: 49/49 backend tests pass; all new frontend flows pass; RBAC enforced.

## Backlog
- **P1**: Wire AI Management to a real LLM (Emergent Universal key) for pricing/valuation intelligence.
- **P1**: Property Owners & Developers modules (extend the shared property/agent pattern).
- **P2**: Finance modules (Transactions/Payments/Subscriptions), Analytics & Reports with real charts.
- **P2**: Messages & Notifications, image upload (object storage) for CMS media & property photos.
- **P2**: Wire the live landing page to consume `/api/public/landing` + `/api/public/leads`.
- **Tech debt**: split server.py (~1100 lines) into modular routers before adding Finance modules.

## Next Tasks
Recommend wiring the live landing page to the CMS/leads API, or building Transactions/Payments next.
