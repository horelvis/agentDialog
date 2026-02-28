import { useAuthStore } from "@/stores/authStore";

export function useAuth() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const human = useAuthStore((s) => s.human);
  const isLoading = useAuthStore((s) => s.isLoading);
  const logout = useAuthStore((s) => s.logout);

  return { isAuthenticated, human, isLoading, logout };
}
