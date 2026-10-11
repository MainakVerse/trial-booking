import type { Metadata } from "next";
import ActionForm from "@/components/ActionForm";
import { requireAdmin } from "@/lib/auth";
import { listMentors, mentorLoad } from "@/lib/repo";
import { shiftLabel } from "@/lib/time";
import type { Mentor } from "@/lib/types";
import { createMentor, editMentor, resetMentorCode, toggleMentor } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Mentors | Admin", robots: { index: false } };

function MentorFields({ m }: { m?: Mentor }) {
  return (
    <div className="field-grid">
      <label>Name<input name="name" defaultValue={m?.name} required maxLength={100} /></label>
      <label>Email<input name="email" type="email" defaultValue={m?.email} required maxLength={254} /></label>
      <label>Time zone (IANA)<input name="timezone" defaultValue={m?.timezone ?? "Asia/Kolkata"} required list="zones" /></label>
      <label>Shift starts (hour, 0 to 23)<input name="startHour" type="number" min={0} max={23} defaultValue={m?.window.startHour ?? 9} required /></label>
      <label>Shift ends (hour, 1 to 24)<input name="endHour" type="number" min={1} max={24} defaultValue={m?.window.endHour ?? 17} required /></label>
    </div>
  );
}

export default async function AdminMentors() {
  requireAdmin();
  const [mentors, load] = await Promise.all([listMentors(), mentorLoad()]);
  const zones = (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf("timeZone");

  return (
    <div className="portal">
      <h1>Mentors</h1>
      <p className="muted">
        Shift hours are in the mentor's own time zone. Deactivating stops new bookings; existing classes are kept
        and can be cancelled from Bookings.
      </p>
      <datalist id="zones">{zones.map((z) => <option key={z} value={z} />)}</datalist>

      <div className="table-wrap">
        <table>
          <thead><tr><th>Mentor</th><th>Time zone and shift</th><th>Upcoming</th><th>Status</th><th>Manage</th></tr></thead>
          <tbody>
            {mentors.map((m) => (
              <tr key={m.id} className={m.active ? undefined : "row-cancelled"}>
                <td><strong>{m.name}</strong><br /><span className="muted">{m.email}</span></td>
                <td>{m.timezone}<br /><span className="muted">{shiftLabel(m.window, m.timezone)}</span></td>
                <td>{load[m.id] ?? 0}</td>
                <td><span className={`badge ${m.active ? "badge-ok" : "badge-bad"}`}>{m.active ? "active" : "inactive"}</span></td>
                <td>
                  <details>
                    <summary>Edit</summary>
                    <ActionForm action={editMentor.bind(null, m.id)} submitLabel="Save" className="stack panel">
                      <MentorFields m={m} />
                    </ActionForm>
                    <ActionForm
                      action={resetMentorCode.bind(null, m.id)}
                      submitLabel="Reset access code"
                      buttonClass="button button-secondary button-small"
                      className="panel"
                      confirm={`Generate a new access code for ${m.name}? Their current code stops working.`}
                    />
                    <form action={toggleMentor.bind(null, m.id)} className="panel">
                      <button className="button button-secondary button-small">{m.active ? "Deactivate" : "Reactivate"}</button>
                    </form>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Add a mentor</h2>
      <ActionForm action={createMentor} submitLabel="Add mentor" className="stack panel">
        <MentorFields />
      </ActionForm>
    </div>
  );
}
