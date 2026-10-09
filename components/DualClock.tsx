"use client";

import { DateTime } from "luxon";
import { useEffect, useState } from "react";

const MENTOR_ZONE = "Asia/Kolkata";

function offsetGap(a: DateTime, b: DateTime) {
  const diff = b.offset - a.offset; // minutes
  if (diff === 0) return "Same time";
  const sign = diff > 0 ? "ahead" : "behind";
  const abs = Math.abs(diff);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `India is ${h}h${m ? ` ${m}m` : ""} ${sign}`;
}

/** Live side-by-side clocks: the parent's local time and mentor time in India. */
export default function DualClock() {
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
  const india = now.setZone(MENTOR_ZONE);

  return (
    <div className="dual-clock" role="group" aria-label="Your time and mentor time">
      <div className="clock">
        <span className="clock-label">Your time</span>
        <time className="clock-time" dateTime={local.toISO() ?? ""}>{local.toFormat("h:mm")}</time>
        <span className="clock-meta">{local.toFormat("a, ccc d LLL")} ({local.offsetNameShort})</span>
      </div>
      <div className="clock-gap">{offsetGap(local, india)}</div>
      <div className="clock">
        <span className="clock-label">Your mentor in India</span>
        <time className="clock-time" dateTime={india.toISO() ?? ""}>{india.toFormat("h:mm")}</time>
        <span className="clock-meta">{india.toFormat("a, ccc d LLL")} (IST)</span>
      </div>
    </div>
  );
}
