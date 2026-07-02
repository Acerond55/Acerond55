import { config } from "../config.js";
import type { Candidate } from "../domain.js";
import { log } from "../lib/logger.js";
import {
  createRecord,
  listRecords,
  updateRecord,
  type AirtableRecord,
} from "./client.js";

const F = config.airtable.fields;
const TS = config.airtable.timestamps;
const TABLE = config.airtable.candidatesTable;

/** Escape a value for safe use inside an Airtable filterByFormula string. */
function escapeFormulaValue(v: string): string {
  return v.replace(/"/g, '\\"');
}

function str(v: unknown): string | undefined {
  return v != null ? String(v) : undefined;
}
function strArray(v: unknown): string[] | undefined {
  return Array.isArray(v) ? v.map(String) : undefined;
}

function toCandidate(rec: AirtableRecord): Candidate {
  const f = rec.fields as Record<string, unknown>;
  const onboardingStatus = str(f[F.onboardingStatus]);
  const tsField = onboardingStatus ? TS[onboardingStatus] : undefined;
  return {
    id: rec.id,
    email: String(f[F.email] ?? ""),
    name: str(f[F.name]),
    phone: str(f[F.phone]),
    preferredLanguage: str(f[F.preferredLanguage]),
    status: str(f[F.status]),
    screenType: str(f[F.screenType]),
    answers: str(f[F.answers]),
    score: typeof f[F.score] === "number" ? (f[F.score] as number) : undefined,
    scoreNotes: str(f[F.scoreNotes]),
    onboardingSentAt: str(f[F.onboardingSentAt]),
    reminderStage:
      typeof f[F.reminderStage] === "number"
        ? (f[F.reminderStage] as number)
        : undefined,
    onboardingCompleted: Boolean(f[F.onboardingCompleted]),
    onboardingStatus,
    docusignEnvelopeId: str(f[F.docusignEnvelopeId]),
    gustoStatus: str(f[F.gustoStatus]),
    deploymentFormSent: Boolean(f[F.deploymentFormSent]),
    deploymentFormDone: Boolean(f[F.deploymentFormDone]),
    onboardingNudgeCount:
      typeof f[F.onboardingNudgeCount] === "number"
        ? (f[F.onboardingNudgeCount] as number)
        : undefined,
    lastNudgeDate: str(f[F.lastNudgeDate]),
    stallStage: str(f[F.stallStage]),
    stageEnteredAt: tsField ? str(f[tsField]) : undefined,
    availability: strArray(f[F.availability]),
    roles: strArray(f[F.roles]),
    hasTransport: str(f[F.hasTransport]),
    shirtSize: str(f[F.shirtSize]),
    hasBlackAttire: Boolean(f[F.hasBlackAttire]),
    certs: strArray(f[F.certs]),
    kloqdWorkerId: str(f[F.kloqdWorkerId]),
  };
}

export async function findByEmail(email: string): Promise<Candidate | null> {
  const formula = `LOWER({${F.email}}) = "${escapeFormulaValue(
    email.toLowerCase()
  )}"`;
  const records = await listRecords(TABLE, {
    filterByFormula: formula,
    maxRecords: 1,
  });
  const first = records[0];
  return first ? toCandidate(first) : null;
}

/**
 * Find a candidate by email, creating a bare record if none exists.
 * Returns the candidate plus whether it was newly created.
 */
export async function findOrCreateByEmail(
  email: string,
  name?: string
): Promise<{ candidate: Candidate; created: boolean }> {
  const existing = await findByEmail(email);
  if (existing) return { candidate: existing, created: false };

  const fields: Record<string, unknown> = { [F.email]: email };
  if (name) fields[F.name] = name;
  const rec = await createRecord(TABLE, fields);
  log.info("created candidate record", { email });
  return { candidate: toCandidate(rec), created: true };
}

/** Translate our domain patch keys into the configured Airtable column names. */
function buildPatchFields(
  patch: Partial<Omit<Candidate, "id" | "email">>
): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  if (patch.name !== undefined) fields[F.name] = patch.name;
  if (patch.status !== undefined) fields[F.status] = patch.status;
  if (patch.screenType !== undefined) fields[F.screenType] = patch.screenType;
  if (patch.answers !== undefined) fields[F.answers] = patch.answers;
  if (patch.score !== undefined) fields[F.score] = patch.score;
  if (patch.scoreNotes !== undefined) fields[F.scoreNotes] = patch.scoreNotes;
  if (patch.onboardingSentAt !== undefined)
    fields[F.onboardingSentAt] = patch.onboardingSentAt;
  if (patch.reminderStage !== undefined)
    fields[F.reminderStage] = patch.reminderStage;
  if (patch.onboardingCompleted !== undefined)
    fields[F.onboardingCompleted] = patch.onboardingCompleted;
  if (patch.phone !== undefined) fields[F.phone] = patch.phone;
  if (patch.preferredLanguage !== undefined)
    fields[F.preferredLanguage] = patch.preferredLanguage;
  if (patch.onboardingStatus !== undefined)
    fields[F.onboardingStatus] = patch.onboardingStatus;
  if (patch.docusignEnvelopeId !== undefined)
    fields[F.docusignEnvelopeId] = patch.docusignEnvelopeId;
  if (patch.gustoStatus !== undefined) fields[F.gustoStatus] = patch.gustoStatus;
  if (patch.deploymentFormSent !== undefined)
    fields[F.deploymentFormSent] = patch.deploymentFormSent;
  if (patch.deploymentFormDone !== undefined)
    fields[F.deploymentFormDone] = patch.deploymentFormDone;
  if (patch.onboardingNudgeCount !== undefined)
    fields[F.onboardingNudgeCount] = patch.onboardingNudgeCount;
  if (patch.lastNudgeDate !== undefined)
    fields[F.lastNudgeDate] = patch.lastNudgeDate;
  if (patch.stallStage !== undefined) fields[F.stallStage] = patch.stallStage;
  if (patch.availability !== undefined) fields[F.availability] = patch.availability;
  if (patch.roles !== undefined) fields[F.roles] = patch.roles;
  if (patch.hasTransport !== undefined) fields[F.hasTransport] = patch.hasTransport;
  if (patch.shirtSize !== undefined) fields[F.shirtSize] = patch.shirtSize;
  if (patch.hasBlackAttire !== undefined)
    fields[F.hasBlackAttire] = patch.hasBlackAttire;
  if (patch.certs !== undefined) fields[F.certs] = patch.certs;
  if (patch.kloqdWorkerId !== undefined)
    fields[F.kloqdWorkerId] = patch.kloqdWorkerId;
  return fields;
}

/**
 * Patch a candidate record. Accepts our domain field keys; translates to the
 * configured Airtable column names. Unknown/undefined values are skipped.
 */
export async function updateCandidate(
  id: string,
  patch: Partial<Omit<Candidate, "id" | "email">>
): Promise<Candidate> {
  const rec = await updateRecord(TABLE, id, buildPatchFields(patch));
  // In DRY_RUN the returned record only echoes the patch (email may be absent).
  return toCandidate({ id, fields: rec.fields });
}

/**
 * Flip onboarding status AND stamp the per-stage timestamp field for the new
 * status in one write. Extra patch fields are merged in (e.g. stall stage,
 * nudge-count reset). This is the single place a stage transition is persisted.
 */
export async function setOnboardingStatus(
  id: string,
  status: string,
  now: Date,
  extra: Partial<Omit<Candidate, "id" | "email">> = {}
): Promise<void> {
  const fields = buildPatchFields({ onboardingStatus: status, ...extra });
  const tsField = TS[status];
  if (tsField) fields[tsField] = now.toISOString();
  await updateRecord(TABLE, id, fields);
}

/**
 * Candidates who were sent onboarding but have not completed it — the working
 * set for the reminder scheduler.
 */
export async function listPendingOnboarding(): Promise<Candidate[]> {
  const formula = `AND({${F.onboardingSentAt}} != "", NOT({${F.onboardingCompleted}}))`;
  const records = await listRecords(TABLE, { filterByFormula: formula });
  return records.map(toCandidate);
}

/** All candidates currently sitting at a given onboarding-status value. */
export async function listByOnboardingStatus(
  status: string
): Promise<Candidate[]> {
  const formula = `{${F.onboardingStatus}} = "${escapeFormulaValue(status)}"`;
  const records = await listRecords(TABLE, { filterByFormula: formula });
  return records.map(toCandidate);
}

/** Every candidate that has entered the onboarding stage (any status set). */
export async function listAllInOnboarding(): Promise<Candidate[]> {
  const formula = `{${F.onboardingStatus}} != ""`;
  const records = await listRecords(TABLE, { filterByFormula: formula });
  return records.map(toCandidate);
}

/** Find a candidate by phone number — matches on the last 10 digits, so
 *  formatting differences (spaces, dashes, +1) don't matter. For STOP handling. */
export async function findByPhone(phone: string): Promise<Candidate | null> {
  const digits = phone.replace(/\D/g, "").slice(-10);
  if (digits.length < 10) return null;
  const normalized = `REGEX_REPLACE({${F.phone}} & "", "[^0-9]", "")`;
  const formula = `RIGHT(${normalized}, 10) = "${digits}"`;
  const records = await listRecords(TABLE, {
    filterByFormula: formula,
    maxRecords: 1,
  });
  const first = records[0];
  return first ? toCandidate(first) : null;
}

/** Find a candidate by the DocuSign envelope id stored on their record. */
export async function findByEnvelopeId(
  envelopeId: string
): Promise<Candidate | null> {
  const formula = `{${F.docusignEnvelopeId}} = "${escapeFormulaValue(
    envelopeId
  )}"`;
  const records = await listRecords(TABLE, {
    filterByFormula: formula,
    maxRecords: 1,
  });
  const first = records[0];
  return first ? toCandidate(first) : null;
}
