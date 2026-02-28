import { useState, useEffect } from "react";
import { cn } from "@/lib/cn";

interface DemoMessage {
  id: number;
  sender: "agent" | "human" | "system";
  type: "text" | "tool_call" | "tool_result" | "approval" | "approval_response" | "notification" | "form" | "form_response";
  content?: string;
  meta?: Record<string, unknown>;
  delay: number;
}

const conversation: DemoMessage[] = [
  {
    id: 1,
    sender: "system",
    type: "text",
    content: "Deploy Bot created this conversation",
    delay: 0,
  },
  {
    id: 2,
    sender: "agent",
    type: "notification",
    content: "Pre-deploy analysis started",
    meta: { severity: "info", title: "Pipeline Initiated" },
    delay: 600,
  },
  {
    id: 3,
    sender: "agent",
    type: "tool_call",
    content: "Running integration tests...",
    meta: { toolName: "run_tests", status: "running" },
    delay: 1200,
  },
  {
    id: 4,
    sender: "agent",
    type: "tool_result",
    content: "847 passed, 0 failed",
    meta: { toolName: "run_tests", duration: "3m 12s", status: "completed" },
    delay: 2000,
  },
  {
    id: 5,
    sender: "agent",
    type: "tool_call",
    content: "Scanning for vulnerabilities...",
    meta: { toolName: "security_scan", status: "running" },
    delay: 2600,
  },
  {
    id: 6,
    sender: "agent",
    type: "tool_result",
    content: "0 critical, 0 high, 2 low",
    meta: { toolName: "security_scan", duration: "1m 45s", status: "completed" },
    delay: 3200,
  },
  {
    id: 7,
    sender: "agent",
    type: "approval",
    content: "All checks passed. Deploy v2.0 to production?",
    meta: { riskLevel: "high", action: "deploy-to-production", details: "3 instances in us-east-1. Blue-green, zero downtime." },
    delay: 3800,
  },
  {
    id: 8,
    sender: "human",
    type: "approval_response",
    content: "Approved",
    meta: { decision: "approved" },
    delay: 5000,
  },
  {
    id: 9,
    sender: "agent",
    type: "notification",
    content: "Deploy v2.0 completed successfully",
    meta: { severity: "success", title: "Deploy Complete", details: "3 instances live. Total time: 4m 32s" },
    delay: 6000,
  },
];

const riskColors: Record<string, string> = {
  low: "border-green-500/50 bg-green-500/10",
  medium: "border-yellow-500/50 bg-yellow-500/10",
  high: "border-orange-500/50 bg-orange-500/10",
  critical: "border-red-500/50 bg-red-500/10",
};

const riskBadge: Record<string, string> = {
  low: "bg-green-500/20 text-green-400",
  medium: "bg-yellow-500/20 text-yellow-400",
  high: "bg-orange-500/20 text-orange-400",
  critical: "bg-red-500/20 text-red-400",
};

const severityStyles: Record<string, { border: string; bg: string; icon: string }> = {
  info: { border: "border-indigo-500/30", bg: "bg-indigo-500/10", icon: "text-indigo-400" },
  warning: { border: "border-yellow-500/30", bg: "bg-yellow-500/10", icon: "text-yellow-400" },
  error: { border: "border-red-500/30", bg: "bg-red-500/10", icon: "text-red-400" },
  success: { border: "border-green-500/30", bg: "bg-green-500/10", icon: "text-green-400" },
};

function ToolCallBubble({ msg, animate }: { msg: DemoMessage; animate: boolean }) {
  const status = msg.meta?.status as string;
  const isRunning = status === "running";
  return (
    <div className={cn("rounded-lg border border-surface-border bg-surface-tertiary overflow-hidden transition-all duration-500", animate && "animate-fade-in")}>
      <div className="flex items-center gap-2 px-3 py-2">
        {isRunning ? (
          <span className="relative flex h-4 w-4">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-40" />
            <span className="relative inline-flex h-4 w-4 rounded-full bg-brand-500" />
          </span>
        ) : (
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-green-500 text-[10px] text-white">&#10003;</span>
        )}
        <code className="text-xs font-medium text-brand-400">{String(msg.meta?.toolName)}</code>
        <span className={cn("ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium", isRunning ? "bg-brand-500/20 text-brand-300" : "bg-green-500/20 text-green-400")}>
          {isRunning ? "running" : "done"}
        </span>
      </div>
      {msg.content && <p className="border-t border-surface-border px-3 py-2 text-xs text-gray-400">{msg.content}</p>}
    </div>
  );
}

function ToolResultBubble({ msg, animate }: { msg: DemoMessage; animate: boolean }) {
  return (
    <div className={cn("rounded-lg border border-green-500/20 bg-green-500/5 overflow-hidden transition-all duration-500", animate && "animate-fade-in")}>
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="rounded-full bg-green-500/20 px-2 py-0.5 text-[10px] font-medium text-green-400">result</span>
        <code className="text-xs text-gray-500">{String(msg.meta?.toolName)}</code>
        <span className="ml-auto text-[10px] text-gray-500">{String(msg.meta?.duration)}</span>
      </div>
      <p className="border-t border-green-500/10 px-3 py-2 text-xs text-green-300">{msg.content}</p>
    </div>
  );
}

function ApprovalBubble({ msg, animate }: { msg: DemoMessage; animate: boolean }) {
  const risk = (msg.meta?.riskLevel as string) ?? "medium";
  return (
    <div className={cn("rounded-lg border overflow-hidden transition-all duration-500", riskColors[risk], animate && "animate-fade-in")}>
      <div className="flex items-center gap-2 px-3 py-2">
        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase", riskBadge[risk])}>
          {risk}
        </span>
        <span className="text-xs font-medium text-gray-300">Approval Required</span>
      </div>
      <div className="border-t border-white/5 px-3 py-3">
        <p className="text-sm text-gray-200">{msg.content}</p>
        {msg.meta?.details ? <p className="mt-1 text-xs text-gray-500">{String(msg.meta.details)}</p> : null}
        <div className="mt-3 flex gap-2">
          <button className="rounded-lg bg-brand-600 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand-500">
            Approve
          </button>
          <button className="rounded-lg border border-surface-border bg-surface-elevated px-4 py-1.5 text-xs font-medium text-gray-300 transition-colors hover:bg-surface-hover">
            Deny
          </button>
        </div>
      </div>
    </div>
  );
}

function ApprovalResponseBubble({ msg, animate }: { msg: DemoMessage; animate: boolean }) {
  const approved = msg.meta?.decision === "approved";
  return (
    <div className={cn("flex items-center gap-2 transition-all duration-500", animate && "animate-fade-in")}>
      <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", approved ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400")}>
        {approved ? "Approved" : "Denied"}
      </span>
    </div>
  );
}

function NotificationBubble({ msg, animate }: { msg: DemoMessage; animate: boolean }) {
  const severity = (msg.meta?.severity as string) ?? "info";
  const style = severityStyles[severity] ?? severityStyles.info;
  return (
    <div className={cn("rounded-lg border p-3 transition-all duration-500", style.border, style.bg, animate && "animate-fade-in")}>
      <div className="flex items-center gap-2">
        <span className={cn("text-xs font-semibold", style.icon)}>{String(msg.meta?.title)}</span>
      </div>
      {(msg.meta?.details ?? msg.content) && (
        <p className="mt-1 text-xs text-gray-400">{String(msg.meta?.details ?? msg.content)}</p>
      )}
    </div>
  );
}

function SystemBubble({ msg, animate }: { msg: DemoMessage; animate: boolean }) {
  return (
    <div className={cn("flex justify-center transition-all duration-500", animate && "animate-fade-in")}>
      <span className="text-[11px] text-gray-600">{msg.content}</span>
    </div>
  );
}

function AgentAvatar() {
  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[10px] font-bold text-white">
      DB
    </div>
  );
}

function HumanAvatar() {
  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-bold text-white">
      TL
    </div>
  );
}

function MessageRow({ msg, animate }: { msg: DemoMessage; animate: boolean }) {
  if (msg.type === "notification") {
    return <NotificationBubble msg={msg} animate={animate} />;
  }
  if (msg.sender === "system") {
    return <SystemBubble msg={msg} animate={animate} />;
  }

  const isHuman = msg.sender === "human";

  // Tool calls / results are agent-side special cards
  if (msg.type === "tool_call") {
    return (
      <div className="flex gap-2.5">
        <AgentAvatar />
        <div className="max-w-[85%]">
          <ToolCallBubble msg={msg} animate={animate} />
        </div>
      </div>
    );
  }
  if (msg.type === "tool_result") {
    return (
      <div className="flex gap-2.5">
        <div className="w-7" />
        <div className="max-w-[85%]">
          <ToolResultBubble msg={msg} animate={animate} />
        </div>
      </div>
    );
  }
  if (msg.type === "approval") {
    return (
      <div className="flex gap-2.5">
        <AgentAvatar />
        <div className="max-w-[85%] flex-1">
          <ApprovalBubble msg={msg} animate={animate} />
        </div>
      </div>
    );
  }
  if (msg.type === "approval_response") {
    return (
      <div className={cn("flex gap-2.5", isHuman && "flex-row-reverse")}>
        <HumanAvatar />
        <ApprovalResponseBubble msg={msg} animate={animate} />
      </div>
    );
  }

  // Simple text
  return (
    <div className={cn("flex gap-2.5", isHuman && "flex-row-reverse")}>
      {isHuman ? <HumanAvatar /> : <AgentAvatar />}
      <div
        className={cn(
          "max-w-[75%] rounded-2xl px-3.5 py-2 text-sm transition-all duration-500",
          isHuman
            ? "rounded-tr-md bg-brand-600 text-white"
            : "rounded-tl-md bg-surface-tertiary text-gray-200 border border-surface-border",
          animate && "animate-fade-in"
        )}
      >
        {msg.content}
      </div>
    </div>
  );
}

export function ChatDemo() {
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    conversation.forEach((msg, i) => {
      timers.push(setTimeout(() => setVisibleCount(i + 1), msg.delay));
    });
    return () => timers.forEach(clearTimeout);
  }, []);

  const visible = conversation.slice(0, visibleCount);
  const isTyping = visibleCount > 0 && visibleCount < conversation.length;

  return (
    <section className="py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-gray-100 sm:text-4xl">
            See it in action
          </h2>
          <p className="mt-4 text-lg text-gray-400">
            A real agent-to-human conversation. Tool calls, approvals, and notifications — all in real time.
          </p>
        </div>

        <div className="mx-auto mt-12 max-w-xl">
          {/* Chat window */}
          <div className="overflow-hidden rounded-xl border border-surface-border bg-surface-secondary shadow-2xl shadow-brand-950/20">
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-surface-border bg-surface-tertiary px-4 py-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-xs font-bold text-white">
                DB
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-100">Deploy v2.0 → Production</p>
                <p className="text-xs text-gray-500">Deploy Bot &middot; Tech Lead</p>
              </div>
              <div className="ml-auto flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-green-500" />
                <span className="text-[10px] text-gray-500">live</span>
              </div>
            </div>

            {/* Messages */}
            <div className="flex flex-col gap-3 p-4">
              {visible.map((msg, i) => (
                <MessageRow key={msg.id} msg={msg} animate={i === visibleCount - 1} />
              ))}

              {isTyping && (
                <div className="flex items-center gap-2 pl-9">
                  <div className="flex gap-1">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-500" style={{ animationDelay: "0ms" }} />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-500" style={{ animationDelay: "150ms" }} />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-500" style={{ animationDelay: "300ms" }} />
                  </div>
                  <span className="text-[10px] text-gray-600">typing...</span>
                </div>
              )}
            </div>

            {/* Input bar */}
            <div className="border-t border-surface-border bg-surface-tertiary px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex-1 rounded-lg border border-surface-border bg-surface-elevated px-3 py-2 text-xs text-gray-500">
                  Type a message...
                </div>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
