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
  - task: "Phase1 — Two-tier property access (access + agent-contact) charging"
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
    - "Phase1 — Two-tier property access (access + agent-contact) charging"
    - "Phase1 — Two-tier property access UX (access gate + agent reveal)"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
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
