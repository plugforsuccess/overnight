#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# verify-migrations-ci.sh — CI migration verification
# ─────────────────────────────────────────────────────────────
# Verifies that Prisma migrations apply cleanly and that every
# expected schema object exists. Designed to run in CI after
# `prisma migrate deploy`, or standalone against any database.
#
# Usage:
#   DATABASE_URL="postgresql://..." ./scripts/verify-migrations-ci.sh
#
# Exit codes:
#   0 — all migrations applied, all objects verified
#   non-zero — number of failed checks
# ─────────────────────────────────────────────────────────────

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

DB_URL="${DIRECT_URL:-${DATABASE_URL:-}}"
ERRORS=0

if [ -z "$DB_URL" ]; then
  echo -e "${RED}ERROR: Neither DIRECT_URL nor DATABASE_URL is set.${NC}"
  exit 1
fi

pass() { echo -e "  ${GREEN}✓${NC} $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; ERRORS=$((ERRORS + 1)); }

echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  CI Migration Verification${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo ""

# ── Step 1: Attempt deploy (idempotent — no-ops if current) ─
echo -e "${YELLOW}1. Applying pending migrations${NC}"
echo "─────────────────────────────────────────────────────"

DEPLOY_OUTPUT=$(npx prisma migrate deploy 2>&1) && DEPLOY_OK=true || DEPLOY_OK=false
echo "$DEPLOY_OUTPUT"

if [ "$DEPLOY_OK" = "true" ]; then
  pass "prisma migrate deploy succeeded"
else
  # P3009 = failed migrations block deploy; P3018 = migration SQL error
  # Either way, record the failure and continue to verify what we can.
  if echo "$DEPLOY_OUTPUT" | grep -q "P3009"; then
    fail "prisma migrate deploy blocked by stale failed migration (P3009)"
    echo -e "  ${YELLOW}→ A previously failed migration must be resolved before deploy.${NC}"
    echo -e "  ${YELLOW}  Run: npx prisma migrate resolve --rolled-back <migration_name>${NC}"
    echo -e "  ${YELLOW}  See: docs/prisma-migration-recovery.md${NC}"
  elif echo "$DEPLOY_OUTPUT" | grep -q "P3018"; then
    fail "prisma migrate deploy failed — migration SQL error (P3018)"
  else
    fail "prisma migrate deploy failed — see output above"
  fi
fi
echo ""

# ── Step 2: Verify prisma migrate status is clean ──────────
echo -e "${YELLOW}2. Prisma migrate status${NC}"
echo "─────────────────────────────────────────────────────"

STATUS_OUTPUT=$(npx prisma migrate status 2>&1) || true
echo "$STATUS_OUTPUT"

if echo "$STATUS_OUTPUT" | grep -q "Database schema is up to date"; then
  pass "Schema is up to date"
else
  fail "Schema is NOT up to date"
fi
echo ""

# ── Step 3: Verify no failed or rolled-back migrations ────
echo -e "${YELLOW}3. Migration metadata — no failures or drift${NC}"
echo "─────────────────────────────────────────────────────"

# Check if _prisma_migrations exists before querying it
HAS_TABLE=$(psql "$DB_URL" -tAc "
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = '_prisma_migrations'
  );
" 2>/dev/null || echo "error")

if [ "$HAS_TABLE" != "t" ]; then
  fail "_prisma_migrations table does not exist — migrations never ran"
  echo ""
else
  FAILED_COUNT=$(psql "$DB_URL" -tAc "
    SELECT COUNT(*) FROM _prisma_migrations
    WHERE finished_at IS NULL AND rolled_back_at IS NULL;
  " 2>/dev/null || echo "error")

  if [ "$FAILED_COUNT" = "0" ]; then
    pass "No failed migrations"
  else
    FAILED_NAMES=$(psql "$DB_URL" -tAc "
      SELECT migration_name FROM _prisma_migrations
      WHERE finished_at IS NULL AND rolled_back_at IS NULL
      ORDER BY started_at;
    " 2>/dev/null || echo "unknown")
    fail "$FAILED_COUNT migration(s) in failed state: $(echo "$FAILED_NAMES" | tr '\n' ' ')"
  fi

  ROLLED_BACK_COUNT=$(psql "$DB_URL" -tAc "
    SELECT COUNT(*) FROM _prisma_migrations
    WHERE rolled_back_at IS NOT NULL;
  " 2>/dev/null || echo "error")

  if [ "$ROLLED_BACK_COUNT" = "0" ]; then
    pass "No rolled-back migrations"
  else
    fail "$ROLLED_BACK_COUNT migration(s) marked as rolled back"
  fi

  # Check for duplicate applied rows (a sign of prior recovery)
  DUPLICATE_COUNT=$(psql "$DB_URL" -tAc "
    SELECT COUNT(*) FROM (
      SELECT migration_name FROM _prisma_migrations
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
      GROUP BY migration_name HAVING COUNT(*) > 1
    ) AS dupes;
  " 2>/dev/null || echo "error")

  if [ "$DUPLICATE_COUNT" = "0" ]; then
    pass "No duplicate applied rows"
  else
    fail "$DUPLICATE_COUNT migration(s) have duplicate applied rows (metadata drift signal)"
  fi
  echo ""
fi

# ── Step 4: Verify required tables ────────────────────────
echo -e "${YELLOW}4. Required tables${NC}"
echo "─────────────────────────────────────────────────────"

REQUIRED_TABLES=(
  parents
  children
  child_events
  child_attendance_sessions
  reservation_events
  incident_reports
  pickup_verifications
  pickup_events
  center_staff_memberships
  idempotency_keys
  child_medical_profiles
  parent_settings
)

for table in "${REQUIRED_TABLES[@]}"; do
  EXISTS=$(psql "$DB_URL" -tAc "
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = '$table'
    );
  " 2>/dev/null || echo "error")

  if [ "$EXISTS" = "t" ]; then
    pass "$table"
  else
    fail "$table MISSING"
  fi
done
echo ""

# ── Step 5: Verify critical columns (migration-order deps) ─
echo -e "${YELLOW}5. Critical columns (migration-order dependencies)${NC}"
echo "─────────────────────────────────────────────────────"

# archived_at on center_staff_memberships proves 000004 ran after 000003
check_column() {
  local tbl=$1 col=$2
  EXISTS=$(psql "$DB_URL" -tAc "
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = '$tbl' AND column_name = '$col'
    );
  " 2>/dev/null || echo "error")
  if [ "$EXISTS" = "t" ]; then
    pass "$tbl.$col"
  else
    fail "$tbl.$col MISSING (migration-order dependency failure)"
  fi
}

check_column "center_staff_memberships" "archived_at"
check_column "children" "archived_at"
check_column "child_authorized_pickups" "archived_at"
check_column "child_emergency_contacts" "archived_at"
check_column "overnight_blocks" "archived_at"
echo ""

# ── Step 6: Verify required functions ─────────────────────
echo -e "${YELLOW}6. Required functions (exactly once each)${NC}"
echo "─────────────────────────────────────────────────────"

REQUIRED_FUNCTIONS=(
  update_timestamp
  enforce_attendance_transition
  enforce_incident_transition
  prevent_hard_delete
  cleanup_expired_idempotency_keys
)

for func in "${REQUIRED_FUNCTIONS[@]}"; do
  COUNT=$(psql "$DB_URL" -tAc "
    SELECT COUNT(*) FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = '$func';
  " 2>/dev/null || echo "error")

  if [ "$COUNT" = "1" ]; then
    pass "$func() [count=$COUNT]"
  elif [ "$COUNT" = "0" ]; then
    fail "$func() MISSING"
  else
    fail "$func() has $COUNT copies (expected exactly 1)"
  fi
done
echo ""

# ── Step 7: Verify required triggers ─────────────────────
echo -e "${YELLOW}7. Required triggers${NC}"
echo "─────────────────────────────────────────────────────"

check_trigger() {
  local tbl=$1 trg=$2
  EXISTS=$(psql "$DB_URL" -tAc "
    SELECT EXISTS (
      SELECT 1 FROM information_schema.triggers
      WHERE trigger_schema = 'public'
        AND event_object_table = '$tbl'
        AND trigger_name = '$trg'
    );
  " 2>/dev/null || echo "error")
  if [ "$EXISTS" = "t" ]; then
    pass "$trg ON $tbl"
  else
    fail "$trg ON $tbl MISSING"
  fi
}

check_trigger "child_attendance_sessions" "trg_enforce_attendance_transition"
check_trigger "child_attendance_sessions" "child_attendance_sessions_update_timestamp"
check_trigger "incident_reports" "enforce_incident_transition"
check_trigger "incident_reports" "incident_reports_update_timestamp"
check_trigger "incident_reports" "prevent_incident_hard_delete"
check_trigger "center_staff_memberships" "center_staff_memberships_update_timestamp"
check_trigger "children" "children_update_timestamp"
check_trigger "children" "prevent_children_hard_delete"
check_trigger "pickup_verifications" "prevent_pickup_verification_hard_delete"
echo ""

# ── Step 8: Verify RLS enabled ────────────────────────────
echo -e "${YELLOW}8. Row-Level Security enabled${NC}"
echo "─────────────────────────────────────────────────────"

RLS_TABLES=(
  child_events
  child_attendance_sessions
  pickup_events
  audit_log
  reservation_events
  incident_reports
  center_staff_memberships
  pickup_verifications
  idempotency_keys
)

for table in "${RLS_TABLES[@]}"; do
  RLS=$(psql "$DB_URL" -tAc "
    SELECT rowsecurity FROM pg_tables
    WHERE schemaname = 'public' AND tablename = '$table';
  " 2>/dev/null || echo "error")

  if [ "$RLS" = "t" ]; then
    pass "$table (RLS enabled)"
  else
    fail "$table RLS NOT enabled"
  fi
done
echo ""

# ── Step 9: Verify RLS policies exist on critical tables ──
echo -e "${YELLOW}9. RLS policies on critical tables${NC}"
echo "─────────────────────────────────────────────────────"

check_policy_count() {
  local tbl=$1 expected=$2
  COUNT=$(psql "$DB_URL" -tAc "
    SELECT COUNT(*) FROM pg_policies
    WHERE schemaname = 'public' AND tablename = '$tbl';
  " 2>/dev/null || echo "error")
  if [ "$COUNT" -ge "$expected" ] 2>/dev/null; then
    pass "$tbl has $COUNT policies (expected >= $expected)"
  else
    fail "$tbl has $COUNT policies (expected >= $expected)"
  fi
}

check_policy_count "reservation_events" 2
check_policy_count "incident_reports" 2
check_policy_count "center_staff_memberships" 2
check_policy_count "pickup_verifications" 2
check_policy_count "child_events" 2
check_policy_count "child_attendance_sessions" 2
check_policy_count "pickup_events" 2
check_policy_count "audit_log" 2
echo ""

# ── Step 10: Metadata drift detection ─────────────────────
echo -e "${YELLOW}10. Metadata drift detection${NC}"
echo "─────────────────────────────────────────────────────"

declare -A MIGRATION_TABLES
MIGRATION_TABLES["20260307000002_enterprise_hardening"]="child_events child_attendance_sessions pickup_events"
MIGRATION_TABLES["20260307000003_operational_hardening"]="reservation_events incident_reports center_staff_memberships pickup_verifications"
MIGRATION_TABLES["20260307000004_sprint_hardening"]="idempotency_keys"

declare -A MIGRATION_FUNCTIONS
MIGRATION_FUNCTIONS["20260307000002_enterprise_hardening"]="update_timestamp"
MIGRATION_FUNCTIONS["20260307000003_operational_hardening"]="enforce_attendance_transition"
MIGRATION_FUNCTIONS["20260307000004_sprint_hardening"]="enforce_incident_transition prevent_hard_delete cleanup_expired_idempotency_keys"

DRIFT_FOUND=false

for migration in "${!MIGRATION_TABLES[@]}"; do
  IS_APPLIED=$(psql "$DB_URL" -tAc "
    SELECT EXISTS (
      SELECT 1 FROM _prisma_migrations
      WHERE migration_name = '$migration'
        AND finished_at IS NOT NULL
        AND rolled_back_at IS NULL
    );
  " 2>/dev/null || echo "error")

  if [ "$IS_APPLIED" != "t" ]; then
    continue
  fi

  for table in ${MIGRATION_TABLES[$migration]}; do
    TABLE_EXISTS=$(psql "$DB_URL" -tAc "
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = '$table'
      );
    " 2>/dev/null || echo "error")

    if [ "$TABLE_EXISTS" = "f" ]; then
      fail "DRIFT: $migration marked APPLIED but $table is missing"
      DRIFT_FOUND=true
    fi
  done

  if [ -n "${MIGRATION_FUNCTIONS[$migration]:-}" ]; then
    for func in ${MIGRATION_FUNCTIONS[$migration]}; do
      FUNC_EXISTS=$(psql "$DB_URL" -tAc "
        SELECT EXISTS (
          SELECT 1 FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname = '$func'
        );
      " 2>/dev/null || echo "error")

      if [ "$FUNC_EXISTS" = "f" ]; then
        fail "DRIFT: $migration marked APPLIED but $func() is missing"
        DRIFT_FOUND=true
      fi
    done
  fi
done

if [ "$DRIFT_FOUND" = "false" ]; then
  pass "No metadata drift detected"
fi
echo ""

# ── Summary ───────────────────────────────────────────────
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
if [ "$ERRORS" -eq 0 ]; then
  echo -e "${GREEN}  All checks passed. Migrations are healthy.${NC}"
else
  echo -e "${RED}  $ERRORS check(s) FAILED. See above for details.${NC}"
fi
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"

exit "$ERRORS"
