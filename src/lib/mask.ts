/**
 * PII masking helpers. Any log line, analytics event, or error payload that
 * touches user data MUST go through one of these. See OWASP ASVS v4 L2.
 */

import { createHash } from "node:crypto";

/** Keep the last 3 digits of an 11-digit NIN; hide the rest. */
export function maskNin(nin: string): string {
  const digits = nin.replace(/\D/g, "");
  if (digits.length < 4) return "***";
  return `${"*".repeat(digits.length - 3)}${digits.slice(-3)}`;
}

/** Hide the middle of a Nigerian phone number (keeps +country and last 3). */
export function maskPhone(phone: string): string {
  const compact = phone.replace(/\s+/g, "");
  if (compact.length < 6) return "***";
  const head = compact.slice(0, 4);
  const tail = compact.slice(-3);
  return `${head}${"*".repeat(Math.max(compact.length - 7, 3))}${tail}`;
}

/** Reduce an email to `a***@domain.tld` for logs. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***";
  return `${local[0] ?? "*"}***@${domain}`;
}

/** Hide everything but the first initial of each name token. */
export function maskName(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((tok) => `${tok[0] ?? "*"}***`)
    .join(" ");
}

/**
 * Hash-prefix for business identifiers that are not strict PII but
 * should not be written to logs in clear (enrolleeId, memberId,
 * actorId). sha256 → first 10 hex chars; deterministic so operators
 * can still correlate journeys across log lines, but the raw ID is
 * no longer present in a log-pipeline breach.
 */
export function maskId(id: string): string {
  if (!id) return "***";
  const h = createHash("sha256").update(id).digest("hex");
  return `id_${h.slice(0, 10)}`;
}

/** Safe deep-mask helper for structured log payloads. */
export function maskPii<T extends Record<string, unknown>>(obj: T): T {
  const cloned: Record<string, unknown> = { ...obj };
  for (const [k, v] of Object.entries(cloned)) {
    if (typeof v !== "string") continue;
    const key = k.toLowerCase();
    if (key.includes("nin")) cloned[k] = maskNin(v);
    else if (key.includes("phone") || key.includes("msisdn")) cloned[k] = maskPhone(v);
    else if (key.includes("email")) cloned[k] = maskEmail(v);
    else if (key.includes("name") || key === "fullname") cloned[k] = maskName(v);
    else if (key === "dob" || key.endsWith("dob")) cloned[k] = "****-**-**";
    // Business identifiers — not strict PII, but correlatable.
    else if (
      key === "enrolleeid" ||
      key === "memberid" ||
      key === "actorid" ||
      key === "principalenrolleeid" ||
      key === "beneficiaryid"
    ) {
      cloned[k] = maskId(v);
    }
  }
  return cloned as T;
}
