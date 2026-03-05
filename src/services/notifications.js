const crypto = require("crypto");
const db = require("../db");

function maskPhone(phone) {
  const s = String(phone || "");
  if (s.length <= 4) return "****";
  return `${"*".repeat(Math.max(0, s.length - 4))}${s.slice(-4)}`;
}

function maskEmail(email) {
  const s = String(email || "");
  const [user, domain] = s.split("@");
  if (!user || !domain) return "***";
  return `${user.slice(0, 1)}***@${domain}`;
}

function stableKey(parts) {
  // deterministic idempotency key
  const raw = parts.join("|");
  return crypto.createHash("sha256").update(raw).digest("hex");
}

async function alreadySent(idempotencyKey) {
  const row = await db("notification_log").where({ idempotency_key: idempotencyKey }).first();
  return Boolean(row);
}

async function logNotification({ idempotencyKey, channel, toValue, template, status, error }) {
  try {
    await db("notification_log").insert({
      idempotency_key: idempotencyKey,
      channel,
      to_value: toValue,
      template,
      status,
      error: error ? String(error).slice(0, 2000) : null,
    });
  } catch (e) {
    // Unique violation means another worker already sent/logged it; treat as success
    if (e?.code === "23505") return;
    throw e;
  }
}

// --- Provider stubs (replace later) ---
async function sendSmsProvider(phone, message) {
  // DO NOT log message body; it may contain PII
  if (process.env.NODE_ENV !== "production") {
    console.log(`[SMS stub] -> ${maskPhone(phone)}`);
  }
  return { ok: true };
}

async function sendEmailProvider(email, subject, body) {
  if (process.env.NODE_ENV !== "production") {
    console.log(`[EMAIL stub] -> ${maskEmail(email)} subj="${subject}"`);
  }
  return { ok: true };
}

/**
 * Centralized dispatch with idempotency + audit.
 */
async function dispatchNotification({ channel, toValue, template, subject, body, idempotencyKey }) {
  if (!toValue) return { ok: false, skipped: true, reason: "missing_destination" };

  // De-dupe
  if (await alreadySent(idempotencyKey)) {
    return { ok: true, skipped: true, reason: "idempotent_skip" };
  }

  try {
    if (channel === "sms") {
      await sendSmsProvider(toValue, body);
    } else if (channel === "email") {
      await sendEmailProvider(toValue, subject || template, body);
    } else {
      throw new Error(`Unknown channel: ${channel}`);
    }

    await logNotification({
      idempotencyKey,
      channel,
      toValue,
      template,
      status: "sent",
    });

    return { ok: true };
  } catch (err) {
    await logNotification({
      idempotencyKey,
      channel,
      toValue,
      template,
      status: "failed",
      error: err?.message || String(err),
    });
    throw err;
  }
}

// -------------------------
// Notification templates
// -------------------------

function childLabel(child) {
  // Optional privacy: first name only, or "your child"
  return child?.name ? String(child.name).split(" ")[0] : "your child";
}

async function notifyWaitlistOffer(parent, child, date) {
  const label = childLabel(child);
  const msg = `A spot opened on ${date} for ${label}. You have 2 hours to accept.`;

  const keyBase = stableKey(["waitlist_offer", parent.id, child.id, date]);

  const results = [];
  if (parent.phone) {
    results.push(
      dispatchNotification({
        channel: "sms",
        toValue: parent.phone,
        template: "waitlist_offer",
        body: msg,
        idempotencyKey: `${keyBase}:sms`,
      })
    );
  }
  if (parent.email) {
    results.push(
      dispatchNotification({
        channel: "email",
        toValue: parent.email,
        template: "waitlist_offer",
        subject: "Overnight Spot Available",
        body: msg,
        idempotencyKey: `${keyBase}:email`,
      })
    );
  }

  return Promise.all(results);
}

async function notifyWaitlistExpired(parent, child, date) {
  const label = childLabel(child);
  const msg = `Your waitlist offer for ${label} on ${date} has expired.`;

  const keyBase = stableKey(["waitlist_expired", parent.id, child.id, date]);

  const results = [];
  if (parent.phone) {
    results.push(
      dispatchNotification({
        channel: "sms",
        toValue: parent.phone,
        template: "waitlist_expired",
        body: msg,
        idempotencyKey: `${keyBase}:sms`,
      })
    );
  }
  if (parent.email) {
    results.push(
      dispatchNotification({
        channel: "email",
        toValue: parent.email,
        template: "waitlist_expired",
        subject: "Waitlist Offer Expired",
        body: msg,
        idempotencyKey: `${keyBase}:email`,
      })
    );
  }

  return Promise.all(results);
}

async function notifyNightCanceled(parent, child, date, creditAmountCents) {
  const label = childLabel(child);
  const creditDollars = (creditAmountCents / 100).toFixed(0);
  const msg = `The overnight on ${date} for ${label} was canceled due to low enrollment. A $${creditDollars} credit was applied.`;

  const keyBase = stableKey(["night_canceled", parent.id, child.id, date, String(creditAmountCents)]);

  const results = [];
  if (parent.phone) {
    results.push(
      dispatchNotification({
        channel: "sms",
        toValue: parent.phone,
        template: "night_canceled",
        body: msg,
        idempotencyKey: `${keyBase}:sms`,
      })
    );
  }
  if (parent.email) {
    results.push(
      dispatchNotification({
        channel: "email",
        toValue: parent.email,
        template: "night_canceled",
        subject: "Night Canceled — Credit Issued",
        body: msg,
        idempotencyKey: `${keyBase}:email`,
      })
    );
  }

  return Promise.all(results);
}

async function notifyPaymentSuccess(parent) {
  const msg = "Your weekly overnight childcare payment was processed successfully.";
  const keyBase = stableKey(["payment_success", parent.id]);

  const results = [];
  if (parent.phone) {
    results.push(
      dispatchNotification({
        channel: "sms",
        toValue: parent.phone,
        template: "payment_success",
        body: msg,
        idempotencyKey: `${keyBase}:sms`,
      })
    );
  }
  if (parent.email) {
    results.push(
      dispatchNotification({
        channel: "email",
        toValue: parent.email,
        template: "payment_success",
        subject: "Payment Confirmed",
        body: msg,
        idempotencyKey: `${keyBase}:email`,
      })
    );
  }
  return Promise.all(results);
}

async function notifyPaymentFailed(parent) {
  const msg = "Your payment failed. Please update your payment method to keep your reservations active.";
  const keyBase = stableKey(["payment_failed", parent.id]);

  const results = [];
  if (parent.phone) {
    results.push(
      dispatchNotification({
        channel: "sms",
        toValue: parent.phone,
        template: "payment_failed",
        body: msg,
        idempotencyKey: `${keyBase}:sms`,
      })
    );
  }
  if (parent.email) {
    results.push(
      dispatchNotification({
        channel: "email",
        toValue: parent.email,
        template: "payment_failed",
        subject: "Payment Failed — Action Required",
        body: msg,
        idempotencyKey: `${keyBase}:email`,
      })
    );
  }
  return Promise.all(results);
}

async function notifyReservationConfirmed(parent, child, dates) {
  const label = childLabel(child);
  const dateList = dates.join(", ");
  const msg = `Reservations confirmed for ${label}: ${dateList}`;

  const keyBase = stableKey(["reservation_confirmed", parent.id, child.id, ...dates]);

  const results = [];
  if (parent.phone) {
    results.push(
      dispatchNotification({
        channel: "sms",
        toValue: parent.phone,
        template: "reservation_confirmed",
        body: msg,
        idempotencyKey: `${keyBase}:sms`,
      })
    );
  }
  if (parent.email) {
    results.push(
      dispatchNotification({
        channel: "email",
        toValue: parent.email,
        template: "reservation_confirmed",
        subject: "Reservation Confirmed",
        body: msg,
        idempotencyKey: `${keyBase}:email`,
      })
    );
  }
  return Promise.all(results);
}

async function notifyWeeklySchedule(parent, children, dates) {
  const names = children.map((c) => childLabel(c)).join(", ");
  const dateList = dates.join(", ");
  const msg = `Weekly schedule for ${names}: ${dateList}`;

  const keyBase = stableKey(["weekly_schedule", parent.id, ...children.map(c => c.id), ...dates]);

  const results = [];
  if (parent.phone) {
    results.push(
      dispatchNotification({
        channel: "sms",
        toValue: parent.phone,
        template: "weekly_schedule",
        body: msg,
        idempotencyKey: `${keyBase}:sms`,
      })
    );
  }
  if (parent.email) {
    results.push(
      dispatchNotification({
        channel: "email",
        toValue: parent.email,
        template: "weekly_schedule",
        subject: "Weekly Schedule Confirmation",
        body: msg,
        idempotencyKey: `${keyBase}:email`,
      })
    );
  }
  return Promise.all(results);
}

module.exports = {
  // provider wrappers
  dispatchNotification,

  // notifications
  notifyWaitlistOffer,
  notifyWaitlistExpired,
  notifyNightCanceled,
  notifyPaymentSuccess,
  notifyPaymentFailed,
  notifyReservationConfirmed,
  notifyWeeklySchedule,
};
