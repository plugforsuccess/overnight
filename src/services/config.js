// services/config.js
const db = require('../db');

const CONFIG_SCHEMA = {
  capacity_per_night: { type: 'int', min: 1, max: 12, default: 6 },
  min_enrollment_per_night: { type: 'int', min: 1, max: 12, default: 4 },
  waitlist_offer_ttl_minutes: { type: 'int', min: 5, max: 1440, default: 120 },
  weekly_billing_day: { type: 'string', allowed: ['friday'], default: 'friday' },
  weekly_billing_hour: { type: 'int', min: 0, max: 23, default: 12 },
  enrollment_cutoff_hour: { type: 'int', min: 0, max: 23, default: 13 },
  multi_child_discount_pct: { type: 'int', min: 0, max: 50, default: 10 },
};

const CACHE_TTL_MS = 60_000;
const cache = new Map(); // key -> { value, expiresAt }

function assertAllowedKey(key) {
  if (!CONFIG_SCHEMA[key]) {
    const err = new Error(`Config key not allowed: ${key}`);
    err.code = 'CONFIG_KEY_NOT_ALLOWED';
    throw err;
  }
}

function coerceAndValidate(key, value) {
  const schema = CONFIG_SCHEMA[key];

  if (schema.type === 'int') {
    const n = typeof value === 'number' ? value : parseInt(String(value), 10);
    if (!Number.isFinite(n)) {
      const err = new Error(`Invalid int for ${key}: ${value}`);
      err.code = 'CONFIG_INVALID';
      throw err;
    }
    if (schema.min != null && n < schema.min) throw Object.assign(new Error(`${key} must be >= ${schema.min}`), { code: 'CONFIG_INVALID' });
    if (schema.max != null && n > schema.max) throw Object.assign(new Error(`${key} must be <= ${schema.max}`), { code: 'CONFIG_INVALID' });
    return String(n);
  }

  if (schema.type === 'string') {
    const s = String(value);
    if (schema.allowed && !schema.allowed.includes(s)) {
      const err = new Error(`Invalid value for ${key}: ${s}`);
      err.code = 'CONFIG_INVALID';
      throw err;
    }
    return s;
  }

  // fallback
  return String(value);
}

async function get(key) {
  assertAllowedKey(key);

  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const row = await db('config').where({ key }).first();
  const val = row ? row.value : null;

  const value = val ?? String(CONFIG_SCHEMA[key].default);
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

async function getInt(key) {
  const val = await get(key);
  const n = parseInt(val, 10);
  if (!Number.isFinite(n)) return null;
  return n;
}

async function set(key, value) {
  assertAllowedKey(key);
  const validated = coerceAndValidate(key, value);

  await db('config')
    .insert({ key, value: validated })
    .onConflict('key')
    .merge({ value: validated });

  cache.delete(key);
  return { ok: true, key, value: validated };
}

module.exports = { get, getInt, set, CONFIG_SCHEMA };