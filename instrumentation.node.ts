import { pool, warmPool } from "./lib/db";

/** Warm the pool so the first page view is fast, and keep serverless Postgres from suspending. */
export async function warmDatabase() {
  if (!(process.env.DATABASE_URI ?? process.env.DATABASE_URL)) return;
  await warmPool().catch((e) => console.error("[db] warm-up failed:", e.message));
  // Neon suspends idle databases and takes seconds to wake; a light ping prevents that.
  setInterval(() => pool().query("select 1").catch(() => {}), 4 * 60_000).unref();
}
