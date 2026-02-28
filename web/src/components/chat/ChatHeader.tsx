import type { Conversation } from "@/api/types";
import { Badge } from "@/components/ui/Badge";
import { useUiStore } from "@/stores/uiStore";

interface ChatHeaderProps {
  conversation: Conversation;
}

export function ChatHeader({ conversation }: ChatHeaderProps) {
  const { isMobile, toggleSidebar } = useUiStore();

  return (
    <header className="flex items-center gap-3 border-b border-surface-border bg-surface-secondary px-4 py-3">
      {isMobile && (
        <button onClick={toggleSidebar} className="text-gray-400 hover:text-gray-200">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      )}
      <div className="min-w-0 flex-1">
        <h2 className="truncate font-semibold text-gray-100">{conversation.title ?? "Untitled"}</h2>
        {conversation.description && (
          <p className="truncate text-sm text-gray-400">{conversation.description}</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Badge>{conversation.status}</Badge>
        {conversation.participants && (
          <span className="text-xs text-gray-500">{conversation.participants.length} participants</span>
        )}
      </div>
    </header>
  );
}
