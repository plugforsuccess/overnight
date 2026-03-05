import "dotenv/config";
import express from "express";
import { billingRouter } from "./routes/billing";
import { requireActiveSubscription } from "./middleware/require-subscription";

const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);

// ── Stripe webhook route needs raw body ─────────────────────────────────
app.post(
  "/api/billing/webhook",
  express.raw({ type: "application/json", limit: "2mb" }),
  async (req, res) => {
    try {
      if (!Buffer.isBuffer(req.body)) {
        res.status(400).send("Webhook error: expected raw body Buffer");
        return;
      }
      const { handleWebhook } = await import("./billing/webhooks");
      await handleWebhook(req, res);
    } catch (err) {
      // Never leak internal details to Stripe response
      res.status(500).send("Webhook handler error");
    }
  }
);

// ── JSON parsing for all other routes ───────────────────────────────────
app.use(express.json({ limit: "1mb" }));

// ── Billing API ─────────────────────────────────────────────────────────
app.use("/api/billing", billingRouter);

// ── Reservation test endpoint (no extra json middleware needed) ─────────
app.post("/api/reservations/test", requireActiveSubscription, (_req, res) => {
  res.json({ ok: true, message: "Subscription is active — reservation allowed." });
});

// ── Health check ────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// ── Start ───────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Overnight billing server running on port ${PORT}`);
});

export default app;
