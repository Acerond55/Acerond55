import { Router, type Request, type Response } from "express";
import {
  findByEmail,
  findByEnvelopeId,
  updateCandidate,
} from "../airtable/candidates.js";
import { config } from "../config.js";
import { log } from "../lib/logger.js";
import { runOnboardingScan } from "../onboarding/scanner.js";
import {
  markDeployable,
  recordAgreementSigned,
  recordDeploymentData,
} from "../onboarding/service.js";
import { verifyDocuSign, verifyKloqd } from "./verify.js";

export const onboardingRouter = Router();

/** Shared-secret guard for the admin/interviewer-facing endpoints. */
function interviewerOk(req: Request): boolean {
  const expected = config.interviewerSecret;
  return Boolean(expected) && req.header("x-interviewer-secret") === expected;
}

/**
 * STEP 2 — DocuSign Connect webhook. Fires on envelope completion → marks the
 * candidate Agreement Signed. Matches by envelope id (preferred) or email.
 */
onboardingRouter.post("/webhooks/docusign", async (req: Request, res: Response) => {
  const v = verifyDocuSign(req);
  if (!v.ok) {
    log.warn("docusign webhook rejected", { reason: v.reason });
    return res.status(401).json({ error: v.reason });
  }
  const body = (req.body ?? {}) as Record<string, any>;
  const status: string =
    body.status ?? body.event ?? body.data?.envelopeSummary?.status ?? "";
  const envelopeId: string | undefined =
    body.envelopeId ?? body.data?.envelopeId ?? body.data?.envelopeSummary?.envelopeId;
  const email: string | undefined =
    body.email ?? body.recipientEmail ?? body.data?.recipientEmail;

  const isComplete = /complete/i.test(String(status));
  if (!isComplete) {
    log.info("docusign webhook ignored (not completed)", { status });
    return res.json({ ok: true, ignored: true });
  }

  try {
    const c = envelopeId
      ? await findByEnvelopeId(envelopeId)
      : email
        ? await findByEmail(email)
        : null;
    if (!c) {
      log.warn("docusign completion: no matching candidate", { envelopeId, email });
      return res.status(404).json({ error: "candidate not found" });
    }
    await recordAgreementSigned(c, new Date());
    return res.json({ ok: true });
  } catch (err) {
    log.error("docusign processing failed", { error: String(err) });
    return res.status(500).json({ error: "processing failed" });
  }
});

/**
 * STEP 3 — mark Gusto setup complete (manual). Ticks the checkbox so the next
 * scan advances the candidate to Payment Setup Done. Airtable-button friendly.
 * Body: { email }
 */
onboardingRouter.post("/onboarding/gusto-done", async (req: Request, res: Response) => {
  if (!interviewerOk(req)) return res.status(401).json({ error: "unauthorized" });
  const email = (req.body ?? {}).email;
  if (typeof email !== "string") {
    return res.status(400).json({ error: "require { email }" });
  }
  const c = await findByEmail(email);
  if (!c) return res.status(404).json({ error: "candidate not found" });
  await updateCandidate(c.id, { gustoSetupComplete: true });
  log.info("gusto setup marked complete", { email });
  return res.json({ ok: true });
});

/**
 * STEP 4 — deployment-data form submission. Saves the lean fields; flips to
 * USN Complete once the full set is present. Wire your Airtable/HTML form here.
 * Body: { email, availability, roles, transport, attireSize, hasBlackAttire, certs }
 */
onboardingRouter.post("/onboarding/deployment-data", async (req: Request, res: Response) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  if (typeof b.email !== "string") {
    return res.status(400).json({ error: "require { email, ...fields }" });
  }
  try {
    const result = await recordDeploymentData(b.email, {
      availability: typeof b.availability === "string" ? b.availability : undefined,
      roles: typeof b.roles === "string" ? b.roles : undefined,
      transport: typeof b.transport === "string" ? b.transport : undefined,
      attireSize: typeof b.attireSize === "string" ? b.attireSize : undefined,
      hasBlackAttire:
        typeof b.hasBlackAttire === "boolean" ? b.hasBlackAttire : undefined,
      certs: typeof b.certs === "string" ? b.certs : undefined,
    });
    return res.json({ ok: true, ...result });
  } catch (err) {
    log.error("deployment-data processing failed", { error: String(err) });
    return res.status(500).json({ error: "processing failed" });
  }
});

/**
 * STEP 6 — kloqd reports worker-onboarding-complete → Deployable.
 * BLOCKED-path note: the exact signal shape is a [CONFIRM, from kloqd] blank;
 * this validates a shared secret and matches by kloqd worker id or email.
 * Body: { workerId?, email? }
 */
onboardingRouter.post("/webhooks/kloqd", async (req: Request, res: Response) => {
  const v = verifyKloqd(req);
  if (!v.ok) {
    log.warn("kloqd webhook rejected", { reason: v.reason });
    return res.status(401).json({ error: v.reason });
  }
  const b = (req.body ?? {}) as Record<string, any>;
  const email: string | undefined = b.email ?? b.worker?.email;
  if (typeof email !== "string") {
    return res.status(400).json({ error: "require { email } (or worker.email)" });
  }
  try {
    const c = await findByEmail(email);
    if (!c) return res.status(404).json({ error: "candidate not found" });
    await markDeployable(c);
    return res.json({ ok: true });
  } catch (err) {
    log.error("kloqd webhook processing failed", { error: String(err) });
    return res.status(500).json({ error: "processing failed" });
  }
});

/** Run the onboarding scan now (alternative to the in-process scheduler). */
onboardingRouter.post("/tasks/run-onboarding", async (_req: Request, res: Response) => {
  try {
    const result = await runOnboardingScan();
    return res.json({ ok: true, ...result });
  } catch (err) {
    log.error("manual onboarding scan failed", { error: String(err) });
    return res.status(500).json({ error: "scan failed" });
  }
});
