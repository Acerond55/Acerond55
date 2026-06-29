import type { ScoreGate } from "../domain.js";

export interface GateThresholds {
  /** Score >= pass  → "pass". */
  pass: number;
  /** Score >= review (and < pass) → "review"; below → "fail". */
  review: number;
}

/**
 * PURE pass/review/fail gate.
 *
 * - A null score (no automated score available, e.g. manual-review fallback or
 *   a call awaiting interviewer outcome) always returns "review".
 * - Otherwise the score is bucketed by the configured thresholds.
 *
 * Thresholds come from config/env, never hardcoded here.
 */
export function gate(
  score: number | null | undefined,
  thresholds: GateThresholds
): ScoreGate {
  if (score === null || score === undefined) return "review";
  if (score >= thresholds.pass) return "pass";
  if (score >= thresholds.review) return "review";
  return "fail";
}

/** Map an interviewer's explicit pass/fail decision to a gate result. */
export function gateFromInterviewer(decision: "pass" | "fail"): ScoreGate {
  return decision === "pass" ? "pass" : "fail";
}
