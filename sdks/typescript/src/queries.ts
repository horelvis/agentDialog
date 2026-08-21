export type QueryType = "validation" | "interpretation" | "expert_query" | "labeling";
export type QueryStatus = "pending" | "assigned" | "answered" | "needs_context" | "cancelled" | "expired";
export type Risk = "low" | "medium" | "high" | "critical";

/** What the question is about. A referent the human can actually look at. */
export interface Subject {
  id: string;
  label: string;
  uri?: string;
  attachments?: string[];
  body?: string;
  sha256?: string;
}

/** A before/after delta this decision covers, for a query about a prior decision. */
export interface Change {
  path: string;
  before: string;
  after: string;
  materiality: "minor" | "material";
}

/**
 * The closed catalogue of answer shapes a query can ask for. Mirrors the
 * server's catalogue structurally rather than importing it, so the package
 * stays dependency-free.
 */
export type AnswerSpace =
  | { kind: "boolean"; labels: { t: string; f: string }; consequences?: { t: string; f: string } }
  | { kind: "choice"; select: "one" | "many";
      options: Array<{ id: string; label: string; consequence?: string }> }
  | { kind: "scalar"; unit: string; min?: number; max?: number; step?: number; effect?: string }
  | { kind: "date"; earliest?: string; latest?: string; effect?: string }
  | { kind: "text"; maxLength: number }
  | { kind: "fields"; fields: Slot[]; effect?: string };

/** One datum inside a `fields` answer space. Never nests. */
export type Slot = { id: string; label: string; proposed?: unknown } & (
  | { kind: "boolean"; labels: { t: string; f: string } }
  | { kind: "choice"; options: Array<{ id: string; label: string }> }
  | { kind: "scalar"; unit: string; min?: number; max?: number; step?: number }
  | { kind: "date"; earliest?: string; latest?: string }
  | { kind: "text"; maxLength: number }
);

/** The human's typed answer. Its `kind` must match the query's `answerSpace`. */
export type Answer =
  | { kind: "boolean"; value: boolean }
  | { kind: "choice"; optionIds: string[] }
  | { kind: "scalar"; value: number }
  | { kind: "date"; value: string }
  | { kind: "text"; value: string }
  | { kind: "fields"; values: Record<string, unknown> };

export interface CreateQueryInput {
  queryType: QueryType;
  subject: Subject;
  answerSpace: AnswerSpace;
  question: string;
  targetHumanEmail: string;
  risk?: Risk;
  selfContained?: boolean;
  changes?: Change[];
  context?: string;
  confidence?: number;
  timeoutMinutes?: number;
  metadata?: Record<string, unknown>;
}

/** Supplying what the human said was missing. Only valid from `needs_context`. */
export interface ClarifyQueryInput {
  subject?: Subject;
  answerSpace?: AnswerSpace;
  changes?: Change[];
  question?: string;
  context?: string;
}

export interface CreatedQuery {
  queryId: string;
  status: QueryStatus;
  conversationId: string;
  expiresAt: string;
}

export interface Query {
  queryId: string;
  status: QueryStatus;
  queryType: QueryType;
  question: string;
  context: string | null;
  confidence: number | null;
  answer: Answer | null;
  comment: string | null;
  humanConfidence: number | null;
  responseTimeMs: number | null;
  /** Set only while `status` is `needs_context` — why the human couldn't answer. */
  insufficientReason: string | null;
  createdAt: string;
  expiresAt: string;
}

export interface QuerySummary {
  queryId: string;
  status: QueryStatus;
  queryType: QueryType;
  question: string;
  humanEmail: string;
  answer: Answer | null;
  createdAt: string;
  expiresAt: string;
}

export interface ListQueriesParams {
  status?: QueryStatus;
  limit?: number;
}

/** Wire shapes: the queries resource is snake_case on the API. */
export interface CreatedQueryWire {
  query_id: string;
  status: QueryStatus;
  conversation_id: string;
  expires_at: string;
}

export type SubjectWire = Subject;
export type ChangeWire = Change;

export type AnswerSpaceWire =
  | { kind: "boolean"; labels: { t: string; f: string }; consequences?: { t: string; f: string } }
  | { kind: "choice"; select: "one" | "many";
      options: Array<{ id: string; label: string; consequence?: string }> }
  | { kind: "scalar"; unit: string; min?: number; max?: number; step?: number; effect?: string }
  | { kind: "date"; earliest?: string; latest?: string; effect?: string }
  | { kind: "text"; max_length: number }
  | { kind: "fields"; fields: SlotWire[]; effect?: string };

export type SlotWire = { id: string; label: string; proposed?: unknown } & (
  | { kind: "boolean"; labels: { t: string; f: string } }
  | { kind: "choice"; options: Array<{ id: string; label: string }> }
  | { kind: "scalar"; unit: string; min?: number; max?: number; step?: number }
  | { kind: "date"; earliest?: string; latest?: string }
  | { kind: "text"; max_length: number }
);

export type AnswerWire =
  | { kind: "boolean"; value: boolean }
  | { kind: "choice"; option_ids: string[] }
  | { kind: "scalar"; value: number }
  | { kind: "date"; value: string }
  | { kind: "text"; value: string }
  | { kind: "fields"; values: Record<string, unknown> };

export interface QueryWire {
  query_id: string;
  status: QueryStatus;
  query_type: QueryType;
  question: string;
  context: string | null;
  confidence: number | null;
  answer: AnswerWire | null;
  comment: string | null;
  human_confidence: number | null;
  response_time_ms: number | null;
  insufficient_reason: string | null;
  created_at: string;
  expires_at: string;
}

export interface QuerySummaryWire {
  query_id: string;
  status: QueryStatus;
  query_type: QueryType;
  question: string;
  human_email: string;
  answer: AnswerWire | null;
  created_at: string;
  expires_at: string;
}

// ── Nested case conversion ──
//
// Every top-level field of the queries resource is snake_case on the wire
// (handled inline in toCreateQueryBody / toClarifyQueryBody / fromQueryWire
// below). Two shapes nest *inside* answer_space and answer and also change
// case — maxLength ↔ max_length, optionIds ↔ option_ids — so their
// conversion lives here once rather than being repeated at every call site.

function slotToWire(slot: Slot): SlotWire {
  if (slot.kind === "text") {
    const { maxLength, ...rest } = slot;
    return { ...rest, max_length: maxLength };
  }
  return slot;
}

function slotFromWire(slot: SlotWire): Slot {
  if (slot.kind === "text") {
    const { max_length, ...rest } = slot;
    return { ...rest, maxLength: max_length };
  }
  return slot;
}

/** camelCase `AnswerSpace` → snake_case wire shape, for a request body. */
export function answerSpaceToWire(space: AnswerSpace): AnswerSpaceWire {
  switch (space.kind) {
    case "text":
      return { kind: "text", max_length: space.maxLength };
    case "fields":
      return { ...space, fields: space.fields.map(slotToWire) };
    default:
      return space;
  }
}

/** snake_case wire shape → camelCase `AnswerSpace`, for a response. */
export function answerSpaceFromWire(wire: AnswerSpaceWire): AnswerSpace {
  switch (wire.kind) {
    case "text":
      return { kind: "text", maxLength: wire.max_length };
    case "fields":
      return { ...wire, fields: wire.fields.map(slotFromWire) };
    default:
      return wire;
  }
}

/** camelCase `Answer` → snake_case wire shape, for a `respond`-shaped request. */
export function answerToWire(answer: Answer): AnswerWire {
  if (answer.kind === "choice") return { kind: "choice", option_ids: answer.optionIds };
  return answer;
}

/** snake_case wire shape → camelCase `Answer`, for a response. */
export function answerFromWire(wire: AnswerWire): Answer {
  if (wire.kind === "choice") return { kind: "choice", optionIds: wire.option_ids };
  return wire;
}

export function toCreateQueryBody(input: CreateQueryInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    query_type: input.queryType,
    subject: input.subject,
    answer_space: answerSpaceToWire(input.answerSpace),
    question: input.question,
    target_human_email: input.targetHumanEmail,
  };
  if (input.risk !== undefined) body.risk = input.risk;
  if (input.selfContained !== undefined) body.self_contained = input.selfContained;
  if (input.changes !== undefined) body.changes = input.changes;
  if (input.context !== undefined) body.context = input.context;
  if (input.confidence !== undefined) body.confidence = input.confidence;
  if (input.timeoutMinutes !== undefined) body.timeout_minutes = input.timeoutMinutes;
  if (input.metadata !== undefined) body.metadata = input.metadata;
  return body;
}

export function toClarifyQueryBody(input: ClarifyQueryInput): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (input.subject !== undefined) body.subject = input.subject;
  if (input.answerSpace !== undefined) body.answer_space = answerSpaceToWire(input.answerSpace);
  if (input.changes !== undefined) body.changes = input.changes;
  if (input.question !== undefined) body.question = input.question;
  if (input.context !== undefined) body.context = input.context;
  return body;
}

export function fromCreatedQueryWire(wire: CreatedQueryWire): CreatedQuery {
  return {
    queryId: wire.query_id,
    status: wire.status,
    conversationId: wire.conversation_id,
    expiresAt: wire.expires_at,
  };
}

export function fromQueryWire(wire: QueryWire): Query {
  return {
    queryId: wire.query_id,
    status: wire.status,
    queryType: wire.query_type,
    question: wire.question,
    context: wire.context,
    confidence: wire.confidence,
    answer: wire.answer ? answerFromWire(wire.answer) : null,
    comment: wire.comment,
    humanConfidence: wire.human_confidence,
    responseTimeMs: wire.response_time_ms,
    insufficientReason: wire.insufficient_reason,
    createdAt: wire.created_at,
    expiresAt: wire.expires_at,
  };
}

export function fromQuerySummaryWire(wire: QuerySummaryWire): QuerySummary {
  return {
    queryId: wire.query_id,
    status: wire.status,
    queryType: wire.query_type,
    question: wire.question,
    humanEmail: wire.human_email,
    answer: wire.answer ? answerFromWire(wire.answer) : null,
    createdAt: wire.created_at,
    expiresAt: wire.expires_at,
  };
}
