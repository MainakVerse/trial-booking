import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import { BookingError, createBooking, getDayAvailability } from "../lib/scheduling";
import type { Booking, Mentor } from "../lib/types";

const IST = "Asia/Kolkata";
const NY = "America/New_York";
const LONDON = "Europe/London";

const mentor = (id: string, startHour = 0, endHour = 24, timezone = IST): Mentor => ({
  id, name: `Mentor ${id}`, email: `${id}@example.com`, timezone, window: { startHour, endHour }, active: true,
});

const utc = (iso: string) => DateTime.fromISO(iso, { zone: "utc" });
const localToUtc = (iso: string, zone: string) => DateTime.fromISO(iso, { zone }).toUTC().toISO()!;

let n = 0;
const parent = (timezone: string, startUtc: string) => ({
  parentName: "Parent", parentEmail: `p${++n}@example.com`, timezone, startUtc,
});

function expectCode(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(BookingError);
    expect((e as BookingError).code).toBe(code);
    return e as BookingError;
  }
  throw new Error(`expected ${code}`);
}

describe("DST-aware day generation", () => {
  const now = utc("2026-03-01T00:00:00Z");
  const mentors = [mentor("a")];

  it("US spring-forward day has 23 hourly slots", () => {
    const d = getDayAvailability("2026-03-08", NY, mentors, [], now);
    expect(d.hoursInDay).toBe(23);
    expect(d.slots).toHaveLength(23);
    expect(d.clockChange).toBe(true);
  });

  it("UK spring-forward day has 23 hourly slots", () => {
    expect(getDayAvailability("2026-03-29", LONDON, mentors, [], now).slots).toHaveLength(23);
  });

  it("US fall-back day has 25 slots, with 1 AM appearing twice", () => {
    const d = getDayAvailability("2026-11-01", NY, mentors, [], utc("2026-10-20T00:00:00Z"));
    expect(d.slots).toHaveLength(25);
    const oneAms = d.slots.filter((s) => DateTime.fromISO(s.startUtc).setZone(NY).hour === 1);
    expect(oneAms).toHaveLength(2);
  });

  it("an ordinary day has 24 slots", () => {
    expect(getDayAvailability("2026-03-05", NY, mentors, [], now).slots).toHaveLength(24);
  });
});

describe("parent and mentor see the right local time across DST", () => {
  const now = utc("2026-03-01T00:00:00Z");

  it("6 PM in New York is 4:30 AM IST before DST and 3:30 AM IST after", () => {
    const before = createBooking(parent(NY, localToUtc("2026-03-06T18:00", NY)), [mentor("a")], [], now);
    const after = createBooking(parent(NY, localToUtc("2026-03-09T18:00", NY)), [mentor("b")], [], now);
    expect(DateTime.fromISO(before.booking.startUtc).setZone(IST).toFormat("HH:mm")).toBe("04:30");
    expect(DateTime.fromISO(after.booking.startUtc).setZone(IST).toFormat("HH:mm")).toBe("03:30");
  });

  it("the US and UK change clocks on different dates", () => {
    // 2026-03-10: New York already on EDT, London still on GMT -> 4 hour gap instead of 5
    const instant = utc(localToUtc("2026-03-10T12:00", NY));
    expect(instant.setZone(LONDON).hour - instant.setZone(NY).hour).toBe(4);
  });
});

describe("mentor daily cap", () => {
  const now = utc("2026-01-01T00:00:00Z");

  it("rejects a third class on the same mentor-local day", () => {
    const bookings: Booking[] = [];
    const m = [mentor("a")];
    createBooking(parent(IST, localToUtc("2026-01-15T10:00", IST)), m, bookings, now);
    createBooking(parent(IST, localToUtc("2026-01-15T12:00", IST)), m, bookings, now);
    const err = expectCode(
      () => createBooking(parent(IST, localToUtc("2026-01-15T14:00", IST)), m, bookings, now),
      "NO_MENTOR_AVAILABLE",
    );
    expect(err.status).toBe(409);
    expect(err.suggestions.length).toBeGreaterThan(0); // points to the next day
  });

  it("counts the day in the mentor's zone, not the parent's", () => {
    const bookings: Booking[] = [];
    const m = [mentor("a")];
    // All on Jan 15 in New York. In India: 21:30 and 22:30 on the 15th, then 00:30 on the 16th.
    createBooking(parent(NY, localToUtc("2026-01-15T11:00", NY)), m, bookings, now);
    createBooking(parent(NY, localToUtc("2026-01-15T12:00", NY)), m, bookings, now);
    const third = createBooking(parent(NY, localToUtc("2026-01-15T14:00", NY)), m, bookings, now);
    expect(DateTime.fromISO(third.booking.startUtc).setZone(IST).toISODate()).toBe("2026-01-16");
  });

  it("10 mentors x 2 classes = 20 bookings, then the 21st is refused", () => {
    const bookings: Booking[] = [];
    const mentors = Array.from({ length: 10 }, (_, i) => mentor(`m${i}`));
    for (let h = 0; h < 20; h++) {
      createBooking(parent(IST, localToUtc(`2026-01-20T${String(h).padStart(2, "0")}:00`, IST)), mentors, bookings, now);
    }
    const counts = new Set(mentors.map((m) => bookings.filter((b) => b.mentorId === m.id).length));
    expect([...counts]).toEqual([2]); // load spread evenly
    expectCode(
      () => createBooking(parent(IST, localToUtc("2026-01-20T21:00", IST)), mentors, bookings, now),
      "NO_MENTOR_AVAILABLE",
    );
  });
});

describe("validation", () => {
  const now = utc("2026-01-01T00:00:00Z");
  const m = [mentor("a")];

  it("rejects a parent booking twice", () => {
    const bookings: Booking[] = [];
    const p = parent(NY, localToUtc("2026-01-10T18:00", NY));
    createBooking(p, m, bookings, now);
    expectCode(() => createBooking({ ...p, startUtc: localToUtc("2026-01-11T18:00", NY) }, m, bookings, now), "ALREADY_BOOKED");
  });

  it("rejects a start that isn't on the parent's hour", () => {
    expectCode(() => createBooking(parent(NY, localToUtc("2026-01-10T18:30", NY)), m, [], now), "INVALID_SLOT");
  });

  it("rejects bookings inside the lead time", () => {
    expectCode(() => createBooking(parent(NY, utc("2026-01-01T01:00:00Z").toISO()!), m, [], now), "TOO_SOON");
  });

  it("rejects unknown time zones", () => {
    expectCode(() => createBooking(parent("Mars/Olympus", localToUtc("2026-01-10T18:00", NY)), m, [], now), "INVALID_TIMEZONE");
  });
});
