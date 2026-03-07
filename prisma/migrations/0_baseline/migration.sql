-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

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
    "date_of_birth" DATE,
    "name" TEXT,
    "allergies" TEXT,
    "photo_url" TEXT,
    "medical_notes" TEXT,
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
CREATE TABLE "child_emergency_contacts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "child_id" UUID NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "phone_alt" TEXT,
    "priority" INTEGER NOT NULL,
    "authorized_for_pickup" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "child_emergency_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "child_authorized_pickups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "child_id" UUID NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "pickup_pin_hash" TEXT NOT NULL,
    "id_verified" BOOLEAN NOT NULL DEFAULT false,
    "id_verified_at" TIMESTAMPTZ(6),
    "id_verified_by" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "child_authorized_pickups_pkey" PRIMARY KEY ("id")
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
CREATE UNIQUE INDEX "child_emergency_contacts_child_id_priority_unique" ON "child_emergency_contacts"("child_id", "priority");

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
CREATE INDEX "idx_credits_parent_applied" ON "credits"("parent_id", "applied");

-- CreateIndex
CREATE INDEX "idx_credits_related_date" ON "credits"("related_date");

-- CreateIndex
CREATE INDEX "idx_audit_log_entity" ON "audit_log"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "idx_audit_log_created" ON "audit_log"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "stripe_prices_tier_mode_key" ON "stripe_prices"("tier", "mode");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_stripe_subscription_id_key" ON "subscriptions"("stripe_subscription_id");

-- CreateIndex
CREATE UNIQUE INDEX "pending_plan_changes_subscription_id_key" ON "pending_plan_changes"("subscription_id");

-- CreateIndex
CREATE UNIQUE INDEX "billing_events_stripe_event_id_key" ON "billing_events"("stripe_event_id");

-- AddForeignKey
ALTER TABLE "children" ADD CONSTRAINT "children_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "parents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "child_allergies" ADD CONSTRAINT "child_allergies_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "child_allergy_action_plans" ADD CONSTRAINT "child_allergy_action_plans_child_allergy_id_fkey" FOREIGN KEY ("child_allergy_id") REFERENCES "child_allergies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "child_emergency_contacts" ADD CONSTRAINT "child_emergency_contacts_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "child_authorized_pickups" ADD CONSTRAINT "child_authorized_pickups_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
ALTER TABLE "credits" ADD CONSTRAINT "credits_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "parents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credits" ADD CONSTRAINT "credits_related_block_id_fkey" FOREIGN KEY ("related_block_id") REFERENCES "overnight_blocks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "parents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "parents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_plan_changes" ADD CONSTRAINT "pending_plan_changes_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

