import { NextResponse } from "next/server";
import { BookingError } from "./scheduling";

export function errorResponse(e: unknown) {
  if (e instanceof BookingError) {
    return NextResponse.json(
      { error: { code: e.code, message: e.message, suggestions: e.suggestions } },
      { status: e.status },
    );
  }
  console.error(e);
  return NextResponse.json(
    { error: { code: "INTERNAL", message: "Something went wrong on our side. Try again in a moment." } },
    { status: 500 },
  );
}
