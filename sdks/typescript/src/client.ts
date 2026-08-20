import {
  AgentDialogError,
  AuthenticationError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  RateLimitError,
  ServerError,
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
  fromCreatedQueryWire,
  fromQueryWire,
  fromQuerySummaryWire,
} from "./queries.js";
import type {
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

  async rotateApiKey(): Promise<RotateKeyResponse> {
    return this.request<RotateKeyResponse>("POST", "/agent/key/rotate");
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

  async createConversation(input: CreateConversationInput): Promise<Conversation> {
    return this.request<Conversation>("POST", "/agent/conversations", input);
  }

  async getConversation(id: string): Promise<Conversation> {
    return this.request<Conversation>("GET", `/agent/conversations/${id}`);
  }

  async updateConversation(id: string, input: UpdateConversationInput): Promise<Conversation> {
    return this.request<Conversation>("PATCH", `/agent/conversations/${id}`, input);
  }

  // ── Messages ──

  async sendMessage(conversationId: string, input: SendMessageInput): Promise<Message> {
    return this.request<Message>("POST", `/agent/conversations/${conversationId}/messages`, input);
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

  async inviteHuman(conversationId: string, input: InviteHumanInput): Promise<Invitation> {
    return this.request<Invitation>(
      "POST",
      `/agent/conversations/${conversationId}/invitations`,
      input,
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

  async createWebhook(input: CreateWebhookInput): Promise<WebhookWithSecret> {
    return this.request<WebhookWithSecret>("POST", "/agent/webhooks", input);
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
  async createQuery(input: CreateQueryInput): Promise<CreatedQuery> {
    const wire = await this.request<CreatedQueryWire>(
      "POST",
      "/agent/queries",
      toCreateQueryBody(input),
    );
    return fromCreatedQueryWire(wire);
  }

  /** Read a query's current status and, once answered, the human's answer. */
  async getQuery(queryId: string): Promise<Query> {
    const wire = await this.request<QueryWire>("GET", `/agent/queries/${queryId}`);
    return fromQueryWire(wire);
  }

  async listQueries(params?: ListQueriesParams): Promise<QuerySummary[]> {
    const wire = await this.request<QuerySummaryWire[]>(
      "GET",
      `/agent/queries${buildQuery(params)}`,
    );
    return wire.map(fromQuerySummaryWire);
  }

  // ── Internal ──

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    retries = 0,
  ): Promise<T> {
    const url = `${this.baseUrl}/api/v1${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
    };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (res.status === 429 && retries < MAX_RETRIES) {
      const retryAfter = parseRetryAfter(res);
      await sleep(retryAfter * 1000);
      return this.request<T>(method, path, body, retries + 1);
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildQuery(params?: object): string {
  if (!params) return "";
  const entries = Object.entries(params).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return "";
  return "?" + entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&");
}
