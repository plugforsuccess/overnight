// services/capacity.js
const db = require('../db');
const configService = require('./config');

function assertYmd(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr))) {
    const err = new Error(`Invalid date format: ${dateStr}`);
    err.code = 'BAD_DATE';
    throw err;
  }
}

async function getDefaultCapacity() {
  return (await configService.getInt('capacity_per_night')) || 6;
}

async function getDefaultMinEnrollment() {
  return (await configService.getInt('min_enrollment_per_night')) || 4;
}

async function ensureNightRows(dates) {
  const unique = Array.from(new Set(dates.map(String)));
  unique.forEach(assertYmd);

  // Create rows if missing so later code can lock and reference them consistently
  const defaults = await Promise.all([getDefaultCapacity(), getDefaultMinEnrollment()]);
  const [capacity, minEnrollment] = defaults;

  const rows = unique.map((date) => ({
    date,
    capacity,
    min_enrollment: minEnrollment,
    status: 'open',
  }));

  await db('nightly_capacity')
    .insert(rows)
    .onConflict('date')
    .ignore();
}

/**
 * Returns authoritative capacity state per date.
 * IMPORTANT: This is for display. Enforcement must happen transactionally in reservation creation.
 */
async function getCapacityForDates(dates, opts = {}) {
  const unique = Array.from(new Set(dates.map(String)));
  unique.forEach(assertYmd);

  // Ensure nightly_capacity rows exist
  await ensureNightRows(unique);

  // Pull nightly_capacity rows
  const nights = await db('nightly_capacity')
    .whereIn('date', unique)
    .select('date', 'status', 'capacity', 'override_capacity', 'confirmed_count', 'min_enrollment');

  const nightMap = new Map(nights.map((n) => [n.date, n]));

  // confirmed_count is the fastest path; if you are not maintaining it yet,
  // you can fall back to counting confirmed reservations:
  const useReservationCounts = opts.useReservationCounts === true;

  let confirmedCountMap = {};
  if (useReservationCounts) {
    const counts = await db('reservations')
      .whereIn('date', unique)
      .andWhere({ status: 'confirmed' })
      .groupBy('date')
      .select('date')
      .count('* as count');

    for (const row of counts) confirmedCountMap[row.date] = Number(row.count);
  }

  return unique.sort().map((date) => {
    const n = nightMap.get(date) || {
      date,
      status: 'open',
      capacity: opts.defaultCapacity || 6,
      override_capacity: null,
      confirmed_count: 0,
      min_enrollment: opts.defaultMinEnrollment || 4,
    };

    const cap = n.override_capacity ?? n.capacity;
    const confirmed = useReservationCounts ? (confirmedCountMap[date] || 0) : Number(n.confirmed_count || 0);

    const remaining = Math.max(cap - confirmed, 0);
    const isClosed = n.status !== 'open' && n.status !== 'full';
    const isFull = remaining === 0;

    return {
      date,
      status: n.status,
      capacity: cap,
      reserved: confirmed,
      remaining,
      minEnrollment: Number(n.min_enrollment || 4),
      isBookable: !isClosed && !isFull,
    };
  });
}

async function hasCapacity(date) {
  assertYmd(date);
  const [info] = await getCapacityForDates([date]);
  return Boolean(info?.isBookable);
}

async function getRemainingCapacity(date) {
  assertYmd(date);
  const [info] = await getCapacityForDates([date]);
  return info ? info.remaining : 0;
}

module.exports = {
  getDefaultCapacity,
  getDefaultMinEnrollment,
  ensureNightRows,
  getCapacityForDates,
  hasCapacity,
  getRemainingCapacity,
};