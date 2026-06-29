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
const TABLE = config.airtable.candidatesTable;

/** Escape a value for safe use inside an Airtable filterByFormula string. */
function escapeFormulaValue(v: string): string {
  return v.replace(/"/g, '\\"');
}

function toCandidate(rec: AirtableRecord): Candidate {
  const f = rec.fields as Record<string, unknown>;
  return {
    id: rec.id,
    email: String(f[F.email] ?? ""),
    name: f[F.name] != null ? String(f[F.name]) : undefined,
    status: f[F.status] != null ? String(f[F.status]) : undefined,
    screenType: f[F.screenType] != null ? String(f[F.screenType]) : undefined,
    answers: f[F.answers] != null ? String(f[F.answers]) : undefined,
    score: typeof f[F.score] === "number" ? (f[F.score] as number) : undefined,
    scoreNotes: f[F.scoreNotes] != null ? String(f[F.scoreNotes]) : undefined,
    onboardingSentAt:
      f[F.onboardingSentAt] != null ? String(f[F.onboardingSentAt]) : undefined,
    reminderStage:
      typeof f[F.reminderStage] === "number"
        ? (f[F.reminderStage] as number)
        : undefined,
    onboardingCompleted: Boolean(f[F.onboardingCompleted]),
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

/**
 * Patch a candidate record. Accepts our domain field keys; translates to the
 * configured Airtable column names. Unknown/undefined values are skipped.
 */
export async function updateCandidate(
  id: string,
  patch: Partial<Omit<Candidate, "id" | "email">>
): Promise<Candidate> {
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

  const rec = await updateRecord(TABLE, id, fields);
  // In DRY_RUN the returned record only echoes the patch (email may be absent).
  return toCandidate({ id, fields: rec.fields });
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
