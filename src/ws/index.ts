import { authenticateWs } from "./auth";
import { connectionManager } from "./connection-manager";
import { handleMessage } from "./handlers";
import { initBroadcaster } from "./broadcaster";
import type { WsData } from "./types";

export function setupWebSocket(server: any) {
  initBroadcaster();
  console.log("[WS] WebSocket server ready");
}

export const websocketHandlers = {
  async open(ws: any) {
    console.log(`[WS] Connection opened: ${ws.data.actorType}:${ws.data.actorId}`);
    connectionManager.addConnection(ws);
  },

  async message(ws: any, message: string | Buffer) {
    const raw = typeof message === "string" ? message : message.toString();
    await handleMessage(ws, raw);
  },

  async close(ws: any) {
    console.log(`[WS] Connection closed: ${ws.data.actorType}:${ws.data.actorId}`);
    connectionManager.removeConnection(ws);
  },
};

export { authenticateWs } from "./auth";
export { connectionManager } from "./connection-manager";
