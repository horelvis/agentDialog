export { AgentDialog } from "./client.js";

export {
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

export type {
  ActorType,
  Agent,
  AgentDialogOptions,
  Conversation,
  ConversationStatus,
  CreateConversationInput,
  CreateWebhookInput,
  FileAttachment,
  IntentType,
  Invitation,
  InvitationStatus,
  InviteHumanInput,
  Message,
  MessageType,
  PaginatedResponse,
  Pagination,
  PaginationParams,
  Participant,
  RegisteredAgent,
  RegisterInput,
  RiskLevel,
  RotateKeyResponse,
  SendMessageInput,
  Severity,
  ToolCallStatus,
  UpdateConversationInput,
  UpdateProfileInput,
  UpdateWebhookInput,
  Webhook,
  WebhookWithSecret,
} from "./types.js";

export type {
  Answer,
  AnswerSpace,
  Change,
  ClarifyQueryInput,
  CreateQueryInput,
  CreatedQuery,
  Language,
  ListQueriesParams,
  Query,
  QueryStatus,
  QuerySummary,
  QueryType,
  Risk,
  Slot,
  Subject,
} from "./queries.js";

// verifyWebhook is exported from the "@agentdialog/sdk/webhooks" subpath, not
// here. It is the SDK's only import of a Node builtin (node:crypto), and it
// has never been published — moving it off the root barrel now, before the
// first release that carries it, costs nothing. Re-exporting it from the root
// would pull node:crypto into every consumer, including edge and browser
// runtimes that never touch webhooks.
