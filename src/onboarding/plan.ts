import { ONBOARDING_STATUS, type Candidate } from "../domain.js";

/**
 * Per-stage nudge cadence + give-up condition. Keyed by the CURRENT onboarding
 * status the candidate is waiting in. `nudgeHours` are hours-since-stage-entry
 * at which each nudge fires; `giveUpDays` is when we stop chasing and park them
 * in `Onboarding Stalled` with `stallStage` recording where they froze.
 *
 * These are the exact cadences from the build spec:
 *  - Agreement Sent:     48h, 96h  → stall at day 7  (stall stage: Agreement Sent)
 *  - Agreement Signed:   72h, 144h → stall at day 10 (stall stage: Payment Setup Done)
 *  - Payment Setup Done: 48h, 96h  → stall at day 7  (stall stage: USN Complete)
 *  - Sent to kloqd:      48h,96h,144h → stall at day 10 (stall stage: Sent to kloqd)
 */
export interface StagePlan {
  nudgeHours: number[];
  giveUpDays: number;
  stallStage: string;
}

export const NUDGE_PLAN: Record<string, StagePlan> = {
  [ONBOARDING_STATUS.AGREEMENT_SENT]: {
    nudgeHours: [48, 96],
    giveUpDays: 7,
    stallStage: ONBOARDING_STATUS.AGREEMENT_SENT,
  },
  [ONBOARDING_STATUS.AGREEMENT_SIGNED]: {
    nudgeHours: [72, 144],
    giveUpDays: 10,
    stallStage: ONBOARDING_STATUS.PAYMENT_SETUP_DONE,
  },
  [ONBOARDING_STATUS.PAYMENT_SETUP_DONE]: {
    nudgeHours: [48, 96],
    giveUpDays: 7,
    stallStage: ONBOARDING_STATUS.USN_COMPLETE,
  },
  [ONBOARDING_STATUS.SENT_TO_KLOQD]: {
    nudgeHours: [48, 96, 144],
    giveUpDays: 10,
    stallStage: ONBOARDING_STATUS.SENT_TO_KLOQD,
  },
};

export type NudgeDecision =
  | { type: "nudge"; nudgeNumber: number; nextCount: number }
  | { type: "stall"; stallStage: string }
  | { type: "none" };

const HOUR_MS = 60 * 60 * 1000;

function sameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

/**
 * PURE + idempotent. Decide the single nudge/stall action due for a candidate.
 *
 * Idempotency comes from `onboardingNudgeCount`: each nudge is gated on
 * `count < nudgeHours.length` and fires only at `nudgeHours[count]`, and the
 * caller advances the count after sending — so a nudge can never repeat. A
 * same-calendar-day guard on `lastNudgeDate` prevents a double-send within a
 * single day even if the scanner ticks several times.
 */
export function nextNudgeAction(c: Candidate, now: Date): NudgeDecision {
  const status = c.status;
  if (!status) return { type: "none" };
  const plan = NUDGE_PLAN[status];
  if (!plan) return { type: "none" };
  if (!c.stageEnteredAt) return { type: "none" };

  const enteredAt = new Date(c.stageEnteredAt).getTime();
  if (!Number.isFinite(enteredAt)) return { type: "none" };

  const elapsedH = (now.getTime() - enteredAt) / HOUR_MS;
  const elapsedDays = elapsedH / 24;

  if (elapsedDays >= plan.giveUpDays) {
    return { type: "stall", stallStage: plan.stallStage };
  }

  const count = c.onboardingNudgeCount ?? 0;
  const threshold = plan.nudgeHours[count];
  if (threshold !== undefined && elapsedH >= threshold) {
    if (c.lastNudgeDate) {
      const last = new Date(c.lastNudgeDate);
      if (Number.isFinite(last.getTime()) && sameCalendarDay(last, now)) {
        return { type: "none" };
      }
    }
    return { type: "nudge", nudgeNumber: count + 1, nextCount: count + 1 };
  }
  return { type: "none" };
}
