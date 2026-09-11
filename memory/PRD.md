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

## Phase D-5 — Agent Task Queue + Territory + Verify-existing-lead Wizard (Jun 2026)
- Backend `/app/backend/agent_tasks.py`:
  - Task lifecycle: OPEN → CLAIMED → COMPLETED | DISPUTED | OPEN (retry) | EXPIRED | CANCELLED
  - Auto-created on candidate promote (D-3 hook)
  - Territory model: state + LGAs + optional radius from center point
  - 5 verdicts: PROPERTY_EXISTS · DIFFERENT_ADDRESS · IS_DUPLICATE · NOT_A_PROPERTY · INACCESSIBLE
  - PROPERTY_EXISTS bumps location_verification_status→VERIFIED, refreshes entrance_point if drift >25m
  - Startup task expiry sweep + Emergent Object Storage init
- Emergent Object Storage: new `/app/backend/object_storage.py` wraps the storage API
  - Auth-checked download at `/api/files/{path:path}` — only owner or claimed-task agent can read
- Frontend:
  - `/agent/tasks` — claimed + open lists, territory banner
  - `/agent/tasks/[id]` — detail + map + claim/release/passport actions
  - `/agent/tasks/verify/[id]` — 4-step wizard: GPS → Photo → Verdict → Review
  - `/agent/territory` — state chip picker + LGA/area inputs + radius + active toggle
  - `agent-tasks-entry` card added to `/agent-dashboard`
- Tests: `/app/backend/tests/test_phase_d5_agent_tasks.py` — 14/14 pass

## Phases D-6 + D-7 + D-8 — Scoring, Fraud, Passport UI, AI Valuation (Jun 2026)
### D-6 · Verification Scoring + Fraud Signals
- Backend `/app/backend/verification_scoring.py`
- Score (0–100): recency 40 + gps_tier 20 + drift 15 + photo 10 + agent_trust 10 + duplicate_cleanliness 5
- Tiers: SUPER ≥85, VERIFIED ≥70, UNSTABLE ≥50, else UNVERIFIED
- Score decays linearly from 40→0 over 12 months since verified_at
- Fraud rules: HIGH_GPS_DRIFT (>250m), LOW_GPS_ACCURACY_SET (>50m), MISSING_PROOF_PHOTO,
  RAPID_VERIFICATION (agent >6/30min), CLUSTER_DUPLICATE (3+ props within 15m), STALE_UNVERIFIED (30+ days)
- Auto-computed after every verify submit; endpoints:
  - GET `/api/properties-v2/{amass_id}/score`
  - GET `/api/admin/fraud/flags?status=ACTIVE&flag_type=`
  - POST `/api/admin/fraud/flags/{id}/dismiss`
  - POST `/api/admin/fraud/sweep`
  - POST `/api/admin/properties/{amass_id}/recompute-score`

### D-7 · Passport Score Card + AI Value Strip
- Component `/app/frontend/src/components/PropertyScoreCard.tsx`
- Inserted into `/property-passport/[amass_id]` between title block and tabs
- Radial score gauge (react-native-svg), tier chip, AI value + range, confidence bar, LLM narrative box, expandable breakdown

### D-8 · AI Valuation Engine (HybridComparableEstimator)
- Backend `/app/backend/property_valuations.py`
- Algorithm: median ₦/sqm of same-type comparables × target size, + verification/amenities bumps, − fraud penalties
- Confidence: 30 + 4/comp + tier bonus + dispersion bonus
- LLM narrative via Claude Sonnet 4.5 (Emergent LLM key)
- Cached 24h in `property_valuations`; compact copy stamped on `properties_geo.ai_valuation`
- Endpoints:
  - GET `/api/properties-v2/{amass_id}/valuation?force_refresh=`
  - POST `/api/admin/valuations/{amass_id}/refresh`

### Tests
- `/app/backend/tests/test_phase_d6_d8_scoring_valuation.py` — 14/14 pass
- Regression D-4 + D-5 — 27/27 still pass

## Phases D-9 + D-10 — Property Type Colours + Notifications (Jun 2026)
### D-9 · Property-type colour propagation
- New `PropertyTypeChip` component uses the `usePropertyTypes` registry
- Map pins accept `typeColor` prop → registry-driven accent dot
- Colored chips on: passport title row, agent tasks list + detail, admin duplicate-review match cards
- `registry_slug_for_candidate()` at promote time maps google_types → registry slug so promoted properties always get a colour

### D-10 · Notifications
- New `/app/backend/discovery_notifications.py` writes to existing `notifications` collection
- Events: `VERIFICATION_WIN`, `FRAUD_FLAG_RAISED`, `VERIFICATION_TASK_ASSIGNED`, `CANDIDATE_PROMOTED`
- Territory-aware fan-out for task assignments (state + LGA match)
- Admin fan-out via `ADMIN_EMAILS` env (matches by email or is_admin flag)

### Final Phase-D acceptance report
- `/app/test_reports/phase_d_final_acceptance.md`
- 134 pass · 1 skipped · 0 failed across 7 test files (D-1 through D-10)

## Shareable Score Card (Jun 2026)
- New `/app/frontend/src/components/ShareableScoreCard.tsx` — 720×1080 branded card with SVG gauge, tier pill, AI value, AMASS footer
- Rendered offscreen inside `PropertyScoreCard` (position:-10000, opacity:0, pointerEvents:none) so it stays in the layout tree ready for capture
- Share button (testID `btn-share-score`) added next to the chevron on the passport score card
- Uses `react-native-view-shot` (`captureRef → tmpfile`), `expo-sharing` for native share sheet, and `expo-media-library` fallback to save-to-gallery when share isn't available; on web falls back to `Share.share` (Web Share API where supported)
- Passport passes `propertyType`, `addressLine`, `cover` context so the card is always branded correctly per property

## In-App Chat — Phase 1 (Jun 2026)
- Backend `/app/backend/chat.py` — collections: conversations, chat_messages, chat_reads, chat_blocks, chat_reports
- Endpoints:
  - Property-linked: `POST /api/chat/conversations/from-property/{property_id}` (idempotent)
  - Support thread: `POST /api/chat/conversations/support` (buyer ↔ admin)
  - List + get: `GET /api/chat/conversations`, `/{id}`
  - Messages: `GET /messages`, `POST /messages` (idempotent via `client_msg_id`)
  - Read: `POST /read` (also marks NEW_MESSAGE notifications read)
  - Real-time: `GET /updates?after=<ISO>&wait_ms=8000` (long-poll)
  - Unread badge: `GET /unread-count`
  - Block: `POST /block/{id}` · `DELETE /block/{id}` · `GET /blocks`
  - Report: `POST /report`
  - Admin: `GET /admin/stats` · `GET /admin/reports` · `POST /admin/reports/{id}/resolve`
- Notifications hook — every message writes a `NEW_MESSAGE` entry to `notifications` for each other participant
- Rate-limit: 30 msgs/60s/user/conversation
- Frontend:
  - `/inbox` — conversation list with unread badges and property preview
  - `/(tabs)/messages` — aliases the InboxScreen
  - `/chat/[conversation_id]` — long-poll bubbles, optimistic sends with `client_msg_id`, AsyncStorage offline queue, block + report menu, property card header
  - `/property/[id]` — new "Contact Agent" primary button (testID `btn-contact-agent`) that starts/opens the thread
- Tests: `/app/backend/tests/test_chat_phase1.py` — 15/15 pass
- Phase-D regression preserved (134 pass · 1 skipped)

## In-App Chat — Phase 2 (Jun 2026)
- Backend `/app/backend/chat.py` extended (Phase 2 endpoints):
  - Images: `POST /api/chat/conversations/{id}/upload-image` (5 MB cap, base64 data URL → Emergent Object Storage)
  - Search: `GET /api/chat/search?q=…&limit=…` (regex-escaped, scoped to my conversations)
  - Presence: `POST /api/chat/heartbeat` + `GET /api/chat/conversations/{id}/presence` (typing + last_seen for OTHER participants)
  - Typing: `POST /api/chat/conversations/{id}/typing {is_typing}` (TTL 15 s auto-expire)
  - Filters: `GET /api/chat/conversations?verified_only=true&q=needle` — Verified-only + inline participant/property search
- Collections added: `chat_presence` (7 d TTL), `chat_typing` (15 s TTL)
- Frontend:
  - `/inbox` — Verified-only chip + inline debounced message search (falls back to `/chat/search` for hits)
  - `/chat/[conversation_id]` — image attach button (expo-image-picker + expo-file-system/legacy → data URL → object storage), typing dots + "online/last seen" subtitle, tap-to-preview image bubbles, 25 s heartbeat + 6 s presence poll
  - `/admin/chat-reports` — one-tap moderation queue with Resolve + Block user + View conversation actions, KPI stats
- Tests: `/app/backend/tests/test_chat_phase2.py` — 21/21 pass · Frontend testing agent green on inbox + chat + admin surfaces


## Push Notifications + Voice Notes (Jun 2026)

### Emergent-managed Push
- Backend `/app/backend/push_notifications.py` — httpx proxy to `integrations.emergentagent.com`
- Endpoint: `POST /api/register-push {user_id, platform, device_token}` (also short-circuits `web` platform)
- Helper: `send_push(recipients, data, idempotency_key?)` — non-blocking; called from `chat.py::_notify` for every new message with `action_url:/chat/{conv_id}` for one-tap deep-linking
- `EMERGENT_PUSH_KEY=placeholder` added to `/app/backend/.env` — deployer replaces at build time
- Frontend:
  - `/app/frontend/app/_layout.tsx` — module-scope `setNotificationHandler` + Android channel `default`; useEffect wires `addNotificationResponseReceivedListener` (warm tap), `getLastNotificationResponseAsync` (cold-start), plus a weekly denied-permission nudge → `Linking.openSettings()`
  - `/app/frontend/src/lib/push.ts` — `registerForPush(userId)` helper: permission → `getDevicePushTokenAsync()` → POST `/api/register-push`
  - Auth context calls `registerForPush()` after login/register/apple sign-in and on every session restore
- Config: `app.json` adds `expo-notifications` plugin, `POST_NOTIFICATIONS` Android permission, and `googleServicesFile: "./google-services.json"` (user must supply the file before Android build)
- Requires **real device build** (dev-client / TestFlight / .APK); does NOT fire in Expo Go or web preview

### Voice Notes (WhatsApp-style)
- Backend: `POST /api/chat/conversations/{id}/upload-audio {data_url, duration_ms}` — 10 MB cap, extension inferred from data URL, stored via `object_storage.upload_file_base64` (new generic helper)
- `chat.py::SendMessageIn.kind` extended to include `"audio"`; message preview auto-switches to `🎙️ Voice note`
- Frontend components:
  - `/app/frontend/src/components/VoiceComposer.tsx` — tap-and-hold recorder using `expo-audio` `useAudioRecorder` + PanResponder for slide-up-to-lock and slide-left-to-cancel, 60 s max, pulse animation, haptics
  - `/app/frontend/src/components/VoiceBubble.tsx` — play/pause + progress bar + duration counter using `expo-audio` `createAudioPlayer`
- Composer swaps `send` button for `VoiceComposer` when the text input is empty; audio messages render as `VoiceBubble` in the thread
- Permissions: `NSMicrophoneUsageDescription` (iOS), `RECORD_AUDIO` (Android)
- Tests: `/app/backend/tests/test_push_and_voice.py` — 12/12 pass · Frontend testing agent green on composer swap + VoiceBubble render


## Redfin-style Map + Social Sign-In (Jun 2026)

### Map polish
- New component `/app/frontend/src/components/MapLegend.tsx` — chip in the bottom-left of the home map that opens a modal explaining all 8 property-type marker colours + separate ✓ Verified and 🔥 Hot listing badges (never green markers for verification)
- `MapDockedCard.tsx` — three-way quick action row: Save (❤ heart, toggles favorite), View Details (primary ink pill), Contact Agent (emerald outline → starts / opens `/chat/{id}`). Testable via `docked-save-<id>`, `docked-view-<id>`, `docked-contact-<id>`.
- Existing filter chips (For Sale · For Rent · Land · Commercial · Luxury · Verified · Recently Added · Open House), Search-this-area pill, clustering, and price-on-marker labels preserved.

### Social sign-in
- Backend `/app/backend/google_auth.py` — bridges Emergent hosted Google OAuth into existing JWT auth.
  - `POST /api/auth/google-session {session_id}` → exchanges via `demobackend.emergentagent.com/auth/v1/env/oauth/session-data` → **upsert-by-email** in `users` collection (existing password user is linked, never duplicated) → returns identical `{access_token, user}` shape as `/api/auth/login`
- Frontend components:
  - `GoogleSignInButton.tsx` — mobile (`WebBrowser.openAuthSessionAsync` + fragment-safe `session_id` extraction from `result.url` / URL listener / `getInitialURL`) + web (`window.location.href` full-page nav → session parsed on mount from `#session_id`)
  - `FacebookSignInButton.tsx` — coming-soon stub (blue, Alert on tap); real Meta OAuth pending Facebook App ID/Secret from user
  - Existing `AppleSignInButton.tsx` still gated to iOS
- `AuthContext.refresh()` added so social sign-ins can hydrate the user without touching password endpoints
- Login + register screens (`/app/frontend/app/(auth)/{login,register}.tsx`) now show all four options: Google · Apple (iOS only) · Facebook · Email/password
- Tests: `/app/backend/tests/test_google_auth_and_map.py` — 11/11 pass · Frontend testing agent green on both auth screens + map legend + filter chips


## Expo SDK 57 Upgrade (Jun 2026)

Upgraded the Expo SDK from **54 → 57** using the `expo-version-upgrade` skill.

### Package changes
- `expo` 54.0.36 → **57.0.21**; `yarn expo install --fix` pinned every Expo-managed dep to its SDK 57 pair
- **Icons migration**: `@expo/vector-icons@15.1.1` → `@react-native-vector-icons/ionicons@13.1.4`. Only Ionicons was used across the 99 files that imported the old package — a scripted `sed` swap kept the migration surgical.
- Removed `expo-status-bar` (unused, was in plugins array causing PluginError in SDK 57's strict resolver)

### Config changes (`app.json`)
- Removed `newArchEnabled` and `edgeToEdgeEnabled` (defaults now handled by the SDK per the 54→55 guide)
- Purged non-config-plugin entries that were rejected by SDK 57's plugin loader

### Runtime fixes
- **`expo-media-library@57` web crash workaround**: the package top-level-imports its "Next" native module which does not exist on web, breaking every RN-Web bundle. Added `/app/frontend/src/lib/mediaLibrary.ts` that lazy-loads via `require()` guarded by `Platform.OS !== "web"`, and swapped every consumer (`app/share/[id].tsx`, `ShareableScoreCard.tsx`, `PropertyScoreCard.tsx`) to use the wrapper. Web callers now no-op instead of crashing.
- Updated `use-icon-fonts.ts` CDN URL to fetch `Ionicons.ttf` from the new `@react-native-vector-icons/ionicons` package (Expo Go font-loading only; native builds autolink)

### Verification
- `yarn expo-doctor` — 19/20 checks pass (1 pre-existing icon-square warning, unrelated)
- Backend + frontend regression pytest: `/app/backend/tests/test_sdk57_regression.py` — 8/8 pass
- Testing agent green on: auth (email + Google + Apple + Facebook stub), map + Legend + filter chips, inbox, chat thread, admin cockpit, profile — every Ionicons glyph renders (no ? boxes) after the migration

