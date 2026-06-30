import { listByOnboardingStatus } from "../airtable/candidates.js";
import { ONBOARDING_STATUS, type Candidate } from "../domain.js";
import { KloqdNotConfiguredError } from "../kloqd/client.js";
import { log } from "../lib/logger.js";
import {
  advancePaymentSetup,
  pushToKloqd,
  sendContractorAgreement,
} from "./service.js";
import { scanAction } from "./spine.js";

/**
 * One pass of the status-driven onboarding scanner. For each candidate sitting
 * at an actionable status, runs the single action that status implies. The
 * action flips the status forward, so the same record is never processed twice
 * — the scan is idempotent across ticks and restarts.
 *
 * kloqd pushes (Step 5) are intentionally allowed to fail loudly-but-softly:
 * when kloqd is unconfigured the candidate stays at USN Complete and we log the
 * block rather than crashing the scan.
 */
export async function runOnboardingScan(
  now: Date = new Date()
): Promise<{ scanned: number; acted: number; blocked: number }> {
  const statuses = [
    ONBOARDING_STATUS.READY_TO_ONBOARD,
    ONBOARDING_STATUS.AGREEMENT_SIGNED,
    ONBOARDING_STATUS.USN_COMPLETE,
  ];

  let scanned = 0;
  let acted = 0;
  let blocked = 0;

  for (const status of statuses) {
    const candidates = await listByOnboardingStatus(status);
    scanned += candidates.length;
    for (const c of candidates) {
      try {
        const did = await act(c);
        if (did) acted++;
      } catch (err) {
        if (err instanceof KloqdNotConfiguredError) {
          blocked++;
          log.warn("onboarding scan: kloqd push blocked", {
            email: c.email,
            detail: err.message.split("\n")[0],
          });
        } else {
          log.error("onboarding scan: action failed", {
            email: c.email,
            status: c.onboardingStatus,
            error: String(err),
          });
        }
      }
    }
  }

  log.info("onboarding scan complete", { scanned, acted, blocked });
  return { scanned, acted, blocked };
}

async function act(c: Candidate): Promise<boolean> {
  switch (scanAction(c)) {
    case "send_agreement":
      await sendContractorAgreement(c);
      return true;
    case "advance_payment":
      await advancePaymentSetup(c);
      return true;
    case "push_kloqd":
      await pushToKloqd(c);
      return true;
    default:
      return false;
  }
}
