import { create } from "zustand";
import type { AgentDialogSocket } from "@/ws/socket";

type WsStatus = "disconnected" | "connecting" | "connected" | "reconnecting";

interface WsState {
  status: WsStatus;
  socket: AgentDialogSocket | null;
  typingMap: Record<string, { actorType: string; actorId: string; timeout: number }[]>;
  subscriptions: Set<string>;

  setStatus: (status: WsStatus) => void;
  setSocket: (socket: AgentDialogSocket | null) => void;
  setTyping: (conversationId: string, actorType: string, actorId: string) => void;
  clearTyping: (conversationId: string, actorId: string) => void;
  subscribe: (conversationId: string) => void;
  unsubscribe: (conversationId: string) => void;
}

export const useWsStore = create<WsState>((set, get) => ({
  status: "disconnected",
  socket: null,
  typingMap: {},
  subscriptions: new Set(),

  setStatus: (status) => set({ status }),
  setSocket: (socket) => set({ socket }),

  setTyping: (conversationId, actorType, actorId) => {
    const current = get().typingMap[conversationId] ?? [];
    const existing = current.find((t) => t.actorId === actorId);

    if (existing) {
      window.clearTimeout(existing.timeout);
    }

    const timeout = window.setTimeout(() => {
      get().clearTyping(conversationId, actorId);
    }, 3000);

    const filtered = current.filter((t) => t.actorId !== actorId);
    set((s) => ({
      typingMap: {
        ...s.typingMap,
        [conversationId]: [...filtered, { actorType, actorId, timeout }],
      },
    }));
  },

  clearTyping: (conversationId, actorId) => {
    set((s) => ({
      typingMap: {
        ...s.typingMap,
        [conversationId]: (s.typingMap[conversationId] ?? []).filter(
          (t) => t.actorId !== actorId
        ),
      },
    }));
  },

  subscribe: (conversationId) => {
    const { socket, subscriptions } = get();
    if (subscriptions.has(conversationId)) return;
    socket?.subscribe(conversationId);
    set((s) => {
      const subs = new Set(s.subscriptions);
      subs.add(conversationId);
      return { subscriptions: subs };
    });
  },

  unsubscribe: (conversationId) => {
    const { socket } = get();
    socket?.unsubscribe(conversationId);
    set((s) => {
      const subs = new Set(s.subscriptions);
      subs.delete(conversationId);
      return { subscriptions: subs };
    });
  },
}));
