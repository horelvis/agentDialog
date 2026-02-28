import { create } from "zustand";
import type { Human } from "@/api/types";
import * as authApi from "@/api/auth";
import * as profileApi from "@/api/profile";

interface AuthState {
  token: string | null;
  human: Human | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  hydrate: () => Promise<void>;
  login: (sessionToken: string, human: Human) => void;
  logout: () => Promise<void>;
  requestMagicLink: (email: string) => Promise<void>;
  verifyToken: (token: string) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: localStorage.getItem("token"),
  human: null,
  isAuthenticated: !!localStorage.getItem("token"),
  isLoading: false,

  hydrate: async () => {
    const token = localStorage.getItem("token");
    if (!token) return;
    set({ isLoading: true });
    try {
      const { data } = await profileApi.getMe();
      set({ human: data, isAuthenticated: true, token });
    } catch {
      localStorage.removeItem("token");
      set({ token: null, human: null, isAuthenticated: false });
    } finally {
      set({ isLoading: false });
    }
  },

  login: (sessionToken, human) => {
    localStorage.setItem("token", sessionToken);
    set({ token: sessionToken, human, isAuthenticated: true });
  },

  logout: async () => {
    try {
      await authApi.logout();
    } catch {
      // ignore
    }
    localStorage.removeItem("token");
    set({ token: null, human: null, isAuthenticated: false });
  },

  requestMagicLink: async (email) => {
    await authApi.requestMagicLink(email);
  },

  verifyToken: async (token) => {
    const { data } = await authApi.verifyToken(token);
    get().login(data.sessionToken, data.human);
  },
}));
