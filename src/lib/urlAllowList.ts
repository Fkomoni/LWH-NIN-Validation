import "server-only";

/**
 * Provider URL allow-list.
 *
 * All outbound HTTP clients read their base URL from env. Without a
 * validator, a compromised Render dashboard or a mistyped env var
 * could redirect Qore / NIMC / Prognosis calls at an attacker-
 * controlled host, carrying the bearer token and member PII.
 *
 * validateProviderUrl():
 *   - Requires https:// in live production (rejects http://*).
 *   - Parses with URL() and checks the hostname against an allow-list
 *     supplied by the caller.
 *   - Does NOT hit the network.
 */

export interface ValidateUrlOptions {
  /** Hostname suffixes that are permitted, e.g. ["qoreid.com"]. */
  allowedHostSuffixes: string[];
  /** Human name used in the error. */
  label: string;
}

export function validateProviderUrl(raw: string | undefined, opts: ValidateUrlOptions): string {
  if (!raw || !raw.trim()) {
    throw new Error(`${opts.label}: URL is not configured.`);
  }
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error(`${opts.label}: invalid URL (${raw}).`);
  }
  if (process.env.NODE_ENV === "production" && u.protocol !== "https:") {
    throw new Error(`${opts.label}: must be https:// in production (got ${u.protocol}).`);
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error(`${opts.label}: unsupported protocol ${u.protocol}.`);
  }
  const host = u.hostname.toLowerCase();
  const ok = opts.allowedHostSuffixes.some((suffix) => {
    const s = suffix.toLowerCase();
    return host === s || host.endsWith(`.${s}`);
  });
  if (!ok) {
    throw new Error(
      `${opts.label}: host ${host} is not on the provider allow-list (${opts.allowedHostSuffixes.join(", ")}).`,
    );
  }
  return raw;
}
