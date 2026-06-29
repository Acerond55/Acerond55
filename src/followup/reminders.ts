import type { Candidate } from "../domain.js";

export type NudgeKind = "day2" | "day4";

export interface DueNudge {
  kind: NudgeKind;
  /** reminderStage value to persist AFTER this nudge is sent. */
  nextStage: number;
}

export interface ReminderConfig {
  day2: number; // days after onboarding send
  day4: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * PURE + idempotent. Returns the single next reminder that is due for a
 * candidate, or null if none is due.
 *
 * reminderStage encodes progress: 0 = initial onboarding link sent,
 * 1 = day-2 nudge sent, 2 = day-4 nudge sent. Because each kind is gated on
 * `stage < nextStage`, a nudge can never be produced twice — once the stage is
 * advanced, that nudge stops being due. This is what prevents double-sends.
 */
export function computeDueNudge(
  candidate: Candidate,
  now: Date,
  cfg: ReminderConfig
): DueNudge | null {
  if (candidate.onboardingCompleted) return null;
  if (!candidate.onboardingSentAt) return null;

  const sentAt = new Date(candidate.onboardingSentAt).getTime();
  if (!Number.isFinite(sentAt)) return null;

  const elapsedDays = (now.getTime() - sentAt) / DAY_MS;
  const stage = candidate.reminderStage ?? 0;

  if (stage < 1 && elapsedDays >= cfg.day2) {
    return { kind: "day2", nextStage: 1 };
  }
  if (stage < 2 && elapsedDays >= cfg.day4) {
    return { kind: "day4", nextStage: 2 };
  }
  return null;
}
