import { describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";
import { getDb } from "../../src/db";

/**
 * Rows created before the migration are kept, not discarded: the history stays
 * readable, and the row itself records that it was decided under the old
 * regime. Discarding them would lose exactly the record this feature exists to
 * protect.
 */

describe("migración de filas antiguas", () => {
  it("leaves every row with a usable answer_space", async () => {
    const db = getDb();
    const rows = await db.execute(sql`
      SELECT count(*)::int AS n FROM human_queries
      WHERE answer_space IS NULL OR answer_space = '{}'::jsonb
    `);
    expect((rows as any)[0].n).toBe(0);
  });

  it("leaves every answered row with a structured answer", async () => {
    const db = getDb();
    const rows = await db.execute(sql`
      SELECT count(*)::int AS n FROM human_queries
      WHERE status = 'answered' AND (answer IS NULL OR answer->>'kind' IS NULL)
    `);
    expect((rows as any)[0].n).toBe(0);
  });

  it("accepts the two new statuses", async () => {
    const db = getDb();
    const rows = await db.execute(sql`
      SELECT unnest(enum_range(NULL::query_status))::text AS v
    `);
    const values = (rows as any).map((r: any) => r.v);
    expect(values).toContain("needs_context");
    expect(values).toContain("cancelled");
  });
});
