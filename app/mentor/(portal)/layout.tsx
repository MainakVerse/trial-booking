import { requireMentor } from "@/lib/auth";
import { mentorLogout } from "../actions";

export default async function MentorLayout({ children }: { children: React.ReactNode }) {
  const mentor = await requireMentor();
  return (
    <>
      <div className="portal-bar">
        <span>Mentor portal · <strong>{mentor.name}</strong></span>
        <form action={mentorLogout}><button className="link-button">Sign out</button></form>
      </div>
      {children}
    </>
  );
}
