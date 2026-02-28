import { useState } from "react";
import type { Message, ApprovalData } from "@/api/types";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { RISK_COLORS } from "@/lib/constants";
import { useConversationStore } from "@/stores/conversationStore";

interface ApprovalMessageProps {
  message: Message;
}

export function ApprovalMessage({ message }: ApprovalMessageProps) {
  const data = message.structuredData as ApprovalData;
  const sendMessage = useConversationStore((s) => s.sendMessage);
  const [responded, setResponded] = useState(false);
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
      setResponded(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card
      className="overflow-hidden"
      borderColor={`border-l-risk-${data.riskLevel}`}
    >
      <div className={`p-4 ${RISK_COLORS[data.riskLevel]}`}>
        <div className="flex items-center gap-2">
          <Badge variant="risk" risk={data.riskLevel}>
            {data.riskLevel.toUpperCase()}
          </Badge>
          <span className="text-sm font-medium">Approval Required</span>
        </div>
      </div>
      <div className="p-4">
        {message.content && <p className="text-sm text-gray-300">{message.content}</p>}
        {data.details && <p className="mt-2 text-sm text-gray-400">{data.details}</p>}
        <p className="mt-2 text-xs font-mono text-gray-500">Action: {data.action}</p>

        {!responded ? (
          <div className="mt-4 flex gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={() => handleDecision("approved")}
              loading={loading}
            >
              Approve
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => handleDecision("denied")}
              loading={loading}
            >
              Deny
            </Button>
          </div>
        ) : (
          <p className="mt-4 text-sm text-gray-400">Response submitted.</p>
        )}
      </div>
    </Card>
  );
}
