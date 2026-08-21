import { hasNonTextSlot, isDiscrete, type AnswerSpace } from "../lib/answer-space";

/**
 * Admission answers one question: could a human decide this?
 *
 * These are the rules that need nothing but the payload, so they are pure and
 * hermetically testable. The rules that need history - has this person decided
 * about this subject before? - live in the service, which has the database.
 *
 * Two things are deliberately kept apart here. The REFERENT does not scale with
 * risk: a question about a thing needs the thing, whether it is a photo of a cat
 * or a contract. The EVIDENTIARY weight does scale: consequences, hashes, and a
 * referent we actually hold.
 */

export const RISK_ORDER = ["low", "medium", "high", "critical"] as const;
export type Risk = (typeof RISK_ORDER)[number];

export function atLeast(a: Risk, b: Risk): Risk {
  return RISK_ORDER.indexOf(a) >= RISK_ORDER.indexOf(b) ? a : b;
}

function above(risk: Risk, floor: Risk): boolean {
  return RISK_ORDER.indexOf(risk) > RISK_ORDER.indexOf(floor);
}

export interface Subject {
  id: string;
  label: string;
  uri?: string;
  attachments?: string[];
  body?: string;
  sha256?: string;
}

export interface AdmissionInput {
  risk: Risk;
  subject: Subject;
  self_contained?: boolean;
  answer_space: AnswerSpace;
}

export type AdmissionReason =
  | "missing_referent"
  | "text_answer_above_low_risk"
  | "fields_all_text_above_low_risk"
  | "missing_consequences"
  | "external_referent_at_high_risk"
  | "missing_referent_hash"
  | "prior_decision_without_delta"
  | "clarification_rounds_exhausted";

export type AdmissionVerdict =
  | { admit: true }
  | { admit: false; reason: AdmissionReason; detail: string; remedy: string };

const refuse = (
  reason: AdmissionReason,
  detail: string,
  remedy: string,
): AdmissionVerdict => ({ admit: false, reason, detail, remedy });

/** Do we hold the referent ourselves, or are we taking the agent's word for it? */
function weHoldIt(subject: Subject): boolean {
  return Boolean(subject.body) || Boolean(subject.attachments?.length);
}

function hasReferent(subject: Subject): boolean {
  return weHoldIt(subject) || Boolean(subject.uri);
}

function consequencesComplete(space: AnswerSpace): boolean {
  switch (space.kind) {
    case "boolean":
      return Boolean(space.consequences?.t && space.consequences?.f);
    case "choice":
      return space.options.every((o) => Boolean(o.consequence));
    case "scalar":
    case "date":
    case "fields":
      return Boolean(space.effect);
    case "text":
      return true; // only reachable at low risk, where consequences are not required
  }
}

export function checkPayload(input: AdmissionInput): AdmissionVerdict {
  const { risk, subject, answer_space } = input;

  // 1. The referent. Does not scale with risk: without it there is nothing to
  //    decide about, at any stake.
  if (!input.self_contained && !hasReferent(subject)) {
    return refuse(
      "missing_referent",
      `The subject '${subject.id}' carries no uri, attachments or body, so the human has nothing to look at.`,
      "Attach the artefact, link it with `uri`, inline it with `body`, or set `self_contained: true` if the question really is about nothing.",
    );
  }

  // 2. An open decision space above low risk.
  if (above(risk, "low") && answer_space.kind === "text") {
    return refuse(
      "text_answer_above_low_risk",
      `A free-text answer cannot carry a ${risk}-risk decision.`,
      "Use `boolean`, `choice`, `scalar`, `date` or `fields` so the answer is unambiguous.",
    );
  }

  if (above(risk, "low") && !hasNonTextSlot(answer_space)) {
    return refuse(
      "fields_all_text_above_low_risk",
      "Every slot of this `fields` is text, which is an open decision space under another name.",
      "Give at least one slot a shape: `boolean`, `choice`, `scalar` or `date`.",
    );
  }

  // 3. The human must know what each branch causes before choosing it.
  if (above(risk, "low") && !consequencesComplete(answer_space)) {
    const where = isDiscrete(answer_space)
      ? "every branch needs its own `consequence`"
      : "the space needs a single `effect`";
    return refuse(
      "missing_consequences",
      `A ${risk}-risk question must say what its answer causes, and ${where}.`,
      "State plainly what happens next for each possible answer.",
    );
  }

  // 4. Above medium, we must hold the referent ourselves: you cannot hash what
  //    you do not have, and a sha256 over somebody else's link is the agent's
  //    word rather than a record.
  //
  //    Gated on whether a referent is actually present, not on `self_contained`:
  //    that flag means "no referent required", not "no rules apply". A query that
  //    is truly self-contained has no referent, so `hasReferent` is false and this
  //    rule skips cleanly. A query that declares itself self-contained but still
  //    attaches a `uri` is not exempt - the human has something to look at, so it
  //    must meet the same evidentiary bar as any other referent, or the record
  //    degrades silently instead of being punished by the loop.
  if (above(risk, "medium")) {
    if (hasReferent(subject) && !weHoldIt(subject)) {
      return refuse(
        "external_referent_at_high_risk",
        `At ${risk} risk a bare external uri is not enough: we cannot hash what we do not hold.`,
        "Upload the artefact as an attachment, or inline it with `body`.",
      );
    }
    if (hasReferent(subject) && !subject.sha256) {
      return refuse(
        "missing_referent_hash",
        `A ${risk}-risk decision must record which exact version was decided on.`,
        "Send `subject.sha256` with the hash of the referent as you read it.",
      );
    }
  }

  return { admit: true };
}
