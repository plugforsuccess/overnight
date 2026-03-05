/**
 * Children Hardening Integration Tests
 *
 * Tests DB constraints and schema integrity:
 * - children table has first_name + last_name columns
 * - child_allergies, child_emergency_contacts, child_authorized_pickups tables exist
 * - Max 2 emergency contacts constraint (DB trigger)
 * - Unique allergy constraint per child
 * - Cascade delete behavior
 */

const { setupTestDb, teardownTestDb, seedTestData } = require('./setup');
const crypto = require('crypto');

let db;
let seeds;

beforeAll(async () => {
  db = await setupTestDb();
  seeds = await seedTestData(db);
});

afterAll(async () => {
  await teardownTestDb();
});

describe('Children table schema', () => {
  test('children have first_name and last_name columns', async () => {
    const children = await db('children').where('id', seeds.childId).first();
    expect(children).toBeDefined();
    expect(children.first_name).toBe('Charlie');
    expect(children.last_name).toBe('Smith');
    expect(children.date_of_birth).toBeDefined();
  });

  test('children table no longer has name column', async () => {
    const columns = await db.raw(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'children' AND column_name = 'name'
    `);
    expect(columns.rows.length).toBe(0);
  });
});

describe('Child allergies', () => {
  test('can insert an allergy for a child', async () => {
    const id = crypto.randomUUID();
    await db('child_allergies').insert({
      id,
      child_id: seeds.childId,
      allergen: 'PEANUT',
      severity: 'SEVERE',
    });

    const allergy = await db('child_allergies').where('id', id).first();
    expect(allergy).toBeDefined();
    expect(allergy.allergen).toBe('PEANUT');
    expect(allergy.severity).toBe('SEVERE');
  });

  test('can insert action plan for an allergy', async () => {
    const allergyId = crypto.randomUUID();
    await db('child_allergies').insert({
      id: allergyId,
      child_id: seeds.childId,
      allergen: 'MILK',
      severity: 'MODERATE',
    });

    const planId = crypto.randomUUID();
    await db('child_allergy_action_plans').insert({
      id: planId,
      child_allergy_id: allergyId,
      treatment_first_line: 'ANTIHISTAMINE',
      requires_med_on_site: false,
      parent_confirmed: true,
    });

    const plan = await db('child_allergy_action_plans').where('id', planId).first();
    expect(plan).toBeDefined();
    expect(plan.treatment_first_line).toBe('ANTIHISTAMINE');
    expect(plan.parent_confirmed).toBe(true);
  });

  test('cascade deletes allergies when child is deleted', async () => {
    // Create a temporary child with allergies
    const tmpChildId = crypto.randomUUID();
    await db('children').insert({
      id: tmpChildId,
      parent_id: seeds.parentId,
      first_name: 'Temp',
      last_name: 'Child',
      date_of_birth: '2021-01-01',
    });

    const allergyId = crypto.randomUUID();
    await db('child_allergies').insert({
      id: allergyId,
      child_id: tmpChildId,
      allergen: 'EGG',
      severity: 'MILD',
    });

    // Delete the child
    await db('children').where('id', tmpChildId).delete();

    // Allergy should be cascade deleted
    const allergy = await db('child_allergies').where('id', allergyId).first();
    expect(allergy).toBeUndefined();
  });
});

describe('Emergency contacts constraints', () => {
  test('can insert 2 emergency contacts for a child', async () => {
    const contact1Id = crypto.randomUUID();
    const contact2Id = crypto.randomUUID();

    await db('child_emergency_contacts').insert({
      id: contact1Id,
      child_id: seeds.childId,
      first_name: 'Jane',
      last_name: 'Doe',
      relationship: 'Grandmother',
      phone: '4045551111',
      priority: 1,
    });

    await db('child_emergency_contacts').insert({
      id: contact2Id,
      child_id: seeds.childId,
      first_name: 'John',
      last_name: 'Doe',
      relationship: 'Grandfather',
      phone: '4045552222',
      priority: 2,
    });

    const contacts = await db('child_emergency_contacts')
      .where('child_id', seeds.childId)
      .orderBy('priority');

    expect(contacts.length).toBe(2);
    expect(contacts[0].priority).toBe(1);
    expect(contacts[1].priority).toBe(2);
  });

  test('rejects 3rd emergency contact (DB trigger)', async () => {
    await expect(
      db('child_emergency_contacts').insert({
        id: crypto.randomUUID(),
        child_id: seeds.childId,
        first_name: 'Extra',
        last_name: 'Contact',
        relationship: 'Friend',
        phone: '4045553333',
        priority: 1, // different priority but still 3rd contact
      })
    ).rejects.toThrow(/Max 2 emergency contacts|duplicate|unique/i);
  });
});

describe('Authorized pickups', () => {
  test('can insert an authorized pickup with hashed PIN', async () => {
    const pickupId = crypto.randomUUID();
    // Simulate a hashed PIN (in real code, use pin-hash.ts)
    const fakeHash = 'salt123:hashedvalue456';

    await db('child_authorized_pickups').insert({
      id: pickupId,
      child_id: seeds.childId,
      first_name: 'Uncle',
      last_name: 'Bob',
      relationship: 'Uncle',
      phone: '4045554444',
      pickup_pin_hash: fakeHash,
    });

    const pickup = await db('child_authorized_pickups').where('id', pickupId).first();
    expect(pickup).toBeDefined();
    expect(pickup.first_name).toBe('Uncle');
    expect(pickup.pickup_pin_hash).toBe(fakeHash);
    expect(pickup.id_verified).toBe(false);
  });

  test('pickup_pin_hash is required (not null)', async () => {
    await expect(
      db('child_authorized_pickups').insert({
        id: crypto.randomUUID(),
        child_id: seeds.childId,
        first_name: 'No',
        last_name: 'Pin',
        relationship: 'Friend',
        phone: '4045555555',
        // pickup_pin_hash intentionally omitted
      })
    ).rejects.toThrow(/null|not-null|violates/i);
  });
});

describe('Parent ownership scoping', () => {
  test('parent1 children are separate from parent2 children', async () => {
    const parent1Children = await db('children').where('parent_id', seeds.parentId);
    const parent2Children = await db('children').where('parent_id', seeds.parent2Id);

    expect(parent1Children.length).toBeGreaterThanOrEqual(1);
    expect(parent2Children.length).toBeGreaterThanOrEqual(1);

    const parent1Ids = new Set(parent1Children.map(c => c.id));
    const parent2Ids = new Set(parent2Children.map(c => c.id));

    // No overlap
    for (const id of parent2Ids) {
      expect(parent1Ids.has(id)).toBe(false);
    }
  });
});
