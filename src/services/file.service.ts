import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { fileAttachments } from "../db/schema/file-attachments";
import { messages } from "../db/schema/messages";
import { getStorage, ensureBucket, getPresignedUrl, getPresignedPutUrl } from "../lib/storage";
import { env } from "../env";
import { nanoid } from "nanoid";

export async function initStorage() {
  const e = env();
  await ensureBucket(e.MINIO_BUCKET);
  console.log("[STORAGE] Bucket ready:", e.MINIO_BUCKET);
}

export async function uploadFile(
  messageId: string,
  file: { name: string; type: string; size: number; data: Buffer | ReadableStream },
) {
  const e = env();
  const bucket = e.MINIO_BUCKET;
  const storageKey = `${nanoid(12)}/${file.name}`;
  const client = getStorage();
  await client.putObject(bucket, storageKey, file.data as any, file.size, {
    "Content-Type": file.type,
  });

  const db = getDb();
  const [attachment] = await db
    .insert(fileAttachments)
    .values({
      messageId,
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      storageKey,
      storageBucket: bucket,
    })
    .returning();

  return attachment;
}

export async function getPresignedUploadUrl(fileName: string) {
  const e = env();
  const bucket = e.MINIO_BUCKET;
  await ensureBucket(bucket);

  const storageKey = `${nanoid(12)}/${fileName}`;
  const url = await getPresignedPutUrl(bucket, storageKey, 3600);
  return { url, storageKey, bucket };
}

// The conversation is not a hint, it is the authorization boundary. A caller
// proves they participate in one conversation and then names an attachment;
// resolving that id on its own would hand them any file in the system, so the
// lookup only ever sees attachments hanging off a message in that conversation.
export async function getFileDownloadUrl(attachmentId: string, conversationId: string) {
  const db = getDb();
  const [row] = await db
    .select({ attachment: fileAttachments })
    .from(fileAttachments)
    .innerJoin(messages, eq(fileAttachments.messageId, messages.id))
    .where(
      and(
        eq(fileAttachments.id, attachmentId),
        eq(messages.conversationId, conversationId),
      ),
    )
    .limit(1);

  if (!row) return null;
  const attachment = row.attachment;

  const url = await getPresignedUrl(attachment.storageBucket, attachment.storageKey, 3600);
  return { ...attachment, downloadUrl: url };
}
