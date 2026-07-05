import { listByStatuses } from "../airtable/candidates.js";
import { ONBOARDING_STATUS, type Candidate } from "../domain.js";
import { log } from "../lib/logger.js";
import { nextNudgeAction } from "./plan.js";
import {
  fireGustoInvite,
  handoffToKloqd,
  sendContractorAgreement,
  sendDeploymentForm,
  sendNudge,
  stall,
} from "./service.js";
import { scanAction } from "./spine.js";

/** The statuses the scanner touches (actionable + nudge-waiting). */
const SCAN_STATUSES = [
  ONBOARDING_STATUS.READY_TO_ONBOARD, // Screened - Pass
  ONBOARDING_STATUS.AGREEMENT_SENT, // Docs Sent
  ONBOARDING_STATUS.AGREEMENT_SIGNED, // Docs Signed
  ONBOARDING_STATUS.PAYMENT_SETUP_DONE,
  ONBOARDING_STATUS.USN_COMPLETE, // Training Complete
  ONBOARDING_STATUS.SENT_TO_KLOQD,
];

/**
 * One pass of the onboarding scanner. For each candidate in an actionable
 * status, run the single forward action its status implies (idempotent — each
 * action advances state via a persisted flag/status, so it never repeats). If
 * no action is due, evaluate the nudge/stall plan. Actions take priority so a
 * candidate is never both advanced and nudged in one tick.
 */
export async function runOnboardingScan(
  now: Date = new Date()
): Promise<{ scanned: number; acted: number; nudged: number; stalled: number }> {
  const candidates = await listByStatuses([...SCAN_STATUSES]);
  let acted = 0;
  let nudged = 0;
  let stalled = 0;

  for (const c of candidates) {
    try {
      if (await runAction(c, now)) {
        acted++;
        continue;
      }
      const decision = nextNudgeAction(c, now);
      if (decision.type === "nudge") {
        await sendNudge(c, decision.nextCount, now);
        nudged++;
      } else if (decision.type === "stall") {
        await stall(c, decision.stallStage, now);
        stalled++;
      }
    } catch (err) {
      log.error("onboarding scan: candidate failed", {
        email: c.email,
        status: c.status,
        error: String(err),
      });
    }
  }

  log.info("onboarding scan complete", { scanned: candidates.length, acted, nudged, stalled });
  return { scanned: candidates.length, acted, nudged, stalled };
}

async function runAction(c: Candidate, now: Date): Promise<boolean> {
  switch (scanAction(c)) {
    case "send_agreement":
      await sendContractorAgreement(c, now);
      return true;
    case "gusto_invite":
      await fireGustoInvite(c, now);
      return true;
    case "send_deployment_form":
      await sendDeploymentForm(c, now);
      return true;
    case "handoff_kloqd":
      await handoffToKloqd(c, now);
      return true;
    default:
      return false;
  }
}
