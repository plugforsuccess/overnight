#!/usr/bin/env bash
# ============================================================
# End-to-End Smoke Test for Overnight Childcare Booking App
# ============================================================
# Prerequisites:
#   export APP_URL="http://localhost:3000"   (or production URL)
#   The app must be running.
#
# Usage:
#   chmod +x scripts/smoke-test.sh
#   ./scripts/smoke-test.sh
# ============================================================

set -euo pipefail

APP_URL="${APP_URL:-http://localhost:3000}"
PASS=0
FAIL=0
TIMESTAMP=$(date +%s)
TEST_EMAIL="smoketest+${TIMESTAMP}@test.local"
TEST_PASSWORD="SmokeTest1234!"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()     { echo -e "${GREEN}[PASS]${NC} $*"; ((PASS++)); }
fail()    { echo -e "${RED}[FAIL]${NC} $*"; ((FAIL++)); }
section() { echo -e "\n${YELLOW}── $* ──${NC}"; }

# Helper: make authenticated request
auth_req() {
  local method="$1"
  local path="$2"
  local data="${3:-}"

  if [ -n "$data" ]; then
    curl -s -w "\n%{http_code}" -X "$method" \
      "${APP_URL}${path}" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer ${ACCESS_TOKEN}" \
      -d "$data"
  else
    curl -s -w "\n%{http_code}" -X "$method" \
      "${APP_URL}${path}" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer ${ACCESS_TOKEN}"
  fi
}

# Extract HTTP status from curl output (last line)
get_status() { echo "$1" | tail -n1; }
get_body()   { echo "$1" | sed '$d'; }

echo "============================================================"
echo "Smoke Test — $(date)"
echo "App URL: $APP_URL"
echo "Test user: $TEST_EMAIL"
echo "============================================================"

# ── 1. Signup ───────────────────────────────────────────────
section "1. Signup"
SIGNUP_RESP=$(curl -s -w "\n%{http_code}" -X POST \
  "${APP_URL}/api/auth/signup" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"${TEST_EMAIL}\",
    \"password\": \"${TEST_PASSWORD}\",
    \"firstName\": \"Smoke\",
    \"lastName\": \"Tester\",
    \"phone\": \"5551234567\"
  }")
SIGNUP_STATUS=$(get_status "$SIGNUP_RESP")
SIGNUP_BODY=$(get_body "$SIGNUP_RESP")

if [ "$SIGNUP_STATUS" = "200" ] || [ "$SIGNUP_STATUS" = "201" ]; then
  log "Signup returned $SIGNUP_STATUS"
  USER_ID=$(echo "$SIGNUP_BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['user']['id'])" 2>/dev/null || echo "")
  if [ -n "$USER_ID" ]; then
    log "User ID: $USER_ID"
  else
    fail "Could not extract user ID from signup response"
  fi
else
  fail "Signup returned $SIGNUP_STATUS: $(echo "$SIGNUP_BODY" | head -c 200)"
fi

# ── 2. Login (get access token) ────────────────────────────
section "2. Login"
# Use Supabase GoTrue endpoint for login
SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:-}"
SUPABASE_ANON_KEY="${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}"

if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_ANON_KEY" ]; then
  # Try loading from .env or .env.local
  if [ -f .env.local ]; then
    SUPABASE_URL=$(grep NEXT_PUBLIC_SUPABASE_URL .env.local 2>/dev/null | cut -d= -f2- || echo "")
    SUPABASE_ANON_KEY=$(grep NEXT_PUBLIC_SUPABASE_ANON_KEY .env.local 2>/dev/null | cut -d= -f2- || echo "")
  fi
fi

if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_ANON_KEY" ]; then
  fail "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set"
  echo "Skipping remaining tests (no auth token)."
  echo ""
  echo "Results: $PASS passed, $FAIL failed"
  exit 1
fi

LOGIN_RESP=$(curl -s -w "\n%{http_code}" -X POST \
  "${SUPABASE_URL}/auth/v1/token?grant_type=password" \
  -H "Content-Type: application/json" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -d "{\"email\": \"${TEST_EMAIL}\", \"password\": \"${TEST_PASSWORD}\"}")
LOGIN_STATUS=$(get_status "$LOGIN_RESP")
LOGIN_BODY=$(get_body "$LOGIN_RESP")

if [ "$LOGIN_STATUS" = "200" ]; then
  ACCESS_TOKEN=$(echo "$LOGIN_BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])" 2>/dev/null || echo "")
  if [ -n "$ACCESS_TOKEN" ]; then
    log "Login successful, got access token"
  else
    fail "Could not extract access token"
    echo "Skipping remaining tests."
    echo "Results: $PASS passed, $FAIL failed"
    exit 1
  fi
else
  fail "Login returned $LOGIN_STATUS: $(echo "$LOGIN_BODY" | head -c 200)"
  echo "Skipping remaining tests."
  echo "Results: $PASS passed, $FAIL failed"
  exit 1
fi

# ── 3. Add child ────────────────────────────────────────────
section "3. Add Child"
CHILD_RESP=$(auth_req POST "/api/children" '{
  "first_name": "Test",
  "last_name": "Child",
  "date_of_birth": "2022-06-15"
}')
CHILD_STATUS=$(get_status "$CHILD_RESP")
CHILD_BODY=$(get_body "$CHILD_RESP")

if [ "$CHILD_STATUS" = "200" ] || [ "$CHILD_STATUS" = "201" ]; then
  log "Add child returned $CHILD_STATUS"
  CHILD_ID=$(echo "$CHILD_BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['child']['id'])" 2>/dev/null || echo "")
  if [ -n "$CHILD_ID" ]; then
    log "Child ID: $CHILD_ID"
  else
    fail "Could not extract child ID"
  fi
else
  fail "Add child returned $CHILD_STATUS: $(echo "$CHILD_BODY" | head -c 200)"
fi

# ── 4. Add emergency contact ───────────────────────────────
section "4. Add Emergency Contact"
if [ -n "${CHILD_ID:-}" ]; then
  EC_RESP=$(auth_req POST "/api/children/${CHILD_ID}/emergency-contacts" '{
    "first_name": "Emergency",
    "last_name": "Contact",
    "relationship": "Grandparent",
    "phone": "5559876543",
    "priority": 1,
    "authorized_for_pickup": false
  }')
  EC_STATUS=$(get_status "$EC_RESP")
  if [ "$EC_STATUS" = "200" ] || [ "$EC_STATUS" = "201" ]; then
    log "Add emergency contact returned $EC_STATUS"
  else
    fail "Add emergency contact returned $EC_STATUS: $(get_body "$EC_RESP" | head -c 200)"
  fi
else
  fail "Skipped — no child ID"
fi

# ── 5. Add authorized pickup ───────────────────────────────
section "5. Add Authorized Pickup"
if [ -n "${CHILD_ID:-}" ]; then
  AP_RESP=$(auth_req POST "/api/children/${CHILD_ID}/authorized-pickups" '{
    "first_name": "Authorized",
    "last_name": "Pickup",
    "relationship": "Uncle",
    "phone": "5551112222",
    "pickup_pin": "1234",
    "notes": "Smoke test pickup person"
  }')
  AP_STATUS=$(get_status "$AP_RESP")
  if [ "$AP_STATUS" = "200" ] || [ "$AP_STATUS" = "201" ]; then
    log "Add authorized pickup returned $AP_STATUS"
  else
    fail "Add authorized pickup returned $AP_STATUS: $(get_body "$AP_RESP" | head -c 200)"
  fi
else
  fail "Skipped — no child ID"
fi

# ── 6. Reserve nights (create booking) ─────────────────────
section "6. Create Booking"
if [ -n "${CHILD_ID:-}" ]; then
  # Calculate next Monday as week_start
  NEXT_MONDAY=$(python3 -c "
from datetime import date, timedelta
today = date.today()
days_ahead = (0 - today.weekday()) % 7  # Monday=0
if days_ahead == 0: days_ahead = 7
print((today + timedelta(days=days_ahead)).isoformat())
" 2>/dev/null)

  # Generate 3 nights starting from that Monday
  NIGHTS=$(python3 -c "
from datetime import date, timedelta
d = date.fromisoformat('${NEXT_MONDAY}')
nights = [(d + timedelta(days=i)).isoformat() for i in range(3)]
import json; print(json.dumps(nights))
" 2>/dev/null)

  BOOKING_RESP=$(auth_req POST "/api/bookings" "{
    \"childId\": \"${CHILD_ID}\",
    \"nightsPerWeek\": 3,
    \"selectedNights\": ${NIGHTS},
    \"weekStart\": \"${NEXT_MONDAY}\"
  }")
  BOOKING_STATUS=$(get_status "$BOOKING_RESP")
  BOOKING_BODY=$(get_body "$BOOKING_RESP")

  if [ "$BOOKING_STATUS" = "200" ] || [ "$BOOKING_STATUS" = "201" ]; then
    log "Create booking returned $BOOKING_STATUS"
    BLOCK_ID=$(echo "$BOOKING_BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['plan']['id'])" 2>/dev/null || echo "")
    if [ -n "$BLOCK_ID" ]; then
      log "Overnight block ID: $BLOCK_ID"
    else
      fail "Could not extract overnight block ID"
    fi
  else
    fail "Create booking returned $BOOKING_STATUS: $(echo "$BOOKING_BODY" | head -c 300)"
  fi
else
  fail "Skipped — no child ID"
fi

# ── 7. Confirm & Pay (Stripe checkout session) ─────────────
section "7. Stripe Checkout (Confirm & Pay)"
if [ -n "${BLOCK_ID:-}" ]; then
  STRIPE_RESP=$(auth_req POST "/api/stripe" "{\"planId\": \"${BLOCK_ID}\"}")
  STRIPE_STATUS=$(get_status "$STRIPE_RESP")
  STRIPE_BODY=$(get_body "$STRIPE_RESP")

  if [ "$STRIPE_STATUS" = "200" ] || [ "$STRIPE_STATUS" = "201" ]; then
    CHECKOUT_URL=$(echo "$STRIPE_BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('url',''))" 2>/dev/null || echo "")
    if [ -n "$CHECKOUT_URL" ]; then
      log "Stripe checkout session created"
      log "Checkout URL: ${CHECKOUT_URL:0:80}..."
    else
      fail "No checkout URL in response"
    fi
  else
    fail "Stripe checkout returned $STRIPE_STATUS: $(echo "$STRIPE_BODY" | head -c 200)"
  fi
else
  fail "Skipped — no overnight block ID"
fi

# ── 8. Dashboard check ─────────────────────────────────────
section "8. Dashboard API"
DASH_RESP=$(auth_req GET "/api/dashboard")
DASH_STATUS=$(get_status "$DASH_RESP")
if [ "$DASH_STATUS" = "200" ]; then
  log "Dashboard API returned 200"
else
  fail "Dashboard API returned $DASH_STATUS: $(get_body "$DASH_RESP" | head -c 200)"
fi

# ── 9. Reservations check ──────────────────────────────────
section "9. Reservations API"
RES_RESP=$(auth_req GET "/api/reservations")
RES_STATUS=$(get_status "$RES_RESP")
if [ "$RES_STATUS" = "200" ]; then
  log "Reservations API returned 200"
else
  fail "Reservations API returned $RES_STATUS: $(get_body "$RES_RESP" | head -c 200)"
fi

# ── 10. Settings check ─────────────────────────────────────
section "10. Settings API"
SETTINGS_RESP=$(auth_req GET "/api/settings")
SETTINGS_STATUS=$(get_status "$SETTINGS_RESP")
if [ "$SETTINGS_STATUS" = "200" ]; then
  log "Settings API returned 200"
else
  fail "Settings API returned $SETTINGS_STATUS: $(get_body "$SETTINGS_RESP" | head -c 200)"
fi

# ── Results ─────────────────────────────────────────────────
echo ""
echo "============================================================"
echo -e "Results: ${GREEN}${PASS} passed${NC}, ${RED}${FAIL} failed${NC}"
echo "============================================================"

if [ "$FAIL" -gt 0 ]; then
  echo -e "${RED}SMOKE TEST FAILED — do NOT proceed with cutover.${NC}"
  exit 1
else
  echo -e "${GREEN}SMOKE TEST PASSED — cutover is safe to finalize.${NC}"
  exit 0
fi
