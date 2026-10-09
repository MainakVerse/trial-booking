import type { Mentor } from "./types";

const IST = "Asia/Kolkata";
// Morning shift in India lines up with US evenings; evening shift with UK afternoons and evenings.
const MORNING = { startHour: 3, endHour: 10 };
const EVENING = { startHour: 16, endHour: 24 };

const seed: Array<[string, typeof MORNING]> = [
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

export const MENTORS: Mentor[] = seed.map(([name, window], i) => ({
  id: `m${String(i + 1).padStart(2, "0")}`,
  name,
  email: `${name.split(" ")[0].toLowerCase()}@mentors.codeyoung.example`,
  timezone: IST,
  window,
}));
