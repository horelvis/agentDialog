import { getSubscriber } from "../lib/redis";
import { connectionManager } from "./connection-manager";

let initialized = false;

export function initBroadcaster() {
  if (initialized) return;
  initialized = true;

  const subscriber = getSubscriber();

  subscriber.on("pmessage", (_pattern: string, channel: string, message: string) => {
    // Channel format: "conversation:<id>"
    if (channel.startsWith("conversation:")) {
      const conversationId = channel.slice("conversation:".length);
      connectionManager.broadcastToConversation(conversationId, message);
    }
  });

  subscriber.psubscribe("conversation:*");
  console.log("[WS] Redis broadcaster initialized");
}
