# LWH-NIN-Validation

Secure NIN Update / Verification System for Leadway Health principal enrollees.
Authenticates the principal, collects NINs for the household, validates them
against NIMC, and syncs verified records into Prognosis.

> **Status:** Phase 0 — brand tokens extracted, architecture proposed,
> awaiting client sign-off on open questions before scaffolding Phase 1.

## Repository layout (so far)

```
docs/
├── architecture/
│   ├── architecture.md        # mermaid diagrams + prose design
│   ├── folder-structure.md    # proposed src/ layout
│   └── open-questions.md      # blockers for Phase 1
├── brand/
│   ├── leadway-mini-manual.pdf
│   └── tokens.md              # extracted colour / typography tokens
└── prisma/
    └── schema.draft.prisma    # proposed data model
public/
└── brand/
    └── leadway-logo.png
```

## What needs the client's input

See **`docs/architecture/open-questions.md`**. Hard blockers for scaffolding:

- Security policy confirmations (lockout window, name-match thresholds,
  security-alert recipient).
- Brand: primary-CTA colour, licensed Leadway webfont (or fallback), and
  transactional copy.
- Support contact details to hard-wire into the page shell.

Everything else can be parked behind MSW mocks during Phase 1.

## Tech stack (locked)

Next.js 15 · TypeScript (strict) · Tailwind + shadcn/ui · RHF + Zod ·
Prisma + Postgres · Auth.js (NextAuth v5) · Upstash Redis ·
Cloudflare Turnstile · Resend / Termii · MSW · Sentry + pino + OTel ·
Vitest + Playwright · GitHub Actions CI.
