import { beforeAll, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { createTestApp } from "../helpers";
import { getDb } from "../../src/db";
import { queryGrants } from "../../src/db/schema/query-grants";
import { humanQueries } from "../../src/db/schema/human-queries";

/**
 * Risk decides whether the link exists at all. A high-risk question must not
 * become answerable by whoever holds a forwarded email.
 */

const app = createTestApp();

function unique(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

async function registerAgent(): Promise<string> {
  const res = await app.request("/api/v1/agent/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug: unique("grant-mint"), displayName: "Grant Minting Agent" }),
  });
  return (await res.json()).data.apiKey as string;
}

/**
 * The admission rules tighten with risk: above `low` every branch must say what
 * it causes, and above `medium` we must hold the artefact ourselves and be able
 * to hash it. A payload that satisfies the strictest level satisfies them all,
 * so one shape serves every case here and the test stays about minting.
 */
async function createQuery(apiKey: string, risk: string) {
  const res = await app.request("/api/v1/agent/queries", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      query_type: "validation",
      risk,
      target_human_email: `${unique("grant")}@example.com`,
      question: "Is this correct?",
      subject: {
        id: "s1",
        label: "Subject",
        body: "The artefact itself.",
        sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      },
      answer_space: {
        kind: "boolean",
        labels: { t: "Yes", f: "No" },
        consequences: { t: "It is published.", f: "It goes back for changes." },
      },
    }),
  });
  const body = await res.json();
  // Say why, not just that: an admission refusal carries the reason and the
  // remedy, and a bare status code hides both.
  if (res.status !== 201) {
    throw new Error(`create query (${risk}) failed ${res.status}: ${JSON.stringify(body)}`);
  }
  return body.data;
}

async function grantsFor(queryId: string) {
  return getDb().select().from(queryGrants).where(eq(queryGrants.queryId, queryId));
}

describe("grant minting is gated by risk", () => {
  // One agent for the whole file, not one per case. Agent registration is rate
  // limited to 10/hour per IP and the counter is a budget shared by the entire
  // suite, so a file that registers freely breaks other files' beforeAll.
  let apiKey: string;
  beforeAll(async () => {
    apiKey = await registerAgent();
  });

  it("mints for a low-risk query", async () => {
    const query = await createQuery(apiKey, "low");
    expect(await grantsFor(query.query_id)).toHaveLength(1);
  });

  it("mints for a medium-risk query", async () => {
    const query = await createQuery(apiKey, "medium");
    expect(await grantsFor(query.query_id)).toHaveLength(1);
  });

  it("mints nothing for a high-risk query", async () => {
    const query = await createQuery(apiKey, "high");
    expect(await grantsFor(query.query_id)).toHaveLength(0);
  });

  it("mints nothing for a critical-risk query", async () => {
    const query = await createQuery(apiKey, "critical");
    expect(await grantsFor(query.query_id)).toHaveLength(0);
  });

  it("gives the grant the same expiry as the query it belongs to", async () => {
    const query = await createQuery(apiKey, "low");
    const [grant] = await grantsFor(query.query_id);

    // Read the expiry from the row rather than the wire: the queries resource
    // is snake_case on the wire and camelCase in the schema, and the schema is
    // what this assertion is actually about.
    const [row] = await getDb()
      .select()
      .from(humanQueries)
      .where(eq(humanQueries.id, query.query_id))
      .limit(1);

    expect(new Date(grant.expiresAt).getTime()).toBe(new Date(row.expiresAt).getTime());
  });
});
