/** Business rules, kept in one place so they are easy to review and change. */
export const SLOT_MINUTES = 60;
export const MAX_CLASSES_PER_MENTOR_PER_DAY = 2; // counted on the mentor's local calendar day
export const MIN_LEAD_MINUTES = 120; // no bookings less than 2 hours out
export const BOOKING_HORIZON_DAYS = 30;
export const PARENT_CANCEL_CUTOFF_MINUTES = 60; // parents can't cancel inside the last hour; admins can
export const MEETING_BASE_URL = "https://meet.codeyoung.example/trial";
/** Used on the landing page clock; each mentor carries their own zone. */
export const DEFAULT_MENTOR_ZONE = "Asia/Kolkata";

export const SESSION_TTL_HOURS = 8;
export const LOGIN_ATTEMPTS = { limit: 8, windowMs: 15 * 60_000 };
export const BOOKING_ATTEMPTS = { limit: 12, windowMs: 10 * 60_000 };

export const MAX_NAME_LENGTH = 100;
export const MAX_EMAIL_LENGTH = 254;

export const adminTimezone = () => process.env.ADMIN_TIMEZONE || "Asia/Kolkata";
export const appUrl = () => (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
