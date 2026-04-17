# Open Questions — status

Updated: 17 Apr 2026.
Resolved items are struck through with a ✅; outstanding items carry ⚠️.

---

## A. Integrations

### A1. NIMC — ✅ resolved (provider: Qore / QoreID)
- Token endpoint: `QORE_TOKEN_URL` (POST) — body `{clientId, secret}` → `{accessToken}`.
- Verify endpoint: `${QORE_NIN_VERIFY_URL}${nin}` (POST, Bearer token) — body `{firstname, lastname}`.
- Implemented in `src/services/http/QoreIdClient.ts` with 50-min token cache, abort-based timeout, and resilient field extraction (accepts multiple casings for name/DOB).

### A2. Prognosis (core policy system) — ⚠️ **partial**
- ✅ Login: `POST {base}/ApiUsers/Login`
- ✅ Read: `/EnrolleeProfile/GetEnrolleeBioDataByEnrolleeID?enrolleeid=…`
- ✅ Read: `/EnrolleeProfile/GetEnrolleeDependantsByEnrolleeID?enrolleeid=…`
- ⚠️ **Write** — the Prognosis endpoint for updating a verified NIN on
  an enrollee record has NOT been confirmed. `realPrognosisService`
  currently posts to `PROGNOSIS_NIN_UPDATE_PATH` (default
  `/EnrolleeProfile/UpdateEnrolleeNIN`) and treats 4xx as a config
  error so the outbox parks the write safely. **Please send the real
  endpoint URL + payload field names.**

### A3. Member lookup — ✅ resolved
Using Prognosis read endpoints above. Enrollee ID format is `NNNNNNNN/N`
(principal / dependant). Schema updated to accept slashes.

### A4. Messaging — ✅ resolved (Prognosis SMS + Email APIs)
- SMS: `POST {base}/Sms/SendSms`, body
  `{To, Message, Source, SourceId, TemplateId, PolicyNumber, ReferenceNo, UserId}`
- Email: `POST {base}/Email/SendEmail` (path assumed; body confirmed)
  `{EmailAddress, CC, BCC, Subject, MessageBody, Attachments, Category,
    UserId, ProviderId, ServiceId, Reference, TransactionType}`
- Implemented in `src/services/http/PrognosisNotifyClient.ts`.
- ⚠️ Minor: please confirm the exact Email path and the correct
  `TemplateId` for the OTP SMS.

---

## B. Security & policy

- ✅ **B1 Security-alert email recipient** — `f-komoni-mbaekwe@leadway.com`
- ✅ **B2 Lockout window** — 3 failed attempts / rolling 1h → 48h hard lock
- ✅ **B3 Name-match thresholds** — 0.80 fail threshold (3-tier
  auto/review/fail retained: ≥0.92 auto-pass, 0.80–0.92 manual review, <0.80 fail)
- ✅ **B4 Secrets store** — Render env
- ⚠️ **B5 Consent copy** — our placeholder text is confirmed acceptable;
  NHIA notice wording to be updated later by client
- ⚠️ **B6 Browser support** — assumed last 2 Chrome/Safari/Edge/Firefox
  + iOS Safari 15+; no Android baseline named

---

## C. Product / UX

- ✅ **C1 Support contact** — to render, but exact phone/email/hours not
  yet supplied. Still shows placeholder in `src/config/app.ts`.
- ✅ **C2 Status chip vocabulary** — using spec vocabulary verbatim
- ✅ **C3 Stepper copy** — brand-neutral copy confirmed acceptable
- ✅ **C4 Post-success behaviour** — receipt email YES, downloadable PDF NO
  (implemented; `appConfig.sendReceiptEmail = true`)
- ✅ **C5 Admin console scope** — manual review, unlock, CSV export, no other filters

---

## D. Brand tokens

- ✅ **D1 Semantic palette** — approved (success / warning / error / info
  defaults stay as set in `globals.css`)
- ✅ **D2 Primary-CTA colour** — Leadway Red
- ✅ **D3 Webfont** — Inter fallback stays (no licensed Leadway webfont)
- ✅ **D4 Logo** — JPEG-in-PNG stays (no SVG)
- ✅ **D5 Other tokens** — current defaults confirmed

---

## E. Infra / deployment

- ✅ **E1 Hosting** — Render (not Vercel). `render.yaml` added.
- ✅ **E2 Postgres** — Render managed Postgres (auto-wired via blueprint)
- ⚠️ **E3 Redis** — not yet decided. KV layer abstracts it; in-memory
  works on Render single-instance; Upstash drops in when needed.
- ⚠️ **E4 Sentry / OTel** — not yet set up; env slots present.

---

## Outstanding blockers

1. Prognosis **NIN-update** endpoint + payload field names (A2).
2. Exact support phone / email / hours for the always-visible
   support-block component (C1).
3. Prognosis **Email endpoint** path confirmation (A4 minor).
4. Decision on Upstash Redis vs. sticking with in-memory KV on Render
   single-instance (E3).
