import { z } from "zod";
import { messageObject } from "./message.responses";
import { ok } from "./response.helpers";

/**
 * POST /:id/upload and /:id/voice-note both build `messageWithAttachment` by
 * hand in src/routes/agent/upload.ts: the message row from createMessage,
 * spread with a single-element `attachments` array built from the
 * fileAttachments row uploadFile returns. That is exactly the shape
 * message.responses.ts's messageObject already allows via its optional
 * `attachments` field, so this reuses it rather than redeclaring it.
 */
export const uploadedMessageResponse = ok(messageObject);

/**
 * POST /:id/upload/presigned: getPresignedUploadUrl in
 * src/services/file.service.ts returns exactly these three fields, and the
 * route sends that object under `data` unshaped.
 */
export const presignedUploadResponse = ok(
  z.object({
    url: z.string(),
    storageKey: z.string(),
    bucket: z.string(),
  }),
);
