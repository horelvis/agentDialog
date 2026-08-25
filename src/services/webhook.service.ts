import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "../db";
import { webhooks, type StoredSecret } from "../db/schema/webhooks";
import { seal, open } from "../lib/secret-box";
import {
  generateMessageId,
  generateWebhookSecret,
  signatureHeader,
} from "../lib/webhook-signature";
import { deliverWebhook } from "../lib/webhook-delivery";
import { NotFoundError, ForbiddenError } from "../lib/errors";
import { getLimitsConfig } from "../config/limits";

/**
 * A webhook as the API is allowed to describe it. `secrets` is absent by
 * construction rather than by remembering to strip it: the previous code
 * returned the whole row, and the row carried the signing key.
 */
export interface PublicWebhook {
  id: string;
  agentId: string;
  url: string;
  events: string[];
  isActive: boolean;
  failureCount: number;
  lastDeliveryAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const publicColumns = {
  id: webhooks.id,
  agentId: webhooks.agentId,
  url: webhooks.url,
  events: webhooks.events,
  isActive: webhooks.isActive,
  failureCount: webhooks.failureCount,
  lastDeliveryAt: webhooks.lastDeliveryAt,
  createdAt: webhooks.createdAt,
  updatedAt: webhooks.updatedAt,
};

function newSecret(): { record: StoredSecret; plaintext: string } {
  const plaintext = generateWebhookSecret();
  return {
    plaintext,
    record: {
      id: nanoid(12),
      ...seal(plaintext),
      createdAt: new Date().toISOString(),
      expiresAt: null,
    },
  };
}

/** The secrets that still sign a delivery. Exported so the rule can be tested. */
export function liveSecrets(secrets: StoredSecret[], now: Date = new Date()): StoredSecret[] {
  return secrets.filter((s) => s.expiresAt === null || new Date(s.expiresAt) > now);
}

export async function createWebhook(
  agentId: string,
  input: { url: string; events: string[] },
): Promise<{ webhook: PublicWebhook; secret: string }> {
  const db = getDb();
  const limits = getLimitsConfig();

  const existing = await db
    .select({ id: webhooks.id })
    .from(webhooks)
    .where(eq(webhooks.agentId, agentId));

  if (existing.length >= limits.maxWebhooksPerAgent) {
    throw new ForbiddenError(`Maximum ${limits.maxWebhooksPerAgent} webhooks per agent`);
  }

  const { record, plaintext } = newSecret();

  const [webhook] = await db
    .insert(webhooks)
    .values({ agentId, url: input.url, events: input.events, secrets: [record] })
    .returning(publicColumns);

  return { webhook, secret: plaintext };
}

export async function listWebhooks(agentId: string): Promise<PublicWebhook[]> {
  const db = getDb();
  return db.select(publicColumns).from(webhooks).where(eq(webhooks.agentId, agentId));
}

export async function updateWebhook(
  webhookId: string,
  agentId: string,
  input: { url?: string; events?: string[]; isActive?: boolean },
): Promise<PublicWebhook> {
  const db = getDb();
  const [webhook] = await db
    .update(webhooks)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(webhooks.id, webhookId), eq(webhooks.agentId, agentId)))
    .returning(publicColumns);

  if (!webhook) throw new NotFoundError("Webhook", webhookId);
  return webhook;
}

export async function deleteWebhook(
  webhookId: string,
  agentId: string,
): Promise<PublicWebhook> {
  const db = getDb();
  const [deleted] = await db
    .delete(webhooks)
    .where(and(eq(webhooks.id, webhookId), eq(webhooks.agentId, agentId)))
    .returning(publicColumns);

  if (!deleted) throw new NotFoundError("Webhook", webhookId);
  return deleted;
}

/**
 * Issue a new signing secret and give the old one a grace window. Both sign
 * every delivery until the window closes, so the consumer switches when it
 * likes. Works on an inactive webhook and reactivates it: that is how a
 * webhook disabled by the 0008 migration comes back.
 */
export async function rotateWebhookSecret(
  webhookId: string,
  agentId: string,
): Promise<{ webhook: PublicWebhook; secret: string }> {
  const db = getDb();
  const limits = getLimitsConfig();

  const [current] = await db
    .select({ secrets: webhooks.secrets })
    .from(webhooks)
    .where(and(eq(webhooks.id, webhookId), eq(webhooks.agentId, agentId)))
    .limit(1);

  if (!current) throw new NotFoundError("Webhook", webhookId);

  const { record, plaintext } = newSecret();
  const expiresAt = new Date(Date.now() + limits.webhookSecretGraceMs).toISOString();

  const retired = liveSecrets(current.secrets).map((s) => ({
    ...s,
    expiresAt: s.expiresAt ?? expiresAt,
  }));

  const [webhook] = await db
    .update(webhooks)
    .set({ secrets: [record, ...retired], isActive: true, updatedAt: new Date() })
    .where(and(eq(webhooks.id, webhookId), eq(webhooks.agentId, agentId)))
    .returning(publicColumns);

  return { webhook, secret: plaintext };
}

export async function dispatchWebhooks(
  agentId: string,
  event: string,
  data: Record<string, unknown>,
) {
  const db = getDb();
  const activeWebhooks = await db
    .select()
    .from(webhooks)
    .where(and(eq(webhooks.agentId, agentId), eq(webhooks.isActive, true)));

  const payload = { event, data, timestamp: new Date().toISOString() };
  const body = JSON.stringify(payload);

  for (const webhook of activeWebhooks) {
    const events = webhook.events as string[];
    if (events.length > 0 && !events.includes(event) && !events.includes("*")) {
      continue;
    }

    const secrets = liveSecrets(webhook.secrets).map((s) => open(s));
    if (secrets.length === 0) {
      // Every secret expired without a rotation. Signing with nothing would
      // send an unverifiable delivery, which is the bug we are removing.
      continue;
    }

    const msgId = generateMessageId();
    const timestamp = Math.floor(Date.now() / 1000);

    // Fire and forget with error tracking. Durable retries are a separate
    // piece of work; msgId is per message so a retry can reuse it.
    deliverWebhook(webhook.url, {
      body,
      event,
      msgId,
      timestamp,
      signature: signatureHeader(secrets, msgId, timestamp, body),
    }).then(async (result) => {
      if (!result.success) {
        await db
          .update(webhooks)
          .set({
            failureCount: webhook.failureCount + 1,
            isActive: webhook.failureCount + 1 >= 10 ? false : webhook.isActive,
            updatedAt: new Date(),
          })
          .where(eq(webhooks.id, webhook.id));
      } else {
        await db
          .update(webhooks)
          .set({ failureCount: 0, lastDeliveryAt: new Date(), updatedAt: new Date() })
          .where(eq(webhooks.id, webhook.id));
      }
    });
  }
}
