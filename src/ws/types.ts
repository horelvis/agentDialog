import type { ServerWebSocket } from "bun";

export interface WsData {
  actorType: "agent" | "human";
  actorId: string;
  subscriptions: Set<string>;
}

export type WsSocket = ServerWebSocket<WsData>;
