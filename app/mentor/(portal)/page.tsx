import { DateTime } from "luxon";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { loadMentor, requireMentorId } from "@/lib/auth";
import { MAX_CLASSES_PER_MENTOR_PER_DAY } from "@/lib/config";
import { listMentorBookings } from "@/lib/repo";
import { fmt, shiftLabel, zoneCity } from "@/lib/time";
import type { BookingView } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My classes | Codeyoung", robots: { index: false } };

function ClassTable({ rows, zone, empty }: { rows: BookingView[]; zone: string; empty: string }) {
  if (rows.length === 0) return <p className="muted">{empty}</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr><th>Your time ({zoneCity(zone)})</th><th>Parent</th><th>Parent's local time</th><th>Class</th></tr>
        </thead>
        <tbody>
          {rows.map((b) => (
            <tr key={b.id} className={b.status === "cancelled" ? "row-cancelled" : undefined}>
              <td><strong>{fmt(b.startUtc, zone, "ccc d LLL, h:mm a")}</strong> <span className="muted">{fmt(b.startUtc, zone, "ZZZZ")}</span></td>
              <td>{b.parentName}</td>
              <td>{fmt(b.startUtc, b.parentTimezone, "ccc d LLL, h:mm a ZZZZ")}<br /><span className="muted">{zoneCity(b.parentTimezone)}</span></td>
              <td>
                {b.status === "cancelled" ? <span className="badge badge-bad">Cancelled</span> : <a href={b.meetingLink}>Join link</a>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function MentorHome() {
  const id = requireMentorId();
  const [mentor, all] = await Promise.all([
    loadMentor(id),
    listMentorBookings(id, DateTime.utc().minus({ days: 15 }).toISO()!),
  ]);
  if (!mentor || !mentor.active) redirect("/mentor/login");
  const zone = mentor.timezone;
  const now = DateTime.now().setZone(zone);

  const sameDay = (b: BookingView) => DateTime.fromISO(b.startUtc).setZone(zone).hasSame(now, "day");
  const live = all.filter((b) => b.status === "confirmed");
  const todayCount = live.filter(sameDay).length;
  const today = all.filter((b) => sameDay(b) && DateTime.fromISO(b.endUtc) > now);
  const upcoming = all.filter((b) => !sameDay(b) && DateTime.fromISO(b.startUtc) > now);
  const recent = all.filter((b) => DateTime.fromISO(b.endUtc) <= now).reverse();
  const next = live.find((b) => DateTime.fromISO(b.endUtc) > now);

  return (
    <div className="portal">
      <h1>My classes</h1>
      <p className="muted">
        Times below are in your time zone, {mentor.timezone}. Your shift is {shiftLabel(mentor.window, zone)}.
      </p>

      <div className="stat-row">
        <div className="stat">
          <span className="stat-n">{todayCount} / {MAX_CLASSES_PER_MENTOR_PER_DAY}</span>
          <span className="stat-l">classes today ({now.toFormat("ccc d LLL")})</span>
        </div>
        <div className="stat">
          <span className="stat-n">{live.filter((b) => DateTime.fromISO(b.startUtc) > now).length}</span>
          <span className="stat-l">upcoming classes</span>
        </div>
        <div className="stat">
          <span className="stat-n">{next ? fmt(next.startUtc, zone, "h:mm a") : "None"}</span>
          <span className="stat-l">{next ? `next class, ${fmt(next.startUtc, zone, "ccc d LLL")}` : "next class"}</span>
        </div>
      </div>

      <h2>Today</h2>
      <ClassTable rows={today} zone={zone} empty="No classes left today." />
      <h2>Upcoming</h2>
      <ClassTable rows={upcoming} zone={zone} empty="Nothing booked yet. New bookings appear here automatically." />
      <h2>Last 14 days</h2>
      <ClassTable rows={recent} zone={zone} empty="No recent classes." />
    </div>
  );
}
