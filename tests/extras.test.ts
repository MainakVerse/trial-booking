import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import { emailKey } from "../lib/email-key";
import { buildCancellationEmails, buildConfirmationEmails } from "../lib/notify";
import { generateAccessCode, hashSecret, safeEqual, verifySecret } from "../lib/password";
import { allow } from "../lib/rate-limit";
import { BookingError, createBooking, getDayAvailability } from "../lib/scheduling";
import { signSession, verifySession } from "../lib/session-token";
import type { Booking, BookingView, Mentor } from "../lib/types";

const IST = "Asia/Kolkata";
const NY = "America/New_York";
const utc = (iso: string) => DateTime.fromISO(iso, { zone: "utc" });
const localToUtc = (iso: string, zone: string) => DateTime.fromISO(iso, { zone }).toUTC().toISO()!;
const mentor = (id: string, startHour = 0, endHour = 24, timezone = IST): Mentor => ({
  id, name: `Mentor ${id}`, email: `${id}@example.com`, timezone, window: { startHour, endHour }, active: true,
});
let n = 0;
const parent = (timezone: string, startUtc: string, extra: Record<string, unknown> = {}) => ({
  parentName: "Parent", parentEmail: `x${++n}@example.com`, timezone, startUtc, ...extra,
});
const codeOf = (fn: () => unknown) => {
  try { fn(); } catch (e) { return (e as BookingError).code; }
  return "none";
};

describe("closed-slot reasons and next available", () => {
  const now = utc("2026-01-10T12:00:00Z");

  it("labels past, too-soon, too-far and no-shift slots", () => {
    const m = [mentor("a", 3, 10)];
    const today = getDayAvailability("2026-01-10", NY, m, [], now);
    expect(today.slots.some((s) => s.reason === "past")).toBe(true);
    const far = getDayAvailability("2026-03-20", NY, m, [], now);
    expect(far.unavailableReason).toBe("too_far");
    expect(far.nextAvailable).toEqual([]);
    const past = getDayAvailability("2026-01-05", NY, m, [], now);
    expect(past.unavailableReason).toBe("past");
  });

  it("reports a fully booked day and offers the nearest open times", () => {
    const m = [mentor("a", 9, 11)]; // 2 IST hours/day, cap 2
    const bookings: Booking[] = [];
    createBooking(parent(IST, localToUtc("2026-01-15T09:00", IST)), m, bookings, now);
    createBooking(parent(IST, localToUtc("2026-01-15T10:00", IST)), m, bookings, now);
    const day = getDayAvailability("2026-01-15", IST, m, bookings, now);
    expect(day.unavailableReason).toBe("full");
    expect(day.slots.filter((s) => s.status === "full")).toHaveLength(2);
    const next = DateTime.fromISO(day.nextAvailable[0]).setZone(IST);
    expect(next.toISODate()).toBe("2026-01-16");
  });
});

describe("correctness edge cases", () => {
  const now = utc("2026-03-01T00:00:00Z");

  it("a cancelled booking frees its slot and does not count toward the cap", () => {
    const m = [mentor("a")];
    const bookings: Booking[] = [];
    const first = createBooking(parent(IST, localToUtc("2026-03-10T10:00", IST)), m, bookings, now);
    first.booking.status = "cancelled";
    const confirmedOnly = bookings.filter((b) => b.status === "confirmed");
    expect(() => createBooking(parent(IST, localToUtc("2026-03-10T10:00", IST)), m, confirmedOnly, now)).not.toThrow();
  });

  it("books a half-hour-offset zone (India parent) on its local hour", () => {
    const { booking } = createBooking(parent(IST, localToUtc("2026-03-10T18:00", IST)), [mentor("a")], [], now);
    expect(booking.startUtc).toContain(":30:00");
    expect(codeOf(() => createBooking(parent(IST, localToUtc("2026-03-10T18:30", IST)), [mentor("a")], [], now))).toBe("INVALID_SLOT");
  });

  it("handles a mentor in a DST zone: a 9-17 New York shift moves in UTC when clocks change", () => {
    const ny = [mentor("ny", 9, 17, NY)];
    const before = createBooking(parent(NY, localToUtc("2026-03-06T09:00", NY)), ny, [], now);
    const after = createBooking(parent(NY, localToUtc("2026-03-09T09:00", NY)), ny, [], now);
    expect(DateTime.fromISO(before.booking.startUtc).toUTC().hour).toBe(14); // EST
    expect(DateTime.fromISO(after.booking.startUtc).toUTC().hour).toBe(13); // EDT
    expect(codeOf(() => createBooking(parent(NY, localToUtc("2026-03-09T17:00", NY)), ny, [], now))).toBe("NO_MENTOR_AVAILABLE");
  });

  it("treats plus-addressing and Gmail dots as the same parent", () => {
    const bookings: Booking[] = [];
    const m = [mentor("a")];
    createBooking({ ...parent(NY, localToUtc("2026-03-10T18:00", NY)), parentEmail: "a.b@gmail.com" }, m, bookings, now);
    expect(
      codeOf(() => createBooking({ ...parent(NY, localToUtc("2026-03-11T18:00", NY)), parentEmail: "ab+two@gmail.com" }, m, bookings, now)),
    ).toBe("ALREADY_BOOKED");
  });

  it("strips control characters from names and rejects overlong ones", () => {
    const { booking } = createBooking(
      parent(NY, localToUtc("2026-03-10T18:00", NY), { parentName: "Eve\r\nBcc: x@y.z" }), [mentor("a")], [], now,
    );
    expect(booking.parentName).not.toMatch(/[\r\n]/);
    expect(codeOf(() => createBooking(parent(NY, localToUtc("2026-03-10T18:00", NY), { parentName: "x".repeat(101) }), [mentor("a")], [], now))).toBe("INVALID_NAME");
  });
});

describe("emailKey", () => {
  it("normalises case, tags and Gmail dots only for Gmail", () => {
    expect(emailKey(" A.B+c@Gmail.com ")).toBe("ab@gmail.com");
    expect(emailKey("a.b+c@googlemail.com")).toBe("ab@gmail.com");
    expect(emailKey("a.b+c@example.com")).toBe("a.b@example.com");
  });
});

describe("secrets and sessions", () => {
  it("hashes and verifies access codes", () => {
    const h = hashSecret("hunter22");
    expect(verifySecret("hunter22", h)).toBe(true);
    expect(verifySecret("hunter23", h)).toBe(false);
    expect(verifySecret("x", "garbage")).toBe(false);
    expect(generateAccessCode()).toMatch(/^[a-z2-9]{10}$/);
    expect(safeEqual("a", "a")).toBe(true);
    expect(safeEqual("a", "ab")).toBe(false);
  });

  it("signs, verifies, expires and rejects tampered session tokens", () => {
    const secret = "s".repeat(32);
    const t = signSession({ role: "mentor", mentorId: "m01" }, secret, 1000, 5000);
    expect(verifySession(t, secret, 5500)).toEqual({ role: "mentor", mentorId: "m01" });
    expect(verifySession(t, secret, 7000)).toBeNull(); // expired
    expect(verifySession(t, "o".repeat(32), 5500)).toBeNull(); // wrong key
    const [data, sig] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ s: { role: "admin" }, exp: 99999999999999 })).toString("base64url");
    expect(verifySession(`${forged}.${sig}`, secret, 5500)).toBeNull();
    expect(verifySession(`${data}.`, secret, 5500)).toBeNull();
    expect(verifySession(undefined, secret)).toBeNull();
  });

  it("rate limiter blocks after the limit and recovers after the window", () => {
    const key = `t:${Math.random()}`;
    expect([1, 2, 3].map((i) => allow(key, 2, 1000, i))).toEqual([true, true, false]);
    expect(allow(key, 2, 1000, 5000)).toBe(true);
  });
});

describe("emails carry each side's own local time", () => {
  const b: Booking = {
    id: "id1", manageToken: "tok", mentorId: "a", parentName: "Pat", parentEmail: "pat@example.com", parentKey: "pat@example.com",
    parentTimezone: NY, startUtc: "2026-03-10T22:00:00.000Z", endUtc: "2026-03-10T23:00:00.000Z",
    meetingLink: "https://meet.example/1", status: "confirmed", cancelledAt: null, cancelledBy: null, cancelReason: null, createdAt: "",
  };
  const m = { name: "Ananya Sharma", email: "a@m.example", timezone: IST };

  it("shows New York time to the parent and IST to the mentor", () => {
    const [toParent, toMentor] = buildConfirmationEmails(b, m);
    expect(toParent.subject).toContain("6:00 PM EDT");
    expect(toParent.body).toContain("/booking/tok");
    expect(toMentor.subject).toContain("3:30 AM IST");
  });

  it("cancellation emails go to both and include the reason", () => {
    const view: BookingView = { ...b, status: "cancelled", cancelReason: "Mentor unwell", mentorName: m.name, mentorEmail: m.email, mentorTimezone: m.timezone };
    const mails = buildCancellationEmails(view);
    expect(mails.map((x) => x.to)).toEqual(["pat@example.com", "a@m.example"]);
    expect(mails.every((x) => x.body.includes("Mentor unwell"))).toBe(true);
  });
});
