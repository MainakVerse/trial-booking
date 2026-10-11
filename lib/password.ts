import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/** scrypt hash in the form scrypt$<salt>$<hash>. Used for mentor access codes. */
export function hashSecret(secret: string): string {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("hex")}$${scryptSync(secret, salt, 32).toString("hex")}`;
}

export function verifySecret(secret: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(secret, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
}

/** Constant-time string comparison that doesn't leak length. */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // no look-alike characters
export function generateAccessCode(length = 10): string {
  const bytes = randomBytes(length);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}
