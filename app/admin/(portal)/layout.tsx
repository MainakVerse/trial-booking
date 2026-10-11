import NavLink from "@/components/NavLink";
import { requireAdmin } from "@/lib/auth";
import { adminTimezone } from "@/lib/config";
import { adminLogout } from "../actions";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  requireAdmin();
  return (
    <>
      <div className="portal-bar">
        <nav aria-label="Admin">
          <strong>Admin</strong>
          <NavLink href="/admin" exact>Overview</NavLink>
          <NavLink href="/admin/bookings">Bookings</NavLink>
          <NavLink href="/admin/mentors">Mentors</NavLink>
          <NavLink href="/admin/emails">Emails</NavLink>
        </nav>
        <span className="muted">Times shown in {adminTimezone()}</span>
        <form action={adminLogout}><button className="link-button">Sign out</button></form>
      </div>
      {children}
    </>
  );
}
