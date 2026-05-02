# Handover — Azure deployment

Target: **Azure App Service (Linux, Node 20 LTS)**.
This document is the single reference Leadway IT needs to deploy the
LWH NIN Validation Portal onto Azure. For the Render blueprint we were
running during Phase 1, see `DEPLOY.md` — the env-var list is the same
but the hosting steps differ.

---

## 1. Runtime requirements

| Requirement      | Value                                                |
| ---------------- | ---------------------------------------------------- |
| Node.js          | **20 LTS or newer** (22 is fine)                     |
| Package manager  | **pnpm 9+** (`corepack enable` on the build agent)   |
| OS               | Linux                                                |
| Memory           | 512 MB minimum, 1 GB recommended                     |
| Build command    | `pnpm install --frozen-lockfile && pnpm build`       |
| Start command    | `pnpm start` (runs `next start` on `$PORT`)          |
| Health endpoint  | `GET /api/healthz` → 200 `{ ok: true, … }`           |

Azure sets `PORT` automatically — Next.js picks it up, no override
needed. `Always-on` must be enabled in App Service settings, otherwise
the platform idle-sleeps the instance and the in-memory KV warning
returns.

> **Do not target Azure Static Web Apps.** The app uses Server Actions,
> middleware, and server-only code paths that SWA does not fully
> support.

---

## 2. Recommended hosting shape

**Azure App Service for Linux — Node 20 LTS runtime.** Single instance
on a B1 or S1 tier is more than enough for the expected load (member
self-service, low QPS).

Alternatively, **Azure Container Apps** works if Leadway prefers a
container-based deploy. No `Dockerfile` ships in the repo today — IT
can author a simple one (`FROM node:20-alpine`, `RUN corepack enable`,
copy source, `pnpm install --frozen-lockfile`, `pnpm build`,
`CMD ["pnpm", "start"]`).

Required App Service settings:

- **Startup command**: `pnpm start`
- **Always On**: **enabled**
- **HTTPS Only**: **enabled**
- **Minimum TLS version**: **1.2**
- **Custom domain + managed certificate** (or bring-your-own cert).

---

## 3. External dependencies IT must provision

| Service                             | Purpose                                                              |
| ----------------------------------- | -------------------------------------------------------------------- |
| Upstash Redis (free tier is fine)   | Lockout counters, session revocation denylist, rate-limit windows    |
| Qore (NIMC provider)                | NIN verification lookups                                             |
| Prognosis (Leadway core system)     | Member data reads, NIN writes, email + SMS sends                     |

> **Redis adapter note.** The app ships an **Upstash REST adapter**
> only. If Leadway insists on **Azure Cache for Redis** (standard
> Redis protocol), a second adapter is needed (~30 lines using the
> `ioredis` package). Simplest path: keep Upstash. Upstash REST is
> Azure-region-agnostic and the free tier handles 10 000 commands/day
> — more than enough for this workload.

---

## 4. Environment variables

Paste the list below into **App Service → Configuration → Application
settings**. Values marked `<fill in>` must be supplied.

```
# App mode — MUST be false in production
NEXT_PUBLIC_MOCKS_ENABLED=false
NODE_ENV=production

# Secrets — generate fresh with `openssl rand -base64 48`
AUTH_SECRET=<fill in — 48 random bytes>
ADMIN_SECRET=<fill in — 48 random bytes>
OTP_HMAC_SECRET=<fill in — 48 random bytes>
ADMIN_BOOTSTRAP_PASSWORD=<fill in — strong password, used once at /admin/login>

# Upstash Redis — REQUIRED in production
UPSTASH_REDIS_REST_URL=<from console.upstash.com>
UPSTASH_REDIS_REST_TOKEN=<from console.upstash.com>

# Qore (NIMC)
QORE_TOKEN_URL=<Qore-provided OAuth token URL>
QORE_NIN_VERIFY_URL=<Qore-provided verify URL — the NIN is appended>
QORE_CLIENT_ID=<Qore-provided>
QORE_SECRET_KEY=<Qore-provided>

# Prognosis (Leadway core)
PROGNOSIS_BASE_URL=https://prognosis-api.leadwayhealth.com/api
PROGNOSIS_USERNAME=<Leadway API user>
PROGNOSIS_PASSWORD=<Leadway API password>

# Optional — only set if Leadway adds a gateway key later
PROGNOSIS_API_KEY=
PROGNOSIS_API_KEY_HEADER=

# Optional — Phase-2 extras
TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
SENTRY_DSN=
LOG_LEVEL=info

# Postgres — optional today, required in Phase 3
DATABASE_URL=
```

> **Never commit any populated `.env` file.** All secrets live in App
> Service configuration. The repo only ships `.env.example`.

---

## 5. Outbound network / firewall rules

The App Service instance needs outbound **HTTPS (443)** to:

- `*.upstash.io` — Redis REST API
- Qore-provided hostnames — NIMC verification (Qore shares the exact
  hosts with their credentials)
- `prognosis-api.leadwayhealth.com` — Leadway core API
- Azure Monitor / Application Insights endpoints, if wired up

No inbound rules beyond the App Service default HTTPS listener.

---

## 6. First-deploy checklist

1. Zip deploy (or GitHub Action / Azure DevOps pipeline) the source
   tree into the App Service.
2. Set every env var from §4. Save → the platform restarts.
3. Watch the log stream for `startup.ready`.
4. Health check:
   ```
   curl -s https://<hostname>/api/healthz | jq
   # Expected: { "ok": true, "service": "lwh-nin-validation", "mode": "live", … }
   ```
   If `mode` shows `mock`, `NEXT_PUBLIC_MOCKS_ENABLED` is still `true`
   — flip and redeploy.
5. Browser smoke test:
   - Landing page → **Start NIN update** → submit a real enrollee ID
     + DOB → the household should load from Prognosis.
   - Submit a real NIN → expect a Qore round-trip + the
     appropriate outcome card.
6. Admin smoke test:
   - Visit `/admin/login` → sign in with `ADMIN_BOOTSTRAP_PASSWORD`.
   - Verify `/admin/reviews` and `/admin/unlock` load.

---

## 7. Operational runbook

- **Admin console**: `https://<hostname>/admin/login`
- **Reset a locked member**: `/admin/unlock` — paste the Enrollee ID
  (e.g. `21000645/0`) and click **Reset member state**. Clears the
  48-hour lock, the failure counter, the NIN-validate rate limit, and
  any pending OTP state.
- **Manual review queue**: `/admin/reviews` — soft-match NIN
  submissions land here for a human decision.
- **Logs**: structured JSON (pino). Useful searches:
  - `audit` — every sensitive action (with `traceId` for correlation)
  - `startup.ready` — confirms clean boot
  - `prognosis.update.*` — NIN-update endpoint results
  - `kv.memory-in-prod` — red flag that Upstash env vars are missing
  - `auth.locked.set` — lockouts hit
  - `nin.comparison` — name/DOB match diagnostics
- **Rollback**: redeploy the previous artifact from App Service
  **Deployment Center** → **Deployment history**. Secrets are
  preserved across rollbacks.
- **Scale up**: App Service → Scale up (tier change) or Scale out
  (more instances). Multi-instance is safe — all shared state lives in
  Upstash, not in local memory.

---

## 8. Known gaps on day-one

Tracked in `docs/architecture/open-questions.md`. None block the
launch:

- **Prognosis NIN-update endpoint URL.** We default to
  `/EnrolleeProfile/UpdateMemberData`. If Leadway later confirms a
  different path, a `PASS_AUTO` validation still succeeds from the
  user's perspective — the write parks in the outbox and retries
  once the path is corrected. No NIMC call is wasted.
- **Support phone / email / hours.** Live in `src/config/app.ts`.
- **Postgres persistence.** Provisioned but not yet written to
  (Phase 3). Reviews + outbox live in Upstash today.

---

## 9. Security posture summary

Full posture doc: `SECURITY.md`. Highlights:

- Signed-cookie session (HMAC-SHA256) + server-side `sid` revocation
  denylist in Redis — logout invalidates an intercepted cookie
  immediately.
- Per-enrollee lockout: 3 failed attempts → 48-hour lock.
- Per-IP sliding soft-lock: 10 fails / 10 min / IP → 30-min block
  (covers credential stuffing across accounts).
- Rate limits: 5 auth attempts / min / IP; 5 NIN validations / hour /
  enrollee; 3 OTPs / hour / phone.
- All PII auto-masked at the log boundary.
- Zod schemas on every form + server-action boundary.
- SameSite=strict cookies; CSRF handled by Next's Server Actions
  contract.

---

## 10. Support contact

For deployment questions, reach out to the development team. Source of
truth for the code is the branch `claude/nin-verification-system-iyLLh`.
