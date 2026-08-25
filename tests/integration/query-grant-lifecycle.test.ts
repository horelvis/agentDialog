import { describe, expect, it } from "bun:test";
import { getDb } from "../../src/db";
import { agents } from "../../src/db/schema/agents";
import { conversations } from "../../src/db/schema/conversations";
import { humanQueries } from "../../src/db/schema/human-queries";
import { messages } from "../../src/db/schema/messages";
import {
  mintQueryGrant,
  resolveQueryGrant,
  consumeQueryGrant,
} from "../../src/services/query-grant.service";
import { generateGrantToken } from "../../src/lib/query-grant-token";

/**
 * The grant is the only thing standing between a forwarded email and somebody
 * else's question, so its lifecycle is worth pinning directly rather than only
 * through the HTTP routes.
 */

function unique(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

async function makeQuery(email: string) {
  const db = getDb();

  const [agent] = await db.insert(agents).values({
    slug: unique("grant-life"),
    displayName: "Grant Lifecycle Agent",
    apiKeyHash: "not-a-real-hash",
    apiKeyPrefix: unique("mge_ag").slice(0, 15),
  }).returning();

  const [conversation] = await db.insert(conversations).values({
    createdByAgentId: agent.id,
    title: "Grant lifecycle",
  }).returning();

  // A query points at the message that carries it — query_message_id is NOT
  // NULL — so the message has to exist first.
  const [message] = await db.insert(messages).values({
    conversationId: conversation.id,
    senderType: "agent",
    senderAgentId: agent.id,
    type: "human_query",
    content: "Is this correct?",
  }).returning();

  const [query] = await db.insert(humanQueries).values({
    conversationId: conversation.id,
    agentId: agent.id,
    humanEmail: email,
    queryType: "validation",
    question: "Is this correct?",
    answerSpace: { kind: "boolean", labels: { t: "Yes", f: "No" } },
    subject: { id: "s1", label: "Subject", body: "Body" },
    queryMessageId: message.id,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  }).returning();

  return query;
}

describe("query grant lifecycle", () => {
  it("resolves a freshly minted token to its query", async () => {
    const query = await makeQuery("grant-a@example.com");
    const token = await mintQueryGrant(query.id, "grant-a@example.com", query.expiresAt);

    const resolved = await resolveQueryGrant(token);
    expect(resolved.queryId).toBe(query.id);
    expect(resolved.humanEmail).toBe("grant-a@example.com");
  });

  it("refuses a token that was never minted", async () => {
    expect(resolveQueryGrant(generateGrantToken())).rejects.toThrow();
  });

  it("refuses a consumed token", async () => {
    const query = await makeQuery("grant-b@example.com");
    const token = await mintQueryGrant(query.id, "grant-b@example.com", query.expiresAt);

    const { grantId } = await resolveQueryGrant(token);
    await consumeQueryGrant(grantId);

    expect(resolveQueryGrant(token)).rejects.toThrow();
  });

  it("refuses an expired token", async () => {
    const query = await makeQuery("grant-c@example.com");
    const token = await mintQueryGrant(query.id, "grant-c@example.com", new Date(Date.now() - 1000));

    expect(resolveQueryGrant(token)).rejects.toThrow();
  });

  it("gives the same error for expired and unknown, so it is no oracle", async () => {
    const query = await makeQuery("grant-d@example.com");
    const expired = await mintQueryGrant(query.id, "grant-d@example.com", new Date(Date.now() - 1000));
    const unknown = generateGrantToken();

    const messages: string[] = [];
    for (const token of [expired, unknown]) {
      try {
        await resolveQueryGrant(token);
      } catch (err) {
        messages.push((err as Error).message);
      }
    }

    expect(messages).toHaveLength(2);
    expect(messages[0]).toBe(messages[1]);
  });
});
