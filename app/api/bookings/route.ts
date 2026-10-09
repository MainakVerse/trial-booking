import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/http";
import { MENTORS } from "@/lib/mentors";
import { buildConfirmationEmails, sendEmails } from "@/lib/notify";
import { createBooking, type BookingInput } from "@/lib/scheduling";
import { store } from "@/lib/store";

export const dynamic = "force-dynamic";

/** POST /api/bookings { parentName, parentEmail, timezone, startUtc } */
export async function POST(req: Request) {
  let body: BookingInput;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: { code: "INVALID_JSON", message: "Request body must be JSON." } }, { status: 400 });
  }
  try {
    const { booking, mentor } = createBooking(body ?? {}, MENTORS, store.bookings);
    const emails = sendEmails(buildConfirmationEmails(booking, mentor));
    return NextResponse.json(
      { booking, mentor: { name: mentor.name, timezone: mentor.timezone }, emails },
      { status: 201 },
    );
  } catch (e) {
    return errorResponse(e);
  }
}

/** GET /api/bookings — debugging aid for reviewers */
export async function GET() {
  return NextResponse.json({ bookings: store.bookings });
}
