import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge middleware.
 *
 * Responsibilities:
 *   - Emit a per-request trace id (joins server logs to client errors).
 *   - Derive the **trusted** client IP from `x-real-ip` (set by the
 *     Render / Azure front proxy) and only fall back to the last hop
 *     of `x-forwarded-for`. Never trust the *first* XFF hop — that one
 *     is attacker-controllable and will forge-bypass the rate limiter.
 *   - Gate `/admin/*` (except `/admin/login`) behind the admin cookie.
 *     Unlike the previous "presence only" check, this now **verifies
 *     the HMAC** using Web Crypto (Edge-safe). Tampered or forged
 *     cookies are rejected before the page loads.
 */

const PROTECTED_ADMIN = /^\/admin\/(?!login)(.*)/;

/**
 * Pick the trusted client IP per F-07.
 *
 * Order of preference:
 *   1. `x-real-ip`  — Render/Azure/CloudFront-style single-source-of-truth.
 *                     Always preferred when present.
 *   2. Last hop of `x-forwarded-for` — ONLY consulted when the deploy
 *      opts in via `TRUST_XFF_LAST_HOP=true`. Requires a proxy that
 *      appends a trusted last hop and strips attacker-supplied tail
 *      values. Without that invariant, an attacker can append their
 *      desired IP to XFF and bypass per-IP rate limits.
 *   3. "0.0.0.0" otherwise — the rate-limiter coalesces all such
 *      requests onto a single key, which is the safe default.
 */
function trustedClientIp(req: NextRequest): string {
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  if (process.env.TRUST_XFF_LAST_HOP === "true") {
    const xff = req.headers.get("x-forwarded-for");
    if (xff) {
      const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
      if (parts.length) return parts[parts.length - 1]!;
    }
  }
  return "0.0.0.0";
}

/**
 * Edge-safe HMAC-SHA256 verify of `<payload>.<sig>`. Mirrors the
 * Node-side sign()/decode() in src/server/admin/session.ts using
 * Web Crypto so it runs in the Edge runtime.
 */
async function verifyAdminCookie(raw: string | undefined): Promise<boolean> {
  if (!raw) return false;
  const [payload, sig] = raw.split(".");
  if (!payload || !sig) return false;

  const secret = process.env.ADMIN_SECRET;
  if (!secret) return false; // fail closed in live mode

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const mac = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(payload),
    );
    const bytes = new Uint8Array(mac);
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
    const expected = btoa(bin)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    if (expected.length !== sig.length) return false;
    // Constant-time compare.
    let diff = 0;
    for (let i = 0; i < expected.length; i++) {
      diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
    }
    return diff === 0;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const traceId = crypto.randomUUID();
  const ip = trustedClientIp(req);

  if (PROTECTED_ADMIN.test(req.nextUrl.pathname)) {
    const cookie = req.cookies.get("lwh_admin")?.value;
    const valid = await verifyAdminCookie(cookie);
    if (!valid) {
      const url = req.nextUrl.clone();
      url.pathname = "/admin/login";
      url.searchParams.set("next", req.nextUrl.pathname);
      return NextResponse.redirect(url);
    }
  }

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-trace-id", traceId);
  requestHeaders.set("x-client-ip", ip);

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("x-trace-id", traceId);
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|brand/|images/).*)"],
};
