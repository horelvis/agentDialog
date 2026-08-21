import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { humanQueries } from "../db/schema/human-queries";
import { env } from "../env";
import { canonicaliseEmail } from "../lib/email-identity";
import { atLeast, type Risk } from "./decidability";
import type { AnswerSpace } from "../lib/answer-space";

/**
 * The two rules that cannot be pure: they need history.
 *
 * Both exist so the system verifies with what it already knows rather than
 * trusting what the agent declares. An agent can omit the fact that it asked
 * before; it cannot omit our record of it.
 */

/**
 * ISO 4217-ish: three letters. Enough to tell "EUR" from "kg". Case-insensitive
 * on purpose: "crude" here means no currency conversion, not that pressing
 * shift on `unit` should silently skip elevation altogether.
 */
const CURRENCY = /^[A-Z]{3}$/i;

/**
 * A prior decision is an ANSWERED query about the same subject, from the same
 * agent, to the same person. An expired or cancelled one does not count: nobody
 * decided anything, so there is no memory to contradict and no delta to explain.
 */
export async function findPriorDecision(
  agentId: string,
  humanEmail: string,
  subjectId: string,
): Promise<{ id: string; decidedAt: Date } | null> {
  const db = getDb();
  const [row] = await db
    .select({ id: humanQueries.id, decidedAt: humanQueries.updatedAt })
    .from(humanQueries)
    .where(
      and(
        eq(humanQueries.agentId, agentId),
        eq(humanQueries.humanEmail, canonicaliseEmail(humanEmail)),
        eq(humanQueries.status, "answered"),
        sql`${humanQueries.subject}->>'id' = ${subjectId}`,
      ),
    )
    .orderBy(desc(humanQueries.updatedAt))
    .limit(1);

  return row ? { id: row.id, decidedAt: row.decidedAt } : null;
}

function largestMoneyAmount(space: AnswerSpace): number | null {
  const consider = (unit: string, max?: number, proposed?: unknown): number | null => {
    if (!CURRENCY.test(unit)) return null;
    if (typeof max === "number") return max;
    if (typeof proposed === "number") return proposed;
    return null;
  };

  if (space.kind === "scalar") return consider(space.unit, space.max);
  if (space.kind === "fields") {
    let biggest: number | null = null;
    for (const f of space.fields) {
      if (f.kind !== "scalar") continue;
      const v = consider(f.unit, f.max, f.proposed);
      if (v !== null && (biggest === null || v > biggest)) biggest = v;
    }
    return biggest;
  }
  return null;
}

/**
 * The agent declares a floor; the system raises it and never lowers it. The
 * value of this is not that it is clever - it is that it cannot be dodged.
 */
export function elevateRisk(
  declared: Risk,
  opts: { hasPriorDecision: boolean; answerSpace: AnswerSpace },
): Risk {
  let risk = declared;
  if (opts.hasPriorDecision) risk = atLeast(risk, "medium");

  const amount = largestMoneyAmount(opts.answerSpace);
  if (amount !== null && amount > env().RISK_ELEVATION_AMOUNT) {
    risk = atLeast(risk, "high");
  }
  return risk;
}
