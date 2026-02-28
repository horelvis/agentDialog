import { useEffect } from "react";
import { useConversationStore } from "@/stores/conversationStore";

export function useConversation(id: string | undefined) {
  const fetchMessages = useConversationStore((s) => s.fetchMessages);
  const setActiveId = useConversationStore((s) => s.setActiveId);
  const messages = useConversationStore((s) => (id ? s.messagesMap[id] ?? [] : []));
  const hasMore = useConversationStore((s) => (id ? s.hasMore[id] ?? false : false));
  const loading = useConversationStore((s) => s.loadingMessages);

  useEffect(() => {
    if (id) {
      setActiveId(id);
      fetchMessages(id);
    }
    return () => setActiveId(null);
  }, [id, setActiveId, fetchMessages]);

  return { messages, hasMore, loading };
}
