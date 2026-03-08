import { Hono } from "hono";
import type { AppEnv } from "../../types/hono";
import { uploadFile, getPresignedUploadUrl } from "../../services/file.service";
import { isParticipant } from "../../services/conversation.service";
import { createMessage } from "../../services/message.service";
import { ForbiddenError, ValidationError } from "../../lib/errors";
import { getLimitsConfig } from "../../config/limits";
import { getRedis } from "../../lib/redis";
import { dispatchWebhooks } from "../../services/webhook.service";

const app = new Hono<AppEnv>();

app.post("/:id/upload", async (c) => {
  const conversationId = c.req.param("id");
  const agentId = c.get("agentId");

  if (!(await isParticipant(conversationId, "agent", agentId))) {
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
  const message = await createMessage(conversationId, "agent", agentId, {
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

  // Dispatch webhooks
  dispatchWebhooks(agentId, "message.new", { message: messageWithAttachment });

  return c.json({ data: messageWithAttachment }, 201);
});

app.post("/:id/voice-note", async (c) => {
  const conversationId = c.req.param("id");
  const agentId = c.get("agentId");

  if (!(await isParticipant(conversationId, "agent", agentId))) {
    throw new ForbiddenError("Not a participant in this conversation");
  }

  const formData = await c.req.formData();
  const audio = formData.get("audio") as File;
  if (!audio) throw new ValidationError("No audio file provided");

  if (!audio.type.startsWith("audio/")) {
    throw new ValidationError("File must be an audio type (audio/*)");
  }

  const limits = getLimitsConfig();
  if (audio.size > limits.maxFileSize) {
    throw new ValidationError(`File too large. Maximum size: ${limits.maxFileSize / 1024 / 1024}MB`);
  }

  const durationMsRaw = formData.get("durationMs");
  const durationMs = durationMsRaw ? Number(durationMsRaw) : undefined;
  if (durationMs !== undefined && (isNaN(durationMs) || durationMs <= 0)) {
    throw new ValidationError("durationMs must be a positive number");
  }

  // 1. Create message of type "voice_note"
  const message = await createMessage(conversationId, "agent", agentId, {
    type: "voice_note",
    content: audio.name,
    structuredData: durationMs ? { durationMs } : undefined,
  });

  // 2. Upload file
  const buffer = Buffer.from(await audio.arrayBuffer());
  const attachment = await uploadFile(message.id, {
    name: audio.name,
    type: audio.type,
    size: audio.size,
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

  // Dispatch webhooks
  dispatchWebhooks(agentId, "message.new", { message: messageWithAttachment });

  return c.json({ data: messageWithAttachment }, 201);
});

app.post("/:id/upload/presigned", async (c) => {
  const conversationId = c.req.param("id");
  const agentId = c.get("agentId");

  if (!(await isParticipant(conversationId, "agent", agentId))) {
    throw new ForbiddenError("Not a participant in this conversation");
  }

  const body = await c.req.json();
  const { fileName } = body;
  if (!fileName) throw new ValidationError("fileName is required");

  const result = await getPresignedUploadUrl(fileName);
  return c.json({ data: result });
});

export default app;
