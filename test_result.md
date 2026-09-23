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
user_problem_statement: "DEAR DOLLAR customer frontend (Powered by INTERNET ZONE) — Next.js customer app for a $Dollar marketplace with mock NestJS-contract backend at /api. Auth via Indian mobile+password (JWT + refresh), dashboard with Money/Point wallets, Add Money UPI deposit flow (create deposit -> UPI ID/QR -> submit UTR -> pending -> mock-admin auto-verifies after 45s), Buy/Sell $Dollar via listings with backend-calculated quotes, transactions/orders/deposits/withdrawals history, bank details (masked), withdrawals, notifications, community links from backend settings."

backend:
  - task: "Auth: register/login/refresh/logout/forgot-password (mobile+password, token rotation)"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Register validates Indian mobile (^[6-9]\\d{9}$) and password (min 8, letters+numbers). Sessions collection stores access (30min) + refresh (7d) tokens. Refresh rotates tokens. Logout deactivates session."
        - working: true
          agent: "testing"
          comment: "✅ ALL AUTH TESTS PASSED: Registration with random Indian mobile (9658994128) successful, returns user + tokens without passwordHash. All validations working (invalid mobile, weak password, password mismatch, duplicate mobile → correct status codes). Login with correct password returns tokens, wrong password returns 401. Refresh token rotation working perfectly - new tokens issued, old refresh token invalidated. GET /api/auth/me with token returns user, without token returns 401. Forgot password returns generic success message. Logout invalidates access token correctly."
  - task: "Wallet + transactions endpoints"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "GET /api/wallet returns money{available,pending} + dollar{balance,pending}. GET /api/transactions with type/limit filters."
        - working: true
          agent: "testing"
          comment: "✅ WALLET TESTS PASSED: Initial wallet shows all zeros (money.available=0, money.pending=0, dollar.balance=0, dollar.pending=0). Wallet updates correctly after deposits (pending→available after approval), orders (deductions + pending holds), and withdrawals (balance reductions). All calculations accurate with proper rounding."
  - task: "Deposits: create -> UPI details -> submit UTR -> pending -> mock-admin auto-approve after 45s"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "POST /api/deposits {amount} returns deposit + upiString. POST /api/deposits/:id/utr {utr 12 digits} sets PENDING, adds moneyPending. Lazy mock-admin (processMockAdmin) approves after 45s on any authenticated GET: credits moneyAvailable, completes txn, adds notification."
        - working: true
          agent: "testing"
          comment: "✅ DEPOSIT FLOW FULLY WORKING: Created deposit for ₹500, received UPI details (deardollar@ybl) and upiString with 'upi://pay?pa=' format. Validations working (min ₹10, max ₹100,000). UTR submission with 12-digit number changes status to PENDING and increases wallet moneyPending to 500. Invalid UTR (non-12-digit) rejected. Re-submitting UTR correctly rejected. CRITICAL: Mock-admin auto-approval working perfectly - waited 50s, then wallet.money.available became 500, pending became 0, deposit status changed to APPROVED, UPI_DEPOSIT transaction marked COMPLETED, DEPOSIT_VERIFIED notification created."
  - task: "Listings + orders quote + buy/sell orders (backend calculations)"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Seeded BUY listings (e.g. ₹40=$9) and SELL demand (₹20=$10). POST /api/orders/quote computes amountInr, balances after, sufficiency. POST /api/orders BUY deducts moneyAvailable + dollarPending hold; SELL deducts dollarBalance + moneyPending. Mock admin approves after 45s."
        - working: true
          agent: "testing"
          comment: "✅ LISTINGS & ORDERS FULLY WORKING: GET /api/listings returns 8 BUY listings (e.g., ₹40=$9) and 6 SELL listings (e.g., ₹20=$10). Order quote for BUY calculates correctly ($9 @ ₹4.44/$ = ₹39.96, sufficient:true). BUY order creation successful - money.available reduced by ₹39.96, dollar.pending increased by 9. Insufficient funds validation working (huge order → 400 error). CRITICAL: BUY order approval after 45s working perfectly - waited 50s, order status changed to APPROVED, dollar.balance became 9, dollar.pending became 0, BUY_APPROVED notification created. SELL order flow working - quote calculated, order created, dollar.balance reduced by 5, money.pending increased by ₹10. Selling more than balance correctly rejected with 400 error."
  - task: "Bank details (masked) + withdrawals"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "PUT /api/bank-details validates IFSC + account number, GET returns masked values. POST /api/withdrawals requires bank details, min ₹100, deducts available balance."
        - working: true
          agent: "testing"
          comment: "✅ BANK DETAILS & WITHDRAWALS WORKING: Withdrawal without bank details correctly rejected with 400 error. Invalid IFSC (e.g., 'XYZ') validation working. Bank details saved successfully with valid IFSC (HDFC0001234). GET /api/bank-details returns properly masked values - accountNumberMasked: 'XXXXXX9012' (ends with last 4 digits), upiIdMasked: 'te****@ybl'. Withdrawal validations working (min ₹100 enforced, amount < ₹100 rejected). Withdrawal created successfully for ₹100, status PENDING, balance reduced from ₹460.04 to ₹360.04. Insufficient balance validation working (huge amount → 400 error)."
  - task: "Notifications + community links"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "GET /api/notifications with unread count, POST mark-read. GET /api/community-links (public) returns only enabled links from settings collection."
        - working: true
          agent: "testing"
          comment: "✅ NOTIFICATIONS & COMMUNITY LINKS WORKING: GET /api/notifications returns list of notifications with unread count (found 3 notifications, 3 unread including WELCOME, DEPOSIT_VERIFIED, BUY_APPROVED). POST /api/notifications/mark-read successfully marks all as read, unread count becomes 0. GET /api/community-links (public, no auth required) returns enabled links - found telegram and discord links from seeded settings."

frontend:
  - task: "Auth screens, dashboard, add money flow, buy/sell, wallet history, profile/bank/withdraw, notifications"
    implemented: true
    working: "NA"
    file: "app/page.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Full SPA with bottom nav. Verified visually via screenshot: registration + dashboard working. Frontend testing pending user permission."

metadata:
  created_by: "main_agent"
  version: "1.0"
  test_sequence: 2
  run_ui: false

test_plan:
  current_focus: []
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
    - agent: "main"
      message: "Initial MVP complete. All backend routes under /api (Next.js route handler acting as mock NestJS backend, MongoDB persisted). Please test full backend flows including the 45s mock-admin auto-approval (wait ~50s then re-fetch). Use unique random Indian mobile numbers (start 6-9, 10 digits) per test run."
    - agent: "testing"
      message: "✅ BACKEND TESTING COMPLETE - ALL 26 TESTS PASSED (100%). Comprehensive testing completed covering all 25 scenarios from review request plus API root. All critical flows verified: (1) Auth with token rotation working perfectly, (2) Deposit flow with mock-admin auto-approval after 45s working (waited 50s, verified approval), (3) BUY order flow with mock-admin approval after 45s working (waited 50s, verified approval), (4) SELL order flow working, (5) Bank details masking working, (6) Withdrawals working, (7) Notifications working, (8) All validations working (mobile, password, UTR, IFSC, amounts). No critical issues found. Backend is production-ready. Test file: /app/backend_test.py"
