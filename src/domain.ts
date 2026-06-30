/**
 * Shared domain types and the canonical status vocabulary.
 *
 * The status strings below are the SINGLE SOURCE OF TRUTH. They must exist
 * verbatim as options on the Airtable Status single-select field — the
 * status-option safety check (src/airtable/statusOptions.ts) enforces this
 * at startup and fails loudly if any are missing.
 */

export const STATUS = {
  CALL_BOOKED: "Call Booked",
  CALL_NO_SHOW: "Call No-Show",
  PENDING_REVIEW: "Screened — Pending Review",
  PASSED: "Passed",
  FAILED: "Failed",
  ONBOARDING_SENT: "Onboarding Sent",
  ONBOARDING_COMPLETE: "Onboarding Complete",
} as const;

export type StatusValue = (typeof STATUS)[keyof typeof STATUS];

/** Every status option the code will ever try to write to Airtable. */
export const REQUIRED_STATUS_OPTIONS: StatusValue[] = Object.values(STATUS);

export const SCREEN_TYPE = {
  VIDEO: "Video",
  CALL: "Call",
} as const;

export type ScreenTypeValue = (typeof SCREEN_TYPE)[keyof typeof SCREEN_TYPE];

export const REQUIRED_SCREEN_TYPE_OPTIONS: ScreenTypeValue[] =
  Object.values(SCREEN_TYPE);

/**
 * The onboarding status spine — the field that drives the post-screening half
 * of the pipeline. Ordered: each value is the gate (TRIGGER) for the next step.
 * Like the screening STATUS vocabulary, these must exist verbatim as options on
 * the Airtable `Onboarding Status` single-select; the safety check enforces it.
 */
export const ONBOARDING_STATUS = {
  READY_TO_ONBOARD: "Ready to Onboard",
  AGREEMENT_SENT: "Agreement Sent",
  AGREEMENT_SIGNED: "Agreement Signed",
  PAYMENT_SETUP_DONE: "Payment Setup Done",
  USN_COMPLETE: "USN Complete",
  SENT_TO_KLOQD: "Sent to kloqd",
  DEPLOYABLE: "Deployable",
} as const;

export type OnboardingStatusValue =
  (typeof ONBOARDING_STATUS)[keyof typeof ONBOARDING_STATUS];

/** Spine order — index encodes progress; used to prevent backward flips. */
export const ONBOARDING_ORDER: OnboardingStatusValue[] = [
  ONBOARDING_STATUS.READY_TO_ONBOARD,
  ONBOARDING_STATUS.AGREEMENT_SENT,
  ONBOARDING_STATUS.AGREEMENT_SIGNED,
  ONBOARDING_STATUS.PAYMENT_SETUP_DONE,
  ONBOARDING_STATUS.USN_COMPLETE,
  ONBOARDING_STATUS.SENT_TO_KLOQD,
  ONBOARDING_STATUS.DEPLOYABLE,
];

export const REQUIRED_ONBOARDING_STATUS_OPTIONS: OnboardingStatusValue[] = [
  ...ONBOARDING_ORDER,
];

export function onboardingRank(value: string | undefined): number {
  if (!value) return -1;
  return ONBOARDING_ORDER.indexOf(value as OnboardingStatusValue);
}

export type ScoreGate = "pass" | "review" | "fail";

export interface Candidate {
  id: string;
  email: string;
  name?: string;
  status?: string;
  screenType?: string;
  answers?: string;
  score?: number;
  scoreNotes?: string;
  onboardingSentAt?: string; // ISO date string
  reminderStage?: number; // 0 = initial sent, 1 = day-2 done, 2 = day-4 done
  onboardingCompleted?: boolean;

  // --- Onboarding stage (post-screening) ---
  onboardingStatus?: string; // the ONBOARDING_STATUS spine
  docusignEnvelopeId?: string;
  agreementSignedAt?: string; // ISO date string
  gustoSetupComplete?: boolean; // checkbox; flips to Payment Setup Done
  // Lean deployment data (Step 4)
  availability?: string;
  roles?: string;
  transport?: string;
  attireSize?: string;
  hasBlackAttire?: boolean;
  certs?: string;
  // kloqd handoff (Steps 5–6)
  kloqdWorkerId?: string;
}

/** The lean deployment-data fields required before a candidate is USN Complete. */
export interface DeploymentData {
  availability?: string;
  roles?: string;
  transport?: string;
  attireSize?: string;
  hasBlackAttire?: boolean;
  certs?: string;
}
