import {
  GUSTO_STATUS_OPTIONS,
  ONBOARDING_STATUS,
  onboardingRank,
  isParkingState,
  type Candidate,
  type DeploymentData,
} from "../domain.js";

/**
 * PURE onboarding-spine logic. The `Onboarding Status` field is the spine; each
 * value implies at most one automated forward action. Nudges/stalls are handled
 * separately (see plan.ts). Keeping this pure makes the state machine testable
 * without Airtable.
 */
export type ScanAction =
  | "send_agreement" // Ready to Onboard              → send DocuSign ICA (+W-9)
  | "gusto_invite" // Agreement Signed, not invited    → fire Gusto invite
  | "advance_payment" // Agreement Signed, Gusto done  → Payment Setup Done
  | "send_deployment_form" // Payment Setup Done, unsent → text the form
  | "handoff_kloqd" // USN Complete                    → Phase A join-code SMS
  | "none";

/** Decide the single automated action implied by a candidate's current state. */
export function scanAction(c: Candidate): ScanAction {
  switch (c.onboardingStatus) {
    case ONBOARDING_STATUS.READY_TO_ONBOARD:
      return "send_agreement";
    case ONBOARDING_STATUS.AGREEMENT_SIGNED:
      if (c.gustoStatus === "Complete") return "advance_payment";
      // Not yet invited (empty or "Not Invited") → fire the invite once.
      if (c.gustoStatus !== "Invited") return "gusto_invite";
      return "none"; // Invited, waiting — nudges take over.
    case ONBOARDING_STATUS.PAYMENT_SETUP_DONE:
      return c.deploymentFormSent ? "none" : "send_deployment_form";
    case ONBOARDING_STATUS.USN_COMPLETE:
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
 * a parking state is handled explicitly (resumeStatus), not here.
 */
export function canFlipTo(current: string | undefined, next: string): boolean {
  if (isParkingState(next)) return true;
  if (isParkingState(current)) return false; // resume path handles this
  return onboardingRank(next) > onboardingRank(current);
}

/** Valid Gusto status values (guard for the manual/webhook update). */
export function isGustoStatus(v: string): boolean {
  return (GUSTO_STATUS_OPTIONS as readonly string[]).includes(v);
}
