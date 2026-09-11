import { z } from "zod";

export const a2aVersion = "1.0";

export const taskStates = [
  "TASK_STATE_SUBMITTED",
  "TASK_STATE_WORKING",
  "TASK_STATE_INPUT_REQUIRED",
  "TASK_STATE_COMPLETED",
  "TASK_STATE_FAILED",
  "TASK_STATE_CANCELED",
  "TASK_STATE_REJECTED",
] as const;

export const taskStateSchema = z.enum(taskStates);
export type TaskState = z.infer<typeof taskStateSchema>;

export const internalTaskStates = [
  "submitted",
  "working",
  "input_required",
  "completed",
  "failed",
  "canceled",
  "rejected",
] as const;

export const internalTaskStateSchema = z.enum(internalTaskStates);
export type InternalTaskState = z.infer<typeof internalTaskStateSchema>;

export const roleSchema = z.enum(["user", "agent"]);
export type Role = z.infer<typeof roleSchema>;

export const textPartSchema = z.object({
  kind: z.literal("text"),
  text: z.string(),
});
export type TextPart = z.infer<typeof textPartSchema>;

export const filePartSchema = z.object({
  kind: z.literal("file"),
  file: z.object({
    name: z.string().optional(),
    mimeType: z.string().optional(),
    bytes: z.string().optional(), // base64
    uri: z.string().url().optional(),
  }),
});
export type FilePart = z.infer<typeof filePartSchema>;

export const dataPartSchema = z.object({
  kind: z.literal("data"),
  data: z.record(z.unknown()),
});
export type DataPart = z.infer<typeof dataPartSchema>;

export const partSchema = z.discriminatedUnion("kind", [
  textPartSchema,
  filePartSchema,
  dataPartSchema,
]);
export type Part = z.infer<typeof partSchema>;

export const messageSchema = z.object({
  messageId: z.string().uuid().optional(),
  role: roleSchema,
  parts: z.array(partSchema).min(1),
  contextId: z.string().optional(),
  taskId: z.string().uuid().optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type Message = z.infer<typeof messageSchema>;

export const artifactSchema = z.object({
  artifactId: z.string().uuid().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  parts: z.array(partSchema).min(1),
  index: z.number().int().nonnegative().optional(),
  append: z.boolean().optional(),
  lastChunk: z.boolean().optional(),
});
export type Artifact = z.infer<typeof artifactSchema>;

export const taskStatusSchema = z.object({
  state: taskStateSchema,
  message: messageSchema.optional(),
  reasonCode: z.string().optional(),
  reasonDescription: z.string().optional(),
  timestamp: z.string().datetime().optional(),
});
export type TaskStatus = z.infer<typeof taskStatusSchema>;

export const taskSchema = z.object({
  id: z.string().uuid(),
  contextId: z.string().optional(),
  sessionId: z.string().optional(),
  status: taskStatusSchema,
  messages: z.array(messageSchema).optional(),
  artifacts: z.array(artifactSchema).optional(),
  history: z.array(taskStatusSchema).optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type Task = z.infer<typeof taskSchema>;

export const taskStatusUpdateEventSchema = z.object({
  status: taskStatusSchema,
  finalChunk: z.boolean().optional(),
  timestamp: z.string().datetime().optional(),
});
export type TaskStatusUpdateEvent = z.infer<typeof taskStatusUpdateEventSchema>;

export const taskArtifactUpdateEventSchema = z.object({
  artifact: artifactSchema,
  finalChunk: z.boolean().optional(),
  timestamp: z.string().datetime().optional(),
});
export type TaskArtifactUpdateEvent = z.infer<typeof taskArtifactUpdateEventSchema>;

export const agentInterfaceSchema = z.object({
  protocolBinding: z.enum(["HTTP+JSON", "JSONRPC", "GRPC"]),
  url: z.string().url(),
  protocolVersion: z.string(),
});
export type AgentInterface = z.infer<typeof agentInterfaceSchema>;

export const agentCapabilitiesSchema = z.object({
  streaming: z.boolean().optional(),
  pushNotifications: z.boolean().optional(),
  stateTransitionHistory: z.boolean().optional(),
  extendedAgentCard: z.boolean().optional(),
});
export type AgentCapabilities = z.infer<typeof agentCapabilitiesSchema>;

export const apiKeySecuritySchemeSchema = z.object({
  type: z.literal("apiKey"),
  in: z.literal("header"),
  name: z.literal("Authorization"),
  description: z.string().optional(),
});
export type ApiKeySecurityScheme = z.infer<typeof apiKeySecuritySchemeSchema>;

export const securitySchemeSchema = z.discriminatedUnion("type", [
  apiKeySecuritySchemeSchema,
]);
export type SecurityScheme = z.infer<typeof securitySchemeSchema>;

export const agentSkillSchema = z.object({
  id: z.string().min(1).max(128),
  name: z.string().min(1).max(256),
  description: z.string().max(2048).optional(),
  tags: z.array(z.string().max(64)).max(20).optional(),
  examples: z.array(z.string()).max(10).optional(),
  inputModes: z.array(z.string()).max(20).optional(),
  outputModes: z.array(z.string()).max(20).optional(),
});
export type AgentSkill = z.infer<typeof agentSkillSchema>;

export const agentCardSchema = z.object({
  name: z.string().min(1).max(256),
  description: z.string().max(4096).optional(),
  version: z.string().min(1).max(64),
  provider: z.object({
    organization: z.string().optional(),
    url: z.string().url().optional(),
  }).optional(),
  supportedInterfaces: z.array(agentInterfaceSchema).min(1),
  capabilities: agentCapabilitiesSchema.optional(),
  securitySchemes: z.record(securitySchemeSchema).optional(),
  securityRequirements: z.array(z.record(z.array(z.string()))).optional(),
  defaultInputModes: z.array(z.string()).max(20).optional(),
  defaultOutputModes: z.array(z.string()).max(20).optional(),
  skills: z.array(agentSkillSchema).max(50).optional(),
  iconUrl: z.string().url().optional(),
});
export type AgentCard = z.infer<typeof agentCardSchema>;

export const sendMessageRequestSchema = z.object({
  message: messageSchema,
  contextId: z.string().optional(),
  sessionId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  pushNotification: z.record(z.unknown()).optional(),
});
export type SendMessageRequest = z.infer<typeof sendMessageRequestSchema>;

export const jsonRpcRequestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  method: z.string(),
  params: z.record(z.unknown()).optional(),
  id: z.union([z.string(), z.number(), z.null()]),
});
export type JsonRpcRequest = z.infer<typeof jsonRpcRequestSchema>;

export const jsonRpcResponseSchema = z.object({
  jsonrpc: z.literal("2.0"),
  result: z.unknown().optional(),
  error: z.object({
    code: z.number().int(),
    message: z.string(),
    data: z.unknown().optional(),
  }).optional(),
  id: z.union([z.string(), z.number(), z.null()]),
});
export type JsonRpcResponse = z.infer<typeof jsonRpcResponseSchema>;

export const taskIdParamsSchema = z.object({
  taskId: z.string().uuid(),
  contextId: z.string().optional(),
});
export type TaskIdParams = z.infer<typeof taskIdParamsSchema>;

export const listTasksParamsSchema = z.object({
  contextId: z.string().optional(),
  state: taskStateSchema.optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
});
export type ListTasksParams = z.infer<typeof listTasksParamsSchema>;

/**
 * The A2A protocol uses camelCase in its wire format. The JSON-RPC and
 * HTTP+JSON bindings share the same canonical data model, so these schemas are
 * the single source of truth for both.
 */
