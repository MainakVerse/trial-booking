import { NextResponse } from "next/server";
import { getAvailability } from "@/lib/booking-service";
import { errorResponse } from "@/lib/http";
import { allow, clientIp } from "@/lib/rate-limit";
import { BookingError } from "@/lib/scheduling";

export const dynamic = "force-dynamic";

/** GET /api/slots?date=YYYY-MM-DD&tz=America/New_York — date is a calendar day in the parent's zone */
export async function GET(req: Request) {
  if (!allow(`slots:${clientIp(req.headers)}`, 120, 60_000)) {
    return errorResponse(new BookingError("RATE_LIMITED", "Too many requests. Please slow down.", 429));
  }
  const { searchParams } = new URL(req.url);
  try {
    return NextResponse.json(await getAvailability(searchParams.get("date") ?? "", searchParams.get("tz") ?? ""));
  } catch (e) {
    return errorResponse(e);
  }
}
