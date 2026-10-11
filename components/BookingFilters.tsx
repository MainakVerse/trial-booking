"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

interface Props { q: string; status: string; when: string }

/** Filter form that navigates client-side (no full page load) and shows a pending state. */
export default function BookingFilters({ q, status, when }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <form
      className="filters"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const qs = new URLSearchParams({ q: String(f.get("q") ?? ""), status: String(f.get("status")), when: String(f.get("when")) });
        start(() => router.push(`/admin/bookings?${qs}`));
      }}
    >
      <label>Search<input name="q" defaultValue={q} placeholder="Parent name, email or mentor" /></label>
      <label>Status
        <select name="status" defaultValue={status}>
          <option value="all">All</option><option value="confirmed">Confirmed</option><option value="cancelled">Cancelled</option>
        </select>
      </label>
      <label>When
        <select name="when" defaultValue={when}>
          <option value="upcoming">Upcoming</option><option value="past">Past</option><option value="all">All</option>
        </select>
      </label>
      <button className="button button-secondary" disabled={pending}>{pending ? "Loading…" : "Apply"}</button>
    </form>
  );
}
