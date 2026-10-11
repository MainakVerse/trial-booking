import { DateTime } from "luxon";
import type { Metadata } from "next";
import Link from "next/link";
import ActionForm from "@/components/ActionForm";
import BookingFilters from "@/components/BookingFilters";
import { requireAdmin } from "@/lib/auth";
import { adminTimezone } from "@/lib/config";
import { searchBookings, type BookingFilter } from "@/lib/repo";
import { fmt, zoneCity } from "@/lib/time";
import { adminCancelBooking } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Bookings | Admin", robots: { index: false } };

const PAGE_SIZE = 25;
const pick = <T extends string>(v: string | undefined, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;

export default async function AdminBookings({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  requireAdmin();
  const zone = adminTimezone();
  const filter: BookingFilter = {
    status: pick(searchParams.status, ["all", "confirmed", "cancelled"], "all"),
    when: pick(searchParams.when, ["upcoming", "past", "all"], "upcoming"),
    q: (searchParams.q ?? "").trim().slice(0, 100),
    limit: PAGE_SIZE,
    offset: Math.max(0, (Number(searchParams.page) || 1) - 1) * PAGE_SIZE,
  };
  const { rows, total } = await searchBookings(filter);
  const page = filter.offset / PAGE_SIZE + 1;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const now = DateTime.utc();
  const link = (p: number) => {
    const qs = new URLSearchParams({ status: filter.status, when: filter.when, q: filter.q, page: String(p) });
    return `/admin/bookings?${qs}`;
  };

  return (
    <div className="portal">
      <h1>Bookings</h1>
      <BookingFilters q={filter.q} status={filter.status} when={filter.when} />

      <p className="muted">{total} booking{total === 1 ? "" : "s"} · page {page} of {pages}</p>
      {rows.length === 0 ? (
        <p>No bookings match.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Class time ({zoneCity(zone)})</th><th>Parent</th><th>Parent's time</th><th>Mentor</th><th>Status</th><th>Action</th></tr>
            </thead>
            <tbody>
              {rows.map((b) => {
                const cancellable = b.status === "confirmed" && DateTime.fromISO(b.endUtc) > now;
                return (
                  <tr key={b.id} className={b.status === "cancelled" ? "row-cancelled" : undefined}>
                    <td><strong>{fmt(b.startUtc, zone, "ccc d LLL, h:mm a")}</strong> <span className="muted">{fmt(b.startUtc, zone, "ZZZZ")}</span></td>
                    <td>{b.parentName}<br /><span className="muted">{b.parentEmail}</span></td>
                    <td>{fmt(b.startUtc, b.parentTimezone, "ccc d LLL, h:mm a ZZZZ")}<br /><span className="muted">{b.parentTimezone}</span></td>
                    <td>{b.mentorName}<br /><span className="muted">{fmt(b.startUtc, b.mentorTimezone, "h:mm a ZZZZ")}</span></td>
                    <td>
                      <span className={`badge ${b.status === "confirmed" ? "badge-ok" : "badge-bad"}`}>{b.status}</span>
                      {b.cancelledBy && <><br /><span className="muted">by {b.cancelledBy}{b.cancelReason ? `: ${b.cancelReason}` : ""}</span></>}
                    </td>
                    <td>
                      {cancellable && (
                        <ActionForm
                          action={adminCancelBooking.bind(null, b.id)}
                          submitLabel="Cancel"
                          pendingLabel="…"
                          buttonClass="button button-danger button-small"
                          className="inline-form"
                          confirm={`Cancel ${b.parentName}'s class? Both sides will be emailed.`}
                        >
                          <input name="reason" placeholder="Reason (optional)" maxLength={300} aria-label="Cancellation reason" />
                        </ActionForm>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="pager">
        {page > 1 && <Link href={link(page - 1)}>← Newer</Link>}
        {page < pages && <Link href={link(page + 1)}>Older →</Link>}
      </div>
    </div>
  );
}
