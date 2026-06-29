import { config } from "../config.js";
import { log } from "../lib/logger.js";
import { runReminders } from "./sequence.js";

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

/** Run one reminder scan, guarding against overlapping runs. */
async function tick(): Promise<void> {
  if (running) {
    log.warn("reminder scan still running — skipping this tick");
    return;
  }
  running = true;
  try {
    await runReminders();
  } catch (err) {
    log.error("reminder scan failed", { error: String(err) });
  } finally {
    running = false;
  }
}

/**
 * Start the in-process reminder scheduler. Lightweight by design — a single
 * setInterval, no external queue. Disable with SCHEDULER_ENABLED=false and run
 * POST /tasks/run-reminders from an external cron instead.
 */
export function startScheduler(): void {
  if (!config.followup.schedulerEnabled) {
    log.info("scheduler disabled (SCHEDULER_ENABLED=false)");
    return;
  }
  const intervalMs = config.followup.schedulerIntervalMinutes * 60 * 1000;
  log.info("starting reminder scheduler", {
    everyMinutes: config.followup.schedulerIntervalMinutes,
  });
  // Kick once shortly after boot, then on the interval.
  timer = setInterval(() => void tick(), intervalMs);
}

export function stopScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
