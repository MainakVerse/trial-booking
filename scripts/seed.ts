import { pool } from "../lib/db";
import { generateAccessCode, hashSecret } from "../lib/password";

const IST = "Asia/Kolkata";
// Morning shift in India lines up with US evenings; evening shift with UK afternoons and evenings.
const MORNING = { startHour: 3, endHour: 10 };
const EVENING = { startHour: 16, endHour: 24 };

const SEED: Array<[string, typeof MORNING]> = [
  ["Ananya Sharma", MORNING],
  ["Rohan Mehta", MORNING],
  ["Priya Iyer", MORNING],
  ["Arjun Nair", MORNING],
  ["Sneha Reddy", MORNING],
  ["Karthik Rao", EVENING],
  ["Meera Pillai", EVENING],
  ["Vikram Joshi", EVENING],
  ["Divya Menon", EVENING],
  ["Aditya Bose", EVENING],
];

/** Idempotent: existing mentors are left alone. New ones get a random access code, shown once. */
async function main() {
  const created: Array<{ email: string; code: string }> = [];
  for (const [i, [name, w]] of SEED.entries()) {
    const id = `m${String(i + 1).padStart(2, "0")}`;
    const email = `${name.split(" ")[0].toLowerCase()}@mentors.codeyoung.example`;
    const code = generateAccessCode();
    const res = await pool().query(
      `insert into mentors (id, name, email, timezone, start_hour, end_hour, access_hash)
       values ($1,$2,$3,$4,$5,$6,$7) on conflict (id) do nothing`,
      [id, name, email, IST, w.startHour, w.endHour, hashSecret(code)],
    );
    if (res.rowCount) created.push({ email, code });
  }
  if (created.length) {
    console.log(`Created ${created.length} mentors. Access codes (shown once, reset any time from Admin > Mentors):`);
    console.table(created);
  } else {
    console.log("All seed mentors already exist. Nothing to do.");
  }
  await pool().end();
}

main().catch((e) => {
  console.error("Seed failed:", e.message);
  process.exit(1);
});
