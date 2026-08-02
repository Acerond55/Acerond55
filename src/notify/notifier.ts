import { config } from "../config.js";
import { log } from "../lib/logger.js";

export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
}

export interface SmsMessage {
  to: string;
  body: string;
}

/**
 * All candidate-facing sending goes through this interface so business logic
 * never depends on a specific provider. Swap the implementation (Instantly,
 * Resend, Twilio, …) without touching the follow-up sequence.
 */
export interface Notifier {
  readonly name: string;
  sendEmail(msg: EmailMessage): Promise<void>;
  sendSMS(msg: SmsMessage): Promise<void>;
}

/**
 * Default implementation: log only. Used as the no-op in development and
 * whenever DRY_RUN is on. Never touches the network.
 */
export const consoleNotifier: Notifier = {
  name: "console",
  async sendEmail(msg: EmailMessage): Promise<void> {
    log.info("[notifier:console] EMAIL", {
      to: msg.to,
      subject: msg.subject,
      body: msg.body,
    });
  },
  async sendSMS(msg: SmsMessage): Promise<void> {
    log.info("[notifier:console] SMS", { to: msg.to, body: msg.body });
  },
};

/**
 * EXAMPLE real adapter — illustrative only, clearly marked.
 *
 * Demonstrates how a provider plugs in: read credentials from config, POST to
 * the provider, surface failures. Replace the fetch bodies with your provider's
 * actual API (this skeleton targets a Resend-style email API and a Twilio-style
 * SMS API). It is NOT wired to a live provider out of the box.
 */
export function makeExampleNotifier(apiKey: string): Notifier {
  return {
    name: "example",
    async sendEmail(msg: EmailMessage): Promise<void> {
      if (!apiKey) {
        log.warn(
          "[notifier:example] no NOTIFIER_API_KEY set — falling back to console"
        );
        return consoleNotifier.sendEmail(msg);
      }
      // Example shape (Resend-style). Replace with your provider's contract.
      const res = await fetch("https://api.example-email.com/v1/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: config.notifier.fromEmail,
          to: msg.to,
          subject: msg.subject,
          text: msg.body,
        }),
      });
      if (!res.ok) {
        throw new Error(
          `[notifier:example] email send failed: ${res.status} ${res.statusText}`
        );
      }
    },
    async sendSMS(msg: SmsMessage): Promise<void> {
      if (!apiKey) {
        log.warn(
          "[notifier:example] no NOTIFIER_API_KEY set — falling back to console"
        );
        return consoleNotifier.sendSMS(msg);
      }
      // Example shape (Twilio-style). Replace with your provider's contract.
      const res = await fetch("https://api.example-sms.com/v1/messages", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: config.notifier.fromSms,
          to: msg.to,
          body: msg.body,
        }),
      });
      if (!res.ok) {
        throw new Error(
          `[notifier:example] sms send failed: ${res.status} ${res.statusText}`
        );
      }
    },
  };
}

/**
 * Select the notifier. In DRY_RUN we always use the console notifier so a
 * misconfigured provider can never send anything during testing.
 */
export function getNotifier(): Notifier {
  if (config.dryRun) return consoleNotifier;
  switch (config.notifier.provider) {
    case "example":
      return makeExampleNotifier(config.notifier.apiKey);
    case "console":
    default:
      return consoleNotifier;
  }
}
