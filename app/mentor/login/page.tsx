import type { Metadata } from "next";
import { redirect } from "next/navigation";
import ActionForm from "@/components/ActionForm";
import { getSession, loadMentor } from "@/lib/auth";
import { mentorLogin } from "../actions";

export const metadata: Metadata = { title: "Mentor sign in | Codeyoung", robots: { index: false } };

export default async function MentorLogin() {
  const s = getSession();
  if (s?.role === "mentor" && (await loadMentor(s.mentorId))?.active) redirect("/mentor");
  return (
    <section className="auth-card">
      <h1>Mentor sign in</h1>
      <p className="muted">Use the email and access code your admin gave you.</p>
      <ActionForm action={mentorLogin} submitLabel="Sign in" pendingLabel="Signing in…" className="stack">
        <label>Email<input name="email" type="email" autoComplete="username" required /></label>
        <label>Access code<input name="code" type="password" autoComplete="current-password" required /></label>
      </ActionForm>
    </section>
  );
}
