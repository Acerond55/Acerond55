# USN Pipeline — Setup Checklist

This is everything the code **can't** do for you because it lives inside vendor
dashboards (Airtable, VideoAsk, Calendly, DocuSign, …). Work top to bottom.

**Two terms used throughout:**

- **`PUBLIC_BASE_URL`** — the public HTTPS address where this service runs (your
  deployed host, or an `ngrok` / `cloudflared` tunnel while testing).
- **`.env`** — copy `.env.example` to `.env` and fill values in as each section
  tells you to. Every `UPPERCASE_NAME` below is a line in that file.

---

## ⚡ Start here — the 3 things that block everything else

Do these first; nothing works until they're done.

1. **Add 5 options to your Airtable `Status` field** → [§1.2](#12-add-5-status-options)
2. **Add 12 new fields to the Candidates table** → [§1.3](#13-add-12-new-fields)
3. **Create an Airtable token, put it in `.env`** → [§1.4](#14-create-the-airtable-token)

Then run **`npm run check:airtable`**. It tells you exactly what's still missing,
by name. Everything after §1 can wait until you're ready to go live.

---

## 1. Airtable — the system of record

The code is already mapped to your real **USN Operations › Candidates** table.
Most columns exist and are reused as-is — you only add a few new ones.

### 1.1. Fields already in your base (no action needed)

`Full Name`, `Email`, `Phone`, `Tier`, `Availability`, `Has Transportation`,
`Has Banquet Attire`, `Phone Screen Notes`, `Notes`, and the date columns
`Phone Screen Date`, `Docs Sent Date`, `Docs Signed Date`,
`Training Complete Date`, `Activation Date`.

### 1.2. Add 5 `Status` options

Open the **`Status`** field → *Customize field type* → add these, **exactly**
(plain hyphens, not em-dashes):

- `Phone Screen No-Show`
- `Screened - Pending Review`
- `Payment Setup Done`
- `Sent to kloqd`
- `Opted Out`

Your existing options double as the pipeline's stages, so leave them:
`Phone Screen Booked` · `Screened - Pass` · `Screened - Decline` ·
`Onboarding - Docs Sent` · `Onboarding - Docs Signed` ·
`Onboarding - Training Complete` · `Active` · `Stalled`.

### 1.3. Add 12 new fields

Add each column with the **exact name** shown (they must match the `.env`
defaults). For select fields, add the listed options too.

| Field name | Type | Options to add |
| ---------- | ---- | -------------- |
| `Preferred Language` | Single select | `English`, `Spanish`, `Either` |
| `Roles` | Multi select | `Banquet Server`, `Bartender`, `Event Captain`, `Coat Check`, `Barback or Busser`, `Brand Ambassador` |
| `Shirt Size` | Single select | `XS`, `S`, `M`, `L`, `XL`, `2XL`, `3XL` |
| `Certs` | Multi select | `TIPS`, `Food Handler`, `None` |
| `Stall Stage` | Single select | `Screened - Pass`, `Onboarding - Docs Sent`, `Onboarding - Docs Signed`, `Payment Setup Done`, `Onboarding - Training Complete`, `Sent to kloqd`, `Active` |
| `DocuSign Envelope ID` | Single line text | — |
| `kloqd Worker ID` | Single line text | — |
| `Gusto Invited` | Checkbox | — |
| `Deployment Form Sent` | Checkbox | — |
| `Onboarding Nudge Count` | Number (integer) | — |
| `Last Nudge Date` | Date (include time) | — |
| `Last Status Change` | Date (include time) | — |

### 1.4. Create the Airtable token

1. Go to <https://airtable.com/create/tokens>.
2. Give it these **scopes**: `data.records:read`, `data.records:write`,
   `schema.bases:read` (the last one powers the option check).
3. Grant it access to the **USN Operations** base.
4. In `.env`:
   - `AIRTABLE_TOKEN` = the token value
   - `AIRTABLE_BASE_ID` = the base id (`app…`, from the base's URL or API docs)

> ✅ **Check your work:** run `npm run check:airtable`. Green means §1 is done.

### 1.5. (Optional) interviewer pass/fail button

To let an interviewer record a call outcome from Airtable, add a **Button** field
that calls:

```
POST {PUBLIC_BASE_URL}/call-outcome
Header: X-Interviewer-Secret: <INTERVIEWER_SECRET>
Body:   { "email": "{Email}", "decision": "pass" }   // or "fail"
```

---

## 2. VideoAsk — the async video/audio screen

1. Create a form titled **"USN Candidate Screening"**.
2. Add the **4 questions** from `content/videoask-questions.json`, in order.
3. For each question, allow **both Video and Audio** answers (video as default).
4. Turn on **contact collection** for **name + email** (email required — it's how
   candidates are matched).
5. Add a **webhook** (form → *Connect → Webhooks*):
   - URL: `{PUBLIC_BASE_URL}/webhooks/videoask`
   - Header **`X-Webhook-Secret`** = your `VIDEOASK_WEBHOOK_SECRET`.
   - *No custom-header support on your plan?* Instead use
     `{PUBLIC_BASE_URL}/webhooks/videoask?secret=<VIDEOASK_WEBHOOK_SECRET>`.
6. Copy the form's public share link into `VIDEOASK_URL`.

**`.env`:** `VIDEOASK_WEBHOOK_SECRET` (a long random string you pick, same in both
places) · `VIDEOASK_URL`.

---

## 3. Calendly — the booked-call path

1. Use or create your **screening call** event type; copy its public scheduling
   URL into `CALENDLY_URL`.
2. Add a **webhook subscription** (Integrations → Webhooks) pointed at
   `{PUBLIC_BASE_URL}/webhooks/calendly`, subscribed to:
   - `invitee.created` → sets status **`Phone Screen Booked`**
   - `invitee.no_show.created` → sets status **`Phone Screen No-Show`**
     (mark the no-show in Calendly after a missed call to fire this)
3. Copy the subscription's **signing key** into `CALENDLY_WEBHOOK_SIGNING_KEY`.

> **Why there's no "call completed" webhook:** Calendly doesn't emit one. After
> the call, the interviewer submits the outcome to `POST /call-outcome`
> ([§1.5](#15-optional-interviewer-passfail-button)), which sets
> **`Screened - Pending Review`**, then routes to pass/decline. This keeps the
> call and video paths identical downstream.

**`.env`:** `CALENDLY_URL` · `CALENDLY_WEBHOOK_SIGNING_KEY`.

---

## 4. Sending email / SMS (optional until you go live)

Sending sits behind a `Notifier` interface. By default it just **logs** — safe
for testing.

1. Pick a provider (Twilio, Resend, Instantly, …).
2. Fill in `makeExampleNotifier` in `src/notify/notifier.ts` with that provider's
   API (the skeleton shows where).
3. In `.env`: `NOTIFIER_PROVIDER=example`, `NOTIFIER_API_KEY=…`, plus
   `NOTIFIER_FROM_EMAIL` / `NOTIFIER_FROM_SMS`.

Leave `NOTIFIER_PROVIDER=console` until then. `DRY_RUN=true` **also** forces the
console notifier, so you can't send anything by accident while testing.

---

## 5. The onboarding flow (post-screening)

Once a candidate reaches **`Screened - Pass`**, the scanner drives them through
the rest automatically — one step per scan — sending nudges along the way and
parking non-responders in **`Stalled`** (tracked, not a failure). A **STOP** text
moves anyone to **`Opted Out`** and halts all messaging. Every message is sent in
the candidate's **`Preferred Language`**.

**The status ladder** (each arrow is one automated step):

```
Screened - Pass
  └─ sends DocuSign ICA + W-9 ─────────────► Onboarding - Docs Sent
       └─ candidate signs (DocuSign webhook) ► Onboarding - Docs Signed
            └─ fires Gusto invite (once) ────► (waits for payment setup)
                 └─ POST /onboarding/payment-done ► Payment Setup Done
                      └─ texts deployment form ──► (waits for form)
                           └─ form submitted ────► Onboarding - Training Complete
                                └─ texts kloqd join code ► Sent to kloqd
                                     └─ kloqd complete ──► Active  (deployable / live)
```

Set a candidate to **`Screened - Pass`** when screening passes and you're
satisfied (AI confidence High, or cleared by spot-check). Everything below is
about wiring the external tools each step talks to.

### 5.1. DocuSign — the agreement (Docs Sent → Docs Signed)

1. Build a DocuSign **template**: the 3-page ICA **+ W-9** in one envelope
   (`DOCUSIGN_INCLUDE_W9=true`). Put its id in `DOCUSIGN_ICA_TEMPLATE_ID`. **[CONFIRM]**
2. Decide how **Schedule A** attaches per candidate (merge field vs. per-candidate
   doc) and build that into the template. **[CONFIRM]**
3. Turn on DocuSign's built-in **72-hour reminder**.
4. Set up **DocuSign Connect** → `POST {PUBLIC_BASE_URL}/webhooks/docusign`, and
   put its **HMAC key** in `DOCUSIGN_CONNECT_HMAC_KEY`. The handler covers:
   - **completed** → `Onboarding - Docs Signed` (held for review if the W-9 fails validation)
   - **declined** → `Stalled` + flagged for a personal call
   - **bounce** → texts the candidate for a better email
5. To send for real: fill `DOCUSIGN_ACCOUNT_ID` + `DOCUSIGN_ACCESS_TOKEN`, set
   `DOCUSIGN_PROVIDER=example`, and finish `makeExampleSigner` in
   `src/docusign/signer.ts`.

### 5.2. Gusto — direct deposit (→ Payment Setup Done)

Default is **manual**. At `Onboarding - Docs Signed` the scanner texts the
candidate a Gusto link and ticks **`Gusto Invited`** (once). When they finish:

```
POST {PUBLIC_BASE_URL}/onboarding/payment-done
Header: X-Interviewer-Secret: <INTERVIEWER_SECRET>
Body:   { "email": "candidate@example.com" }
```

That advances them to **`Payment Setup Done`**. Wire it to an Airtable button, a
Gusto webhook, or a Make/Zapier step.

- **[CONFIRM]** manual vs. Gusto-API automation (`GUSTO_MODE`, default `manual`).
- **[DECISION]** is direct deposit mandatory, or is there a paper-check fallback?
  (`DIRECT_DEPOSIT_MANDATORY`). A "no bank account" reply is flagged for you.

### 5.3. Deployment-data form (→ Training Complete)

Put your lean form (an Airtable form view works) at `ONBOARDING_DATA_FORM_URL`,
and wire its submission to:

```
POST {PUBLIC_BASE_URL}/onboarding/deployment-data
Body:   { "email": "...", "availability": [...], "roles": [...],
          "certs": [...], "hasTransport": true, "shirtSize": "L",
          "hasBlackAttire": true }
```

It counts as done once **Availability and Roles** are filled (the minimum to book
someone); sizes/certs can be chased later. The candidate then advances to
**`Onboarding - Training Complete`**.

### 5.4. kloqd — the handoff (→ Sent to kloqd → Active)

**Phase A (works now):** at `Onboarding - Training Complete` the scanner texts the
candidate the kloqd signup link + agency join code, and sets **`Sent to kloqd`**.
You just need two facts:

- `KLOQD_AGENCY_JOIN_CODE` — USN's agency join code **[CONFIRM]**
- `KLOQD_SIGNUP_URL` — the signup link **[CONFIRM]** (has a default)

Then flip them to **`Active`** from your kloqd dashboard via:

```
POST {PUBLIC_BASE_URL}/onboarding/mark-deployable
Header: X-Interviewer-Secret: <INTERVIEWER_SECRET>
Body:   { "email": "...", "workerId": "optional" }
```

**Phase B (blocked — optional automation):** the auto pre-fill push to kloqd stays
off until `KLOQD_API_URL` + `KLOQD_AUTH_TOKEN` are set (it fails loudly rather
than guessing). To turn it on you'll need: the create-worker endpoint + auth,
the exact accepted field names (reconcile `src/kloqd/client.ts`), an
agreement-accepted passthrough, and a completion signal — either a webhook at
`{PUBLIC_BASE_URL}/webhooks/kloqd` (set `KLOQD_WEBHOOK_SECRET`) or polling
(`KLOQD_COMPLETION_MODE`).

### 5.5. STOP / opt-out (inbound SMS)

Point your SMS provider's inbound webhook at
`{PUBLIC_BASE_URL}/webhooks/sms-inbound` (secret `SMS_INBOUND_SECRET`). Any text
starting with **STOP** matches the candidate by phone (or email) → sets
**`Opted Out`**, voids any open envelope, and halts all messaging.

### 5.6. Weekly digest

Wire a **Monday 8am ET** cron (a scheduled GitHub Action, your host's scheduler,
etc.) to `POST {PUBLIC_BASE_URL}/tasks/weekly-digest`. It sends the owner
(`DIGEST_EMAIL` / `DIGEST_PHONE`) counts by status, stalls ranked closest-to-done,
who's about to stall, and this week's new `Active` count.

---

## 6. `.env` reference

Copy `.env.example` → `.env`. Grouped by when you need it:

**Needed to start (§1):**

| Var | Value |
| --- | ----- |
| `AIRTABLE_TOKEN`, `AIRTABLE_BASE_ID` | From §1.4. |
| `AIRTABLE_CANDIDATES_TABLE` | Your table name (default `Candidates`). |
| `AIRTABLE_FIELD_*`, `AIRTABLE_TS_*` | Only change if you renamed a column from §1. |
| `DRY_RUN` | `true` while testing, `false` for live writes/sends. |
| `PORT` | Your choice (default 3000). |

**Screening (§2–§3):**

| Var | Value |
| --- | ----- |
| `VIDEOASK_WEBHOOK_SECRET`, `VIDEOASK_URL` | §2. |
| `CALENDLY_WEBHOOK_SIGNING_KEY`, `CALENDLY_URL` | §3. |
| `SCORE_PASS_THRESHOLD`, `SCORE_REVIEW_THRESHOLD` | Your bar (defaults 70 / 50). |
| `AI_SCORER_PROVIDER`, `AI_SCORER_API_KEY` | `none` until you wire a model. |
| `INTERVIEWER_SECRET` | Random string; guards the call-outcome + onboarding endpoints. |
| `SCHEDULER_ENABLED`, `SCHEDULER_INTERVAL_MINUTES` | Whether / how often to scan. |

**Onboarding (§5):**

| Var | Value |
| --- | ----- |
| `ONBOARDING_SCAN_ENABLED` | Master switch for the onboarding scan. |
| `NOTIFIER_PROVIDER`, `NOTIFIER_API_KEY`, `NOTIFIER_FROM_*` | §4. |
| `DOCUSIGN_*` | §5.1 (`DOCUSIGN_ICA_TEMPLATE_ID` is **[CONFIRM]**). |
| `GUSTO_MODE`, `DIRECT_DEPOSIT_MANDATORY` | §5.2 (**[DECISION]** on paper checks). |
| `ONBOARDING_DATA_FORM_URL` | §5.3. |
| `KLOQD_SIGNUP_URL`, `KLOQD_AGENCY_JOIN_CODE` | §5.4 Phase A **[CONFIRM]**. |
| `KLOQD_API_URL`, `KLOQD_AUTH_TOKEN`, `KLOQD_*` | §5.4 Phase B — blank keeps it off. |
| `SMS_INBOUND_SECRET` | §5.5 (random string you pick). |
| `DIGEST_EMAIL`, `DIGEST_PHONE`, `DIGEST_ENABLED` | §5.6. |

---

## 7. Go-live order

1. Do **§1**, then `npm run check:airtable` until it's green.
2. Deploy so `PUBLIC_BASE_URL` is reachable over HTTPS.
3. Point the VideoAsk (§2) and Calendly (§3) webhooks at it.
4. Run a test candidate through with **`DRY_RUN=true`** — watch the logs; nothing
   is written or sent.
5. Flip `DRY_RUN=false` and run one real end-to-end candidate.
6. Link `{PUBLIC_BASE_URL}/apply` wherever candidates apply.
