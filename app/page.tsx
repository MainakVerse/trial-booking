import Link from "next/link";
import DualClock from "@/components/DualClock";

export default function Home() {
  return (
    <section className="hero">
      <div className="hero-copy">
        <h1>A free coding class for your child, at a time that suits you.</h1>
        <p>
          Pick an hour in your own time zone. We match your child with a mentor and email you both
          the class link, each in your local time.
        </p>
        <Link href="/book" className="button button-primary">Choose a time</Link>
      </div>
      <DualClock />
    </section>
  );
}
