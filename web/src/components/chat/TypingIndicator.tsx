import { useShallow } from "zustand/react/shallow";
import { useWsStore } from "@/stores/wsStore";

interface TypingIndicatorProps {
  conversationId: string;
}

export function TypingIndicator({ conversationId }: TypingIndicatorProps) {
  const typing = useWsStore(
    useShallow((s) => s.typingMap[conversationId] ?? [])
  );

  if (typing.length === 0) return null;

  return (
    <div className="flex items-center gap-2 px-4 py-2">
      <div className="flex gap-1">
        <span className="h-2 w-2 animate-bounce rounded-full bg-gray-500" style={{ animationDelay: "0ms" }} />
        <span className="h-2 w-2 animate-bounce rounded-full bg-gray-500" style={{ animationDelay: "150ms" }} />
        <span className="h-2 w-2 animate-bounce rounded-full bg-gray-500" style={{ animationDelay: "300ms" }} />
      </div>
      <span className="text-xs text-gray-500">
        {typing.length === 1 ? "Agent is typing..." : "Multiple are typing..."}
      </span>
    </div>
  );
}
