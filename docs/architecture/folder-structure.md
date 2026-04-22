# Proposed Folder Structure

```
.
├── docs/
│   ├── architecture/
│   │   ├── architecture.md
│   │   ├── folder-structure.md
│   │   └── open-questions.md
│   ├── brand/
│   │   ├── leadway-mini-manual.pdf
│   │   └── tokens.md
│   └── prisma/
│       └── schema.draft.prisma
│
├── public/
│   └── brand/
│       └── leadway-logo.png
│
├── prisma/
│   ├── schema.prisma            # promoted from docs/prisma/ after sign-off
│   └── migrations/
│
├── src/
│   ├── app/                     # Next.js App Router
│   │   ├── (marketing)/         # landing / consent page
│   │   ├── (portal)/            # authenticated stepper
│   │   │   ├── auth/            # step 1: enrolleeId + DOB
│   │   │   ├── verify/          # step 1b: DOB mismatch fallback (NIN or OTP)
│   │   │   ├── household/       # step 2: beneficiary list
│   │   │   ├── submit/          # step 3-4: NIN input + validate
│   │   │   └── done/            # step 5: summary
│   │   ├── (admin)/
│   │   │   └── admin/           # ops console, role-gated
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/route.ts
│   │   │   ├── otp/request/route.ts
│   │   │   ├── otp/verify/route.ts
│   │   │   ├── member/lookup/route.ts
│   │   │   ├── nin/validate/route.ts
│   │   │   ├── nin/submit/route.ts
│   │   │   └── admin/…
│   │   ├── layout.tsx
│   │   ├── globals.css
│   │   └── providers.tsx
│   │
│   ├── components/
│   │   ├── ui/                  # shadcn primitives (button, input, form, …)
│   │   ├── brand/               # Logo, BrandMark, Stepper, StatusChip
│   │   ├── forms/               # EnrolleeAuthForm, OtpForm, NinRowForm, …
│   │   └── layout/              # SupportBlock, ConsentBanner, PageShell
│   │
│   ├── lib/
│   │   ├── auth/                # NextAuth config, session helpers
│   │   ├── csrf.ts
│   │   ├── turnstile.ts
│   │   ├── crypto/              # envelope encrypt/decrypt, hmac
│   │   ├── logger.ts            # pino + maskPii
│   │   ├── mask.ts              # maskNin, maskPhone, maskName
│   │   ├── rateLimit.ts         # Upstash sliding window
│   │   ├── lockout.ts           # 1h window + 48h hard lock
│   │   ├── idempotency.ts
│   │   ├── otel.ts
│   │   └── validation/
│   │       ├── nin.ts           # 11-digit format
│   │       ├── dob.ts
│   │       ├── jaroWinkler.ts   # pure fn (≥80% tested)
│   │       └── nameNormalise.ts # strip titles/diacritics
│   │
│   ├── services/                # typed interfaces + implementations
│   │   ├── types.ts
│   │   ├── MemberService/
│   │   │   ├── index.ts
│   │   │   ├── mock.ts          # Phase 1
│   │   │   └── real.ts          # Phase 2
│   │   ├── NinService/
│   │   ├── OtpService/
│   │   ├── PrognosisService/
│   │   └── NotificationService/
│   │
│   ├── server/                  # server-only orchestration
│   │   ├── auth/                # DOB auth, NIN-fallback, OTP flows
│   │   ├── nin/                 # submit orchestrator (retry, idem)
│   │   ├── prognosis/           # upsert + outbox/retry
│   │   ├── audit/               # append-only log writer
│   │   └── admin/               # manual review, unlock, export
│   │
│   ├── schemas/                 # Zod schemas per form / payload
│   │   ├── auth.ts
│   │   ├── otp.ts
│   │   ├── nin.ts
│   │   └── admin.ts
│   │
│   ├── fixtures/                # deterministic test data
│   │   ├── members.ts
│   │   ├── beneficiaries.ts
│   │   ├── nimcResponses.ts
│   │   └── scenarios.ts         # edge-case matrix
│   │
│   ├── mocks/                   # MSW (Phase 1 only)
│   │   ├── handlers.ts
│   │   ├── browser.ts
│   │   └── server.ts
│   │
│   ├── styles/
│   │   └── tokens.css           # CSS variables from tokens.md
│   │
│   └── types/
│       └── domain.ts            # Member, Beneficiary, ValidationResult…
│
├── tests/
│   ├── unit/                    # vitest
│   ├── integration/             # route handlers w/ MSW
│   └── e2e/                     # playwright
│
├── .github/workflows/
│   └── ci.yml                   # lint → typecheck → test → build
│
├── .env.example
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── README.md
```

Guiding rules:

- **`services/` are the only place that talk to external systems.** Route
  handlers and Server Actions call services — never `fetch` directly.
- **`server/` orchestrates**; it may call multiple services and write the
  audit log, but must not contain raw HTTP adapters.
- **`lib/validation/` contains pure functions only.** These are the
  primary targets for the ≥80% coverage bar.
- **`schemas/` is the single source of truth for request shapes** on
  both the client (RHF resolver) and the server (route handler parse).
- **`mocks/` disappears in Phase 2** (or is wired behind `NODE_ENV=test`).
