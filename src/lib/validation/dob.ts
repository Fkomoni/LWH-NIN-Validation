/**
 * DOB helpers. All DOBs are ISO date strings (YYYY-MM-DD) at the boundary;
 * we never rely on Date's time-zone behaviour for equality.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
  );
}

/** Strict equality on the ISO string. */
export function dobMatches(a: string, b: string): boolean {
  return isIsoDate(a) && isIsoDate(b) && a === b;
}

/** Is the supplied ISO date in the past and the person at least `min` years old? */
export function isPlausibleDob(iso: string, minYears = 0, maxYears = 120): boolean {
  if (!isIsoDate(iso)) return false;
  const now = new Date();
  const dob = new Date(`${iso}T00:00:00Z`);
  if (dob > now) return false;
  const years = (now.getTime() - dob.getTime()) / (365.25 * 24 * 3600 * 1000);
  return years >= minYears && years <= maxYears;
}
