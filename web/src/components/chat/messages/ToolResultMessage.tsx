import { useState } from "react";
import type { Message, ToolResultData } from "@/api/types";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { formatDuration } from "@/lib/formatters";
import { useLanguage } from "@/i18n";

interface ToolResultMessageProps {
  message: Message;
}

export function ToolResultMessage({ message }: ToolResultMessageProps) {
  const [expanded, setExpanded] = useState(false);
  const language = useLanguage();
  const data = message.structuredData as ToolResultData;

  return (
    <Card className="overflow-hidden" borderColor="border-l-green-500">
      <div className="flex items-center gap-3 p-3">
        <Badge className="bg-green-900/30 text-green-400">Result</Badge>
        {data.durationMs && (
          <span className="text-xs text-gray-400">{formatDuration(data.durationMs, language)}</span>
        )}
      </div>
      {message.content && (
        <p className="px-3 pb-2 text-sm text-gray-300">{message.content}</p>
      )}
      {data.output != null && (
        <div className="border-t border-surface-border">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex w-full items-center gap-1 px-3 py-2 text-xs text-gray-400 hover:bg-surface-elevated"
          >
            <svg
              className={`h-3 w-3 transition-transform ${expanded ? "rotate-90" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Output
          </button>
          {expanded && (
            <pre className="overflow-x-auto bg-surface-tertiary p-3 text-xs text-gray-300">
              {String(JSON.stringify(data.output, null, 2))}
            </pre>
          )}
        </div>
      )}
    </Card>
  );
}
