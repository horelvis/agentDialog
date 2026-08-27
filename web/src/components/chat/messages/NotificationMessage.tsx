import { useTranslation } from "react-i18next";
import type { Message, NotificationData } from "@/api/types";
import { Alert } from "@/components/ui/Alert";

interface NotificationMessageProps {
  message: Message;
}

export function NotificationMessage({ message }: NotificationMessageProps) {
  const { t } = useTranslation("chat");
  const data = message.structuredData as NotificationData | undefined;

  // `data.title` and `data.details`, when present, are the agent's own
  // wording and stay untranslated — only the fallback used when neither
  // exists is interface text.
  if (!data) {
    return <Alert severity="info" title={t("messages.notification.fallbackTitle")}>{message.content ?? ""}</Alert>;
  }

  return (
    <Alert severity={data.severity ?? "info"} title={data.title ?? t("messages.notification.fallbackTitle")}>
      {data.details ?? message.content ?? ""}
    </Alert>
  );
}
