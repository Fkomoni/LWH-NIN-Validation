/**
 * Normalise a full-name string for fuzzy comparison.
 *
 * Rules (spec-driven):
 *   - lowercase
 *   - strip common titles (Mr, Mrs, Dr, Chief, Alhaji, …)
 *   - strip punctuation
 *   - collapse multiple spaces
 *   - remove diacritics (NFD + drop combining marks)
 *   - trim leading/trailing whitespace
 *
 * Intentionally does NOT reorder tokens — Jaro-Winkler is position-sensitive,
 * but our compare() in scoreName.ts sorts tokens before comparison to handle
 * "LASTNAME, FIRSTNAME" vs. "FIRSTNAME LASTNAME" ordering differences.
 */
const TITLES = new Set([
  "mr",
  "mrs",
  "ms",
  "miss",
  "mister",
  "mister.",
  "dr",
  "prof",
  "engr",
  "arc",
  "chief",
  "alhaji",
  "alhaja",
  "hajia",
  "pastor",
  "rev",
  "reverend",
  "sir",
  "madam",
  "mallam",
  "sheikh",
  "barr",
  "hon",
  "jnr",
  "jr",
  "snr",
  "sr",
  "ii",
  "iii",
]);

export function normaliseName(input: string): string {
  if (!input) return "";
  // 1. remove diacritics
  const nfd = input.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  // 2. lowercase
  const lower = nfd.toLowerCase();
  // 3. replace punctuation with space
  const punct = lower.replace(/[^a-z0-9\s]/g, " ");
  // 4. drop titles
  const tokens = punct
    .split(/\s+/)
    .filter((t) => t.length > 0)
    .filter((t) => !TITLES.has(t.replace(/\./g, "")));
  // 5. collapse
  return tokens.join(" ").trim();
}

/**
 * Split a normalised name into sorted tokens. Use for order-insensitive
 * comparison.
 */
export function sortedTokens(normalised: string): string[] {
  return normalised.split(" ").filter(Boolean).sort();
}
