import { findOrCreateByEmail, updateCandidate } from "../airtable/candidates.js";
import { config } from "../config.js";
import { SCREEN_TYPE, STATUS, type ScoreGate } from "../domain.js";
import { startOnboarding } from "../followup/sequence.js";
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
 * Apply a gate result to a candidate: passes start onboarding, fails are
 * marked, reviews stay pending. Returns the resolved gate.
 */
async function applyGate(
  candidateId: string,
  email: string,
  name: string | undefined,
  result: ScoreGate
): Promise<void> {
  if (result === "pass") {
    // startOnboarding sets status + sends link; it needs the latest record.
    await startOnboarding({
      id: candidateId,
      email,
      name,
      onboardingCompleted: false,
    });
  } else if (result === "fail") {
    await updateCandidate(candidateId, { status: STATUS.FAILED });
  }
  // "review" → leave at PENDING_REVIEW for a human.
}

/**
 * Handle a completed VideoAsk screen end-to-end:
 * find/create candidate → record answers + screen type → set pending review →
 * score → route by gate.
 */
export async function processVideoScreen(input: ParsedVideoScreen): Promise<{
  gate: ScoreGate;
  score: number | null;
}> {
  const { candidate } = await findOrCreateByEmail(input.email, input.name);

  await updateCandidate(candidate.id, {
    screenType: SCREEN_TYPE.VIDEO,
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
    score: aiScore.score ?? undefined,
    scoreNotes: `[${scorer.name}] ${aiScore.notes}`,
  });

  const result = gate(aiScore.score, thresholds());
  log.info("video screen scored", {
    email: input.email,
    scorer: scorer.name,
    score: aiScore.score,
    gate: result,
  });

  await applyGate(candidate.id, input.email, input.name ?? candidate.name, result);
  return { gate: result, score: aiScore.score };
}

export interface ParsedVideoScreen {
  email: string;
  name?: string;
  transcript: string;
  answers: Record<string, string>;
}

/** Calendly booking → "Call Booked". */
export async function processCallBooked(
  email: string,
  name?: string
): Promise<void> {
  const { candidate } = await findOrCreateByEmail(email, name);
  await updateCandidate(candidate.id, {
    screenType: SCREEN_TYPE.CALL,
    status: STATUS.CALL_BOOKED,
  });
  log.info("call booked", { email });
}

/** Calendly no-show → "Call No-Show". */
export async function processCallNoShow(
  email: string,
  name?: string
): Promise<void> {
  const { candidate } = await findOrCreateByEmail(email, name);
  await updateCandidate(candidate.id, { status: STATUS.CALL_NO_SHOW });
  log.info("call no-show", { email });
}

/**
 * Interviewer-driven call outcome. The live call has no automated score, so the
 * interviewer marks pass/fail (with optional notes). Sets the screen to pending
 * review, records the decision, and routes by gate.
 */
export async function processCallOutcome(
  email: string,
  decision: "pass" | "fail",
  notes?: string,
  name?: string
): Promise<{ gate: ScoreGate }> {
  const { candidate } = await findOrCreateByEmail(email, name);
  await updateCandidate(candidate.id, {
    screenType: SCREEN_TYPE.CALL,
    status: STATUS.PENDING_REVIEW,
    scoreNotes: notes ? `[interviewer] ${notes}` : "[interviewer] (no notes)",
  });

  const result = gateFromInterviewer(decision);
  log.info("call outcome recorded", { email, decision, gate: result });
  await applyGate(candidate.id, email, name ?? candidate.name, result);
  return { gate: result };
}
