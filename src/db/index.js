// src/db/index.js
//
// Singleton Knex instance backed by Postgres.
// Every service that does `require('../db')` gets the same connection pool.

const knex = require("knex");
const { knexConfig } = require("./connection");

/** @type {import('knex').Knex | null} */
let _db = null;

function getDb() {
  if (_db) return _db;
  _db = knex(knexConfig());
  return _db;
}

module.exports = getDb();
module.exports.getDb = getDb;