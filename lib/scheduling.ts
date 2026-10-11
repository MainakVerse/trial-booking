import { randomBytes, randomUUID } from "node:crypto";
import { DateTime } from "luxon";
import {
  BOOKING_HORIZON_DAYS,
  MAX_EMAIL_LENGTH,
  MAX_CLASSES_PER_MENTOR_PER_DAY,
  MAX_NAME_LENGTH,
  MEETING_BASE_URL,
  MIN_LEAD_MINUTES,
  SLOT_MINUTES,
} from "./config";
import { emailKey } from "./email-key";
import { formatInZone, isValidZone } from "./time";
import type { Booking, Mentor } from "./types";

/**
 * open:   bookable
 * full:   mentors work at this hour but all are taken
 * closed: nobody works at this hour, or it is outside the booking window
 */
export type SlotStatus = "open" | "full" | "closed";

/** Why a slot is closed, so the UI can say something more useful than "unavailable". */
export type ClosedReason = "past" | "too_soon" | "too_far" | "no_shift";

export interface Slot {
  startUtc: string;
  endUtc: string;
  status: SlotStatus;
  mentorsFree: number;
  reason?: ClosedReason;
}

export interface DayAvailability {
  date: string;
  timezone: string;
  /** 23 or 25 on DST transition days. */
  hoursInDay: number;
  clockChange: boolean;
  slots: Slot[];
  /** Set when nothing on this day can be booked. */
  unavailableReason: ClosedReason | "full" | null;
  /** Nearest open times, filled only when this day has no open slot. */
  nextAvailable: string[];
}

export class BookingError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
    public suggestions: string[] = [],
  ) {
    super(message);
  }
}

const ms = (d: DateTime) => d.toMillis();
/** Trimmed string with control characters (including CR/LF) removed, so it is safe in emails and logs. */
const CONTROL_CHARS = new RegExp("[\\u0000-\\u001f\\u007f]", "g");
const str = (v: unknown) => (typeof v === "string" ? v.replace(CONTROL_CHARS, " ").trim() : "");

/** The mentor's local calendar date for an instant. The daily cap is counted against this. */
export function mentorDay(instant: DateTime, mentor: Mentor): string {
  return instant.setZone(mentor.timezone).toISODate()!;
}

function withinWorkingHours(mentor: Mentor, start: DateTime, end: DateTime): boolean {
  const day = start.setZone(mentor.timezone).startOf("day");
  const winStart = day.set({ hour: mentor.window.startHour });
  const winEnd =
    mentor.window.endHour >= 24 ? day.plus({ days: 1 }) : day.set({ hour: mentor.window.endHour });
  return ms(start) >= ms(winStart) && ms(end) <= ms(winEnd);
}

function classesOnMentorDay(mentor: Mentor, instant: DateTime, bookings: Booking[]): number {
  const day = mentorDay(instant, mentor);
  return bookings.filter(
    (b) => b.mentorId === mentor.id && mentorDay(DateTime.fromISO(b.startUtc, { zone: "utc" }), mentor) === day,
  ).length;
}

export function freeMentors(start: DateTime, mentors: Mentor[], bookings: Booking[]): Mentor[] {
  const end = start.plus({ minutes: SLOT_MINUTES });
  return mentors.filter((m) => {
    if (!withinWorkingHours(m, start, end)) return false;
    if (classesOnMentorDay(m, start, bookings) >= MAX_CLASSES_PER_MENTOR_PER_DAY) return false;
    const clash = bookings.some(
      (b) => b.mentorId === m.id && Date.parse(b.startUtc) < ms(end) && ms(start) < Date.parse(b.endUtc),
    );
    return !clash;
  });
}

function bookableRange(now: DateTime) {
  return {
    earliest: now.plus({ minutes: MIN_LEAD_MINUTES }),
    latest: now.plus({ days: BOOKING_HORIZON_DAYS }),
  };
}

/**
 * All hourly slots for one calendar day *in the parent's zone*.
 * Stepping in absolute time from local midnight to the next local midnight
 * yields 23 slots on spring-forward days and 25 on fall-back days.
 */
export function getDayAvailability(
  dateISO: string,
  zone: string,
  mentors: Mentor[],
  bookings: Booking[],
  now: DateTime = DateTime.utc(),
): DayAvailability {
  if (!isValidZone(zone)) throw new BookingError("INVALID_TIMEZONE", `Unknown time zone "${zone}".`);
  const dayStart = DateTime.fromISO(dateISO, { zone }).startOf("day");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO) || !dayStart.isValid) {
    throw new BookingError("INVALID_DATE", "Date must be in YYYY-MM-DD format.");
  }
  const dayEnd = dayStart.plus({ days: 1 });
  const { earliest, latest } = bookableRange(now);

  const slots: Slot[] = [];
  for (let t = dayStart; ms(t) < ms(dayEnd); t = t.plus({ minutes: SLOT_MINUTES })) {
    const start = t.toUTC();
    const end = start.plus({ minutes: SLOT_MINUTES });
    const base = { startUtc: start.toISO()!, endUtc: end.toISO()! };
    const closed = (reason: ClosedReason): Slot => ({ ...base, status: "closed", mentorsFree: 0, reason });
    if (ms(start) < ms(now)) slots.push(closed("past"));
    else if (ms(start) < ms(earliest)) slots.push(closed("too_soon"));
    else if (ms(start) > ms(latest)) slots.push(closed("too_far"));
    else if (!mentors.some((m) => withinWorkingHours(m, start, end))) slots.push(closed("no_shift"));
    else {
      const free = freeMentors(start, mentors, bookings).length;
      slots.push({ ...base, status: free > 0 ? "open" : "full", mentorsFree: free });
    }
  }

  const hoursInDay = Math.round(dayEnd.diff(dayStart, "hours").hours);
  const anyOpen = slots.some((s) => s.status === "open");
  const anyFull = slots.some((s) => s.status === "full");
  let unavailableReason: DayAvailability["unavailableReason"] = null;
  if (!anyOpen) {
    if (anyFull) unavailableReason = "full";
    else if (ms(dayEnd) <= ms(now)) unavailableReason = "past";
    else if (ms(dayEnd) <= ms(earliest)) unavailableReason = "too_soon";
    else if (ms(dayStart) > ms(latest)) unavailableReason = "too_far";
    else unavailableReason = "no_shift";
  }
  const nextAvailable = anyOpen || unavailableReason === "too_far" ? [] : suggestAlternatives(dayStart, zone, mentors, bookings, now);
  return { date: dateISO, timezone: zone, hoursInDay, clockChange: hoursInDay !== 24, slots, unavailableReason, nextAvailable };
}

/** Nearest bookable slots at or after `from`, aligned to the parent's local hour. */
export function suggestAlternatives(
  from: DateTime,
  zone: string,
  mentors: Mentor[],
  bookings: Booking[],
  now: DateTime = DateTime.utc(),
  limit = 3,
): string[] {
  const { earliest, latest } = bookableRange(now);
  let t = (ms(from) > ms(earliest) ? from : earliest).setZone(zone);
  if (t.minute || t.second || t.millisecond) t = t.startOf("hour").plus({ hours: 1 });
  const out: string[] = [];
  while (ms(t) <= ms(latest) && out.length < limit) {
    if (freeMentors(t.toUTC(), mentors, bookings).length > 0) out.push(t.toUTC().toISO()!);
    t = t.plus({ minutes: SLOT_MINUTES });
  }
  return out;
}

/** Spread load: fewest classes that mentor-day, then fewest overall, then stable by id. */
function pickMentor(candidates: Mentor[], start: DateTime, bookings: Booking[]): Mentor {
  const load = (m: Mentor) => [
    classesOnMentorDay(m, start, bookings),
    bookings.filter((b) => b.mentorId === m.id && b.status === "confirmed").length,
  ];
  return [...candidates].sort((a, b) => {
    const [ad, at] = load(a);
    const [bd, bt] = load(b);
    return ad - bd || at - bt || a.id.localeCompare(b.id);
  })[0];
}

export interface BookingInput {
  parentName?: unknown;
  parentEmail?: unknown;
  timezone?: unknown;
  startUtc?: unknown;
}

/**
 * Validates, assigns a mentor and builds the booking. Pure: `bookings` must hold the confirmed
 * bookings only, and the new one is pushed onto it. The caller (lib/booking-service.ts) runs this
 * inside a database transaction holding an advisory lock, then inserts the result; a partial
 * unique index on (mentor_id, start_utc) is the final backstop against double-booking.
 */
export function createBooking(
  input: BookingInput,
  mentors: Mentor[],
  bookings: Booking[],
  now: DateTime = DateTime.utc(),
): { booking: Booking; mentor: Mentor } {
  const parentName = str(input.parentName);
  const parentEmail = str(input.parentEmail).toLowerCase();
  const timezone = str(input.timezone);

  if (!parentName) throw new BookingError("INVALID_NAME", "Enter the parent's name.");
  if (parentName.length > MAX_NAME_LENGTH) {
    throw new BookingError("INVALID_NAME", `Name must be ${MAX_NAME_LENGTH} characters or fewer.`);
  }
  if (parentEmail.length > MAX_EMAIL_LENGTH || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parentEmail)) {
    throw new BookingError("INVALID_EMAIL", "Enter a valid email address.");
  }
  if (!isValidZone(timezone)) throw new BookingError("INVALID_TIMEZONE", `Unknown time zone "${timezone}".`);

  const start = DateTime.fromISO(str(input.startUtc), { zone: "utc" });
  if (!start.isValid) throw new BookingError("INVALID_SLOT", "Pick a time from the list.");
  const local = start.setZone(timezone);
  if (local.minute !== 0 || local.second !== 0 || local.millisecond !== 0) {
    throw new BookingError("INVALID_SLOT", "Classes start on the hour. Pick a time from the list.");
  }

  const { earliest, latest } = bookableRange(now);
  if (ms(start) < ms(earliest)) {
    throw new BookingError(
      "TOO_SOON",
      `Classes need to be booked at least ${MIN_LEAD_MINUTES / 60} hours ahead.`,
      422,
      suggestAlternatives(earliest, timezone, mentors, bookings, now),
    );
  }
  if (ms(start) > ms(latest)) {
    throw new BookingError("TOO_FAR", `Trial classes can be booked up to ${BOOKING_HORIZON_DAYS} days ahead.`, 422);
  }

  const parentKey = emailKey(parentEmail);
  const existing = bookings.find(
    (b) => b.status === "confirmed" && b.parentKey === parentKey && Date.parse(b.endUtc) > ms(now),
  );
  if (existing) {
    throw new BookingError(
      "ALREADY_BOOKED",
      `${parentEmail} already has a trial class on ${formatInZone(existing.startUtc, timezone)}. Use the link in your confirmation email to change it.`,
      409,
    );
  }

  const free = freeMentors(start, mentors, bookings);
  if (free.length === 0) {
    const suggestions = suggestAlternatives(start, timezone, mentors, bookings, now);
    throw new BookingError(
      "NO_MENTOR_AVAILABLE",
      suggestions.length
        ? "Every mentor is booked at this time. Pick one of the nearest open times below."
        : `Every mentor is fully booked for the next ${BOOKING_HORIZON_DAYS} days. Try again later or contact support.`,
      409,
      suggestions,
    );
  }

  const mentor = pickMentor(free, start, bookings);
  const id = randomUUID();
  const booking: Booking = {
    id,
    manageToken: randomBytes(24).toString("base64url"),
    mentorId: mentor.id,
    parentName,
    parentEmail,
    parentKey,
    parentTimezone: timezone,
    startUtc: start.toISO()!,
    endUtc: start.plus({ minutes: SLOT_MINUTES }).toISO()!,
    meetingLink: `${MEETING_BASE_URL}/${id}`,
    status: "confirmed",
    cancelledAt: null,
    cancelledBy: null,
    cancelReason: null,
    createdAt: now.toISO()!,
  };
  bookings.push(booking);
  return { booking, mentor };
}
