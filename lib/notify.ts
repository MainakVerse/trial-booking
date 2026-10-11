import nodemailer, { type Transporter } from "nodemailer";
import { appUrl } from "./config";
import { insertEmailLog } from "./repo";
import { formatInZone } from "./time";
import type { Booking, BookingView, Mentor } from "./types";

export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
}

type MentorLike = Pick<Mentor, "name" | "email" | "timezone">;

export const manageUrl = (token: string) => `${appUrl()}/booking/${token}`;

/** Each recipient gets the time in their own zone, plus UTC as an unambiguous reference. */
export function buildConfirmationEmails(b: Booking, m: MentorLike): EmailMessage[] {
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
        `View or cancel your booking: ${manageUrl(b.manageToken)}`,
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

export function buildCancellationEmails(b: BookingView): EmailMessage[] {
  const parentTime = formatInZone(b.startUtc, b.parentTimezone);
  const mentorTime = formatInZone(b.startUtc, b.mentorTimezone);
  const why = b.cancelReason ? `\nReason: ${b.cancelReason}` : "";
  return [
    {
      to: b.parentEmail,
      subject: `Your Codeyoung trial class on ${parentTime} was cancelled`,
      body: [
        `Hi ${b.parentName},`,
        "",
        `Your trial class on ${parentTime} (${b.parentTimezone}) has been cancelled.${why}`,
        "",
        `You can book a new time at ${appUrl()}/book`,
      ].join("\n"),
    },
    {
      to: b.mentorEmail,
      subject: `Trial class on ${mentorTime} was cancelled`,
      body: [
        `Hi ${b.mentorName.split(" ")[0]},`,
        "",
        `The trial class with ${b.parentName}'s child on ${mentorTime} (${b.mentorTimezone}) has been cancelled.${why}`,
        "You do not need to attend.",
      ].join("\n"),
    },
  ];
}

let transport: Transporter | null | undefined;
function getTransport(): Transporter | null {
  if (transport === undefined) {
    transport = process.env.SMTP_URL ? nodemailer.createTransport(process.env.SMTP_URL) : null;
  }
  return transport;
}

/**
 * Sends each message (when SMTP_URL is set) and records every one in email_log.
 * Never throws: a mail outage must not undo a booking that is already saved.
 */
export async function deliver(messages: EmailMessage[], bookingId: string | null): Promise<void> {
  const smtp = getTransport();
  for (const msg of messages) {
    let status: "sent" | "logged" | "failed" = "logged";
    let error: string | undefined;
    if (smtp) {
      try {
        await smtp.sendMail({ from: process.env.EMAIL_FROM || "Codeyoung <no-reply@codeyoung.example>", ...msg, text: msg.body });
        status = "sent";
      } catch (e) {
        status = "failed";
        error = e instanceof Error ? e.message : String(e);
        console.error(`[email] failed to send to ${msg.to}: ${error}`);
      }
    } else {
      console.log(`[email] (no SMTP_URL, recorded only) to: ${msg.to} | ${msg.subject}`);
    }
    try {
      await insertEmailLog({ bookingId, recipient: msg.to, subject: msg.subject, body: msg.body, status, error });
    } catch (e) {
      console.error("[email] could not write email_log", e);
    }
  }
}
