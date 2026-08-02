/**
 * Standalone preflight: verifies the Airtable base has every required
 * single-select option. Run with `npm run check:airtable`.
 * Exits 0 if all present, 1 (with the exact missing list) otherwise.
 */
import { log } from "../lib/logger.js";
import {
  assertStatusOptions,
  StatusOptionError,
} from "../airtable/statusOptions.js";
import { config } from "../config.js";

async function main(): Promise<void> {
  if (!config.airtable.token || !config.airtable.baseId) {
    log.error(
      "Airtable not configured — set AIRTABLE_TOKEN and AIRTABLE_BASE_ID in .env first."
    );
    process.exit(1);
  }
  try {
    await assertStatusOptions();
    log.info("✓ All required Airtable status options are present.");
    process.exit(0);
  } catch (err) {
    if (err instanceof StatusOptionError) {
      log.error(err.message);
      process.exit(1);
    }
    throw err;
  }
}

main().catch((err) => {
  log.error("status-option check failed", { error: String(err) });
  process.exit(1);
});
