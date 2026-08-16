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
      Phase 1 of the AMASS Agent Ecosystem is now shipped. New backend module
      `/app/backend/agent_platform.py` adds:
        • Plans catalog (Starter Free / Pro ₦15k / Agency ₦50k) with founding pricing
          (Pro ₦10k / Agency ₦35k, first 500 agents)
        • Founding Agent counter
        • Agent subscription lifecycle (subscribe / activate-mock / cancel)
        • Server-side listing quota enforcement in POST /api/properties (HTTP 402
          with structured payload when at limit)
        • Auto Starter Kit eligibility marking after 5 verified listings
        • Onboarding progress tracker (5 steps)
        • Admin: list/verify/suspend agents, edit plans, manage kit statuses, KPIs

      Please validate:
      1) GET /api/agent-platform/plans (public) — returns 3 plans with founding
         effective_price_ngn when founding is open.
      2) GET /api/agent-platform/founding — returns {target:500, claimed:N, ...}.
      3) GET /api/agent-platform/subscription/me — auto-default Starter when no
         paid sub, returns paid subscription otherwise.
      4) POST /api/agent-platform/subscription/subscribe with plan_id=starter →
         instant activation. With plan_id=pro → returns pending_reference.
      5) POST /api/agent-platform/subscription/activate?pending_reference=... —
         only works when MOCK_PAYMENT=true (dev bypass); should flip user to Pro.
      6) After activation, GET /api/agent-platform/quota should reflect new limit
         (30 for Pro, 150 for Agency).
      7) POST /api/agent-platform/subscription/cancel → drops user back to Starter.
      8) Listing quota enforcement — as demo user (9 active listings, on Starter
         limit 5), POST /api/properties should return HTTP 402 with structured
         plan_limit_reached error. After subscribing to Pro (30 limit), the same
         POST should succeed (returns Property).
      9) Onboarding — GET /api/agent-platform/onboarding returns 5 steps with
         `completed`/`percent`/`can_go_live`.
      10) Admin endpoints (as demo@amass.africa which is in ADMIN_EMAILS):
          - GET /api/admin/agents (filter by status/plan/q)
          - POST /api/admin/agents/{user_id}/verify with {approve:true,verification_level:2}
          - POST /api/admin/agents/{user_id}/suspend with {suspend:true, reason:"test"}
             then {suspend:false}
          - PATCH /api/admin/plans/pro with {monthly_price_ngn: 20000}, then revert
          - POST /api/admin/starter-kits/{user_id}/status with {status:"processing",
            notes:"packed"} → then dispatched → delivered
          - GET /api/admin/agents/kpis
      11) 403 for non-admin trying to hit /api/admin/agents.
      12) Regression: existing endpoints (auth, properties GET/list, wallet, marketplace,
          earn/tasks) still work.

      Demo credentials: demo@amass.africa / amass2026 (admin).
      Fresh non-admin test user: create a new user via /api/auth/register
      (e.g. testagent@example.com / test1234) to verify 402 quota + 403 admin-gate.
