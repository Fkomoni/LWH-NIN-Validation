import type { NextConfig } from "next";

/**
 * Content-Security-Policy tuned for Next 15 App Router + Server Actions.
 *
 * `unsafe-inline` + `unsafe-eval` for script-src are the Next-recommended
 * defaults until we move to a nonce-based CSP via middleware (tracked as
 * a Phase-5 hardening task). Everything else is locked down to `self`.
 * Upstream APIs (Qore, Prognosis) are called server-side only, so they
 * do NOT need to appear in connect-src.
 */
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Emit a self-contained deployment bundle at `.next/standalone/`.
  // IT can drop that directory onto Azure App Service and start the
  // server with `node server.js` — no `pnpm install` or source-tree
  // build step required on the target.
  output: "standalone",
  experimental: {
    typedRoutes: true,
  },
  serverExternalPackages: ["msw", "@mswjs/interceptors"],
  // The standalone file tracer can't follow MSW's dynamic subpath
  // exports (we load `msw/node` via a computed specifier on purpose).
  // Force-include it so the standalone bundle can boot even though the
  // code path is a no-op in production (NEXT_PUBLIC_MOCKS_ENABLED=false).
  outputFileTracingIncludes: {
    "*": [
      "./node_modules/msw/**",
      "./node_modules/@mswjs/**",
      "./node_modules/@bundled-es-modules/**",
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
