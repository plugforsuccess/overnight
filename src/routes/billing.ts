import { Router, Request, Response } from "express";
import { PlanTier, PLAN_PRICES, PLAN_LABELS } from "../types/billing";
import {
  ensureStripeCustomer,
  createSubscription,
  requestPlanChange,
  cancelSubscription,
  getActiveSubscription,
} from "../billing/subscription-service";
import { handleWebhook } from "../billing/webhooks";

export const billingRouter = Router();

// ── List available plans ────────────────────────────────────────────────

billingRouter.get("/plans", (_req: Request, res: Response) => {
  const plans = Object.values(PlanTier).map((tier) => ({
    tier,
    label: PLAN_LABELS[tier],
    price_cents: PLAN_PRICES[tier],
    interval: "week",
  }));
  res.json({ plans });
});

// ── Subscribe to a plan ─────────────────────────────────────────────────

billingRouter.post("/subscribe", async (req: Request, res: Response) => {
  try {
    const { parent_id, email, name, plan_tier } = req.body;

    if (!parent_id || !email || !name || !plan_tier) {
      res.status(400).json({ error: "Missing required fields: parent_id, email, name, plan_tier" });
      return;
    }

    if (!Object.values(PlanTier).includes(plan_tier)) {
      res.status(400).json({ error: `Invalid plan_tier. Must be one of: ${Object.values(PlanTier).join(", ")}` });
      return;
    }

    const customerId = await ensureStripeCustomer(parent_id, email, name);
    const result = await createSubscription(parent_id, customerId, plan_tier);

    res.json({
      subscription_id: result.subscriptionId,
      client_secret: result.clientSecret,
      message: "Subscription created. Use client_secret to confirm payment on the frontend.",
    });
  } catch (err: any) {
    console.error("Subscribe error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── Change plan (queued for next billing cycle) ─────────────────────────

billingRouter.post("/change-plan", async (req: Request, res: Response) => {
  try {
    const { parent_id, new_plan_tier } = req.body;

    if (!parent_id || !new_plan_tier) {
      res.status(400).json({ error: "Missing required fields: parent_id, new_plan_tier" });
      return;
    }

    if (!Object.values(PlanTier).includes(new_plan_tier)) {
      res.status(400).json({ error: `Invalid plan tier.` });
      return;
    }

    const { effectiveDate } = await requestPlanChange(parent_id, new_plan_tier);

    res.json({
      message: `Plan change queued. New tier (${new_plan_tier}) takes effect on ${effectiveDate}.`,
      effective_date: effectiveDate,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ── Cancel subscription (at period end) ─────────────────────────────────

billingRouter.post("/cancel", async (req: Request, res: Response) => {
  try {
    const { parent_id } = req.body;
    if (!parent_id) {
      res.status(400).json({ error: "Missing required field: parent_id" });
      return;
    }

    const accessUntil = await cancelSubscription(parent_id);

    res.json({
      message: `Subscription will cancel at period end. Reservations valid until ${accessUntil}.`,
      access_until: accessUntil,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ── Get current subscription status ─────────────────────────────────────

billingRouter.get("/status/:parentId", (req: Request, res: Response) => {
  const sub = getActiveSubscription(req.params.parentId as string);
  if (!sub) {
    res.json({ active: false, subscription: null });
    return;
  }
  res.json({ active: true, subscription: sub });
});

// ── Stripe webhook endpoint ─────────────────────────────────────────────
// NOTE: This route uses raw body parsing — mounted separately in index.ts
// with express.raw(). Do not use express.json() on this route.

billingRouter.post("/webhook", handleWebhook);
