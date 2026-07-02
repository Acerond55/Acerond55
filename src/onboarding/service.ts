import {
  findByEmail,
  setOnboardingStatus,
  updateCandidate,
} from "../airtable/candidates.js";
import { config } from "../config.js";
import {
  ONBOARDING_STATUS,
  resolveLanguage,
  type Candidate,
  type DeploymentData,
} from "../domain.js";
import { getSigner } from "../docusign/signer.js";
import { getKloqdClient, KloqdNotConfiguredError } from "../kloqd/client.js";
import { log } from "../lib/logger.js";
import { getNotifier } from "../notify/notifier.js";
import { canFlipTo, isDeploymentDataComplete } from "./spine.js";
import * as msg from "./messages.js";

const K = config.kloqd;

/** SMS a candidate in their language, unless they've opted out. */
async function notify(c: Candidate, text: string): Promise<void> {
  if (c.onboardingStatus === ONBOARDING_STATUS.OPTED_OUT) {
    log.warn("suppressing SMS to opted-out candidate", { email: c.email });
    return;
  }
  const to = c.phone || c.email;
  await getNotifier().sendSMS({ to, body: text });
}

function vars(c: Candidate): msg.MsgVars {
  return {
    name: c.name,
    email: c.email,
    formUrl: config.onboarding.dataFormUrl,
    signupUrl: K.signupUrl,
    joinCode: K.agencyJoinCode || "[set KLOQD_AGENCY_JOIN_CODE]",
  };
}

/**
 * Persist a forward status flip: stamps the per-stage timestamp and RESETS the
 * nudge counter (cross-cutting rule 1). Rejects non-forward flips.
 */
async function flip(
  c: Candidate,
  next: string,
  now: Date,
  extra: Partial<Omit<Candidate, "id" | "email">> = {}
): Promise<void> {
  if (!canFlipTo(c.onboardingStatus, next)) {
    log.warn("skipping non-forward onboarding flip", {
      email: c.email,
      from: c.onboardingStatus,
      to: next,
    });
    return;
  }
  await setOnboardingStatus(c.id, next, now, { onboardingNudgeCount: 0, ...extra });
}

// --- Step 1: contractor agreement ------------------------------------------
export async function sendContractorAgreement(c: Candidate, now = new Date()): Promise<void> {
  if (c.onboardingStatus !== ONBOARDING_STATUS.READY_TO_ONBOARD) return;
  const { envelopeId } = await getSigner().sendAgreement({
    email: c.email,
    name: c.name,
    templateId: config.docusign.icaTemplateId,
    includeW9: config.docusign.includeW9,
  });
  await notify(c, msg.agreementSentSms(vars(c), resolveLanguage(c.preferredLanguage)));
  await flip(c, ONBOARDING_STATUS.AGREEMENT_SENT, now, { docusignEnvelopeId: envelopeId });
  log.info("contractor agreement sent", { email: c.email, envelopeId });
}

// --- Step 2: agreement signed (DocuSign webhook) ---------------------------
export async function recordAgreementSigned(c: Candidate, now = new Date()): Promise<void> {
  await flip(c, ONBOARDING_STATUS.AGREEMENT_SIGNED, now);
  await notify(c, msg.agreementSignedSms(vars(c), resolveLanguage(c.preferredLanguage)));
  log.info("agreement signed recorded", { email: c.email });
}

// --- Step 3: Gusto invite + advance ----------------------------------------
export async function fireGustoInvite(c: Candidate, _now = new Date()): Promise<void> {
  if (c.onboardingStatus !== ONBOARDING_STATUS.AGREEMENT_SIGNED) return;
  if (c.gustoStatus === "Invited" || c.gustoStatus === "Complete") return;
  await notify(c, msg.gustoInviteSms(vars(c), resolveLanguage(c.preferredLanguage)));
  await updateCandidate(c.id, { gustoStatus: "Invited" });
  log.info("gusto invite sent", { email: c.email });
}

export async function advancePaymentSetup(c: Candidate, now = new Date()): Promise<void> {
  if (c.onboardingStatus !== ONBOARDING_STATUS.AGREEMENT_SIGNED) return;
  if (c.gustoStatus !== "Complete") return;
  await flip(c, ONBOARDING_STATUS.PAYMENT_SETUP_DONE, now);
  log.info("payment setup done", { email: c.email });
}

// --- Step 4: deployment data -----------------------------------------------
export async function sendDeploymentForm(c: Candidate, _now = new Date()): Promise<void> {
  if (c.onboardingStatus !== ONBOARDING_STATUS.PAYMENT_SETUP_DONE) return;
  if (c.deploymentFormSent) return;
  await notify(c, msg.deploymentFormSms(vars(c), resolveLanguage(c.preferredLanguage)));
  await updateCandidate(c.id, { deploymentFormSent: true });
  log.info("deployment form sent", { email: c.email });
}

export async function recordDeploymentData(
  email: string,
  data: DeploymentData,
  now = new Date()
): Promise<{ complete: boolean }> {
  const c = await findByEmail(email);
  if (!c) {
    log.warn("deployment data for unknown candidate", { email });
    return { complete: false };
  }
  await updateCandidate(c.id, { ...data });
  const merged = { ...c, ...data };
  if (isDeploymentDataComplete(merged)) {
    await flip(c, ONBOARDING_STATUS.USN_COMPLETE, now, { deploymentFormDone: true });
    log.info("deployment data complete — USN Complete", { email });
    return { complete: true };
  }
  log.info("deployment data saved (incomplete — need Availability + Roles)", { email });
  return { complete: false };
}

// --- Step 5: handoff to kloqd (Phase A now; Phase B push if configured) -----
export async function handoffToKloqd(c: Candidate, now = new Date()): Promise<void> {
  if (c.onboardingStatus !== ONBOARDING_STATUS.USN_COMPLETE) return;

  let workerId: string | undefined;
  const kloqd = getKloqdClient();
  if (kloqd.configured) {
    // Phase B: pre-fill the signup so the SMS just confirms.
    try {
      workerId = (await kloqd.pushWorker(c)).workerId;
    } catch (err) {
      if (!(err instanceof KloqdNotConfiguredError)) throw err;
    }
  }
  // Phase A always runs: SMS the signup link + join code.
  await notify(c, msg.kloqdHandoffSms(vars(c), resolveLanguage(c.preferredLanguage)));
  await flip(c, ONBOARDING_STATUS.SENT_TO_KLOQD, now, { kloqdWorkerId: workerId });
  log.info("kloqd handoff sent (Phase A)", { email: c.email, workerId, phaseB: kloqd.configured });
}

// --- Step 6: deployable ----------------------------------------------------
export async function markDeployable(
  c: Candidate,
  now = new Date(),
  workerId?: string
): Promise<void> {
  await flip(c, ONBOARDING_STATUS.DEPLOYABLE, now, workerId ? { kloqdWorkerId: workerId } : {});
  await notify(c, msg.welcomeSms(vars(c), resolveLanguage(c.preferredLanguage)));
  log.info("worker is Deployable", { email: c.email });
}

// --- Nudges & stalls -------------------------------------------------------
export async function sendNudge(c: Candidate, nextCount: number, now = new Date()): Promise<void> {
  const status = c.onboardingStatus ?? "";
  await notify(c, msg.nudgeSms(status, vars(c), resolveLanguage(c.preferredLanguage)));
  await updateCandidate(c.id, {
    onboardingNudgeCount: nextCount,
    lastNudgeDate: now.toISOString(),
  });
  log.info("nudge sent", { email: c.email, status, nudge: nextCount });
}

/** Park a candidate in Onboarding Stalled (records where they froze). */
export async function stall(c: Candidate, stallStage: string, now = new Date()): Promise<void> {
  await setOnboardingStatus(c.id, ONBOARDING_STATUS.STALLED, now, { stallStage });
  log.info("candidate stalled", { email: c.email, stallStage });
}

// --- STOP / opt-out (global, permanent) ------------------------------------
export async function optOut(c: Candidate, now = new Date()): Promise<void> {
  await setOnboardingStatus(c.id, ONBOARDING_STATUS.OPTED_OUT, now);
  // Void any open DocuSign envelope so nothing lingers.
  const signer = getSigner();
  if (c.docusignEnvelopeId && signer.voidEnvelope) {
    try {
      await signer.voidEnvelope(c.docusignEnvelopeId, "Candidate opted out (STOP)");
    } catch (err) {
      log.warn("could not void envelope on opt-out", { email: c.email, error: String(err) });
    }
  }
  log.info("candidate opted out (STOP) — all messaging halted", { email: c.email });
}

// --- Edge cases ------------------------------------------------------------
/** DocuSign email bounced → SMS for a better email; caller resends envelope. */
export async function handleEmailBounce(c: Candidate): Promise<void> {
  await notify(c, msg.emailBounceSms(vars(c), resolveLanguage(c.preferredLanguage)));
  log.warn("docusign email bounced — asked candidate for a better email", { email: c.email });
}

/** DocuSign envelope declined → stall + flag for a personal call. */
export async function handleDecline(c: Candidate, now = new Date()): Promise<void> {
  await stall(c, ONBOARDING_STATUS.AGREEMENT_SENT, now);
  log.warn("envelope DECLINED — flagged for a personal call (not a robot text)", {
    email: c.email,
  });
}

export { KloqdNotConfiguredError };
