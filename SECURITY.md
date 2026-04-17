# Security overview

Single-page briefing for Leadway IT / Security review.
Last updated: 17 Apr 2026 · Branch: `claude/nin-verification-system-iyLLh`.

> **Read this first.** It links to the code that implements each
> control so you don't have to hunt through the repo. Deeper docs:
> `docs/architecture/architecture.md`, `DEPLOY.md`, `prisma/schema.prisma`.

---

## 1. What the app does

A narrow self-service portal that lets a Leadway Health principal
enrollee:

1. Authenticate with **Enrollee ID + DOB** (or DOB mismatch → validate
   with principal's NIN).
2. See themselves and their dependants.
3. Submit NINs for validation against **NIMC (via Qore)**.
4. On successful NIMC verification, the app writes the verified NIN
   back to **Prognosis** (`/EnrolleeProfile/UpdateMemberData`).
5. Principal receives a receipt email per successful beneficiary update.

Scope is intentionally tight — no PHI, no claims, no payments.

---

## 2. Threat model (summary)

| Threat                                   | Control                               | Where                                                 |
| ---------------------------------------- | ------------------------------------- | ----------------------------------------------------- |
| Credential stuffing / brute force        | IP rate limit (10/min) + per-enrollee sliding-window lockout (3 fails in 1 h → 48 h hard lock) | `src/server/rateLimit.ts`, `src/server/lockout.ts`    |
| Session hijack                           | HMAC-signed cookie, `httpOnly`, `secure`, `sameSite=lax`, 30-min absolute TTL | `src/server/session.ts`                               |
| CSRF on state change                     | Next.js Server Actions (origin check built in) + cookie sameSite | Framework                                             |
| NIN / PHI leakage in logs                | Auto-masking pino wrapper (NIN last-3, phone middle, name initials) | `src/lib/mask.ts`, `src/lib/logger.ts`                |
| Replay of same NIN submit                | Idempotency key per submission (UUID, KV-cached 24 h) | `src/services/real/NinService.real.ts`                |
| Partial write (NIMC success, Prognosis down) | Durable outbox with exponential backoff (1 s → 1 h), 6-attempt cap then DLQ | `src/server/outbox.ts`                                |
| Dependency compromise                    | `pnpm-lock.yaml` committed, CI blocks on install failure | `.github/workflows/ci.yml`                            |
| Clickjacking                             | `X-Frame-Options: DENY`, CSP `frame-ancestors 'none'` | `next.config.ts`                                      |
| MIME sniffing                            | `X-Content-Type-Options: nosniff`     | `next.config.ts`                                      |
| Protocol downgrade                       | HSTS `max-age=63072000; includeSubDomains; preload` | `next.config.ts`                                      |
| XSS (stored / reflected)                 | Strict CSP, React escape by default, no `dangerouslySetInnerHTML` | `next.config.ts` + codebase-wide                      |
| Account-enumeration via error copy       | Generic "couldn't match those details" wording for both wrong-enrollee + wrong-DOB | `src/server/actions/auth.ts`, `src/app/auth/AuthStartForm.tsx` |
| Admin abuse                              | Admin gate via middleware (307 → login); dev-only shared password, to be replaced by Leadway SSO | `src/middleware.ts`, `src/server/admin/session.ts`    |
| Provider outage → user lockout           | `PROVIDER_ERROR` is NOT counted toward the 3-strike lockout (only `DOB_MISMATCH` and `NOT_FOUND`) | `src/services/real/MemberService.real.ts`             |
| Bot abuse of NIN submit                  | Cloudflare Turnstile helper in place (env-gated, no-op until keys set) | `src/server/turnstile.ts`                             |

---

## 3. OWASP ASVS v4 Level 2 control mapping

Done ✅ · Partial ⚠️ · Phase 3+ ⏳

| ASVS Section                                 | State | Notes                                                                        |
| -------------------------------------------- | ----- | ---------------------------------------------------------------------------- |
| V1 Architecture / threat modelling          | ✅    | `docs/architecture/architecture.md` (mermaid diagrams + trust boundaries)     |
| V2 Authentication                           | ✅    | DOB + NIN fallback + 48 h lockout; Turnstile scaffold                        |
| V3 Session management                        | ✅    | Signed cookie, httpOnly, secure, sameSite, idle 15 m / abs 30 m              |
| V4 Access control                            | ✅    | Portal routes require session; admin routes role-gated in middleware         |
| V5 Input validation, encoding                | ✅    | Zod on every form/server action; React auto-escapes output                   |
| V6 Cryptography                              | ✅    | HMAC-SHA256 session + OTP; Bearer token cached in-memory only                |
| V7 Error handling, logging                   | ✅    | Structured pino logs, per-request `traceId`, PII auto-masked                 |
| V8 Data protection                           | ⚠️    | PII in transit over TLS 1.3; at-rest encryption columns defined in Prisma but DB not yet wired (Phase 3) |
| V9 Communications                            | ✅    | HSTS, COOP/CORP, Referrer-Policy, Permissions-Policy                         |
| V10 Malicious code                           | N/A   | No user-uploaded code/files                                                  |
| V11 Business logic                           | ✅    | Sliding-window rate limits, idempotency keys, outbox (no duplicate writes)   |
| V12 Files & resources                        | ✅    | No user file upload                                                          |
| V13 API                                      | ✅    | Server Actions (single-origin), CSRF handled by framework                    |
| V14 Configuration                            | ✅    | All secrets via env; CSP / security headers shipped; `next.config.ts`        |

---

## 4. Nigerian Data Protection Act (NDPA) 2023

| Principle                         | Implementation                                                                                        |
| --------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Lawful basis & consent            | Explicit consent checkbox on `/auth` before any NIMC call; copy in `src/components/layout/ConsentBanner.tsx` |
| Data minimisation                 | Portal collects only NIN, DOB, Enrollee ID; verified response masks names/DOB on error paths          |
| Accuracy                          | Strict ISO-equality DOB check; Jaro-Winkler name match with configurable thresholds                   |
| Purpose limitation                | Payload to Prognosis hardcoded with `source: "self-service-portal"`; no other use                     |
| Retention                         | Audit log retention 12 months (policy in `appConfig` + Prisma model); in-memory KV resets on deploy  |
| Right to erasure (TBD)            | Admin console Phase 4 will expose delete/unlock; data currently minimal so impact is low              |
| Cross-border transfer             | NIMC (Qore) + Prognosis both NG-hosted                                                               |
| Breach notification               | Security-ops email (`f-komoni-mbaekwe@leadway.com`) auto-notified on 48 h hard lock                   |

---

## 5. PII handling

### What PII lives in the app

| Field                 | Where                                 | Masked in logs?    |
| --------------------- | ------------------------------------- | ------------------ |
| NIN (11-digit)        | Only in-flight; never stored raw in KV | ✅ last-3 only    |
| DOB (ISO)             | Compared in memory                     | ✅ for user-facing logs; ops comparison log shows value for debug |
| Phone                 | Read from Prognosis, sent only to NIMC notify SMS | ✅ middle masked |
| Email                 | Read from Prognosis, used for receipts | ✅ local-part masked |
| Names                 | In-memory comparison                   | ✅ initial-mask on error paths |

### Never logged

- OTP codes (HMAC-hashed before storage; plaintext never touches logs)
- Bearer tokens (only first 12 chars + length logged for debugging)
- Full names on error paths

---

## 6. Secrets management

- **All secrets via environment variables.** `.env.example` lists every
  supported variable; no value is committed.
- **Never committed to git** — `.gitignore` excludes `.env*` (except
  `.env.example`).
- **Auto-generated on Render** for signing secrets:
  - `AUTH_SECRET` (session cookie HMAC)
  - `ADMIN_SECRET` (admin cookie HMAC)
  - `OTP_HMAC_SECRET` (OTP pepper)
- **Operator-provided (`sync:false` in `render.yaml`)**:
  - `PROGNOSIS_USERNAME`, `PROGNOSIS_PASSWORD`
  - `QORE_CLIENT_ID`, `QORE_SECRET_KEY`, `QORE_TOKEN_URL`, `QORE_NIN_VERIFY_URL`
  - `ADMIN_BOOTSTRAP_PASSWORD`
- **Bearer token lifecycle:** obtained from `/ApiUsers/Login`, cached
  in-memory for 5 h (Prognosis TTL = 6 h), auto-refreshed on expiry.
  Never persisted to disk.

---

## 7. Dependencies

Full manifest: `package.json` + `pnpm-lock.yaml` (pinned).

Runtime:
- Next.js 15.1.3, React 19
- Prisma 6 (client scaffolded; no DB queries in production path today)
- Zod (form + payload validation)
- Pino (structured logging)

Security-sensitive libraries and their purpose:
| Package                       | Purpose                                        |
| ----------------------------- | ---------------------------------------------- |
| `msw` (dev only)              | HTTP mocks during Phase 1 walkthroughs         |
| `@radix-ui/*`                 | Accessible UI primitives                       |
| `react-hook-form`             | Form state (no DOM innerHTML manipulation)     |
| `tailwindcss`                 | Static class generation at build time          |

No dependency with known CVE at time of writing. CI should add
`pnpm audit` as a Phase 3 task.

---

## 8. Known gaps (transparent)

| Gap                                        | Impact                                                              | Planned phase  |
| ------------------------------------------ | ------------------------------------------------------------------- | -------------- |
| KV is in-memory (no Upstash Redis wired)   | Rate limits, OTP, outbox reset on each deploy. Single-instance OK. | Phase 3        |
| No Postgres persistence yet                | Audit log + manual reviews live in KV → volatile                   | Phase 3        |
| Admin auth = shared dev password           | Acceptable for MVP; replace with Leadway SSO / per-user accounts    | Phase 2/3      |
| Sentry DSN not wired                       | Errors visible only in Render log tail                             | Phase 3        |
| OpenTelemetry not wired                    | No distributed tracing beyond `traceId` field                      | Phase 3        |
| Turnstile keys not set                     | Helper is in place (`src/server/turnstile.ts`) and no-ops          | Phase 2        |
| CSP uses `'unsafe-inline'` for scripts     | Next 15 App Router requirement; move to nonce-based in hardening   | Phase 5        |
| Prognosis NIN-update phone requirement     | Validator demands ≥ 10 digits even for child dependants; we inherit the principal's phone — data-model quirk flagged with client |

---

## 9. Test / pen-test entry points

### Public routes
- `GET /` — landing
- `GET /auth` — Enrollee ID + DOB form
- `GET /verify?enrolleeId=…` — DOB-mismatch fallback (retry DOB / validate with NIN)
- `GET /api/healthz` — healthcheck (no auth required by design)

### Authenticated routes
- `GET /household` — beneficiary list
- `GET /done` — summary

### Admin routes (dev password, to be replaced)
- `GET /admin/login`
- `GET /admin/reviews` (middleware-protected)
- `GET /admin/unlock` (middleware-protected)

### Server Actions
- `authStart` — Enrollee ID + DOB
- `authByPrincipalNin` — NIN fallback (calls Qore, compares user DOB)
- `submitBeneficiaryNin` — validates NIN, writes Prognosis via outbox
- `adminLogin`, `resolveReviewAction`, `resetMemberAction`

### Outbound calls
| Target                                          | Purpose                                   |
| ----------------------------------------------- | ----------------------------------------- |
| Prognosis `/ApiUsers/Login`                     | Token exchange                            |
| Prognosis `/EnrolleeProfile/GetEnrolleeBioDataByEnrolleeID` | Member lookup                     |
| Prognosis `/EnrolleeProfile/GetEnrolleeDependantsByEnrolleeID` | Dependants list                  |
| Prognosis `/EnrolleeProfile/UpdateMemberData`   | NIN write                                 |
| Prognosis `/Sms/SendSms`                        | OTP delivery (not currently in use)       |
| Prognosis `/EnrolleeProfile/SendEmailAlert`     | Receipt email                             |
| Qore `/<token-endpoint>`                        | OAuth2 client-credentials                 |
| Qore `/<nin-verify-endpoint>/{nin}`             | NIN verification                          |

### What to exercise in a review
1. **Lockout**: three wrong DOBs → should hard-lock for 48 h and email the security-ops address.
2. **Rate-limit**: rapid-fire `/auth` from one IP → 429-equivalent after 10/min.
3. **Session fixation**: modify cookie value → should be rejected by HMAC check (`getSession` returns null).
4. **CSRF**: forge POST to `/auth` without same-origin → Server Action framework rejects.
5. **Replay**: submit same NIN twice with same idempotency key → single Prognosis write, cached response.
6. **Outbox durability**: kill the Render process mid-submit → outbox restores on next drain (in-memory limitation noted above).
7. **PII in logs**: tail logs during a submit → confirm masked NIN, masked name on error paths.

---

## 10. Who to contact

- **Security-ops alerts:** `f-komoni-mbaekwe@leadway.com`
- **Public support (shown to users):** `healthcare@leadway.com`, 07080627051 / 02012801051

---

## 11. Ready for Azure migration

The app is deployment-target agnostic:

- Node 22, standard Next.js 15 production build (`next build` → `next start`).
- No Render-specific APIs.
- `render.yaml` is a blueprint — easy to port to Azure Web App / App Service.
- All secrets are env vars (Azure Key Vault → App Settings references).
- Postgres connection string when added is standard libpq URL → works
  with Azure Database for PostgreSQL.

Provide the same env var set + a valid `DATABASE_URL` (when Phase 3
lands) and the same binary runs on Azure.
