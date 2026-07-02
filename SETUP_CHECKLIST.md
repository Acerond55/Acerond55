# USN Screening Pipeline — Manual Setup Checklist

These are the steps the code **cannot** do for you because they live inside
vendor dashboards. Do them in order. Anything the code *can* check, it does:
run `npm run check:airtable` after the Airtable section to confirm.

Throughout, `PUBLIC_BASE_URL` means the public HTTPS URL where this service is
reachable (e.g. your deployed host, or an `ngrok`/`cloudflared` tunnel during
testing).

---

## 1. Airtable — the system of record

### 1a. Candidate table & fields

In the **USN Operations** base, make sure your candidate table (default name
`Candidates` — set `AIRTABLE_CANDIDATES_TABLE` if different) has these fields.
Names must match the `AIRTABLE_FIELD_*` env vars (defaults shown):

| Field (default name) | Type | Notes |
| -------------------- | ---- | ----- |
| `Email` | Single line text | Lookup key. Required. |
| `Name` | Single line text | Optional. |
| `Status` | **Single select** | Options added in 1b. |
| `Screen Type` | **Single select** | Options: `Video`, `Call`. |
| `Answers` | Long text | Stores the video transcript / answer references. |
| `Score` | Number | AI score, 0–100 (blank for manual/call). |
| `Score Notes` | Long text | Scorer or interviewer notes. |
| `Onboarding Sent At` | Date (with time) | Set when the onboarding link goes out. |
| `Reminder Stage` | Number (integer) | 0 = sent, 1 = day-2 done, 2 = day-4 done. |
| `Onboarding Completed` | Checkbox | Stops the reminder sequence when checked. |
| `Phone` | Phone / single line text | Used for SMS + STOP matching. |
| `Preferred Language` | **Single select** | English / Spanish / Either. Options in 1b. |
| `Onboarding Status` | **Single select** | The onboarding spine. 9 options in 1b. |
| `DocuSign Envelope ID` | Single line text | Stored when the agreement is sent. |
| `Gusto Status` | **Single select** | Not Invited / Invited / Complete. |
| `Deployment Form Sent` | Checkbox | Set when the form is texted. |
| `Deployment Form Done` | Checkbox | Set when the form is completed. |
| `Onboarding Nudge Count` | Number (integer) | Reset to 0 on every status flip. |
| `Last Nudge Date` | Date (with time) | Guards against same-day double-sends. |
| `Stall Stage` | **Single select** | Where they froze. Options in 1b. |
| `Availability` | **Multi select** | Weekday Day / Weekday Eve / Sat / Sun. |
| `Roles` | **Multi select** | Server / Bartender / Busser-Barback / Coat Check / Captain-track. |
| `Has Transport` | **Single select** | Own car / Rides-transit / Depends on venue. |
| `Shirt Size` | **Single select** | XS–3XL. |
| `Has Black Attire` | Checkbox | Has black service attire y/n. |
| `Certs` | **Multi select** | TIPS / Food Handler / None. |
| `kloqd Worker ID` | Single line text | Returned by the kloqd push (Phase B). |
| `TS Ready to Onboard` … `TS Stalled` | Date (with time) | One per stage transition (8 total) for funnel analytics. |

### 1b. Status single-select options — **add these EXACTLY by hand**

The API cannot reliably create single-select options, so the code **refuses to
invent them** — it verifies they exist and fails loudly if not. Open the
`Status` field → *Customize field type* → add each option below with the **exact**
text (mind the em-dash `—` in "Screened — Pending Review", not a hyphen):

- `Call Booked`
- `Call No-Show`
- `Screened — Pending Review`
- `Passed`
- `Failed`
- `Onboarding Sent`
- `Onboarding Complete`

On the `Screen Type` field, add these two options:

- `Video`
- `Call`

On the **`Onboarding Status`** field, add these **nine** options — the seven
linear spine states in order, then the two parking states:

- `Ready to Onboard`
- `Agreement Sent`
- `Agreement Signed`
- `Payment Setup Done`
- `USN Complete`
- `Sent to kloqd`
- `Deployable`
- `Onboarding Stalled`
- `Opted Out`

Add the remaining select-field options (the pipeline verifies these too and
fails loudly if any are missing):

- **`Stall Stage`** (mirrors the linear spine): `Ready to Onboard`, `Agreement Sent`, `Agreement Signed`, `Payment Setup Done`, `USN Complete`, `Sent to kloqd`, `Deployable`
- **`Gusto Status`**: `Not Invited`, `Invited`, `Complete`
- **`Preferred Language`**: `English`, `Spanish`, `Either`
- **`Has Transport`**: `Own car`, `Rides-transit`, `Depends on venue`
- **`Shirt Size`**: `XS`, `S`, `M`, `L`, `XL`, `2XL`, `3XL`
- **`Availability`** (multi-select): `Weekday Day`, `Weekday Eve`, `Sat`, `Sun`
- **`Roles`** (multi-select): `Server`, `Bartender`, `Busser-Barback`, `Coat Check`, `Captain-track`
- **`Certs`** (multi-select): `TIPS`, `Food Handler`, `None`

> ✅ **Verify:** run `npm run check:airtable`. It prints `✓ All required Airtable
> status options are present.` or lists exactly what's missing.

### 1c. Token

Create a personal access token at <https://airtable.com/create/tokens> with
scopes **`data.records:read`**, **`data.records:write`**, and
**`schema.bases:read`** (the last is needed for the status-option check), granted
to the USN Operations base.

- `AIRTABLE_TOKEN` = the token value
- `AIRTABLE_BASE_ID` = the base id (starts with `app…`; see the base's API docs
  page or URL)

### 1d. (Optional) interviewer pass/fail button

To let an interviewer submit a call outcome from Airtable, add a **Button** field
that opens a URL or runs an automation that does:

```
POST {PUBLIC_BASE_URL}/call-outcome
Header: X-Interviewer-Secret: <INTERVIEWER_SECRET>
Body:   { "email": "{Email}", "decision": "pass" }   // or "fail"
```

(Or just use the printable script in `content/interviewer-call-script.md` and
have the interviewer hit the endpoint via a small internal form.)

---

## 2. VideoAsk — the async video/audio screen

1. Create a new VideoAsk form titled **"USN Candidate Screening"**.
2. Add the **four questions** from `content/videoask-questions.json`, in order:
   1. Hospitality / event experience
   2. Upset guest, captain not nearby — what do you do?
   3. Reliability + an example
   4. Comfortable on feet 5–6 hrs + black service attire?
3. For **each** question, enable **both Video and Audio** answer types (let
   candidates choose). Keep video as the default answer type.
4. Turn on **contact collection** for **name and email** (email required) — the
   pipeline matches candidates by email.
5. **Webhook:** in the form's *Connect → Webhooks* (or integrations), add:
   - URL: `{PUBLIC_BASE_URL}/webhooks/videoask`
   - Add a header **`X-Webhook-Secret`** whose value equals
     `VIDEOASK_WEBHOOK_SECRET`. (If VideoAsk's webhook UI doesn't allow custom
     headers on your plan, append `?secret=<VIDEOASK_WEBHOOK_SECRET>` to the URL
     instead — the code accepts either.)
6. Copy the form's public share URL into `VIDEOASK_URL` (this is what the choice
   screen's "Record a quick video" button links to).

- `VIDEOASK_WEBHOOK_SECRET` = a long random string you choose (use the same value
  in VideoAsk and `.env`).
- `VIDEOASK_URL` = the public form link.

---

## 3. Calendly — the booked-call path

1. Use (or create) the **screening call** event type. Copy its public scheduling
   URL into `CALENDLY_URL` (this is what the "Book a call" link points to).
2. Create a **webhook subscription** (Integrations → Webhooks, or via the API)
   scoped to your user/organization, subscribed to these events:
   - `invitee.created` → the pipeline sets status **Call Booked**.
   - `invitee.no_show.created` → the pipeline sets status **Call No-Show**.
     (Mark a no-show in Calendly after a missed call to fire this.)
   - Set the webhook **URL** to `{PUBLIC_BASE_URL}/webhooks/calendly`.
3. Copy the subscription's **signing key** into `CALENDLY_WEBHOOK_SIGNING_KEY`
   — the code verifies the `Calendly-Webhook-Signature` HMAC on every request.

> **Note on "call completed":** Calendly has no native "call completed" webhook.
> Call **completion + outcome** is interviewer-driven: after the call, the
> interviewer submits pass/fail to `POST /call-outcome` (see 1d), which sets the
> record to **Screened — Pending Review** and then routes pass/fail. This keeps
> the call and video paths comparable.

- `CALENDLY_URL` = public scheduling URL.
- `CALENDLY_WEBHOOK_SIGNING_KEY` = signing key from the webhook subscription.

---

## 4. Email / SMS provider (when you're ready to actually send)

Sending is behind the `Notifier` interface, so this is optional until you go
live. Defaults log only.

1. Pick a provider (Instantly, Resend, Twilio, …).
2. Open `src/notify/notifier.ts` and fill in `makeExampleNotifier` with that
   provider's real API contract (the skeleton shows where).
3. Set `NOTIFIER_PROVIDER=example`, `NOTIFIER_API_KEY=…`, and the
   `NOTIFIER_FROM_EMAIL` / `NOTIFIER_FROM_SMS` values.

Until then, leave `NOTIFIER_PROVIDER=console`. Note that `DRY_RUN=true` forces
the console notifier regardless, so you can't accidentally send during testing.

---

## 4b. Onboarding stage (post-screening)

The onboarding half runs off the **`Onboarding Status`** spine (nine options in
1b). A candidate enters at **`Ready to Onboard`**; the scanner advances them,
sends stage nudges, and parks non-responders in **`Onboarding Stalled`** (a
tracked state, not a failure). A **STOP** reply moves anyone to **`Opted Out`**
and halts all messaging permanently. Every message goes out in the candidate's
**`Preferred Language`** (English/Spanish).

### DocuSign (Step 1 send / Step 2 completion)

1. Build a DocuSign **template** for the 3-page ICA + **W-9** in one envelope
   (one signing session; `DOCUSIGN_INCLUDE_W9=true`). **[CONFIRM]** copy its
   template id into `DOCUSIGN_ICA_TEMPLATE_ID`.
2. **[CONFIRM]** decide how Schedule A attaches per candidate (merge field vs a
   per-candidate document) and reflect it in the template.
3. Enable DocuSign's built-in **reminder at 72 hrs** on the template/envelope.
4. Set up **DocuSign Connect** → POST to `{PUBLIC_BASE_URL}/webhooks/docusign`;
   put the Connect **HMAC key** into `DOCUSIGN_CONNECT_HMAC_KEY`. The handler
   covers **completed** (→ Agreement Signed), **declined** (→ Stalled + flag for
   a personal call), and **bounce** (→ SMS asking for a better email). A
   completed envelope with `w9Valid:false` is held for manual review.
5. For live sending, fill `DOCUSIGN_ACCOUNT_ID` + `DOCUSIGN_ACCESS_TOKEN`, set
   `DOCUSIGN_PROVIDER=example`, and complete `makeExampleSigner` in
   `src/docusign/signer.ts` (incl. the W-9 composite + envelope void on STOP).

> Move a candidate to `Ready to Onboard` when screening passes and you're
> satisfied (AI confidence High, or cleared from spot-check).

### Gusto (Step 3 direct deposit)

Default is **manual**: at `Agreement Signed` the scanner texts the candidate and
sets `Gusto Status` = `Invited`. When they finish Gusto, set `Gusto Status` =
`Complete` — via `POST /onboarding/gusto-status` `{email, status}` with
`X-Interviewer-Secret`, or an Airtable button. The next scan advances to
`Payment Setup Done`. **[CONFIRM]** manual vs Gusto API/Make. **[DECISION]** is
there a paper-check fallback, or is direct deposit mandatory
(`DIRECT_DEPOSIT_MANDATORY`)? A "no bank account" reply is flagged for you.

### Deployment-data form (Step 4)

Put the lean form (Airtable form view or your own) at `ONBOARDING_DATA_FORM_URL`;
wire its submission to `POST {PUBLIC_BASE_URL}/onboarding/deployment-data` with
`{ email, availability[], roles[], certs[], hasTransport, shirtSize, hasBlackAttire }`.
Counts as done once **Availability and Roles** are filled (the minimum to book);
sizes/certs can be chased later. Then the candidate flips to **`USN Complete`**.

### STOP / opt-out + inbound SMS

Point your SMS provider's inbound webhook at
`{PUBLIC_BASE_URL}/webhooks/sms-inbound` (secret `SMS_INBOUND_SECRET`). A body
starting with **STOP** matches the candidate by phone (or email) → `Opted Out`,
voids any open envelope, and halts all USN messaging.

### Weekly digest

Wire a **Monday 8am ET** cron to `POST {PUBLIC_BASE_URL}/tasks/weekly-digest`
(e.g. a scheduled GitHub Action or your host's scheduler). It emails/texts the
owner (`DIGEST_EMAIL` / `DIGEST_PHONE`) counts by status, stalls ranked
closest-to-done, who's about to stall (5+ days in stage), and this week's new
`Deployable` count.

## 4c. kloqd (Step 5) — Phase A now, Phase B blocked

**Phase A (buildable now):** at `USN Complete` the scanner texts the candidate
the kloqd signup URL + agency join code and flips to `Sent to kloqd`. You only
need two facts:

- **USN's agency join code** → `KLOQD_AGENCY_JOIN_CODE` **[CONFIRM]**
- **The signup URL** → `KLOQD_SIGNUP_URL` **[CONFIRM]** (defaulted)

**Step 6 (Deployable):** until a kloqd completion webhook exists, flip manually
from your kloqd dashboard via `POST /onboarding/mark-deployable` `{email}` with
`X-Interviewer-Secret`. That sends the welcome SMS.

**Phase B (BLOCKED):** the automated pre-fill push needs four more facts. It
stays off (Phase A still works) until `KLOQD_API_URL` + `KLOQD_AUTH_TOKEN` are
set. When attempted unconfigured it fails loudly rather than guessing:

1. **Create/pre-stage worker endpoint** → `KLOQD_API_URL`
2. **Auth method** → `KLOQD_AUTH_TOKEN`
3. **Exact accepted fields (+ names)** → reconcile `src/kloqd/client.ts`
4. **Agreement-accepted passthrough** (so kloqd doesn't re-ask for legal) → same
5. **Join code** (shared with Phase A) → `KLOQD_AGENCY_JOIN_CODE`
6. **Worker-onboarding-complete signal** (webhook vs poll) →
   `KLOQD_COMPLETION_MODE`; if webhook, point kloqd at
   `{PUBLIC_BASE_URL}/webhooks/kloqd` and set `KLOQD_WEBHOOK_SECRET`

---

## 5. Env vars — fill in `.env`

Copy `.env.example` → `.env` and fill these in:

| Var | Where it comes from |
| --- | ------------------- |
| `PORT` | Your choice (default 3000). |
| `DRY_RUN` | `true` while testing, `false` for live writes/sends. |
| `AIRTABLE_TOKEN` | Step 1c. |
| `AIRTABLE_BASE_ID` | Step 1c. |
| `AIRTABLE_CANDIDATES_TABLE` | Your table name (default `Candidates`). |
| `AIRTABLE_FIELD_*` | Only change if your columns are named differently than 1a. |
| `VIDEOASK_WEBHOOK_SECRET` | Step 2.5 — random string you choose. |
| `VIDEOASK_URL` | Step 2.6. |
| `CALENDLY_WEBHOOK_SIGNING_KEY` | Step 3.3. |
| `CALENDLY_URL` | Step 3.1. |
| `SCORE_PASS_THRESHOLD` / `SCORE_REVIEW_THRESHOLD` | Your bar (defaults 70 / 50). |
| `AI_SCORER_PROVIDER` / `AI_SCORER_API_KEY` | `none` until you wire a model. |
| `INTERVIEWER_SECRET` | Random string; used by the call-outcome endpoint (1d). |
| `ONBOARDING_URL` | Placeholder onboarding destination for now. |
| `REMINDER_DAY_2` / `REMINDER_DAY_4` | Reminder cadence (defaults 2 / 4 days). |
| `SCHEDULER_INTERVAL_MINUTES` / `SCHEDULER_ENABLED` | How often / whether to scan. |
| `NOTIFIER_PROVIDER` / `NOTIFIER_API_KEY` / `NOTIFIER_FROM_*` | Step 4. |
| `AIRTABLE_FIELD_*` / `AIRTABLE_TS_*` | Onboarding field + timestamp column names (1a). |
| `ONBOARDING_SCAN_ENABLED` / `ONBOARDING_DATA_FORM_URL` | Step 4b. |
| `DIRECT_DEPOSIT_MANDATORY` | Step 4b **[DECISION]** (paper-check policy). |
| `SMS_INBOUND_SECRET` | Step 4b (STOP webhook) — random string you choose. |
| `DIGEST_EMAIL` / `DIGEST_PHONE` / `DIGEST_ENABLED` | Step 4b (weekly digest). |
| `DOCUSIGN_*` | Step 4b (DocuSign). `DOCUSIGN_ICA_TEMPLATE_ID` is **[CONFIRM]**. |
| `GUSTO_MODE` | Step 4b (Gusto). `manual` by default. |
| `KLOQD_SIGNUP_URL` / `KLOQD_AGENCY_JOIN_CODE` | Step 4c Phase A **[CONFIRM]**. |
| `KLOQD_API_URL` / `KLOQD_AUTH_TOKEN` / `KLOQD_*` | Step 4c Phase B — blank keeps it blocked. |

---

## 6. Go-live order

1. Fill in Airtable env vars → `npm run check:airtable` → fix any missing options.
2. Deploy the service so `PUBLIC_BASE_URL` is reachable over HTTPS.
3. Point the VideoAsk and Calendly webhooks at it (steps 2.5 / 3.2).
4. Run a test candidate through **with `DRY_RUN=true`** — watch the logs to
   confirm the flow without mutating Airtable or sending anything.
5. Flip `DRY_RUN=false` and run one real end-to-end candidate.
6. Embed/link `{PUBLIC_BASE_URL}/apply` wherever candidates apply.
