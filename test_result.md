#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: |
  Productionize AMASS. Phase 1 (current): Two-tier, admin-configurable property
  access charging + wallet safeguards.
    - Tier 1 (property access fee): reveals BASIC property info (exact address,
      all photos, specs, amenities, AI insights) + agent public identity.
    - Tier 2 (agent contact fee): separate disclosed fee that reveals the agent's
      PRIVATE direct contact (phone + email).
    - Fees/period are admin-configurable via app_settings `wallet_pricing`.
    - Disclose fee before charge; no duplicate charge within access window;
      insufficient-balance → no charge + shortfall; auto-refund if agent contact
      cannot be delivered; admin wallet ledger review + manual adjust.

backend:
  - task: "Auth hardening — password reset via email (Resend) + brute-force lockout + enumeration-safe"
    implemented: true
    working: true
    file: "backend/auth_security.py, backend/server.py (login lockout + route registration), backend/.env"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: |
          New module auth_security.py (Emergent managed Resend email per playbook; EMERGENT_EMAIL_KEY +
          EMAIL_FROM_NAME=AMASS in .env). Endpoints:
          POST /api/auth/forgot-password {email} — ALWAYS returns generic 200 (enumeration-safe); if the
            account exists emails a 6-digit code (hashed sha256 at rest, 15-min expiry), resend throttled
            (60s between, 5/hour).
          POST /api/auth/reset-password {email, code, new_password} — verifies code (max 5 attempts),
            sets new bcrypt hash, deletes reset doc, clears login lockout. 400 on invalid/expired, 429 on
            too many attempts.
          server.login now: check_login_locked (429 with wait time) → on failure record_login_failure
            (6 fails/15min → 15-min lock) → on success clear_login_failures. register message friendlier.
          Indexes: password_resets.email unique + TTL, login_attempts.email unique.
          Verified via curl: enumeration-safe (generic for unknown valid email), full reset happy-path
          (DB-injected known code → reset → login with new password), 6-fail lockout → 429.

frontend:
  - task: "Auth UX — Amass→Fixa intro, forgot/reset screen, login/register polish, preserve destination"
    implemented: true
    working: "NA"
    file: "frontend/app/index.tsx, frontend/app/(auth)/login.tsx, frontend/app/(auth)/register.tsx, frontend/app/(auth)/forgot-password.tsx, frontend/src/lib/api.ts, frontend/assets/images/fixa-logo.png"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          Intro: splash shows AMASS emblem first, then (first launch only, flag amass_brand_intro_seen_v1)
          crossfades to the supplied FIXA brand card on its green, Skip always available, never blocks
          access; does not replay after first launch. Verified render on web.
          Login: 'Forgot password?' link (testID forgot-password-link), show-password, autofill, preserves
          ?redirect= destination, friendlier network/lockout errors, success banner after reset (?reset=1).
          Register: inline email/password validation + password hint, autofill/keyboard types, honors
          ?redirect=, friendlier errors. Forgot-password screen (/forgot-password): step 1 request code
          (enumeration-safe generic notice) → step 2 enter code + new password with resend cooldown (60s)
          + expiry guidance → on success routes to login with success banner. api.forgotPassword/resetPassword
          added. Needs frontend E2E verification.


    implemented: true
    working: true
    file: "backend/property_access.py, backend/server.py, backend/app_settings.py, backend/tokens.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: |
          New module property_access.py. Endpoints (prefix /api):
          GET /settings/pricing (public), GET /properties/{id}/access-info (opt auth),
          POST /properties/{id}/access (Tier 1), POST /properties/{id}/reveal-agent (Tier 2),
          GET /admin/wallet/transactions, POST /admin/wallet/{user_id}/adjust.
          app_settings gains `wallet_pricing` (property_access_fee=5, agent_contact_fee=10,
          access_period_days=0, use_per_property_cost, free_amass_sale, privacy_policy_url).
          server.get_property now returns access_cost/agent_contact_cost/agent_unlocked and
          gates agent phone/email behind Tier 2; legacy /properties/unlock still grants both.
          Unique partial index on property_unlocks(user_id,property_id,tier) blocks double-charge.
          Verified via curl: access-info, 403 reveal-before-access, charge 20, idempotent repeat,
          reveal-agent returns contact + charges 10, admin ledger + adjust all OK.


  - task: "Deployment health check"
    implemented: true
    working: true
    file: "n/a"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Ran deployment_agent — surfaced BLOCKER (missing httpx) and 4 WARN items (JWT fallback, http localhost fallback in payments, google maps key in app.json, missing account deletion). All backend blockers now fixed."

  - task: "P0 — Gate POST /api/seed behind admin"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Added require_admin dep + ADMIN_EMAILS allow-list (defaults demo@amass.africa, admin@amass.africa). Split /seed endpoint from internal _do_seed() so on-startup auto-seed still runs. Verified: unauth → 401, demo user with Bearer token → 200."

  - task: "P0 — Remove mock free-money endpoints"
    implemented: true
    working: true
    file: "backend/tokens.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "POST /api/tokens/purchase and POST /api/wallet/fix/purchase now return 410 Gone directing clients to /api/payments/init. Real purchase flow already exists via payments.py webhooks."

  - task: "P0 — Atomic wallet credit/debit with $inc"
    implemented: true
    working: true
    file: "backend/tokens.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "credit() now uses find_one_and_update with $inc. debit() uses conditional filter ($gte on balance/bonus_balance) + $inc, with optimistic retry (3 attempts). Prevents concurrent-write race conditions."

  - task: "P0 — Admin-gate referral qualify & payout"
    implemented: true
    working: true
    file: "backend/property_improvement.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Both /agent-workspace/referrals/{id}/qualify and /payout now require user.is_admin (agents can no longer self-approve their own MASS commissions)."

  - task: "P0 — JWT_SECRET fail-fast"
    implemented: true
    working: true
    file: "backend/server.py, backend/tokens.py, backend/earn_and_tools.py, backend/ads.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Removed hardcoded fallback in all 4 files. Backend now raises RuntimeError at import if JWT_SECRET is missing or <24 chars."

  - task: "Deployment blocker — add httpx to requirements"
    implemented: true
    working: true
    file: "backend/requirements.txt"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Added httpx>=0.27.0 (used by apple_auth.py & payments.py)."

  - task: "Payments — remove insecure http fallback"
    implemented: true
    working: true
    file: "backend/payments.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "_api_base() now requires PUBLIC_API_BASE or EXPO_BACKEND_URL for live payments. Localhost fallback only allowed when MOCK_PAYMENT=true."

  - task: "DB Indexes on startup"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Added idempotent create_index calls on properties, wallets, token_transactions, notifications, users, favorites, marketplace, agent_referrals."

frontend:
  - task: "Dead-link fixes — /property-picker, /improve/project/new, /admin/settings/[section]; FIX leftovers removed from BalanceChip/admin pricing"
    implemented: true
    working: "NA"
    file: "frontend/app/property-picker.tsx, frontend/app/improve/project/new.tsx, frontend/app/admin/settings/[section].tsx, frontend/src/ui/Controls.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          Route scan found 3 dead links (Improve "Start an improvement" → /property-picker, inspection/finance "Start project" →
          /improve/project/new, Admin Settings › Advanced rows → /admin/settings/{duplicate,verification,google,valuation}).
          Built the missing screens. Header wallet chip no longer shows the deleted FIX token. tsc is clean (0 errors).
  - task: "Home Hub — My Home tab + Bills/Records/Items/Repairs/Calendar/Homes (frontend E2E)"
    implemented: true
    working: true
    file: "frontend/app/(tabs)/home.tsx, frontend/app/home/**, frontend/src/components/home/*, frontend/src/lib/homeHub.ts"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          Hub tab + CRUD screens scaffolded last session; this session fixed tsc errors and added
          app/home/calendar.tsx and app/home/homes.tsx. Smoke screenshot of /home renders switcher,
          Next up, This month, tiles. Needs full E2E (add/edit/delete each kind, quick Paid/Done,
          calendar day agenda, home switcher + manage homes).
      - working: true
        agent: "testing"
        comment: |
          iteration_86: every flow passes. Found: repair interval kept at 3 when switching Custom→Monthly (HIGH),
          Bills tile counted repairs, warranty pill said "Paid", nested button in record form, delete handlers
          router.back() without canGoBack. All fixed by main afterwards (FormBits interval reset, per-type
          attention counts from backend, warrantyPill/expiryPill, record form restructure, canGoBack fallbacks).
  - task: "Neighbours removal — no stray routes/links"
    implemented: true
    working: true
    file: "frontend/app/property/[id].tsx, frontend/app/saved-properties.tsx, frontend/app/shop/**, frontend/src/components/notifications/NotificationFeed.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          app/neighbours/* and src/components/neighbours/* deleted; Add-to-list buttons removed; notification
          deep links to /neighbours ignored; verify.tsx new users land on /(tabs)/home.

  - task: "Map filters — status chips + tappable legend listing-type filter (map+list+legend synced)"
    implemented: true
    working: "NA"
    file: "frontend/app/(tabs)/index.tsx, frontend/src/components/MapLegend.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          Added client-side map filters on the already-loaded listings:
          - Status chips (bottom-left, always visible while browsing): Available / Coming soon /
            Sold-Let (testIDs status-chip-available/-coming_soon/-closed). Multi-select toggle;
            active chip fills with the status colour. 'All' reset chip (status-chip-clear).
          - Legend is now interactive (passed selected sets + toggles): tapping a status row or a
            listing-type icon (legend-type-sale/-rent/-shortlet/-lease) toggles that filter, with
            active check + 'Show all pins' reset (legend-reset-btn). Active listing-type filters
            also appear as removable chips in the bottom-left row (kind-chip-*).
          - Derived `visible` = properties filtered by status+kind drives clusters (map), the list
            FlatList + count + empty state, the docked card, and the activeId reset — so map, list
            and legend stay in sync. Empty state offers 'Reset map filters' (map-clear-mapfilters-btn).
          Verified on web: login → map shows the 3 status chips + 'Filter & key' legend chip; controls
          decluttered. Full filter behaviour needs E2E (web markers are placeholders).
    implemented: true
    working: "NA"
    file: "frontend/app/(tabs)/index.tsx, frontend/src/components/PropertyMarker.tsx, frontend/src/components/MapLegend.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          Satellite-only: mapType hardcoded to 'satellite' (pure, per user); removed the
          Standard/Hybrid/Terrain layer toggle + LayerPickerSheet mount, the heatmap overlay
          tool, and the draw-area tool (uncluttered). Right-side controls now only: locate,
          zoom in, zoom out.
          Markers: COLOUR = availability status (available=green / coming_soon=amber /
          closed(sold/let)=slate) derived from real `status`; ICON = listing type
          (sale=pricetag / rent=key / shortlet=bed / lease=document-text). Non-colour cues:
          coming_soon adds a clock glyph, closed strikes through the price + lock glyph.
          Verified/Hot moved to a small corner badge (separate from colour). Selected state =
          dark fill + scale. Clustering (supercluster) preserved; marker tap → docked card →
          property detail (two-tier wallet gate preserved).
          Legend: always-visible 'Map key' chip (shows the 3 status colours inline) → opens a
          full key explaining status colours, listing-type icons, and badges.
          States: centered loading pill, error card with Retry, empty card with Clear filters.
          NOTE: react-native-maps is NATIVE ONLY — satellite imagery + real markers render in a
          dev/standalone build, NOT in web preview or (fully) Expo Go. Web shows a placeholder.


    implemented: true
    working: "NA"
    file: "frontend/app/property/[id].tsx, frontend/src/components/UnlockSheet.tsx, frontend/src/contexts/wallet.tsx, frontend/src/lib/api.ts"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          Property detail: locked banner now explains the access fee reveals BASIC info
          (agent contact is separate). Sticky CTA 'Unlock for N MASS' charges Tier 1
          (accessProperty). After access, agent card shows name/profile + 'Reveal direct
          contact · N MASS' button (Tier 2, revealAgent) → on success shows tappable
          phone/email (tel:/mailto:). In-app 'Chat with Agent' stays free. UnlockSheet
          generalized with mode 'access'|'agent' incl. what-you-unlock list + shortfall +
          'Add funds'. Needs frontend E2E verification.

metadata:
  created_by: "main_agent"
  version: "1.1"
  test_sequence: 2
  run_ui: false

test_plan:
  current_focus:
    - "Full-app regression sweep (iteration 87)"
    - "Dead-link fixes — /property-picker, /improve/project/new, /admin/settings/[section]; FIX leftovers removed from BalanceChip/admin pricing"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: |
      Iteration 88 (to run) — fixes after the iteration-87 full-app sweep: (1) Shop "Start a list" banner → now "Open My Home"
      → /home/items (backend shop.py); (2) auth no longer signs out on 502/network at startup — only on 401; cached profile keeps
      the user signed in; any 401 on an authed call re-checks the session and a dead token → /(auth)/login (SessionWatcher in
      app/_layout.tsx); (3) old notification links /(tabs)/social → /(tabs)/updates; (4) admin/representations ignores placeholder
      media ids; (5) cosmetics: admin Neighbours page title → "Community & moderation", property sticky CTA keeps full "Book
      viewing" label < 400pt, Advanced settings "Reset", project status capitalised, feature-flag rows show On/Off, heart toast
      "Saved", project form no duplicate title, inspection phone pre-filled, offer amount thousands separators, Honda Accord photo,
      FIXA empty state "No <trade> pros yet → Show all pros", CCTV trade mapping. Also removed 358 TEST_* properties / 10 Test sofa
      items / 13 TEST estates from the DB (scripts/cleanup_test_data.py) — Find Home now shows 64 real listings.
  - agent: "main"
    message: |
      Iteration 86 (to run) — HOME HUB frontend (replaces Neighbours). Backend /api/home/* already passes tests/test_home_hub.py.
      New screens: app/(tabs)/home.tsx (hub: switcher, Next up, This month, 6 tiles, + FAB → AddSheet), app/home/{bills,records,
      items,repairs}/{index,new,[id]}.tsx, app/home/calendar.tsx (NEW this session), app/home/homes.tsx (NEW — manage homes:
      add/edit/colour/default/delete with HOME_NOT_EMPTY force confirm). Fixed tsc errors (items/new placeholder quote, outbox.list
      null, FileThumb style, bills footer). Neighbours removed: app/neighbours/*, src/components/neighbours/* deleted (AuthedImage
      moved to src/components/common/), "Add to list" buttons removed from property/saved/shop screens, notification routeFor()
      drops /neighbours links, verify.tsx new users → /(tabs)/home, Social welcome has 2 steps now. Demo user demo@amass.africa /
      amass2026 has seeded homes "Lekki flat" + "Ikeja rental" with bills/items/repairs. Web confirm() used for deletes on web.

  - agent: "main"
    message: |
      PHASE 2 polish — please verify (demo@amass.africa / amass2026; login testIDs:
      login-email, login-password, login-submit-button):
      1) TOP UP & CONTINUE: open a non-free property while logged in with LOW balance
         (use admin adjust to set balance below the access fee), tap 'Unlock for N MASS'
         → sheet shows shortfall + 'Top up & continue' (testID buy-tokens-cta). Tapping it
         routes to /buy-tokens with params returnTo=/property/{id}&unlock=access. After a
         successful (mock) top-up it should router.replace back to the property with
         ?unlock=access and auto-reopen the unlock sheet. NOTE: mock checkout uses
         WebBrowser deep-link which may not complete in web preview — verify the nav params
         + the property-screen auto-open effect (reads `unlock` param) by opening
         /property/{id}?unlock=access directly while access-unlocked=false.
      2) DEAD BUTTONS HIDDEN: login & register no longer show Facebook (Google/Apple remain);
         home search bar has NO mic button (home-voice-btn removed); Earn screen does NOT list
         'identity verify' or 'first review' tasks.
      3) AGENT STATUS CLARITY: become-agent status screen (testID become-agent-status) shows a
         plain-language status banner (testID application-status-banner) + a 3-step tracker
         (Submitted → Under review → Approved) + 'Edit application' ('Update & resubmit' when
         rejected). Backend /api/agents/me now returns rejection_reason + updated_at.
  - agent: "main"
    message: |
      PHASE 1 shipped — two-tier property access charging. Please validate with
      demo@amass.africa / amass2026 (admin). Backend already curl-verified; focus on
      frontend E2E + edge cases:
      1) Open a non-free property detail while logged in → preview shows locked banner
         + sticky 'Unlock for N MASS'. Agent section hidden.
      2) Tap Unlock → sheet discloses access fee + what it unlocks → confirm → basic
         details reveal (address, photos, specs). Agent card now shows name/profile and
         a 'Reveal direct contact · N MASS' button (phone/email NOT yet shown).
      3) Tap 'Reveal direct contact' → sheet discloses agent fee → confirm → phone/email
         appear and are tappable. 'Chat with Agent' works without paying.
      4) Re-open same property → no re-charge (both tiers already unlocked).
      5) Insufficient balance → sheet shows shortfall + 'Add funds' (no charge).
      Known stale backend tests (NOT regressions): tokens/purchase 410 (endpoint removed),
      3 unlock tests depending on it, and one polluted 'Chat Test Duplex' record missing
      latitude.

  - agent: "main"
    message: |
      Phase 4 of the AMASS Agent Ecosystem shipped. New backend module
      `/app/backend/reviews_score_crm.py` adds:

      REVIEWS
        • POST /api/reviews/agent/{agent_user_id}
            {rating:1-5, review_text?, transaction_context?}
            Anti-spam: self-review blocked, must have prior interaction
            (unlocked/inspected/shared one of agent's listings) unless caller
            is admin. Upsert per (reviewer, agent) pair — status: pending.
        • GET  /api/reviews/agent/{slug}    — approved reviews only (public)
        • GET  /api/reviews/mine            — reviewer's own history
        • POST /api/reviews/{id}/report {reason} — 2+ reports auto-flags
        • Admin: GET /api/admin/reviews?status=pending|approved|rejected|flagged
        • Admin: POST /api/admin/reviews/{id}/moderate {action:approve|reject|flag, admin_note?}
            On approve: recomputes agent's rolling rating + reviews_count.

      AGENT SCORE
        • GET /api/agent/score  (auth) — 0-100 with 6 transparent factors:
            profile_completeness (15), listing_quality (25), response_rate (20),
            customer_rating (20), activity (10), deals_closed (10).
            Each factor returns value/weight/weighted/hint so agent can improve.
        • GET /api/agent/{slug}/score  (public)

      ANALYTICS
        • GET /api/agent/analytics?period_days=30 (auth)
          Returns property_views, profile_views, leads, inspection_requests,
          shares_total, shares_by_channel, response_rate, top_property,
          lead_pipeline (counts per status).

      LEAD CRM (extends lead_unlocks in place — no new collection)
        • GET   /api/crm/leads?status=open|new|contacted|inspection_scheduled|negotiating|won|lost
        • PATCH /api/crm/leads/{lead_id} {status?, next_follow_up_at?, last_contact_at?, assigned_to?}
        • POST  /api/crm/leads/{lead_id}/note {text}

      FRONTEND
        • New: /app/frontend/app/agent-score.tsx — full breakdown screen
        • New: /app/frontend/app/crm.tsx — lead pipeline with status filters + detail sheet + notes
        • New: /app/frontend/src/components/AgentScoreCard.tsx — compact card added to agent-dashboard
        • Extended: agent/[slug].tsx — Customer reviews section
        • Extended: agent-dashboard.tsx — "Open the full Leads CRM" CTA at top of leads tab
        • Extended: src/lib/api.ts — 9 new typed methods

      Please validate:

      REVIEWS
      1) Fresh non-admin user (no prior interaction with demo agent) posts
         POST /api/reviews/agent/<demo_user_id> {rating:5} → 403 (guardrail).
      2) Have the user unlock one of demo's properties via
         POST /api/lead-unlock/{property_id} (or use lead_unlocks insert),
         then repeat the review → 201/200 with status "pending".
      3) Self-review (demo reviewing demo) → 400.
      4) Same reviewer sends 2nd review → upserts (single row, not duplicate).
      5) GET /api/reviews/agent/{slug} → returns [] until admin approves.
      6) POST /api/admin/reviews/{id}/moderate {action:"approve"} → 200,
         then GET /api/reviews/agent/{slug} → returns the review.
         Also demo user's agent_applications.rating and reviews_count must
         update (query DB or /api/agent-platform/public/{slug}).
      7) Report review: 2 different users POST /api/reviews/{id}/report
         → status becomes "flagged".
      8) Admin moderate {action:"reject"} → review no longer public.

      SCORE
      9) GET /api/agent/score (as demo) → 200 with score 0-100 and 6 factors.
         Verify sum of `weighted` ≈ score (± 1 rounding).
         `tier` label matches score bracket.
      10) GET /api/agent/{slug}/score (public, no auth) → same shape.
      11) Non-agent user calling /api/agent/score → 404.

      ANALYTICS
      12) GET /api/agent/analytics as demo → 200 with shares_total ≥ 27
          (from Phase 3 test events), shares_by_channel populated,
          lead_pipeline dict with all 6 statuses (0 or positive integers).

      CRM
      13) GET /api/crm/leads (demo) → 200 array (may be empty if no unlocks;
          seed via db.lead_unlocks.insert if needed).
      14) PATCH /api/crm/leads/{id} {status:"contacted"} — verify:
          - responded_at is auto-set on first status change (was absent before)
          - subsequent GET /crm/leads returns status:"contacted"
          - analytics.response_rate ticks up (if you PATCH ALL leads to
            responded)
      15) POST /api/crm/leads/{id}/note {text:"Called back"} → 200,
          crm_notes has 1 entry, last_contact_at updated.
      16) PATCH with invalid status → 400.
      17) Non-owner user PATCH → 403.

      REGRESSION
      18) Sweep: /api/agent-platform/plans, /public/{slug},
          /badge/progress, /subscription/me, /share/property/{id},
          /properties (GET), /properties (POST fresh user).

      Demo credentials: demo@amass.africa / amass2026 (admin via ADMIN_EMAILS)
      Demo agent slug: ada-demo-a8d30c
      MOCK_PAYMENT=true

    - Phase D-4: Duplicate review UI + admin override log (Jun 2026)
      Backend:
      1) GET /api/admin/discovery/candidates/{id}/review — returns candidate,
         highest_score, recommended_action, hydrated matches (with distances,
         listings_count, reps_count, aliases), override_history
      2) POST /api/admin/discovery/candidates/{id}/resolve — actions:
         MERGE (attaches candidate to existing amass_property_id; audit log
         CANDIDATE_MERGED; adds google:place_id to property aliases)
         MARK_RELATED (links candidate.related_amass_property_id; audit log
         CANDIDATE_MARKED_RELATED; candidate stays UNVERIFIED, still
         promotable as its own lead)
         KEEP_SEPARATE (clears duplicate_matches, unlocks promote-as-new)
      3) GET /api/admin/discovery/overrides — filterable by candidate_id,
         amass_property_id, action
      Idempotency: 400 if candidate already promoted_to_amass_property_id set
      Auth: all endpoints require admin
      Test file: /app/backend/tests/test_phase_d4_duplicate_review.py (13/13 pass)

      Frontend:
      Route: /admin/duplicate-review/[candidate_id]
      Also linked from /admin/discovery (new "Pending duplicate review" section)
      Renders: recommendation banner, candidate card, mini-map with candidate
      pin (gold) + up to 5 AMASS pins (red numbered), per-match cards with
      distance/score/reasons/listings/reps and Merge/Related/View buttons,
      global "Keep Separate" button, override history timeline, decision
      modal with optional reason.
  - agent: "main"
    message: |
      PHASE 3 DESIGN-SYSTEM MIGRATION — FULL FRONTEND REGRESSION (Jun 2026)
      ~110 screens/components were migrated from raw <Text>/<TouchableOpacity>/hard-coded
      colors to the src/ui primitives (AppText, Button, Input, Screen, ScreenHeader, Sheet,
      Toast, Chip, Card, EmptyState, Skeleton …) + useTheme(). NO backend/API changes except
      a demo-account delete guard. tsc is now clean (0 errors) and lint has only warnings.
      Also fixed: duplicate api.cancelSubscription key (subscribe.tsx now calls
      cancelTokenSubscription → /subscriptions/cancel), StyleSheet.absoluteFillObject →
      absoluteFill (RN 0.86), showsPointsOfInterests prop rename.
      Login: demo@amass.africa / amass2026 (testIDs login-email, login-password,
      login-submit-button). Demo user is admin + agent.
      Please verify that no functionality broke on the MIGRATED screens (web preview,
      390px viewport): login/register/forgot-password, tabs (home map placeholder, discover,
      market, inbox, profile), wallet, earn, buy-tokens, settings, notifications,
      property/[id] (unlock sheet, contact agent), chat/[conversation_id] (send text),
      marketplace/sell + marketplace/[id] + search + saved, submit-property, become-agent,
      agent-dashboard, agent/onboarding (wizard step nav), agent/tasks, agent/territory,
      agent/representations, crm, agent-score, agent-plans, provider-dashboard, improve hub,
      ads, saved-properties, my-documents, identity-verification, help, about,
      admin/index + admin/discovery + admin/duplicate-queue + admin/settings +
      admin/audit-log + admin/representations + admin/chat-reports, share/[id],
      property-passport/[amass_id]. Report any red-screen, blank screen, broken
      navigation/back button, non-working form submit or missing text.
  - agent: "main"
    message: |
      ROUND 2 — Listing Detail redesign + dark-mode coherence for legacy surfaces (Jun 2026)
      1) /property/[id] fully rewritten on the design system (AppText/Button/Badge/Avatar/Card/
         toasts, theme-aware light+dark). All testIDs preserved: property-details, back-btn,
         share-btn, fav-btn, locked-banner, neighborhood-scores, agent-profile-link,
         agent-contact-revealed, reveal-agent-contact-btn, btn-contact-agent,
         improve-request-inspection, improve-apply-finance, save-btn, chat-agent-btn (share),
         book-tour-btn, unlock-cta-btn, unlock-cta-balance, fullscreen-close.
         NEW behaviour: when the logged-in user OWNS the listing (demo owns all 21 seeded
         properties) the chat/reveal CTAs are replaced by an "own-listing-note" + a
         "Manage listing" primary CTA (testID book-tour-btn) → /agent-dashboard. Use buyer
         tunde.showcase@amass.africa / Showcase2026! to see the buyer CTAs (Chat with Agent · Free,
         Reveal direct contact, Unlock for N MASS → UnlockSheet).
      2) UnlockSheet redesigned (same testIDs unlock-balance-after, unlock-confirm-btn, buy-tokens-cta).
      3) Mechanical theme migration (useLegacyColors + makeStyles) of: (tabs)/index (home map),
         (tabs)/marketplace, admin/duplicate-review, submit-property, become-agent, marketplace/sell,
         agent/onboarding, and components FilterSheet, FilterChip, MapLegend, MapDockedCard,
         NeighborhoodSheet, PropertyCard, MiniPropertyCard, ProductCard, VendorCard, AdModal,
         ClassifiedCard, ProviderCard, BookingSheet, MakeOfferSheet, MarketFilterSheet,
         ImageGallery, CategoryCircle, CategoryTile, SearchThisArea, MapPreviewCarousel,
         HotFlame, TokenIcon, Skeleton, GlassView, PriceText, VoiceComposer, PropertyScoreCard.
         No logic changes — only colour sourcing. Verify these still render + interact in BOTH
         light and dark (Settings → Appearance chips theme-dark / theme-light / theme-system).
      4) Backend: /api/agent/score tz-compare 500 fixed.
  - agent: "main"
    message: |
      ROUND 3 — Phase 4 UX quality bar (Jun 2026)
      - Global OfflineBanner (root layout): testID offline-banner when offline, online-banner for
        ~2.5s after reconnect (Playwright: context.set_offline(True/False) works on web).
      - Market: loading skeleton (market-loading), error state w/ Retry (market-error) when
        /api/marketplace fails; FlatList perf props. Inbox: error state w/ Retry (inbox-error).
      - Alerts → toasts: home save-search ("Search saved" toast with View action; "Nothing to save
        yet" info toast when no filters), contact-agent failure on docked card, GPS unavailable in
        agent onboarding, ProviderCard no-phone/no-WhatsApp, AdModal feedback (toast + closes).
      - a11y roles/labels/states on chip/radio/checkbox/photo pressables in submit-property,
        become-agent, marketplace/sell, agent/onboarding (testIDs unchanged).
  - agent: "main"
    message: |
      PHASE 3.6 — Marketplace sell-side: listing lifecycle, offers, reports, item chat (Jun 2026)
      Backend (marketplace_v2.py + chat.py + server.py; pytest tests/test_marketplace_offers_reports.py 9/9):
      - Listing status: active|paused|sold|removed. GET /api/marketplace feed/search/categories only
        show active; GET /api/marketplace/items/{id} opens sold (status field) but 404s removed;
        sellers/{id} returns active+sold; my-listings returns active/paused/sold + open_offers count.
      - PATCH /api/marketplace/items/{id} (owner: name/description/price/negotiable/status) —
        status=sold auto-declines open offers + notifies buyers; DELETE soft-removes.
      - Offers: POST /items/{id}/offer (blocks own listing 400, sold/paused 409, supersedes buyer's
        previous open offer, notifies seller MARKET_OFFER), GET /offers/received, GET /offers/sent
        (both hydrate `item`), POST /offers/{id}/respond {action accept|decline|counter,
        counter_amount} — seller on sent/countered; buyer may accept/decline a counter; accept
        creates a buyer↔seller chat (kind=marketplace, item_id) and returns conversation_id;
        POST /offers/{id}/withdraw (buyer).
      - Reports: POST /items/{id}/report {reason, details} (dedupe per reporter, 3 open → auto-pause),
        admin GET /api/marketplace/admin/reports?status=OPEN|RESOLVED|ALL,
        POST /admin/reports/{id}/resolve {action dismiss|pause_listing|remove_listing|restore_listing}.
      - Chat: POST /api/chat/conversations/from-item/{item_id} (idempotent, 400 own listing/FIXA);
        conversations now carry `item` preview; NEW_MESSAGE meta.item_id.
      - FIXED pre-existing bug: nested Pydantic models + `from __future__ import annotations` made
        POST /api/marketplace/items return 422 ("query.data missing") — models are module-level now,
        so the Sell flow (/marketplace/sell) actually posts.
      Frontend:
      - NEW /marketplace/my-listings (testIDs my-listings-screen, my-listings-tab-listings|received|sent,
        my-listings-sell, my-listing-{id}, manage-{id} → manage-sheet with manage-view/edit/sold/relist/
        pause/resume/delete, edit-sheet (edit-name/price/description/negotiable/save), delete-sheet
        (delete-confirm), offer-{id} cards with offer-accept/decline/counter/withdraw/chat-{id},
        counter-sheet (counter-amount/counter-submit)). Deep-link ?tab=received|sent.
      - /marketplace/[id]: Chat button now real (action-chat → /chat/{id}); report-listing opens
        report-sheet (report-reason-{scam|prohibited|wrong_category|duplicate|offensive|other},
        report-details, report-submit); owner sees own-listing-note + manage-listing (no contact bar,
        no save/report); sold item shows item-sold-banner + sold-action-bar (browse-similar) instead of
        contact/offer bar; MakeOfferSheet success → toast with "Track offers".
      - Market tab header: market-my-listings-btn (storefront) replaces market-notif-btn.
      - Profile → Services → "My Market Listings" row. Chat thread shows chat-item-card for
        item conversations (+ menu-view-item); inbox preview shows item name · price.
      - Notifications: MARKET_OFFER → /marketplace/my-listings?tab=…; MARKET_MODERATION kind.
      - NEW /admin/market-reports (tile-market-reports on /admin): filters reports-filter-open|resolved,
        market-report-{id} cards with dismiss-/pause-/remove-{id} (+ remove-sheet confirm-remove-listing).
      Seller/buyer for E2E: demo@amass.africa (seller, admin) + register a fresh buyer or use
      tunde.showcase@amass.africa / Showcase2026!. Create a listing via POST /api/marketplace/items
      (fields: name, description≥10, price, category, subcategory, condition, image, images[]).
  - agent: "main"
    message: |
      NEIGHBOURS / SOCIAL PHASE — frontend complete (Jun 2026). Backend: community.py/social.py/
      phone_auth.py/analytics.py already wired (pytest tests/test_neighbours.py 15 pass). New backend:
      POST /api/community/uploads {data_url} → {url:"/api/files/..."} and /api/files auth now allows
      estate managers to read pending residents' proof_url and estate members to read service-request photos.
      Demo (demo@amass.africa / amass2026) is MANAGER of pilot estate "Lekki Gardens Phase 2"
      (id 9a99a06d-c7c3-441c-bc4f-508659f8c7cf). Phone OTP sign-in: any number, code 123456 (mocked).
      New screens (all under /neighbours, reached from the Neighbours tab testIDs nb-quick-friends|
      collections|places|events, nb-estate-{id}, nb-find-estate, nb-ask, nb-report-issue, nb-settings):
      - /neighbours/estates (estates-screen, estates-search, estate-row-{id}, estates-propose →
        request-estate-sheet req-estate-name/city/area/manager/submit)
      - /neighbours/estates/[id] (estate-screen; non-member: estate-join → join-estate-sheet
        join-mode-code|request, join-code-input, join-proof-btn, join-unit-input, join-submit; member:
        estate-tabs Feed/Q&A/Groups/Events/Issues/People, estate-compose → compose-sheet
        compose-type-{question|recommendation|general|notice}, compose-title/body/submit; ask-question;
        group-create → group-sheet group-name/submit, group-toggle-{id}; estate-host-event;
        estate-report-issue, estate-all-issues; People: pending-{id} approve-/reject-/proof-{id},
        member-{id}, manage-{id} → proof-sheet member-make-manager/member-remove; manager estate-code →
        code-sheet estate-join-code/estate-share-code/estate-rotate-code; estate-leave)
      - /neighbours/posts/[id] (post-screen, post-body, post-upvote, reply-input, reply-send, reply-{id},
        accept-{replyId} (asker only), post-menu → post-pin/post-hide/post-delete/post-report)
      - /neighbours/events (events-screen, events-scope-upcoming|mine|past, events-new, event-row-{id})
      - /neighbours/events/new (event-kind-*, event-title, event-day-{n}, event-time-{HHMM},
        event-location, event-audience-estate|connections|public, event-capacity, event-chat, event-submit)
      - /neighbours/events/[id] (event-screen, rsvp-going|maybe|declined, event-chat, event-property →
        /property/{id}?via=estate:…, event-menu → event-cancel (host) / event-report)
      - /neighbours/places (places-screen; web shows list only; places-cat-{cat}, place-row-{id} →
        place-sheet place-recommend (opens note input place-note-input/place-note-submit), place-save →
        add-to-collection-sheet kind=place, place-directions, place-report; places-add → add-place-sheet
        place-name/place-cat-{cat}/place-address/place-note/place-submit)
      - /neighbours/services (services-screen, services-filter-active|done, services-scope-all|mine
        (managers), services-new, sr-row-{id}) · /neighbours/services/new (sr-cat-{cat}, sr-title,
        sr-desc, sr-location, sr-add-photo, sr-urgent, sr-submit → replaces to detail) ·
        /neighbours/services/[id] (service-detail-screen, sr-update-{i} timeline, manager:
        sr-set-acknowledged|in_progress|resolved|closed → sr-update-sheet sr-update-note/confirm,
        sr-find-fixa → /fixa (gated); reporter: sr-close-mine)
      - /neighbours/settings (nb-settings-tab-privacy|recognition, nb-edit-profile → nb-handle/nb-bio/
        nb-profile-save, nb-toggle-handle/contacts/saves, nb-contacts-off|on, unblock-/unmute-{id},
        nb-phone, nb-feedback → nb-feedback-input/send; recognition: rec-points, rec-progress-{key})
      - /neighbours/collections/join/[code] (collection-join-screen, join-collection, join-invalid)
      Property detail hooks: add-to-list-btn (top bar) + social-row with add-to-list-inline → existing
      add-to-collection-sheet (add-to-{collectionId}, new-collection-btn/name/submit). Saved properties
      cards: add-to-list-{propertyId}. Analytics: property_detail_view (arrived_via from ?via=),
      paid_action_start on unlock CTA, payment_completed on unlock; home map marker_tap + impressions.
      Button size "xs" added to the UI kit (previous screens already used it — would have crashed).
      CONVERSION GUARD (must hold): nothing in Neighbours reveals paid property details or agent
      contact; every property tap lands on /property/[id] which keeps UnlockDialog + MASS fee intact.
  - agent: "main"
    message: |
      ADMIN · NEIGHBOURS MODULE (new) + backend test-suite stabilisation.
      Backend: full pytest suite now 734 passed / 4 skipped against localhost (conftest defaults
      EXPO_BACKEND_URL/EXPO_PUBLIC_BACKEND_URL/TEST_BASE_URL to http://localhost:8001; xdist scheduler
      keeps every class of a file on one worker; `restarts_backend` marker auto-skipped when -n>1;
      /api/seed gained ?dry_run=true (admin gate test no longer wipes listings); /agent/properties/mine
      now newest-first). Cockpit dashboard returns pending_estates + open_social_reports.
      Frontend: new /admin/neighbours (testID admin-neighbours; tile-neighbours on /admin). Tabs
      nb-admin-tabs-funnel|estates|reports. Funnel: nb-admin-days-7|30|90, nb-admin-money (nb-admin-paid,
      nb-admin-social-share), nb-admin-steps, nb-admin-attribution (nb-admin-via-{via}), nb-admin-adoption.
      Estates: nb-admin-estates-pending|active|rejected chips, nb-admin-estate-{id} cards with
      nb-admin-approve-{id} (immediate) / nb-admin-reject-{id} (→ nb-admin-confirm sheet,
      nb-admin-confirm-btn / nb-admin-confirm-cancel), empty nb-admin-estates-empty. Reports:
      nb-admin-reports-open|resolved chips, nb-admin-report-{id} with nb-admin-hide-/restore-/ban-/
      dismiss-/open-{id}; ban → confirm sheet. Approve notifies the proposer (ESTATE_APPROVED) and makes
      them an approved resident/manager; estates then appear under /neighbours/estates.
      Seed helpers: POST /api/community/estates/request (any user) creates a pending estate;
      POST /api/social/reports {target_type:"post", target_id, reason:"spam", estate_id} creates a report.
  - agent: "main"
    message: |
      ITERATION 53 — Friend Nudges + Estate Join Alerts + Funnel CSV verified green (backend + web UI).
      Root-caused the failing nudges tests: NOT a Starlette/test-client issue — `connections.pair` is an
      array and its unique index was multikey, so any user could hold only one connection (2nd POST
      /api/social/connections → 500 DuplicateKeyError). Fixed in social.py: `pair_key` string carries
      uniqueness; ensure_social_indexes drops the old `pair_1` unique index and backfills `pair_key`.
      Map marker contract: friends_saved(int) / in_shared_list(bool). Alerts: GET /community/alerts.
      CSV: GET /admin/analytics/funnel.csv?days= (admin only). Frontend testIDs: pin-nudge-{id},
      unlock-friend-nudge, nb-join-alert-{estateId}, nb-admin-export-csv.
  - agent: "main"
    message: |
      SHOP — Instacart-style "Brands" segment of the Market tab (Lagos home-shopping). FIRST TEST PASS.
      Backend /app/backend/shop.py (router prefix /api/shop, optional auth on browse, auth on
      saves/basket): GET /home, /retailers?category=&filter=&q=, /retailers/{slug}, /retailers/{slug}/products,
      /products?category=&q=&brand=&retailer=&sort=&deals=&in_stock=, /products/{id}, /search?q=, /search/suggest?q=,
      /context?ids=, POST /saves/toggle {kind:product|store,target_id}, GET /saves, GET /basket, GET /basket/count,
      POST /basket/items {product_id,qty}, PATCH /basket/items/{product_id} {qty} (0 removes), DELETE
      /basket/retailer/{retailer_id}, POST /basket/retailer/{retailer_id}/handoff {route:website|call|whatsapp,
      product_id?} → {url,label,note} (records shop_handoffs; NEVER creates an order), GET /assets/logos/{name}.png.
      Seeded 7 Lagos retailers (fouani, boconcept, furniture-house, slot, pointek, lagom-sweden, orca-deco[no
      catalogue]) + 101 products; out-of-stock items → 409 on basket add. Baskets are PER RETAILER.
      Frontend: Market tab → segment "Brands" (mkt-tab-brands) now renders ShopHome (testID shop-home):
      category row shop-cat-{key}, filter chips shop-filter-{key}, retailer grid shop-retailer-tile-{slug},
      shop-show-all-stores, banners shop-banner-{key} (+ -cta), sections shop-section-{furnish|deals|popular|
      electronics|new} with product cards shop-product-{id} (open: shop-product-open-{id}; add: shop-add-{id} →
      stepper shop-stepper-{id}/shop-minus-/shop-plus-/shop-qty-{id}), floating shop-basket-pill, header
      shop-saved-btn + shop-basket-btn (badge shop-basket-btn-badge), market-search-bar → /shop/search.
      Screens: /shop/stores (shop-stores-screen, shop-stores-search, shop-stores-cat-{key}, shop-stores-filter-{key},
      shop-retailer-row-{slug}), /shop/store/[slug] (shop-store-screen, shop-store-back/share/save/search/info,
      shop-fulfil-{delivery|pickup|showroom}, shop-promo-{pid}, shop-store-cat-{key}, shop-store-sub-*, shop-store-sort,
      shop-store-route-website/whatsapp/call → shop-handoff-sheet → shop-handoff-confirm/cancel, orca-deco shows
      shop-store-no-catalogue), /shop/product/[id] (shop-product-screen, -back/-add-to-list/-share/-save, -name,
      -price, -promo, -stock, -retailer, -add, -go-basket, shop-product-route-*), /shop/category/[key]?deals=1
      (shop-browse-screen, shop-browse-deals/instock/retailer-{slug}/brand-*/sort, shop-browse-empty),
      /shop/search (shop-search-screen, shop-search-input, shop-suggest-{i}, shop-search-all-stores),
      /shop/basket (shop-basket-screen, shop-basket-group-{slug}, shop-basket-line-{pid}, shop-basket-subtotal-{slug},
      shop-basket-clear-{slug} → shop-basket-clear-sheet/-confirm, shop-basket-route-{slug}-website|call|whatsapp,
      signed-out → shop-basket-signin), /shop/saved (shop-saved-screen, shop-saved-tab-products|stores).
      Shared lists: AddToCollectionSheet now supports kind product|store → "shopping" collections; collections
      create sheet has a Shopping segment (collection-kind-shopping); collection detail renders
      collection-product-{id} / collection-store-{id} rows. Banner "Furnishing together?" →
      /neighbours/collections?create=1&kind=shopping.
      NOTE web: window.open is used for "website" hand-off (new tab) — assert the handoff POST + sheet rather than
      the external page. Expo AdModal may pop on Market after ~3s (tap "Skip"). Demo: demo@amass.africa / amass2026.
  - agent: "main"
    message: |
      NOTIFICATION CENTER + GLOSSY POLISH — FIRST TEST PASS.
      Backend /app/backend/notification_center.py mounted (prefix /api/notifications, auth): GET /center?category=&before=&limit=
      → {items, unread, unread_by_category, categories(catalog), next_before}; GET /unread-count; GET /prefs; PUT /prefs
      {categories:{key:{enabled,frequency}}, quiet_hours:{enabled,start,end}, push_enabled}; POST /push-prompt {status,context};
      POST /{id}/read; POST /read-by-target {target_type: property|conversation|store|category|kind|…, target_id};
      POST /read-all?category=; POST /preview (adds an in-app sample, never pushed); POST /admin/run-matchers (admin).
      Legacy GET /api/notifications + POST /api/notifications/mark-read still work. ALL existing writers (chat, social,
      marketplace, discovery, improvement, agent platform, reviews, representations, unlock/top-up receipts) now go through
      `emit` → user prefs (category off → not stored; digest frequency only for SAVED_SEARCH_MATCH/NEARBY_LISTINGS/
      BRAND_OFFER/MARKET_AD; same unread conversation collapses into ONE row with meta.count; quiet hours mute push only).
      pytest: tests/test_notification_center.py 13/13; regression chat/neighbours/marketplace/agent/reviews/passport green
      (3 pre-existing data-drift failures in agent_platform_phase1 quota + monetization marker keys — unrelated).
      Frontend: /notifications rewritten (testIDs notifications-screen, notif-mark-all, notif-prefs, notif-group-{all|
      messages|property_matches|nearby_listings|brand_offers|marketplace|social|passport|receipts|admin|services},
      notif-list, notif-{id}, notif-load-more, notif-empty, notif-push-offer[native only]); new /notification-preferences
      (notification-preferences-screen, prefs-push-toggle, prefs-open-settings, prefs-quiet-toggle, prefs-quiet-times,
      quiet-start-HHMM / quiet-end-HHMM chips, prefs-cat-{key}, prefs-cat-{key}-toggle, prefs-freq-{key}-{immediate|daily|
      weekly}, prefs-preview); Settings → "Notification preferences" row (settings-notification-preferences). Bell badges on
      Discover (discover-notifications) + Neighbours (nb-notifications) use /unread-count. Read-sync: property detail,
      saved-searches (category property_matches), shop store (store slug), friends (kinds CONNECTION_*), wallet (receipts).
      Push: expo-notifications restored (plugin in app.json, POST_NOTIFICATIONS un-blocked, app.config.js wires
      google-services.json only when present). Contextual prompt sheet (push-prompt-sheet, push-prompt-allow,
      push-prompt-later) fires only after: save search (home map bookmark), save a store, send a friend request, tapping
      the centre's offer card, or the preferences toggle — NEVER on launch; on WEB it is unsupported (no sheet; toggle
      shows an info toast). Glossy: AmassLogo uses amass-emblem-glossy.png (red→crimson + highlight), Button variant
      "brand" is a gradient pill, Gloss sheen on wallet/profile heroes, Screen fade-and-lift on open, useBounceRefresh
      (brand-tinted spinner + settle bounce) on Discover/Market/Neighbours/Wallet/Notifications. Demo:
      demo@amass.africa / amass2026 (966+ unread seeded by earlier tests — fine).
  - agent: "main"
    message: |
      GLOSSY BRAND REFRESH (Corner-inspired) + WELCOME FLOW — FIRST TEST PASS. Frontend only.
      Brand: new source-of-truth artwork (AMASS LOGO 6) → assets/images/amass-lockup.png (pin+house+AMASS wordmark, transparent,
      glossy red→crimson pin), amass-emblem-glossy.png, amass-wordmark.png, FIXA PRO cut-outs fixa-pro-lockup.png / fixa-hat.png.
      AmassLogo: showWordmark → renders the full lockup IMAGE (testID amass-logo-lockup); emblem-only unchanged (amass-logo-emblem).
      Splash "/" (splash-screen): AMASS moment (amass-brand-moment, splash-amass-lockup, tagline) ~2s → FIXA moment
      (fixa-brand-moment: green gradient + white card with FIXA PRO) ~2s → routes to /onboarding (signed out) or /(tabs).
      brand-skip always visible. Onboarding (/onboarding, onboarding-screen): 5 slides — 0 AMASS (sky, floating lockup on frosted
      glass onboarding-amass-lockup, tilted home tiles), 1 FIXA (onboarding-fixa-lockup, service chips, green "Continue"),
      2 verified, 3 tokens (bullets), 4 AI/brands. testIDs onboarding-title-{i}, onboarding-next (brand gradient on slide 0,
      fix gradient on slide 1, ink after), onboarding-skip, onboarding-signin → /login. Parallax + floating bob + stagger;
      reduced-motion disables them. Button: brand/fix gradient fills + sheen on primary; selected Chips get a sheen.
      Login/register/forgot/phone/about now show the lockup. Demo: demo@amass.africa / amass2026.
  - agent: "main"
    message: |
      AGENT BOOST TOOLS + LISTING STORIES — first test pass (backend + frontend).
      Backend new module /app/backend/promotions.py (router registered in server.py): GET /api/agent/promotions/config
      (tiers promote 20 MASS/7d · feature 50/14d · boost 100/30d — admin-editable via GET/PATCH /api/admin/promotions/config,
      prices must step up else 422), GET /api/agent/promotions/placements, GET /api/agent/promotions/preview/{property_id}
      (owner/admin only → balance, balance_after/affordable per tier, reach: views_30d, city_seekers_30d, matched_buyers,
      competing_listings, current_rank, estimated_views; active promotion), POST /api/agent/promote {property_id, tier}
      (owner only; debits MASS; same tier while active EXTENDS expiry; boost → BOOSTED_LISTING notifications to buyers with
      matching saved searches via notification_center.emit; writes `promotions` history), GET /api/agent/promotions/mine.
      Placements are REAL: /api/properties returns active promotions first (boost>feature>promote), /api/map/markers adds
      promotion_tier, /api/properties/{id} + /api/agent/listings carry `promotion {tier, expires_at, days_left}` (null when
      expired). Story kit: GET /api/share/property/{id}/story (auth; owner/admin/unlocked buyer, else 403 {error:"locked"});
      share channels "story" / "story_series" accepted by POST /share/property/{id}/event.
      pytest tests/test_promotions_and_stories.py 13/13; test_earn_agent_ads + test_share_routes 44/44 still green.
      Frontend: NEW /agent/boost/[id] (boost-screen; boost-listing; boost-tier-{promote|feature|boost}; boost-perk;
      placement-{results|featured|map|alerts} chips (locked ones carry -locked suffix + info toast); preview-{placement}
      phone mock with mock-hero-row / mock-featured-card / mock-boost-pin / mock-alert; reach-views/rank/buyers/seekers;
      boost-includes; sticky boost-cost + boost-balance-line + boost-activate (or boost-topup) → ChargeConfirm
      (boost-confirm, charge-confirm-btn, charge-balance-after) → boost-success panel (success-discover/map/listing/done);
      boost-active-banner when a promotion is live). NEW /share/story/[id] (story-screen; story-slides horizontal paging with
      story-slide-{cover|gallery|details}; story-slide-label; story-post → captures PNG 1080×1920 via react-native-view-shot and
      hands it to expo-sharing (on WEB: info toast + caption copied — capture/share is native only); story-post-series;
      story-copy-caption; story-error with "View listing" when locked). Entry points: /share/[id] gets a brand gradient
      card share-story-entry; property detail owner sticky bar gets boost-listing-btn (rocket IconButton) + detail-promo-badge;
      agent dashboard: Overview "Boosts" card (boosts-card, boosts-cta, active-boost-{id}, boosts-view-all), listing rows
      show PromotionBadge and the boost-{id} pill (label "Extend" when live) now routes to /agent/boost/{id} (old BoostSheet
      removed). ListingCard shows promo-label-{tier} frosted gold label; Discover featured rail puts feature/boost first;
      home map pins with boost get a gold ring + rocket (testID pin-boosted-{id}, native map only). Admin → Monetization →
      Config tab gets "Agent boost tiers" section (cfg-boost-{tier}-tokens/days, cfg-boost-save).
      Demo agent demo@amass.africa / amass2026 owns listing 7d769d80-fdf8-4778-932a-f938aa3c27cf (Palatial Ocean-View Duplex)
      with 12k+ MASS. Note: activating a promotion on the demo listing is a real MASS debit and makes it promoted-first.
  - agent: "main"
    message: |
      SHOP (Brands) INSTACART-ENERGY VISUAL REFRESH — first test pass. FRONTEND ONLY, no backend / route / testID changes.
      Files: src/components/shop/{shopTheme.ts (new), ShopBits.tsx, ShopHome.tsx, ShopProductCard.tsx, RetailerCards.tsx,
      RetailerLogo.tsx}, app/shop/{stores,search,basket}.tsx, app/shop/store/[slug].tsx, app/shop/category/[key].tsx,
      app/shop/product/[id].tsx. What changed visually: vivid per-category tinted tiles (shop-cat-{key}), white ShopChip filter
      pills (shop-filter-{key}; Offers = yellow when selected), retailer logo tiles with yellow deal tags (shop-retailer-tile-{slug}),
      brand-red "Show all" circle (shop-show-all-stores), loud banners (yellow deals / red brand gradient / blue info —
      shop-banner-{key}, shop-banner-cta-{key}), bold section headings with red "See all"/"Show all" (shop-see-all-{key},
      shop-show-all-{key}), product cards with big bold price + yellow -N% tag + red promo label + red "+" (shop-add-{id}) →
      red stepper (shop-stepper/minus/plus/qty-{id}), brand-red floating basket bar (shop-basket-pill), store page brand-coloured
      hero with white ShopSearchField (shop-store-search is now a plain TextInput, clear = shop-store-search-clear), white
      fulfilment track with ink active pill (shop-fulfil-*), "Deals at X" rail (shop-promo-{id}), ShopChip category/sub chips
      (shop-store-cat-*, shop-store-sub-*), "Buy from X" card with red gradient "Shop at X" (shop-store-route-website) +
      WhatsApp/Call. Product page: white gallery, bold title/price, yellow -N% + red promo label, "Add to basket" = red gradient
      (shop-product-add), Basket button (shop-product-go-basket). Basket groups: bordered white cards, bold subtotal, red
      "Shop at X" (shop-basket-route-{slug}-website) → hand-off sheet (shop-handoff-sheet / shop-handoff-confirm /
      shop-handoff-cancel). Search: ShopSearchField shop-search-input, ShopChip suggestions shop-suggest-{i}.
      Dark mode supported (toggle on Profile: theme-toggle). Demo: demo@amass.africa / amass2026. The Market tab shows a
      Sponsored AdModal on open — dismiss via ad-close / ad-skip.
  - agent: "main"
    message: |
      SOCIAL TAB (Nextdoor-inspired, FIXA-themed) — replaces Discover. First test pass. Backend NEW backend/social_feed.py
      (router /api/social/*): GET /social/posts/meta, GET /social/feed?scope=estate|area|city&kind=give|sell&category&q&cursor,
      GET /social/posts/mine, POST /social/posts, GET/PATCH/DELETE /social/posts/{id} (PATCH accepts status active|reserved|gone|paused),
      POST /social/posts/{id}/like (toggle), GET/POST /social/posts/{id}/comments, DELETE .../comments/{cid},
      POST /social/posts/{id}/contact {channel: chat|whatsapp|phone, message} → chat returns conversation_id,
      POST/DELETE /social/posts/{id}/hide, POST /social/posts/{id}/report, POST /social/posts/uploads {data_url} → public URL.
      Seeded ~19 demo posts (backend/social_feed_seed.py); demo user owns 3 (2 active, 1 gone).
      Frontend: tab "social" (testID tab-social) replaces discover; (tabs)/social.tsx (social-screen; header social-scope-btn →
      social-scope-sheet with social-scope-{estate|area|city}; social-inbox; social-notifications; social-mine-btn → /social/mine;
      social-search; welcome card social-welcome (+ social-welcome-dismiss, social-step-*); chips social-kind-{give|sell},
      social-cat-{key}; cards social-post-{id} with social-post-author-{id} / social-post-open-{id} → /social/post/{id},
      social-like-{id}, social-reply-{id}, social-share-{id}, social-more-{id} / social-post-more-{id} → PostMenuSheet
      (social-post-menu: viewer = social-menu-share/hide/report; owner = social-menu-edit/gone/reserved/pause/resume/delete →
      social-delete-sheet social-delete-confirm); social-fab → /social/compose; states social-loading/social-empty/social-error).
      /social/post/[id] (social-post-screen; social-post-back/share/menu; social-post-title/body/author; social-post-like;
      social-post-replies; social-reply-input + social-reply-send; social-comment-{id} (+ social-comment-remove-{id});
      social-similar-{id}; sticky bar social-post-bar with social-post-contact (viewer → ContactSheet social-contact-sheet:
      social-quick-{i} quick messages, social-contact-text + social-contact-send → /chat/{conversation_id}, social-contact-whatsapp/
      phone, social-contact-cancel) or social-post-manage (owner → menu)).
      /social/compose (?id= edits) (social-compose-screen; social-compose-cancel; social-compose-submit (header) and
      social-compose-submit-bottom; social-compose-add-photos (system picker → base64 → /social/posts/uploads);
      social-compose-kind-{give|sell}; social-compose-price (sell only) + social-compose-negotiable; social-compose-title/body;
      rows social-compose-category → social-category-sheet social-category-{key}; social-compose-condition → social-condition-{key};
      social-compose-visibility → social-visibility-{estate|area|city}; toggles social-compose-contact-chat/whatsapp/phone;
      social-compose-pickup; social-compose-crosslist (sell only). On success → router.replace(/social/post/{id}) + toast.
      /social/mine (social-mine-screen; social-mine-back; social-mine-new; social-mine-stats; social-mine-filter-{all|active|
      reserved|gone|paused}; same PostCard + menu). Web: photo upload via file chooser — can be skipped. Demo demo@amass.africa / amass2026.
  - agent: "main"
    message: |
      NEARBY ALERTS (Social) — first test pass. Follow Social categories → notified when a neighbour posts a FREE item (kind=give)
      that is visible to you (same estate / area / city as the post's visibility). Backend (backend/social_feed.py):
      GET /api/social/alerts → {categories[{key,label,icon,color,following,nearby_free}], following[], prefs{enabled,frequency,push_enabled,push_status},
      scope_label, scopes, alerts_7d}; PUT /api/social/alerts {categories:[...]} replaces the set (422 on unknown key);
      POST /api/social/alerts/toggle {category} → same payload + {toggled, now_following}. Following re-enables the notification
      category `nearby_free` if it was off. POST /api/social/posts (kind=give) now returns `alerted` = number of nearby followers
      and fans out SOCIAL_NEARBY_FREE notifications (category nearby_free, action_url /social/post/{id}) in a background task
      (poll /api/notifications/center?category=nearby_free for ~2s). Author + blocked users never alerted; sell posts never alert;
      frequency daily/weekly → queued for digest instead of instant. Collection social_category_follows. Pytest:
      backend/tests/test_social_nearby_alerts.py 11/11 green.
      Frontend: NEW /social/alerts (social-alerts-screen; social-alerts-back; hero social-alerts-hero; stats social-alerts-stats
      (only when following>0 or alerts_7d>0); tile grid social-alerts-grid with Tile social-alert-tile-{key} (tap = follow/unfollow,
      selected = filled, badge = free items available now); frequency social-alerts-frequency with SegmentedControl
      social-alerts-freq-{immediate|daily|weekly} (saves to /notifications/prefs categories.nearby_free); phone card social-alerts-phone
      (+ social-alerts-phone-btn: web → info toast; native → contextual push prompt); social-alerts-prefs-link → /notification-preferences;
      error state social-alerts-error). First-ever follow fires a confetti celebration (celebration-overlay).
      Social tab (tabs)/social.tsx: strip social-alerts-strip under the chips (no category selected) → /social/alerts; shows
      "Hear first about free items" (none followed) or "Nearby alerts on · N categories" + followed-category icon dots.
      When a category chip (social-cat-{key}) is selected the strip is replaced by a bell pill social-alert-toggle ("Alert me" /
      "Alerts on") that toggles following for that category (toast with "Manage" action). Empty feed with a non-followed category
      selected: EmptyState primary action = "Alert me when one's posted" (follows), secondary = "Share an item".
      Compose success toast now says "N neighbours following X got a nudge" when alerted>0.
      Notification preferences now lists the "Free items nearby" category (prefs-cat-nearby_free, with Instant/Daily/Weekly).
      Demo demo@amass.africa / amass2026 (member of Lekki Gardens Phase 2; currently follows furniture + kitchen from smoke test).
  - agent: "main"
    message: |
      MAP / HOME / PROPERTY PASSPORT REDESIGN — first test pass. Home tab (tabs)/index.tsx rebuilt: satellite ("hybrid") map,
      nearby-first open (~2 km), picture-rich PhotoMarker pins (disc photo + price pill; locked = blurred + gold lock, approx
      location), ClusterDisc (tap zooms in), compact PreviewTile docked above the sheet on marker tap, Zillow-style HomesSheet
      (@gorhom/bottom-sheet; header "N homes here", HomeTile photo-led cards). MASS/FIX balance chips REMOVED from Home chrome
      only (wallet logic untouched; "Get MASS" banner still appears when the viewer has 0 MASS). Money path unchanged:
      locked → "Unlock · N MASS" → UnlockDialog (ChargeConfirm) → /property/{id}; 0 MASS → "Get MASS" → /buy-tokens.
      Backend: GET /api/map/markers now returns teaser fields (title, price, listing_type, cover, bedrooms, bathrooms, size_sqm,
      city, place, status, access_cost, is_free_amass_sale). GET /api/properties/{id} locked preview now returns the SAME
      jittered approximate lat/lng as the marker (+ approx:true, image_count) and tolerates docs missing bedrooms/title (was 500).
      Web stand-in map (src/lib/map.web.tsx) now projects markers by lat/lng into the current region so pins/clusters sit on the
      map in the browser; zoom FABs (fab-zoom-in/out), fab-locate, backdrop tap (web-map-backdrop) deselects.
      testIDs — Home: home-map-screen, home-search-input, open-filter-sheet, home-ai-btn, save-search-btn, fab-locate,
      fab-zoom-in, fab-zoom-out, pin-{id} / pin-boosted-{id}, preview-tile-{id}, preview-open-{id} (→ detail), preview-primary-{id}
      (View home / Unlock · N MASS / Get MASS to unlock), preview-save-{id}, preview-close, homes-sheet-header, homes-sheet-title,
      homes-sheet-list, home-tile-{id}, home-tile-open-{id}, home-tile-primary-{id}, home-tile-save-{id}, home-tile-heart-{id},
      explore-wider-btn / explore-wider-pill, get-mass-banner + get-mass-btn (0-MASS viewers only), map-status-loading/error/empty,
      map-clear-filters-btn. Greeting pill home-greeting shows ~6 s. NOTE: on web the bottom sheet cannot be dragged; tiles are
      still in the DOM (scroll inside homes-sheet-list) — opening the sheet by drag is native-only.
      Property Passport /property/[id]: taller photo hero (~58% screen), frosted circle buttons (back-btn, add-to-list-btn,
      share-btn, fav-btn), hero-kind-label, hero-locked-photos ("+N photos · unlock") when locked, 44px price, bold inline
      specs (specs-inline), address-revealed / address-approx, locked-banner, about-locked-hint, section headings h2,
      mini map mini-map-exact / mini-map-approx (approx = ~200 m circle + locked pin), sticky unlock-cta-btn unchanged.
      Accounts: demo@amass.africa / amass2026 (owns/unlocked everything → all pins unlocked, "View home");
      fixa.tester+15339@amass.africa / Fixa2026! (300 MASS welcome bonus, nothing unlocked → locked pins, "Unlock · 1,200 MASS").
      Do NOT actually confirm a paid unlock on the fixa tester unless needed (it spends MASS); if you do, note the charge.
  - agent: "main"
    message: |
      REDESIGN — fixes after iteration_63: (1) search bar tint overlays are pointerEvents=none + input/buttons zIndex 1 → input
      focusable, text visible (light+dark); (2) searchInput minWidth:0 → filter button no longer clipped when the bookmark shows;
      new clear button home-search-clear; (3) typing is debounced 500 ms into the marker request, Enter commits once (no duplicate);
      (4) after a search / filter change the map flies to the results when none are in view (fitToPins) — first load stays
      nearby-first. Minor: image onError fallback icon on PhotoMarker / PreviewTile / HomeTile; locked detail uses `image` field
      as cover + image_count; ScorePill label no longer wraps; copy says ~150 m; UnlockDialog fund button label "Get MASS".
      Retest only: search input focus/typing (1 request per pause), Enter, clear, filter chips flying to results, filter button
      visible with bookmark, dark mode search text; quick regression on pin → preview → passport (demo) and locked flow (fixa tester).
  - agent: "main"
    message: |
      AGENT TOOLS DEEP DIVE + DOCUMENTS & KYC — first test pass (backend + frontend).
      Backend (already compiled, now wired): GET /api/agent/manager {summary{listings,active,boosted,views_30d,saves,leads_30d,
      leads_total,docs_pending,docs_missing}, listings[{id,title,cover,photo_count,price,status,promotion,boost_active,boost_tier,
      boost_days_left,views_total,views_30d,saves,leads{chats,unlocks,inspections,total,total_30d},documents_status,documents_verified,
      verified_documents,documents_pending}]}; GET /api/agent/listings/{id}/leads (chats · MASS unlocks · inspections, owner/admin only → 403 otherwise);
      PATCH /api/agent/listings/{id}/status {status: available|coming_soon|sold|withdrawn}. KYC: GET /api/kyc/me; POST /api/kyc/identity
      {id_type, id_document(dataURL), selfie(dataURL), id_number_last4?} → 409 if already pending/approved; GET/POST/DELETE
      /api/properties/{id}/documents (owner uploads title docs as data URL; non-owner gets file-free summary + documents:[]);
      admin: GET /api/admin/kyc/queue?status=pending|approved|rejected, POST /api/admin/kyc/identity/{user_id}/review {approve, reason?}
      (reason REQUIRED when rejecting → 422), POST /api/admin/kyc/documents/{doc_id}/review. Approving a doc stamps
      properties.documents_verified/documents_status/verified_document_kinds → shows on GET /properties/{id} (documents_verified,
      verified_documents, agent_identity_verified), /map/markers (documents_verified) and agent-platform public profile (identity_verified).
      Admin cockpit dashboard now returns kyc_identity_pending / kyc_documents_pending.
      Frontend screens/testIDs:
      • /agent-dashboard: stat-views, stat-leads, stat-saves, stat-docs (→ listings tab filtered), trust-card + trust-cta
        (→ /identity-verification when not verified), boosts-card, recent-view-all; Listings tab: listing-filters with
        listing-filter-{all|active|boosted|needs-docs|closed}; rows listing-{id} (listing-open-{id} → /agent/listing/{id}),
        listing-status-badge-{id}, listing-docs-badge-{id}, actions listing-leads-{id}, listing-docs-{id}, boost-{id}, listing-status-{id}
        → Sheet dash-status-sheet with dash-status-opt-{available|coming_soon|sold|withdrawn} (PATCH + toast + row badge updates).
      • /agent/listing/{id}?tab=leads|docs: manage-header, manage-status-badge, manage-change-status (status-sheet, status-opt-*,
        sold/withdrawn need confirm: status-confirm → status-confirm-yes), manage-boost, manage-tab-leads / manage-tab-docs,
        manage-stat-chats/unlocks/inspections, lead-{id} rows (chat → /chat/{conv}), manage-leads-empty; Documents: docs-summary,
        docs-upload-btn → upload-doc-sheet (doc-kind-{kind}, doc-title, doc-file + doc-file-library picker (web: file input),
        doc-submit disabled until a photo is chosen), doc-{id} rows with status badge, doc-remove-{id} → doc-delete-confirm → doc-delete-yes
        (approved docs have no remove button). /agent/listing-docs/{id} redirects to the docs tab (notification deep link).
      • /identity-verification: idv-hero, idv-hero-title, idv-status-badge, idv-step-{i} (+ idv-step-cta-2 opens form), idv-cta,
        idv-form: idv-type-{nin|drivers_licence|passport|voters_card}, idv-last4, idv-id (idv-id-library), idv-selfie (idv-selfie-library;
        camera button hidden on web), idv-submit disabled until both photos, idv-cancel; after submit → idv-submitted card, hero
        "Documents under review", status badge "Under review"; rejected → idv-resubmit.
      • /admin/kyc (admin only, tile tile-kyc on /admin): kyc-stat-identity, kyc-stat-docs, kyc-tab-identity / kyc-tab-documents,
        kyc-filter-{pending|approved|rejected}, rows kyc-identity-{user_id} / kyc-doc-{id} → kyc-review-sheet with kyc-shot-id /
        kyc-shot-selfie / kyc-shot-doc (authed images), kyc-approve, kyc-reject (first tap reveals kyc-reason, second tap confirms;
        disabled until ≥3 chars), kyc-reject-back, kyc-open-profile / kyc-open-listing.
      • /property/{id}: docs-verified-badge + docs-verified-row when documents_verified; owner sees docs-upload-nudge (→ docs tab)
        when not verified; agent card shows agent-identity-badge or agent-identity-unverified; "Manage" (book-tour-btn for owners)
        now opens /agent/listing/{id}. Map tiles: home-tile-docs-{id} frosted "Title docs ✓" label; PreviewTile shows the same tag.
      • Profile: badge-identity ("ID verified") when user.identity_verified; "Verify ID" step now tracks identity_verified.
      Photo pickers on web open a native file chooser (set_input_files on input[type=file] works); submit with a tiny PNG data URL via
      API is fine too. Smoke data: demo's listing 3998e99b-80f9-4ce1-b04e-6f16c4feae01 already has one APPROVED "Survey plan" doc
      (documents_verified=true) → badges visible on /property/… and the Ikeja map tile.
      Accounts: demo@amass.africa / amass2026 (admin + agent, 9 listings; KYC status none → good for submit + admin approve flow).
      Other agents: adaeze.okoye@amass.africa / Agent2026! etc. (see /app/memory/test_credentials.md). PhotoPager swipe on map tiles
      verified manually on web (counter 1/3 → 2/3 on horizontal scroll).

  - agent: "main"
    message: |
      Iteration 66 — Floating pill tab bar + Updates tab (frontend only). testing_agent: all flows pass (tabs routing ×3, badges 23/32,
      Updates header/segments/deep links, Nearby feed, AMASS branding on /social/*, nothing hidden under the pill, /notifications still OK).
      Follow-ups fixed after the report: 320 px label shrink, aria-selected on tabs, NotificationFeed capped to the 720 px header column on tablets.
      Theme gained `colors.brandText`. Marketplace FIXA services section intentionally untouched (separate product).

  - agent: "main"
    message: |
      Iterations 67–68 — Notifications deep dive. Backend: per-category push/email channels, opt-in email digest (daily/weekly/hour,
      hourly flush, test-send with cooldown, signed unsubscribe), soft dismiss/restore, mark-unread, dismiss-read, unread_only + read_count.
      pytest tests/test_notification_read_state_digest.py (11) + test_notification_center.py (13) green. Frontend: Unread filter chip,
      swipe → read/unread · ← dismiss with Undo, Clear read, email summary card + channel chips in preferences, instant badge refresh.
      iteration_67 found slow-swipe navigation/double-count/badge lag → fixed; iteration_68 all pass. Test inbox delivered@resend.dev / Digest2026!.

  - agent: "main"
    message: |
      Iterations 69–71 — Global typography overhaul (frontend only). Larger/bolder type scale (tokens.ts typeScale + constants/theme typography),
      AppText maxFontSizeMultiplier 1.35, Button label shrink, Badge shrink, shop price auto-fit, ≤360 px guards (passport sticky bar, hero chips,
      ScorePills 2×2, HomeTile actions, Updates/Neighbours headers, tab labels, Market location pill, onboarding hero reserve + scrolling bullets,
      become-agent stacked buttons, friends row ScrollView). iteration_69 found 4 HIGH/4 MED → fixed; iteration_70 residuals → fixed; iteration_71:
      10/11 pass, shop/search 1-column at 320 (card minWidth 140 > 138) → minWidth 120 fixed + LOW copy trims. Profile Unlocked tile now uses
      /unlocks/mine count (matches /unlocks screen). "Chat · Free" variant could not be reached without spending MASS (same layout as "Manage").

  - agent: "main"
    message: |
      Iteration 72 — Expo SDK 57 → 58 upgrade (RN 0.88, React 19.3, expo-router 58, RNGH 3.3, reanimated 4.7). TS migrations: FlatList
      header/footer/empty null→undefined, instance ref types, StatusBar prop removals, legacy expo-file-system → File API. Testing agent found
      and fixed the custom tab bar crash (expo-router 58 tabBar props: emitter/navigateToTab instead of navigation). All smoke flows pass on web.

  - agent: "main"
    message: |
      Iterations 79–80 — Find Home map layout verification (frontend only). regionFor() fits results into the clear band between the
      chrome and the pill/card with side margins + aspect-correct deltas (fitToPins + Explore wider); in-view count now derived from DRAWN
      clusters/pins (per-pin label width); Explore-wider pill at 0-in-view regardless of zoom; cluster tap centres in band; filter sheets
      (Find Home + Market) got bounded heights so Apply is on screen; Market price inputs minWidth 0. Unused components removed.
      iteration_80: all fixes pass; remaining LOW items accepted (no re-fit when pins already visible, pins behind FAB column).

  - agent: "main"
    message: |
      Iterations 81–82 — Money Rain overlay (src/ui/MoneyRain.tsx) + preview-card unlock hooks + /map/markers hook fields.
      Triggers: pin tap (brief, once/selection), property open from lists (brief, after load, skipped with ?rained=1), confirmed
      unlock (subtle), MASS purchase paid (celebrate, once per ref persisted), offer/finance/inspection/booking (subtle),
      checkout + finance approved (celebrate). Testing agent found: reduced-motion notes built before the setting resolved
      (→ Reanimated sync hook) and Reanimated skipping the fade under reduce-motion (→ ReduceMotion.Never), rain on
      not-found property (→ rain after load + catch), callback repeat (→ rainOncePersisted) — all fixed. Demo account has
      test offers/orders/finance/inspection docs prefixed "TEST" from the agent runs.

  - agent: "main"
    message: |
      Iteration 84 (to run) — (1) Viewing hardening after iteration_83: /viewings/{id}/complete → 409 while the slot is in the future;
      _transition precondition {status, awaiting} → 409 on races; availability hours validated 00:00–23:59 + no same-day overlaps.
      tests/test_viewings.py 6/6. (2) NEW map time + tile-only gate (user rule): 0 MASS → GET /api/map/markers returns markers:[] +
      access:false + map_time; with MASS the first markers call / heartbeat buys 60 min of map time for 1 MASS (wallet ledger
      spend_feature feature_key=map_time), later hours charged automatically while heartbeats keep coming (≤150 s apart);
      POST /api/map/time/tick (heartbeat, 60 s from the Find Home tab), GET /api/map/time (read-only). Admin config
      map_hour_mass (0 = free map). Frontend: map-gate card + Get MASS, map-time-chip "N min", toasts + subtle rain on charge,
      locked PreviewCard photo/details taps open the UnlockDialog instead of /property/[id]. Test users: zeromass@amass-qa.africa /
      Zero2026!x (0 MASS), demo@amass.africa / amass2026 (15k MASS). tests/test_map_time.py 3/3. Stale pre-existing failure:
      tests/test_review_map_monetization.py::test_map_markers_requires_auth_and_shape (asserts the old 8-key marker shape).

  - agent: "main"
    message: |
      Iteration 84 results → fixes: (1) map-time double charge under parallel heartbeats → MapTimeMeter now CLAIMS the hour with a
      conditional update keyed on hours_charged before debiting (loser reports the winner's state, charged_now false); the final write
      only touches used_seconds/last_tick_at. tests/test_map_time.py::test_parallel_heartbeats_buy_the_hour_once (6 parallel → 1 charge,
      twice). (2) duplicate viewing requests under parallel POST /viewings → partial unique index uniq_open_viewing_per_home
      (buyer_id, property_id, status in open) + DuplicateKeyError → 409; pre-existing duplicates auto-cancelled at boot.
      tests/test_viewings_race_iter83.py passes again. (3) Gate card moved into the bottom band (no overlap with the FAB column);
      map-time-chip 44 pt tall. Request: retest races + gate layout only.

  - agent: "main"
    message: |
      Iteration 90 (to run) — fixes for the iteration_89 leftovers, code only (user chose to keep demo's seeded test rows):
      (1) GET /api/crm/leads?status=new now matches leads with no crm_status (fresh unlocks) — reviews_score_crm.py.
      (2) Retired Neighbours notification kinds (ESTATE_*, CONNECTION_*, COLLECTION_*, POST_REPLY, QUESTION_*/ANSWER_ACCEPTED,
      EVENT_*, SERVICE_REQUEST*) are excluded from /notifications/center, unread counts, read_count and the digest total
      (LEGACY_KINDS in notification_center.py, folded into LIVE). test_notification_center::test_social_request_notification_routed
      rewritten to assert the hidden behaviour.
      (3) /api/agent/representations/mine drops reps whose properties_geo record no longer exists.
      (4) Find Home: the IntentSheet is suppressed when the tab opens with ai_filters (saved search "Run now"), so Rent/beds stay applied.
      (5) FIXA row + mini-card Call/WhatsApp buttons 44×44; admin flag label "Google Places".
      (6) tests/test_phase4_reviews_score_crm.py and tests/test_phase6c_passport_reps.py now tear down what they seed on demo.

  - agent: "main"
    message: |
      Iteration 90 result: all 7 pass. Follow-ups applied: Run now hand-off now fits the map to the results (firstLoadRef reset in the
      ai_filters effect; verified by screenshot "8 homes in view", no IntentSheet); legacy GET /api/notifications in property_improvement.py
      applies the LIVE/LEGACY_KINDS rules. Accepted LOW: reps list capped at 200 (demo test data only), file sizes.

  - agent: "main"
    message: |
      Iteration 91 (to run) — two features. (A) FIXA work photos: ApplyIn.work_photos (≤5, deduped) stored on the provider doc
      (`work_photos`, merged into `images`), returned by provider_full; join form (WorkPhotosPicker, multi-select via socialUpload,
      tap to remove) + public profile swipeable gallery (WorkPhotosGallery, dots + "n / N" counter) + My FIXA "Work photos · n/5" row.
      (B) Agency teams (backend agency_teams.py, /api/agency/* + /api/admin/agencies): only admins create agencies (name + owner email);
      owner/managers invite by email (existing user → AGENCY_INVITE notification + email; unknown email → bound to the account at
      first /agency/me after sign-up); accept/decline in-app; roles owner/manager/agent; team CRM pools every member's lead_unlocks;
      owner/managers see all + assign (PATCH /agency/leads/{id}/assign → LEAD_ASSIGNED notification → /agency/leads?lead=…), agents see
      only leads assigned to them (own unlocks count as theirs until moved); remove/leave releases pooled leads to "Unassigned".
      Personal /crm/leads now hydrates buyer contact + follows assignments; lead_unlocks get `id` on insert (+ backfill at boot).
      Frontend: /agency (team, invites, manage sheet, leave), /agency/leads (status + assignee filters, LeadDetailSheet with Assigned-to
      chips), /admin/agencies (create / rename / hand over / deactivate), My AMASS → "Agency Team" row with invite badge, admin tile,
      /crm team CTA. Shared crm bits in src/components/crm/LeadBits.tsx. Demo seed: agency "AMASS Demo Realty" (owner demo, agent
      adaeze). Backend: tests/test_agency_teams.py 8/8 (self-cleaning).

  - agent: "main"
    message: |
      Iteration 92 (to run) — branded emails. New backend/email_theme.py: render_email() = red brand bar, AMASS logo header
      (served by GET /api/email-assets/{amass-logo.png|fixa-logo.png|amass-wordmark.png}, public, 7-day cache), a real Lagos photo
      hero (Unsplash CDN, HEROES map), body, optional code block / amount block / details table / CTA, footer with the FIXA PRO logo.
      Public origin for logo URLs = backend/public_url.py (PUBLIC_API_BASE/EXPO_BACKEND_URL env → origin learned from the first
      inbound request via an HTTP middleware, persisted in runtime_state). All six senders now use it: password reset
      (auth_security), receipts (receipts.receipt_html), viewings (_email_html + email_hero), My Home reminders (home_hub),
      digests (notification_center.digest_email_html), agency invites (agency_teams). Admin previews: GET /api/admin/email-previews
      (list) and /{kind} (html; ?format=json → {subject, html}) for reset|receipt|unlock|viewing|viewing-confirmed|home|digest|agency.
      Frontend: /admin/emails "Email designs" screen (chips per kind, subject, iframe on web / WebView native) + admin tile.
      Already verified: all 8 previews pass auth_security._assert_safe_email; pytest auth/viewings/home_hub/agency/payments/digest
      green (incl. a real send to delivered@resend.dev); screenshots of receipt/reset/digest + the admin screen.

  - agent: "main"
    message: |
      Iteration 93 (to run) — Roles & admin integration, Brand portal, Admin Portal shared key.
      Backend: brands.py — admin creates brand (POST /api/admin/brands) and INVITES brand managers by email
      (POST /api/admin/brands/{id}/accounts {name,email} → single-use set-password link, 72 h, sha256 hash stored; email failure →
      response carries invite_link so the admin can share it); resend (POST …/accounts/{aid}/invite); brand side:
      POST /api/brand/auth/forgot-password (enumeration-safe), GET /api/brand/auth/invite/{token}, POST /api/brand/auth/set-password
      {token,password} → brand token; login 401 until a password is set. Brand tokens (typ=brand) rejected by app/admin routes.
      Fixed: shop_products unique source_id index collided on null for portal/brand-created products (source_id now "<source>:<id>").
      portal_keys.py + admin_accounts.py: POST/DELETE /api/admin/portal-connection/key (one active key, plaintext shown once),
      GET /api/admin/portal-connection includes `key`; admin_portal.current_account accepts X-AMASS-Portal-Key / Bearer amass_pk_…
      (super_admin, X-AMASS-Portal-Actor named in audit) or the scoped staff token.
      Frontend: /brand (login + "Forgot password" sheet), /brand/set-password?token=… (validates link, sets password, signs in),
      /admin/brands (list/search, create, detail sheet: visibility/sponsored toggles, invite manager, resend, disable, remove, edit),
      /admin/accounts (search + All/Agents/Admins/Suspended, suspend/reactivate, grant/revoke admin), /admin/portal (status, generate/
      rotate/revoke key shown once with copy, API base copy, managed lists), 3 new Cockpit tiles.
      Smoke (tests/smoke_brand_portal.py) green end-to-end. Brand test login: smoke-brand@amass-qa.africa / BrandPass2026! (brand "Smoke Lighting Co").

  - agent: "main"
    message: |
      Iteration 94 (to run) — Social media publishing + smart links.
      Backend `social_publishing.py` (mounted in server.py): admin `/api/admin/social/*` — overview (platform status/keys, settings, 30-day stats,
      recent posts), PATCH settings (auto_post per platform, hashtags, store URLs, IG bio line, TikTok privacy, footer), POST test/{platform},
      GET connect/{platform} (LinkedIn/TikTok OAuth start — 400 until client keys exist), DELETE accounts/{platform}, GET listings?search,
      GET compose/{property_id} (per-platform captions, image, link), POST posts (create + publish; platforms without keys → result "queued"),
      GET posts, POST posts/{id}/retry[?platform], POST posts/{id}/refresh (TikTok status), DELETE posts/{id} (queued/failed only), POST publish-queued.
      Public: GET /api/go/{property_id}?src=…&post=… — server-rendered landing page with OG/Twitter tags; mobile JS tries amass://property/{id}
      then falls back to the store URL (settings) or the web listing; counts opens in social_link_clicks (bots skipped); unknown id → 307 to /.
      GET /api/social/oauth/{platform}/callback. Share bundle GET /api/share/property/{id} now returns share_url = smart link and `social`
      {smart_link, captions per platform, intents}. Auto-post hooks: PATCH /api/portal/properties/{id}/verify and POST /api/admin/cockpit/property/{amass_id}/verify.
      No platform keys exist in this environment → every publish lands as "queued" (expected). Adapter HTTP contracts are unit-tested with mocked
      httpx in tests/test_social_adapters.py (8 pass). Collections: social_publish_posts / social_publish_accounts / social_link_clicks (NOT the
      Feeds collection social_posts).
      Frontend: /admin/social (stats, clicks by source, platform cards with auto-post toggle, Test/Connect/How to connect/Disconnect, Settings sheet,
      recent posts + detail sheet with Retry/Open/Copy caption/Remove, Publish waiting), /admin/social-compose (pick listing → photo picker →
      platform chips → per-platform caption tabs with counters → Publish → result card), Cockpit tile "Social publishing", share screen
      (/share/{id}) "Post to social media" row (Facebook/X/LinkedIn open share intents; Instagram/TikTok copy caption + share flyer) and Copy caption.
