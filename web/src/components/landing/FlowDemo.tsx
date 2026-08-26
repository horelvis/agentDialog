import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";

/**
 * The loop, drawn as the graph it is: control runs down a rail, stops dead at
 * the node that needs a person, and only moves again when their answer lands.
 *
 * Labels are deliberately generic. This is the shape of every human-in-the-loop
 * graph, not a particular one, and nothing here claims a LangGraph-native
 * integration: pausing a graph on a tool call is what the shipped `ask_human`
 * tool already does.
 */

type NodeId = "start" | "gather_context" | "ask_human" | "apply_decision" | "escalate" | "end";
type NodeState = "pending" | "running" | "waiting" | "done" | "untaken";
type QueryState = "hidden" | "asking" | "answered";

interface Frame {
  /** How long this frame stays on screen. */
  ms: number;
  states: Partial<Record<NodeId, NodeState>>;
  query: QueryState;
  /** True while the answer is travelling back up into the graph. */
  resuming?: boolean;
}

/**
 * `__start__` and `__end__` are what a graph calls its own entry and exit, and
 * using the real names says something the prettier ones would not: the agent
 * invoked this, nobody was waiting for a person to press anything.
 */
const NODE_LABELS: Record<NodeId, string> = {
  start: "__start__",
  gather_context: "gather_context",
  ask_human: "ask_human",
  apply_decision: "apply_decision",
  escalate: "escalate",
  end: "__end__",
};

/** What each node did, in the words of whoever did it. */
const NODE_DETAIL: Partial<Record<NodeId, string>> = {
  start: "the agent invokes its graph",
  gather_context: "reads 4 sources · 8s",
  ask_human: "hands the decision over",
  apply_decision: "writes the answer back · 0.4s",
  end: "the agent closes the operation",
};

/**
 * The script. Written out frame by frame rather than derived from a clock,
 * because the interesting states are not evenly spaced: the wait is long on
 * purpose and everything after the answer is quick.
 */
const FRAMES: Frame[] = [
  { ms: 700, states: { start: "running" }, query: "hidden" },
  { ms: 900, states: { start: "done", gather_context: "running" }, query: "hidden" },
  {
    ms: 900,
    states: { start: "done", gather_context: "done", ask_human: "running" },
    query: "hidden",
  },
  {
    ms: 3400,
    states: { start: "done", gather_context: "done", ask_human: "waiting" },
    query: "asking",
  },
  {
    ms: 1600,
    states: { start: "done", gather_context: "done", ask_human: "done" },
    query: "answered",
    resuming: true,
  },
  {
    ms: 900,
    states: {
      start: "done",
      gather_context: "done",
      ask_human: "done",
      apply_decision: "running",
      escalate: "untaken",
    },
    query: "answered",
  },
  {
    ms: 900,
    states: {
      start: "done",
      gather_context: "done",
      ask_human: "done",
      apply_decision: "done",
      escalate: "untaken",
      end: "running",
    },
    query: "answered",
  },
  {
    ms: 3600,
    states: {
      start: "done",
      gather_context: "done",
      ask_human: "done",
      apply_decision: "done",
      escalate: "untaken",
      end: "done",
    },
    query: "answered",
  },
];

/**
 * Each option names the branch it sends the graph down. Picking one is what
 * decides the shape of the rest of the run, which is the point: the person is
 * not confirming a decision the agent already made.
 */
const OPTIONS = [
  { label: "Option A", consequence: "Applied now. The operation closes today.", branch: "apply" },
  { label: "Option B", consequence: "Held for review. Nothing is written yet.", branch: "escalate" },
] as const;

/** The frame the demo jumps to when a visitor answers it themselves. */
const ANSWERED_FRAME = 4;

function stateOf(frame: Frame, id: NodeId): NodeState {
  return frame.states[id] ?? "pending";
}

/** The dot on the rail. Four states, four readings, no ambiguity between them. */
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
          state === "untaken" && "text-gray-700 line-through decoration-gray-700",
        )}
      >
        {NODE_LABELS[id]}
      </code>
      {/* The line is always in the layout and only visible once the node has run.
          A pending node showing "0.4s" claims work that has not happened; a line
          that appears and disappears makes the whole card change height on a loop. */}
      {detail ? (
        <p
          className={cn(
            "mt-0.5 text-[11px] text-gray-500 transition-opacity duration-500",
            state === "done" || state === "untaken" ? "opacity-100" : "opacity-0",
          )}
          aria-hidden={state !== "done" && state !== "untaken"}
        >
          {detail}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The query as the product poses one: a subject, a declared risk, and every
 * option carrying what picking it causes. The consequence line is the piece the
 * typed-query design rests on — without it these are buttons over a decision
 * nobody can actually make.
 */
function QueryPanel({
  state,
  seconds,
  choice,
  onChoose,
}: {
  state: QueryState;
  seconds: number;
  choice: number;
  onChoose: (index: number) => void;
}) {
  const answered = state === "answered";
  return (
    <div
      className={cn(
        "mt-2 animate-fade-in rounded-lg border transition-colors duration-500",
        answered ? "border-surface-border bg-surface-tertiary" : "border-risk-medium/40 bg-risk-medium/5",
      )}
    >
      <div className="flex items-center gap-2 border-b border-white/5 px-3 py-2">
        <span className="rounded-full bg-risk-medium/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-risk-medium">
          medium risk
        </span>
        <span className="text-[11px] text-gray-500">Subject · record #A-1042</span>
        <span
          className={cn(
            "ml-auto font-mono text-[11px] tabular-nums",
            answered ? "text-gray-500" : "text-risk-medium",
          )}
        >
          {answered ? "answered" : `waiting ${formatSeconds(seconds)}`}
        </span>
      </div>

      <div className="px-3 py-3">
        <p className="text-sm text-gray-200">Approve this operation?</p>

        <div className="mt-2.5 space-y-1.5">
          {OPTIONS.map((option, index) => {
            const picked = answered && index === choice;
            const dropped = answered && index !== choice;
            return (
              <button
                key={option.label}
                type="button"
                onClick={() => onChoose(index)}
                aria-pressed={picked}
                className={cn(
                  "block w-full rounded-lg border px-3 py-2 text-left transition-all duration-300",
                  "hover:border-brand-500/60 hover:bg-brand-500/10",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400",
                  picked
                    ? "border-brand-500/60 bg-brand-500/10"
                    : "border-surface-border bg-surface-elevated",
                  dropped && "opacity-40",
                )}
              >
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      "text-xs font-medium",
                      picked ? "text-brand-200" : "text-gray-200",
                    )}
                  >
                    {option.label}
                  </span>
                  <span
                    className={cn(
                      "ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors duration-300",
                      picked ? "bg-brand-500/20 text-brand-200" : "bg-surface-hover/60 text-gray-400",
                    )}
                  >
                    {picked ? "chosen" : "choose"}
                  </span>
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug text-gray-500">
                  {option.consequence}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function formatSeconds(total: number): string {
  const mm = String(Math.floor(total / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

/**
 * Where each node sits on the stage, in percent. The agent's rail runs across
 * the top; the question drops to the person underneath it and the answer climbs
 * back into the rail further along. Laying it out that way is the whole point —
 * a column of steps reads as a list, and the trip out to a human and back is
 * exactly what a list cannot show.
 */
const POSITIONS: Record<NodeId, { x: number; y: number }> = {
  start: { x: 10, y: 22 },
  gather_context: { x: 27, y: 22 },
  ask_human: { x: 45, y: 22 },
  apply_decision: { x: 74, y: 22 },
  end: { x: 92, y: 22 },
  escalate: { x: 89, y: 62 },
};

/** Half the dot, in pixels: what the chip has to rise so its dot sits on the
 *  coordinate the edges are drawn to. Without it every line runs through the
 *  labels instead of touching the nodes. */
const DOT_RADIUS_PX = 7;

type EdgeState = "pending" | "live" | "done" | "untaken";

const EDGE_STROKE: Record<EdgeState, string> = {
  pending: "var(--color-surface-border)",
  live: "var(--color-brand-300)",
  done: "var(--color-brand-700)",
  untaken: "var(--color-surface-border)",
};

function Edge({ d, state }: { d: string; state: EdgeState }) {
  return (
    <path
      d={d}
      fill="none"
      stroke={EDGE_STROKE[state]}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeDasharray={state === "untaken" ? "3 3" : state === "live" ? "6 4" : undefined}
      vectorEffect="non-scaling-stroke"
      className={cn("transition-[stroke] duration-500", state === "live" && "animate-[edge-flow_0.9s_linear_infinite]")}
    />
  );
}

/**
 * A node on the stage: the dot, its name, and what it did once it has run.
 *
 * `above` puts the text over the dot instead of under it. `ask_human` needs it:
 * the edge to the person leaves downwards from that dot, and would otherwise be
 * drawn straight through its own label.
 */
function NodeChip({
  id,
  state,
  above,
  detail: detailOverride,
}: {
  id: NodeId;
  state: NodeState;
  above?: boolean;
  detail?: string;
}) {
  const { x, y } = POSITIONS[id];
  // A node the run passed over can only say that it was passed over. Leaving its
  // own description under it claims work that never happened.
  const detail =
    state === "untaken" ? (detailOverride ?? "not taken this run") : NODE_DETAIL[id];

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

/** What both layouts need to draw the same run. */
interface FlowView {
  frame: Frame;
  states: Record<NodeId, NodeState>;
  takesApply: boolean;
  answered: boolean;
  waitSeconds: number;
  choice: number;
  onChoose: (index: number) => void;
}

const edgeFor = (target: NodeState): EdgeState =>
  target === "running" || target === "waiting" ? "live" : target === "done" ? "done" : "pending";

/** The wide layout: the agent's rail across the top, the person underneath it. */
function HorizontalFlow({ view }: { view: FlowView }) {
  const { frame, states, takesApply, answered, waitSeconds, choice, onChoose } = view;
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [scrollable, setScrollable] = useState(false);

  // Wider than a narrow window even after the vertical layout takes over below
  // 768px, so the middle — the person's half — is what a visitor lands on.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const measure = () => {
      const overflow = scroller.scrollWidth - scroller.clientWidth;
      setScrollable(overflow > 4);
      if (overflow > 4) scroller.scrollLeft = overflow / 2;
    };

    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // A stage of fixed height. Every piece inside is positioned, so a frame can
  // never grow the section and shove the page around.
  return (
    <div className="relative">
          <div ref={scrollerRef} className="overflow-x-auto pb-2">
            <div className="relative h-[380px] min-w-[700px]">
            <svg
              className="absolute inset-0 h-full w-full"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <Edge d="M 13 22 H 24" state={edgeFor(states.gather_context)} />
              <Edge d="M 30 22 H 42" state={edgeFor(states.ask_human)} />
              {/* Out to the person, and back into the graph further along. */}
              <Edge
                d="M 45 27 C 45 35 36 36 34 41"
                state={frame.query === "asking" ? "live" : answered ? "done" : "pending"}
              />
              <Edge
                d="M 70 41 C 70 36 74 34 74 27"
                state={
                  !takesApply && answered
                    ? "untaken"
                    : frame.resuming
                      ? "live"
                      : states.apply_decision === "done"
                        ? "done"
                        : "pending"
                }
              />
              <Edge d="M 77 22 H 89" state={takesApply ? edgeFor(states.end) : "untaken"} />
              {answered ? (
                <Edge d="M 74 62 H 85" state={takesApply ? "untaken" : "done"} />
              ) : null}
            </svg>

            <span className="absolute left-0 top-[7%] font-mono text-[10px] uppercase tracking-[0.2em] text-gray-600">
              agent
            </span>
            <span className="absolute left-0 top-[52%] font-mono text-[10px] uppercase tracking-[0.2em] text-gray-600">
              human
            </span>

            <NodeChip id="start" state={states.start} />
            <NodeChip id="gather_context" state={states.gather_context} />
            <NodeChip id="ask_human" state={states.ask_human} above />
            <NodeChip id="apply_decision" state={states.apply_decision} />
            <NodeChip id="end" state={states.end} />
            {answered ? (
              <NodeChip
                id="escalate"
                state={states.escalate}
                detail={takesApply ? undefined : "held for review · nothing written"}
              />
            ) : null}

            {/* The person's side of the loop, sitting below the rail it left. */}
            <div className="absolute left-[30%] top-[42%] w-[44%]">
              {frame.query !== "hidden" ? (
                <QueryPanel
                  state={frame.query}
                  seconds={waitSeconds}
                  choice={choice}
                  onChoose={onChoose}
                />
              ) : null}
            </div>
            </div>
          </div>

          {/* Only when the graph really is wider than the screen. A permanent
              fade would promise more to the right of a graph that ends there. */}
          {scrollable ? (
            <>
              <span className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-surface-primary to-transparent" />
              <span className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-surface-primary to-transparent" />
            </>
          ) : null}
    </div>
  );
}

/** A node as a row: the dot on the rail, its name and its detail beside it. */
function VerticalNode({ id, state, detail }: { id: NodeId; state: NodeState; detail?: string }) {
  // Always a string, so the line is always in the layout: a detail that appears
  // only once a node resolves would shift everything under it mid-loop.
  const shown = state === "untaken" ? (detail ?? "not taken this run") : (NODE_DETAIL[id] ?? detail ?? "not taken this run");
  return (
    <div className="flex items-start gap-3 text-left">
      <span className="mt-0.5">
        <NodeDot state={state} />
      </span>
      <NodeLabel id={id} state={state} detail={shown} />
    </div>
  );
}

/** The piece of rail between two rows. */
function VerticalRail({ state }: { state: NodeState }) {
  return (
    <div
      className={cn(
        "ml-[6px] h-5 w-px transition-colors duration-500",
        state === "pending"
          ? "bg-surface-border"
          : state === "untaken"
            ? "bg-transparent"
            : "bg-brand-700",
        state === "untaken" &&
          "border-l border-dashed border-surface-border",
      )}
    />
  );
}

/**
 * The narrow layout. A phone cannot hold the wide graph without shrinking the
 * text past reading, so the same run is drawn as a rail down the screen — the
 * one shape that keeps every label full size.
 */
function VerticalFlow({ view }: { view: FlowView }) {
  const { frame, states, takesApply, waitSeconds, choice, onChoose } = view;

  return (
    <div className="mx-auto max-w-sm">
      <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-gray-600">agent</p>

      <VerticalNode id="start" state={states.start} />
      <VerticalRail state={states.gather_context} />
      <VerticalNode id="gather_context" state={states.gather_context} />
      <VerticalRail state={states.ask_human} />
      <VerticalNode id="ask_human" state={states.ask_human} />

      {/* The panel stays mounted and turns invisible rather than unmounting, so
          the space it needs is its own height instead of a number guessed here —
          and the page below never moves while the loop plays. */}
      <div className="ml-[6px] border-l border-surface-border pl-5 pt-2">
        <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-gray-600">human</p>
        <div className={cn(frame.query === "hidden" && "invisible")} aria-hidden={frame.query === "hidden"}>
          <QueryPanel
            state={frame.query === "hidden" ? "asking" : frame.query}
            seconds={waitSeconds}
            choice={choice}
            onChoose={onChoose}
          />
        </div>
      </div>

      <VerticalNode id="apply_decision" state={states.apply_decision} />
      <VerticalRail state={states.end} />
      <VerticalNode id="end" state={states.end} />

      {/* The branch the answer did not take, hanging off the decision. */}
      <div className="mt-1 flex items-start gap-3 pl-5">
        <span
          className={cn(
            "mt-[-2px] h-4 w-4 rounded-bl border-b border-l border-dashed",
            takesApply ? "border-surface-border" : "border-brand-700",
          )}
        />
        <VerticalNode id="escalate" state={states.escalate} detail={takesApply ? undefined : "held for review · nothing written"} />
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

/** Which layout the screen can hold. Read from the media query rather than
 *  rendering both and hiding one, so only the live layout exists in the DOM. */
function useIsNarrow(): boolean {
  return useSyncExternalStore(subscribeToWidth, readWidth, () => false);
}

export function FlowDemo() {
  const [frameIndex, setFrameIndex] = useState(0);
  const [choice, setChoice] = useState(0);
  const [tick, setTick] = useState(0);
  const [active, setActive] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();
  const narrow = useIsNarrow();

  // Nothing runs until the section is on screen. The old demo started on mount,
  // so a visitor who read the page in order arrived after it had finished.
  useEffect(() => {
    const node = containerRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setActive(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setActive(entry.isIntersecting),
      { threshold: 0.35 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // One timeout per frame, re-armed by the frame it lands on. The last frame
  // wraps to the first, which is the pause before the loop plays again.
  const takesApply = OPTIONS[choice].branch === "apply";

  useEffect(() => {
    if (reduced || !active) return;
    // Option B holds the operation for review, so the run genuinely stops here.
    // Letting it play on to __end__ would show the graph closing something the
    // person just declined to close.
    if (!takesApply && frameIndex >= ANSWERED_FRAME) return;

    const timer = setTimeout(() => {
      setFrameIndex((i) => {
        const next = (i + 1) % FRAMES.length;
        if (next === 0) setChoice(0);
        return next;
      });
    }, FRAMES[frameIndex].ms);
    return () => clearTimeout(timer);
  }, [reduced, active, frameIndex, takesApply]);

  const frame = reduced ? FRAMES[FRAMES.length - 1] : FRAMES[frameIndex];

  // The counter runs only while a person is being waited on, and it is derived
  // rather than reset: nothing outside the wait has a value to clear.
  useEffect(() => {
    if (reduced || frame.query !== "asking") return;
    const startedAt = Date.now();
    const id = setInterval(() => setTick(Math.floor((Date.now() - startedAt) / 1000)), 250);
    return () => clearInterval(id);
  }, [reduced, frame.query]);

  const waitSeconds = frame.query === "asking" ? tick : 0;

  const answered = frame.query === "answered";

  const states: Record<NodeId, NodeState> = {
    start: stateOf(frame, "start"),
    gather_context: stateOf(frame, "gather_context"),
    ask_human: stateOf(frame, "ask_human"),
    apply_decision: takesApply
      ? stateOf(frame, "apply_decision")
      : answered
        ? "untaken"
        : "pending",
    end: takesApply ? stateOf(frame, "end") : answered ? "untaken" : "pending",
    escalate: takesApply ? stateOf(frame, "escalate") : answered ? "done" : "pending",
  };

  const view: FlowView = {
    frame,
    states,
    takesApply,
    answered,
    waitSeconds,
    choice,
    onChoose: (index) => {
      setChoice(index);
      setFrameIndex(ANSWERED_FRAME);
    },
  };

  const askState = states.ask_human;

  return (
    <section className="pb-24 pt-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-gray-100 sm:text-4xl">
            See the full loop in action
          </h2>
          <p className="mt-4 text-lg text-gray-400">
            A graph runs until it reaches a decision that is not the agent&apos;s to make. It stops
            there, a person answers with the consequences spelled out, and the answer comes back
            structured — so the graph carries on and closes the operation.
          </p>
        </div>

        <div ref={containerRef} className="mx-auto mt-14 max-w-4xl">
          <div className="mb-3 flex items-center gap-2 px-1">
            <code className="font-mono text-xs text-brand-300">graph.invoke()</code>
            <span className="text-xs text-gray-500">human_in_the_loop</span>
            <span className="ml-auto flex items-center gap-1.5">
              <span
                className={cn(
                  "h-2 w-2 rounded-full transition-colors duration-500",
                  askState === "waiting" || (!takesApply && answered)
                    ? "bg-risk-medium"
                    : "bg-brand-500",
                )}
              />
              <span className="text-[10px] uppercase tracking-wide text-gray-500">
                {askState === "waiting"
                  ? "paused on a human"
                  : !takesApply && answered
                    ? "held for review"
                    : "running"}
              </span>
            </span>
          </div>

          {narrow ? <VerticalFlow view={view} /> : <HorizontalFlow view={view} />}

          <p className="mt-2 text-center text-[11px] text-gray-600">
            {reduced
              ? "Animation paused: your system asks for reduced motion."
              : "A person took the place of a hardcoded rule. Everything else is the graph you already have."}
          </p>
        </div>
      </div>
    </section>
  );
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

/** Read straight from the media query. A state variable synced in an effect
 *  renders the wrong answer once before it corrects itself. */
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeToMotionPreference, readMotionPreference, () => false);
}
