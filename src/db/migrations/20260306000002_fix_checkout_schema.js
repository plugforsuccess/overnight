/**
 * Migration: Fix checkout schema issues
 *
 * 1. Make overnight_blocks.plan_id nullable (plan catalog may not be populated)
 * 2. Create payments table (used by webhook handler)
 * 3. Create admin_settings table (used by schedule page)
 */

exports.up = async function (knex) {
  // 1. Make plan_id nullable on overnight_blocks
  await knex.schema.alterTable('overnight_blocks', (t) => {
    // Drop the NOT NULL constraint on plan_id
    t.uuid('plan_id').nullable().alter();
  });

  // 2. Create payments table
  const paymentsExists = await knex.schema.hasTable('payments');
  if (!paymentsExists) {
    await knex.schema.createTable('payments', (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.uuid('parent_id').notNullable().references('id').inTable('parents').onDelete('CASCADE');
      t.uuid('plan_id').references('id').inTable('overnight_blocks').onDelete('SET NULL');
      t.integer('amount_cents').notNullable();
      t.string('status').notNullable().defaultTo('pending'); // pending, succeeded, failed, refunded
      t.string('description');
      t.string('stripe_payment_intent_id');
      t.string('stripe_invoice_id');
      t.timestamps(true, true);

      t.index(['parent_id'], 'idx_payments_parent_id');
      t.index(['status'], 'idx_payments_status');
    });
  }

  // 3. Create admin_settings table
  const adminSettingsExists = await knex.schema.hasTable('admin_settings');
  if (!adminSettingsExists) {
    await knex.schema.createTable('admin_settings', (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.integer('max_capacity').notNullable().defaultTo(6);
      t.integer('min_enrollment').notNullable().defaultTo(4);
      t.jsonb('pricing_tiers').notNullable().defaultTo(
        JSON.stringify([
          { nights: 3, price_cents: 30000 },
          { nights: 4, price_cents: 36000 },
          { nights: 5, price_cents: 42500 },
        ])
      );
      t.jsonb('operating_nights').notNullable().defaultTo(
        JSON.stringify(['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'])
      );
      t.timestamps(true, true);
    });

    // Seed a default row
    await knex('admin_settings').insert({
      max_capacity: 6,
      min_enrollment: 4,
      pricing_tiers: JSON.stringify([
        { nights: 3, price_cents: 30000 },
        { nights: 4, price_cents: 36000 },
        { nights: 5, price_cents: 42500 },
      ]),
      operating_nights: JSON.stringify([
        'sunday', 'monday', 'tuesday', 'wednesday', 'thursday',
      ]),
    });
  }
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('admin_settings');
  await knex.schema.dropTableIfExists('payments');

  // Restore NOT NULL on plan_id
  await knex.schema.alterTable('overnight_blocks', (t) => {
    t.uuid('plan_id').notNullable().alter();
  });
};
