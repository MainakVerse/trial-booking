export interface Mentor {
  id: string;
  name: string;
  email: string;
  /** IANA zone name, never a fixed offset, so DST rules are applied correctly. */
  timezone: string;
  /** Working hours in the mentor's local time. endHour may be 24 (midnight). */
  window: { startHour: number; endHour: number };
}

export interface Booking {
  id: string;
  mentorId: string;
  parentName: string;
  parentEmail: string;
  parentTimezone: string;
  /** Stored in UTC; converted to a local zone only for display. */
  startUtc: string;
  endUtc: string;
  meetingLink: string;
  createdAt: string;
}
