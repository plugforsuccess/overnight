const express = require('express');
const reservationService = require('../services/reservation');
const capacityService = require('../services/capacity');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// Get capacity info for a list of dates
router.get('/capacity', async (req, res) => {
  const { dates } = req.query; // comma-separated dates
  if (!dates) return res.status(400).json({ error: 'dates query param required (comma-separated)' });

  const dateList = dates.split(',').map((d) => d.trim());
  const info = await capacityService.getCapacityForDates(dateList);
  res.json(info);
});

// Get available nights for a week
router.get('/week/:weekStart', async (req, res) => {
  const dates = reservationService.getWeekDates(req.params.weekStart);
  const info = await capacityService.getCapacityForDates(dates);
  res.json({ weekStart: req.params.weekStart, nights: info });
});

// Create a reservation (book a weekly plan)
router.post('/', async (req, res) => {
  const { childId, weekStart, nightsPerWeek, selectedDates } = req.body;
  if (!childId || !weekStart || !nightsPerWeek || !selectedDates) {
    return res.status(400).json({ error: 'childId, weekStart, nightsPerWeek, selectedDates required' });
  }

  const result = await reservationService.createReservation({
    childId,
    parentId: req.parent.id,
    weekStart,
    nightsPerWeek,
    selectedDates,
  });

  if (result.error) return res.status(409).json(result);
  res.status(201).json(result);
});

// Swap a night within an existing block
router.put('/:blockId/swap', async (req, res) => {
  const { dropDate, addDate } = req.body;
  if (!dropDate || !addDate) {
    return res.status(400).json({ error: 'dropDate and addDate required' });
  }

  const result = await reservationService.swapNights({
    blockId: req.params.blockId,
    dropDate,
    addDate,
  });

  if (result.error) return res.status(409).json(result);
  res.json(result);
});

// Cancel a single reservation
router.delete('/:reservationId', async (req, res) => {
  const result = await reservationService.cancelReservation(req.params.reservationId);
  if (result.error) return res.status(404).json(result);
  res.json(result);
});

// Cancel an entire block
router.delete('/block/:blockId', async (req, res) => {
  const result = await reservationService.cancelBlock(req.params.blockId);
  if (result.error) return res.status(404).json(result);
  res.json(result);
});

// Get reservations for a child
router.get('/child/:childId', async (req, res) => {
  const reservations = await reservationService.getReservationsForChild(req.params.childId);
  res.json(reservations);
});

module.exports = router;
