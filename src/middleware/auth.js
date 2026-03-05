const jwt = require("jsonwebtoken");
const db = require("../db");

const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET;

async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ error: "Missing Authorization header" });
    }

    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Invalid Authorization format" });
    }

    const token = authHeader.slice(7);

    if (!token) {
      return res.status(401).json({ error: "Missing auth token" });
    }

    let payload;
    try {
      payload = jwt.verify(token, SUPABASE_JWT_SECRET, {
        algorithms: ["HS256"],
      });
    } catch (err) {
      return res.status(401).json({ error: "Invalid auth token" });
    }

    const userId = payload.sub;

    if (!userId) {
      return res.status(401).json({ error: "Invalid token payload" });
    }

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

function requireJobSecret(req, res, next) {
  if (req.headers["x-job-secret"] !== process.env.JOB_SECRET) {
    return res.status(403).json({ error: "Unauthorized job trigger" });
  }
  next();
}

module.exports = { authenticate, requireAdmin, requireJobSecret };
