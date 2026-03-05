const db = require('../db');

async function get(key) {
  const row = await db('config').where({ key }).first();
  return row ? row.value : null;
}

async function getInt(key) {
  const val = await get(key);
  return val !== null ? parseInt(val, 10) : null;
}

async function set(key, value) {
  const exists = await db('config').where({ key }).first();
  if (exists) {
    await db('config').where({ key }).update({ value: String(value) });
  } else {
    await db('config').insert({ key, value: String(value) });
  }
}

module.exports = { get, getInt, set };
