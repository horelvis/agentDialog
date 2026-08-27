import { useTranslation } from "react-i18next";
import { useConversationStore } from "@/stores/conversationStore";
import { ConversationItem } from "./ConversationItem";
import { Spinner } from "@/components/ui/Spinner";

export function ConversationList() {
  const { t } = useTranslation("chat");
  const conversations = useConversationStore((s) => s.conversations);
  const loading = useConversationStore((s) => s.loadingConversations);
  const activeId = useConversationStore((s) => s.activeId);

  if (loading && conversations.length === 0) {
    return (
      <div className="flex justify-center py-8">
        <Spinner size="sm" />
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <p className="px-3 py-4 text-center text-sm text-gray-400">
        {t("list.empty")}
      </p>
    );
  }

  return (
    <div className="space-y-1">
      {conversations.map((conv) => (
        <ConversationItem
          key={conv.id}
          conversation={conv}
          isActive={conv.id === activeId}
        />
      ))}
    </div>
  );
}
