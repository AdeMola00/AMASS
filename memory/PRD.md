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



## Kubernetes Health Check Fix (Jun 2026)

Deployment was failing because Kubernetes liveness/readiness probes hit `GET /health` and received **404 Not Found** — the FastAPI app only exposed `/api/*` routes behind the ingress prefix.

### Fix
Added two lightweight health endpoints in `/app/backend/server.py` (immediately after `app = FastAPI(...)`):
```python
@app.get("/health")
def health_check():
    return {"status": "ok"}

@app.get("/api/health")
def api_health_check():
    return {"status": "ok"}
```

`/health` unblocks the container health probe; `/api/health` gives the ingress-routed clients (frontend, monitoring) a parallel path with no auth requirements.

### Verification
- `curl http://localhost:8001/health` → `{"status":"ok"}` (200)
- `curl http://localhost:8001/api/health` → `{"status":"ok"}` (200)
- Backend supervisor status: RUNNING, no startup errors after reload


## Android EAS Build Fix — Missing google-services.json (Jun 2026)

**Symptom:** Android EAS Gradle build kept failing on Expo's servers (build ids d8f10477 AAB, 361bc82d APK). Container deploy was healthy; the failure was strictly on the `prebuild` step of the Expo-side Android compile.

**Root cause:** `/app/frontend/app.json` had `"googleServicesFile": "./google-services.json"` under `android`, but the file **did not exist** on disk. Any attempt by EAS `prebuild` to hash / copy that file into `android/app/` errored out before Gradle could even start.

**Fix:** Removed the `googleServicesFile` key from `app.json → expo.android`. Push notifications continue to work because we use **Emergent-managed push** (which injects `EMERGENT_PUSH_KEY` server-side at deploy). Real FCM is not required unless the user later opts to bring their own Firebase project — at which point they can upload `google-services.json` and re-add the key.

**Verification path:** User must re-click **Publish → Generate Build** in the deployment panel. The Gradle step should now progress past prebuild.

## Google Play Photo & Video Permissions Compliance (Jun 2026)

**Symptom:** Play Console flagged versionCode 104 for requesting `READ_MEDIA_IMAGES` / `READ_MEDIA_VIDEO`.

**Root cause:** The `expo-media-library` config plugin injects `READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO`, `READ_MEDIA_AUDIO` (+ `requestLegacyExternalStorage`) by default. It was only used for "Save flyer / score card to gallery". `expo-image-picker` (SDK 57) already uses Android's system Photo Picker (`PickVisualMedia`) and requests **no** permissions on Android 13+.

**Fix:**
- Removed `expo-media-library` (package + plugin) and `src/lib/mediaLibrary.ts`
- "Save flyer" (`app/share/[id].tsx`) and score-card fallback (`PropertyScoreCard.tsx`) now hand the PNG to the system share sheet via `expo-sharing` (user picks "Save to Photos")
- All 9 gallery pickers (chat attach, submit-property, improve-request photo+video, become-agent ID, marketplace sell, agent representations, agent onboarding, task verify) no longer call `requestMediaLibraryPermissionsAsync`; they launch the system Photo Picker directly. Camera flows still gate on `requestCameraPermissionsAsync`.
- `app.json → android.permissions` trimmed to `ACCESS_FINE/COARSE_LOCATION`, `CAMERA`, `RECORD_AUDIO`
- `app.json → android.blockedPermissions` added for `READ_MEDIA_IMAGES/VIDEO/AUDIO`, `READ_MEDIA_VISUAL_USER_SELECTED`, `ACCESS_MEDIA_LOCATION`, `POST_NOTIFICATIONS` → emitted as `tools:node="remove"` so no dependency can re-add them in the merged manifest
- versionCode intentionally left to the Emergent build pipeline (auto-increments past 104)

**Verification:** `expo prebuild --platform android` output manifest shows the three READ_MEDIA_* entries with `tools:node="remove"`; grep of every `node_modules/**/AndroidManifest.xml` and config plugin finds zero declarations of READ_MEDIA_IMAGES/VIDEO. Signed AAB is produced via **Publish**; device tests (Android 13/14/15) are on the user side.

## Play Console Release Prep — v1.0.7 (versionCode 109) (Jun 2026)
- `app.json`: `version` 1.0.1 → **1.0.7**, `android.versionCode` 2 → **109** (Play already has 108 / 1.0.6). Package `com.amassafrica.app` unchanged.
- Launcher icon fixed: generated square `assets/images/amass-icon-square.png` (1024²), `amass-adaptive-foreground.png` (1024², safe-zone padded) and Play hi-res `playstore-icon-512.png` from the original 1536×1024 artwork; app.json now points at the square files (expo-doctor icon warning gone).
- Build: managed Expo workflow, no local Android SDK/Java → the signed AAB is produced by the Emergent **Publish** pipeline (keystore held by the pipeline, Play App Signing upload key already registered since build 108). Verified via `expo prebuild`: applicationId/namespace `com.amassafrica.app`, versionCode 109, versionName 1.0.7, READ_MEDIA_* only as `tools:node="remove"`.
- Open policy items for the user (not code): Google Play Billing for token packs + agent subscriptions (currently Paystack/Flutterwave, `MOCK_PAYMENT=true`), privacy-policy URL + Data safety form, Google Maps key restriction, Facebook/voice-search "coming soon" stubs, account-deletion coverage of chat collections, dependency patch bumps per expo-doctor.

## App Store (iOS) Marketing Assets (Jun 2026)
- Generator: `/app/frontend/scripts/generate_appstore_ios.py` (PIL + numpy). Raw 3×-DPR captures (1170×2532) in `assets/images/ios-raw/` taken via Playwright with a logged-in demo session; home map is synthesised (vector Lagos map + AMASS price pins + docked card) under the chroma-keyed real app chrome.
- Output `assets/images/appstore-ios/screenshots/ios-screenshot-01…10.png` (1284×2778) and `app-previews/ios-preview-01…03.png` (2778×1284). iPhone titanium frame + Dynamic Island + iOS status bar; alternating ivory/jet-black canvases with AMASS red accents.
- Showcase chat seeded between demo agent and `tunde.showcase@amass.africa` (see test_credentials.md).

## Phase 1 — Two-Tier Property Access Charging (Jun 2026)
Admin-configurable, two separately-disclosed charges to progressively reveal a property.
- **Tier 1 · property access fee** → reveals BASIC info (exact address, all photos, specs, amenities, AI insights) + agent public identity.
- **Tier 2 · agent contact fee** → separate disclosed fee revealing the agent's PRIVATE phone + email.
- New setting `wallet_pricing` in `app_settings` (admin-editable): `property_access_fee` (5), `agent_contact_fee` (10), `access_period_days` (0=forever), `use_per_property_cost`, `free_amass_sale`, `privacy_policy_url`.
- Backend module `/app/backend/property_access.py`:
  - `GET /api/settings/pricing` (public), `GET /api/properties/{id}/access-info`
  - `POST /api/properties/{id}/access` (Tier 1), `POST /api/properties/{id}/reveal-agent` (Tier 2)
  - `GET /api/admin/wallet/transactions`, `POST /api/admin/wallet/{user_id}/adjust`
- Safeguards: fee disclosed before charge; unique partial index on `property_unlocks(user_id,property_id,tier)` + pre-check prevents duplicate charges; insufficient balance → 402 with shortfall, no debit; agent contact undeliverable → pre-check 422 (no charge) + post-charge auto-refund; auditable `token_transactions` ledger; admin review + manual adjust (`adjustment` kind).
- `server.get_property`/`list_properties` return `access_cost`, `agent_contact_cost`, `agent_unlocked`; agent phone/email gated behind Tier 2; legacy `/properties/unlock` still grants both tiers (backward compatible).
- Frontend: generalized `UnlockSheet` (mode `access`|`agent`), property-detail access gate + agent-reveal block (tappable tel:/mailto:), free in-app "Chat with Agent".
- Tests: `/app/backend/tests/test_property_access_two_tier.py` — 9/9 pass.

## Map Upgrade — Satellite-First Discovery (Jun 2026)
- **Satellite only**: `mapType="satellite"` (pure, per user). Removed Standard/Hybrid/Terrain toggle + LayerPickerSheet mount, the heatmap overlay tool, and the draw-area tool for an uncluttered UI. Right controls = locate + zoom in/out only.
- **Markers (dual encoding)**: COLOUR = availability status from real `status` data — Available (green #16A34A) / Coming soon (amber #D97706 + clock) / Sold-Let (slate #64748B + lock + struck-through price). ICON = listing type — sale(pricetag)/rent(key)/shortlet(bed)/lease(document-text). Colour never alone (icon + legend text + shape cues). Verified/Hot = small corner badge. Selected = dark fill + scale. Supercluster clustering preserved.
- **Legend**: always-visible "Map key" chip (`src/components/MapLegend.tsx`) → full key explaining status colours, listing-type icons and badges. New PropertyMarker exports: `availabilityStatus`, `STATUS_META`, `STATUS_LEGEND`, `listingKind`, `LISTING_TYPE_META`, `LISTING_TYPE_LEGEND` (type-colour exports kept for cards/back-compat).
- **States**: centered loading pill, error card + Retry (`map-retry-btn`), empty card + Clear filters (`map-clear-filters-btn`). Permission handling + default market region + recenter unchanged.
- **Marker testIDs**: `marker-{status}-{kind}[-active][-hot]`.
- **Web note**: react-native-maps is native-only; web uses a placeholder (markers now forward onPress). Real satellite imagery + native markers require a dev/standalone build (not Expo Go web).
- **Google Maps key**: lives in `app.json` (ios.config.googleMapsApiKey + android.config.googleMaps.apiKey) — standard for the mobile SDK (restrict by bundle id / SHA-1 in Google Cloud). User must verify in Google Cloud Console: Maps SDK for Android + iOS enabled, billing active, and key app-restrictions set.

### Map Filters — Status chips + interactive legend (Jun 2026)
- Client-side filters on loaded listings; `visible` set drives clusters(map), list FlatList+count+empty, docked card, activeId reset → map/list/legend stay in sync.
- Status chips (bottom-left, always visible): Available / Coming soon / Sold-Let, multi-select toggle, colour-fill when active; `status-chip-clear` ("All") reset. testIDs: status-chip-{available|coming_soon|closed}.
- Interactive legend (`MapLegend` now accepts selectedStatuses/selectedKinds + onToggleStatus/onToggleKind/onClear): tap status rows or listing-type icons (legend-type-{sale|rent|shortlet|lease}) to filter; active check + `legend-reset-btn` ("Show all pins"). Active listing-type filters also show as removable `kind-chip-*` in the bottom-left row.
- Empty-when-filtered shows `map-clear-mapfilters-btn` ("Reset map filters").
- Verified: testing_agent iteration_38, 13/13 pass.

## Brand Logo Integration — authoritative AMASS emblem (Jun 2026)
- Client supplied the authoritative emblem (red location pin + black "A" house + red door, white bg). Processed into a clean transparent-background, trimmed master: `frontend/assets/images/amass-emblem.png` (aspect 1.5275). Logo used UNALTERED (no redraw/recolor/crop).
- `src/components/AmassLogo.tsx` rewritten to use the emblem: `showWordmark={false}` = emblem only; `showWordmark={true}` = emblem + "AMASS" typographic lockup (app bold typography); new `tone="light"` makes the wordmark text white for dark backgrounds (emblem never recoloured). `AmassPinIcon` = emblem only. All existing call-sites (onboarding, login, register, app loading, home header, profile, ai-search) now show the new emblem automatically.
- Added tasteful brand touchpoints: wallet dark header (emblem on a white rounded badge for contrast), agent onboarding step-0 hero (emblem).
- Platform assets regenerated from the emblem: `amass-icon-square.png` (iOS, opaque white 1024), `amass-adaptive-foreground.png` (Android adaptive, transparent safe-zone), `favicon.png` (web), `amass-splash.png` + app.json splash points to it (white bg, imageWidth 220), `playstore-icon-512.png`. App-icon/splash changes apply on next build.
- Verified login hero lockup + home header + wallet header on mobile (390) and desktop (1280); emblem loads crisp, correct aspect, strong contrast.
- NOTE: old orphaned assets `amass-logo-full.png` (old flat wordmark) + `amass-icon.png` no longer referenced. Marketing screenshots/feature-graphic in assets/images/playstore-* + appstore-ios were NOT regenerated (may still show prior art) — regenerate on request. The supplied file is emblem-only; the in-app "AMASS" wordmark is set in app typography — if a specific wordmark art file is required, ask the client.

## Auth Overhaul + Fixa Intro (Jun 2026)
- **Intro sequence**: `app/index.tsx` splash shows the AMASS emblem first, then (first launch only — AsyncStorage `amass_brand_intro_seen_v1`) crossfades to the supplied **Fixa** brand card (`assets/images/fixa-logo.png`) on its green (#7ED958). Always-visible **Skip**; never blocks access; does not replay after first launch. Both logos used unaltered.
- **Password reset (email)**: `backend/auth_security.py` via Emergent-managed Resend (EMERGENT_EMAIL_KEY + EMAIL_FROM_NAME=AMASS in .env, httpx). `POST /api/auth/forgot-password` is enumeration-safe (identical generic 200); emails a 6-digit code (sha256-hashed at rest, 15-min expiry, resend 60s/5-per-hr throttle). `POST /api/auth/reset-password` verifies (≤5 attempts) → new bcrypt hash → clears lockout. 400 invalid/expired, 429 too-many.
- **Brute-force lockout**: server.login → `check_login_locked` (429 + wait) / `record_login_failure` (6 fails/15min → 15-min lock) / `clear_login_failures` on success. Indexes: password_resets.email (unique + TTL), login_attempts.email (unique).
- **Frontend**: login gains Forgot-password link, show-password, autofill, `?redirect=` destination preservation, reset success banner (`?reset=1`), friendlier network/lockout errors. Register gains inline email/password validation + password hint + autofill + redirect. New `/forgot-password` 2-step screen (request code → code+new password) with resend cooldown + expiry guidance. `api.forgotPassword/resetPassword` added.
- Verified: `backend/tests/test_auth_forgot_reset_lockout.py` 12/12; frontend E2E all critical paths (iteration_39). Social buttons (Google/Apple) pre-existing, untouched.
- Cosmetic only: RN-web console warnings (shadow*/pointerEvents/useNativeDriver) — no functional impact.

## Profile section — reordered & every item activated (Jun 2026)
- `(tabs)/profile.tsx` menu reordered to the exact product-priority spec (Wallet → My Unlocks → Saved Properties → Saved Searches → Earn Tokens → Become an Agent → List a Property → Agent Workspace → Agent Plans → Provider Dashboard → Improve My Property → My Ad Campaigns → My Documents → Identity Verification → Notifications → Settings → Help & Support → About AMASS). Every row now has a working route. Header stats wired to REAL data (Saved = `listFavorites().length`, Unlocked = `walletUnlocks().length`, Member-since year); agent badge reflects `is_agent`.
- **5 new real screens** (no placeholders/fake success): `/saved-properties` (favorites via `listFavorites`, unsave, loading/empty/error, pull-to-refresh), `/my-documents` (real access receipts from wallet unlocks + agent representation agreements; honest empty state), `/identity-verification` (verification tiers from `agentMe` level; CTA → become-agent), `/help` (email support mailto, in-app chat, FAQ accordion, hosted Privacy/Terms links), `/about` (logo, version, legal + contact links).
- **Gating** via new `src/components/RoleGate.tsx`: Agent Workspace shows a friendly explanation + "Become an agent" CTA for non-agents (real workspace for agents). Provider Dashboard empty state gained a "Join FIXA as a provider" CTA (`join-fixa-btn` → /marketplace/sell).
- **Cross-platform fixes**: sign-out now uses `window.confirm` on web (Alert.alert buttons don't render on RN-web); Profile Saved count uses `listFavorites` so it matches the Saved Properties screen.
- Verified: testing_agent iteration_42 — all 18 rows navigate to working screens, all new screens load with back-nav, FAQ accordion, gating correct. Testing agent fixed a dup-key warning in my-documents. Lint clean.
- **Missing-integration note**: there is no dedicated document-vault or standalone identity-KYC backend — My Documents and Identity Verification are wired to the closest real data/feature (unlock receipts, representation mandates, agent verification levels). A true document-upload vault and standalone KYC would need backend work. Favorites `favoriteIds` vs `listFavorites` can disagree (stale ids) — UI now uses `listFavorites` for consistency; backend reconciliation recommended.

## Font-everywhere + Smart Sort + Nearby-first + detail polish (Jun 2026)
- **Font everywhere**: `src/lib/global-font.ts` (imported in `app/_layout.tsx`) patches the `Text`/`TextInput` forwardRef `render` to inject a weight-matched Plus Jakarta Sans `fontFamily` into any text WITHOUT an explicit fontFamily. Weight map: ≤400→regular, 500→medium, 600→semibold, ≥700/"bold"→bold. Web-safe: it modifies INPUT `props.style` (RN array) before calling the original render — an earlier version that cloneElement'd the OUTPUT crashed RN-web (CSSStyleDeclaration indexed setter) and was fixed. Icons (explicit `fontFamily:'Ionicons'`) and the serif price stack are skipped. Verified: Login 'Welcome back' + Home tab resolve to PlusJakartaSans-700; hierarchy preserved app-wide.
- **Smart Sorting**: Market feed header has a `sort-pill` → modal (sort-opt-nearby/newest/price_asc/price_desc/rating). Sorting is client-side over the loaded set (`sortItems`), covers Nearby/Newest/Price↑/Price↓/Top-rated (rating uses seller_rating/reviews). Pill shows a short label; view-toggle is now an icon-only pill.
- **Nearby First**: default sort = `nearby`. `buildParams` no longer sends a hard `city` filter — city is a client-side ranking signal (`proximityRank`: exact city 0 → same metro 1 → else 2, then boosted, then newest). Subtitle shows "· Near {city}". Nothing is hidden; chosen city floats to top.
- **Listing detail**: product + pro/seller detail pages inherit the unified PJS font globally; related items use the updated scrim `ClassifiedCard`. No structural rewrite needed.
- Verified: testing_agent iteration_41 = 100% pass (font app-wide + no red-screen across all tabs/detail, Price↓ → [₦1.4M,₦950k,₦680k], Price↑ reversed, nearby 'Lagos - Lekki' floats Lagos items, all Market regressions). Lint clean.

## Market tab redesign — premium Airbnb/Redfin feel (Jun 2026)
- **Font system**: added Plus Jakarta Sans (local TTFs 400/500/600/700 in assets/fonts) loaded via `src/hooks/use-app-fonts.ts` + wired into `app/_layout.tsx` (combined with icon fonts before splash hide). `theme.ts` exports `fontFamily {regular,medium,semibold,bold}`; reference by `fontFamily` (not fontWeight). Scoped to the Market experience (cards + screen); rest of app keeps system font.
- **`(tabs)/marketplace.tsx` rewritten** (logic/handlers/buildParams/API all preserved): sticky **glass header** (expo-blur) with AMASS emblem + "Market", location pill, saved/notif icons; Airbnb-style search bar + ink filter button (count badge); full-width **segmented control** (Brands / FIXA [green dot] / Declutter). Body = category chip rail (icon chips) → Featured rail → feed header (count + grid/list toggle) → 2-col grid (Brands/Declutter) or ProviderCard list (FIXA). Dynamic FAB (Add Store / Join FIXA / Sell). Empty state gains "Clear filters". FIXA branding lives in-section via the dark FIXA Verified Services banner. Accessibility labels/roles added throughout.
- **ClassifiedCard**: LinearGradient scrim (transparent→ink) under price pill/badges for WCAG-legible overlays, calmer PJS weights, bordered cards. **ProviderCard**: PJS weights, 40px touch targets for Call/WhatsApp/Book.
- Verified: design_agent blueprint (design_guidelines.json, "iOS-Native Clean"); testing_agent iteration_40 = 100% pass on all Market flows (section switch + persist, chips, grid/list, favorites persist, filter sheet, city picker, all navigation, Book Now sheet, PJS fonts loaded). Lint clean. No blocking issues.
- **Street-labels toggle** (`fab-map-layer`): persisted `mapLayer` state (`MAP_LAYER_KEY`) switches `mapType` between `"hybrid"` (satellite + road/place labels) and `"satellite"` (clean imagery only). Button highlights (ink) when labels are ON; preference restored on mount via `storage.getItem`. Default = hybrid.
- `(tabs)/index.tsx`:
  - **Satellite with readable roads**: `mapType` changed `"satellite"` → `"hybrid"` (Google satellite imagery + road lines/labels). Still a satellite view; now roads/place names are legible as requested. (Native only — web uses the placeholder.)
  - **Compass control**: new `heading` state read from `mapRef.getCamera()` in `onRegionChangeComplete` (native only). A custom compass FAB (`fab-compass`) appears only when the map is rotated (`|heading| > 2`), its needle rotates `-heading`, and tapping (`resetNorth`) animates the camera back to north-up keeping the tilt.
  - **Accessibility**: `ActionBtn` now takes `label`/`iconRotation` and sets `accessibilityRole="button"` + `accessibilityLabel` (locate / zoom in / zoom out / compass). Markers + cluster markers get `accessibilityLabel` (price·type·location / "Cluster of N homes"). Search input, filter, AI, save-search, and view-toggle got labels too.
- Everything else preserved: existing clustering (supercluster), status/type filters + interactive legend, docked preview cards, search-this-area, recenter/zoom, loading/error/empty/offline states, wallet & property-access rules (untouched).
- Verified: web smoke test (map screen + all overlays render, no crash); lint clean (only 2 pre-existing ternary warnings). Native behaviors (hybrid tiles, compass, marker a11y, live location) require a dev/production build to QA.
- `app/index.tsx` reworked so the opening animation always plays (removed first-launch gate + `storage`/`BRAND_INTRO_KEY`): **AMASS alone ~2s → AMASS fully fades out → FIXA alone ~2s → navigate** to onboarding/login.
- Guaranteed no overlap: each phase is conditionally mounted (`phase === "amass"` vs `"fixa"`); FIXA is only mounted after AMASS's fade-out animation `finished` callback, so the two logos are never on screen together (verified: at FIXA opacity 1, AMASS node unmounted).
- Backgrounds: AMASS on `colors.bg` (white), container switches to `#7ED958` for FIXA (matches the asset's baked green). Each logo keeps original design/proportions/colors. AMASS emblem size 128; FIXA card width 116%. Each enters with fade + spring scale.
- Verified via screenshots on 390px (AMASS phase, FIXA phase); lint clean.
- `AmassLogo.tsx`: emblem presets bumped (`lg` 60→64, `xl` 96→112); wordmark made bolder/tighter (fs h×0.34→0.38, letterSpacing ×0.16→0.10) — benefits every hero lockup (splash, onboarding, login, register).
- Splash `app/index.tsx`:
  - AMASS moment: larger emblem (size 124), bold wordmark, a centered red accent rule above a single-line letter-spaced tagline "AFRICA'S PROPERTY OPERATING SYSTEM"; entrance now opacity 700ms + spring scale from 0.86.
  - FIXA moment: crossfade now pairs opacity with a spring scale-in (from 0.9); card enlarged (width 94%→116%, maxWidth 480→560) so the FIXA brand reads boldly. Background `#7ED958` exactly matches the asset's baked-in green so it blends seamlessly (over-scaled green margins bleed off-screen harmlessly).
- Verified via screenshots on 390px: AMASS splash, FIXA splash (opacity 0.99, no ghosting), and login header all crisp.

## Privacy Policy + Terms (Play/App Store compliance) (Jun 2026)
- **Backend** `/app/backend/legal.py` → `register_legal_routes()` serves public, auth-free HTML:
  - `GET /api/legal/privacy` — full AMASS privacy policy (account/profile/location/camera/payments/chat data, sharing, retention, account deletion, security, children, contact).
  - `GET /api/legal/terms` — terms of service (account, listings/conduct, wallet/tokens/subscriptions, AI disclaimer, liability, termination).
  - Registered in `server.py` right after admin cockpit router. Branded AMASS HTML template (inline CSS, mobile-responsive). The **hosted public URL to submit to Play Store Data Safety** is `https://<deployed-domain>/api/legal/privacy`.
- **Frontend**:
  - `src/lib/legal.ts` — `LEGAL_URLS` + `openPrivacyPolicy()` / `openTerms()` (expo-web-browser), URL built from `EXPO_PUBLIC_BACKEND_URL`.
  - `src/components/LegalLinks.tsx` — `LegalConsent` ("By signing in/creating an account you agree to our Terms & Privacy Policy", testIDs legal-consent / legal-privacy-link / legal-terms-link) + `LegalLinksRow`.
  - Login + Register screens show `LegalConsent` under the footer; Settings gains a **Legal** section (Privacy Policy + Terms rows).
- Verified: both HTML endpoints 200 (curl) + render in browser; login screen shows consent line; lint clean.

## Premium UI/UX overhaul — Phase 1: design system + shell + core screens (Jun 2026)
**Audit findings**: static light-only `colors` object imported by 114 files; 312 hard-coded hex literals; no shared Button/Input/Header (65 hand-rolled back headers); emoji used as icons in 8 files; spinner-only loading; 51 raw `Alert.alert`; fake data on Discover "Market Signals" + property-detail Neighborhood scores; dead "Schedule Tour"/chat CTA buttons on listing detail.
**Direction**: "real estate meets fintech" — ink + AMASS red primary with full 50–900 scales, warm stone neutrals, MASS = gold / FIX = FIXA-green currency accents, deliberate light AND dark themes, Plus Jakarta Sans everywhere (added **800 ExtraBold** display weight, tabular numerals for all prices/balances), 4/8pt grid, 12/16/20/24 radii, layered shadows, Ionicons as the single icon set.

### Design system (`frontend/src/theme`, `frontend/src/ui`)
- `theme/tokens.ts` — palette scales (red, neutral, gold, green, amber, blue, violet), `space`, `radii`, `fontFamilies`, `typeScale` (display→micro w/ line heights), `motion` (150/220/300ms + springs).
- `theme/themes.ts` — `lightTheme` / `darkTheme` semantic `ThemeColors` (bg/surface/text tiers, primary, brand, mass/fix, success/warning/error/info/premium, borders, skeleton, tabBar) + shadow tiers.
- `theme/ThemeProvider.tsx` — `ThemeProvider`, `useTheme()`, `useThemeMode()` (`system|light|dark`, persisted in storage `amass_theme_mode`). `app.json userInterfaceStyle` → `automatic`. Root `_layout.tsx` wraps app in ThemeProvider + ToastProvider; StatusBar/Stack bg follow theme.
- `ui/` kit: `AppText` (variants, tones, `tabular`), `Button` (primary/brand/secondary/outline/ghost/destructive/mass/fix; sm/md/lg; loading/disabled; spring press), `IconButton` (badge), `Input` (label/helper/error/focus), `Card`, `Badge`/`VerifiedBadge`, `Avatar` (verified ring), `Chip`, `Divider`, `ProgressBar`, `Screen`, `ScreenHeader`, `Section`, `ListRow`, `RowGroup`, `Skeleton`/`SkeletonRows`/`SkeletonCard` (reduced-motion aware), `EmptyState` (empty/error/offline/success), `AnimatedNumber` (count-up), `StatTile`, `ToastProvider`/`useToast`, `SegmentedControl` (sliding thumb), `BalanceChip` (MASS+FIX header chip → /wallet), `Sheet` (spring bottom sheet, web-safe Modal), `ChargeConfirm` (paid-action confirm: cost, balance now, **balance after**, top-up path). Legacy `constants/theme.ts` untouched + gained `fontFamily.extrabold` and `currency` tokens; `global-font.ts` maps weight ≥800 → ExtraBold.
- `components/ListingCard.tsx` — premium listing card (photo, price-first, specs row, animated save heart outside the card pressable to avoid nested buttons on web, Verified/Exclusive/Sold badges, blurhash placeholder).
- `lib/recently-viewed.ts` — local recently-viewed ids (`amass_recent_properties_v1`), recorded from `property/[id]`.

### Screens redesigned (all existing routes, API calls, testIDs preserved)
- `(tabs)/_layout.tsx` — themed glass tab bar, sliding pill indicator, spring icon pop, Inbox unread badge (`/chat/unread-count`, 30s poll + foreground refresh), a11y tab roles.
- `(tabs)/discover.tsx` → striking home: greeting + `BalanceChip` + notifications bell (unread), AI search bar (→ /ai-search) + map shortcut, 6 category tiles (Buy/Rent → map via `ai_filters`, Services/Brands → Market, Declutter → /marketplace/sell, Improve → /improve), Featured homes rail (verified listings), **Recently viewed** rail, Trending areas, Neighbourhood scores, **Market movers derived from real neighbourhood `price_change_pct`** (replaced hard-coded signals), journey nudges (Declutter / Inspection). Skeleton/empty/error states.
- `(tabs)/profile.tsx` — Avatar with verified ring, role badges, dark/light quick toggle (`theme-toggle`), wallet hero (animated MASS, FIX pill, Top up), StatTiles, grouped `RowGroup`s (Wallet & rewards / Agents & listings / Services / Trust & documents / Account) in the product-priority order, agent-gated badge, destructive sign-out.
- `wallet.tsx` — MASS & FIX hero cards with `AnimatedNumber`, quick actions (same testIDs), **Daily bonus claim** (wires existing `claimDailyLogin`), subscription card, lifetime StatTiles, activity grouped by day with currency badges, filter chips, skeleton/empty/error, toasts.
- `earn.tsx` — streak hero (7-day dots, claim button, +N burst animation), referral card (code, **Copy** via expo-clipboard, Share, friends joined + MASS earned), task cards with progress + hints, Phone-verify and Referral-code flows moved to `Sheet` + `Input` + toasts (testIDs kept: task-*, phone-input, otp-input, confirm-otp, referral-input, apply-referral-btn, referral-share).
- `settings.tsx` — Appearance segmented control (System/Light/Dark, real), notification prefs persisted locally, Change password → forgot-password flow (real), Subscription shows real plan, delete-account flow kept (web-safe confirm), legal rows. Removed fake biometric/language/currency rows.
- `notifications.tsx` — grouped by type chips (All/Messages/Property/Wallet/Services with counts) and by day, unread highlight + "New" badge, deep-links (chat, inspection, finance, project, agent task, passport, property), mark-all-read with toast.
- `onboarding.tsx` — 4-slide first-run explaining AMASS + MASS/FIX in plain language, animated dots, skip, sign-in link.
- `help.tsx` (searchable FAQ + contact), `about.tsx` (pillars + legal), `saved-properties.tsx` (ListingCard list, responsive 2-col ≥700px, undo toast), `my-documents.tsx` (type icons, status badges, filters, grouped by month), `identity-verification.tsx` (step cards, "Next step" highlight, progress).
- `property/[id].tsx` targeted fixes: **Neighborhood scores now real** (`/properties/{id}/intelligence`, hidden when unavailable), dead "Schedule Tour"/ghost chat buttons replaced with real Share + "Chat with Agent · Free", unlock CTA shows current balance, skeleton loading + designed not-found state. `UnlockSheet` gained **Balance after** row (`unlock-balance-after`). `PriceText` → PJS ExtraBold tabular (serif removed for consistency).
- Emoji-as-icon purge: sell.tsx categories → Ionicons, CategoryCircle prefers icon, MarketFilterSheet labels, ads/buy-tokens/buy-fix/inbox/share text emoji removed.

### Notes / next phases
- Legacy screens not yet migrated to `useTheme()` stay light-only (map home, marketplace, agent dashboard, provider dashboard, admin, improve, ads, auth, submit-property, become-agent, chat). Next session: agent tools → FIXA → marketplace/declutter/improve → advertising → documents/verification polish → admin → remaining profile sub-screens, then migrate hard-coded colours to theme tokens.

## Premium UI/UX overhaul — Phase 3 close-out + Phase 4 quality bar (Jun 2026)
### Phase 3 finish
- `tsc` clean (76 → 0): `keyof typeof Ionicons.glyphMap` → shared `IconName`; `NodeJS.Timeout` → `ReturnType<typeof setTimeout>`; RN 0.86 removed `StyleSheet.absoluteFillObject` (spreads were silently no-ops on device) → `absoluteFill`; react-native-maps prop renamed `showsPointsOfInterests`; `StorageItemValue` widened to objects (storage JSON-encodes anyway).
- Latent bug fixed: duplicate `api.mySubscription`/`api.cancelSubscription` keys meant `subscribe.tsx` cancelled the AGENT-platform plan → split into `myTokenSubscription`/`cancelTokenSubscription`.
- Backend: `/api/agent/score` 500 (tz-naive `updated_at` compare) fixed in `reviews_score_crm.py`; demo account protected from self-serve deletion.
- **Listing Detail `/property/[id]` rewritten** on the design system (AppText/Button/Badge/Avatar/Card/toasts; light + dark). All testIDs preserved. New: owner-aware CTAs — when the viewer owns the listing, chat/reveal buttons are replaced by `own-listing-note` + "Manage listing" (→ /agent-dashboard); gallery dots; `investment_score == null` no longer renders an empty score circle.
- `UnlockSheet`, `PropertyScoreCard`, `VoiceComposer`, `PriceText` redesigned/theme-aware (testIDs kept).
- **Legacy bridge** `src/theme/legacy.ts` → `useLegacyColors()` returns the old `constants/theme` colour keys resolved from the active theme (ink stays a dark fill in dark mode so white-on-ink text never inverts). `scripts/migrate_legacy.py` mechanically converted 35 light-only files (home map, market tab, admin duplicate-review, submit-property, become-agent, sell, agent onboarding + all map/market/filter components) to `makeStyles(colors)` factories. Home search bar / Market header use dark glass in dark mode.
### Phase 4 — UX quality bar
- Global `OfflineBanner` (`@react-native-community/netinfo`) mounted in root layout — slides in when offline, "Back online" flash on reconnect (testIDs offline-banner / online-banner).
- Error states with Retry on Market (`market-error`) and Inbox (`inbox-error`) instead of a misleading "empty" state; Market loading = skeleton grid (`market-loading`).
- Non-blocking Alerts → toasts: save-search success (with "View" action) / failure, contact-agent failure, GPS unavailable, provider no-phone/no-WhatsApp, ad feedback. Confirm dialogs (sign-out, delete, permissions → Open Settings) intentionally remain Alerts.
- Accessibility: roles/states/labels on all chip/radio/checkbox/photo-picker Pressables in submit-property, become-agent, sell, agent onboarding; gallery/contact rows on listing detail.
- Performance: FlatList tuning (`initialNumToRender`, `windowSize`, `removeClippedSubviews` native-only) on Market grid, Inbox, Saved properties.
- Verified: testing_agent iteration_44 (52/52 routes) + iteration_45 (100% light+dark incl. owner/buyer listing-detail flows, UnlockSheet, dark legibility).
- **Native crash fix (Expo Go)**: `AnimatedNumber` called the plain-JS `format()` inside a Reanimated worklet (`useAnimatedReaction`) — fine on web (single thread) but throws on iOS/Android ("Tried to synchronously call a non-worklet function on the UI thread"), which made Profile (and Wallet/Earn/Provider dashboard/Agent score) fail to open on device. Formatting now runs on the JS thread via `runOnJS(applyText)(v)`.

## Premium App Spec — Phase 2 close-out + Phase 3.2–3.5 + 3.9 (Jun 2026)
**Checkpoint 0**: Mongo runs standalone (no replica set) → no multi-document transactions. `monetization.py` uses the *entitlement row as the lock* (unique user+featureKey+target), conditional atomic wallet debit, `unlock_requests` idempotency keys, ledger row per change, 10-min reconciliation sweep (stale pendings + 24h auto-credit).

### Backend (all pytest suites green: monetization_spec 15, review_map_monetization 15, agent_endpoints, token_economy, property_access_two_tier, security_hardening, amass_api, sdk57)
- `GET /api/properties` now annotated by `monetization.annotate_properties` (zone/category fee, `zone_tier`, `unlocked` from **entitlements**; agent contact stripped when locked) — same source of truth as `/unlocks`, `/map/markers`, `GET /properties/{id}`.
- Legacy `POST /api/properties/unlock` and `POST /api/properties/{id}/access` are thin aliases of `UnlockService.unlock` (one charge per property, idempotent). `GET /api/wallet/unlocks` reads entitlements. `reveal-agent` → 422 `contact_unavailable` when no contact (never charges).
- **Admins are NOT exempt** from paid unlocks / FIX gate (owners of a listing/provider are free). Demo account therefore exercises the real paid flow.
- `/api/settings/pricing` reads `monetization.free_amass_sale` (default **off**) + conversion. Welcome bonus = 300 MASS / 100 FIX (admin-editable).
- Category tiers extended (movers 1, masonry/cctv 2, interior/project managers 3). `/seed` is admin-only (tests assert the gate only — running it wipes listings).

### Frontend
- **3.2 Map-first Discovery** `(tabs)/index.tsx` rewritten: no list view, lean authenticated `/map/markers`, category pins (Sale/Rent, lock state, verified), approx jitter until unlocked, legend counts, Get-MASS banner when balance 0, quick filters, FilterSheet, save-search, compass/layers/locate/zoom, location permission banner → Open Settings, shared `UnlockDialog` (live quote → confirm → `/property/{id}`).
- **3.3 Unlock flow** `property/[id].tsx` uses `UnlockDialog` (single fee, agent contact INCLUDED — "Reveal direct contact" fee button removed; `agent-contact-revealed` / `agent-contact-unavailable`). `unlocks.tsx` = My Unlocked Properties via `/unlocks/mine` with Sale/Rent filters, MASS spent, **24h "Get a credit" sheet** (`/unlocks/{id}/report` → refund, badge "Credited"). `UnlockSheet` + wallet-context unlock helpers deleted.
- **3.4 Wallet**: naira equivalence under MASS/FIX balances (`/monetization/config`), ledger rows show `Sale|Rent · Zone X` / `Tier N · Zone X` / Auto-credit + ≈₦, "Browse FIXA" quick action.
- **3.5 FIXA**: `src/components/fixa/FixaGate.tsx` (FIX > 0 gate, Get FIX / Earn FIX), `app/fixa/index.tsx` (gated browse: search, verified + subcategory chips, provider rows), `app/fixa/[id].tsx` (profile, tier/zone badges, locked contact card, `UnlockDialog` featureKey `fixa_provider`, revealed phone/WhatsApp, Call + Book a visit via BookingSheet, `?unlock=1` auto-reopen after top-up). Market tab FIXA segment shows the gate for 0-FIX users, provider cards show a lock "Contact" pill (no call/WhatsApp leak) and open `/fixa/[id]`; Discover "Services" tile → `/fixa`. `buy-fix` supports `returnTo`.
- **3.9 Admin** `app/admin/pricing.tsx` (tile on admin cockpit): Prices grid (MASS zone×rent/sale, FIX zone×tier, edit sheet with backend validation errors, recent admin changes), Zones & tiers editors (tap-to-cycle, add/remove, save), Config (conversion, welcome bonus, top-up min, auto-credit window, marker rate, free AMASS sale toggle), Report (7/30/90d, MASS/FIX filter, revenue/paid/payers/sale/rental/provider tiles, revenue-by-day bar chart, funnel, tokens collected, by-category).
- Tests: testing_agent iteration_47 (backend 38/38 + map-first UI) and iteration_48 (8/8 UI flows: unlock, credits, FIXA browse/profile/gate, market gate, wallet).

### Still open (user decisions)
- Google Play Billing for token top-ups (Paystack still `MOCK_PAYMENT=true`), rotated Paystack keys, external admin-portal API docs.

## Neighbours — privacy-first social layer + Phone OTP sign-in (Jun 2026)
**Goal**: help seekers, couples, friends, estate residents and neighbours decide together and know their area — WITHOUT touching the paid conversion path. Every property surfaced socially routes to `/property/[id]` (UnlockDialog + MASS fee intact); social features never reveal address/agent contact; recognition points have no cash value.

### Backend (`phone_auth.py`, `social.py`, `social_common.py`, `community.py`, `analytics.py`, `social_seed.py`)
- Phone OTP primary sign-in: `POST /api/auth/phone/start|resend|verify`, `GET /api/auth/phone/status`, `POST /api/auth/account/add-email`. Provider switch (Twilio playbook) — **mocked, code `123456`** until keys are supplied. Purposes: signin · link · change.
- Social: `/api/social/me` (handle/bio/privacy toggles), search, contacts match (client-side SHA-256 hashes via `expo-crypto`, deletable), connections (request/accept/decline/cancel/remove), block/mute, reports, recognition (points/badges), feedback, `GET /social/context/properties?ids=` (saved-by friends + in-collections), shared collections (items · love/maybe/no reactions · comments · invite by friend or rotating link `/collections/join/{code}`).
- Community: estates directory (+ propose → admin approve), join by code / proof / request (unit + proof private, managers only, proof deleted on review), members & manager review, posts (notice[official, notifies residents] · question · recommendation · general) + replies/accept/upvote/moderate, interest groups, events (audience estate|connections|public, RSVP, capacity, optional group chat conversation, host cancel), places (never property markers; estate amenities residents-only; recommend + notes), service requests (status workflow open→acknowledged→in_progress→resolved→closed, urgent notifies managers, optional FIXA provider link via the normal gated flow), `GET /community/home` hub payload, `POST /community/uploads` (base64 → object storage, 5 MB), admin estate approvals + social report moderation.
- `/api/files/{path}` auth extended: estate managers may read pending residents' `proof_url`; approved estate members may read service-request photos.
- Analytics: `POST /api/analytics/events` (whitelist incl. marker_impression/marker_tap/property_detail_view/paid_action_start/payment_completed + social events; `arrived_via` ∈ direct|friend|collection|estate|recommendation|share|search), `GET /api/admin/analytics/funnel?days=` (ledger = money truth; attribution by via).
- Chat: user↔user DMs between accepted connections (`POST /chat/conversations/direct/{user_id}`), event group chats.
- Seed: 3 pilot estates (Lekki Gardens Phase 2 — demo user is manager; Sunnyvale Dakwo; Pilot Court) with places, welcome notice, open question, upcoming event.
- Tests: `tests/test_neighbours.py` (15) + `tests/test_neighbours_extras.py` (11) green. Fixed regressions: demo agent slug restored to `ada-demo-a8d30c` (`scripts/restore_demo_user.py` corrected), `share_by_channel: null` legacy docs normalised before `$inc` (share_routes) + model default `{}` → share/agent-platform/admin-cockpit suites green again.

### Frontend
- Tab bar: **Neighbours** replaces Inbox (Inbox reachable from the hub header with unread badge).
- `(tabs)/neighbours.tsx` hub: quick actions (Friends · Shared lists · Local map · Events), my estate card / join nudge, official notices, friends & couples, shared lists rail, coming-up events, local help (ask / report issue), recognition, verify-phone nudge.
- Screens under `app/neighbours/`: `friends`, `find-friends` (contact matching opt-in), `users/[id]`, `collections/index`, `collections/[id]` (decide-together: reactions, comments, invite, "View & unlock · N MASS" → property page), `collections/join/[code]`, `estates/index` (+ propose sheet), `estates/[id]` (Feed · Q&A · Groups · Events · Issues · People; compose sheet; join sheet; manager join-code sheet + pending-request review with proof viewer), `posts/[id]`, `events/index|new|[id]`, `places` (native map + list; web list), `services/index|new|[id]`, `settings` (privacy toggles, contact matching off, blocked/muted, recognition, feedback).
- Auth: `(auth)/phone.tsx` + `verify.tsx`; login shows "Continue with phone number" as the primary CTA (email below).
- Property detail: `add-to-list-btn` (top bar) + social context row (`social-row`, "Saved by Ada +1 · in 🏠 Homes to view") with inline Add to list → `AddToCollectionSheet`; funnel tracking (`property_detail_view` with `?via=`, `paid_action_start`, `payment_completed`). Home map tracks `marker_tap` + impressions. `ListingCard` gains `onAddToList` (wired on Saved properties).
- Shared components `src/components/neighbours/`: EventRow, PostRow, UserRow, ServiceRequestRow, AddToCollectionSheet, ComposePostSheet, JoinEstateSheet, ReportSheet, ToggleRow, AuthedImage; `src/lib/pickImage.ts` (system photo picker → base64 → `/community/uploads`).
- UI kit: `Button` gains `size="xs"`.
- Verified: testing_agent iteration_51 — backend 26/27 (1 pre-existing skip), all frontend journeys green, no paywall leak.

## Backend test-suite recovery + Admin · Neighbours module (Jun 2026)
### pytest stabilisation (734 passed · 4 skipped, ~85 s)
- Root causes of the 69 failures: (a) suites defaulted to the Cloudflare-fronted preview URL and got 502s whenever uvicorn reloaded; (b) two tests `supervisorctl restart backend` mid-run, killing the other xdist worker; (c) `--dist loadscope` split classes of one file across workers while suites hand state between classes; (d) `test_security_hardening` called the real `/api/seed`, wiping every listing mid-suite; (e) data drift (fixed phone numbers now unique per account, fixed GPS coords tripping duplicate detection, demo user at Starter quota, `/mine` capped at 500 unsorted).
- Fixes: `tests/conftest.py` defaults `EXPO_BACKEND_URL` / `EXPO_PUBLIC_BACKEND_URL` / `TEST_BASE_URL` to localhost (explicit env still wins), `pytest_xdist_make_scheduler` groups by FILE, `restarts_backend` marker auto-skipped when workers > 1 (run those with `-n 0 -m restarts_backend`); `POST /api/seed?dry_run=true`; `GET /api/agent/properties/mine` newest-first; quota + create-property tests use throwaway accounts; random phone numbers / coordinates; chat test fixtures insert geo fields.
- Rule: never edit files under `/app/backend` while the suite runs (uvicorn `--reload` watches `tests/`).

### Admin · Neighbours (`/admin/neighbours`, tile on `/admin` with pending-estates + open-reports badge)
- **Funnel**: 7/30/90-day range; ledger-truth hero (paid unlocks, delta vs previous window, failed, share of paid unlocks/intent that arrived via Neighbours); 5-step discovery→paid bars with step rates; attribution by `arrived_via` with Social badges (friend · shared list · estate feed · recommendation vs share · search · direct); phone sign-in, adoption and trust-&-safety tiles. Reads `GET /api/admin/analytics/funnel`.
- **Estates**: pending / active / rejected; approve (notifies founder, makes them resident/manager) or reject (confirm sheet). `GET /api/community/admin/estates`, `POST …/review`.
- **Reports**: open / resolved; hide · restore · ban user (confirm) · dismiss · open target. `GET /api/social/admin/reports`, `POST …/resolve`.
- `admin/cockpit/dashboard` now returns `pending_estates`, `open_social_reports`.
- Verified: testing_agent iteration_52 (backend 21/21 incl. end-to-end propose→approve; all UI flows green; conversion guard intact).

## Neighbours follow-ups — Friend Nudges · Estate Join Alerts · Funnel CSV (Jun 2026)
- **Friend Nudges** (`/api/map/markers` → `friends_saved:int`, `in_shared_list:bool`): counts saves by *accepted connections who opted into `share_saves`* and flags properties sitting in a shared (≥2 member) collection. Map pins get a brand ring + badge (`pin-nudge-{id}`), legend shows "N by friends", UnlockDialog shows `unlock-friend-nudge` ("1 friend saved this"). Never unlocks or reveals anything — MASS fee intact.
- **Estate Join Alerts** (`GET /api/community/alerts` → `{join_requests, connection_requests, total}`): managers see `nb-join-alert-{estateId}` card on the hub (→ estate People tab), Neighbours tab badge = unread chats + alerts; `ESTATE_REQUEST` notification carries `meta.estate_id`.
- **Funnel CSV** (`GET /api/admin/analytics/funnel.csv?days=`): admin-gated (401/403), `text/csv` with `amass-neighbours-funnel-{d}d-{date}.csv`; sections funnel/attribution/social/moderation mirror the JSON funnel. `nb-admin-export-csv` on `/admin/neighbours` — native: expo-file-system + expo-sharing; web: blob download.
- **Bug fixed** (`social.py`): `connections.pair` (array) had a *unique multikey* index → every user was limited to ONE connection (second request → 500 DuplicateKeyError). Uniqueness moved to string `pair_key`; startup drops the old index + backfills existing rows.
- Tests: `tests/test_neighbours_alerts_nudges.py` 8/8, `tests/test_iteration53_review.py` 9/9, Neighbours suites 34 pass / 1 skip. testing_agent iteration_53 — all green (backend + web UI).
