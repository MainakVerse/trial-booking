import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";

const g = globalThis as unknown as { __pgPool?: Pool };

/** One pool per process, kept on globalThis so `next dev` hot reloads don't leak connections. */
export function pool(): Pool {
  if (g.__pgPool) return g.__pgPool;
  const raw = process.env.DATABASE_URI ?? process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URI is not set. Copy .env.example to .env and fill it in.");

  const url = new URL(raw);
  const local = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  // SSL is set explicitly below, so drop the libpq-style flags pg would otherwise reinterpret.
  url.searchParams.delete("sslmode");
  url.searchParams.delete("channel_binding");

  const p = new Pool({
    connectionString: url.toString(),
    ssl: local ? false : { rejectUnauthorized: true },
    max: 6,
    // Opening a TLS connection to a remote database costs ~0.7s, so keep idle ones for a long time.
    idleTimeoutMillis: 10 * 60_000,
    keepAlive: true,
    connectionTimeoutMillis: 10_000,
  });
  p.on("error", (e) => console.error("[db] idle client error", e.message));
  return (g.__pgPool = p);
}

/** Opens a few connections up front and pings the database so the first page view isn't slow. */
export async function warmPool(connections = 4): Promise<void> {
  await Promise.all(Array.from({ length: connections }, () => pool().query("select 1")));
}

export type Queryable = Pick<PoolClient, "query">;

export function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
  db: Queryable = pool(),
): Promise<QueryResult<T>> {
  return db.query<T>(text, params);
}

/** Runs `fn` in a transaction; commits on return, rolls back on throw. */
export async function withTransaction<T>(fn: (tx: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export const isUniqueViolation = (e: unknown) => (e as { code?: string })?.code === "23505";
