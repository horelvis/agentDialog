import { useEffect } from "react";
import { useParams } from "react-router";
import { useConversationStore } from "@/stores/conversationStore";
import { useWsStore } from "@/stores/wsStore";
import { useQueryStore } from "@/stores/queryStore";
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
  const fetchQueries = useQueryStore((s) => s.fetchQueries);

  useEffect(() => {
    if (id) {
      setActiveId(id);
      fetchMessages(id);
      wsSubscribe(id);
      // A human_query message renders as the query itself, which the chat
      // reads from the query store rather than from the message: the answer
      // space lives on the query and is deliberately not copied into the
      // message. Without this the card would fall back to plain question text
      // for anyone who reached a conversation without passing through the
      // queries page first.
      fetchQueries();
    }
    return () => {
      if (id) wsUnsubscribe(id);
      setActiveId(null);
    };
  }, [id, setActiveId, fetchMessages, wsSubscribe, wsUnsubscribe, fetchQueries]);

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
