import { config } from "../config.js";
import { log } from "../lib/logger.js";

const API_ROOT = "https://api.airtable.com/v0";

export class AirtableError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "AirtableError";
  }
}

/** Assert that Airtable credentials are present before any network call. */
function requireCreds(): void {
  if (!config.airtable.token || !config.airtable.baseId) {
    throw new AirtableError(
      "Airtable is not configured. Set AIRTABLE_TOKEN and AIRTABLE_BASE_ID in your .env."
    );
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  requireCreds();
  const res = await fetch(`${API_ROOT}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${config.airtable.token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new AirtableError(
      `Airtable ${method} ${path} failed: ${res.status} ${res.statusText} ${text}`,
      res.status
    );
  }
  return (await res.json()) as T;
}

// --- Record CRUD (data API) -------------------------------------------------

export interface AirtableRecord<F = Record<string, unknown>> {
  id: string;
  fields: F;
  createdTime?: string;
}

export async function listRecords<F = Record<string, unknown>>(
  table: string,
  params: { filterByFormula?: string; maxRecords?: number } = {}
): Promise<AirtableRecord<F>[]> {
  const qs = new URLSearchParams();
  if (params.filterByFormula) qs.set("filterByFormula", params.filterByFormula);
  if (params.maxRecords) qs.set("maxRecords", String(params.maxRecords));
  const path = `/${config.airtable.baseId}/${encodeURIComponent(table)}?${qs}`;
  const data = await request<{ records: AirtableRecord<F>[] }>("GET", path);
  return data.records;
}

export async function createRecord<F = Record<string, unknown>>(
  table: string,
  fields: Record<string, unknown>
): Promise<AirtableRecord<F>> {
  if (config.dryRun) {
    log.info("[DRY_RUN] would create Airtable record", { table, fields });
    return { id: "dryrun-created", fields: fields as F };
  }
  const path = `/${config.airtable.baseId}/${encodeURIComponent(table)}`;
  return request<AirtableRecord<F>>("POST", path, {
    fields,
    typecast: false,
  });
}

export async function updateRecord<F = Record<string, unknown>>(
  table: string,
  id: string,
  fields: Record<string, unknown>
): Promise<AirtableRecord<F>> {
  if (config.dryRun) {
    log.info("[DRY_RUN] would update Airtable record", { table, id, fields });
    return { id, fields: fields as F };
  }
  const path = `/${config.airtable.baseId}/${encodeURIComponent(table)}/${id}`;
  return request<AirtableRecord<F>>("PATCH", path, {
    fields,
    typecast: false,
  });
}

// --- Schema / metadata API --------------------------------------------------

export interface FieldSchema {
  id: string;
  name: string;
  type: string;
  options?: { choices?: { id: string; name: string }[] };
}

export interface TableSchema {
  id: string;
  name: string;
  fields: FieldSchema[];
}

export async function getBaseSchema(): Promise<TableSchema[]> {
  const path = `/meta/bases/${config.airtable.baseId}/tables`;
  const data = await request<{ tables: TableSchema[] }>("GET", path);
  return data.tables;
}
