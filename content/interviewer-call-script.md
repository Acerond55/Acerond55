# USN Live-Call Interviewer Script

Use this for the **booked-call path**. It screens for the **same four criteria**
as the video screen, so outcomes are directly comparable. Rate each answer
**1–5**, jot a note, then record an overall **Pass / Fail** at the bottom.

> After the call, submit the outcome so the pipeline can take over:
> `POST /call-outcome` with header `X-Interviewer-Secret: <INTERVIEWER_SECRET>`
> and body `{ "email": "...", "decision": "pass" | "fail", "notes": "..." }`.
> A button/automation in Airtable can also call this endpoint.

---

**Candidate:** ______________________  **Email:** ______________________
**Date:** ____________  **Interviewer:** ____________

---

### 1. Experience
> "Walk me through your hospitality or event experience — what roles have you
> held, and what kinds of events?"

Listen for: relevant banquet/event roles, range of event types, specifics over
generalities.

Rating (1–5): ☐1 ☐2 ☐3 ☐4 ☐5  Notes: __________________________________

### 2. Guest recovery / judgment
> "You're mid-event, a guest is upset, and your captain isn't nearby. What do
> you do?"

Listen for: stays calm, owns the moment, de-escalates, knows when/how to
escalate afterward — not "go find the captain" as the whole answer.

Rating (1–5): ☐1 ☐2 ☐3 ☐4 ☐5  Notes: __________________________________

### 3. Reliability
> "What's your reliability like? Give an example of how you handle being
> scheduled somewhere you committed to."

Listen for: a concrete example, shows up, communicates early if something
changes, takes commitments seriously.

Rating (1–5): ☐1 ☐2 ☐3 ☐4 ☐5  Notes: __________________________________

### 4. Stamina & attire
> "Are you comfortable on your feet for 5–6 hour shifts, and do you have black
> service attire?"

Listen for: clear yes on stamina; has (or can get) black service attire.

Rating (1–5): ☐1 ☐2 ☐3 ☐4 ☐5  Notes: __________________________________

---

### Overall decision

Total (out of 20): ______

**Outcome:**  ☐ PASS   ☐ FAIL

Suggested guide (adjust to your bar): **PASS** if total ≥ 14 with no single
score below 2 on questions 2 or 3. Final call is the interviewer's.

Overall notes: ___________________________________________________________
