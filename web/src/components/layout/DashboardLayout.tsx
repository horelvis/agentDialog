import { useEffect } from "react";
import { Outlet } from "react-router";
import { Sidebar } from "./Sidebar";
import { useAuthStore } from "@/stores/authStore";
import { useConversationStore } from "@/stores/conversationStore";
import { useInvitationStore } from "@/stores/invitationStore";
import { useUiStore } from "@/stores/uiStore";
import { useWebSocket } from "@/hooks/useWebSocket";
import { Spinner } from "@/components/ui/Spinner";

export function DashboardLayout() {
  const { isLoading, hydrate } = useAuthStore();
  const fetchConversations = useConversationStore((s) => s.fetchConversations);
  const fetchInvitations = useInvitationStore((s) => s.fetchInvitations);
  const setIsMobile = useUiStore((s) => s.setIsMobile);

  useWebSocket();

  useEffect(() => {
    hydrate();
    fetchConversations();
    fetchInvitations();
  }, [hydrate, fetchConversations, fetchInvitations]);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [setIsMobile]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex flex-1 flex-col overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
