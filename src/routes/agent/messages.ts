import { Hono } from "hono";
import type { AppEnv } from "../../types/hono";
import { createMessage, listMessages } from "../../services/message.service";
import { createMessageSchema } from "../../validators/message.validators";
import { validateBody, validateQuery } from "../../middleware/validate";
import { paginationQuery } from "../../validators/common.validators";
import { getLimit } from "../../lib/pagination";
import { getRedis } from "../../lib/redis";
import { dispatchWebhooks } from "../../services/webhook.service";

const app = new Hono<AppEnv>();

app.post("/:id/messages", validateBody(createMessageSchema), async (c) => {
  const conversationId = c.req.param("id");
  const agentId = c.get("agentId");
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
});

app.get("/:id/messages", validateQuery(paginationQuery), async (c) => {
  const conversationId = c.req.param("id");
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
});

export default app;
