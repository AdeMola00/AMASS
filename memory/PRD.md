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

## Backlog
- **P1**: Build out Properties, Agents, Users, Property Verification modules (list/detail/actions).
- **P1**: Wire AI Management to a real LLM (Emergent Universal key) for pricing/valuation intelligence.
- **P2**: Finance modules (Transactions/Payments/Subscriptions), Analytics & Reports with real charts.
- **P2**: Messages & Notifications, image upload (object storage) for CMS media.
- **P2**: Public landing page renderer consuming the CMS.

## Next Tasks
Pick highest-value module from P1 to fully implement next (recommend Properties + Property Verification).
