import { Link } from "react-router";
import type { Conversation } from "@/api/types";
import { Avatar } from "@/components/ui/Avatar";
import { formatRelativeTime } from "@/lib/formatters";
import { cn } from "@/lib/cn";
import { useUiStore } from "@/stores/uiStore";

interface ConversationItemProps {
  conversation: Conversation;
  isActive: boolean;
}

export function ConversationItem({ conversation, isActive }: ConversationItemProps) {
  const isMobile = useUiStore((s) => s.isMobile);
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);

  return (
    <Link
      to={`/app/c/${conversation.id}`}
      onClick={() => isMobile && setSidebarOpen(false)}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
        isActive
          ? "bg-brand-50 text-brand-700"
          : "text-gray-700 hover:bg-gray-100"
      )}
    >
      <Avatar name={conversation.title ?? "Conversation"} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{conversation.title ?? "Untitled"}</p>
        <p className="truncate text-xs text-gray-500">
          {formatRelativeTime(conversation.updatedAt)}
        </p>
      </div>
    </Link>
  );
}
