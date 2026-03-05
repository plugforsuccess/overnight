import { Router, Request, Response } from "express";
import { PlanTier, PLAN_PRICES, PLAN_LABELS } from "../types/billing";
import {
  ensureStripeCustomer,
  createSubscription,
  requestPlanChange,
  cancelSubscription,
  getActiveSubscription,
} from "../billing/subscription-service";
import { authenticate, requireAdmin } from "../middleware/auth";

export const billingRouter = Router();

// All billing actions require auth (webhook is handled separately in index.ts)
billingRouter.use((req, res, next) => {
  return authenticate(req as any, res, next);
});

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
billingRouter.post("/subscribe", async (req: any, res: Response) => {
  try {
    const { plan_tier } = req.body;
    const parent = req.parent; // from auth

    if (!plan_tier) {
      res.status(400).json({ error: "Missing required field: plan_tier" });
      return;
    }
    if (!Object.values(PlanTier).includes(plan_tier)) {
      res.status(400).json({ error: `Invalid plan_tier.` });
      return;
    }

    // ensureStripeCustomer sources email/name from the DB record (server-trusted)
    await ensureStripeCustomer(parent.id);
    const result = await createSubscription(parent.id, plan_tier);

    res.json({
      subscription_id: result.subscriptionId,
      client_secret: result.clientSecret,
      already_exists: result.alreadyExists ?? false,
      message: result.alreadyExists
        ? "An active subscription already exists."
        : "Subscription created. Use client_secret to confirm payment on the frontend.",
    });
  } catch (err: any) {
    res.status(500).json({ error: "Subscription creation failed" });
  }
});

// ── Change plan (queued for next billing cycle) ─────────────────────────
billingRouter.post("/change-plan", async (req: any, res: Response) => {
  try {
    const { new_plan_tier } = req.body;
    const parent = req.parent;

    if (!new_plan_tier) {
      res.status(400).json({ error: "Missing required field: new_plan_tier" });
      return;
    }
    if (!Object.values(PlanTier).includes(new_plan_tier)) {
      res.status(400).json({ error: "Invalid plan tier." });
      return;
    }

    const { effectiveDate } = await requestPlanChange(parent.id, new_plan_tier);

    res.json({
      message: `Plan change queued. New tier (${new_plan_tier}) takes effect on ${effectiveDate}.`,
      effective_date: effectiveDate,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ── Cancel subscription (at period end) ─────────────────────────────────
billingRouter.post("/cancel", async (req: any, res: Response) => {
  try {
    const parent = req.parent;

    const accessUntil = await cancelSubscription(parent.id);

    res.json({
      message: `Subscription will cancel at period end. Reservations valid until ${accessUntil}.`,
      access_until: accessUntil,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ── Get current subscription status ─────────────────────────────────────
billingRouter.get("/status", async (req: any, res: Response) => {
  const parent = req.parent;
  const sub = await getActiveSubscription(parent.id);
  if (!sub) {
    res.json({ active: false, subscription: null });
    return;
  }
  res.json({ active: true, subscription: sub });
});

// Optional admin lookup
billingRouter.get("/admin/status/:parentId", requireAdmin, async (req: any, res: Response) => {
  const sub = await getActiveSubscription(req.params.parentId);
  res.json({ active: Boolean(sub), subscription: sub || null });
});

// NOTE: The webhook endpoint is NOT registered here. It lives in index.ts
// with express.raw() middleware so that req.body remains an unparsed Buffer
// for Stripe signature verification. Registering it here would fail because
// express.json() has already parsed the body by the time this router runs.
