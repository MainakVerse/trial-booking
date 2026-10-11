import Link from "next/link";

export default function BookingNotFound() {
  return (
    <section className="confirm">
      <h1>We couldn't find that booking</h1>
      <p className="muted">Check that you opened the full link from your confirmation email.</p>
      <Link href="/book" className="button button-primary">Book a trial class</Link>
    </section>
  );
}
