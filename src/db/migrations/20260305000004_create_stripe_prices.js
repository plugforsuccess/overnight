/**
 * Migration: create stripe_prices cache table and align reservation status constraints.
 *
 * - stripe_prices caches Stripe Price IDs per plan tier and mode (test/live)
 *   so that getPriceId() reads from DB instead of hitting Stripe on every request.
 * - Adds "canceled" to the reservations CHECK constraint so the enum is aligned
 *   across DB, TypeScript types, and application logic.
 */
exports.up = async function (knex) {
  // ── stripe_prices table ───────────────────────────────────────────────
  await knex.schema.createTable("stripe_prices", (t) => {
    t.string("tier").notNullable();
    t.string("price_id").notNullable();
    t.string("mode").notNullable().defaultTo("test"); // 'test' or 'live'
    t.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());
    t.unique(["tier", "mode"]);
  });

  // ── Align reservation status constraint to include "canceled" ─────────
  await knex.raw(
    `ALTER TABLE reservations DROP CONSTRAINT IF EXISTS chk_reservations_status`
  );
  await knex.raw(`
    ALTER TABLE reservations
      ADD CONSTRAINT chk_reservations_status
        CHECK (status IN ('pending_payment', 'confirmed', 'locked', 'canceled', 'canceled_low_enrollment'))
  `);
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("stripe_prices");

  // Revert reservation status constraint
  await knex.raw(
    `ALTER TABLE reservations DROP CONSTRAINT IF EXISTS chk_reservations_status`
  );
  await knex.raw(`
    ALTER TABLE reservations
      ADD CONSTRAINT chk_reservations_status
        CHECK (status IN ('pending_payment', 'confirmed', 'locked', 'canceled_low_enrollment'))
  `);
};
