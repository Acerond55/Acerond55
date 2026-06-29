import crypto from "node:crypto";
import type { Request } from "express";
import { config } from "../config.js";
import { log } from "../lib/logger.js";

export interface VerifyResult {
  ok: boolean;
  reason?: string;
}

/**
 * VideoAsk does not sign payloads, so we validate a shared secret supplied
 * either as the `X-Webhook-Secret` header or a `?secret=` query param. If no
 * secret is configured we allow the request but warn (useful for local dev).
 */
export function verifyVideoAsk(req: Request): VerifyResult {
  const expected = config.videoask.webhookSecret;
  if (!expected) {
    log.warn(
      "VIDEOASK_WEBHOOK_SECRET not set — accepting webhook without verification (dev only)"
    );
    return { ok: true };
  }
  const provided =
    req.header("x-webhook-secret") ??
    (typeof req.query.secret === "string" ? req.query.secret : undefined);
  if (!provided) return { ok: false, reason: "missing shared secret" };
  if (!timingSafeEqual(provided, expected)) {
    return { ok: false, reason: "shared secret mismatch" };
  }
  return { ok: true };
}

/**
 * Calendly signs webhooks with an HMAC-SHA256 over `${t}.${rawBody}` where the
 * `Calendly-Webhook-Signature` header is `t=<unix>,v1=<hex>`. We need the RAW
 * request body for this — see server.ts (express.json `verify` captures it).
 */
export function verifyCalendly(req: Request): VerifyResult {
  const key = config.calendly.webhookSigningKey;
  if (!key) {
    log.warn(
      "CALENDLY_WEBHOOK_SIGNING_KEY not set — accepting webhook without verification (dev only)"
    );
    return { ok: true };
  }
  const header = req.header("calendly-webhook-signature");
  if (!header) return { ok: false, reason: "missing signature header" };

  const parts = Object.fromEntries(
    header.split(",").map((kv) => {
      const [k, v] = kv.split("=");
      return [k?.trim(), v?.trim()];
    })
  ) as { t?: string; v1?: string };

  if (!parts.t || !parts.v1) return { ok: false, reason: "malformed signature" };

  const raw = (req as Request & { rawBody?: string }).rawBody ?? "";
  const expected = crypto
    .createHmac("sha256", key)
    .update(`${parts.t}.${raw}`)
    .digest("hex");

  if (!timingSafeEqual(parts.v1, expected)) {
    return { ok: false, reason: "signature mismatch" };
  }
  return { ok: true };
}

function timingSafeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}
