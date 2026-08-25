import { beforeAll, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { createTestApp } from "../helpers";
import { getDb } from "../../src/db";
import { humanQueries } from "../../src/db/schema/human-queries";
import { queryGrants } from "../../src/db/schema/query-grants";
import { mintQueryGrant } from "../../src/services/query-grant.service";
import { generateGrantToken, grantTokenPrefix } from "../../src/lib/query-grant-token";

/**
 * The behaviours the link must have, stated as tests: a scanner opening it
 * costs nothing, answering spends it, asking for context does not, and it is
 * good for exactly one question.
 */

const app = createTestApp();

function unique(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

// One agent for the whole file. Registration is rate limited to 10/hour per IP
// and that budget is shared by the entire suite.
let apiKey: string;

beforeAll(async () => {
  const res = await app.request("/api/v1/agent/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug: unique("grant-routes"), displayName: "Grant Routes Agent" }),
  });
  apiKey = (await res.json()).data.apiKey;
});

/**
 * The plaintext token only ever exists inside createQuery, on its way to the
 * mailer. Rather than widening the API to hand it back, the test mints its own
 * against the same query: a query may hold more than one grant, and nothing in
 * the design treats that as special.
 */
async function makeQueryWithToken() {
  const res = await app.request("/api/v1/agent/queries", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      query_type: "validation",
      risk: "low",
      target_human_email: `${unique("routes")}@example.com`,
      question: "Is this correct?",
      subject: { id: "s1", label: "Subject", body: "The artefact itself." },
      answer_space: { kind: "boolean", labels: { t: "Yes", f: "No" } },
    }),
  });

  const body = await res.json();
  if (res.status !== 201) {
    throw new Error(`create query failed ${res.status}: ${JSON.stringify(body)}`);
  }

  const [row] = await getDb()
    .select()
    .from(humanQueries)
    .where(eq(humanQueries.id, body.data.query_id))
    .limit(1);

  const token = await mintQueryGrant(row.id, row.humanEmail, row.expiresAt);
  return { queryId: row.id, email: row.humanEmail, token };
}

async function grantRow(token: string) {
  const [row] = await getDb()
    .select()
    .from(queryGrants)
    .where(eq(queryGrants.tokenPrefix, grantTokenPrefix(token)))
    .limit(1);
  return row;
}

function get(token: string) {
  return app.request(`/api/v1/public/queries/${token}`);
}

function respond(token: string, body: unknown) {
  return app.request(`/api/v1/public/queries/${token}/respond`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ANSWER = { outcome: "answer", answer: { kind: "boolean", value: true } };
const NEEDS_CONTEXT = { outcome: "insufficient_context", reason: "unclear_consequences" };

describe("the public query link", () => {
  it("shows the question without a session", async () => {
    const { token } = await makeQueryWithToken();

    const res = await get(token);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.question).toBe("Is this correct?");
    expect(body.data.answer_space.kind).toBe("boolean");
    expect(body.data.subject.label).toBe("Subject");
  });

  it("does not spend the token on GET, so a mail scanner costs nothing", async () => {
    const { token } = await makeQueryWithToken();

    await get(token);
    await get(token);

    expect((await grantRow(token)).consumedAt).toBeNull();
  });

  it("answers the question and spends the token", async () => {
    const { token } = await makeQueryWithToken();

    const res = await respond(token, ANSWER);
    expect(res.status).toBe(200);

    expect((await grantRow(token)).consumedAt).not.toBeNull();
  });

  it("refuses a second answer through the same link", async () => {
    const { token } = await makeQueryWithToken();

    await respond(token, ANSWER);
    const second = await respond(token, ANSWER);

    expect(second.status).toBe(401);
  });

  it("does not spend the token when the human asks for context", async () => {
    const { token } = await makeQueryWithToken();

    const res = await respond(token, NEEDS_CONTEXT);
    expect(res.status).toBe(200);

    expect((await grantRow(token)).consumedAt).toBeNull();
    expect((await get(token)).status).toBe(200);
  });

  it("resolves only the query its token was minted for", async () => {
    const a = await makeQueryWithToken();
    const b = await makeQueryWithToken();

    const body = await (await get(a.token)).json();
    expect(body.data.query_id).toBe(a.queryId);
    expect(body.data.query_id).not.toBe(b.queryId);
  });

  it("refuses an unknown token", async () => {
    expect((await get(generateGrantToken())).status).toBe(401);
  });

  it("gives the same answer for unknown and spent, so it is no oracle", async () => {
    const { token } = await makeQueryWithToken();
    await respond(token, ANSWER);

    const spent = await get(token);
    const unknown = await get(generateGrantToken());

    expect(spent.status).toBe(unknown.status);
    expect((await spent.json()).error.message).toBe((await unknown.json()).error.message);
  });

  it("never returns a session token", async () => {
    const { token } = await makeQueryWithToken();

    const shown = await (await get(token)).text();
    const answered = await (await respond(token, ANSWER)).text();

    expect(shown).not.toContain("sess_");
    expect(answered).not.toContain("sess_");
  });
});
