import type { Message, NotificationData } from "@/api/types";
import { Alert } from "@/components/ui/Alert";

interface NotificationMessageProps {
  message: Message;
}

export function NotificationMessage({ message }: NotificationMessageProps) {
  const data = message.structuredData as NotificationData | undefined;

  if (!data) {
    return <Alert severity="info" title="Notification">{message.content ?? ""}</Alert>;
  }

  return (
    <Alert severity={data.severity ?? "info"} title={data.title ?? "Notification"}>
      {data.details ?? message.content ?? ""}
    </Alert>
  );
}
