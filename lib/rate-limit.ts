/**
 * Sliding-window limiter held in process memory. Good enough to blunt password guessing and
 * booking spam on a single instance; behind several instances, move this to Redis or the DB.
 */
const g = globalThis as unknown as { __rate?: Map<string, number[]> };
const buckets = g.__rate ?? (g.__rate = new Map<string, number[]>());

/** Returns true if the call is allowed, and records it. */
export function allow(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const recent = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    buckets.set(key, recent);
    return false;
  }
  recent.push(now);
  buckets.set(key, recent);
  if (buckets.size > 5000) for (const [k, v] of buckets) if (!v.some((t) => now - t < windowMs)) buckets.delete(k);
  return true;
}

export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}
