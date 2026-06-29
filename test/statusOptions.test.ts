import { describe, expect, it } from "vitest";
import {
  findMissingOptions,
  StatusOptionError,
} from "../src/airtable/statusOptions.js";
import type { TableSchema } from "../src/airtable/client.js";

const required = {
  Status: ["Call Booked", "Screened — Pending Review", "Passed"],
  "Screen Type": ["Video", "Call"],
};

function table(choices: {
  status?: string[];
  screen?: string[];
  omitStatus?: boolean;
}): TableSchema[] {
  const fields = [];
  if (!choices.omitStatus) {
    fields.push({
      id: "fld1",
      name: "Status",
      type: "singleSelect",
      options: { choices: (choices.status ?? []).map((n, i) => ({ id: `s${i}`, name: n })) },
    });
  }
  fields.push({
    id: "fld2",
    name: "Screen Type",
    type: "singleSelect",
    options: { choices: (choices.screen ?? []).map((n, i) => ({ id: `t${i}`, name: n })) },
  });
  return [{ id: "tbl1", name: "Candidates", fields }];
}

describe("Airtable status-option safety check", () => {
  it("reports no missing options when all are present", () => {
    const tables = table({
      status: ["Call Booked", "Screened — Pending Review", "Passed", "Extra"],
      screen: ["Video", "Call"],
    });
    expect(findMissingOptions(tables, "Candidates", required)).toEqual([]);
  });

  it("detects a missing option with the EXACT expected name", () => {
    const tables = table({
      status: ["Call Booked", "Passed"], // missing the em-dash option
      screen: ["Video", "Call"],
    });
    const missing = findMissingOptions(tables, "Candidates", required);
    expect(missing).toEqual([
      { field: "Status", missing: ["Screened — Pending Review"] },
    ]);
  });

  it("treats an absent field as all-options-missing", () => {
    const tables = table({ omitStatus: true, screen: ["Video", "Call"] });
    const missing = findMissingOptions(tables, "Candidates", required);
    expect(missing).toEqual([
      {
        field: "Status",
        missing: ["Call Booked", "Screened — Pending Review", "Passed"],
      },
    ]);
  });

  it("treats an absent table as everything-missing", () => {
    const missing = findMissingOptions([], "Candidates", required);
    expect(missing.map((m) => m.field).sort()).toEqual(["Screen Type", "Status"]);
  });

  it("formats a loud, actionable error message", () => {
    const err = new StatusOptionError([
      { field: "Status", missing: ["Screened — Pending Review"] },
    ]);
    expect(err.message).toContain("add them BY HAND");
    expect(err.message).toContain('"Screened — Pending Review"');
    expect(err.message).toContain('Field "Status"');
  });
});
