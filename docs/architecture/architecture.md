# LWH NIN Verification — Proposed Architecture

Status: **Draft for review** (pre‑Phase‑1). No code is written yet.
All external integrations are **mocked behind TypeScript interfaces** in
Phase 1 per the brief.

---

## 1. High‑level system context

```mermaid
flowchart LR
    subgraph User["Principal enrollee (browser, mobile-first)"]
      U["Web UI\n(Next.js 15 RSC + Client Components)"]
    end

    subgraph Edge["Edge / Vercel"]
      MW["Middleware\n(CSRF, auth session, rate‑limit headers)"]
      TS["Cloudflare Turnstile\n(bot check, server verify)"]
    end

    subgraph App["Next.js Route Handlers / Server Actions"]
      RH_AUTH["/api/auth/*"]
      RH_OTP["/api/otp/*"]
      RH_LOOKUP["/api/member/lookup"]
      RH_NIN["/api/nin/validate"]
      RH_SUBMIT["/api/nin/submit"]
      RH_ADMIN["/api/admin/*"]
    end

    subgraph Services["Domain services (typed interfaces)"]
      MS["MemberService\n(lookup, DOB compare)"]
      NS["NinService\n(format + NIMC wrapper)"]
      OS["OtpService\n(generate / verify)"]
      PS["PrognosisService\n(idempotent upsert)"]
      NO["NotificationService\n(email + SMS)"]
      AS["AuditService\n(append‑only log)"]
      RL["RateLimit + Lockout\n(Redis)"]
    end

    subgraph Data["Stateful infra"]
      PG[(Postgres\nPrisma)]
      RD[(Redis / Upstash\nOTP, lockouts, idempotency)]
      SN[(Sentry)]
      LG[(Log sink / OTel)]
    end

    subgraph Ext["External systems (mocked in Phase 1 via MSW)"]
      NIMC[NIMC API]
      PROG[Leadway Prognosis]
      MEMDB["Leadway Member DB\n/ Core API"]
      SMS[Termii / AT]
      EML[Resend / SMTP]
    end

    U --> MW --> RH_AUTH
    U --> TS
    MW --> RH_OTP
    MW --> RH_LOOKUP
    MW --> RH_NIN
    MW --> RH_SUBMIT
    MW --> RH_ADMIN

    RH_AUTH --> MS
    RH_AUTH --> RL
    RH_AUTH --> AS
    RH_OTP  --> OS --> NO --> SMS
    RH_LOOKUP --> MS --> MEMDB
    RH_NIN --> NS --> NIMC
    RH_NIN --> AS
    RH_SUBMIT --> NS
    RH_SUBMIT --> PS --> PROG
    RH_SUBMIT --> NO --> EML
    RH_SUBMIT --> AS
    RH_ADMIN --> AS
    RH_ADMIN --> PS

    MS --> PG
    OS --> RD
    RL --> RD
    PS --> PG
    AS --> PG

    App -. traces .-> LG
    App -. errors .-> SN
```

### Why this shape
- **Next.js App Router + Server Actions / Route Handlers** keeps the bot
  surface small (no public GraphQL), centralises auth, and lets us stream
  progress per beneficiary.
- **Domain services with typed interfaces** is the boundary the brief
  mandates (MemberService / NinService / OtpService / PrognosisService /
  NotificationService). Phase 1 implementations are MSW‑backed fakes;
  Phase 2 swaps the impls without touching the UI.
- **Redis for ephemeral state** (OTP codes, 48‑h lockouts, idempotency
  keys, IP rate limits) keeps Postgres transactional surface small.
- **Append‑only audit log in Postgres** with a `traceId` joining every
  sensitive action. 12‑month retention; PII masked at write time.

---

## 2. Auth / lockout state machine

```mermaid
stateDiagram-v2
    [*] --> Unauthenticated
    Unauthenticated --> AwaitingDob: Enter EnrolleeID
    AwaitingDob --> Authenticated: DOB matches
    AwaitingDob --> DobMismatch: DOB wrong (fail++)
    DobMismatch --> AwaitingDob: Retry DOB
    DobMismatch --> AwaitingPrincipalNin: Choose "validate with NIN"
    DobMismatch --> AwaitingOtp: Choose "OTP to phone"
    AwaitingPrincipalNin --> Authenticated: NIMC DOB matches
    AwaitingPrincipalNin --> DobMismatch: NIMC DOB mismatch (fail++)
    AwaitingOtp --> Authenticated: OTP verified
    AwaitingOtp --> AwaitingOtp: Resend (≤3, 30s cooldown)
    AwaitingOtp --> DobMismatch: OTP exhausted (fail++)
    DobMismatch --> Locked: fail count ≥ 3 in 1h
    Locked --> [*]: 48h TTL + security email
    Authenticated --> SessionExpired: idle 15m / abs 30m
    SessionExpired --> Unauthenticated
```

Failure counter key: `lock:{enrolleeId}` in Redis, 1‑hour sliding window.
Lock key: `lock:{enrolleeId}:hard`, 48‑hour TTL. IP throttle key:
`rl:auth:{ip}`, 10/min sliding.

---

## 3. NIN submission sequence (happy path + retry)

```mermaid
sequenceDiagram
    autonumber
    actor Principal
    participant UI
    participant API as /api/nin/submit
    participant NS as NinService
    participant NIMC
    participant PS as PrognosisService
    participant PG as Postgres
    participant AS as AuditService
    participant N as NotificationService

    Principal->>UI: Enter NIN for beneficiary B
    UI->>API: POST {enrolleeId, beneficiaryId, nin, idemKey}
    API->>AS: append "nin.submit.requested"
    API->>NS: validateFormat(nin)
    API->>NS: lookup(nin)
    NS->>NIMC: GET /verify/{nin} (retry w/ jitter, 3×, ≤5s total)
    NIMC-->>NS: {name, dob, ...}
    NS-->>API: {score: jaroWinkler(name,...), dobMatch}
    alt score ≥ 0.92 && dobMatch
      API->>PS: upsertMemberNin(payload, idemKey)
      PS->>PG: transaction (write + audit)
      PS-->>API: ok
      API->>N: send "validated" email
      API-->>UI: {status: "Validated"}
    else 0.80 ≤ score < 0.92
      API->>PG: enqueue manual review
      API-->>UI: {status: "Manual Review"}
    else
      API-->>UI: {status: "Failed", supportRef}
    end
    API->>AS: append final outcome
```

Idempotency: the same `idemKey` + `nin` replay returns the original
result without a second NIMC call or a duplicate Prognosis write.

---

## 4. Trust boundaries and PII handling

| Boundary                    | Data in motion                | Protection                                    |
| --------------------------- | ----------------------------- | --------------------------------------------- |
| Browser ⇄ Edge              | Session cookie, form data     | TLS 1.3, HSTS, secure/httpOnly/sameSite=lax  |
| Edge ⇄ Next handlers        | Same                          | CSRF token (double‑submit), Turnstile verify  |
| Handlers ⇄ NIMC             | NIN, DOB                      | mTLS / signed headers (TBC w/ provider)       |
| Handlers ⇄ Prognosis        | memberId, NIN, verifiedName   | Service‑to‑service auth (TBC), mTLS if avail  |
| Handlers ⇄ Postgres         | Encrypted columns (NIN, phone)| AES‑256‑GCM envelope; keys from KMS/env       |
| Logs                        | Never raw NIN/phone/email     | `maskPii()` at the log boundary               |

Encrypted columns: `member.nin`, `member.phone`, `otp.codeHash`,
`audit.payload` (if it may contain PII). Deterministic hash for lookup
keys (`nin_lookup_hash`).

---

## 5. Phase 1 mock strategy (MSW)

- A single `mocks/handlers.ts` wires fake NIMC / Prognosis / Member DB /
  SMS / Email endpoints.
- Scenario cookies (`x-mock-scenario=nimc-timeout` etc.) flip fixtures
  per request so we can exercise every edge case from the brief.
- Deterministic fixtures in `mocks/fixtures/*.ts` include the twelve edge
  cases called out in the spec (zero dependants, NIMC 5xx, married
  surname, diacritics, partial success, OTP expired, locked retry, …).

---

## 6. Observability

- **pino** JSON logs with `traceId`, `sessionId?`, `enrolleeIdHash`,
  `route`, `latencyMs`, `outcome`. PII‑masking helper is the only
  permitted way to include user data in a log line.
- **OpenTelemetry** tracer; spans around every external call
  (NIMC / Prognosis / SMS / email / DB tx).
- **Sentry** for unhandled exceptions; scrubber drops NIN/phone/DOB.

---

## 7. Non‑functional targets traced to design

| Target                                | How met                                        |
| ------------------------------------- | ---------------------------------------------- |
| Auth p95 < 1.5 s                      | Redis‑backed lookups, no external calls on login path |
| NIN validate p95 < 5 s                | 3× retry w/ jitter budget = 4 s; circuit breaker |
| OTP delivery < 30 s                   | Async send, but surface "sent" only after provider 2xx |
| ≥ 80% coverage on services / validation | Isolated pure functions + vitest + fixtures  |
| Session 15 m idle / 30 m absolute     | NextAuth v5 JWT with both TTLs                 |
| Rate limits                           | Upstash Redis sliding-window counters          |

---

## 8. What this design is **not** yet committing to

- The exact NIMC/Prognosis API shapes — placeholders in interfaces
  until docs are received (see `open-questions.md`).
- Choice of KMS (Vercel env vs. AWS KMS vs. Infisical) — depends on
  where we deploy.
- Whether admin console is same app (route group) or a separate one —
  defaulting to a `/admin` route group protected by role.
