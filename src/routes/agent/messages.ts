import { Hono } from "hono";
import type { AppEnv } from "../../types/hono";
import { createMessage, listMessages } from "../../services/message.service";
import { isParticipant } from "../../services/conversation.service";
import { ForbiddenError } from "../../lib/errors";
import { createMessageSchema } from "../../validators/message.validators";
import { validateBody, validateQuery } from "../../middleware/validate";
import { idempotency } from "../../middleware/idempotency";
import { paginationQuery, uuidParam } from "../../validators/common.validators";
import { getLimit } from "../../lib/pagination";
import { getRedis } from "../../lib/redis";
import { dispatchWebhooks } from "../../services/webhook.service";
import { documented } from "../../openapi/documented";
import { res } from "../../openapi/types";
import { messageResponse, messageListResponse } from "../../validators/message.responses";
import { apiError } from "../../validators/response.helpers";

const hono = new Hono<AppEnv>();
const app = documented(hono, { basePath: "/api/v1/agent/conversations", tag: "messages" });

app.post(
  "/:id/messages",
  {
    summary: "Send a message in a conversation",
    params: uuidParam,
    body: createMessageSchema,
    responses: {
      201: res(messageResponse, "The message, created and delivered over the WebSocket and any subscribed webhook."),
      403: res(apiError, "The authenticated agent is not a participant in this conversation."),
      422: res(apiError, "The request body failed validation."),
    },
    idempotent: true,
  },
  idempotency(),
  validateBody(createMessageSchema),
  async (c) => {
    const conversationId = c.req.param("id");
    const agentId = c.get("agentId");

    if (!(await isParticipant(conversationId, "agent", agentId))) {
      throw new ForbiddenError("Not a participant in this conversation");
    }

    const input = c.get("validatedBody");

    const message = await createMessage(conversationId, "agent", agentId, input);

    // Publish to Redis for real-time delivery
    const redis = getRedis();
    await redis.publish(
      `conversation:${conversationId}`,
      JSON.stringify({ type: "message.new", data: message }),
    );

    // Dispatch webhooks for agents subscribed to this conversation
    dispatchWebhooks(agentId, "message.new", { message });

    return c.json({ data: message }, 201);
  },
);

app.get(
  "/:id/messages",
  {
    summary: "List messages in a conversation",
    description:
      "Paginated, but not with the API's usual envelope: this route builds its own pagination object with hasMore, nextCursor and count, and never returns prevCursor.",
    params: uuidParam,
    query: paginationQuery,
    responses: {
      200: res(messageListResponse, "Messages in the conversation, paginated."),
      403: res(apiError, "The authenticated agent is not a participant in this conversation."),
      422: res(apiError, "The `limit` or `cursor` query parameter failed validation."),
    },
  },
  validateQuery(paginationQuery),
  async (c) => {
    const conversationId = c.req.param("id");
    const agentId = c.get("agentId");

    if (!(await isParticipant(conversationId, "agent", agentId))) {
      throw new ForbiddenError("Not a participant in this conversation");
    }

    const query = c.get("validatedQuery") as any;
    const limit = getLimit(query.limit);
    const result = await listMessages(conversationId, limit, query.cursor);

    return c.json({
      data: result.data,
      pagination: {
        hasMore: result.hasMore,
        nextCursor: result.nextCursor,
        count: result.data.length,
      },
    });
  },
);

// The bare Hono, not the documented() facade — app.route(...) in src/app.ts
// needs a real Hono instance to mount.
export default hono;
