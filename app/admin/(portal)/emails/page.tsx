import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { adminTimezone } from "@/lib/config";
import { listEmailLog } from "@/lib/repo";
import { fmt } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Emails | Admin", robots: { index: false } };

export default async function AdminEmails() {
  requireAdmin();
  const zone = adminTimezone();
  const rows = await listEmailLog(100);
  const live = !!process.env.SMTP_URL;

  return (
    <div className="portal">
      <h1>Emails</h1>
      <p className="muted">
        {live
          ? "Emails are sent through SMTP and recorded here."
          : "No SMTP_URL is configured, so emails are only recorded here, not delivered."}{" "}
        Showing the latest 100.
      </p>
      {rows.length === 0 ? (
        <p>No emails yet.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Sent ({zone})</th><th>To</th><th>Subject</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id}>
                  <td>{fmt(e.createdAt, zone, "d LLL, h:mm a")}</td>
                  <td>{e.recipient}</td>
                  <td>
                    <details>
                      <summary>{e.subject}</summary>
                      <pre className="email-body">{e.body}</pre>
                      {e.error && <p className="form-error">{e.error}</p>}
                    </details>
                  </td>
                  <td><span className={`badge ${e.status === "failed" ? "badge-bad" : e.status === "sent" ? "badge-ok" : ""}`}>{e.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
