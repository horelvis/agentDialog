import { ChatView } from "@/components/chat/ChatView";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export function DashboardPage() {
  return (
    <ErrorBoundary>
      <ChatView />
    </ErrorBoundary>
  );
}
