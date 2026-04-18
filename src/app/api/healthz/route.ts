import { NextResponse } from "next/server";

/**
 * Render health check.
 *
 * Kept intentionally trivial: Render probes this URL every few seconds;
 * anything that touches the DB / Prognosis / Qore here would multiply
 * upstream load and give false negatives on transient provider blips.
 * Deeper readiness / dependency probes land at /api/readyz in Phase 3.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  // Minimal, anonymous probe response. Do NOT include the operating
  // mode, service name or version: unauthenticated callers shouldn't
  // be able to distinguish mock vs live, and leaving that off keeps
  // reconnaissance surface minimal. Richer readiness info lives on a
  // future authenticated /api/readyz.
  return NextResponse.json(
    { ok: true },
    { status: 200, headers: { "cache-control": "no-store" } },
  );
}
