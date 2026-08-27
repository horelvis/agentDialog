import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTrustedAgentStore } from "@/stores/trustedAgentStore";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";

export function TrustedAgentsPage() {
  const { t } = useTranslation("chat");
  const { agents, loading, fetchTrustedAgents, revoke } = useTrustedAgentStore();
  const [revokingId, setRevokingId] = useState<string | null>(null);

  useEffect(() => {
    fetchTrustedAgents();
  }, [fetchTrustedAgents]);

  const handleRevoke = async (agentId: string) => {
    setRevokingId(agentId);
    try {
      await revoke(agentId);
    } catch (e) {
      console.error("[revokeTrust]", e);
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="border-b border-surface-border bg-surface-secondary px-6 py-4">
        <h1 className="text-lg font-semibold text-gray-100">{t("agents.title")}</h1>
        <p className="text-sm text-gray-400">{t("agents.body")}</p>
      </header>
      <div className="flex-1 p-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner size="lg" />
          </div>
        ) : agents.length === 0 ? (
          <div className="py-12 text-center text-gray-400">
            <svg className="mx-auto mb-3 h-12 w-12 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <p>{t("agents.emptyTitle")}</p>
            <p className="mt-1 text-sm">{t("agents.emptyBody")}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {agents.map((agent) => (
              <div
                key={agent.agentId}
                className="flex items-center gap-4 rounded-lg border border-surface-border bg-surface-secondary p-4"
              >
                <Avatar
                  src={agent.avatarUrl}
                  name={agent.displayName}
                  size="lg"
                />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-100">{agent.displayName}</p>
                  {agent.description && (
                    <p className="mt-0.5 truncate text-sm text-gray-400">{agent.description}</p>
                  )}
                  <p className="mt-0.5 text-xs text-gray-500">@{agent.slug}</p>
                </div>
                <Button
                  variant="danger"
                  size="sm"
                  loading={revokingId === agent.agentId}
                  onClick={() => handleRevoke(agent.agentId)}
                >
                  {t("agents.revoke")}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
