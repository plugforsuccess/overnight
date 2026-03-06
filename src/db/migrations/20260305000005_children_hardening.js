/**
 * Migration: Children Hardening
 *
 * - Splits children.name into first_name + last_name
 * - Creates child_allergies, child_allergy_action_plans,
 *   child_emergency_contacts, child_authorized_pickups tables
 * - Adds enums for allergy_type, allergy_severity, treatment_type
 */

exports.up = async function (knex) {
  // ── 1a. Alter parents: split name → first_name + last_name ──────────
  await knex.schema.alterTable('parents', (t) => {
    t.string('first_name');
    t.string('last_name');
  });

  await knex.raw(`
    UPDATE parents
    SET first_name = CASE
          WHEN position(' ' in name) > 0 THEN left(name, position(' ' in name) - 1)
          ELSE name
        END,
        last_name = CASE
          WHEN position(' ' in name) > 0 THEN substring(name from position(' ' in name) + 1)
          ELSE ''
        END
    WHERE first_name IS NULL
  `);

  await knex.schema.alterTable('parents', (t) => {
    t.string('first_name').notNullable().alter();
    t.string('last_name').notNullable().alter();
    t.dropColumn('name');
  });

  // ── 1b. Alter children: split name → first_name + last_name ──────────
  await knex.schema.alterTable('children', (t) => {
    t.string('first_name');
    t.string('last_name');
  });

  // Migrate existing data: split name at first space
  await knex.raw(`
    UPDATE children
    SET first_name = CASE
          WHEN position(' ' in name) > 0 THEN left(name, position(' ' in name) - 1)
          ELSE name
        END,
        last_name = CASE
          WHEN position(' ' in name) > 0 THEN substring(name from position(' ' in name) + 1)
          ELSE ''
        END
    WHERE first_name IS NULL
  `);

  // Now make them NOT NULL and drop old column
  await knex.schema.alterTable('children', (t) => {
    t.string('first_name').notNullable().alter();
    t.string('last_name').notNullable().alter();
    t.dropColumn('name');
  });

  // ── 2. Create enums ─────────────────────────────────────────────────
  await knex.raw(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'allergy_type') THEN
        CREATE TYPE allergy_type AS ENUM (
          'PEANUT','TREE_NUT','MILK','EGG','WHEAT','SOY','FISH','SHELLFISH','SESAME',
          'PENICILLIN','INSECT_STING','LATEX','ASTHMA','ENVIRONMENTAL','OTHER'
        );
      END IF;

      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'allergy_severity') THEN
        CREATE TYPE allergy_severity AS ENUM ('UNKNOWN','MILD','MODERATE','SEVERE');
      END IF;

      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'treatment_type') THEN
        CREATE TYPE treatment_type AS ENUM (
          'NONE','ANTIHISTAMINE','EPINEPHRINE_AUTOINJECTOR','INHALER','CALL_911','OTHER'
        );
      END IF;
    END $$;
  `);

  // ── 3. child_allergies ──────────────────────────────────────────────
  await knex.schema.createTable('child_allergies', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('child_id').notNullable().references('id').inTable('children').onDelete('CASCADE');
    t.specificType('allergen', 'allergy_type').notNullable();
    t.string('custom_label');
    t.specificType('severity', 'allergy_severity').notNullable().defaultTo('UNKNOWN');
    t.timestamps(true, true);
  });

  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_child_allergies_child_allergen
    ON child_allergies (child_id, allergen, COALESCE(custom_label, ''));
  `);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_child_allergies_child_id ON child_allergies(child_id);`);

  // ── 4. child_allergy_action_plans ───────────────────────────────────
  await knex.schema.createTable('child_allergy_action_plans', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('child_allergy_id').notNullable().unique().references('id').inTable('child_allergies').onDelete('CASCADE');
    t.specificType('treatment_first_line', 'treatment_type').notNullable().defaultTo('NONE');
    t.text('dose_instructions');
    t.jsonb('symptoms_watch');
    t.string('med_location');
    t.boolean('requires_med_on_site').notNullable().defaultTo(false);
    t.date('medication_expires_on');
    t.string('physician_name');
    t.boolean('parent_confirmed').notNullable().defaultTo(false);
    t.timestamp('parent_confirmed_at');
    t.timestamps(true, true);
  });

  // ── 5. child_emergency_contacts ─────────────────────────────────────
  await knex.schema.createTable('child_emergency_contacts', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('child_id').notNullable().references('id').inTable('children').onDelete('CASCADE');
    t.string('first_name').notNullable();
    t.string('last_name').notNullable();
    t.string('relationship').notNullable();
    t.string('phone').notNullable();
    t.string('phone_alt');
    t.integer('priority').notNullable().defaultTo(1);
    t.boolean('authorized_for_pickup').notNullable().defaultTo(false);
    t.timestamps(true, true);

    t.unique(['child_id', 'priority']);
  });

  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_child_emergency_contacts_child_id ON child_emergency_contacts(child_id);`);

  // Enforce max 2 contacts per child (DB trigger)
  await knex.raw(`
    CREATE OR REPLACE FUNCTION enforce_max_two_emergency_contacts()
    RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE
      c int;
    BEGIN
      SELECT count(*) INTO c
      FROM child_emergency_contacts
      WHERE child_id = NEW.child_id
        AND (TG_OP = 'INSERT' OR id <> NEW.id);

      IF c >= 2 THEN
        RAISE EXCEPTION 'Max 2 emergency contacts allowed per child';
      END IF;

      RETURN NEW;
    END;
    $$;

    DROP TRIGGER IF EXISTS trg_max_two_emergency_contacts ON child_emergency_contacts;
    CREATE TRIGGER trg_max_two_emergency_contacts
    BEFORE INSERT OR UPDATE ON child_emergency_contacts
    FOR EACH ROW EXECUTE FUNCTION enforce_max_two_emergency_contacts();
  `);

  // ── 6. child_authorized_pickups ─────────────────────────────────────
  await knex.schema.createTable('child_authorized_pickups', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('child_id').notNullable().references('id').inTable('children').onDelete('CASCADE');
    t.string('first_name').notNullable();
    t.string('last_name').notNullable();
    t.string('relationship').notNullable();
    t.string('phone').notNullable();
    t.string('pickup_pin_hash').notNullable();
    t.boolean('id_verified').notNullable().defaultTo(false);
    t.timestamp('id_verified_at');
    t.uuid('id_verified_by');
    t.text('notes');
    t.timestamps(true, true);
  });

  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_child_authorized_pickups_child_id ON child_authorized_pickups(child_id);`);

  // ── 7. audit_events for children domain ─────────────────────────────
  // Reuse existing audit_log table — no new table needed.
};

exports.down = async function (knex) {
  // Drop in reverse order
  await knex.raw('DROP TRIGGER IF EXISTS trg_max_two_emergency_contacts ON child_emergency_contacts');
  await knex.raw('DROP FUNCTION IF EXISTS enforce_max_two_emergency_contacts');

  await knex.schema.dropTableIfExists('child_authorized_pickups');
  await knex.schema.dropTableIfExists('child_emergency_contacts');
  await knex.schema.dropTableIfExists('child_allergy_action_plans');
  await knex.schema.dropTableIfExists('child_allergies');

  // Restore children.name from first_name + last_name
  await knex.schema.alterTable('children', (t) => {
    t.string('name');
  });

  await knex.raw(`
    UPDATE children
    SET name = TRIM(CONCAT(first_name, ' ', last_name))
    WHERE name IS NULL
  `);

  await knex.schema.alterTable('children', (t) => {
    t.string('name').notNullable().alter();
    t.dropColumn('first_name');
    t.dropColumn('last_name');
  });

  // Restore parents.name from first_name + last_name
  await knex.schema.alterTable('parents', (t) => {
    t.string('name');
  });

  await knex.raw(`
    UPDATE parents
    SET name = TRIM(CONCAT(first_name, ' ', last_name))
    WHERE name IS NULL
  `);

  await knex.schema.alterTable('parents', (t) => {
    t.string('name').notNullable().alter();
    t.dropColumn('first_name');
    t.dropColumn('last_name');
  });

  await knex.raw(`
    DROP TYPE IF EXISTS treatment_type;
    DROP TYPE IF EXISTS allergy_severity;
    DROP TYPE IF EXISTS allergy_type;
  `);
};
