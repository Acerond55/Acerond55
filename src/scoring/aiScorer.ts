import { config } from "../config.js";
import { log } from "../lib/logger.js";

/**
 * Provider-agnostic interface for scoring an async (video) screen.
 * Input: the candidate's transcript / structured answers.
 * Output: a 0–100 score plus human-readable notes, OR a signal that the
 * screen needs manual review (no automated score available).
 */
export interface ScreenInput {
  email: string;
  /** Free-text transcript or concatenated answers from the video screen. */
  transcript: string;
  /** Optional structured answers keyed by question id. */
  answers?: Record<string, string>;
}

export interface AiScore {
  /** 0–100, or null when the screen should go to a human. */
  score: number | null;
  notes: string;
  /** true when no automated score was produced (manual-review fallback). */
  manualReview: boolean;
}

export interface AiScorer {
  readonly name: string;
  score(input: ScreenInput): Promise<AiScore>;
}

/**
 * Default scorer: produces NO automated score. Every video screen routes to
 * manual review. This is the safe default when AI_SCORER_PROVIDER=none.
 */
export const manualReviewScorer: AiScorer = {
  name: "manual-review",
  async score(): Promise<AiScore> {
    return {
      score: null,
      notes: "No AI scorer configured — routed to manual review.",
      manualReview: true,
    };
  },
};

/**
 * EXAMPLE adapter — illustrative only.
 *
 * This shows the SHAPE of a real integration: take the transcript, send it to
 * an LLM scoring endpoint, parse back a numeric score + notes. It is provider
 * agnostic on purpose — wire it to whichever model API you choose (Anthropic,
 * etc.) by filling in `callModel`. With no API key it degrades to manual review
 * rather than guessing.
 */
export function makeExampleScorer(apiKey: string): AiScorer {
  return {
    name: "example",
    async score(input: ScreenInput): Promise<AiScore> {
      if (!apiKey) {
        return manualReviewScorer.score(input);
      }
      // ---------------------------------------------------------------------
      // Replace this block with a real model call. The contract your prompt
      // must satisfy: return JSON { score: 0-100, notes: string }. Keep the
      // rubric aligned with the four screening questions (experience, guest
      // recovery, reliability, stamina/attire).
      // ---------------------------------------------------------------------
      log.warn(
        "example AI scorer invoked but no model wired in — returning manual review. " +
          "Implement callModel() in src/scoring/aiScorer.ts to enable automated scoring."
      );
      return {
        score: null,
        notes:
          "Example scorer is a stub. Wire callModel() to your chosen LLM to " +
          "produce a numeric score from the transcript.",
        manualReview: true,
      };
    },
  };
}

/** Select the scorer based on env configuration. */
export function getScorer(): AiScorer {
  switch (config.scoring.aiProvider) {
    case "example":
      return makeExampleScorer(config.scoring.aiApiKey);
    case "none":
    default:
      return manualReviewScorer;
  }
}
