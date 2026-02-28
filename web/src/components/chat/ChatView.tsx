import { useEffect } from "react";
import { useParams } from "react-router";
import { useConversationStore } from "@/stores/conversationStore";
import { useWsStore } from "@/stores/wsStore";
import { ChatHeader } from "./ChatHeader";
import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";
import { TypingIndicator } from "./TypingIndicator";
import { EmptyState } from "./EmptyState";
import { Spinner } from "@/components/ui/Spinner";

export function ChatView() {
  const { id } = useParams<{ id: string }>();
  const conversations = useConversationStore((s) => s.conversations);
  const messagesMap = useConversationStore((s) => s.messagesMap);
  const hasMoreMap = useConversationStore((s) => s.hasMore);
  const loadingMessages = useConversationStore((s) => s.loadingMessages);
  const fetchMessages = useConversationStore((s) => s.fetchMessages);
  const fetchOlderMessages = useConversationStore((s) => s.fetchOlderMessages);
  const setActiveId = useConversationStore((s) => s.setActiveId);
  const wsSubscribe = useWsStore((s) => s.subscribe);
  const wsUnsubscribe = useWsStore((s) => s.unsubscribe);

  useEffect(() => {
    if (id) {
      setActiveId(id);
      fetchMessages(id);
      wsSubscribe(id);
    }
    return () => {
      if (id) wsUnsubscribe(id);
      setActiveId(null);
    };
  }, [id, setActiveId, fetchMessages, wsSubscribe, wsUnsubscribe]);

  if (!id) return <EmptyState />;

  const conversation = conversations.find((c) => c.id === id);
  const messages = messagesMap[id] ?? [];
  const hasMore = hasMoreMap[id] ?? false;

  if (loadingMessages && messages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {conversation && <ChatHeader conversation={conversation} />}
      <MessageList
        messages={messages}
        hasMore={hasMore}
        onLoadMore={() => id && fetchOlderMessages(id)}
      />
      {id && <TypingIndicator conversationId={id} />}
      {id && <MessageInput conversationId={id} />}
    </div>
  );
}
