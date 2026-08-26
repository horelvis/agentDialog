import {
  AgentDialogError,
  AuthenticationError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  UndecidableQueryError,
  RateLimitError,
  ServerError,
  QueryTimeoutError,
} from "./errors.js";
import type {
  Agent,
  AgentDialogOptions,
  Conversation,
  CreateConversationInput,
  CreateWebhookInput,
  Invitation,
  InviteHumanInput,
  Message,
  Pagination,
  PaginatedResponse,
  PaginationParams,
  RegisteredAgent,
  RegisterInput,
  RotateKeyResponse,
  SendMessageInput,
  UpdateConversationInput,
  UpdateProfileInput,
  UpdateWebhookInput,
  Webhook,
  WebhookWithSecret,
} from "./types.js";
import {
  toCreateQueryBody,
  toClarifyQueryBody,
  fromCreatedQueryWire,
  fromQueryWire,
  fromQuerySummaryWire,
} from "./queries.js";
import type {
  ClarifyQueryInput,
  CreateQueryInput,
  CreatedQuery,
  CreatedQueryWire,
  ListQueriesParams,
  Query,
  QuerySummary,
  QuerySummaryWire,
  QueryWire,
} from "./queries.js";

const DEFAULT_BASE_URL = "https://api.agentdialog.io";
const MAX_RETRIES = 3;

/** Lets a caller govern the key, for instance deriving it from its own job id. */
export interface WriteOptions {
  idempotencyKey?: string;
}

function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

export class AgentDialog {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(options: AgentDialogOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  }

  // ── Static: Register ──

  static async register(
    input: RegisterInput,
    options?: { baseUrl?: string },
  ): Promise<AgentDialog & { agent: RegisteredAgent }> {
    const baseUrl = (options?.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    const res = await fetch(`${baseUrl}/api/v1/agent/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });

    const body = await res.json() as { data: RegisteredAgent };
    if (!res.ok) throw errorFromResponse(res.status, body);

    const agent = body.data;
    const client = new AgentDialog({ apiKey: agent.apiKey, baseUrl }) as AgentDialog & {
      agent: RegisteredAgent;
    };
    (client as any).agent = agent;
    return client;
  }

  // ── Profile ──

  async getProfile(): Promise<Agent> {
    return this.request<Agent>("GET", "/agent/me");
  }

  async updateProfile(input: UpdateProfileInput): Promise<Agent> {
    return this.request<Agent>("PATCH", "/agent/me", input);
  }

  // ── API Key ──

  async rotateApiKey(options: WriteOptions = {}): Promise<RotateKeyResponse> {
    return this.request<RotateKeyResponse>(
      "POST",
      "/agent/key/rotate",
      undefined,
      0,
      undefined,
      options.idempotencyKey ?? newIdempotencyKey(),
    );
  }

  // ── Conversations ──

  async listConversations(params?: PaginationParams): Promise<PaginatedResponse<Conversation>> {
    const qs = buildQuery(params);
    return this.requestPaginated<Conversation>("GET", `/agent/conversations${qs}`);
  }

  async *listAllConversations(
    params?: Omit<PaginationParams, "cursor">,
  ): AsyncGenerator<Conversation> {
    let cursor: string | undefined;
    do {
      const page = await this.listConversations({ ...params, cursor });
      for (const item of page.data) yield item;
      cursor = page.pagination.hasMore ? (page.pagination.nextCursor ?? undefined) : undefined;
    } while (cursor);
  }

  async createConversation(input: CreateConversationInput, options: WriteOptions = {}): Promise<Conversation> {
    return this.request<Conversation>(
      "POST",
      "/agent/conversations",
      input,
      0,
      undefined,
      options.idempotencyKey ?? newIdempotencyKey(),
    );
  }

  async getConversation(id: string): Promise<Conversation> {
    return this.request<Conversation>("GET", `/agent/conversations/${id}`);
  }

  async updateConversation(id: string, input: UpdateConversationInput): Promise<Conversation> {
    return this.request<Conversation>("PATCH", `/agent/conversations/${id}`, input);
  }

  // ── Messages ──

  async sendMessage(conversationId: string, input: SendMessageInput, options: WriteOptions = {}): Promise<Message> {
    return this.request<Message>(
      "POST",
      `/agent/conversations/${conversationId}/messages`,
      input,
      0,
      undefined,
      options.idempotencyKey ?? newIdempotencyKey(),
    );
  }

  async listMessages(
    conversationId: string,
    params?: PaginationParams,
  ): Promise<PaginatedResponse<Message>> {
    const qs = buildQuery(params);
    return this.requestPaginated<Message>(
      "GET",
      `/agent/conversations/${conversationId}/messages${qs}`,
    );
  }

  async *listAllMessages(
    conversationId: string,
    params?: Omit<PaginationParams, "cursor">,
  ): AsyncGenerator<Message> {
    let cursor: string | undefined;
    do {
      const page = await this.listMessages(conversationId, { ...params, cursor });
      for (const item of page.data) yield item;
      cursor = page.pagination.hasMore ? (page.pagination.nextCursor ?? undefined) : undefined;
    } while (cursor);
  }

  // ── Invitations ──

  async inviteHuman(conversationId: string, input: InviteHumanInput, options: WriteOptions = {}): Promise<Invitation> {
    return this.request<Invitation>(
      "POST",
      `/agent/conversations/${conversationId}/invitations`,
      input,
      0,
      undefined,
      options.idempotencyKey ?? newIdempotencyKey(),
    );
  }

  async listInvitations(conversationId: string): Promise<Invitation[]> {
    return this.request<Invitation[]>(
      "GET",
      `/agent/conversations/${conversationId}/invitations`,
    );
  }

  async revokeInvitation(invitationId: string): Promise<Invitation> {
    return this.request<Invitation>(
      "DELETE",
      `/agent/conversations/invitations/${invitationId}`,
    );
  }

  // ── Webhooks ──

  async createWebhook(input: CreateWebhookInput, options: WriteOptions = {}): Promise<WebhookWithSecret> {
    return this.request<WebhookWithSecret>(
      "POST",
      "/agent/webhooks",
      input,
      0,
      undefined,
      options.idempotencyKey ?? newIdempotencyKey(),
    );
  }

  async rotateWebhookSecret(id: string, options: WriteOptions = {}): Promise<WebhookWithSecret> {
    return this.request<WebhookWithSecret>(
      "POST",
      `/agent/webhooks/${id}/rotate-secret`,
      undefined,
      0,
      undefined,
      options.idempotencyKey ?? newIdempotencyKey(),
    );
  }

  async listWebhooks(): Promise<Webhook[]> {
    return this.request<Webhook[]>("GET", "/agent/webhooks");
  }

  async updateWebhook(id: string, input: UpdateWebhookInput): Promise<Webhook> {
    return this.request<Webhook>("PATCH", `/agent/webhooks/${id}`, input);
  }

  async deleteWebhook(id: string): Promise<Webhook> {
    return this.request<Webhook>("DELETE", `/agent/webhooks/${id}`);
  }

  // ── Human queries ──

  /** Ask a human a question. Returns immediately; the human answers by email. */
  async createQuery(input: CreateQueryInput, options: WriteOptions = {}): Promise<CreatedQuery> {
    const wire = await this.request<CreatedQueryWire>(
      "POST",
      "/agent/queries",
      toCreateQueryBody(input),
      0,
      undefined,
      options.idempotencyKey ?? newIdempotencyKey(),
    );
    return fromCreatedQueryWire(wire);
  }

  /** Read a query's current status and, once answered, the human's answer. */
  async getQuery(queryId: string, signal?: AbortSignal): Promise<Query> {
    const wire = await this.request<QueryWire>(
      "GET",
      `/agent/queries/${queryId}`,
      undefined,
      0,
      signal,
    );
    return fromQueryWire(wire);
  }

  async listQueries(params?: ListQueriesParams): Promise<QuerySummary[]> {
    const wire = await this.request<QuerySummaryWire[]>(
      "GET",
      `/agent/queries${buildQuery(params)}`,
    );
    return wire.map(fromQuerySummaryWire);
  }

  /**
   * Supply what the human said was missing, after `getQuery` reports
   * `status: "needs_context"`. Only valid from that status. On success the
   * query returns to `assigned` and the human can answer again.
   */
  async clarifyQuery(queryId: string, input: ClarifyQueryInput): Promise<Query> {
    const wire = await this.request<QueryWire>(
      "PATCH",
      `/agent/queries/${queryId}`,
      toClarifyQueryBody(input),
    );
    return fromQueryWire(wire);
  }

  /**
   * Withdraw a question whose context has moved on, before the human
   * answers. An answer that already landed wins: if the human answered
   * first, this rejects with a conflict rather than discarding their
   * decision.
   */
  async cancelQuery(queryId: string): Promise<Query> {
    const wire = await this.request<QueryWire>("POST", `/agent/queries/${queryId}/cancel`);
    return fromQueryWire(wire);
  }

  /**
   * Poll a query until a human answers it or it expires.
   *
   * Backs off from pollIntervalMs up to maxPollIntervalMs, because humans
   * answer on human timescales and tight polling only burns rate limit.
   * An expired query resolves rather than throwing: expiry is an answer of
   * sorts, and the caller usually wants to branch on it.
   */
  async waitForAnswer(
    queryId: string,
    options: {
      pollIntervalMs?: number;
      maxPollIntervalMs?: number;
      timeoutMs?: number;
      signal?: AbortSignal;
    } = {},
  ): Promise<Query> {
    const {
      pollIntervalMs = 10_000,
      maxPollIntervalMs = 60_000,
      timeoutMs,
      signal,
    } = options;

    const startedAt = Date.now();
    let interval = pollIntervalMs;

    for (;;) {
      if (signal?.aborted) throw signal.reason ?? new Error("Aborted");

      // Bound the in-flight request itself, not just the between-request
      // checks above: without this, a single hung getQuery (cold start,
      // blackholed connection) waits out the OS TCP timeout regardless of
      // timeoutMs or an aborted `signal`.
      const remainingForRequest =
        timeoutMs !== undefined ? timeoutMs - (Date.now() - startedAt) : undefined;
      if (remainingForRequest !== undefined && remainingForRequest <= 0) {
        throw new QueryTimeoutError(queryId, timeoutMs!);
      }

      let query: Query;
      try {
        query = await this.getQuery(queryId, combineSignals(signal, remainingForRequest));
      } catch (err) {
        if (timeoutMs !== undefined && isTimeoutAbort(err)) {
          throw new QueryTimeoutError(queryId, timeoutMs);
        }
        throw err;
      }
      if (query.status === "answered" || query.status === "expired") return query;

      if (timeoutMs !== undefined && Date.now() - startedAt >= timeoutMs) {
        throw new QueryTimeoutError(queryId, timeoutMs);
      }

      // Never sleep past the caller's deadline: cap the sleep at the
      // remaining budget so a large pollIntervalMs can't delay the
      // timeout. The call still returns within roughly timeoutMs plus one
      // getQuery round-trip, because the loop always gives the query one
      // last chance to have been answered before throwing.
      if (timeoutMs !== undefined) {
        const remaining = timeoutMs - (Date.now() - startedAt);
        if (remaining <= 0) throw new QueryTimeoutError(queryId, timeoutMs);
        await sleep(Math.min(interval, remaining), signal);
      } else {
        await sleep(interval, signal);
      }
      interval = Math.min(interval * 2, maxPollIntervalMs);
    }
  }

  // ── Internal ──

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    retries = 0,
    signal?: AbortSignal,
    idempotencyKey?: string,
  ): Promise<T> {
    const url = `${this.baseUrl}/api/v1${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
    };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }
    // The same key travels into the retry below. A retry with a fresh key would be
    // the duplicate this exists to prevent.
    if (idempotencyKey !== undefined) {
      headers["Idempotency-Key"] = idempotencyKey;
    }

    const res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });

    if (res.status === 429 && retries < MAX_RETRIES) {
      const retryAfter = parseRetryAfter(res);
      await sleep(retryAfter * 1000, signal);
      return this.request<T>(method, path, body, retries + 1, signal, idempotencyKey);
    }

    const json = await res.json() as { data: T };
    if (!res.ok) throw errorFromResponse(res.status, json);

    return json.data;
  }

  private async requestPaginated<T>(
    method: string,
    path: string,
  ): Promise<PaginatedResponse<T>> {
    const url = `${this.baseUrl}/api/v1${path}`;
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    if (res.status === 429) {
      const retryAfter = parseRetryAfter(res);
      await sleep(retryAfter * 1000);
      return this.requestPaginated<T>(method, path);
    }

    const json = await res.json() as { data: T[]; pagination: Pagination };
    if (!res.ok) throw errorFromResponse(res.status, json);

    return {
      data: json.data,
      pagination: json.pagination,
    };
  }
}

// ── Helpers ──

function errorFromResponse(status: number, body: any): AgentDialogError {
  const err = body?.error ?? {};
  const message = err.message ?? "Unknown error";
  const details = err.details;

  switch (status) {
    case 401:
      return new AuthenticationError(message);
    case 403:
      return new ForbiddenError(message);
    case 404:
      return new NotFoundError(message);
    case 422:
      // The admission gate's refusal (UNDECIDABLE_QUERY) is a distinct class
      // of 422 from an ordinary malformed payload: it carries reason/remedy
      // that an agent needs to retry correctly, not just a message to log.
      if (err.code === "UNDECIDABLE_QUERY") {
        return new UndecidableQueryError(message, err.reason, err.remedy, err.prior_query_id);
      }
      return new ValidationError(message, details);
    case 429:
      return new RateLimitError(message, err.retryAfter ?? 1);
    default:
      if (status >= 500) return new ServerError(message);
      return new AgentDialogError(status, err.code ?? "UNKNOWN", message, details);
  }
}

function parseRetryAfter(res: Response): number {
  const header = res.headers.get("retry-after");
  if (header) {
    const seconds = Number(header);
    if (!isNaN(seconds)) return seconds;
  }
  return 1;
}

/**
 * Combine the caller's abort signal (if any) with a per-request timeout
 * derived from the remaining `waitForAnswer` budget (if any), so a single
 * fetch can never outlive either. Returns undefined when there's nothing
 * to bound the request with.
 */
function combineSignals(
  signal: AbortSignal | undefined,
  remainingMs: number | undefined,
): AbortSignal | undefined {
  const signals: AbortSignal[] = [];
  if (signal) signals.push(signal);
  if (remainingMs !== undefined) signals.push(AbortSignal.timeout(remainingMs));
  if (signals.length === 0) return undefined;
  if (signals.length === 1) return signals[0];
  return AbortSignal.any(signals);
}

/** True if `err` is the abort produced by AbortSignal.timeout() firing. */
function isTimeoutAbort(err: unknown): boolean {
  return err instanceof Error && err.name === "TimeoutError";
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason ?? new Error("Aborted"));
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(signal!.reason ?? new Error("Aborted"));
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function buildQuery(params?: object): string {
  if (!params) return "";
  const entries = Object.entries(params).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return "";
  return "?" + entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&");
}
