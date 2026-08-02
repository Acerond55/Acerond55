import { describe, expect, it } from "vitest";
import { nextNudgeAction } from "../src/onboarding/plan.js";
import { ONBOARDING_STATUS, type Candidate } from "../src/domain.js";

const S = ONBOARDING_STATUS;
const base = "2026-06-01T00:00:00.000Z";
const hours = (n: number) => new Date(new Date(base).getTime() + n * 3600_000);

function c(overrides: Partial<Candidate> = {}): Candidate {
  return {
    id: "rec1",
    email: "a@b.com",
    status: S.AGREEMENT_SENT,
    stageEnteredAt: base,
    onboardingNudgeCount: 0,
    ...overrides,
  };
}

describe("nudge/stall engine", () => {
  it("sends nothing before the first threshold", () => {
    expect(nextNudgeAction(c(), hours(47)).type).toBe("none");
  });

  it("fires nudge 1 at 48h for Agreement Sent, advancing the count", () => {
    expect(nextNudgeAction(c(), hours(48))).toEqual({
      type: "nudge",
      nudgeNumber: 1,
      nextCount: 1,
    });
  });

  it("does not resend nudge 1 once the count advanced (idempotent)", () => {
    const after = c({ onboardingNudgeCount: 1 });
    expect(nextNudgeAction(after, hours(49)).type).toBe("none");
    // nudge 2 is due at 96h
    expect(nextNudgeAction(after, hours(96))).toEqual({
      type: "nudge",
      nudgeNumber: 2,
      nextCount: 2,
    });
  });

  it("respects the same-calendar-day guard (no two nudges in one day)", () => {
    const after = c({ onboardingNudgeCount: 1, lastNudgeDate: hours(96).toISOString() });
    expect(nextNudgeAction(after, hours(96.5)).type).toBe("none");
  });

  it("stalls at the give-up day with the correct stall stage", () => {
    // Agreement Sent gives up at day 7 (168h) → stall stage 'Agreement Sent'
    expect(nextNudgeAction(c({ onboardingNudgeCount: 2 }), hours(168))).toEqual({
      type: "stall",
      stallStage: S.AGREEMENT_SENT,
    });
  });

  it("uses the Payment-stage stall label for the Agreement Signed wait", () => {
    const signed = c({ status: S.AGREEMENT_SIGNED, onboardingNudgeCount: 2 });
    // gives up at day 10 (240h) → stall stage 'Payment Setup Done'
    expect(nextNudgeAction(signed, hours(240))).toEqual({
      type: "stall",
      stallStage: S.PAYMENT_SETUP_DONE,
    });
  });

  it("fires three nudges for the kloqd wait (48/96/144h)", () => {
    const k = (n: number) =>
      c({ status: S.SENT_TO_KLOQD, onboardingNudgeCount: n });
    expect(nextNudgeAction(k(0), hours(48)).type).toBe("nudge");
    expect(nextNudgeAction(k(1), hours(96)).type).toBe("nudge");
    expect(nextNudgeAction(k(2), hours(144))).toEqual({
      type: "nudge",
      nudgeNumber: 3,
      nextCount: 3,
    });
  });

  it("has no plan for terminal/parking/transient statuses", () => {
    for (const s of [S.READY_TO_ONBOARD, S.USN_COMPLETE, S.DEPLOYABLE, S.STALLED, S.OPTED_OUT]) {
      expect(nextNudgeAction(c({ status: s }), hours(500)).type).toBe("none");
    }
  });
});
