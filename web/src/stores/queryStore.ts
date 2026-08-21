import { create } from "zustand";
import type { HumanQuery } from "@/api/types";
import * as queriesApi from "@/api/queries";
import type { RespondInput } from "@/api/queries";

interface QueryState {
  queries: HumanQuery[];
  loading: boolean;

  fetchQueries: () => Promise<void>;
  respond: (queryId: string, input: RespondInput) => Promise<void>;
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
    // Both outcomes remove the card: an answer closes it, and
    // insufficient_context hands the turn back to the agent — either way
    // listHumanQueries only ever returns pending/assigned rows, so this
    // query will not be among them until the agent clarifies it.
    set((s) => ({
      queries: s.queries.filter((q) => q.id !== queryId),
    }));
  },
}));
