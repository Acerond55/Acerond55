import { describe, expect, it } from "vitest";
import {
  canFlipTo,
  isDeploymentDataComplete,
  scanAction,
} from "../src/onboarding/spine.js";
import { ONBOARDING_STATUS, type Candidate } from "../src/domain.js";

const S = ONBOARDING_STATUS;
function c(overrides: Partial<Candidate> = {}): Candidate {
  return { id: "rec1", email: "a@b.com", ...overrides };
}

describe("onboarding spine — scanAction (v2)", () => {
  it("sends the agreement at Ready to Onboard", () => {
    expect(scanAction(c({ onboardingStatus: S.READY_TO_ONBOARD }))).toBe("send_agreement");
  });

  it("fires the Gusto invite once at Agreement Signed, then waits", () => {
    expect(scanAction(c({ onboardingStatus: S.AGREEMENT_SIGNED }))).toBe("gusto_invite");
    expect(
      scanAction(c({ onboardingStatus: S.AGREEMENT_SIGNED, gustoStatus: "Invited" }))
    ).toBe("none");
  });

  it("advances to payment once Gusto is Complete", () => {
    expect(
      scanAction(c({ onboardingStatus: S.AGREEMENT_SIGNED, gustoStatus: "Complete" }))
    ).toBe("advance_payment");
  });

  it("sends the deployment form once at Payment Setup Done", () => {
    expect(scanAction(c({ onboardingStatus: S.PAYMENT_SETUP_DONE }))).toBe(
      "send_deployment_form"
    );
    expect(
      scanAction(c({ onboardingStatus: S.PAYMENT_SETUP_DONE, deploymentFormSent: true }))
    ).toBe("none");
  });

  it("hands off to kloqd at USN Complete", () => {
    expect(scanAction(c({ onboardingStatus: S.USN_COMPLETE }))).toBe("handoff_kloqd");
  });

  it("does nothing at webhook-driven / terminal / parking states", () => {
    for (const s of [S.AGREEMENT_SENT, S.SENT_TO_KLOQD, S.DEPLOYABLE, S.STALLED, S.OPTED_OUT]) {
      expect(scanAction(c({ onboardingStatus: s }))).toBe("none");
    }
  });
});

describe("onboarding spine — deployment data completeness", () => {
  it("is complete when Availability AND Roles are present (minimum to book)", () => {
    expect(isDeploymentDataComplete({ availability: ["Sat"], roles: ["Server"] })).toBe(true);
  });

  it("is incomplete without one of them, even if sizes/certs are filled", () => {
    expect(
      isDeploymentDataComplete({ availability: ["Sat"], shirtSize: "M", certs: ["TIPS"] })
    ).toBe(false);
    expect(isDeploymentDataComplete({ roles: ["Server"] })).toBe(false);
    expect(isDeploymentDataComplete({ availability: [], roles: [] })).toBe(false);
  });
});

describe("onboarding spine — flip guards", () => {
  it("allows strictly-forward linear flips", () => {
    expect(canFlipTo(S.READY_TO_ONBOARD, S.AGREEMENT_SENT)).toBe(true);
    expect(canFlipTo(undefined, S.READY_TO_ONBOARD)).toBe(true);
  });

  it("rejects backward / same-state linear flips", () => {
    expect(canFlipTo(S.AGREEMENT_SIGNED, S.AGREEMENT_SENT)).toBe(false);
    expect(canFlipTo(S.DEPLOYABLE, S.DEPLOYABLE)).toBe(false);
  });

  it("always allows flipping to a parking state, and blocks resuming through it", () => {
    expect(canFlipTo(S.AGREEMENT_SENT, S.STALLED)).toBe(true);
    expect(canFlipTo(S.PAYMENT_SETUP_DONE, S.OPTED_OUT)).toBe(true);
    expect(canFlipTo(S.STALLED, S.AGREEMENT_SIGNED)).toBe(false);
  });
});
