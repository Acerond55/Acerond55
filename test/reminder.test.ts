import { describe, expect, it } from "vitest";
import { computeDueNudge } from "../src/followup/reminders.js";
import type { Candidate } from "../src/domain.js";

const cfg = { day2: 2, day4: 4 };
const base = "2026-06-01T00:00:00.000Z";

function candidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    id: "rec1",
    email: "a@b.com",
    onboardingSentAt: base,
    reminderStage: 0,
    onboardingCompleted: false,
    ...overrides,
  };
}

const days = (n: number) =>
  new Date(new Date(base).getTime() + n * 24 * 60 * 60 * 1000);

describe("reminder scheduling", () => {
  it("sends nothing before day 2", () => {
    expect(computeDueNudge(candidate(), days(1), cfg)).toBeNull();
  });

  it("sends the day-2 nudge once due, advancing to stage 1", () => {
    expect(computeDueNudge(candidate(), days(2), cfg)).toEqual({
      kind: "day2",
      nextStage: 1,
    });
  });

  it("does NOT resend the day-2 nudge once stage is advanced (idempotent)", () => {
    const after = candidate({ reminderStage: 1 });
    expect(computeDueNudge(after, days(2.5), cfg)).toBeNull();
    expect(computeDueNudge(after, days(3), cfg)).toBeNull();
  });

  it("sends the day-4 nudge once due, advancing to stage 2", () => {
    const after = candidate({ reminderStage: 1 });
    expect(computeDueNudge(after, days(4), cfg)).toEqual({
      kind: "day4",
      nextStage: 2,
    });
  });

  it("never double-sends day-4 after stage 2", () => {
    const done = candidate({ reminderStage: 2 });
    expect(computeDueNudge(done, days(5), cfg)).toBeNull();
    expect(computeDueNudge(done, days(99), cfg)).toBeNull();
  });

  it("stops entirely once onboarding is completed", () => {
    const done = candidate({ onboardingCompleted: true });
    expect(computeDueNudge(done, days(2), cfg)).toBeNull();
    expect(computeDueNudge(done, days(4), cfg)).toBeNull();
  });

  it("does nothing when onboarding was never sent", () => {
    const c = candidate({ onboardingSentAt: undefined });
    expect(computeDueNudge(c, days(10), cfg)).toBeNull();
  });

  it("if a tick is missed, the day-4 nudge is still the one that fires at day 4+ from stage 1", () => {
    // Simulate having sent day-2 (stage 1) but the scheduler skipped a beat;
    // at day 5 we should get day-4 exactly once, not day-2 again.
    const after = candidate({ reminderStage: 1 });
    const first = computeDueNudge(after, days(5), cfg);
    expect(first).toEqual({ kind: "day4", nextStage: 2 });
    const next = candidate({ reminderStage: 2 });
    expect(computeDueNudge(next, days(5), cfg)).toBeNull();
  });
});
