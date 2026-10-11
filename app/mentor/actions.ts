"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ActionState } from "@/components/ActionForm";
import { endSession, startSession } from "@/lib/auth";
import { LOGIN_ATTEMPTS } from "@/lib/config";
import { hashSecret, verifySecret } from "@/lib/password";
import { allow, clientIp } from "@/lib/rate-limit";
import { getMentorAuth } from "@/lib/repo";

// Verified against when the email is unknown, so response time doesn't reveal which emails exist.
const DUMMY_HASH = hashSecret("not-a-real-code");
const INVALID: ActionState = { ok: false, message: "Invalid email or access code." };

export async function mentorLogin(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const code = String(fd.get("code") ?? "").trim();
  if (!email || !code) return INVALID;

  const ip = clientIp(headers());
  if (!allow(`login:mentor:${ip}`, LOGIN_ATTEMPTS.limit, LOGIN_ATTEMPTS.windowMs) ||
      !allow(`login:mentor:${email}`, LOGIN_ATTEMPTS.limit, LOGIN_ATTEMPTS.windowMs)) {
    return { ok: false, message: "Too many attempts. Try again in 15 minutes." };
  }

  const found = await getMentorAuth(email);
  const valid = verifySecret(code, found?.accessHash ?? DUMMY_HASH);
  if (!found || !valid || !found.mentor.active) return INVALID;

  startSession({ role: "mentor", mentorId: found.mentor.id });
  redirect("/mentor");
}

export async function mentorLogout() {
  endSession();
  redirect("/mentor/login");
}
