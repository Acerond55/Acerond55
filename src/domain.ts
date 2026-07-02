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
  // Parking states — tracked, NOT failures. Excluded from the linear order.
  STALLED: "Onboarding Stalled",
  OPTED_OUT: "Opted Out",
} as const;

export type OnboardingStatusValue =
  (typeof ONBOARDING_STATUS)[keyof typeof ONBOARDING_STATUS];

/** Linear spine order — index encodes progress; used to prevent backward flips. */
export const ONBOARDING_ORDER: OnboardingStatusValue[] = [
  ONBOARDING_STATUS.READY_TO_ONBOARD,
  ONBOARDING_STATUS.AGREEMENT_SENT,
  ONBOARDING_STATUS.AGREEMENT_SIGNED,
  ONBOARDING_STATUS.PAYMENT_SETUP_DONE,
  ONBOARDING_STATUS.USN_COMPLETE,
  ONBOARDING_STATUS.SENT_TO_KLOQD,
  ONBOARDING_STATUS.DEPLOYABLE,
];

/** All nine options that must exist on the Onboarding Status field. */
export const REQUIRED_ONBOARDING_STATUS_OPTIONS: OnboardingStatusValue[] = [
  ...ONBOARDING_ORDER,
  ONBOARDING_STATUS.STALLED,
  ONBOARDING_STATUS.OPTED_OUT,
];

/** Stall Stage mirrors the linear spine (where a candidate froze). */
export const STALL_STAGE_OPTIONS: OnboardingStatusValue[] = [...ONBOARDING_ORDER];

export function onboardingRank(value: string | undefined): number {
  if (!value) return -1;
  return ONBOARDING_ORDER.indexOf(value as OnboardingStatusValue);
}

export function isParkingState(value: string | undefined): boolean {
  return (
    value === ONBOARDING_STATUS.STALLED || value === ONBOARDING_STATUS.OPTED_OUT
  );
}

// --- Select-option vocabularies (must exist as Airtable options) ------------
export const GUSTO_STATUS_OPTIONS = ["Not Invited", "Invited", "Complete"] as const;
export const AVAILABILITY_OPTIONS = [
  "Weekday Day",
  "Weekday Eve",
  "Sat",
  "Sun",
] as const;
export const ROLES_OPTIONS = [
  "Server",
  "Bartender",
  "Busser-Barback",
  "Coat Check",
  "Captain-track",
] as const;
export const HAS_TRANSPORT_OPTIONS = [
  "Own car",
  "Rides-transit",
  "Depends on venue",
] as const;
export const SHIRT_SIZE_OPTIONS = ["XS", "S", "M", "L", "XL", "2XL", "3XL"] as const;
export const CERTS_OPTIONS = ["TIPS", "Food Handler", "None"] as const;
export const PREFERRED_LANGUAGE_OPTIONS = ["English", "Spanish", "Either"] as const;

export type Language = "English" | "Spanish";
/** Resolve the language to message a candidate in ("Either" → English). */
export function resolveLanguage(pref: string | undefined): Language {
  return pref === "Spanish" ? "Spanish" : "English";
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

  phone?: string;
  preferredLanguage?: string;

  // --- Onboarding stage (post-screening) ---
  onboardingStatus?: string; // the ONBOARDING_STATUS spine
  docusignEnvelopeId?: string;
  gustoStatus?: string; // Not Invited / Invited / Complete
  deploymentFormSent?: boolean;
  deploymentFormDone?: boolean;
  kloqdWorkerId?: string;
  // Nudge/stall bookkeeping (reset on every status flip)
  onboardingNudgeCount?: number;
  lastNudgeDate?: string; // ISO date string
  stallStage?: string;
  /** Timestamp the candidate ENTERED their current onboarding status (from the
   *  per-stage TS field). Powers time-in-stage, nudges and stall detection. */
  stageEnteredAt?: string;

  // Lean deployment data (Step 4) — multi-selects arrive as arrays
  availability?: string[];
  roles?: string[];
  hasTransport?: string;
  shirtSize?: string;
  hasBlackAttire?: boolean;
  certs?: string[];
}

/** The lean deployment-data fields collected at Step 4. */
export interface DeploymentData {
  availability?: string[];
  roles?: string[];
  hasTransport?: string;
  shirtSize?: string;
  hasBlackAttire?: boolean;
  certs?: string[];
}
