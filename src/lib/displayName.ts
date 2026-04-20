/**
 * Display-only helpers for partially-masked name rendering and
 * locale-friendly date display. Used in the "DOB doesn't match"
 * error messages so the member can confirm we are matching against
 * the right record without fully exposing PII.
 */

export function maskNamePartial(name: string | undefined | null): string {
  const n = (name ?? "").trim();
  if (!n) return "***";
  // Show first min(3, half) characters; replace the rest with "x".
  // Short names (< 2 chars) get a 1-char reveal so we still emit
  // something the reader can anchor on.
  const keep = n.length <= 2 ? 1 : Math.min(3, Math.ceil(n.length / 2));
  const hidden = Math.max(n.length - keep, 3);
  return n.slice(0, keep) + "x".repeat(hidden);
}

/** "2014-07-12" → "12/07/2014". Leaves unparseable input unchanged. */
export function formatIsoDobToDdMmYyyy(iso: string | undefined | null): string {
  if (!iso) return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/**
 * Compose the "Enrollee with Firxxx Othxxx Surxxx (partially shown)
 * with the inserted date of birth dd/mm/yyyy does not match our
 * records." error string used at `/auth` and on the NIN fallback.
 *
 * Expects `fullName` to arrive in FirstName OtherName Surname order —
 * PrognosisMemberClient builds it that way from the atomic fields.
 * Every whitespace-separated token is masked, preserving order.
 */
export function composeDobMismatchMessage(
  fullName: string | undefined,
  dobIso: string,
): string {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  const masked = parts.length
    ? parts.map(maskNamePartial).join(" ")
    : maskNamePartial("");
  const dob = formatIsoDobToDdMmYyyy(dobIso);
  return `Enrollee with ${masked} (partially shown) with the inserted date of birth ${dob} does not match our records.`;
}
