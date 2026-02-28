import type { WsSocket } from "./types";
import { connectionManager } from "./connection-manager";
import { isParticipant } from "../services/conversation.service";

export async function handleMessage(ws: WsSocket, raw: string) {
  let event: any;
  try {
    event = JSON.parse(raw);
  } catch {
    ws.send(JSON.stringify({ type: "error", data: { code: "INVALID_JSON", message: "Invalid JSON" } }));
    return;
  }

  switch (event.type) {
    case "subscribe":
      await handleSubscribe(ws, event.conversationId);
      break;
    case "unsubscribe":
      handleUnsubscribe(ws, event.conversationId);
      break;
    case "typing":
      handleTyping(ws, event.conversationId);
      break;
    case "read":
      handleRead(ws, event.conversationId, event.messageId);
      break;
    case "ping":
      ws.send(JSON.stringify({ type: "pong" }));
      break;
    default:
      ws.send(JSON.stringify({ type: "error", data: { code: "UNKNOWN_EVENT", message: `Unknown event: ${event.type}` } }));
  }
}

async function handleSubscribe(ws: WsSocket, conversationId: string) {
  if (!conversationId) {
    ws.send(JSON.stringify({ type: "error", data: { code: "MISSING_FIELD", message: "conversationId required" } }));
    return;
  }

  const allowed = await isParticipant(conversationId, ws.data.actorType, ws.data.actorId);
  if (!allowed) {
    ws.send(JSON.stringify({ type: "error", data: { code: "FORBIDDEN", message: "Not a participant" } }));
    return;
  }

  connectionManager.subscribe(ws, conversationId);
  ws.send(JSON.stringify({ type: "subscribed", data: { conversationId } }));
}

function handleUnsubscribe(ws: WsSocket, conversationId: string) {
  connectionManager.unsubscribe(ws, conversationId);
  ws.send(JSON.stringify({ type: "unsubscribed", data: { conversationId } }));
}

function handleTyping(ws: WsSocket, conversationId: string) {
  if (!ws.data.subscriptions.has(conversationId)) return;

  connectionManager.broadcastToConversation(
    conversationId,
    JSON.stringify({
      type: "typing",
      data: {
        conversationId,
        actorType: ws.data.actorType,
        actorId: ws.data.actorId,
      },
    }),
    ws,
  );
}

function handleRead(ws: WsSocket, conversationId: string, messageId: string) {
  if (!ws.data.subscriptions.has(conversationId)) return;

  connectionManager.broadcastToConversation(
    conversationId,
    JSON.stringify({
      type: "read",
      data: {
        conversationId,
        actorType: ws.data.actorType,
        actorId: ws.data.actorId,
        messageId,
      },
    }),
    ws,
  );
}
