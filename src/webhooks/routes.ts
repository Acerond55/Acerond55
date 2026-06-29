import { Router, type Request, type Response } from "express";
import { config } from "../config.js";
import { log } from "../lib/logger.js";
import { runReminders } from "../followup/sequence.js";
import {
  processCallBooked,
  processCallNoShow,
  processCallOutcome,
  processVideoScreen,
} from "../services/processScreen.js";
import { parseCalendly, parseVideoAsk } from "./parse.js";
import { verifyCalendly, verifyVideoAsk } from "./verify.js";

export const router = Router();

router.post("/webhooks/videoask", async (req: Request, res: Response) => {
  const v = verifyVideoAsk(req);
  if (!v.ok) {
    log.warn("videoask webhook rejected", { reason: v.reason });
    return res.status(401).json({ error: v.reason });
  }
  const parsed = parseVideoAsk(req.body);
  if (!parsed) {
    log.warn("videoask webhook: could not parse email from payload");
    return res.status(400).json({ error: "no candidate email in payload" });
  }
  try {
    const result = await processVideoScreen(parsed);
    return res.json({ ok: true, ...result });
  } catch (err) {
    log.error("videoask processing failed", { error: String(err) });
    return res.status(500).json({ error: "processing failed" });
  }
});

router.post("/webhooks/calendly", async (req: Request, res: Response) => {
  const v = verifyCalendly(req);
  if (!v.ok) {
    log.warn("calendly webhook rejected", { reason: v.reason });
    return res.status(401).json({ error: v.reason });
  }
  const parsed = parseCalendly(req.body);
  if (!parsed) {
    log.warn("calendly webhook: could not parse email from payload");
    return res.status(400).json({ error: "no invitee email in payload" });
  }
  try {
    if (parsed.kind === "booked") {
      await processCallBooked(parsed.email, parsed.name);
    } else if (parsed.kind === "no_show") {
      await processCallNoShow(parsed.email, parsed.name);
    } else {
      log.info("calendly event ignored (not booked/no_show)", {
        email: parsed.email,
      });
    }
    return res.json({ ok: true, kind: parsed.kind });
  } catch (err) {
    log.error("calendly processing failed", { error: String(err) });
    return res.status(500).json({ error: "processing failed" });
  }
});

/**
 * Interviewer marks a live call pass/fail. Authenticated with a shared secret
 * (X-Interviewer-Secret) so it can be wired to an Airtable button / simple form.
 * Body: { email, decision: "pass" | "fail", notes?, name? }
 */
router.post("/call-outcome", async (req: Request, res: Response) => {
  const expected = config.interviewerSecret;
  const provided = req.header("x-interviewer-secret");
  if (!expected) {
    return res
      .status(503)
      .json({ error: "INTERVIEWER_SECRET not configured on server" });
  }
  if (provided !== expected) {
    return res.status(401).json({ error: "bad interviewer secret" });
  }
  const { email, decision, notes, name } = req.body ?? {};
  if (typeof email !== "string" || (decision !== "pass" && decision !== "fail")) {
    return res
      .status(400)
      .json({ error: "require { email, decision: 'pass'|'fail' }" });
  }
  try {
    const result = await processCallOutcome(email, decision, notes, name);
    return res.json({ ok: true, ...result });
  } catch (err) {
    log.error("call-outcome processing failed", { error: String(err) });
    return res.status(500).json({ error: "processing failed" });
  }
});

/** External-cron trigger for the reminder scan (alternative to in-process scheduler). */
router.post("/tasks/run-reminders", async (_req: Request, res: Response) => {
  try {
    const result = await runReminders();
    return res.json({ ok: true, ...result });
  } catch (err) {
    log.error("manual reminder run failed", { error: String(err) });
    return res.status(500).json({ error: "reminder run failed" });
  }
});
