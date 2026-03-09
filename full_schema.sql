-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "centers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "address_line_1" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postal_code" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "centers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "programs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "center_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "care_type" TEXT NOT NULL DEFAULT 'overnight',
    "start_time" TEXT NOT NULL DEFAULT '21:00',
    "end_time" TEXT NOT NULL DEFAULT '07:00',
    "age_min_months" INTEGER,
    "age_max_months" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "program_capacity" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "center_id" UUID NOT NULL,
    "program_id" UUID NOT NULL,
    "care_date" DATE NOT NULL,
    "capacity_total" INTEGER NOT NULL,
    "capacity_reserved" INTEGER NOT NULL DEFAULT 0,
    "capacity_waitlisted" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "program_capacity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "capacity_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capacity_override_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "capacity_override_id" UUID NOT NULL,
    "center_id" UUID NOT NULL,
    "program_id" UUID NOT NULL,
    "care_date" DATE NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "event_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "capacity_override_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parents" (
    "id" UUID NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "role" TEXT NOT NULL DEFAULT 'parent',
    "is_admin" BOOLEAN NOT NULL DEFAULT false,
    "stripe_customer_id" TEXT,
    "name" TEXT,
    "center_id" UUID,
    "onboarding_status" TEXT NOT NULL DEFAULT 'started',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "children" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "parent_id" UUID NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "middle_name" TEXT,
    "preferred_name" TEXT,
    "date_of_birth" DATE,
    "gender" TEXT,
    "name" TEXT,
    "allergies" TEXT,
    "photo_url" TEXT,
    "medical_notes" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "archived_at" TIMESTAMPTZ(6),
    "center_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "children_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "child_allergies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "child_id" UUID NOT NULL,
    "allergen" TEXT NOT NULL,
    "custom_label" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "child_allergies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "child_allergy_action_plans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "child_allergy_id" UUID NOT NULL,
    "treatment_first_line" TEXT NOT NULL DEFAULT 'NONE',
    "dose_instructions" TEXT,
    "symptoms_watch" JSONB,
    "med_location" TEXT,
    "requires_med_on_site" BOOLEAN NOT NULL DEFAULT false,
    "medication_expires_on" DATE,
    "physician_name" TEXT,
    "parent_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "parent_confirmed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "child_allergy_action_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "child_medical_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "child_id" UUID NOT NULL,
    "center_id" UUID,
    "has_allergies" BOOLEAN NOT NULL DEFAULT false,
    "has_medications" BOOLEAN NOT NULL DEFAULT false,
    "has_medical_conditions" BOOLEAN NOT NULL DEFAULT false,
    "allergies_summary" TEXT,
    "medications_summary" TEXT,
    "medical_conditions_summary" TEXT,
    "physician_name" TEXT,
    "physician_phone" TEXT,
    "hospital_preference" TEXT,
    "special_instructions" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "child_medical_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "child_emergency_contacts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "child_id" UUID NOT NULL,
    "center_id" UUID,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "phone_alt" TEXT,
    "email" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL,
    "authorized_for_pickup" BOOLEAN NOT NULL DEFAULT false,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "child_emergency_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "child_authorized_pickups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "child_id" UUID NOT NULL,
    "center_id" UUID,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "dob" DATE,
    "pickup_pin_hash" TEXT,
    "photo_id_url" TEXT,
    "is_emergency_contact" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "archived_at" TIMESTAMPTZ(6),
    "id_verified" BOOLEAN NOT NULL DEFAULT false,
    "id_verified_at" TIMESTAMPTZ(6),
    "id_verified_by" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "child_authorized_pickups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "child_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "child_id" UUID NOT NULL,
    "center_id" UUID,
    "event_type" TEXT NOT NULL,
    "event_data" JSONB NOT NULL DEFAULT '{}',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "child_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "child_attendance_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "child_id" UUID NOT NULL,
    "center_id" UUID,
    "reservation_id" UUID,
    "check_in_at" TIMESTAMPTZ(6),
    "check_out_at" TIMESTAMPTZ(6),
    "checked_in_by" UUID,
    "checked_out_by" UUID,
    "pickup_person_name" TEXT,
    "pickup_relationship" TEXT,
    "pickup_verified" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "child_attendance_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservation_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reservation_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "event_data" JSONB NOT NULL DEFAULT '{}',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reservation_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "child_id" UUID NOT NULL,
    "attendance_session_id" UUID,
    "center_id" UUID,
    "severity" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "details" TEXT,
    "reported_by" UUID,
    "parent_notified_at" TIMESTAMPTZ(6),
    "resolved_at" TIMESTAMPTZ(6),
    "closed_at" TIMESTAMPTZ(6),
    "status" TEXT NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incident_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "center_staff_memberships" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "center_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "center_staff_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pickup_verifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "attendance_session_id" UUID NOT NULL,
    "authorized_pickup_id" UUID,
    "verified_name" TEXT NOT NULL,
    "verified_relationship" TEXT NOT NULL,
    "verification_method" TEXT NOT NULL,
    "verified_by" UUID,
    "verified_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pickup_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "nights_per_week" INTEGER NOT NULL,
    "weekly_price_cents" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "overnight_blocks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "week_start" DATE NOT NULL,
    "parent_id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "plan_id" UUID,
    "nights_per_week" INTEGER NOT NULL,
    "weekly_price_cents" INTEGER NOT NULL,
    "multi_child_discount_pct" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "payment_status" TEXT NOT NULL DEFAULT 'pending',
    "stripe_subscription_id" TEXT,
    "stripe_invoice_id" TEXT,
    "caregiver_notes" TEXT,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "overnight_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "child_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "overnight_block_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending_payment',
    "admin_override" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nightly_capacity" (
    "date" DATE NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 6,
    "min_enrollment" INTEGER NOT NULL DEFAULT 4,
    "confirmed_count" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'open',
    "override_capacity" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nightly_capacity_pkey" PRIMARY KEY ("date")
);

-- CreateTable
CREATE TABLE "waitlist" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "date" DATE NOT NULL,
    "child_id" UUID NOT NULL,
    "parent_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'waiting',
    "offered_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "waitlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "parent_id" UUID NOT NULL,
    "plan_id" UUID,
    "amount_cents" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "description" TEXT,
    "stripe_payment_intent_id" TEXT,
    "stripe_invoice_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_ledger" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "parent_id" UUID NOT NULL,
    "reservation_night_id" UUID,
    "child_id" UUID,
    "amount_cents" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "payment_provider" TEXT DEFAULT 'stripe',
    "stripe_payment_intent_id" TEXT,
    "description" TEXT,
    "care_date" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_settings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "max_capacity" INTEGER NOT NULL DEFAULT 6,
    "min_enrollment" INTEGER NOT NULL DEFAULT 4,
    "pricing_tiers" JSONB NOT NULL DEFAULT '[{"nights":3,"price_cents":30000},{"nights":4,"price_cents":36000},{"nights":5,"price_cents":42500}]',
    "operating_nights" JSONB NOT NULL DEFAULT '["sunday","monday","tuesday","wednesday","thursday"]',
    "billing_day" TEXT NOT NULL DEFAULT 'friday',
    "billing_time" TEXT NOT NULL DEFAULT '12:00',
    "waitlist_confirm_hours" INTEGER NOT NULL DEFAULT 24,
    "overnight_start_time" TEXT NOT NULL DEFAULT '21:00',
    "overnight_end_time" TEXT NOT NULL DEFAULT '07:00',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "parent_id" UUID NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "related_block_id" UUID,
    "related_date" DATE,
    "source_weekly_price_cents" INTEGER,
    "source_plan_nights" INTEGER,
    "applied" BOOLEAN NOT NULL DEFAULT false,
    "applied_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pickup_events" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "child_id" UUID NOT NULL,
    "pickup_person_id" UUID,
    "verified_by_staff_id" UUID,
    "verification_method" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pickup_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parent_settings" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "parent_id" UUID NOT NULL,
    "email_notifications" BOOLEAN NOT NULL DEFAULT true,
    "sms_notifications" BOOLEAN NOT NULL DEFAULT false,
    "reservation_reminders" BOOLEAN NOT NULL DEFAULT true,
    "billing_reminders" BOOLEAN NOT NULL DEFAULT true,
    "emergency_alerts" BOOLEAN NOT NULL DEFAULT true,
    "require_pickup_pin" BOOLEAN NOT NULL DEFAULT true,
    "notify_on_check_in_out" BOOLEAN NOT NULL DEFAULT true,
    "notify_on_pickup_changes" BOOLEAN NOT NULL DEFAULT true,
    "emergency_contact_reminder" BOOLEAN NOT NULL DEFAULT true,
    "preferred_contact_method" TEXT,
    "preferred_reminder_timing" TEXT,
    "staff_notes" TEXT,
    "language_preference" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parent_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "config" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "config_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "stripe_prices" (
    "tier" TEXT NOT NULL,
    "price_id" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "parent_id" UUID NOT NULL,
    "stripe_subscription_id" TEXT NOT NULL,
    "plan_tier" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "stripe_status" TEXT,
    "next_billing_date" TIMESTAMPTZ(6),
    "current_period_end" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pending_plan_changes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "subscription_id" UUID NOT NULL,
    "new_plan_tier" TEXT NOT NULL,
    "effective_date" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pending_plan_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "stripe_event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "subscription_id" UUID,
    "payload" JSONB NOT NULL,
    "livemode" BOOLEAN NOT NULL DEFAULT false,
    "stripe_created_at" TIMESTAMPTZ(6),
    "status" TEXT NOT NULL DEFAULT 'received',
    "error" TEXT,
    "processed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservation_nights" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reservation_id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "program_capacity_id" UUID,
    "care_date" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "capacity_snapshot" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reservation_nights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "key" TEXT NOT NULL,
    "user_id" UUID,
    "request_path" TEXT NOT NULL,
    "response_status" INTEGER NOT NULL,
    "response_body" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL DEFAULT (now() + interval '24 hours'),

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "attendance_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reservation_night_id" UUID NOT NULL,
    "center_id" UUID,
    "child_id" UUID NOT NULL,
    "parent_id" UUID NOT NULL,
    "care_date" DATE NOT NULL,
    "attendance_status" TEXT NOT NULL DEFAULT 'expected',
    "expected_arrival_at" TIMESTAMPTZ(6),
    "checked_in_at" TIMESTAMPTZ(6),
    "checked_in_by_user_id" UUID,
    "check_in_method" TEXT,
    "arrival_notes" TEXT,
    "expected_departure_at" TIMESTAMPTZ(6),
    "checked_out_at" TIMESTAMPTZ(6),
    "checked_out_by_user_id" UUID,
    "check_out_method" TEXT,
    "checked_out_to_pickup_id" UUID,
    "pickup_verification_status" TEXT,
    "departure_notes" TEXT,
    "no_show_marked_at" TIMESTAMPTZ(6),
    "no_show_marked_by_user_id" UUID,
    "cancellation_after_cutoff" BOOLEAN NOT NULL DEFAULT false,
    "late_arrival_minutes" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "attendance_record_id" UUID NOT NULL,
    "reservation_night_id" UUID NOT NULL,
    "center_id" UUID,
    "child_id" UUID NOT NULL,
    "actor_user_id" UUID,
    "event_type" TEXT NOT NULL,
    "event_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "attendance_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "health_check_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "run_type" TEXT NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "status" TEXT NOT NULL DEFAULT 'running',
    "triggered_by_user_id" UUID,
    "summary" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "health_check_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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
    "detected_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(6),
    "resolved_by_user_id" UUID,
    "resolution_notes" TEXT,

    CONSTRAINT "health_issues_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "centers_slug_key" ON "centers"("slug");

-- CreateIndex
CREATE INDEX "idx_program_capacity_date_status" ON "program_capacity"("care_date", "status");

-- CreateIndex
CREATE UNIQUE INDEX "program_capacity_program_date_unique" ON "program_capacity"("program_id", "care_date");

-- CreateIndex
CREATE INDEX "idx_capacity_overrides_center_date" ON "capacity_overrides"("center_id", "care_date");

-- CreateIndex
CREATE INDEX "idx_capacity_overrides_program_date" ON "capacity_overrides"("program_id", "care_date");

-- CreateIndex
CREATE INDEX "idx_capacity_overrides_active" ON "capacity_overrides"("is_active", "care_date");

-- CreateIndex
CREATE INDEX "idx_capacity_overrides_created_by" ON "capacity_overrides"("created_by_user_id");

-- CreateIndex
CREATE INDEX "idx_override_events_override" ON "capacity_override_events"("capacity_override_id", "event_at");

-- CreateIndex
CREATE INDEX "idx_override_events_center_date" ON "capacity_override_events"("center_id", "care_date");

-- CreateIndex
CREATE INDEX "idx_override_events_type" ON "capacity_override_events"("event_type", "event_at");

-- CreateIndex
CREATE INDEX "idx_override_events_actor" ON "capacity_override_events"("actor_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "parents_email_key" ON "parents"("email");

-- CreateIndex
CREATE UNIQUE INDEX "parents_stripe_customer_id_key" ON "parents"("stripe_customer_id");

-- CreateIndex
CREATE INDEX "idx_children_parent_id" ON "children"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "child_allergies_child_id_allergen_custom_label_unique" ON "child_allergies"("child_id", "allergen", "custom_label");

-- CreateIndex
CREATE UNIQUE INDEX "child_allergy_action_plans_child_allergy_id_key" ON "child_allergy_action_plans"("child_allergy_id");

-- CreateIndex
CREATE UNIQUE INDEX "child_medical_profiles_child_id_key" ON "child_medical_profiles"("child_id");

-- CreateIndex
CREATE UNIQUE INDEX "child_emergency_contacts_child_id_priority_unique" ON "child_emergency_contacts"("child_id", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "child_emergency_contacts_child_id_phone_unique" ON "child_emergency_contacts"("child_id", "phone");

-- CreateIndex
CREATE INDEX "idx_child_events_child_created" ON "child_events"("child_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_child_events_type" ON "child_events"("event_type");

-- CreateIndex
CREATE INDEX "idx_attendance_child_created" ON "child_attendance_sessions"("child_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_attendance_status" ON "child_attendance_sessions"("status");

-- CreateIndex
CREATE INDEX "idx_reservation_events_res_created" ON "reservation_events"("reservation_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_reservation_events_type" ON "reservation_events"("event_type");

-- CreateIndex
CREATE INDEX "idx_incident_reports_child_created" ON "incident_reports"("child_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_incident_reports_status" ON "incident_reports"("status");

-- CreateIndex
CREATE INDEX "idx_incident_reports_severity" ON "incident_reports"("severity");

-- CreateIndex
CREATE INDEX "idx_staff_memberships_center_active" ON "center_staff_memberships"("center_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "center_staff_memberships_user_center_unique" ON "center_staff_memberships"("user_id", "center_id");

-- CreateIndex
CREATE UNIQUE INDEX "pickup_verifications_attendance_session_id_key" ON "pickup_verifications"("attendance_session_id");

-- CreateIndex
CREATE INDEX "idx_pickup_verifications_verified_at" ON "pickup_verifications"("verified_at");

-- CreateIndex
CREATE UNIQUE INDEX "uniq_plans_nights_per_week" ON "plans"("nights_per_week");

-- CreateIndex
CREATE INDEX "idx_blocks_week_start" ON "overnight_blocks"("week_start");

-- CreateIndex
CREATE INDEX "idx_blocks_parent_week" ON "overnight_blocks"("parent_id", "week_start");

-- CreateIndex
CREATE INDEX "idx_blocks_child_week" ON "overnight_blocks"("child_id", "week_start");

-- CreateIndex
CREATE INDEX "idx_reservations_date" ON "reservations"("date");

-- CreateIndex
CREATE INDEX "idx_reservations_block" ON "reservations"("overnight_block_id");

-- CreateIndex
CREATE INDEX "idx_waitlist_fifo" ON "waitlist"("date", "status", "created_at");

-- CreateIndex
CREATE INDEX "idx_waitlist_parent" ON "waitlist"("parent_id");

-- CreateIndex
CREATE INDEX "idx_payments_parent_id" ON "payments"("parent_id");

-- CreateIndex
CREATE INDEX "idx_payments_status" ON "payments"("status");

-- CreateIndex
CREATE INDEX "idx_billing_ledger_parent" ON "billing_ledger"("parent_id");

-- CreateIndex
CREATE INDEX "idx_billing_ledger_status" ON "billing_ledger"("status");

-- CreateIndex
CREATE INDEX "idx_billing_ledger_care_date" ON "billing_ledger"("care_date");

-- CreateIndex
CREATE INDEX "idx_billing_ledger_night" ON "billing_ledger"("reservation_night_id");

-- CreateIndex
CREATE INDEX "idx_credits_parent_applied" ON "credits"("parent_id", "applied");

-- CreateIndex
CREATE INDEX "idx_credits_related_date" ON "credits"("related_date");

-- CreateIndex
CREATE INDEX "idx_audit_log_entity" ON "audit_log"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "idx_audit_log_created" ON "audit_log"("created_at");

-- CreateIndex
CREATE INDEX "idx_pickup_events_child" ON "pickup_events"("child_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "parent_settings_parent_id_key" ON "parent_settings"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "stripe_prices_tier_mode_key" ON "stripe_prices"("tier", "mode");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_stripe_subscription_id_key" ON "subscriptions"("stripe_subscription_id");

-- CreateIndex
CREATE UNIQUE INDEX "pending_plan_changes_subscription_id_key" ON "pending_plan_changes"("subscription_id");

-- CreateIndex
CREATE UNIQUE INDEX "billing_events_stripe_event_id_key" ON "billing_events"("stripe_event_id");

-- CreateIndex
CREATE INDEX "idx_reservation_nights_reservation" ON "reservation_nights"("reservation_id");

-- CreateIndex
CREATE INDEX "idx_reservation_nights_date" ON "reservation_nights"("care_date");

-- CreateIndex
CREATE UNIQUE INDEX "reservation_nights_reservation_date_unique" ON "reservation_nights"("reservation_id", "care_date");

-- CreateIndex
CREATE UNIQUE INDEX "reservation_nights_child_date_unique" ON "reservation_nights"("child_id", "care_date");

-- CreateIndex
CREATE INDEX "idx_idempotency_keys_expires" ON "idempotency_keys"("expires_at");

-- CreateIndex
CREATE INDEX "idx_idempotency_keys_user" ON "idempotency_keys"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_reservation_night_id_key" ON "attendance_records"("reservation_night_id");

-- CreateIndex
CREATE INDEX "idx_attendance_records_center_date" ON "attendance_records"("center_id", "care_date");

-- CreateIndex
CREATE INDEX "idx_attendance_records_child_date" ON "attendance_records"("child_id", "care_date");

-- CreateIndex
CREATE INDEX "idx_attendance_records_status_date" ON "attendance_records"("attendance_status", "care_date");

-- CreateIndex
CREATE INDEX "idx_attendance_records_parent" ON "attendance_records"("parent_id");

-- CreateIndex
CREATE INDEX "idx_attendance_events_record" ON "attendance_events"("attendance_record_id", "event_at");

-- CreateIndex
CREATE INDEX "idx_attendance_events_night" ON "attendance_events"("reservation_night_id", "event_at");

-- CreateIndex
CREATE INDEX "idx_attendance_events_center" ON "attendance_events"("center_id", "event_at");

-- CreateIndex
CREATE INDEX "idx_attendance_events_type" ON "attendance_events"("event_type", "event_at");

-- CreateIndex
CREATE INDEX "idx_health_runs_status" ON "health_check_runs"("status", "started_at");

-- CreateIndex
CREATE INDEX "idx_health_runs_user" ON "health_check_runs"("triggered_by_user_id");

-- CreateIndex
CREATE INDEX "idx_health_issues_run" ON "health_issues"("health_check_run_id");

-- CreateIndex
CREATE INDEX "idx_health_issues_severity_status" ON "health_issues"("severity", "status");

-- CreateIndex
CREATE INDEX "idx_health_issues_type" ON "health_issues"("issue_type", "status");

-- CreateIndex
CREATE INDEX "idx_health_issues_date" ON "health_issues"("care_date");

-- AddForeignKey
ALTER TABLE "programs" ADD CONSTRAINT "programs_center_id_fkey" FOREIGN KEY ("center_id") REFERENCES "centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_capacity" ADD CONSTRAINT "program_capacity_center_id_fkey" FOREIGN KEY ("center_id") REFERENCES "centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_capacity" ADD CONSTRAINT "program_capacity_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capacity_overrides" ADD CONSTRAINT "capacity_overrides_center_id_fkey" FOREIGN KEY ("center_id") REFERENCES "centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capacity_overrides" ADD CONSTRAINT "capacity_overrides_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capacity_override_events" ADD CONSTRAINT "capacity_override_events_capacity_override_id_fkey" FOREIGN KEY ("capacity_override_id") REFERENCES "capacity_overrides"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "children" ADD CONSTRAINT "children_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "parents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "child_allergies" ADD CONSTRAINT "child_allergies_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "child_allergy_action_plans" ADD CONSTRAINT "child_allergy_action_plans_child_allergy_id_fkey" FOREIGN KEY ("child_allergy_id") REFERENCES "child_allergies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "child_medical_profiles" ADD CONSTRAINT "child_medical_profiles_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "child_emergency_contacts" ADD CONSTRAINT "child_emergency_contacts_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "child_authorized_pickups" ADD CONSTRAINT "child_authorized_pickups_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "child_events" ADD CONSTRAINT "child_events_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "child_attendance_sessions" ADD CONSTRAINT "child_attendance_sessions_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "child_attendance_sessions" ADD CONSTRAINT "child_attendance_sessions_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_events" ADD CONSTRAINT "reservation_events_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_reports" ADD CONSTRAINT "incident_reports_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_reports" ADD CONSTRAINT "incident_reports_attendance_session_id_fkey" FOREIGN KEY ("attendance_session_id") REFERENCES "child_attendance_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "center_staff_memberships" ADD CONSTRAINT "center_staff_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "parents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickup_verifications" ADD CONSTRAINT "pickup_verifications_attendance_session_id_fkey" FOREIGN KEY ("attendance_session_id") REFERENCES "child_attendance_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overnight_blocks" ADD CONSTRAINT "overnight_blocks_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "parents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overnight_blocks" ADD CONSTRAINT "overnight_blocks_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overnight_blocks" ADD CONSTRAINT "overnight_blocks_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_overnight_block_id_fkey" FOREIGN KEY ("overnight_block_id") REFERENCES "overnight_blocks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waitlist" ADD CONSTRAINT "waitlist_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waitlist" ADD CONSTRAINT "waitlist_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "parents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "parents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "overnight_blocks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_ledger" ADD CONSTRAINT "billing_ledger_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "parents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_ledger" ADD CONSTRAINT "billing_ledger_reservation_night_id_fkey" FOREIGN KEY ("reservation_night_id") REFERENCES "reservation_nights"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_ledger" ADD CONSTRAINT "billing_ledger_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credits" ADD CONSTRAINT "credits_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "parents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credits" ADD CONSTRAINT "credits_related_block_id_fkey" FOREIGN KEY ("related_block_id") REFERENCES "overnight_blocks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "parents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickup_events" ADD CONSTRAINT "pickup_events_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickup_events" ADD CONSTRAINT "pickup_events_pickup_person_id_fkey" FOREIGN KEY ("pickup_person_id") REFERENCES "child_authorized_pickups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickup_events" ADD CONSTRAINT "pickup_events_verified_by_staff_id_fkey" FOREIGN KEY ("verified_by_staff_id") REFERENCES "parents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent_settings" ADD CONSTRAINT "parent_settings_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "parents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "parents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_plan_changes" ADD CONSTRAINT "pending_plan_changes_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_nights" ADD CONSTRAINT "reservation_nights_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_nights" ADD CONSTRAINT "reservation_nights_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_nights" ADD CONSTRAINT "reservation_nights_program_capacity_id_fkey" FOREIGN KEY ("program_capacity_id") REFERENCES "program_capacity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_reservation_night_id_fkey" FOREIGN KEY ("reservation_night_id") REFERENCES "reservation_nights"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_attendance_record_id_fkey" FOREIGN KEY ("attendance_record_id") REFERENCES "attendance_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_issues" ADD CONSTRAINT "health_issues_health_check_run_id_fkey" FOREIGN KEY ("health_check_run_id") REFERENCES "health_check_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

