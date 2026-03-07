// src/db/index.js
//
// @deprecated — Legacy Knex singleton. Not used by the active Next.js application.
// Retained only for Express billing services (src/billing/, src/routes/).
// See ARCHITECTURE.md > Legacy Code Boundary.

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