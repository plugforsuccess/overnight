exports.up = function (knex) {
  return knex.schema
    .createTable('parents', (t) => {
      t.uuid('id').primary();
      t.string('name').notNullable();
      t.string('email').notNullable().unique();
      t.string('phone');
      t.string('address');
      t.string('role').notNullable().defaultTo('parent');
      t.boolean('is_admin').defaultTo(false);
      t.string('stripe_customer_id').unique();
      t.timestamps(true, true);
    })
    .createTable('children', (t) => {
      t.uuid('id').primary();
      t.uuid('parent_id').notNullable().references('id').inTable('parents').onDelete('CASCADE');
      t.string('name').notNullable();
      t.date('date_of_birth');
      t.text('allergies');
      t.text('medical_notes');
      t.timestamps(true, true);
    })
    .createTable('overnight_blocks', (t) => {
      t.uuid('id').primary();
      t.date('week_start').notNullable(); // Sunday of the week
      t.integer('nights_per_week').notNullable(); // 3-5
      t.uuid('parent_id').notNullable().references('id').inTable('parents');
      t.uuid('child_id').notNullable().references('id').inTable('children');
      t.string('status').notNullable().defaultTo('active'); // active, cancelled, canceled_low_enrollment
      t.string('payment_status').notNullable().defaultTo('pending'); // pending, confirmed, locked
      t.timestamps(true, true);
    })
    .createTable('reservations', (t) => {
      t.uuid('id').primary();
      t.uuid('child_id').notNullable().references('id').inTable('children');
      t.date('date').notNullable(); // the night date
      t.uuid('overnight_block_id').notNullable().references('id').inTable('overnight_blocks');
      t.string('status').notNullable().defaultTo('confirmed'); // pending_payment, confirmed, locked, canceled_low_enrollment
      t.boolean('admin_override').defaultTo(false);
      t.timestamps(true, true);
      t.unique(['child_id', 'date']); // prevent double booking
    })
    .createTable('waitlist', (t) => {
      t.uuid('id').primary();
      t.date('date').notNullable();
      t.uuid('child_id').notNullable().references('id').inTable('children');
      t.uuid('parent_id').notNullable().references('id').inTable('parents');
      t.string('status').notNullable().defaultTo('waiting'); // waiting, offered, accepted, expired
      t.datetime('offered_at');
      t.datetime('expires_at');
      t.timestamps(true, true);
    })
    .createTable('credits', (t) => {
      t.uuid('id').primary();
      t.uuid('parent_id').notNullable().references('id').inTable('parents').onDelete('CASCADE');
      t.integer('amount_cents').notNullable();
      t.string('reason').notNullable(); // canceled_low_enrollment, admin_manual, refund
      t.uuid('related_block_id').references('id').inTable('overnight_blocks');
      t.date('related_date'); // the specific night that was canceled
      t.boolean('applied').notNullable().defaultTo(false);
      t.datetime('applied_at');
      t.timestamps(true, true);
    })
    .createTable('nightly_status', (t) => {
      t.date('date').primary();
      t.string('status').notNullable().defaultTo('open'); // open, canceled_low_enrollment, canceled_admin
      t.integer('override_capacity');
      t.timestamps(true, true);
    })
    .createTable('audit_log', (t) => {
      t.uuid('id').primary();
      t.uuid('actor_id').references('id').inTable('parents');
      t.string('action').notNullable();
      t.string('entity_type').notNullable();
      t.uuid('entity_id');
      t.text('metadata');
      t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    })
    .createTable('config', (t) => {
      t.string('key').primary();
      t.string('value').notNullable();
    })
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
    );
};

exports.down = function (knex) {
  return knex.schema
    .dropTableIfExists('audit_log')
    .dropTableIfExists('nightly_status')
    .dropTableIfExists('credits')
    .dropTableIfExists('waitlist')
    .dropTableIfExists('reservations')
    .dropTableIfExists('overnight_blocks')
    .dropTableIfExists('children')
    .dropTableIfExists('parents')
    .dropTableIfExists('config');
};
