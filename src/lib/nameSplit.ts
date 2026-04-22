import { normaliseName } from "./validation/nameNormalise";

/**
 * Qore expects `firstname` and `lastname` in the verify call. Our member
 * record stores a single `fullName`. We normalise (titles + diacritics
 * stripped) then split on the first / last whitespace token.
 */
export function splitFullName(fullName: string): { firstname: string; lastname: string } {
  const n = normaliseName(fullName);
  if (!n) return { firstname: "", lastname: "" };
  const parts = n.split(" ").filter(Boolean);
  if (parts.length === 0) return { firstname: "", lastname: "" };
  if (parts.length === 1) return { firstname: parts[0]!, lastname: parts[0]! };
  const firstname = parts[0]!;
  const lastname = parts[parts.length - 1]!;
  return { firstname, lastname };
}
