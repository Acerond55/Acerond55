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
| `Onboarding Status` | **Single select** | The onboarding spine. Options in 1b. |
| `DocuSign Envelope ID` | Single line text | Stored when the agreement is sent. |
| `Agreement Signed At` | Date (with time) | Stored on envelope completion. |
| `Gusto Setup Complete` | Checkbox | Tick to advance past payment setup. |
| `Availability` | Long text | Lean deployment data. |
| `Roles` | Long text | Server / bartender / busser, etc. |
| `Transport` | Single line text | Own car / how they reach venues. |
| `Attire Size` | Single line text | Shirt/vest size. |
| `Has Black Attire` | Checkbox | Has black service attire y/n. |
| `Certs` | Long text | TIPS / food handler, etc. |
| `kloqd Worker ID` | Single line text | Returned by the kloqd push (Steps 5–6). |

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

On the **`Onboarding Status`** field, add these **seven** options, in this order
(this is the onboarding spine):

- `Ready to Onboard`
- `Agreement Sent`
- `Agreement Signed`
- `Payment Setup Done`
- `USN Complete`
- `Sent to kloqd`
- `Deployable`

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

The onboarding half runs off the **`Onboarding Status`** spine (options added in
1b). A candidate enters it at **`Ready to Onboard`**; from there the pipeline
advances them step by step. Steps 1–4 are buildable today; Steps 5–6 (kloqd) are
blocked until you have the six kloqd facts (section 4c).

### DocuSign (Step 1 send / Step 2 completion)

1. Build a DocuSign **template** for the 3-page ICA. **[CONFIRM]** copy its
   template id into `DOCUSIGN_ICA_TEMPLATE_ID`.
2. **[CONFIRM]** decide how Schedule A attaches per candidate (merge field vs a
   per-candidate document) and reflect it in the template.
3. Recommended: add the **W-9** as a second document in the **same** template so
   it's one signing session (`DOCUSIGN_INCLUDE_W9=true`).
4. Enable DocuSign's built-in **reminder at 72 hrs** on the template/envelope.
5. Set up **DocuSign Connect** to POST envelope-completed events to
   `{PUBLIC_BASE_URL}/webhooks/docusign`; put the Connect **HMAC key** into
   `DOCUSIGN_CONNECT_HMAC_KEY`.
6. For live sending, fill `DOCUSIGN_ACCOUNT_ID` + `DOCUSIGN_ACCESS_TOKEN`,
   set `DOCUSIGN_PROVIDER=example`, and complete `makeExampleSigner` in
   `src/docusign/signer.ts` (the skeleton shows where, incl. the W-9 composite).

> A candidate is moved to `Ready to Onboard` when screening passes and you're
> satisfied (e.g. AI confidence High, or cleared from spot-check). The scanner
> then sends the agreement automatically and flips to `Agreement Sent`.

### Gusto (Step 3 direct deposit)

Default is **manual**: Gusto sends its own onboarding invite (kept separate from
DocuSign). When the candidate finishes Gusto, tick the **`Gusto Setup Complete`**
checkbox (or `POST /onboarding/gusto-done` with `X-Interviewer-Secret`). The next
scan advances them to `Payment Setup Done` and texts the deployment-data form.
**[CONFIRM]** whether the Gusto invite is fired manually or via API/Make today.

### Deployment-data form (Step 4)

Put the lean form (Airtable form view or your own) at `ONBOARDING_DATA_FORM_URL`.
Wire its submission to `POST {PUBLIC_BASE_URL}/onboarding/deployment-data` with
`{ email, availability, roles, transport, attireSize, hasBlackAttire, certs }`.
When all fields are present the candidate flips to **`USN Complete`**.
**[DECISION]** default collects this **after signing**; move it up-front at
application if you prefer fewer steps.

## 4c. kloqd (Steps 5–6) — BLOCKED until you have these six facts

Steps 5–6 cannot be safely built on guesses, so the push **fails loudly** until
configured. Get these from kloqd, then fill the env vars:

1. **Create/pre-stage worker endpoint** → `KLOQD_API_URL`
2. **Auth method** for that endpoint → `KLOQD_AUTH_TOKEN`
3. **Exact fields kloqd accepts (+ names)** → reconcile the field map in
   `src/kloqd/client.ts` (`pushWorker`)
4. **Whether agreement-accepted state can be passed in** (so kloqd doesn't
   re-ask for the legal paperwork USN already did) → same field map
5. **USN's agency join code** → `KLOQD_AGENCY_JOIN_CODE`
6. **Worker-onboarding-complete signal** (webhook vs poll) →
   `KLOQD_COMPLETION_MODE`; if webhook, point kloqd at
   `{PUBLIC_BASE_URL}/webhooks/kloqd` and set `KLOQD_WEBHOOK_SECRET`

Until `KLOQD_API_URL` + `KLOQD_AUTH_TOKEN` are set, candidates stay at
`USN Complete` and each scan logs the block — nothing is invented.

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
| `ONBOARDING_SCAN_ENABLED` / `ONBOARDING_DATA_FORM_URL` | Step 4b. |
| `DOCUSIGN_*` | Step 4b (DocuSign). `DOCUSIGN_ICA_TEMPLATE_ID` is **[CONFIRM]**. |
| `GUSTO_MODE` | Step 4b (Gusto). `manual` by default. |
| `KLOQD_*` | Step 4c — leave blank to keep the push blocked. |

---

## 6. Go-live order

1. Fill in Airtable env vars → `npm run check:airtable` → fix any missing options.
2. Deploy the service so `PUBLIC_BASE_URL` is reachable over HTTPS.
3. Point the VideoAsk and Calendly webhooks at it (steps 2.5 / 3.2).
4. Run a test candidate through **with `DRY_RUN=true`** — watch the logs to
   confirm the flow without mutating Airtable or sending anything.
5. Flip `DRY_RUN=false` and run one real end-to-end candidate.
6. Embed/link `{PUBLIC_BASE_URL}/apply` wherever candidates apply.
