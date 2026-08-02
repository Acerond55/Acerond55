import { Router, type Request, type Response } from "express";
import {
  findByEmail,
  findByEnvelopeId,
  findByPhone,
  updateCandidate,
} from "../airtable/candidates.js";
import { config } from "../config.js";
import { log } from "../lib/logger.js";
import { runOnboardingScan } from "../onboarding/scanner.js";
import { runWeeklyDigest } from "../onboarding/digest.js";
import {
  handleDecline,
  handleEmailBounce,
  markDeployable,
  markPaymentSetupDone,
  optOut,
  recordAgreementSigned,
  recordDeploymentData,
} from "../onboarding/service.js";
import { verifyDocuSign, verifyKloqd } from "./verify.js";

export const onboardingRouter = Router();

function interviewerOk(req: Request): boolean {
  const expected = config.interviewerSecret;
  return Boolean(expected) && req.header("x-interviewer-secret") === expected;
}

function sharedSecretOk(req: Request, expected: string): boolean {
  if (!expected) {
    log.warn("shared secret not configured — accepting request (dev only)");
    return true;
  }
  const provided =
    req.header("x-webhook-secret") ??
    (typeof req.query.secret === "string" ? req.query.secret : undefined);
  return provided === expected;
}

/** STEP 2 — DocuSign Connect webhook: completed / declined / bounced. */
onboardingRouter.post("/webhooks/docusign", async (req: Request, res: Response) => {
  const v = verifyDocuSign(req);
  if (!v.ok) {
    log.warn("docusign webhook rejected", { reason: v.reason });
    return res.status(401).json({ error: v.reason });
  }
  const body = (req.body ?? {}) as Record<string, any>;
  const status: string = String(
    body.status ?? body.event ?? body.data?.envelopeSummary?.status ?? ""
  ).toLowerCase();
  const envelopeId: string | undefined =
    body.envelopeId ?? body.data?.envelopeId ?? body.data?.envelopeSummary?.envelopeId;
  const email: string | undefined =
    body.email ?? body.recipientEmail ?? body.data?.recipientEmail;
  const bounced = Boolean(body.bounced) || /autoresponded/i.test(String(body.recipientStatus ?? ""));

  try {
    const c = envelopeId
      ? await findByEnvelopeId(envelopeId)
      : email
        ? await findByEmail(email)
        : null;
    if (!c) {
      log.warn("docusign webhook: no matching candidate", { envelopeId, email });
      return res.status(404).json({ error: "candidate not found" });
    }

    if (bounced) {
      await handleEmailBounce(c);
      return res.json({ ok: true, handled: "bounce" });
    }
    if (status.includes("declined")) {
      await handleDecline(c);
      return res.json({ ok: true, handled: "declined" });
    }
    if (status.includes("complete")) {
      // W-9 validity guard: money can't move without a valid W-9.
      if (body.w9Valid === false) {
        log.warn("envelope completed but W-9 invalid — held for manual review", {
          email: c.email,
        });
        return res.json({ ok: true, handled: "w9-invalid-hold" });
      }
      await recordAgreementSigned(c);
      return res.json({ ok: true, handled: "signed" });
    }
    log.info("docusign webhook ignored", { status });
    return res.json({ ok: true, ignored: true });
  } catch (err) {
    log.error("docusign processing failed", { error: String(err) });
    return res.status(500).json({ error: "processing failed" });
  }
});

/** STEP 3 — Gusto/direct-deposit complete → advance to Payment Setup Done.
 *  Body: { email }. Airtable-button or Gusto-webhook friendly. */
onboardingRouter.post("/onboarding/payment-done", async (req: Request, res: Response) => {
  if (!interviewerOk(req)) return res.status(401).json({ error: "unauthorized" });
  const email = (req.body ?? {}).email;
  if (typeof email !== "string") {
    return res.status(400).json({ error: "require { email }" });
  }
  const c = await findByEmail(email);
  if (!c) return res.status(404).json({ error: "candidate not found" });
  await markPaymentSetupDone(c);
  log.info("payment setup marked done", { email });
  return res.json({ ok: true });
});

/** STEP 4 — deployment-data form submission. Multi-selects arrive as arrays. */
onboardingRouter.post("/onboarding/deployment-data", async (req: Request, res: Response) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  if (typeof b.email !== "string") {
    return res.status(400).json({ error: "require { email, ...fields }" });
  }
  const asArr = (v: unknown) =>
    Array.isArray(v) ? v.map(String) : typeof v === "string" && v ? [v] : undefined;
  try {
    const result = await recordDeploymentData(b.email, {
      availability: asArr(b.availability),
      roles: asArr(b.roles),
      certs: asArr(b.certs),
      hasTransport: typeof b.hasTransport === "boolean" ? b.hasTransport : undefined,
      shirtSize: typeof b.shirtSize === "string" ? b.shirtSize : undefined,
      hasBlackAttire: typeof b.hasBlackAttire === "boolean" ? b.hasBlackAttire : undefined,
    });
    return res.json({ ok: true, ...result });
  } catch (err) {
    log.error("deployment-data processing failed", { error: String(err) });
    return res.status(500).json({ error: "processing failed" });
  }
});

/** STEP 6 — kloqd worker-onboarding-complete → Deployable (Phase B webhook). */
onboardingRouter.post("/webhooks/kloqd", async (req: Request, res: Response) => {
  const v = verifyKloqd(req);
  if (!v.ok) {
    log.warn("kloqd webhook rejected", { reason: v.reason });
    return res.status(401).json({ error: v.reason });
  }
  const b = (req.body ?? {}) as Record<string, any>;
  const email: string | undefined = b.email ?? b.worker?.email;
  const workerId: string | undefined = b.workerId ?? b.worker?.id;
  if (typeof email !== "string") {
    return res.status(400).json({ error: "require { email } (or worker.email)" });
  }
  try {
    const c = await findByEmail(email);
    if (!c) return res.status(404).json({ error: "candidate not found" });
    await markDeployable(c, new Date(), workerId);
    return res.json({ ok: true });
  } catch (err) {
    log.error("kloqd webhook processing failed", { error: String(err) });
    return res.status(500).json({ error: "processing failed" });
  }
});

/** STEP 6 (Phase A interim) — manual Deployable flip from the kloqd dashboard.
 *  Body: { email, workerId? }. Used until the kloqd completion webhook exists. */
onboardingRouter.post("/onboarding/mark-deployable", async (req: Request, res: Response) => {
  if (!interviewerOk(req)) return res.status(401).json({ error: "unauthorized" });
  const { email, workerId } = (req.body ?? {}) as Record<string, unknown>;
  if (typeof email !== "string") return res.status(400).json({ error: "require { email }" });
  const c = await findByEmail(email);
  if (!c) return res.status(404).json({ error: "candidate not found" });
  await markDeployable(c, new Date(), typeof workerId === "string" ? workerId : undefined);
  return res.json({ ok: true });
});

/** Inbound SMS webhook — STOP handling (global, permanent opt-out). */
onboardingRouter.post("/webhooks/sms-inbound", async (req: Request, res: Response) => {
  if (!sharedSecretOk(req, config.onboarding.smsInboundSecret)) {
    return res.status(401).json({ error: "bad shared secret" });
  }
  const b = (req.body ?? {}) as Record<string, any>;
  const from: string | undefined = b.from ?? b.From ?? b.phone;
  const email: string | undefined = b.email;
  const text: string = String(b.text ?? b.Body ?? b.body ?? "");

  if (!/^\s*stop\b/i.test(text)) {
    return res.json({ ok: true, handled: "ignored (not STOP)" });
  }
  try {
    const c = from ? await findByPhone(from) : email ? await findByEmail(email) : null;
    if (!c) {
      log.warn("STOP received but no matching candidate", { from, email });
      return res.status(404).json({ error: "candidate not found" });
    }
    await optOut(c);
    return res.json({ ok: true, handled: "opted-out" });
  } catch (err) {
    log.error("sms-inbound processing failed", { error: String(err) });
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

/** Run the weekly digest now (wire a cron to this for Monday 8am ET). */
onboardingRouter.post("/tasks/weekly-digest", async (_req: Request, res: Response) => {
  try {
    const digest = await runWeeklyDigest();
    return res.json({ ok: true, digest });
  } catch (err) {
    log.error("manual weekly digest failed", { error: String(err) });
    return res.status(500).json({ error: "digest failed" });
  }
});
