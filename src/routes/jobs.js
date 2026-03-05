// routes/jobs.js
//
// Admin-only job endpoints. Protected by authenticate + requireAdmin middleware.
// These should be called by cron/scheduler — never exposed publicly.

const express = require('express');
const { authenticate, requireAdmin } = require('../middleware/auth');
const jobs = require('../services/jobs');

const router = express.Router();

// All job routes require admin auth
router.use(authenticate);
router.use(requireAdmin);

/**
 * POST /api/jobs/weekly-billing
 * Body: { weekStart: "YYYY-MM-DD" }
 *
 * Runs Friday 12:00 PM — processes billing, locks unpaid, applies credits.
 */
router.post('/weekly-billing', async (req, res) => {
  const { weekStart } = req.body;
  if (!weekStart) return res.status(400).json({ error: 'weekStart is required' });

  try {
    const result = await jobs.runWeeklyBilling(weekStart);
    await logAudit(req, 'run_weekly_billing', 'job', null, { weekStart, result });
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('Weekly billing job failed:', err);
    res.status(500).json({ error: 'Weekly billing job failed', message: err.message });
  }
});

/**
 * POST /api/jobs/enrollment-cutoff
 * Body: { weekStart: "YYYY-MM-DD" }
 *
 * Runs Friday 1:00 PM — cancels under-enrolled nights, issues credits.
 */
router.post('/enrollment-cutoff', async (req, res) => {
  const { weekStart } = req.body;
  if (!weekStart) return res.status(400).json({ error: 'weekStart is required' });

  try {
    const result = await jobs.runEnrollmentCutoff(weekStart);
    await logAudit(req, 'run_enrollment_cutoff', 'job', null, { weekStart, result });
    res.json({ ok: true, results: result });
  } catch (err) {
    console.error('Enrollment cutoff job failed:', err);
    res.status(500).json({ error: 'Enrollment cutoff job failed', message: err.message });
  }
});

/**
 * POST /api/jobs/waitlist-promotion
 *
 * Runs every 5 minutes — expires stale offers, promotes next in line.
 */
router.post('/waitlist-promotion', async (req, res) => {
  try {
    const result = await jobs.runWaitlistPromotion();
    await logAudit(req, 'run_waitlist_promotion', 'job', null, { result });
    res.json({ ok: true, promoted: result });
  } catch (err) {
    console.error('Waitlist promotion job failed:', err);
    res.status(500).json({ error: 'Waitlist promotion job failed', message: err.message });
  }
});

/**
 * POST /api/jobs/credit-issuance
 * Body: { weekStart: "YYYY-MM-DD" }
 *
 * Idempotent credit issuance for a week — delegates to enrollment cutoff
 * which handles credit issuance as part of its cancellation flow.
 */
router.post('/credit-issuance', async (req, res) => {
  const { weekStart } = req.body;
  if (!weekStart) return res.status(400).json({ error: 'weekStart is required' });

  try {
    const result = await jobs.runEnrollmentCutoff(weekStart);
    const creditsIssued = result.filter(r => r.canceled).length;
    await logAudit(req, 'run_credit_issuance', 'job', null, { weekStart, creditsIssued });
    res.json({ ok: true, creditsIssued, results: result });
  } catch (err) {
    console.error('Credit issuance job failed:', err);
    res.status(500).json({ error: 'Credit issuance job failed', message: err.message });
  }
});

// Helper: write to audit_log
async function logAudit(req, action, entityType, entityId, metadata) {
  try {
    const db = require('../db');
    await db('audit_log').insert({
      actor_id: req.parent.id,
      action,
      entity_type: entityType,
      entity_id: entityId || null,
      metadata: JSON.stringify(metadata || {}),
    });
  } catch (e) {
    console.error('Audit log write failed:', e.message);
  }
}

module.exports = router;
