import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Message } from "@/api/types";
import { cn } from "@/lib/cn";

interface TextMessageProps {
  message: Message;
}

export function TextMessage({ message }: TextMessageProps) {
  const isHuman = message.senderType === "human";

  return (
    <div
      className={cn(
        "prose prose-sm max-w-none",
        isHuman
          ? "prose-invert"
          : "prose-invert"
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {message.content ?? ""}
      </ReactMarkdown>
    </div>
  );
}
