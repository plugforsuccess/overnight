#!/usr/bin/env bash
# ============================================================
# Prisma Cutover Script
# ============================================================
# Prerequisites:
#   export DATABASE_URL="postgresql://user:pass@host:5432/dbname"
#   Ensure psql and npx are available.
#
# Usage:
#   chmod +x scripts/cutover.sh
#   ./scripts/cutover.sh
# ============================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[CUTOVER]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARNING]${NC} $*"; }
fail() { echo -e "${RED}[FAILED]${NC} $*"; exit 1; }

# ── Preflight ───────────────────────────────────────────────
if [ -z "${DATABASE_URL:-}" ]; then
  fail "DATABASE_URL is not set. Export it before running this script."
fi

log "Starting Prisma cutover..."
log "Database: $(echo "$DATABASE_URL" | sed 's|://[^@]*@|://***@|')"

# ── Step 1: Create DB snapshot ──────────────────────────────
log "Step 1/5: Creating database snapshot..."
SNAPSHOT_FILE="backup_$(date +%Y%m%d_%H%M%S).sql"
pg_dump "$DATABASE_URL" > "$SNAPSHOT_FILE" 2>/dev/null \
  && log "  Snapshot saved to $SNAPSHOT_FILE" \
  || warn "  pg_dump not available or failed. Ensure you have a backup before proceeding."

# ── Step 2: Mark baseline as applied ────────────────────────
log "Step 2/5: Marking baseline migration as applied..."
npx prisma migrate resolve --applied 0_baseline \
  || fail "Failed to mark baseline. Restore from snapshot: psql \$DATABASE_URL < $SNAPSHOT_FILE"
log "  Baseline marked successfully."

# ── Step 3: Run Prisma migrations ───────────────────────────
log "Step 3/5: Running Prisma migrations..."
npx prisma migrate deploy \
  || fail "Migration failed. Restore from snapshot: psql \$DATABASE_URL < $SNAPSHOT_FILE"
log "  Migrations applied successfully."

# ── Step 4: Apply Supabase RLS/policies SQL ─────────────────
log "Step 4/5: Applying Supabase security artifacts (RLS, triggers, enums)..."
if command -v psql &> /dev/null; then
  psql "$DATABASE_URL" < supabase/rls-policies.sql \
    || fail "RLS SQL failed. Check supabase/rls-policies.sql for errors."
  log "  RLS policies applied."
else
  warn "  psql not available. Apply manually:"
  warn "    psql \$DATABASE_URL < supabase/rls-policies.sql"
  warn "  Or paste contents into Supabase Dashboard > SQL Editor."
fi

# ── Step 5: Verification queries ────────────────────────────
log "Step 5/5: Running verification queries..."
if command -v psql &> /dev/null; then
  VERIFY_SQL=$(cat <<'EOSQL'
-- Verify plans.name column exists (not plan_key)
SELECT column_name FROM information_schema.columns
  WHERE table_name = 'plans' AND column_name = 'name';

-- Verify overnight_blocks.plan_id is nullable
SELECT is_nullable FROM information_schema.columns
  WHERE table_name = 'overnight_blocks' AND column_name = 'plan_id';

-- Verify payments table exists
SELECT EXISTS (
  SELECT FROM information_schema.tables WHERE table_name = 'payments'
);

-- Verify admin_settings table exists
SELECT EXISTS (
  SELECT FROM information_schema.tables WHERE table_name = 'admin_settings'
);

-- Verify parent_settings table exists
SELECT EXISTS (
  SELECT FROM information_schema.tables WHERE table_name = 'parent_settings'
);

-- Verify pickup_events table exists
SELECT EXISTS (
  SELECT FROM information_schema.tables WHERE table_name = 'pickup_events'
);

-- Verify RLS is enabled on key tables
SELECT tablename, rowsecurity FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename IN ('parents','children','reservations','overnight_blocks','payments','waitlist')
  ORDER BY tablename;

-- Count RLS policies
SELECT count(*) AS rls_policy_count FROM pg_policies WHERE schemaname = 'public';
EOSQL
  )
  echo "$VERIFY_SQL" | psql "$DATABASE_URL" \
    || fail "Verification queries failed. Review output above."
  log "  Verification complete."
else
  warn "  psql not available. Run verification manually."
  warn "  See ARCHITECTURE.md deployment runbook for queries."
fi

echo ""
log "============================================================"
log "Cutover complete. Next step: run smoke test."
log "  Snapshot file: $SNAPSHOT_FILE"
log "  Rollback: psql \$DATABASE_URL < $SNAPSHOT_FILE"
log "============================================================"
