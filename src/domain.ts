/**
 * Shared domain types and the canonical status vocabulary.
 *
 * These strings are the SINGLE SOURCE OF TRUTH and are mapped onto the REAL
 * USN Operations base: one `Status` single-select drives the whole journey.
 * The status-option safety check (src/airtable/statusOptions.ts) verifies every
 * value below exists as an option and fails loudly if any is missing.
 */

/**
 * Screening-phase status values (all options on the one `Status` field).
 * Keys are kept stable; values match the base's real option names.
 */
export const STATUS = {
  CALL_BOOKED: "Phone Screen Booked",
  CALL_NO_SHOW: "Phone Screen No-Show", // NEW option (add by hand)
  PENDING_REVIEW: "Screened - Pending Review", // NEW option (add by hand)
  PASSED: "Screened - Pass",
  FAILED: "Screened - Decline",
} as const;

export type StatusValue = (typeof STATUS)[keyof typeof STATUS];

export const REQUIRED_STATUS_OPTIONS: StatusValue[] = Object.values(STATUS);

/** Tier field — used to route a "review" screen outcome to a human. */
export const TIER = {
  FAST_TRACK: "Tier 1 - Fast Track",
  NEEDS_REVIEW: "Tier 2 - Needs Review",
  DECLINE: "Decline",
} as const;

/**
 * Onboarding-phase status values — SAME physical `Status` field, later stages.
 * Keys are kept stable (so call sites don't churn); values match the base plus
 * the payment/kloqd stages you asked to track as their own statuses.
 */
export const ONBOARDING_STATUS = {
  READY_TO_ONBOARD: "Screened - Pass", // pass IS the onboarding entry trigger
  AGREEMENT_SENT: "Onboarding - Docs Sent",
  AGREEMENT_SIGNED: "Onboarding - Docs Signed",
  PAYMENT_SETUP_DONE: "Payment Setup Done", // NEW option (add by hand)
  USN_COMPLETE: "Onboarding - Training Complete",
  SENT_TO_KLOQD: "Sent to kloqd", // NEW option (add by hand)
  DEPLOYABLE: "Active",
  // Parking states — tracked, NOT failures. Excluded from the linear order.
  STALLED: "Stalled",
  OPTED_OUT: "Opted Out", // NEW option (add by hand)
} as const;

export type OnboardingStatusValue =
  (typeof ONBOARDING_STATUS)[keyof typeof ONBOARDING_STATUS];

/** Linear spine order — index encodes progress; prevents backward flips. */
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
// Availability + Roles reuse / match the base's real option names.
export const AVAILABILITY_OPTIONS = [
  "Weekday Mornings",
  "Weekday Afternoons",
  "Weekday Evenings",
  "Saturday",
  "Sunday",
  "Holidays",
] as const;
export const ROLES_OPTIONS = [
  "Banquet Server",
  "Bartender",
  "Event Captain",
  "Coat Check",
  "Barback or Busser",
  "Brand Ambassador",
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
  phone?: string;
  preferredLanguage?: string;
  status?: string; // the one Status field (screening + onboarding)
  answers?: string; // stored in Phone Screen Notes
  scoreNotes?: string; // stored in Notes
  tier?: string;

  // --- Onboarding stage (post-screening) ---
  docusignEnvelopeId?: string;
  gustoInvited?: boolean;
  deploymentFormSent?: boolean;
  kloqdWorkerId?: string;
  // Nudge/stall bookkeeping (reset on every status flip)
  onboardingNudgeCount?: number;
  lastNudgeDate?: string; // ISO date string
  stallStage?: string;
  /** Timestamp the candidate ENTERED their current status (Last Status Change).
   *  Powers time-in-stage, nudges and stall detection. */
  stageEnteredAt?: string;

  // Deployment data — multi-selects arrive as arrays
  availability?: string[];
  roles?: string[];
  hasTransport?: boolean; // base "Has Transportation" checkbox
  shirtSize?: string;
  hasBlackAttire?: boolean; // base "Has Banquet Attire" checkbox
  certs?: string[];
}

/** The deployment-data fields collected during onboarding. */
export interface DeploymentData {
  availability?: string[];
  roles?: string[];
  hasTransport?: boolean;
  shirtSize?: string;
  hasBlackAttire?: boolean;
  certs?: string[];
}
