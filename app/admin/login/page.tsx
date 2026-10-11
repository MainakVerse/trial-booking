import type { Metadata } from "next";
import { redirect } from "next/navigation";
import ActionForm from "@/components/ActionForm";
import { getSession } from "@/lib/auth";
import { adminLogin } from "../actions";

export const metadata: Metadata = { title: "Admin sign in | Codeyoung", robots: { index: false } };

export default function AdminLogin() {
  if (getSession()?.role === "admin") redirect("/admin");
  return (
    <section className="auth-card">
      <h1>Admin sign in</h1>
      <ActionForm action={adminLogin} submitLabel="Sign in" pendingLabel="Signing in…" className="stack">
        <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
      </ActionForm>
    </section>
  );
}
