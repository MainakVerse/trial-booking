import { DateTime, IANAZone } from "luxon";

export const isValidZone = (zone: string) => IANAZone.isValidZone(zone);

export const fromUtcIso = (iso: string) => DateTime.fromISO(iso, { zone: "utc" });

/**
 * Short zone name. ICU has no abbreviation for India, so Luxon would print "GMT+5:30"; people
 * expect "IST". Other zones fall back to Luxon's own (EDT, GMT, BST...).
 */
export function abbr(dt: DateTime): string {
  if (dt.zoneName === "Asia/Kolkata" || dt.zoneName === "Asia/Calcutta") return "IST";
  // Pin the locale: names like "EDT" or "BST" otherwise depend on the server's or browser's language.
  const locale = dt.zoneName?.startsWith("Europe/") ? "en-GB" : "en-US";
  return dt.setLocale(locale).offsetNameShort ?? "";
}

/** Luxon format where the token ZZZZ is rendered with abbr(). */
export function render(dt: DateTime, format: string): string {
  return dt.setLocale("en-US").toFormat(format.replace("ZZZZ", `'${abbr(dt)}'`));
}

/** e.g. "Tuesday, 10 March 2026 at 6:00 PM EDT" */
export function formatInZone(isoUtc: string, zone: string): string {
  return render(fromUtcIso(isoUtc).setZone(zone), "cccc, d LLLL yyyy 'at' h:mm a ZZZZ");
}

/** Custom format of an instant in a zone, e.g. fmt(iso, "Asia/Kolkata", "ccc d LLL, h:mm a ZZZZ"). */
export const fmt = (isoUtc: string, zone: string, format: string) => render(fromUtcIso(isoUtc).setZone(zone), format);

/** "America/New_York" -> "New York". Used instead of hard-coded country names. */
export const zoneCity = (zone: string) => (zone.split("/").pop() ?? zone).replace(/_/g, " ");

const hourLabel = (h: number) => (h === 24 || h === 0 ? "12:00 AM" : DateTime.fromObject({ hour: h }).toFormat("h:mm a"));

/** "3:00 AM to 10:00 AM" in the mentor's own zone, plus the zone's current abbreviation. */
export function shiftLabel(w: { startHour: number; endHour: number }, zone: string): string {
  return `${hourLabel(w.startHour)} to ${hourLabel(w.endHour)} ${abbr(DateTime.now().setZone(zone))}`;
}
