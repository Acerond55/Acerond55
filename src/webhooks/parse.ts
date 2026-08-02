/**
 * Defensive parsers for inbound provider payloads. Providers tweak their JSON
 * shape over time, so these dig for the fields we need and tolerate misses
 * rather than throwing on an unexpected structure.
 */

export interface ParsedVideoAsk {
  email: string;
  name?: string;
  transcript: string;
  answers: Record<string, string>;
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() !== "" ? v : undefined;
}

export function parseVideoAsk(body: unknown): ParsedVideoAsk | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, any>;
  const contact = b.contact ?? b.payload?.contact ?? b;

  const email =
    asString(contact?.email) ??
    asString(b.email) ??
    asString(contact?.variables?.email);
  if (!email) return null;

  const name = asString(contact?.name) ?? asString(b.name);

  const rawAnswers: any[] = Array.isArray(contact?.answers)
    ? contact.answers
    : Array.isArray(b.answers)
      ? b.answers
      : [];

  const answers: Record<string, string> = {};
  const parts: string[] = [];
  for (const a of rawAnswers) {
    const qid =
      asString(a?.question_id) ?? asString(a?.questionId) ?? `q${parts.length + 1}`;
    const text =
      asString(a?.transcription) ??
      asString(a?.transcript) ??
      asString(a?.text) ??
      asString(a?.input_text) ??
      "";
    answers[qid] = text;
    if (text) parts.push(text);
    else if (asString(a?.media_url) ?? asString(a?.share_url)) {
      parts.push(`[media: ${a.media_url ?? a.share_url}]`);
    }
  }

  return { email, name, transcript: parts.join("\n\n"), answers };
}

export type CalendlyKind = "booked" | "no_show" | "unknown";

export interface ParsedCalendly {
  kind: CalendlyKind;
  email: string;
  name?: string;
}

export function parseCalendly(body: unknown): ParsedCalendly | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, any>;
  const event = asString(b.event) ?? "";
  const payload = b.payload ?? {};

  const email =
    asString(payload?.email) ??
    asString(payload?.invitee?.email) ??
    asString(b.email);
  if (!email) return null;

  const name = asString(payload?.name) ?? asString(payload?.invitee?.name);

  let kind: CalendlyKind = "unknown";
  if (event === "invitee.created") kind = "booked";
  else if (event.startsWith("invitee.no_show")) kind = "no_show";

  return { kind, email, name };
}
