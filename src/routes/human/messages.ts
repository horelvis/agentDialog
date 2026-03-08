import { Hono } from "hono";
import type { AppEnv } from "../../types/hono";
import { createMessage, listMessages } from "../../services/message.service";
import { getFileDownloadUrl } from "../../services/file.service";
import { createMessageSchema } from "../../validators/message.validators";
import { validateBody, validateQuery } from "../../middleware/validate";
import { paginationQuery } from "../../validators/common.validators";
import { getLimit } from "../../lib/pagination";
import { getRedis } from "../../lib/redis";
import { ForbiddenError, NotFoundError } from "../../lib/errors";
import { getConversation, isParticipant } from "../../services/conversation.service";
import { dispatchWebhooks } from "../../services/webhook.service";

const app = new Hono<AppEnv>();

app.get("/conversations/:id/files/:attachmentId/download", async (c) => {
  const conversationId = c.req.param("id");
  const humanId = c.get("humanId");
  const attachmentId = c.req.param("attachmentId");

  if (!(await isParticipant(conversationId, "human", humanId))) {
    throw new ForbiddenError("Not a participant in this conversation");
  }

  const result = await getFileDownloadUrl(attachmentId);
  if (!result) throw new NotFoundError("Attachment", attachmentId);

  // Proxy the download from MinIO to avoid exposing internal URLs
  const fileRes = await fetch(result.downloadUrl);
  if (!fileRes.ok) throw new Error("Failed to fetch file from storage");

  return new Response(fileRes.body, {
    headers: {
      "Content-Type": result.mimeType,
      "Content-Disposition": `inline; filename="${result.fileName}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
});

app.get("/conversations/:id/messages", validateQuery(paginationQuery), async (c) => {
  const conversationId = c.req.param("id");
  const humanId = c.get("humanId");

  if (!(await isParticipant(conversationId, "human", humanId))) {
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
});

app.post("/conversations/:id/messages", validateBody(createMessageSchema), async (c) => {
  const conversationId = c.req.param("id");
  const humanId = c.get("humanId");
  const input = c.get("validatedBody");

  const message = await createMessage(conversationId, "human", humanId, input);

  // Publish to Redis for real-time delivery
  const redis = getRedis();
  await redis.publish(
    `conversation:${conversationId}`,
    JSON.stringify({ type: "message.new", data: message }),
  );

  // Dispatch webhooks so the owning agent is notified
  const conversation = await getConversation(conversationId);
  dispatchWebhooks(conversation.createdByAgentId, "message.new", { message });

  return c.json({ data: message }, 201);
});

export default app;
