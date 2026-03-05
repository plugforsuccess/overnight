import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import knexModule from "knex";
import {
  cancelNights,
  cancelBlock,
  promoteWaitlistForDates,
} from "@/server/reservations/cancelNights";
import { ReservationError } from "@/server/reservations/reserveNights";

const knex = knexModule({
  client: "pg",
  connection: process.env.DATABASE_URL,
  pool: { min: 0, max: 10 },
});

function getUserClient(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "") || "";
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

export async function POST(req: NextRequest) {
  const supabase = getUserClient(req);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { childId, overnightBlockId, dates, cancelEntireBlock } =
    await req.json();

  if (!overnightBlockId) {
    return NextResponse.json(
      { error: "Missing required field: overnightBlockId" },
      { status: 400 }
    );
  }

  try {
    let result;

    if (cancelEntireBlock) {
      result = await cancelBlock(knex, {
        parentId: user.id,
        overnightBlockId,
      });
    } else {
      if (!childId || !Array.isArray(dates) || dates.length === 0) {
        return NextResponse.json(
          {
            error:
              "Missing required fields: childId, dates (or set cancelEntireBlock: true)",
          },
          { status: 400 }
        );
      }

      result = await cancelNights(knex, {
        parentId: user.id,
        childId,
        overnightBlockId,
        dates,
      });
    }

    // Promote waitlist after the cancel transaction has committed
    if (result.ok && result.freedDates?.length > 0) {
      try {
        await promoteWaitlistForDates(knex, result.freedDates);
      } catch (err) {
        // Waitlist promotion failure should not fail the cancel response
        console.error("Waitlist promotion error:", err);
      }
    }

    return NextResponse.json(result);
  } catch (e: any) {
    if (e instanceof ReservationError) {
      const status =
        e.code === "BAD_REQUEST"
          ? 400
          : e.code === "FORBIDDEN"
            ? 403
            : e.code === "NOT_FOUND" || e.code === "RESERVATION_NOT_FOUND"
              ? 404
              : 500;

      return NextResponse.json(
        { error: e.code, message: e.message, details: e.details },
        { status }
      );
    }

    console.error("Unexpected cancel error:", e);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
