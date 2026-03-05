/**
 * Migration: create subscriptions + pending_plan_changes tables,
 * and add missing columns to billing_events.
 *
 * This supports the hardened subscription-service that uses Knex/Postgres
 * instead of SQLite, with proper idempotency and uniqueness constraints.
 */
exports.up = async function (knex) {
  // ── subscriptions ─────────────────────────────────────────────────────
  await knex.schema.createTable('subscriptions', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('parent_id')
      .notNullable()
      .references('id')
      .inTable('parents')
      .onDelete('CASCADE');
    t.string('stripe_subscription_id').notNullable().unique();
    t.string('plan_tier').notNullable();
    t.string('status').notNullable().defaultTo('incomplete');
    t.string('stripe_status').notNullable().defaultTo('incomplete');
    t.timestamptz('next_billing_date');
    t.timestamptz('current_period_end');
    t.timestamps(true, true);
  });

  // CHECK constraint on status
  await knex.raw(`
    ALTER TABLE subscriptions
      ADD CONSTRAINT chk_subscriptions_status
        CHECK (status IN ('active', 'past_due', 'canceled', 'incomplete'))
  `);

  // CHECK constraint on plan_tier
  await knex.raw(`
    ALTER TABLE subscriptions
      ADD CONSTRAINT chk_subscriptions_plan_tier
        CHECK (plan_tier IN ('plan_3n', 'plan_4n', 'plan_5n'))
  `);

  // Only one non-canceled subscription per parent at a time
  await knex.raw(`
    CREATE UNIQUE INDEX uniq_subscriptions_parent_active
      ON subscriptions (parent_id)
      WHERE status IN ('active', 'past_due', 'incomplete')
  `);

  // Index for lookups by stripe_subscription_id (already unique) and parent_id
  await knex.raw(`
    CREATE INDEX idx_subscriptions_parent_id ON subscriptions (parent_id)
  `);

  // ── pending_plan_changes ──────────────────────────────────────────────
  await knex.schema.createTable('pending_plan_changes', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('subscription_id')
      .notNullable()
      .unique()                    // one pending change per subscription
      .references('id')
      .inTable('subscriptions')
      .onDelete('CASCADE');
    t.string('new_plan_tier').notNullable();
    t.timestamptz('effective_date').notNullable();
    t.timestamps(true, true);
  });

  await knex.raw(`
    ALTER TABLE pending_plan_changes
      ADD CONSTRAINT chk_pending_plan_tier
        CHECK (new_plan_tier IN ('plan_3n', 'plan_4n', 'plan_5n'))
  `);

  // ── billing_events: add columns used by webhooks.ts ───────────────────
  const hasBillingEvents = await knex.schema.hasTable('billing_events');
  if (hasBillingEvents) {
    const hasStatus = await knex.schema.hasColumn('billing_events', 'status');
    if (!hasStatus) {
      await knex.schema.alterTable('billing_events', (t) => {
        t.boolean('livemode').defaultTo(false);
        t.timestamptz('stripe_created_at');
        t.string('status').defaultTo('received');
        t.text('error');
      });
    }
  }
};

exports.down = async function (knex) {
  // Remove added billing_events columns
  const hasBillingEvents = await knex.schema.hasTable('billing_events');
  if (hasBillingEvents) {
    const hasStatus = await knex.schema.hasColumn('billing_events', 'status');
    if (hasStatus) {
      await knex.schema.alterTable('billing_events', (t) => {
        t.dropColumn('livemode');
        t.dropColumn('stripe_created_at');
        t.dropColumn('status');
        t.dropColumn('error');
      });
    }
  }

  await knex.schema.dropTableIfExists('pending_plan_changes');
  await knex.schema.dropTableIfExists('subscriptions');
};
