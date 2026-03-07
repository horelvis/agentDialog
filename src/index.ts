import { loadEnv } from "./env";

// Load and validate environment variables first
const config = loadEnv();

import { createApp } from "./app";
import { setupWebSocket, websocketHandlers, authenticateWs } from "./ws";
import type { WsData } from "./ws/types";
import { initStorage } from "./services/file.service";

const app = createApp();

// Pre-create storage bucket at startup
initStorage().catch((e) => console.warn("[STORAGE] Bucket init failed:", e.message));

const server = Bun.serve<WsData>({
  port: config.PORT,
  hostname: config.HOST,
  fetch: async (req, server) => {
    // Handle WebSocket upgrade
    const url = new URL(req.url);
    if (url.pathname === "/ws") {
      const token =
        url.searchParams.get("token") ||
        req.headers.get("Authorization")?.slice(7) ||
        "";

      const auth = await authenticateWs(token);
      if (!auth) {
        return new Response("Unauthorized", { status: 401 });
      }

      const upgraded = server.upgrade(req, {
        data: {
          actorType: auth.actorType,
          actorId: auth.actorId,
          subscriptions: new Set<string>(),
        },
      });

      if (upgraded) return undefined;
      return new Response("WebSocket upgrade failed", { status: 500 });
    }

    // Handle HTTP requests via Hono
    return app.fetch(req, { ip: server.requestIP(req) });
  },
  websocket: websocketHandlers,
});

setupWebSocket(server);

console.log(`
  ╔══════════════════════════════════════════╗
  ║           AgentDialog v0.1.0                       ║
  ║   Agent-first messaging platform         ║
  ╠══════════════════════════════════════════╣
  ║  HTTP: http://${config.HOST}:${config.PORT}            ║
  ║  WS:   ws://${config.HOST}:${config.PORT}/ws           ║
  ║  Env:  ${config.NODE_ENV.padEnd(33)}║
  ╚══════════════════════════════════════════╝
`);

export default server;
