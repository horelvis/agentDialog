import { api } from "./client";
import type {
  ApiResponse,
  HumanQuery,
  Answer,
  AnswerSlot,
  AnswerSpace,
  InsufficientReason,
} from "./types";

// ── Wire shapes ──
//
// The queries resource is snake_case on the wire (see CLAUDE.md). Everything
// under web/src is camelCase, so the two answer-shape types that nest inside
// answer_space/answer and also change case — maxLength ↔ max_length,
// optionIds ↔ option_ids — need converting at this boundary, same as the
// published SDK does for the agent-facing surface.

type SlotWire = { id: string; label: string; proposed?: unknown } & (
  | { kind: "boolean"; labels: { t: string; f: string } }
  | { kind: "choice"; options: Array<{ id: string; label: string }> }
  | { kind: "scalar"; unit: string; min?: number; max?: number; step?: number }
  | { kind: "date"; earliest?: string; latest?: string }
  | { kind: "text"; max_length: number }
);

type AnswerSpaceWire =
  | { kind: "boolean"; labels: { t: string; f: string }; consequences?: { t: string; f: string } }
  | { kind: "choice"; select: "one" | "many";
      options: Array<{ id: string; label: string; consequence?: string }> }
  | { kind: "scalar"; unit: string; min?: number; max?: number; step?: number; effect?: string }
  | { kind: "date"; earliest?: string; latest?: string; effect?: string }
  | { kind: "text"; max_length: number }
  | { kind: "fields"; fields: SlotWire[]; effect?: string };

type AnswerWire =
  | { kind: "boolean"; value: boolean }
  | { kind: "choice"; option_ids: string[] }
  | { kind: "scalar"; value: number }
  | { kind: "date"; value: string }
  | { kind: "text"; value: string }
  | { kind: "fields"; values: Record<string, unknown> };

interface QueryWire {
  query_id: string;
  conversation_id: string;
  status: HumanQuery["status"];
  status_description: string;
  query_type: HumanQuery["queryType"];
  question: string;
  context: string | null;
  confidence: number | null;
  subject: HumanQuery["subject"];
  self_contained: boolean;
  changes: HumanQuery["changes"];
  risk: HumanQuery["risk"];
  answer_space: AnswerSpaceWire;
  insufficient_reason: InsufficientReason | null;
  answer: AnswerWire | null;
  comment: string | null;
  human_confidence: number | null;
  response_time_ms: number | null;
  prior_decision_at: string | null;
  created_at: string;
  expires_at: string;
}

function slotFromWire(slot: SlotWire): AnswerSlot {
  if (slot.kind === "text") {
    const { max_length, ...rest } = slot;
    return { ...rest, maxLength: max_length };
  }
  return slot;
}

function answerSpaceFromWire(wire: AnswerSpaceWire): AnswerSpace {
  switch (wire.kind) {
    case "text":
      return { kind: "text", maxLength: wire.max_length };
    case "fields":
      return { ...wire, fields: wire.fields.map(slotFromWire) };
    default:
      return wire;
  }
}

function answerFromWire(wire: AnswerWire): Answer {
  if (wire.kind === "choice") return { kind: "choice", optionIds: wire.option_ids };
  return wire;
}

function answerToWire(answer: Answer): AnswerWire {
  if (answer.kind === "choice") return { kind: "choice", option_ids: answer.optionIds };
  return answer;
}

function fromQueryWire(wire: QueryWire): HumanQuery {
  return {
    id: wire.query_id,
    conversationId: wire.conversation_id,
    status: wire.status,
    statusDescription: wire.status_description,
    queryType: wire.query_type,
    question: wire.question,
    context: wire.context,
    confidence: wire.confidence,
    subject: wire.subject,
    selfContained: wire.self_contained,
    changes: wire.changes,
    risk: wire.risk,
    answerSpace: answerSpaceFromWire(wire.answer_space),
    insufficientReason: wire.insufficient_reason,
    answer: wire.answer ? answerFromWire(wire.answer) : null,
    answerComment: wire.comment,
    answerConfidence: wire.human_confidence,
    responseTimeMs: wire.response_time_ms,
    priorDecisionAt: wire.prior_decision_at,
    createdAt: wire.created_at,
    expiresAt: wire.expires_at,
  };
}

/** The discriminated body `POST /respond` takes — an answer, or the third outcome. */
export type RespondInput =
  | { outcome: "answer"; answer: Answer; comment?: string; confidence?: number }
  | { outcome: "insufficient_context"; reason: InsufficientReason; note?: string };

function toRespondBody(input: RespondInput): Record<string, unknown> {
  if (input.outcome === "insufficient_context") {
    return { outcome: "insufficient_context", reason: input.reason, note: input.note };
  }
  return {
    outcome: "answer",
    answer: answerToWire(input.answer),
    comment: input.comment,
    confidence: input.confidence,
  };
}

export async function listQueries(): Promise<{ data: HumanQuery[] }> {
  const res = await api.get<{ data: QueryWire[] }>("/human/queries");
  return { data: res.data.map(fromQueryWire) };
}

export async function getQuery(id: string): Promise<ApiResponse<HumanQuery>> {
  const res = await api.get<ApiResponse<QueryWire>>(`/human/queries/${id}`);
  return { data: fromQueryWire(res.data) };
}

export async function respondQuery(id: string, input: RespondInput): Promise<ApiResponse<HumanQuery>> {
  const res = await api.post<ApiResponse<QueryWire>>(`/human/queries/${id}/respond`, toRespondBody(input));
  return { data: fromQueryWire(res.data) };
}
