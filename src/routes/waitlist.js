const express = require('express');
const waitlistService = require('../services/waitlist');
const { authenticate } = require('../middleware/auth');
const { validate, waitlistJoinSchema } = require('../middleware/validate');
const { logAudit } = require('../middleware/audit');

const router = express.Router();
router.use(authenticate);

// Join waitlist for a date
router.post('/', validate(waitlistJoinSchema), async (req, res) => {
  const { date, childId } = req.body;

  const result = await waitlistService.addToWaitlist(date, childId, req.parent.id);
  if (result.error) return res.status(409).json(result);
  res.status(201).json(result);
});

// Accept a waitlist offer
router.post('/:waitlistId/accept', async (req, res) => {
  const result = await waitlistService.acceptOffer(req.params.waitlistId);
  if (result.error) return res.status(409).json(result);
  await logAudit(req.parent.id, 'waitlist_accepted', 'waitlist', req.params.waitlistId, {});
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
