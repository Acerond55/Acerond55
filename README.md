# USN Candidate Screening Pipeline

An automated candidate screening pipeline for **Universal Staffing Networks**
(hospitality / event staffing). Candidates choose between a **video screen**
(the cheap, default path) and a **booked call** (secondary, opt-in). Both paths
ask the **same four questions**, results land in **Airtable** (the system of
record), passing candidates are auto-enrolled in an onboarding + reminder
sequence.

This is a standalone USN system. It does not assume or integrate with any other
platform.

```
                       ┌─────────────────────────┐
   candidate ───▶ /apply  (video = default, call = opt-in)
                       └───────────┬──────────────┘
            ┌──────────────────────┴───────────────────────┐
            ▼                                               ▼
     VideoAsk screen                                  Calendly call
            │ webhook                                        │ webhook
            ▼                                               ▼
  POST /webhooks/videoask                        POST /webhooks/calendly
   • find/create candidate                        • invitee.created → "Call Booked"
   • store answers + "Video"                       • no_show        → "Call No-Show"
   • status "Screened — Pending Review"           interviewer submits outcome:
   • AI score → pass / review / fail               POST /call-outcome → pass/fail
            └──────────────────────┬───────────────────────┘
                                   ▼
                          pass → onboarding link
                          + Day-2 / Day-4 reminders (idempotent)
```

## Design principle

Video is cheap; live calls cost time. So the choice screen makes **video the
visual default** and the call a small opt-in, and **everything around a call is
automated** (booking capture, no-show handling, outcome handoff, pass follow-up)
even though the call itself is live. Both paths screen for the **same criteria**
so outcomes are comparable.

## Stack

- Node.js + TypeScript, minimal Express server.
- No Airtable SDK — talks to the Airtable REST + Metadata API over `fetch`.
- Zero heavy dependencies: `express` + `dotenv` at runtime; `vitest` + `tsx` +
  `typescript` for dev.

## Project layout

```
src/
  config.ts              Typed env config (the ONLY place that reads process.env)
  domain.ts              Status vocabulary + Candidate type (single source of truth)
  server.ts / index.ts   Express app + startup (status-option preflight, scheduler)
  airtable/
    client.ts            REST + metadata fetch wrapper (DRY_RUN suppresses writes)
    candidates.ts        Typed find/create/update by email
    statusOptions.ts     The status-option SAFETY CHECK (fails loudly)
  webhooks/
    verify.ts            VideoAsk shared-secret + Calendly HMAC verification
    parse.ts             Defensive payload parsers
    routes.ts            The two webhooks + /call-outcome + /tasks/run-reminders
  scoring/
    scoring.ts           PURE pass/review/fail gate (configurable thresholds)
    aiScorer.ts          Provider-agnostic AI scorer (manual-review default)
  notify/
    notifier.ts          Notifier interface + console default + example adapter
  followup/
    reminders.ts         PURE idempotent "what nudge is due" logic
    sequence.ts          startOnboarding + runReminders
    scheduler.ts         Lightweight in-process interval scheduler
  public/apply.html      Candidate-facing choice screen
  scripts/checkStatusOptions.ts   Standalone Airtable preflight
content/
  videoask-questions.json         VideoAsk form + question config
  interviewer-call-script.md      Matching live-call script (same 4 questions)
test/                    scoring, reminder idempotency, status-option safety
SETUP_CHECKLIST.md       The dashboard steps you must do by hand
```

## Quick start

```bash
npm install
cp .env.example .env      # then fill in values — see SETUP_CHECKLIST.md
npm run dev               # starts on http://localhost:3000
```

Open the choice screen at <http://localhost:3000/apply>.

### Verifying Airtable before you go live

```bash
npm run check:airtable
```

This reads your base schema and **fails loudly** if any required single-select
option is missing, printing the exact option names to add by hand. (The server
also runs this check at startup and exits 1 if options are missing.)

## DRY_RUN — safe end-to-end testing

With `DRY_RUN=true` (the default in `.env.example`):

- Airtable **writes** (create/update) are **logged, not performed**.
- All candidate sends go through the **console notifier** (logged, never sent),
  regardless of `NOTIFIER_PROVIDER`.
- Airtable **reads** still hit your real base, so the pipeline can find
  candidates — you test the full flow against live data **without mutating
  Airtable or messaging anyone**.

Set `DRY_RUN=false` only when you're ready for real writes and sends.

## Endpoints

| Method | Path | Purpose |
| ------ | ---- | ------- |
| GET  | `/health` | Liveness + dry-run flag |
| GET  | `/apply` | Candidate choice screen (video default, call opt-in) |
| POST | `/webhooks/videoask` | Completed VideoAsk screen (shared-secret verified) |
| POST | `/webhooks/calendly` | Calendly `invitee.created` / no-show (HMAC verified) |
| POST | `/call-outcome` | Interviewer marks a live call pass/fail (`X-Interviewer-Secret`) |
| POST | `/tasks/run-reminders` | Run the reminder scan now (for external cron) |

## Scoring gate

`scoring.ts` buckets a 0–100 score using **`SCORE_PASS_THRESHOLD`** and
**`SCORE_REVIEW_THRESHOLD`** (no magic numbers in code):

- `>= pass` → **pass** (auto-onboarded)
- `>= review` and `< pass` → **review** (left for a human)
- `< review` → **fail**
- **null score** (no AI scorer configured, or a call awaiting interviewer
  outcome) → **review**

The **video path** scores via a provider-agnostic `AiScorer` interface
(`AI_SCORER_PROVIDER`). Default `none` routes every video to manual review; the
bundled `example` adapter shows where to wire a real model and degrades to manual
review when no key is set. The **call path** has no automated score — the
interviewer submits pass/fail via `POST /call-outcome`.

## Follow-up sequence & idempotency

On a pass, `startOnboarding` sends the onboarding link (`ONBOARDING_URL`), sets
status `Onboarding Sent`, stamps `Onboarding Sent At`, and sets `Reminder Stage`
= 0. The scheduler (every `SCHEDULER_INTERVAL_MINUTES`) scans pending candidates
and sends a Day-2 then Day-4 nudge.

Idempotency is structural: `computeDueNudge` gates each nudge on the persisted
`Reminder Stage`, and the stage is advanced immediately after a send. The same
reminder can never fire twice — even across restarts, because the nudge state
lives on the Airtable record, not in memory. Completing onboarding (or hitting
the final stage) stops the sequence.

Disable the in-process scheduler with `SCHEDULER_ENABLED=false` and drive it from
an external cron hitting `POST /tasks/run-reminders` instead.

## Notifier abstraction

All sending goes through the `Notifier` interface (`sendEmail`, `sendSMS`).
Business logic never references a provider. `NOTIFIER_PROVIDER=console` (default)
logs only; `example` is a clearly-marked adapter skeleton (Resend-style email,
Twilio-style SMS) you point at your real provider. Swap providers without
touching the follow-up code.

## Tests

```bash
npm test
```

Covers the three critical logic paths:

1. **Scoring gate** — pass/review/fail bucketing incl. null → review.
2. **Reminder idempotency** — no double sends; missed-tick recovery.
3. **Status-option safety check** — detects missing options with exact names.

## Next steps (human dashboard work)

The vendor-dashboard steps you must do by hand are in **`SETUP_CHECKLIST.md`**:
creating the VideoAsk form, configuring Calendly webhooks, adding the exact
Airtable status options, and filling in every env var.
