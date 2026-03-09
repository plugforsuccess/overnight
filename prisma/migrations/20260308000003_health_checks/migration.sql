-- CreateTable: health_check_runs
-- Tracks executions of reconciliation sweeps.
CREATE TABLE "health_check_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "run_type" TEXT NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "completed_at" TIMESTAMPTZ(6),
    "status" TEXT NOT NULL DEFAULT 'running',
    "triggered_by_user_id" UUID,
    "summary" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "health_check_runs_pkey" PRIMARY KEY ("id"),

    CONSTRAINT "health_check_runs_type_check" CHECK (
        "run_type" IN ('manual', 'scheduled', 'startup', 'repair_followup')
    ),
    CONSTRAINT "health_check_runs_status_check" CHECK (
        "status" IN ('running', 'completed', 'failed')
    )
);

CREATE INDEX "idx_health_runs_status" ON "health_check_runs" ("status", "started_at");
CREATE INDEX "idx_health_runs_user" ON "health_check_runs" ("triggered_by_user_id");

-- CreateTable: health_issues
-- Stores current and historical detected integrity issues.
CREATE TABLE "health_issues" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "health_check_run_id" UUID NOT NULL,
    "issue_type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "center_id" UUID,
    "program_id" UUID,
    "care_date" DATE,
    "reservation_night_id" UUID,
    "attendance_record_id" UUID,
    "child_id" UUID,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "detected_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "resolved_at" TIMESTAMPTZ(6),
    "resolved_by_user_id" UUID,
    "resolution_notes" TEXT,

    CONSTRAINT "health_issues_pkey" PRIMARY KEY ("id"),

    CONSTRAINT "health_issues_severity_check" CHECK (
        "severity" IN ('critical', 'warning', 'info')
    ),
    CONSTRAINT "health_issues_status_check" CHECK (
        "status" IN ('open', 'reviewed', 'resolved', 'ignored')
    )
);

CREATE INDEX "idx_health_issues_run" ON "health_issues" ("health_check_run_id");
CREATE INDEX "idx_health_issues_severity_status" ON "health_issues" ("severity", "status");
CREATE INDEX "idx_health_issues_type" ON "health_issues" ("issue_type", "status");
CREATE INDEX "idx_health_issues_date" ON "health_issues" ("care_date");
CREATE INDEX "idx_health_issues_open" ON "health_issues" ("status") WHERE "status" = 'open';

ALTER TABLE "health_issues" ADD CONSTRAINT "health_issues_run_fkey"
    FOREIGN KEY ("health_check_run_id") REFERENCES "health_check_runs"("id") ON DELETE CASCADE;
