import "dotenv/config";
import express from "express";
import { knexConfig } from "./db/connection";
import { billingRouter } from "./routes/billing";
import { handleWebhook } from "./billing/webhooks";
import { requireActiveSubscription } from "./middleware/require-subscription";

const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);

// ── Stripe webhook needs the raw body for signature verification ────────
// This route MUST be registered before express.json() so the body remains
// an unparsed Buffer when handleWebhook calls stripe.webhooks.constructEvent.
app.post(
  "/api/billing/webhook",
  express.raw({ type: "application/json" }),
  handleWebhook
);

// ── JSON parsing for all other routes ───────────────────────────────────
app.use(express.json());

// ── Billing API ─────────────────────────────────────────────────────────
app.use("/api/billing", billingRouter);

// ── Example: protect reservation routes ─────────────────────────────────
// Uncomment and adapt when reservation routes are built:
//
// import { reservationRouter } from "./routes/reservations";
// app.use("/api/reservations", requireActiveSubscription, reservationRouter);
//
// For now, expose a test endpoint:
app.post(
  "/api/reservations/test",
  requireActiveSubscription,
  (_req, res) => {
    res.json({ ok: true, message: "Subscription is active — reservation allowed." });
  }
);

// ── Health check ────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// ── Start ───────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Overnight billing server running on port ${PORT}`);
});

export default app;
