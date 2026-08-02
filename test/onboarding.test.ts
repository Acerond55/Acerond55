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

describe("onboarding spine — scanAction (mapped to base Status)", () => {
  it("sends the agreement at Screened - Pass (onboarding entry)", () => {
    expect(scanAction(c({ status: S.READY_TO_ONBOARD }))).toBe("send_agreement");
  });

  it("fires the Gusto invite once at Docs Signed, then waits", () => {
    expect(scanAction(c({ status: S.AGREEMENT_SIGNED }))).toBe("gusto_invite");
    expect(scanAction(c({ status: S.AGREEMENT_SIGNED, gustoInvited: true }))).toBe("none");
  });

  it("sends the deployment form once at Payment Setup Done", () => {
    expect(scanAction(c({ status: S.PAYMENT_SETUP_DONE }))).toBe("send_deployment_form");
    expect(
      scanAction(c({ status: S.PAYMENT_SETUP_DONE, deploymentFormSent: true }))
    ).toBe("none");
  });

  it("hands off to kloqd at Training Complete", () => {
    expect(scanAction(c({ status: S.USN_COMPLETE }))).toBe("handoff_kloqd");
  });

  it("does nothing at externally-driven / terminal / parking states", () => {
    for (const s of [S.AGREEMENT_SENT, S.SENT_TO_KLOQD, S.DEPLOYABLE, S.STALLED, S.OPTED_OUT]) {
      expect(scanAction(c({ status: s }))).toBe("none");
    }
  });
});

describe("onboarding spine — deployment data completeness", () => {
  it("is complete when Availability AND Roles are present (minimum to book)", () => {
    expect(isDeploymentDataComplete({ availability: ["Saturday"], roles: ["Bartender"] })).toBe(
      true
    );
  });

  it("is incomplete without one of them", () => {
    expect(isDeploymentDataComplete({ availability: ["Saturday"], shirtSize: "M" })).toBe(false);
    expect(isDeploymentDataComplete({ roles: ["Bartender"] })).toBe(false);
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
