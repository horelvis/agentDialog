import { signWebhookPayload } from "./crypto";
import { env } from "../env";

interface WebhookPayload {
  event: string;
  data: Record<string, unknown>;
  timestamp: string;
}

export async function deliverWebhook(
  url: string,
  secret: string,
  payload: WebhookPayload,
): Promise<{ success: boolean; statusCode?: number; error?: string }> {
  const body = JSON.stringify(payload);
  const signature = signWebhookPayload(body, secret);
  const e = env();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), e.WEBHOOK_TIMEOUT_MS);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Messeger-Signature": `sha256=${signature}`,
        "X-Messeger-Event": payload.event,
        "X-Messeger-Timestamp": payload.timestamp,
        "User-Agent": "Messeger-Egentic-Webhook/1.0",
      },
      body,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    return {
      success: response.ok,
      statusCode: response.status,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
