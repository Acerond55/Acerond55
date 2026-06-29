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
}
