import { NextResponse } from "next/server";
import { bookSlot } from "@/lib/booking-service";
import { BOOKING_ATTEMPTS } from "@/lib/config";
import { errorResponse } from "@/lib/http";
import { allow, clientIp } from "@/lib/rate-limit";
import { BookingError, type BookingInput } from "@/lib/scheduling";

export const dynamic = "force-dynamic";

/**
 * POST /api/bookings { parentName, parentEmail, timezone, startUtc }
 * There is deliberately no GET: bookings contain parent emails and are only visible in the portals.
 */
export async function POST(req: Request) {
  if (!allow(`book:${clientIp(req.headers)}`, BOOKING_ATTEMPTS.limit, BOOKING_ATTEMPTS.windowMs)) {
    return errorResponse(new BookingError("RATE_LIMITED", "Too many attempts. Please wait a few minutes and try again.", 429));
  }
  let body: BookingInput;
  try {
    body = await req.json();
  } catch {
    return errorResponse(new BookingError("INVALID_JSON", "Request body must be JSON."));
  }
  try {
    const { booking, mentorName, mentorTimezone } = await bookSlot(body ?? {});
    return NextResponse.json(
      {
        manageUrl: `/booking/${booking.manageToken}`,
        booking: { startUtc: booking.startUtc, parentTimezone: booking.parentTimezone },
        mentor: { name: mentorName, timezone: mentorTimezone },
      },
      { status: 201 },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
