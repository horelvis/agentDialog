import { useEffect, useRef, useCallback } from "react";
import type { Message } from "@/api/types";
import { MessageRenderer } from "./messages/MessageRenderer";
import { Spinner } from "@/components/ui/Spinner";

interface MessageListProps {
  messages: Message[];
  hasMore: boolean;
  onLoadMore: () => void;
}

export function MessageList({ messages, hasMore, onLoadMore }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevLengthRef = useRef(messages.length);

  // Auto scroll to bottom on new messages
  useEffect(() => {
    if (messages.length > prevLengthRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevLengthRef.current = messages.length;
  }, [messages.length]);

  // Initial scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView();
  }, []);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el || !hasMore) return;
    if (el.scrollTop < 100) {
      onLoadMore();
    }
  }, [hasMore, onLoadMore]);

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto px-4 py-4"
    >
      {hasMore && (
        <div className="flex justify-center py-4">
          <Spinner size="sm" />
        </div>
      )}
      <div className="space-y-4">
        {messages.map((msg) => (
          <MessageRenderer key={msg.id} message={msg} />
        ))}
      </div>
      <div ref={bottomRef} />
    </div>
  );
}
