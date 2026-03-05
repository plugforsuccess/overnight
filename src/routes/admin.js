const express = require('express');
const adminService = require('../services/admin');
const waitlistService = require('../services/waitlist');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);
router.use(requireAdmin);

// Override capacity — add reservation even if full
router.post('/override', async (req, res) => {
  const { date, childId, blockId } = req.body;
  if (!date || !childId || !blockId) {
    return res.status(400).json({ error: 'date, childId, blockId required' });
  }

  const result = await adminService.overrideCapacity(date, childId, blockId);
  if (result.error) return res.status(409).json(result);
  res.status(201).json(result);
});

// Manually confirm someone from waitlist
router.post('/waitlist/:waitlistId/confirm', async (req, res) => {
  const { blockId } = req.body;
  if (!blockId) return res.status(400).json({ error: 'blockId required' });

  const result = await adminService.confirmFromWaitlist(req.params.waitlistId, blockId);
  if (result.error) return res.status(409).json(result);
  res.status(201).json(result);
});

// Update capacity setting
router.put('/config/capacity', async (req, res) => {
  const { capacity } = req.body;
  if (!capacity || capacity < 1) {
    return res.status(400).json({ error: 'Valid capacity value required' });
  }
  const result = await adminService.setCapacity(capacity);
  res.json(result);
});

// Update waitlist offer TTL
router.put('/config/offer-ttl', async (req, res) => {
  const { minutes } = req.body;
  if (!minutes || minutes < 1) {
    return res.status(400).json({ error: 'Valid minutes value required' });
  }
  const result = await adminService.setOfferTtl(minutes);
  res.json(result);
});

// Expire stale offers manually
router.post('/waitlist/expire', async (req, res) => {
  await waitlistService.expireOffers();
  res.json({ success: true });
});

module.exports = router;
