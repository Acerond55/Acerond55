import "dotenv/config";

function str(name: string, fallback?: string): string {
  const v = process.env[name];
  if (v === undefined || v === "") {
    if (fallback !== undefined) return fallback;
    return "";
  }
  return v;
}

function bool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Centralised, typed view of all environment configuration.
 * Nothing else in the codebase should read process.env directly.
 */
export const config = {
  port: num("PORT", 3000),
  dryRun: bool("DRY_RUN", true),

  airtable: {
    token: str("AIRTABLE_TOKEN"),
    baseId: str("AIRTABLE_BASE_ID"),
    candidatesTable: str("AIRTABLE_CANDIDATES_TABLE", "Candidates"),
    fields: {
      email: str("AIRTABLE_FIELD_EMAIL", "Email"),
      name: str("AIRTABLE_FIELD_NAME", "Name"),
      status: str("AIRTABLE_FIELD_STATUS", "Status"),
      screenType: str("AIRTABLE_FIELD_SCREEN_TYPE", "Screen Type"),
      answers: str("AIRTABLE_FIELD_ANSWERS", "Answers"),
      score: str("AIRTABLE_FIELD_SCORE", "Score"),
      scoreNotes: str("AIRTABLE_FIELD_SCORE_NOTES", "Score Notes"),
      onboardingSentAt: str("AIRTABLE_FIELD_ONBOARDING_SENT_AT", "Onboarding Sent At"),
      reminderStage: str("AIRTABLE_FIELD_REMINDER_STAGE", "Reminder Stage"),
      onboardingCompleted: str("AIRTABLE_FIELD_ONBOARDING_COMPLETED", "Onboarding Completed"),
      // Onboarding stage
      onboardingStatus: str("AIRTABLE_FIELD_ONBOARDING_STATUS", "Onboarding Status"),
      docusignEnvelopeId: str("AIRTABLE_FIELD_DOCUSIGN_ENVELOPE_ID", "DocuSign Envelope ID"),
      agreementSignedAt: str("AIRTABLE_FIELD_AGREEMENT_SIGNED_AT", "Agreement Signed At"),
      gustoSetupComplete: str("AIRTABLE_FIELD_GUSTO_SETUP_COMPLETE", "Gusto Setup Complete"),
      availability: str("AIRTABLE_FIELD_AVAILABILITY", "Availability"),
      roles: str("AIRTABLE_FIELD_ROLES", "Roles"),
      transport: str("AIRTABLE_FIELD_TRANSPORT", "Transport"),
      attireSize: str("AIRTABLE_FIELD_ATTIRE_SIZE", "Attire Size"),
      hasBlackAttire: str("AIRTABLE_FIELD_HAS_BLACK_ATTIRE", "Has Black Attire"),
      certs: str("AIRTABLE_FIELD_CERTS", "Certs"),
      kloqdWorkerId: str("AIRTABLE_FIELD_KLOQD_WORKER_ID", "kloqd Worker ID"),
    },
  },

  videoask: {
    webhookSecret: str("VIDEOASK_WEBHOOK_SECRET"),
    url: str("VIDEOASK_URL", "https://www.videoask.com/your-form-id"),
  },

  calendly: {
    webhookSigningKey: str("CALENDLY_WEBHOOK_SIGNING_KEY"),
    url: str("CALENDLY_URL", "https://calendly.com/your-org/screening-call"),
  },

  scoring: {
    passThreshold: num("SCORE_PASS_THRESHOLD", 70),
    reviewThreshold: num("SCORE_REVIEW_THRESHOLD", 50),
    aiProvider: str("AI_SCORER_PROVIDER", "none"),
    aiApiKey: str("AI_SCORER_API_KEY"),
  },

  interviewerSecret: str("INTERVIEWER_SECRET"),

  followup: {
    onboardingUrl: str("ONBOARDING_URL", "https://example.com/usn-onboarding"),
    reminderDay2: num("REMINDER_DAY_2", 2),
    reminderDay4: num("REMINDER_DAY_4", 4),
    schedulerIntervalMinutes: num("SCHEDULER_INTERVAL_MINUTES", 180),
    schedulerEnabled: bool("SCHEDULER_ENABLED", true),
  },

  notifier: {
    provider: str("NOTIFIER_PROVIDER", "console"),
    apiKey: str("NOTIFIER_API_KEY"),
    fromEmail: str("NOTIFIER_FROM_EMAIL", "hiring@example.com"),
    fromSms: str("NOTIFIER_FROM_SMS", "+10000000000"),
  },

  // --- Onboarding stage --------------------------------------------------
  onboarding: {
    // Whether the in-process scheduler also runs the onboarding scan.
    scanEnabled: bool("ONBOARDING_SCAN_ENABLED", true),
    // URL of the lean deployment-data form, texted after payment setup.
    dataFormUrl: str("ONBOARDING_DATA_FORM_URL", "https://example.com/usn-deployment-form"),
  },

  docusign: {
    provider: str("DOCUSIGN_PROVIDER", "console"), // "console" | "example"
    baseUri: str("DOCUSIGN_BASE_URI", "https://demo.docusign.net/restapi"),
    accountId: str("DOCUSIGN_ACCOUNT_ID"),
    accessToken: str("DOCUSIGN_ACCESS_TOKEN"), // bearer token for the example adapter
    icaTemplateId: str("DOCUSIGN_ICA_TEMPLATE_ID"), // [CONFIRM] ICA template id
    includeW9: bool("DOCUSIGN_INCLUDE_W9", true), // W-9 in the same envelope
    connectHmacKey: str("DOCUSIGN_CONNECT_HMAC_KEY"), // webhook (Connect) HMAC key
  },

  gusto: {
    // "manual" => a human fires the Gusto invite; the pipeline advances when the
    // `Gusto Setup Complete` checkbox is ticked. "api" => reserved for future.
    mode: str("GUSTO_MODE", "manual"),
  },

  kloqd: {
    // ALL of these are load-bearing [CONFIRM, from kloqd] facts. Until apiUrl
    // and authToken are set, the kloqd push is BLOCKED and fails loudly.
    apiUrl: str("KLOQD_API_URL"),
    authToken: str("KLOQD_AUTH_TOKEN"),
    agencyJoinCode: str("KLOQD_AGENCY_JOIN_CODE"),
    completionMode: str("KLOQD_COMPLETION_MODE", "webhook"), // "webhook" | "poll"
    webhookSecret: str("KLOQD_WEBHOOK_SECRET"),
  },
} as const;

export type AppConfig = typeof config;
