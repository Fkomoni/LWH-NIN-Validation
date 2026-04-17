import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge middleware:
 *   - emits a trace id for each request so server logs + client errors can
 *     be joined up
 *   - tags the client IP (x-forwarded-for first hop) for downstream handlers
 *
 * Security headers that don't need per-route values live in next.config.ts.
 * Per-route CSP, CSRF, and rate-limit work lands here in Phase 2 once
 * Upstash + Turnstile are wired up.
 */
export function middleware(req: NextRequest) {
  const traceId = crypto.randomUUID();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "0.0.0.0";

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-trace-id", traceId);
  requestHeaders.set("x-client-ip", ip);

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("x-trace-id", traceId);
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|brand/).*)"],
};
