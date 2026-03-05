const db = require('../db');

// Simple auth middleware — in production, replace with JWT/session-based auth.
// Expects x-parent-id header for parent identification.
async function authenticate(req, res, next) {
  const parentId = req.headers['x-parent-id'];
  if (!parentId) return res.status(401).json({ error: 'Missing x-parent-id header' });

  const parent = await db('parents').where({ id: parentId }).first();
  if (!parent) return res.status(401).json({ error: 'Parent not found' });

  req.parent = parent;
  next();
}

function requireAdmin(req, res, next) {
  if (!req.parent || !req.parent.is_admin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

module.exports = { authenticate, requireAdmin };
