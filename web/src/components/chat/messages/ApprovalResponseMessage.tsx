import { useTranslation } from "react-i18next";
import type { Message, ApprovalResponseData } from "@/api/types";
import { Badge } from "@/components/ui/Badge";

interface ApprovalResponseMessageProps {
  message: Message;
}

export function ApprovalResponseMessage({ message }: ApprovalResponseMessageProps) {
  const { t } = useTranslation("chat");
  const data = message.structuredData as ApprovalResponseData;
  const isApproved = data.decision === "approved";

  return (
    <div className="flex items-center gap-2">
      <Badge
        className={isApproved ? "bg-green-900/30 text-green-400" : "bg-red-900/30 text-red-400"}
      >
        {isApproved ? t("messages.approval.approved") : t("messages.approval.denied")}
      </Badge>
      {data.reason && <span className="text-sm text-gray-400">{data.reason}</span>}
    </div>
  );
}
