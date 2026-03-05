const express = require('express');
const reservationService = require('../services/reservation');
const capacityService = require('../services/capacity');
const { authenticate } = require('../middleware/auth');
const { validate, createReservationSchema, swapNightSchema } = require('../middleware/validate');
const { logAudit } = require('../middleware/audit');

const router = express.Router();
router.use(authenticate);

// Small helper to avoid unhandled promise rejections
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Get capacity info for a list of dates
router.get('/capacity', asyncHandler(async (req, res) => {
  const { dates } = req.query; // comma-separated dates
  if (!dates) return res.status(400).json({ error: 'dates query param required (comma-separated)' });

  const dateList = String(dates)
    .split(',')
    .map((d) => d.trim())
    .filter(Boolean);

  if (dateList.length === 0) return res.status(400).json({ error: 'No valid dates provided' });

  const info = await capacityService.getCapacityForDates(dateList);
  res.json(info);
}));

// Get available nights for a week
router.get('/week/:weekStart', asyncHandler(async (req, res) => {
  const { weekStart } = req.params;
  const dates = reservationService.getWeekDates(weekStart);
  const info = await capacityService.getCapacityForDates(dates);
  res.json({ weekStart, nights: info });
}));

// Create a reservation (book a weekly plan)
router.post('/', validate(createReservationSchema), asyncHandler(async (req, res) => {
  const { childId, weekStart, nightsPerWeek, selectedDates } = req.body;

  if (selectedDates.length !== nightsPerWeek) {
    return res.status(400).json({ error: 'selectedDates must match nightsPerWeek length' });
  }

  const result = await reservationService.createReservation({
    childId,
    parentId: req.parent.id,           // must be enforced in service queries
    weekStart,
    nightsPerWeek,
    selectedDates,
  });

  if (result?.error) return res.status(409).json(result);
  await logAudit(req.parent.id, 'reservation_created', 'reservation', result.blockId, { weekStart, nightsPerWeek, childId });
  res.status(201).json(result);
}));

// Swap a night within an existing block
router.put('/:blockId/swap', validate(swapNightSchema), asyncHandler(async (req, res) => {
  const { dropDate, addDate } = req.body;

  const result = await reservationService.swapNights({
    parentId: req.parent.id,           // REQUIRED for ownership enforcement
    blockId: req.params.blockId,
    dropDate,
    addDate,
  });

  if (result?.error) return res.status(409).json(result);
  res.json(result);
}));

// Cancel a single reservation
router.delete('/:reservationId', asyncHandler(async (req, res) => {
  const result = await reservationService.cancelReservation({
    parentId: req.parent.id,           // REQUIRED for ownership enforcement
    reservationId: req.params.reservationId
  });

  if (result?.error) return res.status(404).json(result);
  await logAudit(req.parent.id, 'reservation_canceled', 'reservation', req.params.reservationId, {});
  res.json(result);
}));

// Cancel an entire block
router.delete('/block/:blockId', asyncHandler(async (req, res) => {
  const result = await reservationService.cancelBlock({
    parentId: req.parent.id,           // REQUIRED for ownership enforcement
    blockId: req.params.blockId
  });

  if (result?.error) return res.status(404).json(result);
  res.json(result);
}));

// Get reservations for a child (must enforce ownership)
router.get('/child/:childId', asyncHandler(async (req, res) => {
  const reservations = await reservationService.getReservationsForChild({
    parentId: req.parent.id,           // REQUIRED for ownership enforcement
    childId: req.params.childId
  });
  res.json(reservations);
}));

module.exports = router;