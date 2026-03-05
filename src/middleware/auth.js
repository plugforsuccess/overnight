const jwt = require("jsonwebtoken");
const db = require("../db");

const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET;

async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ error: "Missing Authorization header" });
    }

    const token = authHeader.replace("Bearer ", "");

    let payload;
    try {
      payload = jwt.verify(token, SUPABASE_JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ error: "Invalid auth token" });
    }

    const userId = payload.sub;

    const parent = await db("parents")
      .where({ auth_user_id: userId })
      .first();

    if (!parent) {
      return res.status(401).json({ error: "Parent account not found" });
    }

    req.parent = parent;
    req.auth = payload;

    next();
  } catch (err) {
    console.error("Auth error:", err);
    res.status(500).json({ error: "Authentication failure" });
  }
}

function requireAdmin(req, res, next) {
  if (!req.parent || !req.parent.is_admin) {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

module.exports = { authenticate, requireAdmin };