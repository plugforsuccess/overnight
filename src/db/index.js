// src/db/index.js
const knex = require("knex");
const { knexConfig } = require("./connection");

let _db;

function getDb() {
  if (_db) return _db;
  _db = knex(knexConfig());
  return _db;
}

module.exports = getDb();
module.exports.getDb = getDb;