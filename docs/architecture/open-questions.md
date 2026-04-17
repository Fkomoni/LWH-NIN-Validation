# Open Questions — blockers before Phase 1 scaffolding

Grouped by theme. Each item is a **hard blocker** for the corresponding
module unless I note otherwise.

---

## A. Integrations

### A1. NIMC (NIN Validation)
- Which NIMC provider/aggregator are we using? (VerifyMe / Dojah / Prembly
  / YouVerify / direct NIMC SVS?)
- API reference URL + sandbox credentials.
- Auth method (API key / OAuth2 client credentials / mTLS).
- Sample request and full sample success + failure responses.
- Rate limits we are subject to.
- SLA / expected latency (informs our 5 s p95 + retry/timeout budget).
- Whether the provider returns DOB and a "verifiedFullName" or only a hash.
- Cost per call / monthly quota, if we need to throttle defensively.

### A2. Prognosis (core policy system)
- API reference URL / on-prem endpoint + auth method.
- Exact **field mapping** for the update payload — we need the real field
  names, not guesses. My draft payload is:
  `{ memberId, nin, verifiedFullName, dobFromNin, validationStatus,
     validatedAt, source, txnRef, rawResponseRef }`.
- Idempotency contract: does Prognosis honour a client-supplied
  `txnRef` / `Idempotency-Key`, or must we implement server-side dedupe?
- Error taxonomy and retry guidance.
- Is it reachable from Vercel egress IPs, or do we need a VPC/VPN peer?

### A3. Member lookup
- Direct Postgres read against Leadway DB, **or** a REST endpoint?
- If DB: connection details (read-only creds, SSL, allowed CIDR).
- If API: reference + auth + sample response.
- Definition of "Enrollee ID" format (length, checksum rules).
- Source-of-truth for DOB, phone, email per member.

### A4. Messaging providers
- SMS: Termii vs. Africa's Talking — which account?
- Sender ID(s) for OTP and for security alerts.
- Templates that have been pre-approved with NCC (if required).
- Email: Resend vs. SMTP relay — confirm domain + DKIM/SPF records ready.
- From‑address for transactional and for security alerts.

---

## B. Security & policy

### B1. Security alert email
- Confirm recipient: `leadway_security_ops@leadway.com`? (the brief says
  "CONFIRM ADDRESS WITH ME"). Primary + CC list?
- Frequency cap to avoid mailbox flood on a password-spray event?

### B2. Lockout window
- Brief says "3 failed attempts in a **rolling 1-hour** window → 48-hour
  lock". Confirm 1‑hour (not 24‑hour). Confirm we surface a generic
  security message (never "you are locked for 48h").

### B3. Name‑match thresholds
- Confirm:
  - ≥ 0.92 → auto‑pass
  - 0.80 – 0.92 → manual review
  - < 0.80 → fail
- Are these tunable at runtime, or baked?

### B4. Data protection
- Who owns the KMS keys? (Vercel env + Doppler? AWS KMS?) This determines
  the crypto setup in `lib/crypto/`.
- Retention: audit ≥ 12 months — is that 12 **exactly** (then delete) or
  archive after 12?
- PII scope we must mask in logs: confirm NIN (last 3), phone (middle),
  names on error paths, email, DOB? Anything else?

### B5. Consent / NHIA notice
- Exact consent copy to display on step 1 (we need a Leadway‑approved
  version). Draft copy is acceptable as a placeholder only.

### B6. Browser / device support
- Confirmed: last 2 of Chrome/Safari/Edge/Firefox + iOS Safari 15+.
  Any Android baseline? Any requirement to work inside a Leadway mobile
  app WebView?

---

## C. Product / UX

### C1. Support contact block
- Support phone number, email, and hours shown on every failure state.

### C2. Status chip vocabulary
- The brief lists seven statuses. Any localisation needed (English only?).
- Preferred user-facing label vs. internal state name.

### C3. Stepper copy
- Step titles and microcopy — any brand-approved wording?

### C4. Post-success behaviour
- Receipt email after a successful household update: yes/no? Contents?
- Do we show a downloadable PDF/receipt of what was validated?

### C5. Admin console scope in Phase 4
- Manual review queue (required).
- Unlock user (required).
- Export (CSV? XLSX? column list?).
- Search filters (by enrolleeId, status, date range, NIN hash?).
- Roles & who assigns them.

---

## D. Brand tokens missing from the Mini Manual

See `docs/brand/tokens.md` §9 for the full list. Summary of hard blockers
for UI work:

1. Semantic colour set (success / warning / error / info).
2. Primary‑CTA colour: **red** (#C61531) or **orange** (#F15A24)?
3. Licensed **Leadway** webfont `.woff2` files, or approved fallback.
4. Type scale (or approval of the draft in `tokens.md` §2.3).
5. Spacing scale (or approval of the draft in `tokens.md` §3).
6. Border radius defaults (or approval of the draft in `tokens.md` §4).
7. Shadow ramp (or approval of the draft in `tokens.md` §5).
8. Button variant spec.
9. Transactional copy (OTP SMS/email, lockout notice, success, failure).
10. Vector (SVG) copy of the logo + symbol mark.

---

## E. Infra / deployment

- Target hosting: Vercel (assumed) — confirmed?
- Postgres host: Neon / Supabase / managed RDS?
- Redis: **Upstash** confirmed?
- Error tracking: **Sentry** DSN who owns the project?
- Observability backend for OTel traces (Honeycomb / Grafana Cloud / Datadog)?

---

I will **not** scaffold Phase 1 until I have at least:

- **B1, B2, B3** (security policy confirmations),
- **D2, D3, D9** (CTA colour, webfont, transactional copy), and
- **C1** (support contact details to hard-wire into the shell).

Everything else can be parked with a `// TODO(phase-1): await client`
marker and stubbed with MSW.
