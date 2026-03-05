const knex = require('knex');
const config = require('../knexfile');
const crypto = require('crypto');

let db;

async function setupTestDb() {
  db = knex(config.test);
  await db.migrate.latest();

  // Replace the db module's connection with our test connection
  jest.resetModules();

  return db;
}

async function teardownTestDb() {
  if (db) await db.destroy();
}

async function seedTestData(db) {
  const parentId = crypto.randomUUID();
  const parent2Id = crypto.randomUUID();
  const adminId = crypto.randomUUID();
  const childId = crypto.randomUUID();
  const child2Id = crypto.randomUUID();
  const child3Id = crypto.randomUUID();

  await db('parents').insert([
    { id: parentId, name: 'Alice', email: 'alice@test.com', phone: '+1111111111', is_admin: false },
    { id: parent2Id, name: 'Bob', email: 'bob@test.com', phone: '+2222222222', is_admin: false },
    { id: adminId, name: 'Admin', email: 'admin@test.com', phone: '+0000000000', is_admin: true },
  ]);

  await db('children').insert([
    { id: childId, parent_id: parentId, name: 'Charlie' },
    { id: child2Id, parent_id: parent2Id, name: 'Dana' },
    { id: child3Id, parent_id: parentId, name: 'Eve' },
  ]);

  return { parentId, parent2Id, adminId, childId, child2Id, child3Id };
}

module.exports = { setupTestDb, teardownTestDb, seedTestData };
