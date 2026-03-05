import type { Knex } from "knex";

type ReserveNightsInput = {
  parentId: string;
  childId: string;
  overnightBlockId: string;
  dates: string[]; // YYYY-MM-DD, each represents the NIGHT date
};

export class ReservationError extends Error {
  code: string;
  details?: any;
  constructor(code: string, message: string, details?: any) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

function uniqSortedDates(dates: string[]): string[] {
  return Array.from(new Set(dates.map((d) => d.trim()))).sort();
}

/**
 * Reserves multiple nights atomically.
 * Prevents capacity oversell using row locks on nightly_capacity.
 *
 * Requires PostgreSQL for FOR UPDATE and pg_advisory_xact_lock.
 */
export async function reserveNights(knex: Knex, input: ReserveNightsInput) {
  const dates = uniqSortedDates(input.dates);
  if (dates.length === 0) {
    throw new ReservationError("BAD_REQUEST", "No dates provided");
  }

  return await knex.transaction(async (trx) => {
    // 1) Validate overnight_block exists and belongs to parent/child and is payable/active
    const block = await trx("overnight_blocks")
      .select(
        "id",
        "parent_id",
        "child_id",
        "status",
        "payment_status",
        "nights_per_week",
        "weekly_price_cents"
      )
      .where({ id: input.overnightBlockId })
      .first();

    if (!block)
      throw new ReservationError("NOT_FOUND", "Overnight block not found");
    if (block.parent_id !== input.parentId)
      throw new ReservationError("FORBIDDEN", "Parent mismatch");
    if (block.child_id !== input.childId)
      throw new ReservationError("FORBIDDEN", "Child mismatch");

    if (block.status !== "active") {
      throw new ReservationError("BLOCK_INACTIVE", "Block is not active", {
        status: block.status,
      });
    }
    if (block.payment_status !== "confirmed") {
      throw new ReservationError(
        "PAYMENT_REQUIRED",
        "Payment not confirmed",
        { payment_status: block.payment_status }
      );
    }

    // Enforce: dates count must match nights_per_week for this block
    if (dates.length !== block.nights_per_week) {
      throw new ReservationError(
        "INVALID_NIGHTS_COUNT",
        "Selected nights must match plan nights",
        {
          expected: block.nights_per_week,
          got: dates.length,
        }
      );
    }

    // 2) Ensure nightly_capacity rows exist for each date (upsert)
    const capacityRows = dates.map((date) => ({ date }));

    await trx("nightly_capacity").insert(capacityRows).onConflict("date").ignore();

    // 3) Lock all relevant nightly_capacity rows in a consistent order to prevent deadlocks.
    //    Using FOR UPDATE ensures only one transaction modifies a night at a time.
    //    pg_advisory_xact_lock adds another layer of mutual exclusion per date.
    for (const date of dates) {
      // Advisory lock prevents edge-case races if other code paths forget row locks.
      await trx.raw(`SELECT pg_advisory_xact_lock(hashtext(?))`, [date]);

      const night = await trx("nightly_capacity")
        .select(
          "date",
          "status",
          "capacity",
          "override_capacity",
          "confirmed_count"
        )
        .where({ date })
        .forUpdate()
        .first();

      if (!night) {
        throw new ReservationError(
          "NIGHT_NOT_FOUND",
          "Night capacity row missing unexpectedly",
          { date }
        );
      }

      // Validate night status
      if (night.status !== "open" && night.status !== "full") {
        throw new ReservationError("NIGHT_CLOSED", "Night is not bookable", {
          date,
          status: night.status,
        });
      }

      const effectiveCapacity = night.override_capacity ?? night.capacity;
      if (night.confirmed_count >= effectiveCapacity) {
        // Mark FULL if not already
        if (night.status !== "full") {
          await trx("nightly_capacity")
            .where({ date })
            .update({ status: "full", updated_at: trx.fn.now() });
        }
        throw new ReservationError("NIGHT_FULL", "Night is full", {
          date,
          confirmed_count: night.confirmed_count,
          capacity: effectiveCapacity,
        });
      }
    }

    // 4) Insert reservations (still within same transaction).
    //    Unique constraint (child_id, date) protects against duplicates.
    //    If any insert fails, entire transaction rolls back.
    const reservationRows = dates.map((date) => ({
      child_id: input.childId,
      date,
      overnight_block_id: input.overnightBlockId,
      status: "confirmed",
      admin_override: false,
    }));

    try {
      await trx("reservations").insert(reservationRows);
    } catch (err: any) {
      // Handle unique violation gracefully
      if (err?.code === "23505") {
        throw new ReservationError(
          "DUPLICATE_BOOKING",
          "Child already booked for one of the selected nights",
          { pg: err.detail }
        );
      }
      throw err;
    }

    // 5) Increment confirmed_count for each date and set status FULL if needed
    for (const date of dates) {
      const updated = await trx("nightly_capacity")
        .where({ date })
        .update({
          confirmed_count: trx.raw("confirmed_count + 1"),
          updated_at: trx.fn.now(),
        })
        .returning([
          "date",
          "capacity",
          "override_capacity",
          "confirmed_count",
          "status",
        ]);

      const night = updated?.[0];
      if (!night) continue;

      const effectiveCapacity = night.override_capacity ?? night.capacity;
      if (
        night.confirmed_count >= effectiveCapacity &&
        night.status !== "full"
      ) {
        await trx("nightly_capacity")
          .where({ date })
          .update({ status: "full", updated_at: trx.fn.now() });
      }
    }

    // 6) Audit log
    await trx("audit_log").insert({
      actor_id: input.parentId,
      action: "reserve_nights",
      entity_type: "overnight_blocks",
      entity_id: input.overnightBlockId,
      metadata: JSON.stringify({
        child_id: input.childId,
        dates,
      }),
      created_at: trx.fn.now(),
    });

    return { ok: true, dates };
  });
}
