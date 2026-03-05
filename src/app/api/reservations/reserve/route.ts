import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import knexModule from "knex";
import {
  reserveNights,
  ReservationError,
} from "@/server/reservations/reserveNights";

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
  if (req.method !== "POST") {
    return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
  }

  // Authenticate via Supabase
  const supabase = getUserClient(req);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { childId, overnightBlockId, dates } = await req.json();

  if (!childId || !overnightBlockId || !Array.isArray(dates)) {
    return NextResponse.json(
      { error: "Missing required fields: childId, overnightBlockId, dates" },
      { status: 400 }
    );
  }

  try {
    const result = await reserveNights(knex, {
      parentId: user.id,
      childId,
      overnightBlockId,
      dates,
    });
    return NextResponse.json(result);
  } catch (e: any) {
    if (e instanceof ReservationError) {
      const status =
        e.code === "BAD_REQUEST"
          ? 400
          : e.code === "FORBIDDEN"
            ? 403
            : e.code === "NOT_FOUND"
              ? 404
              : e.code === "NIGHT_FULL" || e.code === "DUPLICATE_BOOKING"
                ? 409
                : e.code === "PAYMENT_REQUIRED"
                  ? 402
                  : e.code === "BLOCK_INACTIVE" ||
                      e.code === "INVALID_NIGHTS_COUNT"
                    ? 422
                    : 500;

      return NextResponse.json(
        { error: e.code, message: e.message, details: e.details },
        { status }
      );
    }

    console.error("Unexpected reservation error:", e);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
