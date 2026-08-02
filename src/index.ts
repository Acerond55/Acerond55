import { config } from "./config.js";
import { log } from "./lib/logger.js";
import { createServer } from "./server.js";
import { startScheduler } from "./followup/scheduler.js";
import { assertStatusOptions, StatusOptionError } from "./airtable/statusOptions.js";

async function main(): Promise<void> {
  // Fail loudly at startup if Airtable is missing required status options.
  // Skipped only when Airtable isn't configured yet (so the server can still
  // boot for local UI / DRY_RUN work before credentials are filled in).
  if (config.airtable.token && config.airtable.baseId) {
    try {
      await assertStatusOptions();
      log.info("Airtable status options verified");
    } catch (err) {
      if (err instanceof StatusOptionError) {
        log.error(err.message);
        process.exit(1);
      }
      throw err;
    }
  } else {
    log.warn(
      "Airtable not configured — skipping status-option check. Set AIRTABLE_TOKEN and AIRTABLE_BASE_ID."
    );
  }

  const app = createServer();
  app.listen(config.port, () => {
    log.info(`USN screening pipeline listening on :${config.port}`, {
      dryRun: config.dryRun,
      notifier: config.notifier.provider,
      aiScorer: config.scoring.aiProvider,
    });
  });

  startScheduler();
}

main().catch((err) => {
  log.error("fatal startup error", { error: String(err) });
  process.exit(1);
});
