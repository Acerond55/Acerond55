import { listAllInOnboarding } from "../airtable/candidates.js";
import { config } from "../config.js";
import {
  ONBOARDING_STATUS,
  onboardingRank,
  isParkingState,
  type Candidate,
} from "../domain.js";
import { log } from "../lib/logger.js";
import { getNotifier } from "../notify/notifier.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface DigestRow {
  email: string;
  name?: string;
  stallStage?: string;
  status?: string;
  daysInStage?: number;
}

export interface Digest {
  counts: Record<string, number>;
  stalledRanked: DigestRow[]; // closest-to-done first
  aboutToStall: DigestRow[]; // 5+ days in a non-parking status
  newDeployable: DigestRow[]; // became Deployable in the last 7 days
}

function daysIn(c: Candidate, now: Date): number | undefined {
  if (!c.stageEnteredAt) return undefined;
  const t = new Date(c.stageEnteredAt).getTime();
  if (!Number.isFinite(t)) return undefined;
  return (now.getTime() - t) / DAY_MS;
}

/**
 * PURE. Build the Monday digest from the current onboarding population.
 * (Week-over-week deltas would need a stored snapshot, which we don't keep —
 * counts are point-in-time.)
 */
export function computeDigest(candidates: Candidate[], now: Date): Digest {
  const counts: Record<string, number> = {};
  const stalled: DigestRow[] = [];
  const aboutToStall: DigestRow[] = [];
  const newDeployable: DigestRow[] = [];

  for (const c of candidates) {
    const status = c.onboardingStatus ?? "(none)";
    counts[status] = (counts[status] ?? 0) + 1;
    const d = daysIn(c, now);

    if (status === ONBOARDING_STATUS.STALLED) {
      stalled.push({ email: c.email, name: c.name, stallStage: c.stallStage });
    } else if (status === ONBOARDING_STATUS.DEPLOYABLE) {
      if (d !== undefined && d <= 7) {
        newDeployable.push({ email: c.email, name: c.name });
      }
    } else if (!isParkingState(status) && d !== undefined && d >= 5) {
      aboutToStall.push({ email: c.email, name: c.name, status, daysInStage: Math.floor(d) });
    }
  }

  // Rank stalls closest-to-done first: Sent to kloqd → USN Complete → earlier.
  stalled.sort((a, b) => onboardingRank(b.stallStage) - onboardingRank(a.stallStage));
  aboutToStall.sort((a, b) => (b.daysInStage ?? 0) - (a.daysInStage ?? 0));

  return { counts, stalledRanked: stalled, aboutToStall, newDeployable };
}

export function formatDigest(d: Digest): string {
  const lines: string[] = ["USN Onboarding — Weekly Digest", ""];

  lines.push("Count by status:");
  for (const status of Object.keys(d.counts).sort()) {
    lines.push(`  ${status}: ${d.counts[status]}`);
  }

  lines.push("", `Deployable this week: ${d.newDeployable.length}`);
  if (d.newDeployable.length) {
    for (const r of d.newDeployable) lines.push(`  • ${r.name ?? r.email}`);
  }

  lines.push("", `Stalled (closest-to-done first): ${d.stalledRanked.length}`);
  for (const r of d.stalledRanked) {
    lines.push(`  • ${r.name ?? r.email} — froze at ${r.stallStage ?? "unknown"}`);
  }

  lines.push("", `About to stall (5+ days in stage): ${d.aboutToStall.length}`);
  for (const r of d.aboutToStall) {
    lines.push(`  • ${r.name ?? r.email} — ${r.status} (${r.daysInStage}d)`);
  }

  return lines.join("\n");
}

/** Compute and send the weekly digest to the owner (email and/or SMS). */
export async function runWeeklyDigest(now: Date = new Date()): Promise<Digest> {
  const candidates = await listAllInOnboarding();
  const digest = computeDigest(candidates, now);
  const body = formatDigest(digest);
  const notifier = getNotifier();

  if (config.onboarding.digestEmail) {
    await notifier.sendEmail({
      to: config.onboarding.digestEmail,
      subject: "USN Onboarding — Weekly Digest",
      body,
    });
  }
  if (config.onboarding.digestPhone) {
    await notifier.sendSMS({ to: config.onboarding.digestPhone, body });
  }
  if (!config.onboarding.digestEmail && !config.onboarding.digestPhone) {
    log.warn("weekly digest computed but no DIGEST_EMAIL/DIGEST_PHONE set", {
      preview: body.slice(0, 200),
    });
  }
  log.info("weekly digest sent", {
    stalled: digest.stalledRanked.length,
    aboutToStall: digest.aboutToStall.length,
    newDeployable: digest.newDeployable.length,
  });
  return digest;
}
