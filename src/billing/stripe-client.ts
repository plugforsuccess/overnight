import Stripe from "stripe";

let stripeInstance: Stripe | null = null;

function assertStripeKeySafety(key: string) {
  const env = process.env.NODE_ENV || "development";
  const isLiveKey = key.startsWith("sk_live_");
  const isTestKey = key.startsWith("sk_test_");

  if (!isLiveKey && !isTestKey) {
    throw new Error("STRIPE_SECRET_KEY must start with sk_test_ or sk_live_.");
  }

  if (env !== "production" && isLiveKey) {
    throw new Error("Refusing to run with a LIVE Stripe key outside production.");
  }
}

export function getStripe(): Stripe {
  if (stripeInstance) return stripeInstance;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  assertStripeKeySafety(key);

  stripeInstance = new Stripe(key, {
    apiVersion: "2024-06-20" as any,
    maxNetworkRetries: 2,
    timeout: 10_000,
  });

  return stripeInstance;
}
