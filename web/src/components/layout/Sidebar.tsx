import { Link, useParams } from "react-router";
import { useConversationStore } from "@/stores/conversationStore";
import { useInvitationStore } from "@/stores/invitationStore";
import { useUiStore } from "@/stores/uiStore";
import { useAuthStore } from "@/stores/authStore";
import { Avatar } from "@/components/ui/Avatar";
import { formatRelativeTime } from "@/lib/formatters";
import { cn } from "@/lib/cn";
import { Logo } from "@/components/ui/Logo";

export function Sidebar() {
  const { id: activeId } = useParams();
  const conversations = useConversationStore((s) => s.conversations);
  const invitations = useInvitationStore((s) => s.invitations);
  const { sidebarOpen, isMobile, setSidebarOpen } = useUiStore();
  const human = useAuthStore((s) => s.human);
  const logout = useAuthStore((s) => s.logout);

  if (!sidebarOpen && isMobile) return null;

  return (
    <>
      {isMobile && sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/70" onClick={() => setSidebarOpen(false)} />
      )}
      <aside
        className={cn(
          "flex h-full w-72 flex-col border-r border-surface-border bg-surface-secondary",
          isMobile && "fixed inset-y-0 left-0 z-40"
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-surface-border px-4">
          <Link to="/app" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 p-1 text-white">
              <Logo className="h-full w-full" />
            </div>
            <span className="font-bold text-gray-100">AgentDialog</span>
          </Link>
          {isMobile && (
            <button onClick={() => setSidebarOpen(false)} className="text-gray-400 hover:text-gray-200">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-2">
          <Link
            to="/app/invitations"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-300 hover:bg-surface-hover"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            Invitations
            {invitations.length > 0 && (
              <span className="ml-auto rounded-full bg-brand-600 px-2 py-0.5 text-xs text-white">
                {invitations.length}
              </span>
            )}
          </Link>

          <Link
            to="/app/trusted-agents"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-300 hover:bg-surface-hover"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            Trusted Agents
          </Link>

          <div className="px-3 pt-4 pb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
            Conversations
          </div>

          {conversations.map((conv) => (
            <Link
              key={conv.id}
              to={`/app/c/${conv.id}`}
              onClick={() => isMobile && setSidebarOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                activeId === conv.id
                  ? "bg-brand-950 text-brand-300"
                  : "text-gray-300 hover:bg-surface-hover"
              )}
            >
              <Avatar name={conv.title ?? "Conversation"} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{conv.title ?? "Untitled"}</p>
                <p className="truncate text-xs text-gray-400">
                  {formatRelativeTime(conv.updatedAt)}
                </p>
              </div>
            </Link>
          ))}

          {conversations.length === 0 && (
            <p className="px-3 py-4 text-center text-sm text-gray-400">
              No conversations yet
            </p>
          )}
        </nav>

        <div className="border-t border-surface-border p-3">
          <div className="flex items-center gap-3">
            <Avatar name={human?.displayName ?? human?.email ?? "User"} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{human?.displayName ?? human?.email}</p>
            </div>
            <div className="flex gap-1">
              <Link
                to="/app/settings"
                className="rounded p-1.5 text-gray-500 hover:bg-surface-hover hover:text-gray-300"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </Link>
              <button
                onClick={() => logout()}
                className="rounded p-1.5 text-gray-500 hover:bg-surface-hover hover:text-gray-300"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
