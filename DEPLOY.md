# Deployment runbook — Render

Target: **production** on Render.
Blueprint: `render.yaml` (already in the repo root).
Hosting decision confirmed by client, 17 Apr 2026.

---

## 1. Pre-flight

1. You have a Render account with a team that can create web services
   and managed Postgres.
2. The branch you're deploying from (`main` by default, change in
   `render.yaml` if different) is green in CI.
3. You have these credentials to hand:
   - **Qore (NIMC)** — client id, secret, token URL, verify URL.
   - **Prognosis** — API username + password.
   - **Prognosis NIN-update path** (optional today — default works for
     most deployments; we'll swap when the client confirms).

---

## 2. First-time deploy

1. In the Render dashboard → **New + → Blueprint** → point at this repo.
2. Render reads `render.yaml` and proposes:
   - Web service `lwh-nin-validation` (Node 22, pnpm build).
   - Managed Postgres `lwh-nin-pg`.
3. Click **Apply**. Render auto-generates `AUTH_SECRET`, `ADMIN_SECRET`,
   `OTP_HMAC_SECRET`, and wires `DATABASE_URL`. The first build will
   fail the health check because provider secrets aren't set yet —
   **this is expected**. Proceed to step 3.

---

## 3. Fill in the secrets (Render dashboard → Service → Environment)

Secrets marked `sync:false` in `render.yaml` must be set by hand:

### Qore (NIMC)
```
QORE_TOKEN_URL         = <provided by Qore>
QORE_NIN_VERIFY_URL    = <provided by Qore> (the NIN is appended to this URL)
QORE_CLIENT_ID         = <provided by Qore>
QORE_SECRET_KEY        = <provided by Qore>
```

### Prognosis
```
PROGNOSIS_USERNAME           = <Leadway API user>
PROGNOSIS_PASSWORD           = <Leadway API password>
PROGNOSIS_API_KEY            = <required for write endpoints>
PROGNOSIS_API_KEY_HEADER     = <only if not "X-API-Key">
```

The bearer token from `/ApiUsers/Login` is enough for the READ endpoints
(`GetEnrolleeBioDataByEnrolleeID`, `GetEnrolleeDependantsByEnrolleeID`).
The WRITE endpoint (`UpdateMemberData`) additionally requires an API key
header. Without it Prognosis responds `401 "API Key is missing"`.

### Admin bootstrap
```
ADMIN_BOOTSTRAP_PASSWORD     = <set a strong password>
```

### Optional Phase-2 extras (can be left blank on day-one)
```
TURNSTILE_SITE_KEY           = <Cloudflare>
TURNSTILE_SECRET_KEY         = <Cloudflare>
SENTRY_DSN                   = <Sentry project>
LOG_LEVEL                    = info
```

Click **Save Changes** — Render will redeploy automatically.

---

## 4. Verify the deploy

Once the new deploy is `Live` (Render status badge):

```
# Health check
curl -s https://<your-render-url>/api/healthz | jq

# Expected:
# { "ok": true, "service": "lwh-nin-validation", "mode": "live", "ts": "…" }
```

If `mode` shows `mock`, `NEXT_PUBLIC_MOCKS_ENABLED` is still `true`. Set
it to `false` in the dashboard and redeploy.

### Smoke test in-browser
1. Visit the landing page → click **Start NIN update**.
2. Enter a **real** Leadway enrollee ID (e.g. `21000645/0`) + its DOB.
3. You should see the authenticated household loaded from Prognosis.
4. Enter a real NIN → expect a Qore verification round-trip.
   - `PASS_AUTO` → receipt email sent via Prognosis SendEmailAlert.
   - `REVIEW_SOFT` → row appears in `/admin/reviews`.
   - `FAIL_HARD` → support-ref surfaced.

### Smoke test admin
1. Visit `/admin/login` → use the `ADMIN_BOOTSTRAP_PASSWORD` you set.
2. Review the queue at `/admin/reviews`.
3. Sign out.

---

## 5. Known gaps on day-one

These are tracked in `docs/architecture/open-questions.md` and are
**not deployment blockers**:

- **Prognosis NIN-update endpoint URL.** We default to
  `/EnrolleeProfile/UpdateEnrolleeNIN`. If that path is wrong, a
  `PASS_AUTO` validation will still succeed from the user's
  perspective — we'll park the write in the outbox and retry once
  the path is corrected. No NIMC call is wasted.
- **Support phone / email / hours.** Placeholders appear in the
  support block. Swap in `src/config/app.ts` and redeploy when Leadway
  supplies the real details.
- **Upstash Redis.** The in-memory KV is fine for a single Render
  instance. Set `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`
  before scaling horizontally (Phase 3).
- **Database persistence.** Postgres is provisioned but the app does
  not yet write to it (Phase 3). Rate limits, lockouts, OTP state,
  manual reviews, and the outbox all live in KV today. Nothing that
  survives a restart. This is acceptable for the initial rollout.

---

## 6. Rollback

1. Render dashboard → Service → **Events** → pick the previous
   successful deploy → **Rollback**.
2. Secrets stay intact; only the code is reverted.

---

## 7. Monitoring

Minimum viable: Render's built-in logs + metrics.
- Search for `startup.ready` to confirm the process booted cleanly.
- Search for `audit` to see every sensitive action with its `traceId`.
- Search for `prognosis.update.4xx` to spot NIN-update-endpoint
  misconfiguration (if the client hasn't confirmed the path yet).

Phase 3 adds Sentry + OTel. Slots are already present in `render.yaml`.
