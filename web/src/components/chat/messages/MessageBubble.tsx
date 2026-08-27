import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Avatar } from "@/components/ui/Avatar";
import { formatTime } from "@/lib/formatters";
import { cn } from "@/lib/cn";
import type { Message } from "@/api/types";
import { useLanguage } from "@/i18n";

interface MessageBubbleProps {
  message: Message;
  children: ReactNode;
}

export function MessageBubble({ message, children }: MessageBubbleProps) {
  const { t } = useTranslation("chat");
  const isHuman = message.senderType === "human";
  const language = useLanguage();

  return (
    <div className={cn("flex gap-3", isHuman && "flex-row-reverse")}>
      <Avatar
        name={isHuman ? t("shared.you") : t("shared.agent")}
        size="sm"
        className="mt-1 shrink-0"
      />
      <div className={cn("max-w-[75%] space-y-1", isHuman && "items-end")}>
        <div
          className={cn(
            "rounded-2xl px-4 py-2.5",
            isHuman
              ? "rounded-tr-md bg-brand-600 text-white"
              : "rounded-tl-md bg-surface-tertiary border border-surface-border text-gray-100"
          )}
        >
          {children}
        </div>
        <p
          className={cn(
            "text-xs text-gray-500",
            isHuman && "text-right"
          )}
        >
          {formatTime(message.createdAt, language)}
        </p>
      </div>
    </div>
  );
}
