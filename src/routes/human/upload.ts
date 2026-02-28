import { Hono } from "hono";
import type { AppEnv } from "../../types/hono";
import { uploadFile } from "../../services/file.service";
import { isParticipant } from "../../services/conversation.service";
import { createMessage } from "../../services/message.service";
import { ForbiddenError, ValidationError } from "../../lib/errors";
import { getLimitsConfig } from "../../config/limits";
import { getRedis } from "../../lib/redis";

const app = new Hono<AppEnv>();

app.post("/conversations/:id/upload", async (c) => {
  const conversationId = c.req.param("id");
  const humanId = c.get("humanId");

  if (!(await isParticipant(conversationId, "human", humanId))) {
    throw new ForbiddenError("Not a participant in this conversation");
  }

  const formData = await c.req.formData();
  const file = formData.get("file") as File;
  if (!file) throw new ValidationError("No file provided");

  const limits = getLimitsConfig();
  if (file.size > limits.maxFileSize) {
    throw new ValidationError(`File too large. Maximum size: ${limits.maxFileSize / 1024 / 1024}MB`);
  }

  // 1. Create message of type "file"
  const message = await createMessage(conversationId, "human", humanId, {
    type: "file",
    content: file.name,
  });

  // 2. Upload file with real messageId
  const buffer = Buffer.from(await file.arrayBuffer());
  const attachment = await uploadFile(message.id, {
    name: file.name,
    type: file.type,
    size: file.size,
    data: buffer,
  });

  // 3. Publish to Redis with attachment included
  const redis = getRedis();
  const messageWithAttachment = {
    ...message,
    attachments: [{
      id: attachment.id,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
    }],
  };
  await redis.publish(
    `conversation:${conversationId}`,
    JSON.stringify({ type: "message.new", data: messageWithAttachment }),
  );

  return c.json({ data: messageWithAttachment }, 201);
});

export default app;
