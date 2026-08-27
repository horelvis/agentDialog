import { useState } from "react";
import { useNavigate } from "react-router";
import type { Invitation } from "@/api/types";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { formatRelativeTime } from "@/lib/formatters";
import { useLanguage } from "@/i18n";

interface InvitationCardProps {
  invitation: Invitation;
  onAccept: (token: string) => Promise<Invitation>;
  onDecline: (token: string) => Promise<void>;
}

export function InvitationCard({ invitation, onAccept, onDecline }: InvitationCardProps) {
  const [loading, setLoading] = useState<"accept" | "decline" | null>(null);
  const navigate = useNavigate();
  const language = useLanguage();

  const handleAccept = async () => {
    setLoading("accept");
    try {
      const accepted = await onAccept(invitation.token);
      navigate(`/app/c/${accepted.conversationId}`);
    } finally {
      setLoading(null);
    }
  };

  const handleDecline = async () => {
    setLoading("decline");
    try {
      await onDecline(invitation.token);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="flex items-center gap-4 rounded-xl border border-surface-border bg-surface-secondary p-4 transition-colors hover:bg-surface-tertiary">
      <Avatar name={invitation.agentDisplayName ?? "Agent"} size="md" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate font-medium text-gray-100">
            {invitation.conversationTitle ?? "Conversation Invitation"}
          </h3>
          <Badge>{invitation.status}</Badge>
        </div>
        {invitation.agentDisplayName && (
          <p className="text-sm text-gray-400">
            from <span className="text-gray-300">{invitation.agentDisplayName}</span>
          </p>
        )}
        {invitation.message && (
          <p className="mt-1 truncate text-sm text-gray-500">{invitation.message}</p>
        )}
        <p className="mt-1 text-xs text-gray-600">
          {formatRelativeTime(invitation.createdAt, language)}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button
          size="sm"
          onClick={handleAccept}
          loading={loading === "accept"}
          disabled={loading !== null}
        >
          Accept
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={handleDecline}
          loading={loading === "decline"}
          disabled={loading !== null}
        >
          Decline
        </Button>
      </div>
    </div>
  );
}
