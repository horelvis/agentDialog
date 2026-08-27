import { Hono } from "hono";
// Must be imported before the .openapi() calls below run, and this module's
// own top-level code is exactly where they run — see the note in
// src/openapi/document.ts.
import "zod-openapi/extend";
import { z } from "zod";
import type { AppEnv } from "../../types/hono";
import { uploadFile, getPresignedUploadUrl } from "../../services/file.service";
import { isParticipant } from "../../services/conversation.service";
import { createMessage } from "../../services/message.service";
import { ForbiddenError, ValidationError } from "../../lib/errors";
import { getLimitsConfig } from "../../config/limits";
import { getRedis } from "../../lib/redis";
import { dispatchWebhooks } from "../../services/webhook.service";
import { documented } from "../../openapi/documented";
import { res } from "../../openapi/types";
import { validateBody } from "../../middleware/validate";
import { uuidParam } from "../../validators/common.validators";
import { presignedUploadRequestSchema } from "../../validators/upload.validators";
import { uploadedMessageResponse, presignedUploadResponse } from "../../validators/upload.responses";
import { apiError } from "../../validators/response.helpers";

const hono = new Hono<AppEnv>();
const app = documented(hono, { basePath: "/api/v1/agent/conversations", tag: "upload" });

// Documentation-only approximations of the multipart fields these two routes
// read by hand via c.req.formData() — there is no validateBody schema behind
// them to reuse, unlike every JSON route in this API.
//
// .openapi(), not .describe(): zod-openapi 4 emits no schema-level
// description from .describe() at all, so text attached that way reaches no
// reader — what a generator would see for `file` without this is a bare
// `{ "type": "string" }`, indistinguishable from a text field. `type` and
// `format` here are what tells a generator to emit a file upload control
// instead.
const uploadFileRequest = z.object({
  file: z.string().openapi({
    type: "string",
    format: "binary",
    description: "The file to attach, as a binary multipart/form-data field named `file`.",
  }),
});

const voiceNoteRequest = z.object({
  audio: z.string().openapi({
    type: "string",
    format: "binary",
    description: "The recording, as a binary multipart/form-data field named `audio` (must be audio/*).",
  }),
  durationMs: z.string().optional().openapi({
    description: "Optional recording duration, as a numeric form field.",
  }),
});

app.post(
  "/:id/upload",
  {
    summary: "Upload a file into a conversation",
    description: "Creates a message of type \"file\" and attaches the upload to it.",
    params: uuidParam,
    body: uploadFileRequest,
    bodyContentType: "multipart/form-data",
    responses: {
      201: res(uploadedMessageResponse, "The file, attached to a new message of type \"file\"."),
      403: res(apiError, "The authenticated agent is not a participant in this conversation."),
      422: res(apiError, "No `file` field was sent, or it exceeds the configured maximum file size."),
    },
  },
  async (c) => {
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
  },
);

app.post(
  "/:id/voice-note",
  {
    summary: "Upload a voice note into a conversation",
    description: "Creates a message of type \"voice_note\" and attaches the recording to it.",
    params: uuidParam,
    body: voiceNoteRequest,
    bodyContentType: "multipart/form-data",
    responses: {
      201: res(uploadedMessageResponse, "The recording, attached to a new message of type \"voice_note\"."),
      403: res(apiError, "The authenticated agent is not a participant in this conversation."),
      422: res(
        apiError,
        "No `audio` field was sent, it isn't an audio/* type, it exceeds the configured maximum file size, or `durationMs` isn't a positive number.",
      ),
    },
  },
  async (c) => {
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
  },
);

app.post(
  "/:id/upload/presigned",
  {
    summary: "Get a presigned URL to upload a file directly to storage",
    params: uuidParam,
    body: presignedUploadRequestSchema,
    responses: {
      200: res(presignedUploadResponse, "A URL to PUT the file to directly, and the storage key it will be stored under."),
      403: res(apiError, "The authenticated agent is not a participant in this conversation."),
      422: res(apiError, "The request body failed validation."),
    },
  },
  validateBody(presignedUploadRequestSchema),
  async (c) => {
    const conversationId = c.req.param("id");
    const agentId = c.get("agentId");

    if (!(await isParticipant(conversationId, "agent", agentId))) {
      throw new ForbiddenError("Not a participant in this conversation");
    }

    const { fileName } = c.get("validatedBody") as { fileName: string };

    const result = await getPresignedUploadUrl(fileName);
    return c.json({ data: result });
  },
);

// The bare Hono, not the documented() facade — app.route(...) in src/app.ts
// needs a real Hono instance to mount.
export default hono;
