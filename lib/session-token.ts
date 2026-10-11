import { createHmac, timingSafeEqual } from "node:crypto";

export type Session = { role: "admin" } | { role: "mentor"; mentorId: string };
interface Payload { s: Session; exp: number }

const b64 = (s: string) => Buffer.from(s).toString("base64url");
const mac = (data: string, secret: string) => createHmac("sha256", secret).update(data).digest("base64url");

/** Signed, expiring token: base64url(payload).hmac. Stateless, so logout just clears the cookie. */
export function signSession(session: Session, secret: string, ttlMs: number, now = Date.now()): string {
  const data = b64(JSON.stringify({ s: session, exp: now + ttlMs } satisfies Payload));
  return `${data}.${mac(data, secret)}`;
}

export function verifySession(token: string | undefined, secret: string, now = Date.now()): Session | null {
  if (!token) return null;
  const [data, sig] = token.split(".");
  if (!data || !sig) return null;
  const expected = Buffer.from(mac(data, secret));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString()) as Payload;
    if (typeof payload.exp !== "number" || payload.exp < now) return null;
    const s = payload.s;
    if (s?.role === "admin") return { role: "admin" };
    if (s?.role === "mentor" && typeof s.mentorId === "string") return { role: "mentor", mentorId: s.mentorId };
    return null;
  } catch {
    return null;
  }
}
