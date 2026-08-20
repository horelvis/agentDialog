export type QueryType = "validation" | "interpretation" | "expert_query" | "labeling";
export type QueryStatus = "pending" | "assigned" | "answered" | "expired";

export interface CreateQueryInput {
  queryType: QueryType;
  question: string;
  targetHumanEmail: string;
  context?: string;
  confidence?: number;
  timeoutMinutes?: number;
  metadata?: Record<string, unknown>;
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
  answer: string | null;
  comment: string | null;
  humanConfidence: number | null;
  responseTimeMs: number | null;
  createdAt: string;
  expiresAt: string;
}

export interface QuerySummary {
  queryId: string;
  status: QueryStatus;
  queryType: QueryType;
  question: string;
  humanEmail: string;
  answer: string | null;
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

export interface QueryWire {
  query_id: string;
  status: QueryStatus;
  query_type: QueryType;
  question: string;
  context: string | null;
  confidence: number | null;
  answer: string | null;
  comment: string | null;
  human_confidence: number | null;
  response_time_ms: number | null;
  created_at: string;
  expires_at: string;
}

export interface QuerySummaryWire {
  query_id: string;
  status: QueryStatus;
  query_type: QueryType;
  question: string;
  human_email: string;
  answer: string | null;
  created_at: string;
  expires_at: string;
}

export function toCreateQueryBody(input: CreateQueryInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    query_type: input.queryType,
    question: input.question,
    target_human_email: input.targetHumanEmail,
  };
  if (input.context !== undefined) body.context = input.context;
  if (input.confidence !== undefined) body.confidence = input.confidence;
  if (input.timeoutMinutes !== undefined) body.timeout_minutes = input.timeoutMinutes;
  if (input.metadata !== undefined) body.metadata = input.metadata;
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
    answer: wire.answer,
    comment: wire.comment,
    humanConfidence: wire.human_confidence,
    responseTimeMs: wire.response_time_ms,
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
    answer: wire.answer,
    createdAt: wire.created_at,
    expiresAt: wire.expires_at,
  };
}
