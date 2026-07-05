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
      name: str("AIRTABLE_FIELD_NAME", "Full Name"),
      phone: str("AIRTABLE_FIELD_PHONE", "Phone"),
      preferredLanguage: str("AIRTABLE_FIELD_PREFERRED_LANGUAGE", "Preferred Language"),
      // One Status field drives the whole pipeline.
      status: str("AIRTABLE_FIELD_STATUS", "Status"),
      tier: str("AIRTABLE_FIELD_TIER", "Tier"),
      answers: str("AIRTABLE_FIELD_ANSWERS", "Phone Screen Notes"),
      scoreNotes: str("AIRTABLE_FIELD_SCORE_NOTES", "Notes"),
      // Onboarding operational fields (added to your base).
      docusignEnvelopeId: str("AIRTABLE_FIELD_DOCUSIGN_ENVELOPE_ID", "DocuSign Envelope ID"),
      gustoInvited: str("AIRTABLE_FIELD_GUSTO_INVITED", "Gusto Invited"),
      deploymentFormSent: str("AIRTABLE_FIELD_DEPLOYMENT_FORM_SENT", "Deployment Form Sent"),
      onboardingNudgeCount: str("AIRTABLE_FIELD_ONBOARDING_NUDGE_COUNT", "Onboarding Nudge Count"),
      lastNudgeDate: str("AIRTABLE_FIELD_LAST_NUDGE_DATE", "Last Nudge Date"),
      lastStatusChange: str("AIRTABLE_FIELD_LAST_STATUS_CHANGE", "Last Status Change"),
      stallStage: str("AIRTABLE_FIELD_STALL_STAGE", "Stall Stage"),
      // Deployment data (reuse existing base fields where they exist).
      availability: str("AIRTABLE_FIELD_AVAILABILITY", "Availability"),
      roles: str("AIRTABLE_FIELD_ROLES", "Roles"),
      hasTransport: str("AIRTABLE_FIELD_HAS_TRANSPORT", "Has Transportation"),
      shirtSize: str("AIRTABLE_FIELD_SHIRT_SIZE", "Shirt Size"),
      hasBlackAttire: str("AIRTABLE_FIELD_HAS_BLACK_ATTIRE", "Has Banquet Attire"),
      certs: str("AIRTABLE_FIELD_CERTS", "Certs"),
      kloqdWorkerId: str("AIRTABLE_FIELD_KLOQD_WORKER_ID", "kloqd Worker ID"),
    },
    // The single date field that records when a candidate entered their current
    // status — powers time-in-stage, nudges and stall detection.
    lastStatusChangeField: str("AIRTABLE_FIELD_LAST_STATUS_CHANGE", "Last Status Change"),
    // Optional per-milestone date fields (reuse the base's existing columns).
    milestoneDates: {
      "Phone Screen Booked": str("AIRTABLE_TS_PHONE_SCREEN", "Phone Screen Date"),
      "Onboarding - Docs Sent": str("AIRTABLE_TS_DOCS_SENT", "Docs Sent Date"),
      "Onboarding - Docs Signed": str("AIRTABLE_TS_DOCS_SIGNED", "Docs Signed Date"),
      "Onboarding - Training Complete": str("AIRTABLE_TS_TRAINING", "Training Complete Date"),
      "Active": str("AIRTABLE_TS_ACTIVATION", "Activation Date"),
    } as Record<string, string>,
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
    // Whether direct deposit is mandatory (no paper-check fallback). [DECISION]
    directDepositMandatory: bool("DIRECT_DEPOSIT_MANDATORY", true),
    // Shared secret for the inbound-SMS webhook (STOP handling).
    smsInboundSecret: str("SMS_INBOUND_SECRET"),
    // Weekly digest recipient (the owner). Sent Monday ~8am ET.
    digestEmail: str("DIGEST_EMAIL"),
    digestPhone: str("DIGEST_PHONE"),
    digestEnabled: bool("DIGEST_ENABLED", true),
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
    // Phase A (buildable now): the candidate self-finishes via join code.
    signupUrl: str("KLOQD_SIGNUP_URL", "https://app.kloqd.com/signup"),
    agencyJoinCode: str("KLOQD_AGENCY_JOIN_CODE"), // [CONFIRM] shared by A + B
    // Phase B (blocked): automated pre-fill push. apiUrl + authToken gate it.
    apiUrl: str("KLOQD_API_URL"),
    authToken: str("KLOQD_AUTH_TOKEN"),
    completionMode: str("KLOQD_COMPLETION_MODE", "webhook"), // "webhook" | "poll"
    webhookSecret: str("KLOQD_WEBHOOK_SECRET"),
  },
} as const;

export type AppConfig = typeof config;
