/**
 * Jaro-Winkler string similarity on [0, 1].
 *
 * Pure function, zero deps. Targeted by the ≥80% coverage bar.
 *
 * Reference: Winkler, W.E. (1990). "String Comparator Metrics and Enhanced
 * Decision Rules in the Fellegi-Sunter Model of Record Linkage".
 */

export function jaroSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;

  const matchWindow = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);

  const aMatches = new Array<boolean>(a.length).fill(false);
  const bMatches = new Array<boolean>(b.length).fill(false);

  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, b.length);
    for (let j = start; j < end; j++) {
      if (bMatches[j]) continue;
      if (a[i] !== b[j]) continue;
      aMatches[i] = true;
      bMatches[j] = true;
      matches++;
      break;
    }
  }
  if (matches === 0) return 0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aMatches[i]) continue;
    while (!bMatches[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }

  const m = matches;
  const t = transpositions / 2;
  return (m / a.length + m / b.length + (m - t) / m) / 3;
}

/**
 * Jaro-Winkler adds a prefix bonus (p = 0.1, up to 4 matching leading chars).
 */
export function jaroWinkler(a: string, b: string, prefixScale = 0.1): number {
  const j = jaroSimilarity(a, b);
  if (j === 0) return 0;
  let prefix = 0;
  const maxPrefix = Math.min(4, a.length, b.length);
  for (let i = 0; i < maxPrefix; i++) {
    if (a[i] === b[i]) prefix++;
    else break;
  }
  return j + prefix * prefixScale * (1 - j);
}
