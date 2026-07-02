import { describe, expect, it } from "vitest";
import { computeDigest } from "../src/onboarding/digest.js";
import { ONBOARDING_STATUS, type Candidate } from "../src/domain.js";

const S = ONBOARDING_STATUS;
const now = new Date("2026-06-10T00:00:00.000Z");
const daysAgo = (n: number) =>
  new Date(now.getTime() - n * 24 * 3600_000).toISOString();

function c(o: Partial<Candidate>): Candidate {
  return { id: "r", email: "x@y.com", ...o };
}

describe("weekly digest", () => {
  const population: Candidate[] = [
    c({ email: "a@x.com", onboardingStatus: S.AGREEMENT_SENT, stageEnteredAt: daysAgo(1) }),
    c({ email: "b@x.com", onboardingStatus: S.PAYMENT_SETUP_DONE, stageEnteredAt: daysAgo(6) }),
    c({ email: "d@x.com", onboardingStatus: S.DEPLOYABLE, stageEnteredAt: daysAgo(2) }),
    c({ email: "e@x.com", onboardingStatus: S.DEPLOYABLE, stageEnteredAt: daysAgo(30) }),
    c({ email: "f@x.com", onboardingStatus: S.STALLED, stallStage: S.AGREEMENT_SENT }),
    c({ email: "g@x.com", onboardingStatus: S.STALLED, stallStage: S.SENT_TO_KLOQD }),
  ];

  const d = computeDigest(population, now);

  it("counts by status", () => {
    expect(d.counts[S.DEPLOYABLE]).toBe(2);
    expect(d.counts[S.STALLED]).toBe(2);
    expect(d.counts[S.AGREEMENT_SENT]).toBe(1);
  });

  it("counts only this week's new Deployables", () => {
    expect(d.newDeployable.map((r) => r.email)).toEqual(["d@x.com"]);
  });

  it("ranks stalls closest-to-done first (Sent to kloqd before Agreement Sent)", () => {
    expect(d.stalledRanked.map((r) => r.stallStage)).toEqual([
      S.SENT_TO_KLOQD,
      S.AGREEMENT_SENT,
    ]);
  });

  it("flags candidates stuck 5+ days in a live stage", () => {
    expect(d.aboutToStall.map((r) => r.email)).toEqual(["b@x.com"]);
    expect(d.aboutToStall[0]?.daysInStage).toBe(6);
  });
});
