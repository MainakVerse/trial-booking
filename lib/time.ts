import { DateTime, IANAZone } from "luxon";

export const isValidZone = (zone: string) => IANAZone.isValidZone(zone);

export const fromUtcIso = (iso: string) => DateTime.fromISO(iso, { zone: "utc" });

/** e.g. "Tuesday, 10 March 2026 at 6:00 PM EDT" */
export function formatInZone(isoUtc: string, zone: string): string {
  return fromUtcIso(isoUtc).setZone(zone).toFormat("cccc, d LLLL yyyy 'at' h:mm a ZZZZ");
}
