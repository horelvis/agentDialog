import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Message, ApprovalData, ApprovalResponseData } from "@/api/types";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { RISK_COLORS } from "@/lib/constants";
import { useConversationStore } from "@/stores/conversationStore";

interface ApprovalMessageProps {
  message: Message;
}

export function ApprovalMessage({ message }: ApprovalMessageProps) {
  const { t } = useTranslation("chat");
  // Reuses QueryCard's own risk words instead of a second set — see the
  // note carried forward from Tasks 5/6: two catalogues for the same enum is
  // how a query card once showed "medio" and this badge showed "MEDIUM" on
  // the same screen.
  const { t: tQuery } = useTranslation("query");
  const data = message.structuredData as ApprovalData;
  const sendMessage = useConversationStore((s) => s.sendMessage);
  const messages = useConversationStore(
    (s) => s.messagesMap[message.conversationId] ?? [],
  );

  const existingResponse = messages.find(
    (m) =>
      m.type === "approval_response" &&
      (m.structuredData as ApprovalResponseData | undefined)?.approvalId === data.approvalId,
  );

  const [loading, setLoading] = useState(false);

  const handleDecision = async (decision: "approved" | "denied") => {
    setLoading(true);
    try {
      await sendMessage(message.conversationId, {
        type: "approval_response",
        structuredData: {
          approvalId: data.approvalId,
          decision,
        },
      });
    } finally {
      setLoading(false);
    }
  };

  const responded = !!existingResponse;
  const decision = responded
    ? (existingResponse.structuredData as ApprovalResponseData | undefined)?.decision
    : null;

  return (
    <Card
      className="overflow-hidden"
      borderColor={`border-l-risk-${data.riskLevel}`}
    >
      <div className={`p-4 ${RISK_COLORS[data.riskLevel]}`}>
        <div className="flex items-center gap-2">
          <Badge variant="risk" risk={data.riskLevel}>
            {tQuery(`card.risk.${data.riskLevel}`)}
          </Badge>
          <span className="text-sm font-medium">{t("messages.approval.title")}</span>
        </div>
      </div>
      <div className="p-4">
        {message.content && <p className="text-sm text-gray-300">{message.content}</p>}
        {data.details && <p className="mt-2 text-sm text-gray-400">{data.details}</p>}
        <p className="mt-2 text-xs font-mono text-gray-500">
          {t("messages.approval.action", { action: data.action })}
        </p>

        {!responded ? (
          <div className="mt-4 flex gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={() => handleDecision("approved")}
              loading={loading}
            >
              {t("messages.approval.approve")}
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => handleDecision("denied")}
              loading={loading}
            >
              {t("messages.approval.deny")}
            </Button>
          </div>
        ) : (
          <div className="mt-4">
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                decision === "approved"
                  ? "bg-green-500/20 text-green-400"
                  : "bg-red-500/20 text-red-400"
              }`}
            >
              {decision === "approved" ? t("messages.approval.approved") : t("messages.approval.denied")}
            </span>
          </div>
        )}
      </div>
    </Card>
  );
}
