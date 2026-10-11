import { DateTime } from "luxon";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ActionForm from "@/components/ActionForm";
import { PARENT_CANCEL_CUTOFF_MINUTES } from "@/lib/config";
import { getBookingByToken } from "@/lib/repo";
import { fmt, zoneCity } from "@/lib/time";
import { cancelAsParent } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your trial class | Codeyoung", robots: { index: false } };

export default async function ManageBooking({ params }: { params: { token: string } }) {
  const b = await getBookingByToken(params.token);
  if (!b) notFound();

  const now = DateTime.utc();
  const start = DateTime.fromISO(b.startUtc);
  const over = DateTime.fromISO(b.endUtc) <= now;
  const cancelled = b.status === "cancelled";
  const canCancel = !cancelled && start.diff(now, "minutes").minutes >= PARENT_CANCEL_CUTOFF_MINUTES;

  return (
    <section className="confirm">
      <h1 className={cancelled ? "text-alert" : undefined}>
        {cancelled ? "This class was cancelled" : over ? "This class has finished" : "Trial class booked"}
      </h1>

      <p className="confirm-when">
        {fmt(b.startUtc, b.parentTimezone, "cccc, d LLLL yyyy")}
        <br />
        <strong>{fmt(b.startUtc, b.parentTimezone, "h:mm a")}</strong> {fmt(b.startUtc, b.parentTimezone, "ZZZZ")}
        <span className="muted"> ({b.parentTimezone})</span>
      </p>

      <dl className="facts">
        <dt>Mentor</dt>
        <dd>{b.mentorName}</dd>
        <dt>Their local time</dt>
        <dd>
          {fmt(b.startUtc, b.mentorTimezone, "h:mm a 'on' cccc, d LLLL")} in {zoneCity(b.mentorTimezone)}
        </dd>
        <dt>Booked for</dt>
        <dd>{b.parentName} ({b.parentEmail})</dd>
        {!cancelled && (
          <>
            <dt>Class link</dt>
            <dd><a href={b.meetingLink}>{b.meetingLink}</a></dd>
          </>
        )}
      </dl>

      {!cancelled && !over && <p className="muted">We emailed this to you and your mentor. Save this page to change your plans later.</p>}

      {canCancel && (
        <ActionForm
          action={cancelAsParent.bind(null, params.token)}
          submitLabel="Cancel this class"
          pendingLabel="Cancelling…"
          buttonClass="button button-danger"
          confirm="Cancel this trial class? The time will be released."
        />
      )}
      {!cancelled && !over && !canCancel && (
        <p className="notice"><span>It's too close to the start to cancel online (the cutoff is {PARENT_CANCEL_CUTOFF_MINUTES} minutes). Please contact support.</span></p>
      )}
      {(cancelled || over) && (
        <Link href="/book" className="button button-primary">Book another time</Link>
      )}
    </section>
  );
}
