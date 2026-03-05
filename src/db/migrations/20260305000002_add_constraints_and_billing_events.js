/**
 * Migration: add check constraints, partial unique index, and billing_events table.
 *
 * These harden the schema beyond what the initial migration provided:
 * - CHECK constraints on status columns prevent invalid enum values at the DB level
 * - Partial unique index prevents double-booking confirmed children
 * - billing_events table provides Stripe webhook idempotency
 */
exports.up = async function (knex) {
  // ── Check constraints on status columns ──────────────────────────────

  await knex.raw(`
    ALTER TABLE overnight_blocks
      ADD CONSTRAINT chk_blocks_status
        CHECK (status IN ('active', 'cancelled', 'canceled_low_enrollment')),
      ADD CONSTRAINT chk_blocks_payment_status
        CHECK (payment_status IN ('pending', 'confirmed', 'locked'))
  `);

  await knex.raw(`
    ALTER TABLE reservations
      ADD CONSTRAINT chk_reservations_status
        CHECK (status IN ('pending_payment', 'confirmed', 'locked', 'canceled_low_enrollment'))
  `);

  await knex.raw(`
    ALTER TABLE nightly_capacity
      ADD CONSTRAINT chk_nightly_capacity_status
        CHECK (status IN ('open', 'full', 'canceled_low_enrollment', 'canceled_admin'))
  `);

  await knex.raw(`
    ALTER TABLE waitlist
      ADD CONSTRAINT chk_waitlist_status
        CHECK (status IN ('waiting', 'offered', 'accepted', 'expired', 'removed'))
  `);

  await knex.raw(`
    ALTER TABLE credits
      ADD CONSTRAINT chk_credits_reason
        CHECK (reason IN ('canceled_low_enrollment', 'admin_manual', 'refund'))
  `);

  await knex.raw(`
    ALTER TABLE parents
      ADD CONSTRAINT chk_parents_role
        CHECK (role IN ('parent', 'admin'))
  `);

  await knex.raw(`
    ALTER TABLE plans
      ADD CONSTRAINT chk_plans_nights
        CHECK (nights_per_week BETWEEN 1 AND 7)
  `);

  // ── Partial unique index: only confirmed reservations block double-booking
  // Drop the existing full unique and replace with a partial one.
  await knex.raw(`DROP INDEX IF EXISTS "uniq_reservations_child_date"`);
  await knex.raw(`
    CREATE UNIQUE INDEX uniq_reservations_child_date_confirmed
      ON reservations (child_id, date)
      WHERE status NOT IN ('canceled_low_enrollment')
  `);

  // ── billing_events (Stripe webhook idempotency) ──────────────────────
  await knex.schema.createTable('billing_events', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('stripe_event_id').notNullable().unique();
    t.string('event_type').notNullable();
    t.uuid('subscription_id');
    t.jsonb('payload').notNullable().defaultTo(knex.raw(`'{}'::jsonb`));
    t.timestamp('processed_at').notNullable().defaultTo(knex.fn.now());
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('billing_events');

  // Restore original full unique index
  await knex.raw(`DROP INDEX IF EXISTS "uniq_reservations_child_date_confirmed"`);
  await knex.raw(`
    CREATE UNIQUE INDEX uniq_reservations_child_date
      ON reservations (child_id, date)
  `);

  // Drop check constraints
  await knex.raw(`ALTER TABLE overnight_blocks DROP CONSTRAINT IF EXISTS chk_blocks_status`);
  await knex.raw(`ALTER TABLE overnight_blocks DROP CONSTRAINT IF EXISTS chk_blocks_payment_status`);
  await knex.raw(`ALTER TABLE reservations DROP CONSTRAINT IF EXISTS chk_reservations_status`);
  await knex.raw(`ALTER TABLE nightly_capacity DROP CONSTRAINT IF EXISTS chk_nightly_capacity_status`);
  await knex.raw(`ALTER TABLE waitlist DROP CONSTRAINT IF EXISTS chk_waitlist_status`);
  await knex.raw(`ALTER TABLE credits DROP CONSTRAINT IF EXISTS chk_credits_reason`);
  await knex.raw(`ALTER TABLE parents DROP CONSTRAINT IF EXISTS chk_parents_role`);
  await knex.raw(`ALTER TABLE plans DROP CONSTRAINT IF EXISTS chk_plans_nights`);
};
