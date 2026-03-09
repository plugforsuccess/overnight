-- CreateTable: capacity_overrides
-- Operator-managed per-date overrides for closures and reduced capacity.
CREATE TABLE "capacity_overrides" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "center_id" UUID NOT NULL,
    "program_id" UUID NOT NULL,
    "care_date" DATE NOT NULL,
    "override_type" TEXT NOT NULL,
    "capacity_override" INTEGER,
    "reason_code" TEXT NOT NULL,
    "reason_text" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_user_id" UUID NOT NULL,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "capacity_overrides_pkey" PRIMARY KEY ("id"),

    -- Type constraints
    CONSTRAINT "capacity_overrides_type_check" CHECK (
        "override_type" IN ('closed', 'reduced_capacity', 'reopened')
    ),
    CONSTRAINT "capacity_overrides_reason_code_check" CHECK (
        "reason_code" IN ('holiday', 'staff_shortage', 'weather', 'facility_issue', 'emergency_closure', 'low_demand', 'maintenance', 'other')
    ),
    -- capacity_override must be >= 0 when present
    CONSTRAINT "capacity_overrides_capacity_gte_zero" CHECK (
        "capacity_override" IS NULL OR "capacity_override" >= 0
    ),
    -- reduced_capacity requires a value
    CONSTRAINT "capacity_overrides_reduced_requires_value" CHECK (
        "override_type" != 'reduced_capacity' OR "capacity_override" IS NOT NULL
    )
);

-- Partial unique: only one active override per program+date
CREATE UNIQUE INDEX "capacity_overrides_active_unique"
    ON "capacity_overrides" ("program_id", "care_date")
    WHERE "is_active" = true;

-- Lookup indexes
CREATE INDEX "idx_capacity_overrides_center_date" ON "capacity_overrides" ("center_id", "care_date");
CREATE INDEX "idx_capacity_overrides_program_date" ON "capacity_overrides" ("program_id", "care_date");
CREATE INDEX "idx_capacity_overrides_active" ON "capacity_overrides" ("is_active", "care_date");
CREATE INDEX "idx_capacity_overrides_created_by" ON "capacity_overrides" ("created_by_user_id");

-- FKs
ALTER TABLE "capacity_overrides" ADD CONSTRAINT "capacity_overrides_center_fkey"
    FOREIGN KEY ("center_id") REFERENCES "centers"("id") ON DELETE CASCADE;
ALTER TABLE "capacity_overrides" ADD CONSTRAINT "capacity_overrides_program_fkey"
    FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE CASCADE;

-- CreateTable: capacity_override_events
-- Immutable audit trail for closure/reduction operator actions.
CREATE TABLE "capacity_override_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "capacity_override_id" UUID NOT NULL,
    "center_id" UUID NOT NULL,
    "program_id" UUID NOT NULL,
    "care_date" DATE NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "event_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "capacity_override_events_pkey" PRIMARY KEY ("id"),

    CONSTRAINT "capacity_override_events_type_check" CHECK (
        "event_type" IN (
            'capacity_override_created', 'night_closed', 'capacity_reduced',
            'night_reopened', 'capacity_override_deactivated', 'affected_bookings_reviewed'
        )
    )
);

CREATE INDEX "idx_override_events_override" ON "capacity_override_events" ("capacity_override_id", "event_at");
CREATE INDEX "idx_override_events_center_date" ON "capacity_override_events" ("center_id", "care_date");
CREATE INDEX "idx_override_events_type" ON "capacity_override_events" ("event_type", "event_at");
CREATE INDEX "idx_override_events_actor" ON "capacity_override_events" ("actor_user_id");

ALTER TABLE "capacity_override_events" ADD CONSTRAINT "override_events_override_fkey"
    FOREIGN KEY ("capacity_override_id") REFERENCES "capacity_overrides"("id") ON DELETE CASCADE;
