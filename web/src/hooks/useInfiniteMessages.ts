import { useCallback, useRef } from "react";
import { useConversationStore } from "@/stores/conversationStore";

export function useInfiniteMessages(conversationId: string | undefined) {
  const fetchOlderMessages = useConversationStore((s) => s.fetchOlderMessages);
  const hasMore = useConversationStore((s) => (conversationId ? s.hasMore[conversationId] ?? false : false));
  const loadingRef = useRef(false);

  const loadMore = useCallback(async () => {
    if (!conversationId || !hasMore || loadingRef.current) return;
    loadingRef.current = true;
    try {
      await fetchOlderMessages(conversationId);
    } finally {
      loadingRef.current = false;
    }
  }, [conversationId, hasMore, fetchOlderMessages]);

  return { loadMore, hasMore };
}
