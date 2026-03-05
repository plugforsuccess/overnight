exports.up = function (knex) {
  return knex.schema
    // -----------------------
    // parents
    // -----------------------
    .createTable('parents', (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.string('name').notNullable();
      t.string('email').notNullable().unique();
      t.string('phone');
      t.string('address');
      t.string('role').notNullable().defaultTo('parent');
      t.boolean('is_admin').notNullable().defaultTo(false);
      t.string('stripe_customer_id').unique();
      t.timestamps(true, true);
    })

    // -----------------------
    // children
    // -----------------------
    .createTable('children', (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.uuid('parent_id')
        .notNullable()
        .references('id')
        .inTable('parents')
        .onDelete('CASCADE');

      t.string('name').notNullable();
      t.date('date_of_birth');
      t.text('allergies');
      t.text('medical_notes');
      t.timestamps(true, true);

      t.index(['parent_id'], 'idx_children_parent_id');
    })

    // -----------------------
    // plans (source of truth)
    // -----------------------
    .createTable('plans', (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.string('name').notNullable(); // '3 nights', '4 nights', '5 nights'
      t.integer('nights_per_week').notNullable(); // 3,4,5
      t.integer('weekly_price_cents').notNullable();
      t.boolean('active').notNullable().defaultTo(true);
      t.timestamps(true, true);

      t.unique(['nights_per_week'], 'uniq_plans_nights_per_week');
    })

    // -----------------------
    // overnight_blocks (weekly enrollment + pricing snapshot)
    // -----------------------
    .createTable('overnight_blocks', (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

      t.date('week_start').notNullable(); // Sunday of the week
      t.uuid('parent_id').notNullable().references('id').inTable('parents').onDelete('CASCADE');
      t.uuid('child_id').notNullable().references('id').inTable('children').onDelete('CASCADE');

      t.uuid('plan_id').notNullable().references('id').inTable('plans');
      t.integer('nights_per_week').notNullable(); // snapshot (redundant but convenient)

      // pricing snapshot at time of purchase (critical for correct credits if pricing changes later)
      t.integer('weekly_price_cents').notNullable();
      t.integer('multi_child_discount_pct').notNullable().defaultTo(0);

      t.string('status').notNullable().defaultTo('active'); // active, cancelled, canceled_low_enrollment
      t.string('payment_status').notNullable().defaultTo('pending'); // pending, confirmed, locked

      // Stripe references (optional but recommended)
      t.string('stripe_subscription_id');
      t.string('stripe_invoice_id');

      t.timestamps(true, true);

      t.index(['week_start'], 'idx_blocks_week_start');
      t.index(['parent_id', 'week_start'], 'idx_blocks_parent_week');
      t.index(['child_id', 'week_start'], 'idx_blocks_child_week');
    })

    // -----------------------
    // reservations (night-level)
    // -----------------------
    .createTable('reservations', (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.uuid('child_id').notNullable().references('id').inTable('children').onDelete('CASCADE');
      t.date('date').notNullable(); // the night date
      t.uuid('overnight_block_id')
        .notNullable()
        .references('id')
        .inTable('overnight_blocks')
        .onDelete('CASCADE');

      t.string('status').notNullable().defaultTo('confirmed'); // pending_payment, confirmed, locked, canceled_low_enrollment
      t.boolean('admin_override').notNullable().defaultTo(false);

      t.timestamps(true, true);

      // prevent double booking same child on same night
      t.unique(['child_id', 'date'], 'uniq_reservations_child_date');

      t.index(['date'], 'idx_reservations_date');
      t.index(['overnight_block_id'], 'idx_reservations_block');
    })

    // -----------------------
    // nightly_capacity (authoritative nightly state)
    // -----------------------
    .createTable('nightly_capacity', (t) => {
      t.date('date').primary();

      // defaults come from config but are snapped per date for stability
      t.integer('capacity').notNullable().defaultTo(6);
      t.integer('min_enrollment').notNullable().defaultTo(4);

      // cached count for speed; maintain in app/jobs/txns
      t.integer('confirmed_count').notNullable().defaultTo(0);

      t.string('status').notNullable().defaultTo('open'); 
      // open, full, canceled_low_enrollment, canceled_admin

      t.integer('override_capacity'); // optional per-night override
      t.timestamps(true, true);
    })

    // -----------------------
    // waitlist
    // -----------------------
    .createTable('waitlist', (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.date('date').notNullable();

      t.uuid('child_id').notNullable().references('id').inTable('children').onDelete('CASCADE');
      t.uuid('parent_id').notNullable().references('id').inTable('parents').onDelete('CASCADE');

      t.string('status').notNullable().defaultTo('waiting'); // waiting, offered, accepted, expired, removed
      t.datetime('offered_at');
      t.datetime('expires_at');
      t.timestamps(true, true);

      t.index(['date', 'status', 'created_at'], 'idx_waitlist_date_status_created');
      t.index(['parent_id'], 'idx_waitlist_parent');
    })

    // -----------------------
    // credits
    // -----------------------
    .createTable('credits', (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.uuid('parent_id').notNullable().references('id').inTable('parents').onDelete('CASCADE');

      t.integer('amount_cents').notNullable();
      t.string('reason').notNullable(); // canceled_low_enrollment, admin_manual, refund

      t.uuid('related_block_id').references('id').inTable('overnight_blocks').onDelete('set null');
      t.date('related_date'); // the specific night that was canceled

      // Optional: record the plan snapshot that produced the credit for auditability
      t.integer('source_weekly_price_cents');
      t.integer('source_plan_nights');

      t.boolean('applied').notNullable().defaultTo(false);
      t.datetime('applied_at');
      t.timestamps(true, true);

      t.index(['parent_id', 'applied'], 'idx_credits_parent_applied');
      t.index(['related_date'], 'idx_credits_related_date');
    })

    // -----------------------
    // audit_log
    // -----------------------
    .createTable('audit_log', (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.uuid('actor_id').references('id').inTable('parents').onDelete('set null');

      t.string('action').notNullable();
      t.string('entity_type').notNullable();
      t.uuid('entity_id');

      // queryable metadata
      t.jsonb('metadata').notNullable().defaultTo(knex.raw(`'{}'::jsonb`));

      t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

      t.index(['entity_type', 'entity_id'], 'idx_audit_entity');
      t.index(['created_at'], 'idx_audit_created_at');
    })

    // -----------------------
    // config
    // -----------------------
    .createTable('config', (t) => {
      t.string('key').primary();
      t.string('value').notNullable();
    })

    // seed config + plans
    .then(() =>
      knex('config').insert([
        { key: 'capacity_per_night', value: '6' },
        { key: 'min_enrollment_per_night', value: '4' },
        { key: 'waitlist_offer_ttl_minutes', value: '120' },
        { key: 'weekly_billing_day', value: 'friday' },
        { key: 'weekly_billing_hour', value: '12' },
        { key: 'enrollment_cutoff_hour', value: '13' },
        { key: 'multi_child_discount_pct', value: '10' },
      ])
    )
    .then(() =>
      knex('plans').insert([
        { name: '3 nights', nights_per_week: 3, weekly_price_cents: 30000 },
        { name: '4 nights', nights_per_week: 4, weekly_price_cents: 36000 },
        { name: '5 nights', nights_per_week: 5, weekly_price_cents: 42500 },
      ])
    );
};

exports.down = function (knex) {
  return knex.schema
    .dropTableIfExists('config')
    .dropTableIfExists('audit_log')
    .dropTableIfExists('credits')
    .dropTableIfExists('waitlist')
    .dropTableIfExists('nightly_capacity')
    .dropTableIfExists('reservations')
    .dropTableIfExists('overnight_blocks')
    .dropTableIfExists('plans')
    .dropTableIfExists('children')
    .dropTableIfExists('parents');
};