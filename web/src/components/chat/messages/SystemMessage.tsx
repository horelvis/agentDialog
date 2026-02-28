import type { Message } from "@/api/types";

interface SystemMessageProps {
  message: Message;
}

export function SystemMessage({ message }: SystemMessageProps) {
  return (
    <div className="flex justify-center py-2">
      <p className="text-xs text-gray-500">{message.content}</p>
    </div>
  );
}
