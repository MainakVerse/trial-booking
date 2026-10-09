import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/http";
import { MENTORS } from "@/lib/mentors";
import { getDayAvailability } from "@/lib/scheduling";
import { store } from "@/lib/store";

export const dynamic = "force-dynamic";

/** GET /api/slots?date=YYYY-MM-DD&tz=America/New_York — date is a calendar day in the parent's zone */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  try {
    const data = getDayAvailability(searchParams.get("date") ?? "", searchParams.get("tz") ?? "", MENTORS, store.bookings);
    return NextResponse.json(data);
  } catch (e) {
    return errorResponse(e);
  }
}
