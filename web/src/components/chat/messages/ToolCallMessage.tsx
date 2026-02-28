import { useState } from "react";
import type { Message, ToolCallData } from "@/api/types";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/cn";

interface ToolCallMessageProps {
  message: Message;
}

export function ToolCallMessage({ message }: ToolCallMessageProps) {
  const [expanded, setExpanded] = useState(false);
  const data = (message.structuredData ?? {}) as Partial<ToolCallData>;

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 p-3">
        {data.status === "running" ? (
          <Spinner size="sm" />
        ) : (
          <div className={cn(
            "flex h-5 w-5 items-center justify-center rounded-full text-xs text-white",
            data.status === "completed" ? "bg-green-500" : "bg-red-500"
          )}>
            {data.status === "completed" ? "✓" : "✗"}
          </div>
        )}
        <span className="font-mono text-sm font-medium">{data.toolName ?? "unknown"}</span>
        <Badge>{data.status ?? "pending"}</Badge>
        {data.toolServer && (
          <span className="text-xs text-gray-500">{data.toolServer}</span>
        )}
      </div>
      {message.content && (
        <p className="px-3 pb-2 text-sm text-gray-400">{message.content}</p>
      )}
      {data.toolInput && (
        <div className="border-t border-surface-border">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex w-full items-center gap-1 px-3 py-2 text-xs text-gray-400 hover:bg-surface-elevated"
          >
            <svg
              className={cn("h-3 w-3 transition-transform", expanded && "rotate-90")}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Input
          </button>
          {expanded && (
            <pre className="overflow-x-auto bg-surface-tertiary p-3 text-xs text-gray-300">
              {JSON.stringify(data.toolInput, null, 2)}
            </pre>
          )}
        </div>
      )}
    </Card>
  );
}
