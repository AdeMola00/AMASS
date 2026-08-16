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
  Deployment readiness audit → then fix critical P0 security vulnerabilities blocking launch:
    1) POST /api/seed was unauthenticated → anyone could wipe the DB.
    2) POST /api/tokens/purchase & /api/wallet/fix/purchase were MOCK endpoints
       that credited wallets instantly (free-money bug).
    3) Referral /qualify and /payout let agents self-approve their own commissions.
    4) Wallet credit/debit was read-modify-write (race conditions).
    5) JWT_SECRET had a weak in-source fallback.
    6) httpx used by apple_auth.py & payments.py but missing from requirements.txt.
    7) DB missing indexes on hot collections.

backend:
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

metadata:
  created_by: "main_agent"
  version: "1.0"
  test_sequence: 1
  run_ui: false

test_plan:
  current_focus:
    - "P0 — Gate POST /api/seed behind admin"
    - "P0 — Remove mock free-money endpoints"
    - "P0 — Atomic wallet credit/debit with $inc"
    - "P0 — Admin-gate referral qualify & payout"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: |
      Phase 3 of the AMASS Agent Ecosystem shipped. New backend module
      `/app/backend/share_routes.py` adds property/agent sharing primitives:

      NEW ENDPOINTS
        • GET  /api/share/property/{property_id} — returns share_url, qr_url,
          whatsapp_url (wa.me deep link with pre-formatted message),
          whatsapp_message (pre-composed text), and flyer_payload
          (property + agent + branding — everything needed to render a
          client-side flyer without additional round-trips).
        • GET  /api/share/agent/{slug}            — same for agent profiles.
        • POST /api/share/property/{id}/event      {channel, context}  (auth)
          increments share_events + denormalised share_count/share_by_channel
          on the property doc.
        • POST /api/share/agent/{slug}/event       {channel, context}  (auth)
          same for agent_applications.
        • GET  /api/share/property/{id}/stats     (auth, agent OR admin only)
          returns {total_shares, by_channel:{...}}

      FRONTEND
        • New route /app/frontend/app/share/[id].tsx renders a premium AMASS
          property flyer captured via react-native-view-shot, with:
            - Hero cover, verified badge, listing type, price
            - Bed/bath/sqm spec chips
            - Listed-by agent + verification badge label
            - Embedded QR code (react-native-qrcode-svg)
            - Actions: Send on WhatsApp (25D366 brand), Save flyer,
              Share flyer (native share sheet), Copy link, More options
        • property/[id].tsx — Share button now routes to /share/{id}
        • agent/[slug].tsx — WhatsApp CTA tracks agent shares
        • app.json — Added NSPhotoLibraryAddUsageDescription (iOS),
          WRITE_EXTERNAL_STORAGE (Android), expo-media-library plugin
        • package.json — Added react-native-qrcode-svg, react-native-view-shot,
          expo-media-library, expo-sharing, expo-file-system, expo-clipboard

      PLEASE VALIDATE
      1) GET /api/share/property/{valid_id} → 200 with share_url starting
         "https://amass.africa/property/", whatsapp_url starting
         "https://wa.me/?text=", flyer_payload.property containing id/title/
         price/city/state/bedrooms/verified, flyer_payload.agent (if property
         has an agent_id) containing full_name/badge/verification_level, and
         flyer_payload.brand set to AMASS.
      2) GET /api/share/property/{unknown_id} → 404
      3) GET /api/share/agent/{slug} → 200 with share_url ending in the slug,
         flyer_payload.kind=="agent" and flyer_payload.agent populated.
      4) GET /api/share/agent/{unknown} → 404
      5) POST /api/share/property/{id}/event {"channel":"whatsapp"} (auth) → 200,
         subsequent GET /property/{id} response should have share_count == 1
         and share_by_channel.whatsapp == 1. Repeat with "qr", "copy_link",
         "flyer" — each increments its own bucket. Unauthenticated → 401.
      6) POST /api/share/agent/{slug}/event {"channel":"whatsapp"} (auth) → 200.
      7) GET /api/share/property/{id}/stats:
         - As the property's own agent (demo user) → 200 with
           total_shares and by_channel matching the events from #5.
         - As a different (fresh) user → 403 "You can only view your own..."
         - As demo (admin) for someone else's listing → 200.
      8) Idempotency of the event: 3 events of the same channel should
         reflect share_count == 3.
      9) URL encoding: whatsapp_message contains newlines + Naira sign;
         whatsapp_url must be percent-encoded and decodable back to the
         same message.
      10) Regression: earlier Phase 1/Phase 2 endpoints still work.
          Specifically re-hit /api/agent-platform/plans,
          /api/agent-platform/subscription/me, /api/agent-platform/public/{slug},
          /api/agent-platform/badge/progress, and a POST /api/properties
          (which should still hit the quota check).

      Demo credentials: demo@amass.africa / amass2026 (in ADMIN_EMAILS).
      Demo agent slug: ada-demo-a8d30c.
      MOCK_PAYMENT=true is set.
