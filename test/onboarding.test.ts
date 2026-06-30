import { describe, expect, it } from "vitest";
import {
  canFlipTo,
  isDeploymentDataComplete,
  scanAction,
} from "../src/onboarding/spine.js";
import { ONBOARDING_STATUS, type Candidate } from "../src/domain.js";

function c(overrides: Partial<Candidate> = {}): Candidate {
  return { id: "rec1", email: "a@b.com", ...overrides };
}

describe("onboarding spine — scanAction", () => {
  it("sends the agreement at Ready to Onboard", () => {
    expect(scanAction(c({ onboardingStatus: ONBOARDING_STATUS.READY_TO_ONBOARD })))
      .toBe("send_agreement");
  });

  it("waits at Agreement Signed until Gusto is marked done (manual gate)", () => {
    expect(scanAction(c({ onboardingStatus: ONBOARDING_STATUS.AGREEMENT_SIGNED })))
      .toBe("none");
    expect(
      scanAction(
        c({
          onboardingStatus: ONBOARDING_STATUS.AGREEMENT_SIGNED,
          gustoSetupComplete: true,
        })
      )
    ).toBe("advance_payment");
  });

  it("pushes to kloqd at USN Complete", () => {
    expect(scanAction(c({ onboardingStatus: ONBOARDING_STATUS.USN_COMPLETE })))
      .toBe("push_kloqd");
  });

  it("does nothing at non-actionable / webhook-driven states", () => {
    expect(scanAction(c({ onboardingStatus: ONBOARDING_STATUS.AGREEMENT_SENT })))
      .toBe("none");
    expect(scanAction(c({ onboardingStatus: ONBOARDING_STATUS.SENT_TO_KLOQD })))
      .toBe("none");
    expect(scanAction(c({}))).toBe("none");
  });
});

describe("onboarding spine — deployment data completeness", () => {
  const full = {
    availability: "Fri/Sat eve",
    roles: "server, bartender",
    transport: "own car",
    attireSize: "M",
    hasBlackAttire: true,
    certs: "TIPS",
  };

  it("is complete only when every field (incl. booleans) is present", () => {
    expect(isDeploymentDataComplete(full)).toBe(true);
  });

  it("treats certs empty-string as present (answered 'none')", () => {
    expect(isDeploymentDataComplete({ ...full, certs: "" })).toBe(true);
  });

  it("is incomplete when a field is missing", () => {
    expect(isDeploymentDataComplete({ ...full, roles: undefined })).toBe(false);
    expect(isDeploymentDataComplete({ ...full, hasBlackAttire: undefined })).toBe(
      false
    );
  });
});

describe("onboarding spine — forward-only flips", () => {
  it("allows strictly-forward flips", () => {
    expect(
      canFlipTo(ONBOARDING_STATUS.READY_TO_ONBOARD, ONBOARDING_STATUS.AGREEMENT_SENT)
    ).toBe(true);
    expect(canFlipTo(undefined, ONBOARDING_STATUS.READY_TO_ONBOARD)).toBe(true);
  });

  it("rejects backward or same-state flips (idempotent/no regression)", () => {
    expect(
      canFlipTo(ONBOARDING_STATUS.AGREEMENT_SIGNED, ONBOARDING_STATUS.AGREEMENT_SENT)
    ).toBe(false);
    expect(
      canFlipTo(ONBOARDING_STATUS.DEPLOYABLE, ONBOARDING_STATUS.DEPLOYABLE)
    ).toBe(false);
  });
});
