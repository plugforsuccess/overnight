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

// Accept a waitlist offer (parent-scoped via service)
router.post('/:waitlistId/accept', async (req, res) => {
  const result = await waitlistService.acceptOffer({
    waitlistId: req.params.waitlistId,
    parentId: req.parent.id,
  });
  if (result.error) return res.status(409).json(result);
  await logAudit(req.parent.id, 'waitlist_accepted', 'waitlist', req.params.waitlistId, {});
  res.json(result);
});

// View waitlist for a date — only return the parent's own entries
router.get('/:date', async (req, res) => {
  const entries = await waitlistService.getWaitlistForParent(req.params.date, req.parent.id);
  res.json(entries);
});

// Remove from waitlist (parent-scoped via service)
router.delete('/:waitlistId', async (req, res) => {
  const result = await waitlistService.removeFromWaitlist({
    waitlistId: req.params.waitlistId,
    parentId: req.parent.id,
  });
  if (result.error) return res.status(404).json({ error: result.error });
  res.json({ success: true });
});

module.exports = router;
