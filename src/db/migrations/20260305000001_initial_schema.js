exports.up = function (knex) {
  return knex.schema
    .createTable('parents', (t) => {
      t.uuid('id').primary();
      t.string('name').notNullable();
      t.string('email').notNullable().unique();
      t.string('phone');
      t.boolean('is_admin').defaultTo(false);
      t.timestamps(true, true);
    })
    .createTable('children', (t) => {
      t.uuid('id').primary();
      t.uuid('parent_id').notNullable().references('id').inTable('parents');
      t.string('name').notNullable();
      t.date('date_of_birth');
      t.timestamps(true, true);
    })
    .createTable('overnight_blocks', (t) => {
      t.uuid('id').primary();
      t.date('week_start').notNullable(); // Sunday of the week
      t.integer('nights_per_week').notNullable(); // 1-5
      t.uuid('parent_id').notNullable().references('id').inTable('parents');
      t.uuid('child_id').notNullable().references('id').inTable('children');
      t.string('status').notNullable().defaultTo('active'); // active, cancelled
      t.timestamps(true, true);
    })
    .createTable('reservations', (t) => {
      t.uuid('id').primary();
      t.uuid('child_id').notNullable().references('id').inTable('children');
      t.date('date').notNullable(); // the night date
      t.uuid('overnight_block_id').notNullable().references('id').inTable('overnight_blocks');
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
    .createTable('config', (t) => {
      t.string('key').primary();
      t.string('value').notNullable();
    })
    .then(() =>
      knex('config').insert([
        { key: 'capacity_per_night', value: '6' },
        { key: 'waitlist_offer_ttl_minutes', value: '120' },
      ])
    );
};

exports.down = function (knex) {
  return knex.schema
    .dropTableIfExists('waitlist')
    .dropTableIfExists('reservations')
    .dropTableIfExists('overnight_blocks')
    .dropTableIfExists('children')
    .dropTableIfExists('parents')
    .dropTableIfExists('config');
};
