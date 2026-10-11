export interface Mentor {
  id: string;
  name: string;
  email: string;
  /** IANA zone name, never a fixed offset, so DST rules are applied correctly. */
  timezone: string;
  /** Working hours in the mentor's local time. endHour may be 24 (midnight). */
  window: { startHour: number; endHour: number };
  /** Inactive mentors keep their history but receive no new bookings. */
  active: boolean;
}

export type BookingStatus = "confirmed" | "cancelled";

export interface Booking {
  id: string;
  /** Unguessable token in the parent's manage link. */
  manageToken: string;
  mentorId: string;
  parentName: string;
  parentEmail: string;
  /** Normalised email used to spot repeat bookings (see lib/email-key.ts). */
  parentKey: string;
  parentTimezone: string;
  /** Stored in UTC; converted to a local zone only for display. */
  startUtc: string;
  endUtc: string;
  meetingLink: string;
  status: BookingStatus;
  cancelledAt: string | null;
  cancelledBy: "parent" | "admin" | null;
  cancelReason: string | null;
  createdAt: string;
}

/** A booking joined with its mentor, for display in portals and emails. */
export interface BookingView extends Booking {
  mentorName: string;
  mentorEmail: string;
  mentorTimezone: string;
}
