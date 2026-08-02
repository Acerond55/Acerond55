import { ONBOARDING_STATUS, type Language } from "../domain.js";

/**
 * Exact SMS copy per touchpoint, English + Spanish. "Language follows the
 * person": every message renders in the candidate's Preferred Language. English
 * copy is verbatim from the build spec; Spanish mirrors it. All SMS end with
 * STOP handling (see cross-cutting rule 4).
 */

export function firstNameOf(name: string | undefined): string {
  const n = (name ?? "").trim().split(/\s+/)[0];
  return n || "there";
}
function firstNameEs(name: string | undefined): string {
  const n = (name ?? "").trim().split(/\s+/)[0];
  return n || "";
}

const STOP_EN = "Reply STOP to opt out.";
const STOP_ES = "Responde STOP para no recibir mensajes.";

export interface MsgVars {
  name?: string;
  email?: string;
  formUrl?: string;
  signupUrl?: string;
  joinCode?: string;
}

/** Step 1 — agreement-sent SMS (sent alongside the DocuSign email). */
export function agreementSentSms(v: MsgVars, lang: Language): string {
  const fn = firstNameOf(v.name);
  if (lang === "Spanish") {
    const f = firstNameEs(v.name);
    return `Hola ${f || fn}, somos USN. Pasaste la entrevista, bienvenido. Te enviamos tu contrato a ${v.email}. Toma unos 5 minutos firmarlo. ${STOP_ES}`;
  }
  return `Hey ${fn}, it's USN. You passed the screen, welcome aboard. Just sent your contractor agreement to ${v.email}. Takes about 5 minutes to sign. ${STOP_EN}`;
}

/** Step 2 — signed-confirmation SMS. */
export function agreementSignedSms(v: MsgVars, lang: Language): string {
  const fn = firstNameOf(v.name);
  if (lang === "Spanish") {
    return `Recibimos tu contrato firmado, ${fn}. Sigue un paso más para el depósito directo. Ya casi terminas.`;
  }
  return `Got your signed agreement, ${fn}. One more setup step coming your way for direct deposit. Almost there.`;
}

/** Step 3 — Gusto direct-deposit invite SMS. */
export function gustoInviteSms(v: MsgVars, lang: Language): string {
  const fn = firstNameOf(v.name);
  if (lang === "Spanish") {
    return `Último paso de configuración, ${fn}: depósito directo. Gusto te envió una invitación de USN por correo. Configúralo una vez y te pagamos automáticamente después de cada evento.`;
  }
  return `Last setup step, ${fn}: direct deposit. Gusto just emailed you an invite from USN. Set it up once and you get paid automatically after every event.`;
}

/** Step 4 — deployment-form SMS. */
export function deploymentFormSms(v: MsgVars, lang: Language): string {
  const fn = firstNameOf(v.name);
  if (lang === "Spanish") {
    return `${fn}, lo último antes de poder agendarte: un formulario de 2 minutos con tu disponibilidad, tallas y cómo llegas a los eventos. ${v.formUrl}`;
  }
  return `${fn}, last thing before we can book you: a 2-minute form so we know your availability, sizes, and how you get to venues. ${v.formUrl}`;
}

/** Step 5 Phase A — kloqd join-code handoff SMS. */
export function kloqdHandoffSms(v: MsgVars, lang: Language): string {
  const fn = firstNameOf(v.name);
  if (lang === "Spanish") {
    return `${fn}, ya estás oficialmente con USN. Último paso: crea tu perfil de trabajador en kloqd, ahí verás y tomarás turnos. Regístrate aquí: ${v.signupUrl} e ingresa el código ${v.joinCode} para vincularte a USN. Toma 5 minutos.`;
  }
  return `${fn}, you're officially set with USN. Last step: create your worker profile on kloqd, that's where you'll see and grab shifts. Sign up here: ${v.signupUrl} and enter code ${v.joinCode} to link to USN. Takes 5 minutes.`;
}

/** Step 6 — welcome/payoff SMS. */
export function welcomeSms(v: MsgVars, lang: Language): string {
  const fn = firstNameOf(v.name);
  if (lang === "Spanish") {
    return `Eso es todo, ${fn}. Ya estás activo. Los turnos aparecen en kloqd y tú tomas los que quieras. Bienvenido al equipo. Cualquier duda, escríbenos.`;
  }
  return `That's everything, ${fn}. You're live. Shifts show up in kloqd and you grab the ones you want. Welcome to the team. Questions anytime, just text.`;
}

/** Edge case — DocuSign email bounced. */
export function emailBounceSms(v: MsgVars, lang: Language): string {
  const fn = firstNameOf(v.name);
  if (lang === "Spanish") {
    return `Hola ${fn}, parece que ${v.email} no funcionó. ¿Cuál es el mejor correo para tu contrato?`;
  }
  return `Looks like ${v.email} didn't work. What's the best email for your agreement?`;
}

/** Per-stage nudge SMS, keyed by the status the candidate is waiting in. */
export function nudgeSms(
  status: string,
  v: MsgVars,
  lang: Language
): string {
  const fn = firstNameOf(v.name);
  const es = lang === "Spanish";
  switch (status) {
    case ONBOARDING_STATUS.AGREEMENT_SENT:
      return es
        ? `Hola ${fn}, tu contrato de USN sigue esperando en ${v.email}. 5 minutos y listo. ¿Algo te lo impide? Escríbeme.`
        : `Hey ${fn}, your USN agreement is still waiting at ${v.email}. 5 minutes and you're set. Anything blocking you? Text me back.`;
    case ONBOARDING_STATUS.AGREEMENT_SIGNED:
      return es
        ? `Rápido ${fn}: tu configuración de depósito directo sigue pendiente. No podemos pagarte sin ella. 3 minutos: revisa tu correo por la invitación de Gusto.`
        : `Quick one ${fn}: your direct deposit setup is still open. Can't pay you without it. 3 minutes: check your email for the Gusto invite.`;
    case ONBOARDING_STATUS.PAYMENT_SETUP_DONE:
      return es
        ? `${fn}, falta tu formulario de 2 minutos para poder agendarte: ${v.formUrl}`
        : `${fn}, we still need your 2-minute form so we can book you: ${v.formUrl}`;
    case ONBOARDING_STATUS.SENT_TO_KLOQD:
      return es
        ? `${fn}, estás a un registro de trabajar. Crea tu perfil en kloqd: ${v.signupUrl}, código ${v.joinCode}. 5 minutos.`
        : `${fn}, you're one signup from working. Create your kloqd profile: ${v.signupUrl}, code ${v.joinCode}. 5 minutes.`;
    default:
      return es
        ? `${fn}, un recordatorio rápido de USN para terminar tu registro.`
        : `${fn}, a quick USN reminder to finish your setup.`;
  }
}
