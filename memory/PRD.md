# AMASS – Africa's Property Operating System

## Product
A premium, minimalist, map-first mobile app for property discovery, verification, and marketplace commerce across Africa. Inspired by Redfin × Airbnb × Apple design language.

## Core Value
- Full-screen interactive map with custom red AMASS pin markers (Redfin-style)
- Curated property listings (buy, rent, shortlet, lease, land, commercial) with title verification
- AI Search assistant (Claude Sonnet 4.5) for natural-language property queries in Nigerian Naira
- Marketplace for Home items, Construction materials, and Professional services
- Neighborhood intelligence & investment scoring
- Agent chat, favorites, notifications, profile

## Screens Implemented
Splash → Onboarding (3-slide) → Login / Register → Tabs:
- **Home** (full-screen map + floating search + filter chips + property carousel + custom AMASS pins)
- **Discover** (trending neighborhoods, score cards, market signals)
- **Marketplace** (Home / Construction / Services tabs with grid)
- **Messages** (agent conversations)
- **Profile** (stats, verified/premium badges, menu)
- Property Details (image gallery, price + AI valuation, specs, amenities, investment score, mini-map, agent card, sticky CTAs)
- AI Search modal (chat with Claude Sonnet 4.5 + suggestion chips)
- Notifications
- Settings (preferences, notifications, security, account)

## Design System
- Emerald primary (#059669) • AMASS red accent (#DC2626 — pins, favorites, alerts only) • Gold secondary • White bg • Charcoal text
- Glassmorphic floating chrome (search bar, bottom nav, filter chips)
- Ionicons throughout • Satoshi-inspired large typography • Generous white space
- Floating bottom tab bar with elevated central AI FAB
- Custom AMASS pin marker component with colored status ring

## Backend (FastAPI + MongoDB)
- `POST /api/auth/register` `/api/auth/login` `/api/auth/me` (JWT + bcrypt)
- `GET /api/properties` (filters: listing_type, property_type, min/max price, bedrooms, city, verified, q)
- `GET /api/properties/{id}`
- `POST /api/favorites/toggle` `GET /api/favorites` `GET /api/favorites/ids`
- `GET /api/marketplace` `GET /api/neighborhoods`
- `POST /api/ai/search` (SSE stream) & `POST /api/ai/search/sync` (Claude Sonnet 4.5 via Emergent Universal Key)
- `POST /api/seed` – autoseeds 9 properties, 11 marketplace items, 5 neighborhoods on cold start

## Integrations
- **Auth**: JWT (self-managed) + bcrypt
- **AI**: Claude Sonnet 4.5 (`claude-sonnet-4-5-20250929`) via `emergentintegrations` + Emergent Universal Key
- **Maps**: `react-native-maps` (default provider — OSM tiles). Google Maps API key can be swapped in via `PROVIDER_GOOGLE` when user provides it.
- **Storage**: Local Mongo + Motor async driver

## Known Preview Notes
- Web preview cannot render `react-native-maps` natively; a placeholder is shown on web. On mobile (Expo Go / native build) full interactive map renders.
- Onboarding slides render best on native (mobile viewport). Web preview text alignment differs slightly due to React Native Web layout quirks.

## Not Implemented (Deferred)
- Property submission form (listing creation flow)
- Agent dashboard
- Payments / Escrow flow
- Voice search & 360° tour
- Push notifications

## Test Credentials
See `/app/memory/test_credentials.md`

## Phase D-4 — Duplicate Review UI + Admin Override Log (Jun 2026)
- Backend `/app/backend/discovery_pipeline.py`:
  - `GET /api/admin/discovery/candidates/{id}/review` — returns candidate + hydrated matches + override history
  - `POST /api/admin/discovery/candidates/{id}/resolve` — actions: MERGE | KEEP_SEPARATE | MARK_RELATED
  - `GET /api/admin/discovery/overrides` — filterable override list
  - MERGE writes `CANDIDATE_MERGED` to property_audit_logs + appends `google:<place_id>` alias
  - MARK_RELATED writes `CANDIDATE_MARKED_RELATED` + property.related_candidate_ids
  - KEEP_SEPARATE clears duplicate_matches, sets admin_override_keep_separate=true → allows fresh promote
  - New collection `discovery_admin_overrides` with 3 indexes
- Frontend:
  - New screen `/app/frontend/app/admin/duplicate-review/[candidate_id].tsx` — side-by-side comparison with mini-map, match cards, decision modal with reason, override history timeline
  - `/admin/discovery.tsx` — added "Pending duplicate review" section listing PENDING_DEDUPLICATION + DUPLICATE candidates
  - Fixed pre-existing bug: `_authHeaders()` now reads `AUTH_STORAGE_KEY` via `storage.secureGet`
- Tests: `/app/backend/tests/test_phase_d4_duplicate_review.py` — 13/13 pass
