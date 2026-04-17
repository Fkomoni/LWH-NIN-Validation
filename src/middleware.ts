import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge middleware:
 *   - emits a trace id for each request so server logs + client errors
 *     can be joined up
 *   - tags the first-hop client IP for downstream handlers
 *   - redirects unauthenticated requests for protected admin routes
 *     to /admin/login
 *
 * Real CSP + per-route rate limiting + Turnstile verify land here in
 * Phase 2 once Upstash + Turnstile are wired up.
 */

const PROTECTED_ADMIN = /^\/admin\/(?!login)(.*)/;

export function middleware(req: NextRequest) {
  const traceId = crypto.randomUUID();
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "0.0.0.0";

  // Admin gate — cookie presence only; signature verified server-side.
  if (PROTECTED_ADMIN.test(req.nextUrl.pathname)) {
    const cookie = req.cookies.get("lwh_admin");
    if (!cookie?.value) {
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
  matcher: ["/((?!_next/static|_next/image|favicon.ico|brand/).*)"],
};
