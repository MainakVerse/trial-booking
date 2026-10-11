"use server";

import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/ActionForm";
import { endSession, requireAdmin, startSession } from "@/lib/auth";
import { cancelBooking } from "@/lib/booking-service";
import { LOGIN_ATTEMPTS, MAX_EMAIL_LENGTH, MAX_NAME_LENGTH } from "@/lib/config";
import { generateAccessCode, hashSecret, safeEqual } from "@/lib/password";
import { allow, clientIp } from "@/lib/rate-limit";
import { getMentor, insertMentor, setMentorAccessHash, setMentorActive, updateMentor, type MentorInput } from "@/lib/repo";
import { BookingError } from "@/lib/scheduling";
import { isValidZone } from "@/lib/time";
import { isUniqueViolation } from "@/lib/db";

const text = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/* ---------- session ---------- */

export async function adminLogin(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return { ok: false, message: "Admin login is disabled: set ADMIN_PASSWORD on the server." };
  if (!allow(`login:admin:${clientIp(headers())}`, LOGIN_ATTEMPTS.limit, LOGIN_ATTEMPTS.windowMs)) {
    return { ok: false, message: "Too many attempts. Try again in 15 minutes." };
  }
  if (!safeEqual(String(fd.get("password") ?? ""), expected)) return { ok: false, message: "Incorrect password." };
  startSession({ role: "admin" });
  redirect("/admin");
}

export async function adminLogout() {
  endSession();
  redirect("/admin/login");
}

/* ---------- bookings ---------- */

export async function adminCancelBooking(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  requireAdmin();
  const reason = text(fd, "reason").slice(0, 300) || null;
  try {
    await cancelBooking({ by: "admin", id }, reason);
  } catch (e) {
    if (e instanceof BookingError) return { ok: false, message: e.message };
    throw e;
  }
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Cancelled. Both sides were emailed." };
}

/* ---------- mentors ---------- */

function parseMentor(fd: FormData): MentorInput | string {
  const m: MentorInput = {
    name: text(fd, "name"),
    email: text(fd, "email").toLowerCase(),
    timezone: text(fd, "timezone"),
    startHour: Number(text(fd, "startHour")),
    endHour: Number(text(fd, "endHour")),
  };
  if (!m.name || m.name.length > MAX_NAME_LENGTH) return `Name is required (max ${MAX_NAME_LENGTH} characters).`;
  if (m.email.length > MAX_EMAIL_LENGTH || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m.email)) return "Enter a valid email.";
  if (!isValidZone(m.timezone)) return `Unknown time zone "${m.timezone}". Use an IANA name like Asia/Kolkata.`;
  if (!Number.isInteger(m.startHour) || m.startHour < 0 || m.startHour > 23) return "Start hour must be 0 to 23.";
  if (!Number.isInteger(m.endHour) || m.endHour < 1 || m.endHour > 24) return "End hour must be 1 to 24.";
  if (m.endHour <= m.startHour) return "End hour must be after start hour. Shifts can't cross midnight; use 24 for midnight.";
  return m;
}

export async function createMentor(_prev: ActionState, fd: FormData): Promise<ActionState> {
  requireAdmin();
  const m = parseMentor(fd);
  if (typeof m === "string") return { ok: false, message: m };
  const code = generateAccessCode();
  try {
    await insertMentor(`m_${randomBytes(4).toString("hex")}`, m, hashSecret(code));
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: false, message: "A mentor with that email already exists." };
    throw e;
  }
  revalidatePath("/admin/mentors");
  return { ok: true, message: `Added ${m.name}. Access code (shown once):`, secret: code };
}

export async function editMentor(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  requireAdmin();
  const m = parseMentor(fd);
  if (typeof m === "string") return { ok: false, message: m };
  try {
    await updateMentor(id, m);
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: false, message: "A mentor with that email already exists." };
    throw e;
  }
  revalidatePath("/admin/mentors");
  return { ok: true, message: "Saved. Existing bookings keep their times; new bookings use the new shift." };
}

export async function toggleMentor(id: string) {
  requireAdmin();
  const mentor = await getMentor(id);
  if (mentor) await setMentorActive(id, !mentor.active);
  revalidatePath("/admin/mentors");
}

export async function resetMentorCode(id: string, _prev: ActionState): Promise<ActionState> {
  requireAdmin();
  const code = generateAccessCode();
  await setMentorAccessHash(id, hashSecret(code));
  return { ok: true, message: "New access code (shown once):", secret: code };
}
