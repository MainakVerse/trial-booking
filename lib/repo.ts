import { query, type Queryable } from "./db";
import type { Booking, BookingView, Mentor } from "./types";

type Row = Record<string, any>;
const iso = (d: Date | string | null) => (d == null ? null : new Date(d).toISOString());

/* ---------- mappers ---------- */

export function toMentor(r: Row): Mentor {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    timezone: r.timezone,
    window: { startHour: r.start_hour, endHour: r.end_hour },
    active: r.active,
  };
}

export function toBooking(r: Row): Booking {
  return {
    id: r.id,
    manageToken: r.manage_token,
    mentorId: r.mentor_id,
    parentName: r.parent_name,
    parentEmail: r.parent_email,
    parentKey: r.parent_key,
    parentTimezone: r.parent_timezone,
    startUtc: iso(r.start_utc)!,
    endUtc: iso(r.end_utc)!,
    meetingLink: r.meeting_link,
    status: r.status,
    cancelledAt: iso(r.cancelled_at),
    cancelledBy: r.cancelled_by,
    cancelReason: r.cancel_reason,
    createdAt: iso(r.created_at)!,
  };
}

const toView = (r: Row): BookingView => ({
  ...toBooking(r),
  mentorName: r.mentor_name,
  mentorEmail: r.mentor_email,
  mentorTimezone: r.mentor_timezone,
});

const VIEW_SELECT = `
  select b.*, m.name as mentor_name, m.email as mentor_email, m.timezone as mentor_timezone
  from bookings b join mentors m on m.id = b.mentor_id`;

/* ---------- mentors ---------- */

export async function listMentors(opts: { activeOnly?: boolean } = {}, db?: Queryable): Promise<Mentor[]> {
  const { rows } = await query(
    `select * from mentors ${opts.activeOnly ? "where active" : ""} order by name`,
    [],
    db,
  );
  return rows.map(toMentor);
}

export async function getMentor(id: string): Promise<Mentor | null> {
  const { rows } = await query("select * from mentors where id = $1", [id]);
  return rows[0] ? toMentor(rows[0]) : null;
}

export async function getMentorAuth(email: string): Promise<{ mentor: Mentor; accessHash: string } | null> {
  const { rows } = await query("select * from mentors where lower(email) = lower($1)", [email.trim()]);
  return rows[0] ? { mentor: toMentor(rows[0]), accessHash: rows[0].access_hash } : null;
}

export interface MentorInput {
  name: string;
  email: string;
  timezone: string;
  startHour: number;
  endHour: number;
}

export async function insertMentor(id: string, m: MentorInput, accessHash: string): Promise<void> {
  await query(
    `insert into mentors (id, name, email, timezone, start_hour, end_hour, access_hash)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [id, m.name, m.email, m.timezone, m.startHour, m.endHour, accessHash],
  );
}

export async function updateMentor(id: string, m: MentorInput): Promise<void> {
  await query(
    `update mentors set name = $2, email = $3, timezone = $4, start_hour = $5, end_hour = $6 where id = $1`,
    [id, m.name, m.email, m.timezone, m.startHour, m.endHour],
  );
}

export const setMentorActive = (id: string, active: boolean) =>
  query("update mentors set active = $2 where id = $1", [id, active]);

export const setMentorAccessHash = (id: string, hash: string) =>
  query("update mentors set access_hash = $2 where id = $1", [id, hash]);

export async function mentorLoad(): Promise<Record<string, number>> {
  const { rows } = await query(
    `select mentor_id, count(*)::int as n from bookings
     where status = 'confirmed' and end_utc > now() group by mentor_id`,
  );
  return Object.fromEntries(rows.map((r) => [r.mentor_id, r.n]));
}

/* ---------- bookings ---------- */

/** Confirmed bookings ending after `sinceIso`. The scheduler only needs these. */
export async function listConfirmedSince(sinceIso: string, db?: Queryable): Promise<Booking[]> {
  const { rows } = await query(
    "select * from bookings where status = 'confirmed' and end_utc > $1 order by start_utc",
    [sinceIso],
    db,
  );
  return rows.map(toBooking);
}

export async function insertBooking(b: Booking, db: Queryable): Promise<void> {
  await query(
    `insert into bookings (id, manage_token, mentor_id, parent_name, parent_email, parent_key, parent_timezone,
                           start_utc, end_utc, meeting_link, status, created_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'confirmed',$11)`,
    [b.id, b.manageToken, b.mentorId, b.parentName, b.parentEmail, b.parentKey, b.parentTimezone,
     b.startUtc, b.endUtc, b.meetingLink, b.createdAt],
    db,
  );
}

export async function getBookingByToken(token: string, db?: Queryable, lock = false): Promise<BookingView | null> {
  const { rows } = await query(
    `${VIEW_SELECT} where b.manage_token = $1 ${lock ? "for update of b" : ""}`,
    [token],
    db,
  );
  return rows[0] ? toView(rows[0]) : null;
}

export async function getBookingById(id: string, db?: Queryable, lock = false): Promise<BookingView | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { rows } = await query(`${VIEW_SELECT} where b.id = $1 ${lock ? "for update of b" : ""}`, [id], db);
  return rows[0] ? toView(rows[0]) : null;
}

export async function markCancelled(id: string, by: "parent" | "admin", reason: string | null, db: Queryable) {
  await query(
    `update bookings set status = 'cancelled', cancelled_at = now(), cancelled_by = $2, cancel_reason = $3
     where id = $1`,
    [id, by, reason],
    db,
  );
}

export async function listMentorBookings(mentorId: string, fromIso: string): Promise<BookingView[]> {
  const { rows } = await query(
    `${VIEW_SELECT} where b.mentor_id = $1 and b.start_utc >= $2 order by b.start_utc`,
    [mentorId, fromIso],
  );
  return rows.map(toView);
}

export interface BookingFilter {
  status: "all" | "confirmed" | "cancelled";
  when: "upcoming" | "past" | "all";
  q: string;
  limit: number;
  offset: number;
}

export async function searchBookings(f: BookingFilter): Promise<{ rows: BookingView[]; total: number }> {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, v?: unknown) => {
    if (v !== undefined) params.push(v);
    where.push(sql.replace("?", `$${params.length}`));
  };
  if (f.status !== "all") add("b.status = ?", f.status);
  if (f.when === "upcoming") add("b.end_utc > now()");
  if (f.when === "past") add("b.end_utc <= now()");
  if (f.q) {
    params.push(`%${f.q.replace(/[%_\\]/g, "\\$&")}%`);
    where.push(`(b.parent_name ilike $${params.length} or b.parent_email ilike $${params.length}
                 or m.name ilike $${params.length})`);
  }
  const clause = where.length ? `where ${where.join(" and ")}` : "";
  const order = f.when === "past" ? "desc" : "asc";
  const [list, count] = await Promise.all([
    query(`${VIEW_SELECT} ${clause} order by b.start_utc ${order} limit ${f.limit} offset ${f.offset}`, params),
    query(`select count(*)::int as n from bookings b join mentors m on m.id = b.mentor_id ${clause}`, params),
  ]);
  return { rows: list.rows.map(toView), total: count.rows[0].n };
}

export interface Stats {
  upcoming: number;
  confirmed: number;
  cancelled: number;
  total: number;
}

export async function bookingStats(): Promise<Stats> {
  const { rows } = await query(`
    select
      count(*) filter (where status = 'confirmed' and end_utc > now())::int as upcoming,
      count(*) filter (where status = 'confirmed')::int as confirmed,
      count(*) filter (where status = 'cancelled')::int as cancelled,
      count(*)::int as total
    from bookings`);
  return rows[0] as Stats;
}

export async function confirmedBetween(fromIso: string, toIso: string): Promise<Booking[]> {
  const { rows } = await query(
    "select * from bookings where status = 'confirmed' and start_utc >= $1 and start_utc < $2 order by start_utc",
    [fromIso, toIso],
  );
  return rows.map(toBooking);
}

/* ---------- email log ---------- */

export interface EmailLogRow {
  id: number;
  bookingId: string | null;
  recipient: string;
  subject: string;
  body: string;
  status: "sent" | "logged" | "failed";
  error: string | null;
  createdAt: string;
}

export async function insertEmailLog(
  e: { bookingId: string | null; recipient: string; subject: string; body: string; status: string; error?: string },
) {
  await query(
    `insert into email_log (booking_id, recipient, subject, body, status, error) values ($1,$2,$3,$4,$5,$6)`,
    [e.bookingId, e.recipient, e.subject, e.body, e.status, e.error ?? null],
  );
}

export async function listEmailLog(limit: number): Promise<EmailLogRow[]> {
  const { rows } = await query("select * from email_log order by created_at desc, id desc limit $1", [limit]);
  return rows.map((r) => ({
    id: Number(r.id),
    bookingId: r.booking_id,
    recipient: r.recipient,
    subject: r.subject,
    body: r.body,
    status: r.status,
    error: r.error,
    createdAt: iso(r.created_at)!,
  }));
}
