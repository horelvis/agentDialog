import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";

/**
 * The A2A loop, drawn the way it actually happens: one lead, two peers on
 * their own machines, work flowing through mailboxes instead of pausing on a
 * person. The lead assigns, a peer asks a question and the lead answers in the
 * same context, artifacts climb back up, and the project closes on its own.
 *
 * Labels are deliberately generic — this is the shape of distributed
 * collaboration, not a particular integration.
 */

type NodeId =
  | "start"
  | "assign"
  | "answer"
  | "collect"
  | "end"
  | "b_mailbox"
  | "b_work"
  | "b_ask"
  | "b_deliver"
  | "f_mailbox"
  | "f_work"
  | "f_deliver";
type NodeState = "pending" | "running" | "waiting" | "done" | "untaken";
type PeerRow = "pending" | "assigned" | "working" | "waiting" | "done";

interface Frame {
  /** How long this frame stays on screen. */
  ms: number;
  states: Partial<Record<NodeId, NodeState>>;
  /** The project card's view of each peer's subtask. */
  backend: PeerRow;
  frontend: PeerRow;
  /** Which conversation lines are on screen. */
  questionShown: boolean;
  answerShown: boolean;
}

const NODE_LABELS: Record<NodeId, string> = {
  start: "__start__",
  assign: "assign_tasks",
  answer: "answer_peer",
  collect: "collect_artifacts",
  end: "__end__",
  b_mailbox: "mailbox",
  b_work: "implement",
  b_ask: "input_required",
  b_deliver: "deliver",
  f_mailbox: "mailbox",
  f_work: "implement",
  f_deliver: "deliver",
};

const NODE_DETAIL_KEY = {
  start: "a2aflow.node.start",
  assign: "a2aflow.node.assign",
  answer: "a2aflow.node.answer",
  collect: "a2aflow.node.collect",
  end: "a2aflow.node.end",
  b_mailbox: "a2aflow.node.bMailbox",
  b_work: "a2aflow.node.bWork",
  b_ask: "a2aflow.node.bAsk",
  b_deliver: "a2aflow.node.bDeliver",
  f_mailbox: "a2aflow.node.fMailbox",
  f_work: "a2aflow.node.fWork",
  f_deliver: "a2aflow.node.fDeliver",
} as const satisfies Partial<Record<NodeId, string>>;

function useNodeDetail(): (id: NodeId) => string | undefined {
  const { t } = useTranslation("landing");
  return (id) =>
    id in NODE_DETAIL_KEY
      ? t(NODE_DETAIL_KEY[id as keyof typeof NODE_DETAIL_KEY])
      : undefined;
}

/**
 * The script, written out frame by frame. The wait is long on purpose — a peer
 * sitting on a question is the A2A equivalent of the A2H pause. It plays once;
 * the last frame is where the section stays.
 */
const FRAMES: Frame[] = [
  { ms: 700, states: { start: "running" }, backend: "pending", frontend: "pending", questionShown: false, answerShown: false },
  { ms: 900, states: { start: "done", assign: "running" }, backend: "pending", frontend: "pending", questionShown: false, answerShown: false },
  { ms: 1100, states: { start: "done", assign: "done", b_mailbox: "running" }, backend: "pending", frontend: "pending", questionShown: false, answerShown: false },
  { ms: 900, states: { start: "done", assign: "done", b_mailbox: "done", b_work: "running" }, backend: "assigned", frontend: "pending", questionShown: false, answerShown: false },
  { ms: 1100, states: { start: "done", assign: "done", b_mailbox: "done", b_work: "running", f_mailbox: "running" }, backend: "assigned", frontend: "pending", questionShown: false, answerShown: false },
  { ms: 1000, states: { start: "done", assign: "done", b_mailbox: "done", b_work: "running", f_mailbox: "done", f_work: "running" }, backend: "assigned", frontend: "assigned", questionShown: false, answerShown: false },
  { ms: 1400, states: { start: "done", assign: "done", b_work: "done", b_ask: "waiting", f_work: "running" }, backend: "waiting", frontend: "working", questionShown: true, answerShown: false },
  { ms: 1400, states: { start: "done", assign: "done", b_ask: "waiting", answer: "running", f_work: "running" }, backend: "waiting", frontend: "working", questionShown: true, answerShown: false },
  { ms: 1000, states: { start: "done", assign: "done", b_ask: "done", answer: "done", b_deliver: "running", f_work: "running" }, backend: "working", frontend: "working", questionShown: true, answerShown: true },
  { ms: 1200, states: { start: "done", assign: "done", b_deliver: "done", f_work: "done", f_deliver: "running" }, backend: "done", frontend: "working", questionShown: true, answerShown: true },
  { ms: 1000, states: { start: "done", assign: "done", f_deliver: "done", collect: "running" }, backend: "done", frontend: "done", questionShown: true, answerShown: true },
  { ms: 900, states: { start: "done", assign: "done", collect: "done", end: "running" }, backend: "done", frontend: "done", questionShown: true, answerShown: true },
  { ms: 3600, states: { start: "done", assign: "done", collect: "done", end: "done" }, backend: "done", frontend: "done", questionShown: true, answerShown: true },
];

function stateOf(frame: Frame, id: NodeId): NodeState {
  return frame.states[id] ?? "pending";
}

function NodeDot({ state }: { state: NodeState }) {
  if (state === "waiting") {
    return (
      <span className="relative flex h-3.5 w-3.5 shrink-0 items-center justify-center">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-risk-medium opacity-60" />
        <span className="relative inline-flex h-3.5 w-3.5 rounded-full border-2 border-risk-medium bg-surface-primary" />
      </span>
    );
  }
  if (state === "running") {
    return (
      <span className="relative flex h-3.5 w-3.5 shrink-0 items-center justify-center">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-50" />
        <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-brand-500" />
      </span>
    );
  }
  if (state === "done") {
    return (
      // eslint-disable-next-line i18next/no-literal-string
      <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[8px] leading-none text-white">
        &#10003;
      </span>
    );
  }
  if (state === "untaken") {
    return (
      <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-dashed border-surface-border" />
    );
  }
  return <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-surface-border bg-surface-tertiary" />;
}

function NodeLabel({ id, state, detail }: { id: NodeId; state: NodeState; detail?: string }) {
  const lit = state === "done" || state === "running" || state === "waiting";
  return (
    <div className="min-w-0">
      <code
        className={cn(
          "font-mono text-xs transition-colors duration-500",
          state === "waiting" ? "text-risk-medium" : lit ? "text-gray-100" : "text-gray-600",
        )}
      >
        {NODE_LABELS[id]}
      </code>
      {detail ? (
        <p
          className={cn(
            "mt-0.5 text-[11px] text-gray-500 transition-opacity duration-500",
            state === "done" ? "opacity-100" : "opacity-0",
          )}
          aria-hidden={state !== "done"}
        >
          {detail}
        </p>
      ) : null}
    </div>
  );
}

const PEER_ROWS = [
  { id: "backend", label: "a2aflow.project.backend", task: "a2aflow.project.backendTask" },
  { id: "frontend", label: "a2aflow.project.frontend", task: "a2aflow.project.frontendTask" },
] as const;

const ROW_DOT: Record<PeerRow, React.ReactNode> = {
  pending: <span className="h-3.5 w-3.5 rounded-full border border-surface-border bg-surface-tertiary" />,
  assigned: (
    <span className="relative flex h-3.5 w-3.5 items-center justify-center">
      <span className="h-3.5 w-3.5 rounded-full border border-brand-500 bg-surface-primary" />
    </span>
  ),
  working: (
    <span className="relative flex h-3.5 w-3.5 items-center justify-center">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-50" />
      <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-brand-500" />
    </span>
  ),
  waiting: (
    <span className="relative flex h-3.5 w-3.5 items-center justify-center">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-risk-medium opacity-60" />
      <span className="relative inline-flex h-3.5 w-3.5 rounded-full border-2 border-risk-medium bg-surface-primary" />
    </span>
  ),
  done: (
    <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-brand-600 text-[8px] leading-none text-white">
      &#10003;
    </span>
  ),
};

/**
 * The project card under the diagram — what the lead sees: two subtasks, the
 * exchange with the peer who asked, and the artifacts that came back.
 */
function ProjectPanel({
  backend,
  frontend,
  questionShown,
  answerShown,
}: {
  backend: PeerRow;
  frontend: PeerRow;
  questionShown: boolean;
  answerShown: boolean;
}) {
  const { t } = useTranslation("landing");
  const projectDone = backend === "done" && frontend === "done";
  const statusKey =
    projectDone
      ? "a2aflow.project.status.completed"
      : backend === "waiting"
        ? "a2aflow.project.status.waiting"
        : backend === "working" || frontend === "working"
          ? "a2aflow.project.status.inProgress"
          : "a2aflow.project.status.active";

  return (
    <div
      className={cn(
        "mt-2 animate-fade-in rounded-lg border transition-colors duration-500",
        projectDone ? "border-surface-border bg-surface-tertiary" : "border-surface-border bg-surface-elevated",
      )}
    >
      <div className="flex items-center gap-2 border-b border-white/5 px-3 py-2">
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-colors duration-500",
            backend === "waiting" ? "bg-risk-medium/20 text-risk-medium" : projectDone ? "bg-brand-600/20 text-brand-200" : "bg-brand-500/15 text-brand-300",
          )}
        >
          {t(statusKey)}
        </span>
        {/* eslint-disable-next-line i18next/no-literal-string */}
        <span className="font-mono text-[11px] text-gray-500">project · A-1042</span>
      </div>

      <div className="space-y-1 px-3 py-3">
        {PEER_ROWS.map((row) => {
          const state = row.id === "backend" ? backend : frontend;
          const done = state === "done";
          return (
            <div key={row.id} className="flex items-center gap-2.5">
              <span className="shrink-0">{ROW_DOT[state]}</span>
              <span className="w-20 shrink-0 text-xs text-gray-300">{t(row.label)}</span>
              <span className="truncate text-xs text-gray-500">{t(row.task)}</span>
              <span
                className={cn(
                  "ml-auto shrink-0 font-mono text-[11px] transition-opacity duration-500",
                  done ? "text-brand-300 opacity-100" : "opacity-0",
                )}
                aria-hidden={!done}
              >
                {row.id === "backend" ? t("a2aflow.project.artifactTs") : t("a2aflow.project.artifactTsx")}
              </span>
            </div>
          );
        })}

        {/* The exchange that made the peer pause: their question and the lead's
            answer, each appearing the moment it happens. */}
        <div className={cn("mt-2 space-y-1 border-t border-white/5 pt-2", (!questionShown && !answerShown) && "hidden")}>
          {questionShown ? (
            <p className="flex items-start gap-2 text-xs text-gray-400">
              <span className="shrink-0 rounded bg-risk-medium/15 px-1.5 py-0.5 text-[10px] font-medium text-risk-medium">
                {t("a2aflow.project.questionTag")}
              </span>
              {t("a2aflow.project.question")}
            </p>
          ) : null}
          {answerShown ? (
            <p className="flex items-start gap-2 text-xs text-gray-400">
              <span className="shrink-0 rounded bg-brand-500/15 px-1.5 py-0.5 text-[10px] font-medium text-brand-300">
                {t("a2aflow.project.answerTag")}
              </span>
              {t("a2aflow.project.answer")}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const POSITIONS: Record<NodeId, { x: number; y: number }> = {
  start: { x: 6, y: 16 },
  assign: { x: 28, y: 16 },
  answer: { x: 50, y: 16 },
  collect: { x: 72, y: 16 },
  end: { x: 94, y: 16 },
  b_mailbox: { x: 16, y: 78 },
  b_work: { x: 28, y: 78 },
  b_ask: { x: 42, y: 78 },
  b_deliver: { x: 56, y: 78 },
  f_mailbox: { x: 66, y: 92 },
  f_work: { x: 78, y: 92 },
  f_deliver: { x: 92, y: 92 },
};

const DOT_RADIUS_PX = 7;

type EdgeState = "pending" | "live" | "done";

const EDGE_STROKE: Record<EdgeState, string> = {
  pending: "var(--color-surface-border)",
  live: "var(--color-brand-300)",
  done: "var(--color-brand-700)",
};

function Edge({ d, state }: { d: string; state: EdgeState }) {
  return (
    <path
      d={d}
      fill="none"
      stroke={EDGE_STROKE[state]}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeDasharray={state === "live" ? "6 4" : undefined}
      vectorEffect="non-scaling-stroke"
      className={cn("transition-[stroke] duration-500", state === "live" && "animate-[edge-flow_0.9s_linear_infinite]")}
    />
  );
}

function NodeChip({ id, state, above }: { id: NodeId; state: NodeState; above?: boolean }) {
  const nodeDetail = useNodeDetail();
  const { x, y } = POSITIONS[id];
  const detail = nodeDetail(id);

  return (
    <div
      className={cn(
        "absolute flex w-32 -translate-x-1/2 items-center gap-1.5 text-center",
        above ? "flex-col-reverse" : "flex-col",
      )}
      style={
        above
          ? { left: `${x}%`, bottom: `calc(${100 - y}% - ${DOT_RADIUS_PX}px)` }
          : { left: `${x}%`, top: `calc(${y}% - ${DOT_RADIUS_PX}px)` }
      }
    >
      <NodeDot state={state} />
      <NodeLabel id={id} state={state} detail={detail} />
    </div>
  );
}

const edgeFor = (target: NodeState): EdgeState =>
  target === "running" || target === "waiting" ? "live" : target === "done" ? "done" : "pending";

function HorizontalFlow({ frame }: { frame: Frame }) {
  const { t } = useTranslation("landing");

  return (
    <div className="relative">
      <div className="overflow-x-auto pb-2">
        <div className="relative min-w-[760px] overflow-hidden">
          <div className="relative h-[340px]">
            <svg
              className="absolute inset-0 h-full w-full"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              {/* The lead's rail. */}
              <Edge d="M 8 16 H 25" state={edgeFor(stateOf(frame, "assign"))} />
              <Edge d="M 31 16 H 47" state={edgeFor(stateOf(frame, "answer"))} />
              <Edge d="M 53 16 H 69" state={edgeFor(stateOf(frame, "collect"))} />
              <Edge d="M 75 16 H 91" state={edgeFor(stateOf(frame, "end"))} />

              {/* Task drops into each peer's mailbox. */}
              <Edge d="M 28 20 C 22 40 15 52 16 72" state={edgeFor(stateOf(frame, "b_mailbox"))} />
              <Edge d="M 28 20 C 55 30 65 60 66 86" state={edgeFor(stateOf(frame, "f_mailbox"))} />

              {/* Backend's own rail. */}
              <Edge d="M 19 78 H 25" state={edgeFor(stateOf(frame, "b_work"))} />
              <Edge d="M 31 78 H 39" state={edgeFor(stateOf(frame, "b_ask"))} />
              <Edge d="M 45 78 H 53" state={edgeFor(stateOf(frame, "b_deliver"))} />

              {/* The peer's question up to the lead, and the answer back. */}
              <Edge d="M 42 72 C 42 45 49 35 50 20" state={edgeFor(stateOf(frame, "answer"))} />
              <Edge d="M 50 20 C 50 45 55 52 56 72" state={edgeFor(stateOf(frame, "b_deliver"))} />

              {/* Frontend's own rail. */}
              <Edge d="M 69 92 H 75" state={edgeFor(stateOf(frame, "f_work"))} />
              <Edge d="M 81 92 H 89" state={edgeFor(stateOf(frame, "f_deliver"))} />

              {/* Artifacts climbing back up to the lead. */}
              <Edge d="M 56 72 C 56 45 69 35 72 20" state={edgeFor(stateOf(frame, "collect"))} />
              <Edge d="M 92 86 C 92 50 76 38 72 20" state={edgeFor(stateOf(frame, "collect"))} />
            </svg>

            <span className="absolute left-0 top-[4%] font-mono text-[10px] uppercase tracking-[0.2em] text-gray-600">
              {t("a2aflow.laneLead")}
            </span>
            <span className="absolute left-0 top-[70%] font-mono text-[10px] uppercase tracking-[0.2em] text-gray-600">
              {t("a2aflow.laneBackend")}
            </span>
            <span className="absolute left-0 top-[85%] font-mono text-[10px] uppercase tracking-[0.2em] text-gray-600">
              {t("a2aflow.laneFrontend")}
            </span>

            <NodeChip id="start" state={stateOf(frame, "start")} />
            <NodeChip id="assign" state={stateOf(frame, "assign")} />
            <NodeChip id="answer" state={stateOf(frame, "answer")} />
            <NodeChip id="collect" state={stateOf(frame, "collect")} />
            <NodeChip id="end" state={stateOf(frame, "end")} />

            <NodeChip id="b_mailbox" state={stateOf(frame, "b_mailbox")} />
            <NodeChip id="b_work" state={stateOf(frame, "b_work")} />
            <NodeChip id="b_ask" state={stateOf(frame, "b_ask")} above />
            <NodeChip id="b_deliver" state={stateOf(frame, "b_deliver")} />

            <NodeChip id="f_mailbox" state={stateOf(frame, "f_mailbox")} />
            <NodeChip id="f_work" state={stateOf(frame, "f_work")} />
            <NodeChip id="f_deliver" state={stateOf(frame, "f_deliver")} />

            {/* The hub: the project card the deliveries pass through, sitting
                between the lead's rail and the peers' lanes. */}
            <div className="absolute left-[31%] right-[31%] top-[34%]">
              <ProjectPanel
                backend={frame.backend}
                frontend={frame.frontend}
                questionShown={frame.questionShown}
                answerShown={frame.answerShown}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function VerticalNode({ id, state }: { id: NodeId; state: NodeState }) {
  const nodeDetail = useNodeDetail();
  const detail = nodeDetail(id);
  return (
    <div className="flex items-start gap-3 text-left">
      <span className="mt-0.5">
        <NodeDot state={state} />
      </span>
      <NodeLabel id={id} state={state} detail={detail} />
    </div>
  );
}

function VerticalRail({ state }: { state: NodeState }) {
  return (
    <div
      className={cn(
        "ml-[6px] h-5 w-px transition-colors duration-500",
        state === "pending" ? "bg-surface-border" : state === "done" ? "bg-brand-700" : "bg-brand-400",
      )}
    />
  );
}

function VerticalFlow({ frame }: { frame: Frame }) {
  const { t } = useTranslation("landing");
  return (
    <div className="mx-auto max-w-sm">
      <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-gray-600">{t("a2aflow.laneLead")}</p>
      <VerticalNode id="start" state={stateOf(frame, "start")} />
      <VerticalRail state={stateOf(frame, "assign")} />
      <VerticalNode id="assign" state={stateOf(frame, "assign")} />
      <VerticalRail state={stateOf(frame, "answer")} />
      <VerticalNode id="answer" state={stateOf(frame, "answer")} />
      <VerticalRail state={stateOf(frame, "collect")} />
      <VerticalNode id="collect" state={stateOf(frame, "collect")} />
      <VerticalRail state={stateOf(frame, "end")} />
      <VerticalNode id="end" state={stateOf(frame, "end")} />

      <div className="ml-[6px] mt-3 border-l border-surface-border pl-5">
        <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-gray-600">{t("a2aflow.laneBackend")}</p>
        <VerticalNode id="b_mailbox" state={stateOf(frame, "b_mailbox")} />
        <VerticalRail state={stateOf(frame, "b_work")} />
        <VerticalNode id="b_work" state={stateOf(frame, "b_work")} />
        <VerticalRail state={stateOf(frame, "b_ask")} />
        <VerticalNode id="b_ask" state={stateOf(frame, "b_ask")} />
        <VerticalRail state={stateOf(frame, "b_deliver")} />
        <VerticalNode id="b_deliver" state={stateOf(frame, "b_deliver")} />
      </div>

      <div className="ml-[6px] mt-3 border-l border-surface-border pl-5">
        <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-gray-600">{t("a2aflow.laneFrontend")}</p>
        <VerticalNode id="f_mailbox" state={stateOf(frame, "f_mailbox")} />
        <VerticalRail state={stateOf(frame, "f_work")} />
        <VerticalNode id="f_work" state={stateOf(frame, "f_work")} />
        <VerticalRail state={stateOf(frame, "f_deliver")} />
        <VerticalNode id="f_deliver" state={stateOf(frame, "f_deliver")} />
      </div>

      <div className="ml-[6px] mt-3 border-l border-surface-border pl-5">
        <ProjectPanel
          backend={frame.backend}
          frontend={frame.frontend}
          questionShown={frame.questionShown}
          answerShown={frame.answerShown}
        />
      </div>
    </div>
  );
}

const NARROW = "(max-width: 767px)";

function subscribeToWidth(onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const query = window.matchMedia(NARROW);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function readWidth(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(NARROW).matches;
}

function useIsNarrow(): boolean {
  return useSyncExternalStore(subscribeToWidth, readWidth, () => false);
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeToMotionPreference(onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function readMotionPreference(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(REDUCED_MOTION).matches;
}

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeToMotionPreference, readMotionPreference, () => false);
}

export function A2AFlowDemo() {
  const { t } = useTranslation("landing");
  const [frameIndex, setFrameIndex] = useState(0);
  const [active, setActive] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();
  const narrow = useIsNarrow();

  useEffect(() => {
    const node = containerRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setActive(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setActive(entry.isIntersecting),
      { threshold: 0.3 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (reduced || !active) return;
    if (frameIndex >= FRAMES.length - 1) return;
    const timer = setTimeout(() => setFrameIndex((i) => i + 1), FRAMES[frameIndex].ms);
    return () => clearTimeout(timer);
  }, [reduced, active, frameIndex]);

  const frame = reduced ? FRAMES[FRAMES.length - 1] : FRAMES[frameIndex];
  const idle = !active && !reduced;
  const closed = stateOf(frame, "end") === "done";
  const waiting = frame.backend === "waiting";

  return (
    <section className="pb-24 pt-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-gray-100 sm:text-4xl">
            {t("a2aflow.heading")}
          </h2>
          <p className="mt-4 text-lg text-gray-400">{t("a2aflow.intro")}</p>
        </div>

        <div ref={containerRef} className="mx-auto mt-14 max-w-4xl">
          <div className="mb-3 flex items-center gap-2 px-1">
            {/* eslint-disable-next-line i18next/no-literal-string */}
            <code className="font-mono text-xs text-brand-300">project.invoke()</code>
            {/* eslint-disable-next-line i18next/no-literal-string */}
            <span className="text-xs text-gray-500">agent_to_agent</span>
            <span className="ml-auto flex items-center gap-1.5">
              <span
                className={cn(
                  "h-2 w-2 rounded-full transition-colors duration-500",
                  idle || closed ? "bg-gray-600" : waiting ? "bg-risk-medium" : "bg-brand-500",
                )}
              />
              <span className="text-[10px] uppercase tracking-wide text-gray-500">
                {t(
                  idle
                    ? "a2aflow.status.ready"
                    : waiting
                      ? "a2aflow.status.waiting"
                      : closed
                        ? "a2aflow.status.closed"
                        : "a2aflow.status.running",
                )}
              </span>
            </span>
          </div>

          {narrow ? <VerticalFlow frame={frame} /> : <HorizontalFlow frame={frame} />}

          <p className="mt-2 text-center text-[11px] text-gray-600">
            {t(reduced ? "a2aflow.footnoteReduced" : "a2aflow.footnote")}
          </p>
        </div>
      </div>
    </section>
  );
}