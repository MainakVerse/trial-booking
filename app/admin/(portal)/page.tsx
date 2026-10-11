import { DateTime } from "luxon";
import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { adminTimezone, MAX_CLASSES_PER_MENTOR_PER_DAY } from "@/lib/config";
import { bookingStats, confirmedBetween, listMentors, searchBookings } from "@/lib/repo";
import { fmt, zoneCity } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin overview | Codeyoung", robots: { index: false } };

export default async function AdminOverview() {
  requireAdmin();
  const zone = adminTimezone();
  const start = DateTime.now().setZone(zone).startOf("day");
  const days = Array.from({ length: 7 }, (_, i) => start.plus({ days: i }));

  const [stats, mentors, week, recent] = await Promise.all([
    bookingStats(),
    listMentors(),
    confirmedBetween(start.toUTC().toISO()!, start.plus({ days: 7 }).toUTC().toISO()!),
    searchBookings({ status: "all", when: "all", q: "", limit: 8, offset: 0 }),
  ]);
  const active = mentors.filter((m) => m.active).length;
  const capacity = active * MAX_CLASSES_PER_MENTOR_PER_DAY;

  return (
    <div className="portal">
      <h1>Overview</h1>

      <div className="stat-row">
        <div className="stat"><span className="stat-n">{stats.upcoming}</span><span className="stat-l">upcoming classes</span></div>
        <div className="stat"><span className="stat-n">{active} / {mentors.length}</span><span className="stat-l">active mentors</span></div>
        <div className="stat"><span className="stat-n">{capacity}</span><span className="stat-l">classes per day, at full capacity</span></div>
        <div className="stat"><span className="stat-n">{stats.cancelled}</span><span className="stat-l">cancelled, all time</span></div>
      </div>

      <h2>Next 7 days</h2>
      <p className="muted">Confirmed classes against the daily capacity of {capacity} ({active} mentors × {MAX_CLASSES_PER_MENTOR_PER_DAY}).</p>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Day ({zoneCity(zone)})</th><th>Booked</th><th className="wide">Utilisation</th></tr></thead>
          <tbody>
            {days.map((d) => {
              const n = week.filter((b) => DateTime.fromISO(b.startUtc).setZone(zone).hasSame(d, "day")).length;
              const pct = capacity ? Math.min(100, Math.round((n / capacity) * 100)) : 0;
              return (
                <tr key={d.toISODate()}>
                  <td>{d.toFormat("ccc d LLL")}</td>
                  <td>{n} / {capacity}</td>
                  <td>
                    <div className="meter" role="img" aria-label={`${pct}% of capacity`}><span style={{ width: `${pct}%` }} /></div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2>Latest bookings</h2>
      {recent.rows.length === 0 ? (
        <p className="muted">No bookings yet.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Class time</th><th>Parent</th><th>Mentor</th><th>Status</th></tr></thead>
            <tbody>
              {recent.rows.map((b) => (
                <tr key={b.id} className={b.status === "cancelled" ? "row-cancelled" : undefined}>
                  <td>{fmt(b.startUtc, zone, "ccc d LLL, h:mm a ZZZZ")}</td>
                  <td>{b.parentName}<br /><span className="muted">{b.parentEmail}</span></td>
                  <td>{b.mentorName}</td>
                  <td><span className={`badge ${b.status === "confirmed" ? "badge-ok" : "badge-bad"}`}>{b.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p><Link href="/admin/bookings">All bookings →</Link></p>
    </div>
  );
}
