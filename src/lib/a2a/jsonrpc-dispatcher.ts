import {
  type JsonRpcRequest,
  type JsonRpcResponse,
  sendMessageRequestSchema,
  taskIdParamsSchema,
  listTasksParamsSchema,
  type SendMessageRequest,
  type ListTasksParams,
} from "./types";
import {
  sendMessage,
  getTaskAsSender,
  listTasksAsSender,
  cancelTaskAsSender,
} from "../../services/a2a-mailbox.service";

/**
 * The A2A JSON-RPC binding is the spec's canonical wire format. Every method is
 * a thin adapter over the same mailbox service the HTTP+JSON routes use, so the
 * two bindings can never drift: one implementation, two transports.
 *
 * Both identities are resolved by the middleware before dispatch; a method can
 * only ever act as the authenticated sender on tasks addressed to the resolved
 * recipient.
 */

export interface JsonRpcContext {
  senderAgentId: string;
  recipientAgentId: string;
}

type MethodHandler = (params: Record<string, unknown>, ctx: JsonRpcContext) => Promise<unknown>;

const METHOD_HANDLERS: Record<string, MethodHandler> = {
  "message/send": async (params, ctx) => {
    const request = sendMessageRequestSchema.parse(params) as SendMessageRequest;
    return sendMessage(ctx.recipientAgentId, ctx.senderAgentId, request);
  },

  "tasks/get": async (params, ctx) => {
    const { taskId } = taskIdParamsSchema.parse(params);
    return getTaskAsSender(taskId, ctx.senderAgentId);
  },

  "tasks/list": async (params, ctx) => {
    const parsed = listTasksParamsSchema.parse(params) as ListTasksParams;
    return listTasksAsSender(ctx.senderAgentId, parsed);
  },

  "tasks/cancel": async (params, ctx) => {
    const { taskId } = taskIdParamsSchema.parse(params);
    return cancelTaskAsSender(taskId, ctx.senderAgentId);
  },
};

export async function dispatchJsonRpc(
  request: JsonRpcRequest,
  ctx: JsonRpcContext,
): Promise<JsonRpcResponse> {
  const handler = METHOD_HANDLERS[request.method];

  if (!handler) {
    return {
      jsonrpc: "2.0",
      error: { code: -32601, message: `Method not found: ${request.method}` },
      id: request.id,
    };
  }

  try {
    const result = await handler(request.params ?? {}, ctx);
    return { jsonrpc: "2.0", result, id: request.id };
  } catch (err) {
    return {
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: err instanceof Error ? err.message : "Internal error",
      },
      id: request.id,
    };
  }
}