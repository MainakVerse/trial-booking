/**
 * Canonical form of an email for duplicate detection: lower-case, "+tag" removed,
 * and dots removed for Gmail. "A.B+x@gmail.com" and "ab@gmail.com" are the same person.
 */
export function emailKey(email: string): string {
  const [rawLocal = "", rawDomain = ""] = email.trim().toLowerCase().split("@");
  let domain = rawDomain;
  let local = rawLocal.split("+")[0];
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") local = local.replace(/\./g, "");
  return `${local}@${domain}`;
}
