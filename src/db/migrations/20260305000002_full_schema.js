/**
 * Full schema migration – replaces the initial schema with the complete
 * table set: users, children, plans, subscriptions, reservation_weeks,
 * reservations, night_capacity, waitlist, audit_log.
 */

exports.up = function (knex) {
  return knex.schema
    // Drop old tables from initial migration
    .dropTableIfExists('waitlist')
    .dropTableIfExists('reservations')
    .dropTableIfExists('overnight_blocks')
    .dropTableIfExists('children')
    .dropTableIfExists('parents')
    .dropTableIfExists('config')
    .then(() =>
      knex.schema
        // ── users (parents + admins) ──
        .createTable('users', (t) => {
          t.uuid('id').primary().defaultTo(knex.fn.uuid());
          t.string('email').notNullable().unique();
          t.string('full_name').notNullable();
          t.string('phone');
          t.string('role').notNullable().defaultTo('parent');
          t.string('stripe_customer_id').unique();
          t.timestamps(true, true);
        })

        // ── children ──
        .createTable('children', (t) => {
          t.uuid('id').primary().defaultTo(knex.fn.uuid());
          t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
          t.string('full_name').notNullable();
          t.date('date_of_birth').notNullable();
          t.text('allergies');
          t.text('medical_notes');
          t.string('emergency_contact_name').notNullable();
          t.string('emergency_contact_phone').notNullable();
          t.timestamps(true, true);

          t.index('user_id');
        })

        // ── plans (catalog) ──
        .createTable('plans', (t) => {
          t.uuid('id').primary().defaultTo(knex.fn.uuid());
          t.string('plan_key').notNullable().unique();
          t.integer('nights_per_week').notNullable();
          t.integer('weekly_price_cents').notNullable();
          t.boolean('active').notNullable().defaultTo(true);
          t.timestamps(true, true);
        })

        // ── subscriptions ──
        .createTable('subscriptions', (t) => {
          t.uuid('id').primary().defaultTo(knex.fn.uuid());
          t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
          t.string('stripe_customer_id');
          t.string('stripe_subscription_id').unique();
          t.string('plan_key').notNullable().references('plan_key').inTable('plans');
          t.string('status').notNullable().defaultTo('active');
          t.datetime('current_period_start');
          t.datetime('current_period_end');
          t.datetime('next_bill_at');
          t.timestamps(true, true);

          t.index('user_id');
          t.index('status');
        })

        // ── reservation_weeks ──
        .createTable('reservation_weeks', (t) => {
          t.uuid('id').primary().defaultTo(knex.fn.uuid());
          t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
          t.date('week_start_date').notNullable();
          t.string('plan_key').notNullable().references('plan_key').inTable('plans');
          t.string('status').notNullable().defaultTo('active');
          t.timestamps(true, true);

          t.unique(['user_id', 'week_start_date']);
          t.index('user_id');
        })

        // ── reservations ──
        .createTable('reservations', (t) => {
          t.uuid('id').primary().defaultTo(knex.fn.uuid());
          t.uuid('reservation_week_id').notNullable().references('id').inTable('reservation_weeks').onDelete('CASCADE');
          t.uuid('child_id').notNullable().references('id').inTable('children').onDelete('CASCADE');
          t.date('date').notNullable();
          t.string('status').notNullable().defaultTo('confirmed');
          t.timestamps(true, true);

          t.unique(['child_id', 'date']);
          t.index('date');
        })

        // ── night_capacity ──
        .createTable('night_capacity', (t) => {
          t.date('date').primary();
          t.integer('capacity').notNullable().defaultTo(6);
          t.timestamp('updated_at').defaultTo(knex.fn.now());
        })

        // ── waitlist ──
        .createTable('waitlist', (t) => {
          t.uuid('id').primary().defaultTo(knex.fn.uuid());
          t.date('date').notNullable();
          t.uuid('child_id').notNullable().references('id').inTable('children').onDelete('CASCADE');
          t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
          t.string('status').notNullable().defaultTo('waiting');
          t.datetime('offered_expires_at');
          t.timestamps(true, true);

          t.index(['date', 'created_at']);
        })

        // ── audit_log ──
        .createTable('audit_log', (t) => {
          t.uuid('id').primary().defaultTo(knex.fn.uuid());
          t.uuid('actor_id').notNullable().references('id').inTable('users');
          t.string('action').notNullable();
          t.string('entity_type').notNullable();
          t.uuid('entity_id');
          t.json('metadata').defaultTo('{}');
          t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

          t.index('actor_id');
          t.index(['entity_type', 'entity_id']);
          t.index('created_at');
        })
    )
    .then(() =>
      // Seed plan tiers
      knex('plans').insert([
        { plan_key: 'plan_1n', nights_per_week: 1, weekly_price_cents: 9500 },
        { plan_key: 'plan_2n', nights_per_week: 2, weekly_price_cents: 18000 },
        { plan_key: 'plan_3n', nights_per_week: 3, weekly_price_cents: 25500 },
        { plan_key: 'plan_4n', nights_per_week: 4, weekly_price_cents: 32000 },
        { plan_key: 'plan_5n', nights_per_week: 5, weekly_price_cents: 37500 },
      ])
    );
};

exports.down = function (knex) {
  return knex.schema
    .dropTableIfExists('audit_log')
    .dropTableIfExists('waitlist')
    .dropTableIfExists('night_capacity')
    .dropTableIfExists('reservations')
    .dropTableIfExists('reservation_weeks')
    .dropTableIfExists('subscriptions')
    .dropTableIfExists('plans')
    .dropTableIfExists('children')
    .dropTableIfExists('users');
};
