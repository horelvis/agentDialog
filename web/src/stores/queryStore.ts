import { create } from "zustand";
import type { HumanQuery } from "@/api/types";
import * as queriesApi from "@/api/queries";

interface QueryState {
  queries: HumanQuery[];
  loading: boolean;

  fetchQueries: () => Promise<void>;
  respond: (
    queryId: string,
    input: { answer: string; comment?: string; confidence?: number },
  ) => Promise<void>;
}

export const useQueryStore = create<QueryState>((set) => ({
  queries: [],
  loading: false,

  fetchQueries: async () => {
    set({ loading: true });
    try {
      const res = await queriesApi.listQueries();
      set({ queries: res.data ?? [] });
    } catch (e) {
      console.error("[fetchQueries]", e);
    } finally {
      set({ loading: false });
    }
  },

  respond: async (queryId, input) => {
    await queriesApi.respondQuery(queryId, input);
    set((s) => ({
      queries: s.queries.filter((q) => q.id !== queryId),
    }));
  },
}));
