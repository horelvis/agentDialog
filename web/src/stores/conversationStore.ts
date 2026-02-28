import { create } from "zustand";
import type { Conversation, Message, SendMessageInput } from "@/api/types";
import * as convApi from "@/api/conversations";

interface ConversationState {
  conversations: Conversation[];
  activeId: string | null;
  messagesMap: Record<string, Message[]>;
  loadingConversations: boolean;
  loadingMessages: boolean;
  cursors: Record<string, string | undefined>;
  hasMore: Record<string, boolean>;

  setActiveId: (id: string | null) => void;
  fetchConversations: () => Promise<void>;
  fetchMessages: (conversationId: string) => Promise<void>;
  fetchOlderMessages: (conversationId: string) => Promise<void>;
  sendMessage: (conversationId: string, input: SendMessageInput) => Promise<void>;
  addMessage: (message: Message) => void;
  updateMessage: (message: Message) => void;
}

export const useConversationStore = create<ConversationState>((set, get) => ({
  conversations: [],
  activeId: null,
  messagesMap: {},
  loadingConversations: false,
  loadingMessages: false,
  cursors: {},
  hasMore: {},

  setActiveId: (id) => set({ activeId: id }),

  fetchConversations: async () => {
    set({ loadingConversations: true });
    try {
      const res = await convApi.listConversations();
      set({ conversations: res.data ?? [] });
    } catch (e) {
      console.error("[fetchConversations]", e);
    } finally {
      set({ loadingConversations: false });
    }
  },

  fetchMessages: async (conversationId) => {
    set({ loadingMessages: true });
    try {
      const res = await convApi.listMessages(conversationId);
      set((s) => ({
        messagesMap: { ...s.messagesMap, [conversationId]: res.data ?? [] },
        cursors: { ...s.cursors, [conversationId]: (res.pagination as any)?.nextCursor ?? res.pagination?.cursor },
        hasMore: { ...s.hasMore, [conversationId]: res.pagination?.hasMore ?? false },
      }));
    } catch (e) {
      console.error("[fetchMessages]", e);
    } finally {
      set({ loadingMessages: false });
    }
  },

  fetchOlderMessages: async (conversationId) => {
    const cursor = get().cursors[conversationId];
    if (!cursor || !get().hasMore[conversationId]) return;

    const res = await convApi.listMessages(conversationId, 50, cursor);
    set((s) => ({
      messagesMap: {
        ...s.messagesMap,
        [conversationId]: [...res.data, ...(s.messagesMap[conversationId] ?? [])],
      },
      cursors: { ...s.cursors, [conversationId]: res.pagination.cursor },
      hasMore: { ...s.hasMore, [conversationId]: res.pagination.hasMore },
    }));
  },

  sendMessage: async (conversationId, input) => {
    // Optimistic: add a temp message
    const tempId = `temp-${Date.now()}`;
    const optimistic: Message = {
      id: tempId,
      conversationId,
      senderType: "human",
      type: input.type,
      content: input.content ?? null,
      structuredData: input.structuredData as Message["structuredData"],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    set((s) => ({
      messagesMap: {
        ...s.messagesMap,
        [conversationId]: [...(s.messagesMap[conversationId] ?? []), optimistic],
      },
    }));

    try {
      const { data: real } = await convApi.sendMessage(conversationId, input);
      // Replace optimistic with real, removing any WS duplicate
      set((s) => {
        const msgs = (s.messagesMap[conversationId] ?? [])
          .filter((m) => m.id !== real.id && m.id !== tempId);
        return {
          messagesMap: {
            ...s.messagesMap,
            [conversationId]: [...msgs, real],
          },
        };
      });
    } catch {
      // Remove optimistic on error
      set((s) => ({
        messagesMap: {
          ...s.messagesMap,
          [conversationId]: (s.messagesMap[conversationId] ?? []).filter((m) => m.id !== tempId),
        },
      }));
      throw new Error("Failed to send message");
    }
  },

  addMessage: (message) => {
    set((s) => {
      const existing = s.messagesMap[message.conversationId] ?? [];
      if (existing.some((m) => m.id === message.id)) return s;
      return {
        messagesMap: {
          ...s.messagesMap,
          [message.conversationId]: [...existing, message],
        },
      };
    });
  },

  updateMessage: (message) => {
    set((s) => ({
      messagesMap: {
        ...s.messagesMap,
        [message.conversationId]: (s.messagesMap[message.conversationId] ?? []).map((m) =>
          m.id === message.id ? message : m
        ),
      },
    }));
  },
}));
