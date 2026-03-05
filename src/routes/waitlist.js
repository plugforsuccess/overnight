const express = require('express');
const waitlistService = require('../services/waitlist');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// Join waitlist for a date
router.post('/', async (req, res) => {
  const { date, childId } = req.body;
  if (!date || !childId) {
    return res.status(400).json({ error: 'date and childId required' });
  }

  const result = await waitlistService.addToWaitlist(date, childId, req.parent.id);
  if (result.error) return res.status(409).json(result);
  res.status(201).json(result);
});

// Accept a waitlist offer
router.post('/:waitlistId/accept', async (req, res) => {
  const result = await waitlistService.acceptOffer(req.params.waitlistId);
  if (result.error) return res.status(409).json(result);
  res.json(result);
});

// View waitlist for a date
router.get('/:date', async (req, res) => {
  const entries = await waitlistService.getWaitlist(req.params.date);
  res.json(entries);
});

// Remove from waitlist
router.delete('/:waitlistId', async (req, res) => {
  await waitlistService.removeFromWaitlist(req.params.waitlistId);
  res.json({ success: true });
});

module.exports = router;
