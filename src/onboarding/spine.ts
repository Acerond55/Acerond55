import {
  ONBOARDING_STATUS,
  onboardingRank,
  isParkingState,
  type Candidate,
  type DeploymentData,
} from "../domain.js";

/**
 * PURE onboarding-spine logic over the single `Status` field. Each value implies
 * at most one automated forward action; nudges/stalls are handled separately
 * (plan.ts). Payment Setup Done and Sent to kloqd are their own statuses, so the
 * transitions INTO them are driven by external signals (Gusto/kloqd webhooks or
 * the manual endpoints), not by the scanner.
 */
export type ScanAction =
  | "send_agreement" // Screened - Pass                → send DocuSign ICA (+W-9)
  | "gusto_invite" // Docs Signed, not yet invited     → fire Gusto invite once
  | "send_deployment_form" // Payment Setup Done, unsent → text the form
  | "handoff_kloqd" // Training Complete               → Phase A join-code SMS
  | "none";

/** Decide the single automated action implied by a candidate's current state. */
export function scanAction(c: Candidate): ScanAction {
  switch (c.status) {
    case ONBOARDING_STATUS.READY_TO_ONBOARD: // "Screened - Pass"
      return "send_agreement";
    case ONBOARDING_STATUS.AGREEMENT_SIGNED: // "Onboarding - Docs Signed"
      return c.gustoInvited ? "none" : "gusto_invite";
    case ONBOARDING_STATUS.PAYMENT_SETUP_DONE:
      return c.deploymentFormSent ? "none" : "send_deployment_form";
    case ONBOARDING_STATUS.USN_COMPLETE: // "Onboarding - Training Complete"
      return "handoff_kloqd";
    default:
      return "none";
  }
}

/**
 * Deployment data counts as complete once Availability AND Roles are filled —
 * the minimum needed to book anyone. Sizes/certs can be chased later.
 */
export function isDeploymentDataComplete(d: DeploymentData): boolean {
  return Boolean(d.availability?.length && d.roles?.length);
}

/**
 * Guard status flips. Linear steps may only move strictly forward. Flipping to
 * a parking state (Stalled / Opted Out) is always allowed. Re-engagement out of
 * a parking state is handled explicitly, not here.
 */
export function canFlipTo(current: string | undefined, next: string): boolean {
  if (isParkingState(next)) return true;
  if (isParkingState(current)) return false;
  return onboardingRank(next) > onboardingRank(current);
}
