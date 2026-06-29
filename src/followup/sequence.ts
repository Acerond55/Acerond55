import {
  listPendingOnboarding,
  updateCandidate,
} from "../airtable/candidates.js";
import { config } from "../config.js";
import { STATUS, type Candidate } from "../domain.js";
import { log } from "../lib/logger.js";
import { getNotifier, type Notifier } from "../notify/notifier.js";
import { onboardingMessage, reminderMessage } from "./messages.js";
import { computeDueNudge, type ReminderConfig } from "./reminders.js";

function reminderConfig(): ReminderConfig {
  return {
    day2: config.followup.reminderDay2,
    day4: config.followup.reminderDay4,
  };
}

/**
 * Kick off the follow-up sequence for a candidate who just passed: send the
 * onboarding link and stamp the record so the scheduler can take over.
 * Idempotent — if onboarding was already sent, does nothing.
 */
export async function startOnboarding(
  candidate: Candidate,
  notifier: Notifier = getNotifier(),
  now: Date = new Date()
): Promise<void> {
  if (candidate.onboardingSentAt) {
    log.info("onboarding already started — skipping", {
      email: candidate.email,
    });
    return;
  }
  const msg = onboardingMessage(candidate.name, config.followup.onboardingUrl);
  await notifier.sendEmail({ to: candidate.email, ...msg });

  await updateCandidate(candidate.id, {
    status: STATUS.ONBOARDING_SENT,
    onboardingSentAt: now.toISOString(),
    reminderStage: 0,
  });
  log.info("onboarding link sent", { email: candidate.email });
}

/**
 * Scan all pending-onboarding candidates and send any reminder that is due.
 * Idempotent: computeDueNudge gates each nudge on the persisted reminderStage,
 * and we advance the stage immediately after a successful send, so the same
 * reminder is never sent twice — even across restarts.
 */
export async function runReminders(
  notifier: Notifier = getNotifier(),
  now: Date = new Date()
): Promise<{ scanned: number; sent: number }> {
  const candidates = await listPendingOnboarding();
  let sent = 0;
  for (const c of candidates) {
    const due = computeDueNudge(c, now, reminderConfig());
    if (!due) continue;
    const msg = reminderMessage(due.kind, c.name, config.followup.onboardingUrl);
    await notifier.sendEmail({ to: c.email, ...msg });
    await updateCandidate(c.id, { reminderStage: due.nextStage });
    sent++;
    log.info("reminder sent", { email: c.email, kind: due.kind });
  }
  log.info("reminder scan complete", { scanned: candidates.length, sent });
  return { scanned: candidates.length, sent };
}
