# AMASS — Product Requirements (Living Doc)

## Original Problem Statement
Build a premium, award-worthy PropTech marketing landing page for **AMASS** — Africa's intelligent
property discovery, real estate marketplace, home marketplace, construction marketplace and
AI-powered property intelligence platform. Feel: Apple × Airbnb × Stripe × Google Maps × Zillow ×
Notion. Stylized Lagos aerial hero with animated colored map markers + hover preview cards,
Airbnb-style floating search, dark mode toggle, working lead-capture forms, smooth motion.

## Stack / Architecture
- Frontend: React 19 + Tailwind + framer-motion + lenis (smooth scroll) + shadcn/ui + sonner.
- Backend: FastAPI + MongoDB (motor). All routes under `/api`.
- Fonts: Cabinet Grotesk (display) + Geist (body) via Fontshare/Google Fonts.
- Palette: Emerald #0F8B4C, Charcoal #111, Gold #D4AF37, White, Light grey #F7F8FA. Light + Dark themes via CSS vars.
- Modular components under `/app/frontend/src/components`; reusable lead-form system in `context/LeadFormProvider.jsx`.

## User Personas
Buyers/renters, investors, agents, developers, construction companies/professionals.

## Core Requirements (static)
Hero w/ live markers, floating search, category live-map, 6 pillars, property showcase carousel,
stats, how-it-works, agents, construction pros, home marketplace, mobile app, testimonials, FAQ,
final CTA, footer w/ newsletter, lead-capture forms, dark mode.

## Implemented (2025-12)
- Backend: POST/GET `/api/leads` (6 form types + validation 400/422), POST `/api/newsletter` (idempotent). Leads persist to Mongo `leads` collection.
- Frontend: All sections built + animated. Reusable lead dialog (Become Agent / List Property / Contact / Book Demo / Partner / Waiting List) with success state. Footer newsletter. Airbnb search. Dark mode toggle. Masked hero headline, parallax hero, pulsing markers w/ hover preview cards, marquee, count-up stats, carousel, FAQ accordion, iPhone mockups.
- SEO meta + OG tags in index.html.
- Verified by testing_agent: backend 100%, frontend 100% (a11y DialogTitle warning fixed).

## Notes
- No full-screen loader (removed): headless timer/rAF throttling made a blocking loader unreliable; hero masked reveal is the signature on-load moment.
- No auth (marketing page). Leads stored for future CRM.

## Backlog / Next
- P1: Real Mapbox/Google Maps live map inside app; property detail pages.
- P1: Admin/CRM view of captured leads; email notifications (Resend/SendGrid).
- P2: i18n, blog/careers pages, App Store/Play deep links, real property API.
- P2: Payments/escrow, mortgage/BNPL flows, agent dashboard, AI valuation.

## Update — Admin API + Content-Driven CMS (2025-12)
- Decision: NO standalone admin UI. Landing page is content-driven; an external "AMASS ADMIN" controls it via an API-key-protected REST API.
- Backend: `ADMIN_API_KEY` (X-API-Key or Bearer). New endpoints: public GET /api/content; admin GET/PUT /api/admin/content (partial deep-merge), POST /api/admin/content/reset, GET /api/admin/leads, PATCH /api/admin/leads/{id}, GET /api/admin/newsletter, GET /api/admin/stats. Leads now have status (new/contacted/closed). site_content collection seeded from DEFAULT_CONTENT.
- Frontend: ContentProvider fetches /api/content (fallback to static defaults); Hero/Stats/Testimonials/FAQ read from content; App.js honors sections visibility toggles.
- Verified: testing_agent iteration_3 — backend 13/13, frontend 100%. Deep-merge partial updates curl-verified.
- Note: production must be REDEPLOYED to expose the new API + content-driven build.
