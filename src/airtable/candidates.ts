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
const LAST_CHANGE = config.airtable.lastStatusChangeField;
const MILESTONE = config.airtable.milestoneDates;
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
  return {
    id: rec.id,
    email: String(f[F.email] ?? ""),
    name: str(f[F.name]),
    phone: str(f[F.phone]),
    preferredLanguage: str(f[F.preferredLanguage]),
    status: str(f[F.status]),
    tier: str(f[F.tier]),
    answers: str(f[F.answers]),
    scoreNotes: str(f[F.scoreNotes]),
    docusignEnvelopeId: str(f[F.docusignEnvelopeId]),
    gustoInvited: Boolean(f[F.gustoInvited]),
    deploymentFormSent: Boolean(f[F.deploymentFormSent]),
    onboardingNudgeCount:
      typeof f[F.onboardingNudgeCount] === "number"
        ? (f[F.onboardingNudgeCount] as number)
        : undefined,
    lastNudgeDate: str(f[F.lastNudgeDate]),
    stallStage: str(f[F.stallStage]),
    stageEnteredAt: str(f[LAST_CHANGE]),
    availability: strArray(f[F.availability]),
    roles: strArray(f[F.roles]),
    hasTransport: Boolean(f[F.hasTransport]),
    shirtSize: str(f[F.shirtSize]),
    hasBlackAttire: Boolean(f[F.hasBlackAttire]),
    certs: strArray(f[F.certs]),
    kloqdWorkerId: str(f[F.kloqdWorkerId]),
  };
}

/** Translate our domain patch keys into the configured Airtable column names. */
function buildPatchFields(
  patch: Partial<Omit<Candidate, "id" | "email">>
): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  if (patch.name !== undefined) fields[F.name] = patch.name;
  if (patch.phone !== undefined) fields[F.phone] = patch.phone;
  if (patch.preferredLanguage !== undefined)
    fields[F.preferredLanguage] = patch.preferredLanguage;
  if (patch.status !== undefined) fields[F.status] = patch.status;
  if (patch.tier !== undefined) fields[F.tier] = patch.tier;
  if (patch.answers !== undefined) fields[F.answers] = patch.answers;
  if (patch.scoreNotes !== undefined) fields[F.scoreNotes] = patch.scoreNotes;
  if (patch.docusignEnvelopeId !== undefined)
    fields[F.docusignEnvelopeId] = patch.docusignEnvelopeId;
  if (patch.gustoInvited !== undefined) fields[F.gustoInvited] = patch.gustoInvited;
  if (patch.deploymentFormSent !== undefined)
    fields[F.deploymentFormSent] = patch.deploymentFormSent;
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

export async function updateCandidate(
  id: string,
  patch: Partial<Omit<Candidate, "id" | "email">>
): Promise<Candidate> {
  const rec = await updateRecord(TABLE, id, buildPatchFields(patch));
  return toCandidate({ id, fields: rec.fields });
}

/**
 * Flip status AND stamp the timing fields in one write: Last Status Change (the
 * universal stage-entry clock), the matching milestone date if the base has one
 * for that status, and reset the nudge counter (cross-cutting rule 1).
 */
export async function setOnboardingStatus(
  id: string,
  status: string,
  now: Date,
  extra: Partial<Omit<Candidate, "id" | "email">> = {}
): Promise<void> {
  const fields = buildPatchFields({
    status,
    onboardingNudgeCount: 0,
    ...extra,
  });
  fields[LAST_CHANGE] = now.toISOString();
  const milestone = MILESTONE[status];
  if (milestone) fields[milestone] = now.toISOString();
  await updateRecord(TABLE, id, fields);
}

/** All candidates currently sitting at a given status value. */
export async function listByStatus(status: string): Promise<Candidate[]> {
  const formula = `{${F.status}} = "${escapeFormulaValue(status)}"`;
  const records = await listRecords(TABLE, { filterByFormula: formula });
  return records.map(toCandidate);
}

/** All candidates whose status is any of the given values. */
export async function listByStatuses(statuses: string[]): Promise<Candidate[]> {
  if (statuses.length === 0) return [];
  const clauses = statuses
    .map((s) => `{${F.status}} = "${escapeFormulaValue(s)}"`)
    .join(", ");
  const formula = `OR(${clauses})`;
  const records = await listRecords(TABLE, { filterByFormula: formula });
  return records.map(toCandidate);
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

/** Find a candidate by phone — matches on the last 10 digits. For STOP handling. */
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
