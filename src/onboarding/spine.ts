import {
  ONBOARDING_STATUS,
  onboardingRank,
  type Candidate,
  type DeploymentData,
} from "../domain.js";

/**
 * PURE onboarding-spine logic. The `Onboarding Status` field is the spine; each
 * value is the TRIGGER for exactly one automated action. Keeping this as a pure
 * function makes the whole state machine unit-testable without Airtable.
 */
export type ScanAction =
  | "send_agreement" // Ready to Onboard  → send DocuSign ICA (+W-9)
  | "advance_payment" // Agreement Signed + Gusto done → Payment Setup Done
  | "push_kloqd" // USN Complete       → push to kloqd
  | "none";

/** Decide the single automated action implied by a candidate's current state. */
export function scanAction(c: Candidate): ScanAction {
  switch (c.onboardingStatus) {
    case ONBOARDING_STATUS.READY_TO_ONBOARD:
      return "send_agreement";
    case ONBOARDING_STATUS.AGREEMENT_SIGNED:
      // Gusto is manual by default: only advance once the checkbox is ticked.
      return c.gustoSetupComplete ? "advance_payment" : "none";
    case ONBOARDING_STATUS.USN_COMPLETE:
      return "push_kloqd";
    default:
      return "none";
  }
}

/** The lean deployment-data set required before a candidate is USN Complete. */
export function isDeploymentDataComplete(d: DeploymentData): boolean {
  return Boolean(
    d.availability &&
      d.roles &&
      d.transport &&
      d.attireSize &&
      d.certs !== undefined &&
      d.hasBlackAttire !== undefined
  );
}

/**
 * Guard against backward/duplicate status flips. A flip is allowed only when it
 * moves strictly forward along the spine (or sets the very first state).
 */
export function canFlipTo(current: string | undefined, next: string): boolean {
  return onboardingRank(next) > onboardingRank(current);
}
