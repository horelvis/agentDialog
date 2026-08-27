import { useEffect, useState } from "react";

/**
 * The current time, read outside render and refreshed on an interval.
 *
 * Calling `Date.now()` directly in a component body makes the render impure:
 * two renders of the same props can disagree, which is exactly what breaks
 * under concurrent rendering (React may render a component more than once,
 * speculatively, before committing). `null` for the one render before the
 * mount effect has run — callers showing a "expires in N minutes" style
 * value should skip rendering it for that one tick rather than substitute
 * a fabricated time.
 */
export function useNow(intervalMs = 30_000): number | null {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    // Read the clock from a callback, not the effect body itself, so this
    // isn't the same synchronous-setState-in-an-effect shape being fixed at
    // both call sites of this hook. A 0ms timer is the least surprising way
    // to say "as soon as this effect has committed" — the first tick still
    // arrives well before a human would notice a "still loading" state.
    const initial = setTimeout(() => setNow(Date.now()), 0);
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => {
      clearTimeout(initial);
      clearInterval(id);
    };
  }, [intervalMs]);

  return now;
}
