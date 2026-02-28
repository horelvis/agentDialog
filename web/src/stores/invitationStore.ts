import { create } from "zustand";
import type { Invitation } from "@/api/types";
import * as invApi from "@/api/invitations";
import { useConversationStore } from "./conversationStore";

interface InvitationState {
  invitations: Invitation[];
  loading: boolean;

  fetchInvitations: () => Promise<void>;
  accept: (token: string) => Promise<Invitation>;
  decline: (token: string) => Promise<void>;
}

export const useInvitationStore = create<InvitationState>((set) => ({
  invitations: [],
  loading: false,

  fetchInvitations: async () => {
    set({ loading: true });
    try {
      const res = await invApi.listInvitations();
      set({ invitations: res.data ?? [] });
    } catch (e) {
      console.error("[fetchInvitations]", e);
    } finally {
      set({ loading: false });
    }
  },

  accept: async (token) => {
    const res = await invApi.acceptInvitation(token);
    set((s) => ({
      invitations: s.invitations.filter((i) => i.token !== token),
    }));
    // Reload conversations so the new one appears in the sidebar
    useConversationStore.getState().fetchConversations();
    return res.data;
  },

  decline: async (token) => {
    await invApi.declineInvitation(token);
    set((s) => ({
      invitations: s.invitations.filter((i) => i.token !== token),
    }));
  },
}));
