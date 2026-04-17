import { appConfig } from "@/config/app";
import { jaroWinkler } from "./jaroWinkler";
import { normaliseName, sortedTokens } from "./nameNormalise";

export type NameMatchTier = "auto-pass" | "manual-review" | "fail";

export interface NameMatchResult {
  score: number;
  tier: NameMatchTier;
  normalisedA: string;
  normalisedB: string;
}

/**
 * Compare two full-name strings and produce a tier per app policy.
 *
 * Token-sort strategy: normalise → split → sort → re-join, then compute
 * Jaro-Winkler on the joined string. This handles reordering (e.g.
 * "Okoro Chidinma" vs. "Chidinma Okoro") without collapsing distinct names
 * to a perfect score.
 */
export function scoreNameMatch(a: string, b: string): NameMatchResult {
  const na = normaliseName(a);
  const nb = normaliseName(b);
  const sa = sortedTokens(na).join(" ");
  const sb = sortedTokens(nb).join(" ");

  // Take the max of position-sensitive and token-sorted scores so that
  // exact-order matches aren't penalised by the sort.
  const score = Math.max(jaroWinkler(na, nb), jaroWinkler(sa, sb));

  const { autoPassMin, manualReviewMin } = appConfig.nameMatch;
  const tier: NameMatchTier =
    score >= autoPassMin ? "auto-pass" : score >= manualReviewMin ? "manual-review" : "fail";

  return { score, tier, normalisedA: na, normalisedB: nb };
}
