import type { WsSocket, WsData } from "./types";

class ConnectionManager {
  private connections = new Map<string, Set<WsSocket>>();
  private actorConnections = new Map<string, Set<WsSocket>>();

  addConnection(ws: WsSocket) {
    const key = `${ws.data.actorType}:${ws.data.actorId}`;
    if (!this.actorConnections.has(key)) {
      this.actorConnections.set(key, new Set());
    }
    this.actorConnections.get(key)!.add(ws);
  }

  removeConnection(ws: WsSocket) {
    const key = `${ws.data.actorType}:${ws.data.actorId}`;
    this.actorConnections.get(key)?.delete(ws);
    if (this.actorConnections.get(key)?.size === 0) {
      this.actorConnections.delete(key);
    }

    // Remove from all subscriptions
    for (const conversationId of ws.data.subscriptions) {
      this.unsubscribe(ws, conversationId);
    }
  }

  subscribe(ws: WsSocket, conversationId: string) {
    ws.data.subscriptions.add(conversationId);
    if (!this.connections.has(conversationId)) {
      this.connections.set(conversationId, new Set());
    }
    this.connections.get(conversationId)!.add(ws);
  }

  unsubscribe(ws: WsSocket, conversationId: string) {
    ws.data.subscriptions.delete(conversationId);
    this.connections.get(conversationId)?.delete(ws);
    if (this.connections.get(conversationId)?.size === 0) {
      this.connections.delete(conversationId);
    }
  }

  getSubscribers(conversationId: string): Set<WsSocket> {
    return this.connections.get(conversationId) || new Set();
  }

  broadcastToConversation(conversationId: string, message: string, exclude?: WsSocket) {
    const subscribers = this.getSubscribers(conversationId);
    for (const ws of subscribers) {
      if (ws !== exclude) {
        try {
          ws.send(message);
        } catch {
          this.removeConnection(ws);
        }
      }
    }
  }

  sendToActor(actorType: string, actorId: string, message: string) {
    const key = `${actorType}:${actorId}`;
    const sockets = this.actorConnections.get(key);
    if (sockets) {
      for (const ws of sockets) {
        try {
          ws.send(message);
        } catch {
          this.removeConnection(ws);
        }
      }
    }
  }

  getStats() {
    let totalConnections = 0;
    for (const sockets of this.actorConnections.values()) {
      totalConnections += sockets.size;
    }
    return {
      totalConnections,
      totalSubscriptions: this.connections.size,
      uniqueActors: this.actorConnections.size,
    };
  }
}

export const connectionManager = new ConnectionManager();
