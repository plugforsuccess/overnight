const db = require('../db');
const configService = require('./config');

async function getCapacity() {
  return (await configService.getInt('capacity_per_night')) || 6;
}

async function getReservationCount(date) {
  const result = await db('reservations')
    .where({ date })
    .count('* as count')
    .first();
  return result.count;
}

async function getRemainingCapacity(date) {
  const capacity = await getCapacity();
  const count = await getReservationCount(date);
  return capacity - count;
}

async function hasCapacity(date) {
  return (await getRemainingCapacity(date)) > 0;
}

async function getCapacityForDates(dates) {
  const capacity = await getCapacity();
  const counts = await db('reservations')
    .whereIn('date', dates)
    .groupBy('date')
    .select('date')
    .count('* as count');

  const countMap = {};
  for (const row of counts) {
    countMap[row.date] = row.count;
  }

  return dates.map((date) => ({
    date,
    reserved: countMap[date] || 0,
    remaining: capacity - (countMap[date] || 0),
    capacity,
  }));
}

module.exports = { getCapacity, getReservationCount, getRemainingCapacity, hasCapacity, getCapacityForDates };
