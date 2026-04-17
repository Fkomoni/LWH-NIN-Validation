# LWH-NIN-Validation

Secure NIN Update / Verification System for Leadway Health principal enrollees.
Authenticates the principal, collects NINs for the household, validates them
against NIMC, and syncs verified records into Prognosis.

> **Status:** Phase 1 — foundation + frontend with mocked services.
> Ready for client review. Phase 2 (real integrations) is gated on the
> answers in `docs/architecture/open-questions.md`.

---

## Quick start

```bash
pnpm install
pnpm dev            # http://localhost:3000 — mocks are on by default
pnpm test           # vitest unit tests (38 assertions, 80%+ coverage bar)
pnpm typecheck
pnpm lint
pnpm build
```

All services are mocked in Phase 1 (`NEXT_PUBLIC_MOCKS_ENABLED=true`),
so no external credentials are needed.

---

## Walkthrough

Each enrollee ID exercises one or more edge cases from the brief. Use these
to drive reviews:

| Enrollee ID | DOB          | Scenario                                    |
| ----------- | ------------ | ------------------------------------------- |
| `LWH-0001`  | `1985-06-15` | Happy path — principal + 2 dependants       |
| `LWH-0002`  | `1979-03-22` | Principal with zero dependants              |
| `LWH-0003`  | `1972-11-05` | Dependants already verified (rows disabled) |
| `LWH-0004`  | `1990-01-20` | Duplicate NIN detection (client-side)       |
| `LWH-0005`  | `1988-12-01` | Diacritics + initial-only child → review    |
| `LWH-0006`  | `1980-01-01` | Locked account (generic security message)   |
| `LWH-0007`  | `1984-08-08` | DOB mismatch → validate-with-NIN fallback   |
| `LWH-0008`  | `1993-06-21` | OTP recovery (mock code is always `123456`) |
| `LWH-0009`  | `1987-02-19` | NIMC timeout / 5xx on dependant NIN         |

Principal NINs for the fallback/validate flows:

- `LWH-0001` → NIN `12345678901` (plus beneficiaries `...902`, `...903`)
- `LWH-0007` → NIN `77777777707` (used during the DOB-fallback flow)
- `LWH-0009-D1` → NIN `99999999901` (timeout), `99999999902` (provider error)
- `LWH-0001-D1` → NIN `10000000001` (hard name fail), `10000000002` (DOB mismatch)

The full scenario matrix is in `src/fixtures/scenarios.ts` and the NIMC
fixtures in `src/fixtures/nimc.ts`.

---

## Architecture snapshot

- **Next.js 15 App Router** — Server Components + Server Actions, no public REST
  surface for form flows (CSRF handled by Next).
- **Tailwind + shadcn/ui** — brand tokens driven by CSS vars (`src/app/globals.css`),
  confirmed colour + font choices per `docs/brand/tokens.md`.
- **Typed service layer** — `src/services/` holds interfaces; Phase 1 ships
  in-memory mock implementations, Phase 2 swaps real clients behind the same
  interfaces without UI changes.
- **Pure validation** — `src/lib/validation/` (NIN format, Jaro-Winkler,
  name normalisation, DOB equality) is the primary coverage target.
- **Signed-cookie session** — `src/server/session.ts` (HMAC-SHA256).
  NextAuth v5 lands in Phase 2.
- **Structured logging** — `src/lib/logger.ts` + `src/lib/mask.ts`: every
  PII field is auto-masked at the log boundary.
- **Audit trail** — `src/server/audit.ts` writes structured events today
  (stdout), Postgres in Phase 3.

Flow diagrams (mermaid): `docs/architecture/architecture.md`.

---

## Repository layout

```
.
├── .github/workflows/ci.yml           # lint → typecheck → test → build
├── docs/
│   ├── architecture/                  # diagrams, folder layout, open qs
│   ├── brand/                         # Mini Manual PDF + extracted tokens
│   └── prisma/schema.draft.prisma     # data model for Phase 2
├── public/brand/leadway-logo.png
└── src/
    ├── app/                           # Router + pages (auth, verify, household, done)
    ├── components/
    │   ├── brand/                     # Logo, Stepper, StatusChip
    │   ├── layout/                    # PageShell, SupportBlock, ConsentBanner
    │   └── ui/                        # shadcn primitives
    ├── config/app.ts                  # single source of runtime policy
    ├── fixtures/                      # deterministic test / demo data
    ├── lib/                           # cn, ids, logger, mask, validation/
    ├── schemas/                       # Zod — every form + payload
    ├── server/                        # session, audit, Server Actions
    ├── services/                      # typed interfaces + mock impls
    └── types/domain.ts
```

---

## Configurable policy (all in `src/config/app.ts`)

- **Lockout:** 3 failed attempts in a rolling 1 h window → 48 h hard lock.
- **Rate limits:** auth 10/min/IP, NIN validate 5/h/enrollee, OTP 3/h/phone.
- **OTP:** 6 digits, 5 min TTL, 30 s cooldown, max 3 resends.
- **Session:** 15 min idle, 30 min absolute.
- **Name match:** ≥ 0.92 auto-pass, 0.80–0.92 manual review, <0.80 fail.
- **Support contact + security-ops email:** TODO(client) placeholders.

---

## What's still open

See `docs/architecture/open-questions.md`. Before Phase 2 I need:

1. NIMC provider + API docs.
2. Prognosis API docs + field mapping + auth method.
3. Member-lookup API or DB access.
4. SMS/email provider credentials.
5. Real security-ops email + support contact details.
6. Licensed Leadway webfont (or keep Inter fallback).
7. Semantic palette (success / warning / error / info) confirmation.
8. Transactional copy templates (OTP SMS/email, lockout notice, success).

## Tech stack (locked)

Next.js 15 · TypeScript (strict) · Tailwind 3 + shadcn/ui + Radix ·
RHF + Zod · Prisma + Postgres (Phase 2+) · Auth.js v5 (Phase 2+) ·
Upstash Redis (Phase 2+) · Cloudflare Turnstile (Phase 2+) ·
Resend / Termii (Phase 2+) · MSW (Phase 1 mocks) ·
Sentry + pino + OpenTelemetry · Vitest + Playwright · GitHub Actions CI.
