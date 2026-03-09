-- Phase A: Multi-Tenant Role Architecture Tables
-- Creates users, center_memberships, and child_guardians tables
-- Non-breaking: does not modify existing auth behavior

-- ─── users (canonical identity layer) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS "users" (
    "id"         UUID NOT NULL,
    "email"      TEXT NOT NULL,
    "first_name" TEXT,
    "last_name"  TEXT,
    "phone"      TEXT,
    "status"     TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "users_status_check" CHECK ("status" IN ('active', 'suspended', 'deactivated'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users"("email");

-- ─── center_memberships (center-scoped operational roles) ──────────────────
CREATE TABLE IF NOT EXISTS "center_memberships" (
    "id"                 UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id"            UUID NOT NULL,
    "center_id"          UUID NOT NULL,
    "role"               TEXT NOT NULL,
    "membership_status"  TEXT NOT NULL DEFAULT 'active',
    "invited_by_user_id" UUID,
    "created_at"         TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at"         TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "center_memberships_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "center_memberships_role_check" CHECK ("role" IN ('owner', 'admin', 'manager', 'staff', 'billing_only', 'viewer')),
    CONSTRAINT "center_memberships_status_check" CHECK ("membership_status" IN ('active', 'suspended', 'revoked'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "center_memberships_user_center_unique"
    ON "center_memberships"("user_id", "center_id");

CREATE INDEX IF NOT EXISTS "idx_center_memberships_center_role"
    ON "center_memberships"("center_id", "role");

ALTER TABLE "center_memberships"
    ADD CONSTRAINT "center_memberships_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "center_memberships"
    ADD CONSTRAINT "center_memberships_center_id_fkey"
    FOREIGN KEY ("center_id") REFERENCES "centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── child_guardians (family/contact relationships) ────────────────────────
CREATE TABLE IF NOT EXISTS "child_guardians" (
    "id"                    UUID NOT NULL DEFAULT gen_random_uuid(),
    "child_id"              UUID NOT NULL,
    "user_id"               UUID NOT NULL,
    "relationship_to_child" TEXT,
    "guardian_role"         TEXT NOT NULL,
    "is_primary_guardian"   BOOLEAN NOT NULL DEFAULT false,
    "can_book"              BOOLEAN NOT NULL DEFAULT true,
    "can_view_billing"      BOOLEAN NOT NULL DEFAULT true,
    "can_manage_pickups"    BOOLEAN NOT NULL DEFAULT true,
    "created_at"            TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at"            TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "child_guardians_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "child_guardians_role_check" CHECK ("guardian_role" IN ('parent', 'guardian', 'emergency_contact', 'authorized_pickup_only'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "child_guardians_child_user_unique"
    ON "child_guardians"("child_id", "user_id");

CREATE INDEX IF NOT EXISTS "idx_child_guardians_user"
    ON "child_guardians"("user_id");

ALTER TABLE "child_guardians"
    ADD CONSTRAINT "child_guardians_child_id_fkey"
    FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "child_guardians"
    ADD CONSTRAINT "child_guardians_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── updated_at triggers ───────────────────────────────────────────────────
-- Reuse the existing update_timestamp function for auto-updating updated_at

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_timestamp') THEN
        -- Drop triggers first for idempotency (CREATE TRIGGER has no IF NOT EXISTS)
        DROP TRIGGER IF EXISTS set_updated_at_users ON "users";
        DROP TRIGGER IF EXISTS set_updated_at_center_memberships ON "center_memberships";
        DROP TRIGGER IF EXISTS set_updated_at_child_guardians ON "child_guardians";

        CREATE TRIGGER set_updated_at_users
            BEFORE UPDATE ON "users"
            FOR EACH ROW EXECUTE FUNCTION update_timestamp();

        CREATE TRIGGER set_updated_at_center_memberships
            BEFORE UPDATE ON "center_memberships"
            FOR EACH ROW EXECUTE FUNCTION update_timestamp();

        CREATE TRIGGER set_updated_at_child_guardians
            BEFORE UPDATE ON "child_guardians"
            FOR EACH ROW EXECUTE FUNCTION update_timestamp();
    END IF;
END $$;
