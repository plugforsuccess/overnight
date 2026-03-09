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
    { id: parentId, name: 'Alice', email: 'alice@test.com', phone: '+1111111111', role: 'parent' },
    { id: parent2Id, name: 'Bob', email: 'bob@test.com', phone: '+2222222222', role: 'parent' },
    { id: adminId, name: 'Admin', email: 'admin@test.com', phone: '+0000000000', role: 'admin' },
  ]);

  await db('children').insert([
    { id: childId, parent_id: parentId, first_name: 'Charlie', last_name: 'Smith', date_of_birth: '2020-01-01' },
    { id: child2Id, parent_id: parent2Id, first_name: 'Dana', last_name: 'Jones', date_of_birth: '2019-06-15' },
    { id: child3Id, parent_id: parentId, first_name: 'Eve', last_name: 'Smith', date_of_birth: '2021-03-20' },
  ]);

  return { parentId, parent2Id, adminId, childId, child2Id, child3Id };
}

module.exports = { setupTestDb, teardownTestDb, seedTestData };
