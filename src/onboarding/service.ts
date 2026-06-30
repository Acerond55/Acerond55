import { findByEmail, updateCandidate } from "../airtable/candidates.js";
import { config } from "../config.js";
import {
  ONBOARDING_STATUS,
  type Candidate,
  type DeploymentData,
} from "../domain.js";
import { getSigner } from "../docusign/signer.js";
import { getKloqdClient, KloqdNotConfiguredError } from "../kloqd/client.js";
import { log } from "../lib/logger.js";
import { getNotifier } from "../notify/notifier.js";
import { canFlipTo, isDeploymentDataComplete } from "./spine.js";

/** Flip onboarding status only if it moves forward; otherwise log and skip. */
async function flip(
  c: Candidate,
  next: string,
  extra: Partial<Candidate> = {}
): Promise<void> {
  if (!canFlipTo(c.onboardingStatus, next)) {
    log.warn("skipping non-forward onboarding flip", {
      email: c.email,
      from: c.onboardingStatus,
      to: next,
    });
    return;
  }
  await updateCandidate(c.id, { onboardingStatus: next, ...extra });
}

/**
 * STEP 1 — send the contractor agreement (ICA + Schedule A, optionally W-9 in
 * the same envelope). Trigger: Onboarding Status = Ready to Onboard.
 * Write-back: DocuSign Envelope ID. Status flip: Agreement Sent.
 */
export async function sendContractorAgreement(c: Candidate): Promise<void> {
  if (c.onboardingStatus !== ONBOARDING_STATUS.READY_TO_ONBOARD) return;
  const signer = getSigner();
  const { envelopeId } = await signer.sendAgreement({
    email: c.email,
    name: c.name,
    templateId: config.docusign.icaTemplateId,
    includeW9: config.docusign.includeW9,
  });
  await flip(c, ONBOARDING_STATUS.AGREEMENT_SENT, {
    docusignEnvelopeId: envelopeId,
  });
  log.info("contractor agreement sent", { email: c.email, envelopeId });
}

/**
 * STEP 2 — DocuSign "envelope completed". Trigger: webhook.
 * Write-back: Agreement Signed At. Status flip: Agreement Signed.
 */
export async function recordAgreementSigned(
  c: Candidate,
  signedAt: Date
): Promise<void> {
  await flip(c, ONBOARDING_STATUS.AGREEMENT_SIGNED, {
    agreementSignedAt: signedAt.toISOString(),
  });
  log.info("agreement signed recorded", { email: c.email });
}

/**
 * STEP 3 — direct deposit (Gusto). Gusto sends its own invite (manual by
 * default). When the interviewer/admin ticks "Gusto Setup Complete", advance.
 * Status flip: Payment Setup Done, then text the lean-data form (Step 4 entry).
 */
export async function advancePaymentSetup(c: Candidate): Promise<void> {
  if (c.onboardingStatus !== ONBOARDING_STATUS.AGREEMENT_SIGNED) return;
  if (!c.gustoSetupComplete) return;
  await flip(c, ONBOARDING_STATUS.PAYMENT_SETUP_DONE);

  // Entry action for Step 4: text the candidate the deployment-data form link.
  const notifier = getNotifier();
  await notifier.sendSMS({
    to: c.email,
    body:
      "USN: one last step — tell us your availability, roles, transport & attire " +
      `so we can put you on events: ${config.onboarding.dataFormUrl}`,
  });
  log.info("payment setup done; data form sent", { email: c.email });
}

/**
 * STEP 4 — collect lean deployment data. Trigger: the data form submission.
 * Write-back: the lean fields. Status flip: USN Complete (only when complete).
 */
export async function recordDeploymentData(
  email: string,
  data: DeploymentData
): Promise<{ complete: boolean }> {
  const c = await findByEmail(email);
  if (!c) {
    log.warn("deployment data for unknown candidate", { email });
    return { complete: false };
  }
  await updateCandidate(c.id, { ...data });

  const merged = { ...c, ...data };
  if (isDeploymentDataComplete(merged)) {
    await flip(
      { ...c, ...data },
      ONBOARDING_STATUS.USN_COMPLETE
    );
    log.info("deployment data complete — USN Complete", { email });
    return { complete: true };
  }
  log.info("deployment data saved (incomplete)", { email });
  return { complete: false };
}

/**
 * STEP 5 — push to kloqd. Trigger: Onboarding Status = USN Complete.
 * BLOCKED until kloqd facts are configured (throws KloqdNotConfiguredError,
 * which the scanner catches and logs without flipping status).
 * Write-back: kloqd Worker ID. Status flip: Sent to kloqd, then text join link.
 */
export async function pushToKloqd(c: Candidate): Promise<void> {
  if (c.onboardingStatus !== ONBOARDING_STATUS.USN_COMPLETE) return;
  const kloqd = getKloqdClient();
  const { workerId } = await kloqd.pushWorker(c);

  await flip(c, ONBOARDING_STATUS.SENT_TO_KLOQD, {
    kloqdWorkerId: workerId,
  });

  // Action B: text the candidate their kloqd link + agency join code.
  const notifier = getNotifier();
  await notifier.sendSMS({
    to: c.email,
    body:
      "USN: you're cleared! Finish in kloqd to start getting shifts. " +
      `Agency join code: ${config.kloqd.agencyJoinCode || "[set KLOQD_AGENCY_JOIN_CODE]"}`,
  });
  log.info("pushed to kloqd", { email: c.email, workerId });
}

/**
 * STEP 6 — kloqd reports onboarding complete. Trigger: kloqd webhook/poll.
 * Status flip: Deployable (the state kloqd's shift-fill agent keys off).
 */
export async function markDeployable(c: Candidate): Promise<void> {
  await flip(c, ONBOARDING_STATUS.DEPLOYABLE);
  log.info("worker is Deployable", { email: c.email });
}

export { KloqdNotConfiguredError };
