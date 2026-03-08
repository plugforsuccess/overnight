#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# check-migration-state.sh — Diagnose Prisma migration health
# ─────────────────────────────────────────────────────────────
# Usage:
#   ./scripts/check-migration-state.sh
#
# Requires:
#   - DATABASE_URL (or DIRECT_URL) environment variable
#   - psql CLI available on PATH
#   - npx prisma available (project dependencies installed)
# ─────────────────────────────────────────────────────────────

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

DB_URL="${DIRECT_URL:-${DATABASE_URL:-}}"

if [ -z "$DB_URL" ]; then
  echo -e "${RED}ERROR: Neither DIRECT_URL nor DATABASE_URL is set.${NC}"
  echo "Set one of these environment variables and re-run."
  exit 1
fi

echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  Prisma Migration State Diagnostic${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo ""

# ── Step 1: Prisma migrate status ────────────────────────────
echo -e "${YELLOW}1. Prisma migrate status${NC}"
echo "─────────────────────────────────────────────────────"
npx prisma migrate status 2>&1 || true
echo ""

# ── Step 2: Raw _prisma_migrations table ─────────────────────
echo -e "${YELLOW}2. Migration history (_prisma_migrations)${NC}"
echo "─────────────────────────────────────────────────────"
psql "$DB_URL" -c "
  SELECT
    migration_name,
    started_at,
    finished_at,
    CASE
      WHEN rolled_back_at IS NOT NULL THEN 'ROLLED_BACK'
      WHEN finished_at IS NULL       THEN 'FAILED'
      ELSE                                'APPLIED'
    END AS state,
    LEFT(logs, 120) AS logs_preview
  FROM _prisma_migrations
  ORDER BY started_at DESC;
" 2>&1 || echo -e "${RED}Could not query _prisma_migrations (table may not exist yet).${NC}"
echo ""

# ── Step 3: Check required tables exist ──────────────────────
echo -e "${YELLOW}3. Required tables — existence check${NC}"
echo "─────────────────────────────────────────────────────"

REQUIRED_TABLES=(
  "parents"
  "children"
  "child_events"
  "child_attendance_sessions"
  "reservation_events"
  "incident_reports"
  "pickup_verifications"
  "pickup_events"
  "center_staff_memberships"
  "idempotency_keys"
  "child_medical_profiles"
  "parent_settings"
)

for table in "${REQUIRED_TABLES[@]}"; do
  EXISTS=$(psql "$DB_URL" -tAc "
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = '$table'
    );
  " 2>/dev/null || echo "error")

  if [ "$EXISTS" = "t" ]; then
    echo -e "  ${GREEN}✓${NC} $table"
  elif [ "$EXISTS" = "f" ]; then
    echo -e "  ${RED}✗${NC} $table  ${RED}(MISSING)${NC}"
  else
    echo -e "  ${YELLOW}?${NC} $table  ${YELLOW}(could not check)${NC}"
  fi
done
echo ""

# ── Step 4: Check required functions/triggers ────────────────
echo -e "${YELLOW}4. Required functions — existence check${NC}"
echo "─────────────────────────────────────────────────────"

REQUIRED_FUNCTIONS=(
  "update_timestamp"
  "enforce_attendance_transition"
  "enforce_incident_transition"
  "prevent_hard_delete"
  "cleanup_expired_idempotency_keys"
)

for func in "${REQUIRED_FUNCTIONS[@]}"; do
  EXISTS=$(psql "$DB_URL" -tAc "
    SELECT EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = '$func'
    );
  " 2>/dev/null || echo "error")

  if [ "$EXISTS" = "t" ]; then
    echo -e "  ${GREEN}✓${NC} $func()"
  elif [ "$EXISTS" = "f" ]; then
    echo -e "  ${RED}✗${NC} $func()  ${RED}(MISSING)${NC}"
  else
    echo -e "  ${YELLOW}?${NC} $func()  ${YELLOW}(could not check)${NC}"
  fi
done
echo ""

# ── Step 5: RLS enabled check ───────────────────────────────
echo -e "${YELLOW}5. Row-Level Security — enabled check${NC}"
echo "─────────────────────────────────────────────────────"

RLS_TABLES=(
  "child_events"
  "child_attendance_sessions"
  "pickup_events"
  "audit_log"
  "reservation_events"
  "incident_reports"
  "center_staff_memberships"
  "pickup_verifications"
  "idempotency_keys"
)

for table in "${RLS_TABLES[@]}"; do
  RLS=$(psql "$DB_URL" -tAc "
    SELECT rowsecurity FROM pg_tables
    WHERE schemaname = 'public' AND tablename = '$table';
  " 2>/dev/null || echo "error")

  if [ "$RLS" = "t" ]; then
    echo -e "  ${GREEN}✓${NC} $table (RLS enabled)"
  elif [ "$RLS" = "f" ]; then
    echo -e "  ${RED}✗${NC} $table  ${RED}(RLS NOT enabled)${NC}"
  elif [ -z "$RLS" ]; then
    echo -e "  ${YELLOW}?${NC} $table  ${YELLOW}(table not found)${NC}"
  else
    echo -e "  ${YELLOW}?${NC} $table  ${YELLOW}(could not check)${NC}"
  fi
done
echo ""

# ── Step 6: Metadata drift detection ─────────────────────────
echo -e "${YELLOW}6. Metadata drift detection${NC}"
echo "─────────────────────────────────────────────────────"

# Map migrations to the tables they create
declare -A MIGRATION_TABLES
MIGRATION_TABLES["20260307000002_enterprise_hardening"]="child_events child_attendance_sessions pickup_events"
MIGRATION_TABLES["20260307000003_operational_hardening"]="reservation_events incident_reports center_staff_memberships pickup_verifications"
MIGRATION_TABLES["20260307000004_sprint_hardening"]="idempotency_keys"

# Map migrations to the functions they create
declare -A MIGRATION_FUNCTIONS
MIGRATION_FUNCTIONS["20260307000002_enterprise_hardening"]="update_timestamp"
MIGRATION_FUNCTIONS["20260307000003_operational_hardening"]="enforce_attendance_transition"
MIGRATION_FUNCTIONS["20260307000004_sprint_hardening"]="enforce_incident_transition prevent_hard_delete cleanup_expired_idempotency_keys"

DRIFT_FOUND=false

for migration in "${!MIGRATION_TABLES[@]}"; do
  # Check if this migration is marked as applied
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

  # Check if its tables actually exist
  for table in ${MIGRATION_TABLES[$migration]}; do
    TABLE_EXISTS=$(psql "$DB_URL" -tAc "
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = '$table'
      );
    " 2>/dev/null || echo "error")

    if [ "$TABLE_EXISTS" = "f" ]; then
      echo -e "  ${RED}DRIFT${NC} $migration marked APPLIED but ${RED}$table${NC} is missing"
      echo -e "        Fix: delete stale row, then redeploy. See docs/prisma-migration-recovery.md Scenario D"
      DRIFT_FOUND=true
    fi
  done

  # Check if its functions actually exist
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
        echo -e "  ${RED}DRIFT${NC} $migration marked APPLIED but ${RED}$func()${NC} is missing"
        echo -e "        Fix: delete stale row, then redeploy. See docs/prisma-migration-recovery.md Scenario D"
        DRIFT_FOUND=true
      fi
    done
  fi
done

if [ "$DRIFT_FOUND" = "false" ]; then
  echo -e "  ${GREEN}✓${NC} No metadata drift detected"
fi
echo ""

# ── Step 7: Dependency integrity (000003 → 000004) ──────────
echo -e "${YELLOW}7. Dependency integrity (000003 → 000004)${NC}"
echo "─────────────────────────────────────────────────────"

# 000004 depends on 000003. If 000004 exists in metadata (applied OR failed),
# then 000003's objects must exist in the actual schema.
HAS_000004=$(psql "$DB_URL" -tAc "
  SELECT EXISTS (
    SELECT 1 FROM _prisma_migrations
    WHERE migration_name = '20260307000004_sprint_hardening'
  );
" 2>/dev/null || echo "error")

if [ "$HAS_000004" = "t" ]; then
  DEP_OK=true
  DEP_TABLES="reservation_events incident_reports center_staff_memberships pickup_verifications"

  for table in $DEP_TABLES; do
    TABLE_EXISTS=$(psql "$DB_URL" -tAc "
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = '$table'
      );
    " 2>/dev/null || echo "error")

    if [ "$TABLE_EXISTS" = "f" ]; then
      echo -e "  ${RED}DEPENDENCY BROKEN${NC} 000004 requires ${RED}$table${NC} from 000003 — not found"
      echo -e "        000003 is likely metadata-drifted. See docs/prisma-migration-recovery.md Scenario E"
      DEP_OK=false
    fi
  done

  if [ "$DEP_OK" = "true" ]; then
    echo -e "  ${GREEN}✓${NC} 000004 dependencies satisfied (all 000003 tables exist)"
  fi
else
  echo -e "  ${GREEN}✓${NC} 000004 not yet in migration history — dependency check not applicable"
fi
echo ""

# ── Summary ──────────────────────────────────────────────────
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  Diagnostic complete.${NC}"
echo -e "${CYAN}  See docs/prisma-migration-recovery.md for${NC}"
echo -e "${CYAN}  recovery procedures if any issues were found.${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
