"use client";

import { DateTime } from "luxon";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { abbr, render } from "@/lib/time";

type SlotStatus = "open" | "full" | "closed";
interface Slot { startUtc: string; endUtc: string; status: SlotStatus; mentorsFree: number }
type Unavailable = "past" | "too_soon" | "too_far" | "no_shift" | "full" | null;
interface DayAvailability {
  date: string; timezone: string; hoursInDay: number; clockChange: boolean;
  slots: Slot[]; unavailableReason: Unavailable; nextAvailable: string[];
}
interface ApiError { code: string; message: string; suggestions?: string[] }

const COMMON_ZONES: Array<[string, string]> = [
  ["America/New_York", "US Eastern"],
  ["America/Chicago", "US Central"],
  ["America/Denver", "US Mountain"],
  ["America/Phoenix", "US Arizona (no daylight saving)"],
  ["America/Los_Angeles", "US Pacific"],
  ["Europe/London", "United Kingdom"],
  ["Asia/Kolkata", "India"],
];

const PARTS: Array<[string, number, number]> = [
  ["Night", 0, 6],
  ["Morning", 6, 12],
  ["Afternoon", 12, 17],
  ["Evening", 17, 24],
];

const HORIZON_DAYS = 30;

const EMPTY_COPY: Record<Exclude<Unavailable, null>, [string, string]> = {
  past: ["That date has already passed.", "Pick today or a later date."],
  too_soon: ["It's too late to book a class on this date.", "Classes need to be booked at least 2 hours ahead. Try the next day."],
  too_far: ["That's further ahead than we take bookings.", `Trial classes can be booked up to ${HORIZON_DAYS} days in advance.`],
  no_shift: ["No mentors are teaching on this date.", "Try a different day, or see the suggested times below."],
  full: ["Every mentor is booked for this day.", "Try a different day, or pick one of the nearest open times below."],
};

const inZone = (iso: string, zone: string) => DateTime.fromISO(iso, { zone: "utc" }).setZone(zone);
const short = (iso: string, zone: string) => render(inZone(iso, zone), "ccc d LLL, h:mm a");

export default function BookPage() {
  const router = useRouter();
  const [zone, setZone] = useState("");
  const [allZones, setAllZones] = useState<string[]>([]);
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [day, setDay] = useState<DayAvailability | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [pendingPick, setPendingPick] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  // Days already fetched, so revisiting a date paints at once while a fresh copy loads behind it.
  const dayCache = useRef(new Map<string, DayAvailability>());

  // Detect the browser zone after mount (avoids a server/client hydration mismatch).
  useEffect(() => {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    setZone(detected);
    setDate(DateTime.now().setZone(detected).plus({ days: 1 }).toISODate()!);
    try {
      setAllZones((Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf("timeZone"));
    } catch {
      setAllZones([]);
    }
  }, []);

  const commonIds = COMMON_ZONES.map(([z]) => z);
  const otherZones = useMemo(() => {
    const rest = allZones.filter((z) => !commonIds.includes(z));
    return zone && !commonIds.includes(zone) && !rest.includes(zone) ? [zone, ...rest] : rest;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allZones, zone]);

  const fetchDay = useCallback(async (d: string): Promise<DayAvailability> => {
    const res = await fetch(`/api/slots?date=${d}&tz=${encodeURIComponent(zone)}`);
    const json = await res.json();
    if (!res.ok) throw json.error as ApiError;
    dayCache.current.set(`${zone}|${d}`, json);
    return json;
  }, [zone]);

  const loadSlots = useCallback(async () => {
    if (!zone || !date) return;
    const cached = dayCache.current.get(`${zone}|${date}`);
    if (cached) setDay(cached);
    else setLoading(true);
    try {
      const json = await fetchDay(date);
      setDay(json);
      setError(null);
      // Drop a selection that is no longer open, or apply one chosen from a suggestion.
      setSelected((cur) => {
        const open = (iso: string | null) => !!iso && json.slots.some((s) => s.startUtc === iso && s.status === "open");
        return open(pendingPick) ? pendingPick : open(cur) ? cur : null;
      });
      setPendingPick(null);
      // Warm the next day so stepping forward is instant.
      const next = DateTime.fromISO(date).plus({ days: 1 }).toISODate()!;
      if (!dayCache.current.has(`${zone}|${next}`)) fetchDay(next).catch(() => {});
    } catch (e) {
      setDay(null);
      setError((e as ApiError)?.message ? (e as ApiError) : { code: "NETWORK", message: "Couldn't load times. Check your connection and try again." });
    } finally {
      setLoading(false);
    }
  }, [zone, date, pendingPick, fetchDay]);

  useEffect(() => {
    loadSlots();
    // Reload only when the zone or date changes, not when pendingPick is consumed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zone, date]);

  const today = zone ? DateTime.now().setZone(zone) : null;
  const minDate = today?.toISODate() ?? "";
  const maxDate = today?.plus({ days: HORIZON_DAYS }).toISODate() ?? "";

  // Warn when the chosen date is on a different UTC offset than today (DST will have changed).
  const offsetNote = useMemo(() => {
    if (!zone || !date || !today) return null;
    const then = DateTime.fromISO(date, { zone }).set({ hour: 12 });
    if (!then.isValid || then.offset === today.offset) return null;
    return `Clocks in your zone will have changed by this date (${abbr(today)} now, ${abbr(then)} then). The times below already account for it.`;
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
      router.push(json.manageUrl);
    } catch {
      setError({ code: "NETWORK", message: "Couldn't reach the server. Check your connection and try again." });
    } finally {
      setSubmitting(false);
    }
  }

  function pickSuggestion(iso: string) {
    const localDate = inZone(iso, zone).toISODate()!;
    setError(null);
    if (localDate === date) setSelected(iso);
    else {
      setPendingPick(iso);
      setDate(localDate);
    }
  }

  const canSubmit = !!selected && name.trim() && email.trim() && !submitting;
  const suggestions = error?.suggestions?.length ? error.suggestions : [];
  const empty = day && groups.length === 0 ? EMPTY_COPY[day.unavailableReason ?? "no_shift"] : null;

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
            <optgroup label="Common">
              {COMMON_ZONES.map(([z, label]) => <option key={z} value={z}>{label} ({z})</option>)}
            </optgroup>
            {otherZones.length > 0 && (
              <optgroup label="All time zones">
                {otherZones.map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}
              </optgroup>
            )}
          </select>
        </label>
        <label>
          Date
          <input type="date" value={date} min={minDate} max={maxDate} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </label>
        <label>
          Parent's name
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={100} required />
        </label>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" maxLength={254} required />
        </label>

        <button type="submit" className="button button-primary" disabled={!canSubmit}>
          {submitting ? "Booking…" : selected ? `Book ${short(selected, zone)}` : "Pick a time to book"}
        </button>
      </form>

      <div className="slots" aria-busy={loading}>
        {error && (
          <div className="notice notice-error" role="alert">
            <p>{error.message}</p>
            {suggestions.length > 0 && (
              <div className="suggestions">
                {suggestions.map((s) => (
                  <button key={s} type="button" className="slot" onClick={() => pickSuggestion(s)}>{short(s, zone)}</button>
                ))}
              </div>
            )}
          </div>
        )}
        {day?.clockChange && (
          <div className="notice">
            <p>Clocks change on this date, so it has {day.hoursInDay} hours. The times below already account for it.</p>
          </div>
        )}
        {!day?.clockChange && offsetNote && <div className="notice"><p>{offsetNote}</p></div>}

        {loading && !day && <p className="muted">Loading times…</p>}

        {empty && (
          <div className="empty">
            <p><strong>{empty[0]}</strong></p>
            <p className="muted">{empty[1]}</p>
          </div>
        )}
        {day && day.nextAvailable.length > 0 && (
          <div>
            <p className="muted">Nearest open times</p>
            <div className="suggestions">
              {day.nextAvailable.map((s) => (
                <button key={s} type="button" className="slot" onClick={() => pickSuggestion(s)}>{short(s, zone)}</button>
              ))}
            </div>
          </div>
        )}
        {day && day.unavailableReason === "full" && day.nextAvailable.length === 0 && (
          <p className="muted">No mentor has a free hour in the next {HORIZON_DAYS} days. Please check back later or contact support.</p>
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
                    <span className="slot-sub">{s.status === "full" ? "Fully booked" : abbr(t)}</span>
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
