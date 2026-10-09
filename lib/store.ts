import type { Booking } from "./types";

/**
 * In-memory store. Pinned to globalThis so it survives hot reloads in `next dev`.
 * Swap for SQLite/Postgres in production; the scheduling module only needs an array.
 */
type Store = { bookings: Booking[] };
const g = globalThis as unknown as { __trialStore?: Store };
export const store: Store = g.__trialStore ?? (g.__trialStore = { bookings: [] });
