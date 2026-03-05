import { Request, Response, NextFunction } from "express";
import { canReserve } from "../billing/subscription-service";

/**
 * Middleware: blocks reservation requests if the parent has no active subscription.
 *
 * Expects `parent_id` in req.body or req.params. Attach this to any
 * reservation/scheduling route.
 *
 * System rules enforced:
 *   - No active subscription → cannot reserve nights.
 *   - payment_failed (past_due) → subscription is not "active" → locked.
 */
export function requireActiveSubscription(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const parentId = req.body?.parent_id ?? req.params?.parentId;

  if (!parentId) {
    res.status(400).json({ error: "parent_id is required" });
    return;
  }

  if (!canReserve(parentId)) {
    res.status(403).json({
      error: "Active subscription required to reserve nights.",
      code: "NO_ACTIVE_SUBSCRIPTION",
      help: "Subscribe to a plan or resolve any outstanding payment issues.",
    });
    return;
  }

  next();
}
