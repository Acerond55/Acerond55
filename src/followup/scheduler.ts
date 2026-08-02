import { config } from "../config.js";
import { log } from "../lib/logger.js";
import { runOnboardingScan } from "../onboarding/scanner.js";

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

/** Run one onboarding scan (actions + nudges/stalls), guarding overlap. */
async function tick(): Promise<void> {
  if (running) {
    log.warn("onboarding scan still running — skipping this tick");
    return;
  }
  running = true;
  try {
    if (config.onboarding.scanEnabled) {
      await runOnboardingScan();
    }
  } catch (err) {
    log.error("scheduler tick failed", { error: String(err) });
  } finally {
    running = false;
  }
}

/**
 * Start the in-process onboarding scheduler. Lightweight by design — a single
 * setInterval, no external queue. Disable with SCHEDULER_ENABLED=false and drive
 * the scan via POST /tasks/run-onboarding from an external cron instead.
 */
export function startScheduler(): void {
  if (!config.followup.schedulerEnabled) {
    log.info("scheduler disabled (SCHEDULER_ENABLED=false)");
    return;
  }
  const intervalMs = config.followup.schedulerIntervalMinutes * 60 * 1000;
  log.info("starting onboarding scheduler", {
    everyMinutes: config.followup.schedulerIntervalMinutes,
  });
  timer = setInterval(() => void tick(), intervalMs);
}

export function stopScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
