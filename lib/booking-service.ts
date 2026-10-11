import { DateTime } from "luxon";
import { PARENT_CANCEL_CUTOFF_MINUTES } from "./config";
import { isUniqueViolation, withTransaction } from "./db";
import { buildCancellationEmails, buildConfirmationEmails, deliver } from "./notify";
import {
  getBookingById,
  getBookingByToken,
  insertBooking,
  listConfirmedSince,
  listMentors,
  markCancelled,
} from "./repo";
import { BookingError, createBooking, getDayAvailability, type BookingInput, type DayAvailability } from "./scheduling";
import type { Booking, BookingView } from "./types";

/** Number of days of history the scheduler needs so the per-day cap is counted correctly. */
const HISTORY_DAYS = 2;
/** Arbitrary constant: every booking transaction takes this advisory lock, so they run one at a time. */
const BOOKING_LOCK = 724_001;

const sinceIso = (now: DateTime) => now.minus({ days: HISTORY_DAYS }).toISO()!;

export async function getAvailability(date: string, zone: string): Promise<DayAvailability> {
  const now = DateTime.utc();
  const [mentors, bookings] = await Promise.all([listMentors({ activeOnly: true }), listConfirmedSince(sinceIso(now))]);
  return getDayAvailability(date, zone, mentors, bookings, now);
}

/**
 * Books a slot. The advisory lock serialises concurrent requests so the "is a mentor free?"
 * check and the insert are atomic; the partial unique index on (mentor_id, start_utc) backs
 * that up at the database level.
 */
export async function bookSlot(input: BookingInput): Promise<{ booking: Booking; mentorName: string; mentorTimezone: string }> {
  const now = DateTime.utc();
  let result;
  try {
    result = await withTransaction(async (tx) => {
      await tx.query("select pg_advisory_xact_lock($1)", [BOOKING_LOCK]);
      const [mentors, bookings] = await Promise.all([
        listMentors({ activeOnly: true }, tx),
        listConfirmedSince(sinceIso(now), tx),
      ]);
      const created = createBooking(input, mentors, bookings, now);
      await insertBooking(created.booking, tx);
      return created;
    });
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw new BookingError("NO_MENTOR_AVAILABLE", "That time was just taken. Pick another time.", 409);
    }
    throw e;
  }
  const { booking, mentor } = result;
  await deliver(buildConfirmationEmails(booking, mentor), booking.id);
  return { booking, mentorName: mentor.name, mentorTimezone: mentor.timezone };
}

export type CancelTarget = { by: "parent"; token: string } | { by: "admin"; id: string };

/** Cancels a confirmed booking, frees the slot, and tells both sides. */
export async function cancelBooking(target: CancelTarget, reason: string | null = null): Promise<BookingView> {
  const now = DateTime.utc();
  const cancelled = await withTransaction(async (tx) => {
    const found =
      target.by === "parent"
        ? await getBookingByToken(target.token, tx, true)
        : await getBookingById(target.id, tx, true);
    if (!found) throw new BookingError("NOT_FOUND", "Booking not found.", 404);
    if (found.status === "cancelled") throw new BookingError("ALREADY_CANCELLED", "This class is already cancelled.", 409);
    const start = DateTime.fromISO(found.startUtc);
    if (target.by === "parent") {
      if (start.diff(now, "minutes").minutes < PARENT_CANCEL_CUTOFF_MINUTES) {
        throw new BookingError(
          "TOO_LATE_TO_CANCEL",
          `Classes can only be cancelled online up to ${PARENT_CANCEL_CUTOFF_MINUTES} minutes before they start. Please contact support.`,
          409,
        );
      }
    } else if (DateTime.fromISO(found.endUtc) <= now) {
      throw new BookingError("ALREADY_PAST", "This class has already taken place.", 409);
    }
    await markCancelled(found.id, target.by, reason, tx);
    return { ...found, status: "cancelled" as const, cancelledBy: target.by, cancelReason: reason };
  });
  await deliver(buildCancellationEmails(cancelled), cancelled.id);
  return cancelled;
}
