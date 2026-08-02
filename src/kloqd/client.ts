import { config } from "../config.js";
import type { Candidate } from "../domain.js";
import { log } from "../lib/logger.js";

export interface KloqdPushResult {
  workerId?: string;
}

export interface KloqdClient {
  readonly configured: boolean;
  /** Create/pre-stage a worker in kloqd from the candidate's collected data. */
  pushWorker(candidate: Candidate): Promise<KloqdPushResult>;
}

/**
 * Thrown when the kloqd push is attempted before the required facts are known.
 * Steps 5–6 of the build spec are intentionally BLOCKED on these — nothing here
 * may be built on guesses, so we fail loudly instead of inventing an endpoint.
 */
export class KloqdNotConfiguredError extends Error {
  constructor() {
    super(
      [
        "kloqd push is BLOCKED — the following facts are not yet configured.",
        "Get these six facts from kloqd, then set the matching env vars:",
        "  1. Create/pre-stage worker endpoint            → KLOQD_API_URL",
        "  2. Auth method for that endpoint               → KLOQD_AUTH_TOKEN",
        "  3. Exact fields kloqd accepts (+ names)        → map in src/kloqd/client.ts",
        "  4. Whether agreement-accepted state passes in  → map in src/kloqd/client.ts",
        "  5. USN's kloqd agency join code                → KLOQD_AGENCY_JOIN_CODE",
        "  6. Worker-onboarding-complete signal (webhook/poll) → KLOQD_COMPLETION_MODE",
        "Until KLOQD_API_URL and KLOQD_AUTH_TOKEN are set, candidates stay at",
        "'USN Complete' and are not pushed. See SETUP_CHECKLIST.md › kloqd.",
      ].join("\n")
    );
    this.name = "KloqdNotConfiguredError";
  }
}

/** Active until the kloqd facts arrive: every push throws loudly. */
const blockedKloqdClient: KloqdClient = {
  configured: false,
  async pushWorker(): Promise<KloqdPushResult> {
    throw new KloqdNotConfiguredError();
  },
};

/**
 * EXAMPLE real client — a skeleton you complete once the kloqd facts (fields,
 * auth shape, response) are known. The field map below is a GUESS placeholder
 * and must be reconciled with fact #3 before turning this on.
 */
function makeConfiguredKloqdClient(): KloqdClient {
  return {
    configured: true,
    async pushWorker(candidate: Candidate): Promise<KloqdPushResult> {
      const { apiUrl, authToken, agencyJoinCode } = config.kloqd;
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json",
        },
        // [CONFIRM, from kloqd] — reconcile these field names with fact #3.
        body: JSON.stringify({
          agency_join_code: agencyJoinCode,
          name: candidate.name,
          email: candidate.email,
          phone: candidate.phone,
          preferred_language: candidate.preferredLanguage,
          availability: candidate.availability,
          roles: candidate.roles,
          has_transport: candidate.hasTransport,
          shirt_size: candidate.shirtSize,
          has_black_attire: candidate.hasBlackAttire,
          certs: candidate.certs,
          // Fact #4: the push only happens at USN Complete, i.e. after the ICA
          // is signed — pass agreement-accepted so kloqd doesn't re-ask for legal.
          agreement_accepted: true,
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(
          `kloqd push failed: ${res.status} ${res.statusText} ${text}`
        );
      }
      const body = (await res.json().catch(() => ({}))) as { worker_id?: string; id?: string };
      return { workerId: body.worker_id ?? body.id };
    },
  };
}

export function getKloqdClient(): KloqdClient {
  if (config.kloqd.apiUrl && config.kloqd.authToken) {
    return makeConfiguredKloqdClient();
  }
  log.warn(
    "kloqd not configured — push is blocked (Steps 5–6). Set KLOQD_API_URL and KLOQD_AUTH_TOKEN."
  );
  return blockedKloqdClient;
}
