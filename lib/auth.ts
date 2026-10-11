import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_TTL_HOURS } from "./config";
import { getMentor } from "./repo";
import { signSession, verifySession, type Session } from "./session-token";
import type { Mentor } from "./types";

const COOKIE = "cy_session";

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET (16+ chars) is required in production.");
  return "dev-only-insecure-secret";
}

export function startSession(session: Session) {
  const ttl = SESSION_TTL_HOURS * 3_600_000;
  cookies().set(COOKIE, signSession(session, secret(), ttl), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ttl / 1000,
  });
}

export const endSession = () => cookies().delete(COOKIE);

export const getSession = (): Session | null => verifySession(cookies().get(COOKIE)?.value, secret());

/** Call at the top of every admin page and server action. Layouts alone are not enough. */
export function requireAdmin(): void {
  if (getSession()?.role !== "admin") redirect("/admin/login");
}

/** Id of the signed-in mentor from the cookie. No database call, so pages can start their queries at once. */
export function requireMentorId(): string {
  const s = getSession();
  if (s?.role !== "mentor") redirect("/mentor/login");
  return s.mentorId;
}

/** One lookup per request even when the layout and the page both ask. */
export const loadMentor = cache((id: string) => getMentor(id));

/** Returns the signed-in mentor, re-checked against the database so deactivation takes effect at once. */
export async function requireMentor(): Promise<Mentor> {
  const mentor = await loadMentor(requireMentorId());
  // Cookies can't be cleared while rendering a page; the login page treats a deactivated mentor as signed out.
  if (!mentor || !mentor.active) redirect("/mentor/login");
  return mentor;
}
