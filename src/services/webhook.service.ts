import { eq, and } from "drizzle-orm";
import { getDb } from "../db";
import { webhooks } from "../db/schema/webhooks";
import { generateWebhookSecret, hashApiKey } from "../lib/crypto";
import { deliverWebhook } from "../lib/webhook-delivery";
import { NotFoundError, ForbiddenError } from "../lib/errors";
import { getLimitsConfig } from "../config/limits";

export async function createWebhook(
  agentId: string,
  input: { url: string; events: string[] },
) {
  const db = getDb();
  const limits = getLimitsConfig();

  const existing = await db
    .select({ id: webhooks.id })
    .from(webhooks)
    .where(eq(webhooks.agentId, agentId));

  if (existing.length >= limits.maxWebhooksPerAgent) {
    throw new ForbiddenError(`Maximum ${limits.maxWebhooksPerAgent} webhooks per agent`);
  }

  const secret = generateWebhookSecret();
  const secretHash = await hashApiKey(secret);

  const [webhook] = await db
    .insert(webhooks)
    .values({
      agentId,
      url: input.url,
      events: input.events,
      secretHash,
    })
    .returning();

  return { webhook, secret };
}

export async function listWebhooks(agentId: string) {
  const db = getDb();
  return db.select().from(webhooks).where(eq(webhooks.agentId, agentId));
}

export async function updateWebhook(
  webhookId: string,
  agentId: string,
  input: { url?: string; events?: string[]; isActive?: boolean },
) {
  const db = getDb();
  const [webhook] = await db
    .update(webhooks)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(webhooks.id, webhookId), eq(webhooks.agentId, agentId)))
    .returning();

  if (!webhook) throw new NotFoundError("Webhook", webhookId);
  return webhook;
}

export async function deleteWebhook(webhookId: string, agentId: string) {
  const db = getDb();
  const [deleted] = await db
    .delete(webhooks)
    .where(and(eq(webhooks.id, webhookId), eq(webhooks.agentId, agentId)))
    .returning();

  if (!deleted) throw new NotFoundError("Webhook", webhookId);
  return deleted;
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

  const payload = {
    event,
    data,
    timestamp: new Date().toISOString(),
  };

  for (const webhook of activeWebhooks) {
    // Check if webhook is subscribed to this event
    const events = webhook.events as string[];
    if (events.length > 0 && !events.includes(event) && !events.includes("*")) {
      continue;
    }

    // Fire and forget with error tracking
    deliverWebhook(webhook.url, webhook.secretHash, payload).then(async (result) => {
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
          .set({
            failureCount: 0,
            lastDeliveryAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(webhooks.id, webhook.id));
      }
    });
  }
}
