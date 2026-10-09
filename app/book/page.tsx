"use client";

import { DateTime } from "luxon";
import { useCallback, useEffect, useMemo, useState } from "react";

type SlotStatus = "open" | "full" | "closed";
interface Slot { startUtc: string; endUtc: string; status: SlotStatus; mentorsFree: number }
interface DayAvailability { date: string; timezone: string; hoursInDay: number; clockChange: boolean; slots: Slot[] }
interface ApiError { code: string; message: string; suggestions?: string[] }
interface Email { to: string; subject: string; body: string }
interface Confirmation {
  booking: { id: string; startUtc: string; parentTimezone: string; meetingLink: string };
  mentor: { name: string; timezone: string };
  emails: Email[];
}

const ZONES: Array<[string, string]> = [
  ["America/New_York", "US Eastern"],
  ["America/Chicago", "US Central"],
  ["America/Denver", "US Mountain"],
  ["America/Phoenix", "US Arizona (no daylight saving)"],
  ["America/Los_Angeles", "US Pacific"],
  ["Europe/London", "United Kingdom"],
  ["Asia/Kolkata", "India"],
  ["Asia/Dubai", "United Arab Emirates"],
  ["Australia/Sydney", "Australia Eastern"],
];

const PARTS: Array<[string, number, number]> = [
  ["Night", 0, 6],
  ["Morning", 6, 12],
  ["Afternoon", 12, 17],
  ["Evening", 17, 24],
];

const HORIZON_DAYS = 30;

const inZone = (iso: string, zone: string) => DateTime.fromISO(iso, { zone: "utc" }).setZone(zone);

export default function BookPage() {
  const [zone, setZone] = useState("");
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [day, setDay] = useState<DayAvailability | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [done, setDone] = useState<Confirmation | null>(null);

  // Detect the browser zone after mount (avoids a server/client hydration mismatch).
  useEffect(() => {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    setZone(detected);
    setDate(DateTime.now().setZone(detected).plus({ days: 1 }).toISODate()!);
  }, []);

  const zoneOptions = useMemo(
    () => (zone && !ZONES.some(([z]) => z === zone) ? [[zone, "Detected"] as [string, string], ...ZONES] : ZONES),
    [zone],
  );

  const loadSlots = useCallback(async () => {
    if (!zone || !date) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/slots?date=${date}&tz=${encodeURIComponent(zone)}`);
      const json = await res.json();
      if (!res.ok) throw json.error as ApiError;
      setDay(json);
    } catch (e) {
      setDay(null);
      setError(e as ApiError);
    } finally {
      setLoading(false);
    }
  }, [zone, date]);

  useEffect(() => {
    setSelected(null);
    loadSlots();
  }, [loadSlots]);

  const today = zone ? DateTime.now().setZone(zone) : null;
  const minDate = today?.toISODate() ?? "";
  const maxDate = today?.plus({ days: HORIZON_DAYS }).toISODate() ?? "";

  // Warn when the chosen date is on a different UTC offset than today (DST will have changed).
  const offsetNote = useMemo(() => {
    if (!zone || !date || !today) return null;
    const then = DateTime.fromISO(date, { zone }).set({ hour: 12 });
    if (!then.isValid || then.offset === today.offset) return null;
    return `Clocks in your zone will have changed by this date (${today.offsetNameShort} now, ${then.offsetNameShort} then). The times below already account for it.`;
  }, [zone, date, today]);

  const groups = useMemo(() => {
    if (!day) return [];
    return PARTS.map(([label, from, to]) => ({
      label,
      slots: day.slots.filter((s) => {
        const h = inZone(s.startUtc, zone).hour;
        return s.status !== "closed" && h >= from && h < to;
      }),
    })).filter((g) => g.slots.length > 0);
  }, [day, zone]);

  async function book() {
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentName: name, parentEmail: email, timezone: zone, startUtc: selected }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error);
        loadSlots(); // someone may have taken the slot; refresh what we show
        return;
      }
      setDone(json);
    } catch {
      setError({ code: "NETWORK", message: "Couldn't reach the server. Check your connection and try again." });
    } finally {
      setSubmitting(false);
    }
  }

  function pickSuggestion(iso: string) {
    const local = inZone(iso, zone);
    setDate(local.toISODate()!);
    setError(null);
    setTimeout(() => setSelected(iso), 0); // after the date change resets selection
  }

  if (done) {
    const parentTime = inZone(done.booking.startUtc, done.booking.parentTimezone);
    const mentorTime = inZone(done.booking.startUtc, done.mentor.timezone);
    return (
      <section className="confirm" aria-live="polite">
        <h1>Trial class booked</h1>
        <p className="confirm-when">
          {parentTime.toFormat("cccc, d LLLL")}
          <br />
          <strong>{parentTime.toFormat("h:mm a")}</strong> {parentTime.offsetNameShort}
        </p>
        <p>
          Your mentor is {done.mentor.name}. For them it is {mentorTime.toFormat("h:mm a 'on' cccc, d LLLL")} in India.
        </p>
        <p>
          Class link: <a href={done.booking.meetingLink}>{done.booking.meetingLink}</a>
        </p>
        <details className="emails">
          <summary>Emails sent ({done.emails.length})</summary>
          {done.emails.map((m) => (
            <article key={m.to} className="email">
              <p className="email-to">To {m.to}</p>
              <p className="email-subject">{m.subject}</p>
              <pre>{m.body}</pre>
            </article>
          ))}
        </details>
        <button
          className="button button-secondary"
          onClick={() => {
            setDone(null);
            setSelected(null);
            setName("");
            setEmail("");
            loadSlots();
          }}
        >
          Book another class
        </button>
      </section>
    );
  }

  const canSubmit = !!selected && name.trim() && email.trim() && !submitting;

  return (
    <div className="booking">
      <div className="booking-intro">
        <h1>Choose a time for the trial class</h1>
        <p>All times are shown in your time zone. Classes last one hour.</p>
      </div>

      <form
        className="booking-form"
        onSubmit={(e) => {
          e.preventDefault();
          book();
        }}
      >
        <label>
          Your time zone
          <select value={zone} onChange={(e) => setZone(e.target.value)}>
            {zoneOptions.map(([z, label]) => (
              <option key={z} value={z}>{label} ({z})</option>
            ))}
          </select>
        </label>
        <label>
          Date
          <input type="date" value={date} min={minDate} max={maxDate} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          Parent's name
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
        </label>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </label>

        <button type="submit" className="button button-primary" disabled={!canSubmit}>
          {submitting
            ? "Booking…"
            : selected
              ? `Book ${inZone(selected, zone).toFormat("ccc d LLL, h:mm a")}`
              : "Pick a time to book"}
        </button>
      </form>

      <div className="slots" aria-busy={loading}>
        {error && (
          <div className="notice notice-error" role="alert">
            <p>{error.message}</p>
            {!!error.suggestions?.length && (
              <div className="suggestions">
                {error.suggestions.map((s) => (
                  <button key={s} type="button" className="slot" onClick={() => pickSuggestion(s)}>
                    {inZone(s, zone).toFormat("ccc d LLL, h:mm a")}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {day?.clockChange && (
          <div className="notice">
            Clocks change on this date, so it has {day.hoursInDay} hours. The times below already account for it.
          </div>
        )}
        {!day?.clockChange && offsetNote && <div className="notice">{offsetNote}</div>}

        {loading && !day && <p className="muted">Loading times…</p>}

        {day && groups.length === 0 && (
          <div className="empty">
            <p>No classes can be booked on this date.</p>
            <p className="muted">Try the next day, or a date further out if this one is too soon.</p>
          </div>
        )}

        {groups.map((g) => (
          <fieldset key={g.label} className="slot-group">
            <legend>{g.label}</legend>
            <div className="slot-grid">
              {g.slots.map((s) => {
                const t = inZone(s.startUtc, zone);
                const isSel = selected === s.startUtc;
                return (
                  <button
                    key={s.startUtc}
                    type="button"
                    className={`slot${isSel ? " slot-selected" : ""}`}
                    disabled={s.status !== "open"}
                    aria-pressed={isSel}
                    onClick={() => setSelected(s.startUtc)}
                  >
                    <span className="slot-time">{t.toFormat("h:mm a")}</span>
                    <span className="slot-sub">
                      {s.status === "full" ? "Fully booked" : `${t.offsetNameShort}`}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>
    </div>
  );
}
