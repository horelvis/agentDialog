import { deactivateExpiredAgents } from "./agent.service";

const SWEEP_INTERVAL_MS = 5 * 60 * 1000; // Every 5 minutes, like the MCP session TTL sweep.

let started = false;

/**
 * Periodically deactivate agents whose self-declared lifetime has passed.
 * Called once from src/index.ts; on a multi-instance deploy every instance
 * runs it, which is safe because the sweep is idempotent (only active agents
 * are touched) and the race between two instances at worst marks the same row
 * deactivated twice.
 *
 * A failed sweep is logged, never thrown: an expired agent is already refused
 * at authentication by the lazy expiry check, so the sweep only reclaims
 * status — the product does not depend on it running.
 */
export function startAgentExpirySweep(): void {
  if (started) return;
  started = true;

  setInterval(() => {
    deactivateExpiredAgents()
      .then((count) => {
        if (count > 0) console.log(`[AGENT-EXPIRY] Deactivated ${count} expired agent(s)`);
      })
      .catch((err) => console.error("[AGENT-EXPIRY] Sweep failed:", err));
  }, SWEEP_INTERVAL_MS);
}