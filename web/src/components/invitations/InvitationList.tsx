import { useTranslation } from "react-i18next";
import { useInvitationStore } from "@/stores/invitationStore";
import { InvitationCard } from "./InvitationCard";
import { Spinner } from "@/components/ui/Spinner";

export function InvitationList() {
  const { t } = useTranslation("chat");
  const { invitations, loading, accept, decline } = useInvitationStore();

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  if (invitations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-tertiary">
          <svg className="h-8 w-8 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <p className="mt-4 text-gray-400">{t("invitations.emptyTitle")}</p>
        <p className="mt-1 text-sm text-gray-600">{t("invitations.emptyBody")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {invitations.map((inv) => (
        <InvitationCard
          key={inv.id}
          invitation={inv}
          onAccept={accept}
          onDecline={decline}
        />
      ))}
    </div>
  );
}
