import type { NextConfig } from "next";

/**
 * Content-Security-Policy tuned for Next 15 App Router + Server Actions.
 *
 * We keep `'unsafe-inline'` on script-src for the Next-runtime bootstrap
 * script (next/script inserts inline hydration code). `'unsafe-eval'`
 * has been removed — the App Router does not require it in production
 * and its presence would allow a malicious injected payload to escape
 * via `eval()` / `new Function()`. If a future dependency needs eval,
 * we should isolate it via a worker or prefer the WASM/strict-csp
 * replacement rather than re-enabling the directive.
 *
 * Everything else is locked down to `self`. Upstream APIs (Qore,
 * Prognosis) are called server-side only, so they do NOT need to
 * appear in connect-src.
 */
const csp = [
  "default-src 'self'",
  // 'unsafe-inline' retained for next/script hydration. Turnstile's
  // api.js is loaded from challenges.cloudflare.com.
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  // connect-src includes challenges.cloudflare.com for the Turnstile
  // siteverify callback the widget performs client-side.
  "connect-src 'self' https://challenges.cloudflare.com",
  // Turnstile renders inside an iframe; allow embedding from Cloudflare.
  "frame-src https://challenges.cloudflare.com",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

const isProd = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    typedRoutes: true,
  },
  // MSW is used only in dev / mock mode (see src/instrumentation.ts).
  // We keep it external so it isn't bundled into the production
  // runtime chunks; production boot refuses to import it anyway.
  serverExternalPackages: isProd ? [] : ["msw", "@mswjs/interceptors"],
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
