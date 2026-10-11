"use client";

import { DateTime } from "luxon";
import { useEffect, useState } from "react";
import { abbr, zoneCity } from "@/lib/time";

function offsetGap(a: DateTime, b: DateTime, city: string) {
  const diff = b.offset - a.offset; // minutes
  if (diff === 0) return "Same time";
  const sign = diff > 0 ? "ahead" : "behind";
  const abs = Math.abs(diff);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${city} is ${h}h${m ? ` ${m}m` : ""} ${sign}`;
}

/** Live side-by-side clocks: the parent's local time and the mentors' time. */
export default function DualClock({ mentorZone }: { mentorZone: string }) {
  const [now, setNow] = useState<DateTime | null>(null);
  const [zone, setZone] = useState("UTC");

  useEffect(() => {
    setZone(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
    setNow(DateTime.now());
    const id = setInterval(() => setNow(DateTime.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!now) return <div className="dual-clock" aria-hidden="true" />;

  const local = now.setZone(zone);
  const mentor = now.setZone(mentorZone);
  const city = zoneCity(mentorZone);

  return (
    <div className="dual-clock" role="group" aria-label="Your time and mentor time">
      <div className="clock">
        <span className="clock-label">Your time</span>
        <time className="clock-time" dateTime={local.toISO() ?? ""}>{local.toFormat("h:mm")}</time>
        <span className="clock-meta">{local.toFormat("a, ccc d LLL")} ({abbr(local)})</span>
      </div>
      <div className="clock-gap">{offsetGap(local, mentor, city)}</div>
      <div className="clock">
        <span className="clock-label">Your mentor in {city}</span>
        <time className="clock-time" dateTime={mentor.toISO() ?? ""}>{mentor.toFormat("h:mm")}</time>
        <span className="clock-meta">{mentor.toFormat("a, ccc d LLL")} ({abbr(mentor)})</span>
      </div>
    </div>
  );
}
