import type { Message } from "@/api/types";
import { MessageBubble } from "./MessageBubble";
import { TextMessage } from "./TextMessage";
import { ToolCallMessage } from "./ToolCallMessage";
import { ToolResultMessage } from "./ToolResultMessage";
import { FormMessage } from "./FormMessage";
import { FormResponseMessage } from "./FormResponseMessage";
import { ApprovalMessage } from "./ApprovalMessage";
import { ApprovalResponseMessage } from "./ApprovalResponseMessage";
import { NotificationMessage } from "./NotificationMessage";
import { FileMessage } from "./FileMessage";
import { SystemMessage } from "./SystemMessage";

interface MessageRendererProps {
  message: Message;
}

export function MessageRenderer({ message }: MessageRendererProps) {
  // System messages and notifications don't use a bubble
  if (message.type === "system") {
    return <SystemMessage message={message} />;
  }

  if (message.type === "notification") {
    return <NotificationMessage message={message} />;
  }

  // Tool call and tool result use Card layout, no bubble
  if (message.type === "tool_call") {
    return (
      <div className="ml-11">
        <ToolCallMessage message={message} />
      </div>
    );
  }

  if (message.type === "tool_result") {
    return (
      <div className="ml-11">
        <ToolResultMessage message={message} />
      </div>
    );
  }

  // Form and approval use Card layout, no bubble
  if (message.type === "form") {
    return (
      <div className="ml-11">
        <FormMessage message={message} />
      </div>
    );
  }

  if (message.type === "approval") {
    return (
      <div className="ml-11">
        <ApprovalMessage message={message} />
      </div>
    );
  }

  // These are response types from human — use bubble
  const content = (() => {
    switch (message.type) {
      case "text":
        return <TextMessage message={message} />;
      case "form_response":
        return <FormResponseMessage message={message} />;
      case "approval_response":
        return <ApprovalResponseMessage message={message} />;
      case "file":
        return <FileMessage message={message} />;
      default:
        return <p className="text-sm">{message.content}</p>;
    }
  })();

  return <MessageBubble message={message}>{content}</MessageBubble>;
}
