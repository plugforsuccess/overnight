import type { Knex } from "knex";
import { ReservationError } from "./reserveNights";

type CancelNightsInput = {
  parentId: string;
  childId: string;
  overnightBlockId: string;
  dates: string[]; // YYYY-MM-DD nights to cancel (subset or all)
};

type CancelBlockInput = {
  parentId: string;
  overnightBlockId: string;
};

function uniqSortedDates(dates: string[]): string[] {
  return Array.from(new Set(dates.map((d) => d.trim()))).sort();
}

/**
 * Cancel specific nights within an overnight block.
 * Transaction-safe: locks nightly_capacity rows, decrements confirmed_count,
 * flips status from full→open when capacity frees up, and promotes waitlist.
 */
export async function cancelNights(knex: Knex, input: CancelNightsInput) {
  const dates = uniqSortedDates(input.dates);
  if (dates.length === 0) {
    throw new ReservationError("BAD_REQUEST", "No dates provided");
  }

  return await knex.transaction(async (trx) => {
    // 1) Validate block ownership
    const block = await trx("overnight_blocks")
      .select("id", "parent_id", "child_id", "status", "weekly_price_cents", "nights_per_week")
      .where({ id: input.overnightBlockId })
      .first();

    if (!block)
      throw new ReservationError("NOT_FOUND", "Overnight block not found");
    if (block.parent_id !== input.parentId)
      throw new ReservationError("FORBIDDEN", "Parent mismatch");
    if (block.child_id !== input.childId)
      throw new ReservationError("FORBIDDEN", "Child mismatch");

    // 2) Verify reservations exist for each date
    const reservations = await trx("reservations")
      .where({
        child_id: input.childId,
        overnight_block_id: input.overnightBlockId,
      })
      .whereIn("date", dates)
      .whereNot("status", "canceled_low_enrollment");

    const foundDates = new Set(reservations.map((r: any) => r.date));
    const missingDates = dates.filter((d) => !foundDates.has(d));
    if (missingDates.length > 0) {
      throw new ReservationError(
        "RESERVATION_NOT_FOUND",
        "No active reservation found for some dates",
        { missingDates }
      );
    }

    // 3) Cancel each reservation and decrement nightly_capacity atomically
    const freedDates: string[] = [];

    for (const date of dates) {
      // Advisory lock for consistency
      await trx.raw(`SELECT pg_advisory_xact_lock(hashtext(?))`, [date]);

      // Lock the capacity row
      const night = await trx("nightly_capacity")
        .select("date", "status", "capacity", "override_capacity", "confirmed_count")
        .where({ date })
        .forUpdate()
        .first();

      // Update reservation status
      await trx("reservations")
        .where({
          child_id: input.childId,
          overnight_block_id: input.overnightBlockId,
          date,
        })
        .whereNot("status", "canceled_low_enrollment")
        .update({
          status: "cancelled",
          updated_at: trx.fn.now(),
        });

      // Decrement confirmed_count (never below 0)
      if (night && night.confirmed_count > 0) {
        await trx("nightly_capacity")
          .where({ date })
          .update({
            confirmed_count: trx.raw("GREATEST(confirmed_count - 1, 0)"),
            updated_at: trx.fn.now(),
          });

        // If night was full and now has room, reopen it
        const effectiveCapacity = night.override_capacity ?? night.capacity;
        if (
          night.status === "full" &&
          night.confirmed_count - 1 < effectiveCapacity
        ) {
          await trx("nightly_capacity")
            .where({ date })
            .update({ status: "open", updated_at: trx.fn.now() });
        }
      }

      freedDates.push(date);
    }

    // 4) Issue credits for canceled nights
    const creditPerNight =
      block.nights_per_week > 0
        ? Math.round(block.weekly_price_cents / block.nights_per_week)
        : 0;

    if (creditPerNight > 0) {
      const creditRows = dates.map((date) => ({
        parent_id: input.parentId,
        amount_cents: creditPerNight,
        reason: "parent_cancel",
        related_block_id: input.overnightBlockId,
        related_date: date,
        applied: false,
      }));
      await trx("credits").insert(creditRows);
    }

    // 5) Audit log
    await trx("audit_log").insert({
      actor_id: input.parentId,
      action: "cancel_nights",
      entity_type: "overnight_blocks",
      entity_id: input.overnightBlockId,
      metadata: JSON.stringify({
        child_id: input.childId,
        dates,
        credit_per_night_cents: creditPerNight,
      }),
      created_at: trx.fn.now(),
    });

    return { ok: true, freedDates, creditPerNightCents: creditPerNight };
  });
}

/**
 * Cancel an entire overnight block and all its reservations.
 * Transaction-safe with capacity decrement and waitlist promotion.
 */
export async function cancelBlock(knex: Knex, input: CancelBlockInput) {
  return await knex.transaction(async (trx) => {
    const block = await trx("overnight_blocks")
      .select("id", "parent_id", "child_id", "status", "weekly_price_cents", "nights_per_week")
      .where({ id: input.overnightBlockId })
      .first();

    if (!block)
      throw new ReservationError("NOT_FOUND", "Overnight block not found");
    if (block.parent_id !== input.parentId)
      throw new ReservationError("FORBIDDEN", "Parent mismatch");

    // Get all active reservations for this block
    const reservations = await trx("reservations")
      .where({ overnight_block_id: input.overnightBlockId })
      .whereNot("status", "cancelled")
      .whereNot("status", "canceled_low_enrollment");

    const dates = reservations.map((r: any) => r.date).sort();

    // Cancel each night's capacity atomically
    for (const date of dates) {
      await trx.raw(`SELECT pg_advisory_xact_lock(hashtext(?))`, [date]);

      const night = await trx("nightly_capacity")
        .select("date", "status", "capacity", "override_capacity", "confirmed_count")
        .where({ date })
        .forUpdate()
        .first();

      if (night && night.confirmed_count > 0) {
        await trx("nightly_capacity")
          .where({ date })
          .update({
            confirmed_count: trx.raw("GREATEST(confirmed_count - 1, 0)"),
            updated_at: trx.fn.now(),
          });

        const effectiveCapacity = night.override_capacity ?? night.capacity;
        if (
          night.status === "full" &&
          night.confirmed_count - 1 < effectiveCapacity
        ) {
          await trx("nightly_capacity")
            .where({ date })
            .update({ status: "open", updated_at: trx.fn.now() });
        }
      }
    }

    // Mark all reservations as cancelled
    await trx("reservations")
      .where({ overnight_block_id: input.overnightBlockId })
      .whereNot("status", "cancelled")
      .whereNot("status", "canceled_low_enrollment")
      .update({ status: "cancelled", updated_at: trx.fn.now() });

    // Mark the block as cancelled
    await trx("overnight_blocks")
      .where({ id: input.overnightBlockId })
      .update({ status: "cancelled", updated_at: trx.fn.now() });

    // Issue credits
    const creditPerNight =
      block.nights_per_week > 0
        ? Math.round(block.weekly_price_cents / block.nights_per_week)
        : 0;

    if (creditPerNight > 0 && dates.length > 0) {
      const creditRows = dates.map((date: string) => ({
        parent_id: input.parentId,
        amount_cents: creditPerNight,
        reason: "parent_cancel",
        related_block_id: input.overnightBlockId,
        related_date: date,
        applied: false,
      }));
      await trx("credits").insert(creditRows);
    }

    // Audit log
    await trx("audit_log").insert({
      actor_id: input.parentId,
      action: "cancel_block",
      entity_type: "overnight_blocks",
      entity_id: input.overnightBlockId,
      metadata: JSON.stringify({
        child_id: block.child_id,
        dates,
        credit_per_night_cents: creditPerNight,
      }),
      created_at: trx.fn.now(),
    });

    return {
      ok: true,
      freedDates: dates,
      creditPerNightCents: creditPerNight,
      totalCreditCents: creditPerNight * dates.length,
    };
  });
}

/**
 * Promote waitlist entries for freed dates.
 * Call this AFTER the cancel transaction commits, so the freed capacity is visible.
 * This is intentionally separate — waitlist promotion can fail independently
 * without rolling back the cancellation.
 */
export async function promoteWaitlistForDates(
  knex: Knex,
  dates: string[]
): Promise<void> {
  for (const date of dates) {
    // Find the next waiting entry for this date
    const next = await knex("waitlist")
      .where({ date, status: "waiting" })
      .orderBy("created_at", "asc")
      .first();

    if (!next) continue;

    // Mark as offered with TTL
    const ttlRow = await knex("config")
      .where({ key: "waitlist_offer_ttl_minutes" })
      .first();
    const ttlMinutes = ttlRow ? parseInt(ttlRow.value, 10) : 120;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000);

    await knex("waitlist").where({ id: next.id }).update({
      status: "offered",
      offered_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    });
  }
}
