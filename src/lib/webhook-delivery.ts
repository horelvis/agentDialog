import { env } from "../env";
import { inspectWebhookTarget } from "./webhook-url-guard";

export interface WebhookDelivery {
  body: string;
  event: string;
  msgId: string;
  timestamp: number; // unix seconds, and part of the signed content
  signature: string; // one "v1,<base64>" per live secret, space delimited
}

/**
 * Headers follow Standard Webhooks, so a consumer verifies with an existing
 * library instead of a snippet of ours. X-AgentDialog-Event is a convenience
 * for routing and is deliberately outside the signature.
 */
export async function deliverWebhook(
  url: string,
  delivery: WebhookDelivery,
): Promise<{ success: boolean; statusCode?: number; error?: string }> {
  const e = env();

  // Checked here and not only at registration, because this is the call that
  // carries the security: a webhook stored before the guard existed, or one
  // whose hostname has since been repointed at a private address, only ever
  // meets the guard on its way out.
  const verdict = await inspectWebhookTarget(url);
  if (!verdict.allowed) {
    return { success: false, error: verdict.reason };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), e.WEBHOOK_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "webhook-id": delivery.msgId,
        "webhook-timestamp": String(delivery.timestamp),
        "webhook-signature": delivery.signature,
        "X-AgentDialog-Event": delivery.event,
        "User-Agent": "AgentDialog-Webhook/2.0",
      },
      body: delivery.body,
      signal: controller.signal,
      // A followed redirect walks straight past the check above: a public URL
      // answering 302 with a Location of 169.254.169.254 was the way in.
      redirect: "manual",
    });

    if (response.status >= 300 && response.status < 400) {
      return {
        success: false,
        statusCode: response.status,
        error: "Webhook URL answered with a redirect, which is not followed",
      };
    }

    return { success: response.ok, statusCode: response.status };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  } finally {
    clearTimeout(timeout);
  }
}
