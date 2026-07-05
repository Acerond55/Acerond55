import { config } from "../config.js";
import {
  AVAILABILITY_OPTIONS,
  CERTS_OPTIONS,
  PREFERRED_LANGUAGE_OPTIONS,
  REQUIRED_ONBOARDING_STATUS_OPTIONS,
  REQUIRED_STATUS_OPTIONS,
  ROLES_OPTIONS,
  SHIRT_SIZE_OPTIONS,
  STALL_STAGE_OPTIONS,
  TIER,
} from "../domain.js";
import { getBaseSchema, type TableSchema } from "./client.js";

/**
 * The single/multi-select fields whose option values the code writes, mapped to
 * the exact option names that MUST already exist in Airtable. Airtable does not
 * let us create select options reliably via the API, so instead of creating them
 * we verify they exist and fail loudly with instructions if they do not.
 *
 * Screening + onboarding share ONE physical `Status` field, so their option
 * lists are merged into that single field entry.
 */
export function requiredOptionsByField(): Record<string, string[]> {
  const f = config.airtable.fields;
  const allStatus = Array.from(
    new Set([...REQUIRED_STATUS_OPTIONS, ...REQUIRED_ONBOARDING_STATUS_OPTIONS])
  );
  return {
    [f.status]: allStatus,
    [f.tier]: Object.values(TIER),
    [f.stallStage]: [...STALL_STAGE_OPTIONS],
    [f.availability]: [...AVAILABILITY_OPTIONS],
    [f.roles]: [...ROLES_OPTIONS],
    [f.shirtSize]: [...SHIRT_SIZE_OPTIONS],
    [f.certs]: [...CERTS_OPTIONS],
    [f.preferredLanguage]: [...PREFERRED_LANGUAGE_OPTIONS],
  };
}

export interface MissingOptions {
  field: string;
  missing: string[];
}

/**
 * PURE: given a base schema and the field→required-options contract, return the
 * options that are missing (or whose field is absent / not a single-select).
 * No network, no env — directly unit-testable.
 */
export function findMissingOptions(
  tables: TableSchema[],
  tableName: string,
  required: Record<string, string[]>
): MissingOptions[] {
  const table = tables.find(
    (t) => t.name === tableName || t.id === tableName
  );
  if (!table) {
    // Whole table missing → every field's options are "missing".
    return Object.entries(required).map(([field, opts]) => ({
      field,
      missing: [...opts],
    }));
  }

  const result: MissingOptions[] = [];
  for (const [fieldName, opts] of Object.entries(required)) {
    const field = table.fields.find(
      (f) => f.name === fieldName || f.id === fieldName
    );
    if (!field || !field.options?.choices) {
      // Field absent or not a single/multi-select → all options "missing".
      result.push({ field: fieldName, missing: [...opts] });
      continue;
    }
    const existing = new Set(field.options.choices.map((c) => c.name));
    const missing = opts.filter((o) => !existing.has(o));
    if (missing.length > 0) result.push({ field: fieldName, missing });
  }
  return result;
}

export class StatusOptionError extends Error {
  constructor(readonly missing: MissingOptions[]) {
    super(StatusOptionError.format(missing));
    this.name = "StatusOptionError";
  }

  static format(missing: MissingOptions[]): string {
    const lines = missing.map(
      (m) =>
        `  • Field "${m.field}" is missing option(s): ${m.missing
          .map((o) => `"${o}"`)
          .join(", ")}`
    );
    return [
      "Airtable is missing required single-select options.",
      "The API cannot create these reliably, so you must add them BY HAND",
      "in the Airtable UI (open the field → Customize field type → add the",
      "option with the EXACT name below, including punctuation/spacing):",
      "",
      ...lines,
      "",
      "See SETUP_CHECKLIST.md › 'Airtable status options' for the full list.",
    ].join("\n");
  }
}

/**
 * Fetch the live base schema and assert every required option exists.
 * Throws StatusOptionError (loudly) if anything is missing.
 */
export async function assertStatusOptions(): Promise<void> {
  const tables = await getBaseSchema();
  const missing = findMissingOptions(
    tables,
    config.airtable.candidatesTable,
    requiredOptionsByField()
  );
  if (missing.length > 0) throw new StatusOptionError(missing);
}
