import { Request, Response, NextFunction } from "express";
import { canReserve } from "../billing/subscription-service";

type AuthedRequest = Request & { parent?: { id: string } };

export async function requireActiveSubscription(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const parentId = req.parent?.id;

  if (!parentId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  try {
    const ok = await canReserve(parentId);
    if (!ok) {
      res.status(403).json({
        error: "Active subscription required to reserve nights.",
        code: "NO_ACTIVE_SUBSCRIPTION",
        help: "Subscribe to a plan or resolve any outstanding payment issues.",
      });
      return;
    }

    next();
  } catch {
    res.status(500).json({ error: "Subscription check failed" });
  }
}
