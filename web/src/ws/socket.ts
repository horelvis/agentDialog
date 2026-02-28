import type { WsMessage } from "./types";

type Handler = (msg: WsMessage) => void;

export class LangChannelSocket {
  private ws: WebSocket | null = null;
  private url: string;
  private token: string;
  private handlers: Map<string, Set<Handler>> = new Map();
  private reconnectAttempt = 0;
  private maxReconnectDelay = 30000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private closed = false;
  private pendingQueue: Partial<WsMessage>[] = [];
  private activeSubscriptions = new Set<string>();

  constructor(url: string, token: string) {
    this.url = url;
    this.token = token;
  }

  connect() {
    this.closed = false;
    this.ws = new WebSocket(`${this.url}/ws?token=${this.token}`);

    this.ws.onopen = () => {
      this.reconnectAttempt = 0;
      this.emit("connected", { type: "connected" } as WsMessage);
      this.startPing();
      this.flushQueue();
      this.resubscribe();
    };

    this.ws.onmessage = (event) => {
      try {
        const msg: WsMessage = JSON.parse(event.data);
        this.emit(msg.type, msg);
      } catch {
        // ignore
      }
    };

    this.ws.onclose = () => {
      this.stopPing();
      if (!this.closed) {
        this.emit("disconnected", { type: "disconnected" } as WsMessage);
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  private startPing() {
    this.pingTimer = setInterval(() => {
      this.send({ type: "ping" });
    }, 30000);
  }

  private stopPing() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private scheduleReconnect() {
    const delay = Math.min(
      1000 * Math.pow(2, this.reconnectAttempt),
      this.maxReconnectDelay
    );
    this.reconnectAttempt++;
    this.emit("reconnecting", { type: "reconnecting" } as WsMessage);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private flushQueue() {
    while (this.pendingQueue.length > 0) {
      const msg = this.pendingQueue.shift()!;
      this.send(msg);
    }
  }

  private resubscribe() {
    for (const conversationId of this.activeSubscriptions) {
      this.send({ type: "subscribe", conversationId });
    }
  }

  send(msg: Partial<WsMessage>) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else if (!this.closed) {
      this.pendingQueue.push(msg);
    }
  }

  subscribe(conversationId: string) {
    this.activeSubscriptions.add(conversationId);
    this.send({ type: "subscribe", conversationId });
  }

  unsubscribe(conversationId: string) {
    this.activeSubscriptions.delete(conversationId);
    this.send({ type: "unsubscribe", conversationId });
  }

  on(event: string, handler: Handler) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
    return () => this.handlers.get(event)?.delete(handler);
  }

  private emit(event: string, msg: WsMessage) {
    this.handlers.get(event)?.forEach((h) => h(msg));
    this.handlers.get("*")?.forEach((h) => h(msg));
  }

  disconnect() {
    this.closed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.stopPing();
    this.pendingQueue = [];
    this.ws?.close();
    this.ws = null;
  }
}
