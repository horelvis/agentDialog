import { create } from "zustand";
import type { TrustedAgent } from "@/api/trustedAgents";
import * as trustedAgentsApi from "@/api/trustedAgents";

interface TrustedAgentState {
  agents: TrustedAgent[];
  loading: boolean;

  fetchTrustedAgents: () => Promise<void>;
  revoke: (agentId: string) => Promise<void>;
}

export const useTrustedAgentStore = create<TrustedAgentState>((set) => ({
  agents: [],
  loading: false,

  fetchTrustedAgents: async () => {
    set({ loading: true });
    try {
      const res = await trustedAgentsApi.listTrustedAgents();
      set({ agents: res.data ?? [] });
    } catch (e) {
      console.error("[fetchTrustedAgents]", e);
    } finally {
      set({ loading: false });
    }
  },

  revoke: async (agentId) => {
    await trustedAgentsApi.revokeTrust(agentId);
    set((s) => ({
      agents: s.agents.filter((a) => a.agentId !== agentId),
    }));
  },
}));
