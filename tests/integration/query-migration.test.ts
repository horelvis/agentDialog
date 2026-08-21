import { describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";
import { getDb } from "../../src/db";
import { registerAgent } from "../../src/services/agent.service";
import { readFileSync } from "node:fs";

/**
 * Rows created before the migration are kept, not discarded: the history stays
 * readable, and the row itself records that it was decided under the old
 * regime. Discarding them would lose exactly the record this feature exists to
 * protect.
 *
 * The two backfill tests below don't rely on `agentdialog_test`'s accumulated
 * history — a count(*) = 0 check against the live table would pass vacuously
 * on an empty or freshly seeded database, without ever exercising the
 * backfill. Each seeds a row shaped exactly like a pre-migration row, runs the
 * migration's own UPDATE against it, and asserts the fix actually happened.
 * The whole-table checks that follow are kept as a secondary regression signal
 * against the real, already-applied migration — they are not the proof of
 * correctness anymore.
 *
 * The UPDATEs are READ OUT OF THE MIGRATION FILE rather than transcribed. They
 * were previously copied by hand out of two files, which is a standing
 * invitation for the test to keep proving something the migration no longer
 * does — and those two files have since been squashed into one, which is
 * exactly the kind of change a hand copy survives without noticing.
 */

const MIGRATION = "migrations/0007_typed_queries.sql";

/**
 * The migration's UPDATE statements, in file order, each scoped to a single
 * row so a test cannot rewrite the whole table.
 */
function backfillStatements(): string[] {
  const sqlText = readFileSync(MIGRATION, "utf8");
  const statements = sqlText
    .split(";")
    .map((chunk) => chunk.replace(/^\s*--.*$/gm, "").trim())
    .filter((chunk) => /^UPDATE "human_queries"/i.test(chunk));

  // If the migration stops carrying its backfill, this test must fail loudly
  // rather than quietly verify nothing.
  if (statements.length !== 2) {
    throw new Error(`Expected 2 UPDATE statements in ${MIGRATION}, found ${statements.length}`);
  }
  return statements;
}

async function seedFixture(status: "answered" | "pending", answerJson: string) {
  const db = getDb();
  const { agent } = await registerAgent({
    slug: `legacy-fixture-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    displayName: "Legacy Fixture Agent",
  });

  const [conversation] = (await db.execute(sql`
    INSERT INTO conversations (created_by_agent_id) VALUES (${agent.id}) RETURNING id
  `)) as any;

  const [message] = (await db.execute(sql`
    INSERT INTO messages (conversation_id, sender_type, type)
    VALUES (${conversation.id}, 'agent', 'human_query') RETURNING id
  `)) as any;

  // Seeded directly in the pre-backfill shape: subject and answer_space are
  // explicitly '{}' (the old default, before the column defaults changed),
  // self_contained is false, and answer is whatever the caller wants to
  // simulate — the ALTER COLUMN TYPE conversion's output, or a still-bare
  // string, depending on which backfill statement is under test.
  const [query] = (await db.execute(sql`
    INSERT INTO human_queries (
      agent_id, human_email, conversation_id, query_message_id, query_type,
      status, question, expires_at, answer, subject, answer_space, self_contained
    ) VALUES (
      ${agent.id}, 'legacy-fixture@example.com', ${conversation.id}, ${message.id}, 'validation',
      ${status}, 'Did we ship on time?', now() + interval '1 hour',
      ${answerJson}::jsonb, '{}'::jsonb, '{}'::jsonb, false
    ) RETURNING id
  `)) as any;

  return {
    queryId: query.id as string,
    async cleanup() {
      await db.execute(sql`DELETE FROM human_queries WHERE id = ${query.id}`);
      await db.execute(sql`DELETE FROM messages WHERE id = ${message.id}`);
      await db.execute(sql`DELETE FROM conversations WHERE id = ${conversation.id}`);
      await db.execute(sql`DELETE FROM agents WHERE id = ${agent.id}`);
    },
  };
}

describe("migración de filas antiguas", () => {
  it("backfills subject, self_contained and answer_space for a row seeded in the pre-migration shape", async () => {
    const db = getDb();
    const fixture = await seedFixture("answered", JSON.stringify({ kind: "text", value: "Yes, ship it." }));
    try {
      // Sanity check: the fixture genuinely starts in the broken, pre-backfill
      // state — otherwise this test would prove nothing.
      const before = (await db.execute(sql`
        SELECT subject, self_contained, answer_space FROM human_queries WHERE id = ${fixture.queryId}
      `)) as any;
      expect(before[0].answer_space).toEqual({});
      expect(before[0].subject).toEqual({});
      expect(before[0].self_contained).toBe(false);

      // The migration's own backfill, read from the file and scoped to this row.
      const [subjectBackfill] = backfillStatements();
      await db.execute(sql.raw(`${subjectBackfill} AND "id" = '${fixture.queryId}'`));

      const after = (await db.execute(sql`
        SELECT subject, self_contained, answer_space FROM human_queries WHERE id = ${fixture.queryId}
      `)) as any;
      expect(after[0].answer_space).toEqual({ kind: "text", max_length: 32000 });
      expect(after[0].self_contained).toBe(true);
      expect(after[0].subject).toEqual({ id: `legacy:${fixture.queryId}`, label: "Did we ship on time?" });
    } finally {
      await fixture.cleanup();
    }
  });

  it("wraps a still-bare-string answer the way the migration's second UPDATE does", async () => {
    const db = getDb();
    const fixture = await seedFixture("answered", JSON.stringify("Fine by me."));
    try {
      // Sanity check: the fixture starts as a bare jsonb string, not the
      // {kind, value} shape.
      const before = (await db.execute(sql`SELECT answer FROM human_queries WHERE id = ${fixture.queryId}`)) as any;
      expect(typeof before[0].answer).toBe("string");
      expect(before[0].answer).toBe("Fine by me.");

      const answerBackfill = backfillStatements()[1];
      await db.execute(sql.raw(`${answerBackfill} AND "id" = '${fixture.queryId}'`));

      const after = (await db.execute(sql`SELECT answer FROM human_queries WHERE id = ${fixture.queryId}`)) as any;
      expect(after[0].answer).toEqual({ kind: "text", value: "Fine by me." });
    } finally {
      await fixture.cleanup();
    }
  });

  it("leaves every row in the live database with a usable answer_space", async () => {
    const db = getDb();
    const rows = await db.execute(sql`
      SELECT count(*)::int AS n FROM human_queries
      WHERE answer_space IS NULL OR answer_space = '{}'::jsonb
    `);
    expect((rows as any)[0].n).toBe(0);
  });

  it("leaves every answered row in the live database with a structured answer", async () => {
    const db = getDb();
    const rows = await db.execute(sql`
      SELECT count(*)::int AS n FROM human_queries
      WHERE status = 'answered' AND (answer IS NULL OR answer->>'kind' IS NULL)
    `);
    expect((rows as any)[0].n).toBe(0);
  });

  // T3-1: the index prior-decision detection uses is on (agent_id,
  // human_email). It was called human_queries_subject_idx, which is the one
  // thing it does not index, and the squashed migration renames it.
  it("carries the prior-decision index under a name that describes it", async () => {
    const db = getDb();
    const rows = (await db.execute(sql`
      SELECT indexname::text AS name FROM pg_indexes WHERE tablename = 'human_queries'
    `)) as any;
    const names = rows.map((r: any) => r.name);
    expect(names).toContain("human_queries_agent_human_idx");
    expect(names).not.toContain("human_queries_subject_idx");
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
