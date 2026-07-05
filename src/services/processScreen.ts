import { findOrCreateByEmail, updateCandidate } from "../airtable/candidates.js";
import { config } from "../config.js";
import { STATUS, TIER, type ScoreGate } from "../domain.js";
import { log } from "../lib/logger.js";
import { getScorer, type ScreenInput } from "../scoring/aiScorer.js";
import { gate, gateFromInterviewer } from "../scoring/scoring.js";

function thresholds() {
  return {
    pass: config.scoring.passThreshold,
    review: config.scoring.reviewThreshold,
  };
}

/**
 * Apply a gate result to the candidate's single Status field:
 * - pass   → "Screened - Pass" (this IS the onboarding entry; the scanner sends
 *            the contractor agreement on the next tick) + Tier "Fast Track".
 * - fail   → "Screened - Decline" + Tier "Decline".
 * - review → leave status pending, set Tier "Needs Review" for a human.
 */
async function applyGate(candidateId: string, result: ScoreGate): Promise<void> {
  if (result === "pass") {
    await updateCandidate(candidateId, {
      status: STATUS.PASSED,
      tier: TIER.FAST_TRACK,
    });
  } else if (result === "fail") {
    await updateCandidate(candidateId, {
      status: STATUS.FAILED,
      tier: TIER.DECLINE,
    });
  } else {
    await updateCandidate(candidateId, { tier: TIER.NEEDS_REVIEW });
  }
}

export interface ParsedVideoScreen {
  email: string;
  name?: string;
  transcript: string;
  answers: Record<string, string>;
}

/**
 * Handle a completed VideoAsk screen end-to-end: find/create candidate →
 * record answers → set pending review → score → route by gate.
 */
export async function processVideoScreen(input: ParsedVideoScreen): Promise<{
  gate: ScoreGate;
  score: number | null;
}> {
  const { candidate } = await findOrCreateByEmail(input.email, input.name);

  await updateCandidate(candidate.id, {
    answers: input.transcript,
    status: STATUS.PENDING_REVIEW,
  });

  const scorer = getScorer();
  const screenInput: ScreenInput = {
    email: input.email,
    transcript: input.transcript,
    answers: input.answers,
  };
  const aiScore = await scorer.score(screenInput);

  await updateCandidate(candidate.id, {
    scoreNotes: `[${scorer.name}] score=${aiScore.score ?? "n/a"} — ${aiScore.notes}`,
  });

  const result = gate(aiScore.score, thresholds());
  log.info("video screen scored", {
    email: input.email,
    scorer: scorer.name,
    score: aiScore.score,
    gate: result,
  });

  await applyGate(candidate.id, result);
  return { gate: result, score: aiScore.score };
}

/** Calendly booking → "Phone Screen Booked". */
export async function processCallBooked(email: string, name?: string): Promise<void> {
  const { candidate } = await findOrCreateByEmail(email, name);
  await updateCandidate(candidate.id, { status: STATUS.CALL_BOOKED });
  log.info("phone screen booked", { email });
}

/** Calendly no-show → "Phone Screen No-Show". */
export async function processCallNoShow(email: string, name?: string): Promise<void> {
  const { candidate } = await findOrCreateByEmail(email, name);
  await updateCandidate(candidate.id, { status: STATUS.CALL_NO_SHOW });
  log.info("phone screen no-show", { email });
}

/**
 * Interviewer-driven phone-screen outcome. No automated score — the interviewer
 * marks pass/fail (with optional notes); we record it and route by gate.
 */
export async function processCallOutcome(
  email: string,
  decision: "pass" | "fail",
  notes?: string,
  name?: string
): Promise<{ gate: ScoreGate }> {
  const { candidate } = await findOrCreateByEmail(email, name);
  await updateCandidate(candidate.id, {
    status: STATUS.PENDING_REVIEW,
    scoreNotes: notes ? `[interviewer] ${notes}` : "[interviewer] (no notes)",
  });

  const result = gateFromInterviewer(decision);
  log.info("phone screen outcome recorded", { email, decision, gate: result });
  await applyGate(candidate.id, result);
  return { gate: result };
}
