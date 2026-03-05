const db = require("../db");

async function logAudit(actorId, action, entityType, entityId, metadata) {
  try {
    await db("audit_log").insert({
      actor_id: actorId || null,
      action,
      entity_type: entityType,
      entity_id: entityId || null,
      metadata: JSON.stringify(metadata || {}),
    });
  } catch (e) {
    console.error("Audit log write failed:", e.message);
  }
}

module.exports = { logAudit };
