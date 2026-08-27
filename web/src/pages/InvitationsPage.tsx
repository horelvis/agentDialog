import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useInvitationStore } from "@/stores/invitationStore";
import { InvitationList } from "@/components/invitations/InvitationList";

export function InvitationsPage() {
  const { t } = useTranslation("chat");
  const fetchInvitations = useInvitationStore((s) => s.fetchInvitations);

  useEffect(() => {
    fetchInvitations();
  }, [fetchInvitations]);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="border-b border-surface-border bg-surface-secondary px-6 py-4">
        <h1 className="text-lg font-semibold text-gray-100">{t("invitations.title")}</h1>
        <p className="text-sm text-gray-400">{t("invitations.body")}</p>
      </header>
      <div className="flex-1 p-6">
        <InvitationList />
      </div>
    </div>
  );
}
