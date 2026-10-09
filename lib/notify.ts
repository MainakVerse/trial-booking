import { formatInZone } from "./time";
import type { Booking, Mentor } from "./types";

export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
}

/** Each recipient gets the time in their own zone, plus UTC as an unambiguous reference. */
export function buildConfirmationEmails(b: Booking, m: Mentor): EmailMessage[] {
  const parentTime = formatInZone(b.startUtc, b.parentTimezone);
  const mentorTime = formatInZone(b.startUtc, m.timezone);
  const utcTime = formatInZone(b.startUtc, "UTC");
  return [
    {
      to: b.parentEmail,
      subject: `Your Codeyoung trial class is booked for ${parentTime}`,
      body: [
        `Hi ${b.parentName},`,
        "",
        `Your trial class with ${m.name} is booked for ${parentTime} (${b.parentTimezone}).`,
        "",
        `Join the class: ${b.meetingLink}`,
        "",
        `For reference, that is ${utcTime}.`,
      ].join("\n"),
    },
    {
      to: m.email,
      subject: `New trial class on ${mentorTime}`,
      body: [
        `Hi ${m.name.split(" ")[0]},`,
        "",
        `You have a trial class with ${b.parentName}'s child on ${mentorTime} (${m.timezone}).`,
        `The parent's local time is ${parentTime} (${b.parentTimezone}).`,
        "",
        `Join the class: ${b.meetingLink}`,
      ].join("\n"),
    },
  ];
}

/** Dummy transport: logs to the server console. Replace with Nodemailer, SES or Resend. */
export function sendEmails(messages: EmailMessage[]): EmailMessage[] {
  for (const msg of messages) {
    console.log(`\n[email] to: ${msg.to}\nsubject: ${msg.subject}\n${msg.body}\n`);
  }
  return messages;
}
