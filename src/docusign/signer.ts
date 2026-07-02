import { config } from "../config.js";
import { log } from "../lib/logger.js";

export interface AgreementRequest {
  email: string;
  name?: string;
  /** ICA template id (DocuSign). */
  templateId: string;
  /** Whether to include the W-9 as a second doc in the SAME envelope. */
  includeW9: boolean;
}

export interface AgreementResult {
  envelopeId: string;
}

/**
 * Provider-agnostic e-signature sender. Business logic depends only on this, so
 * DocuSign can be swapped or wired without touching the onboarding spine.
 */
export interface AgreementSigner {
  readonly name: string;
  sendAgreement(req: AgreementRequest): Promise<AgreementResult>;
  /** Void an in-flight envelope (e.g. when a candidate opts out via STOP). */
  voidEnvelope?(envelopeId: string, reason: string): Promise<void>;
}

/**
 * Default: logs the envelope it WOULD send and returns a deterministic fake
 * envelope id. Used in dev and whenever DRY_RUN is on — never calls DocuSign.
 */
export const consoleSigner: AgreementSigner = {
  name: "console",
  async sendAgreement(req: AgreementRequest): Promise<AgreementResult> {
    const envelopeId = `dryrun-envelope-${req.email}`;
    log.info("[signer:console] would send DocuSign envelope", {
      to: req.email,
      templateId: req.templateId,
      includeW9: req.includeW9,
      envelopeId,
    });
    return { envelopeId };
  },
  async voidEnvelope(envelopeId: string, reason: string): Promise<void> {
    log.info("[signer:console] would void DocuSign envelope", { envelopeId, reason });
  },
};

/**
 * EXAMPLE real adapter — clearly marked, illustrative only.
 *
 * Shows the DocuSign eSignature REST shape: create an envelope from a template,
 * send to the candidate as the signer. Wire real auth (JWT/access token) and,
 * if includeW9, add the W-9 as a second composite template / document. Degrades
 * to the console signer when credentials are missing rather than guessing.
 */
export function makeExampleSigner(): AgreementSigner {
  return {
    name: "example",
    async sendAgreement(req: AgreementRequest): Promise<AgreementResult> {
      const { baseUri, accountId, accessToken } = config.docusign;
      if (!accountId || !accessToken || !req.templateId) {
        log.warn(
          "[signer:example] DocuSign not fully configured — falling back to console signer"
        );
        return consoleSigner.sendAgreement(req);
      }
      // NOTE: a real W-9 in the same envelope means a compositeTemplates payload;
      // this single-template body is the minimal illustrative shape.
      const res = await fetch(`${baseUri}/v2.1/accounts/${accountId}/envelopes`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          templateId: req.templateId,
          status: "sent",
          templateRoles: [
            { email: req.email, name: req.name ?? req.email, roleName: "Contractor" },
          ],
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(
          `[signer:example] DocuSign send failed: ${res.status} ${res.statusText} ${text}`
        );
      }
      const body = (await res.json()) as { envelopeId?: string };
      if (!body.envelopeId) {
        throw new Error("[signer:example] DocuSign response had no envelopeId");
      }
      return { envelopeId: body.envelopeId };
    },
    async voidEnvelope(envelopeId: string, reason: string): Promise<void> {
      const { baseUri, accountId, accessToken } = config.docusign;
      if (!accountId || !accessToken) return;
      await fetch(`${baseUri}/v2.1/accounts/${accountId}/envelopes/${envelopeId}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "voided", voidedReason: reason }),
      });
    },
  };
}

/** Select the signer. DRY_RUN always uses the console signer. */
export function getSigner(): AgreementSigner {
  if (config.dryRun) return consoleSigner;
  switch (config.docusign.provider) {
    case "example":
      return makeExampleSigner();
    case "console":
    default:
      return consoleSigner;
  }
}
