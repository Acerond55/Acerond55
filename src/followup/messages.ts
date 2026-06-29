import type { NudgeKind } from "./reminders.js";

export interface BuiltMessage {
  subject: string;
  body: string;
}

const SIGNOFF = "— Universal Staffing Networks";

export function onboardingMessage(name: string | undefined, url: string): BuiltMessage {
  const hi = name ? `Hi ${name},` : "Hi,";
  return {
    subject: "You're through — next step with Universal Staffing Networks",
    body: [
      hi,
      "",
      "Great news — you've passed our screening. Here's your onboarding link to get set up for events:",
      url,
      "",
      "It only takes a few minutes. Reply here if you hit any snags.",
      SIGNOFF,
    ].join("\n"),
  };
}

export function reminderMessage(
  kind: NudgeKind,
  name: string | undefined,
  url: string
): BuiltMessage {
  const hi = name ? `Hi ${name},` : "Hi,";
  if (kind === "day2") {
    return {
      subject: "Quick reminder: finish your USN onboarding",
      body: [
        hi,
        "",
        "Just a nudge — we still need you to finish onboarding so we can start scheduling you for events:",
        url,
        "",
        "Takes about 5 minutes.",
        SIGNOFF,
      ].join("\n"),
    };
  }
  return {
    subject: "Last reminder: your USN spot is waiting",
    body: [
      hi,
      "",
      "Final reminder to complete your onboarding so we can get you on upcoming events:",
      url,
      "",
      "If now isn't the right time, just let us know.",
      SIGNOFF,
    ].join("\n"),
  };
}
