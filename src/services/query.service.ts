import { eq, and, lt, desc } from "drizzle-orm";
import { getDb } from "../db";
import { humanQueries } from "../db/schema/human-queries";
import { conversations } from "../db/schema/conversations";
import { conversationParticipants } from "../db/schema/participants";
import { messages } from "../db/schema/messages";
import { humans } from "../db/schema/humans";
import { invitations } from "../db/schema/invitations";
import { agentTrustRevocations } from "../db/schema/trust-revocations";
import { NotFoundError, ForbiddenError } from "../lib/errors";
import { generateInvitationToken } from "../lib/crypto";
import { dispatchWebhooks } from "./webhook.service";
import type { CreateQueryInput, RespondQueryInput } from "../validators/query.validators";

export async function createQuery(agentId: string, input: CreateQueryInput) {
  const db = getDb();

  // 1. Create conversation for this query
  const [conversation] = await db
    .insert(conversations)
    .values({
      createdByAgentId: agentId,
      title: `Query: ${input.question.slice(0, 80)}`,
      description: `Human query (${input.query_type})`,
      intentType: "solicitation",
    })
    .returning();

  // 2. Add agent as participant
  await db.insert(conversationParticipants).values({
    conversationId: conversation.id,
    actorType: "agent",
    agentId,
    role: "owner",
  });

  // 3. Create invitation for the target human
  const token = generateInvitationToken();
  const invitationExpiresAt = new Date(Date.now() + input.timeout_minutes * 60 * 1000);

  const [invitation] = await db
    .insert(invitations)
    .values({
      conversationId: conversation.id,
      invitedByAgentId: agentId,
      invitedHumanEmail: input.target_human_email,
      token,
      message: input.question,
      expiresAt: invitationExpiresAt,
    })
    .returning();

  // 4. Try auto-accept if the human trusts this agent
  let humanId: string | null = null;
  let status: "pending" | "assigned" = "pending";

  const [human] = await db
    .select()
    .from(humans)
    .where(eq(humans.email, input.target_human_email))
    .limit(1);

  if (human) {
    // Check for prior accepted invitation (trust)
    const [priorAccepted] = await db
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.invitedByAgentId, agentId),
          eq(invitations.invitedHumanEmail, input.target_human_email),
          eq(invitations.status, "accepted"),
        ),
      )
      .limit(1);

    if (priorAccepted) {
      // Check no revocation
      const [revocation] = await db
        .select()
        .from(agentTrustRevocations)
        .where(
          and(
            eq(agentTrustRevocations.agentId, agentId),
            eq(agentTrustRevocations.humanId, human.id),
          ),
        )
        .limit(1);

      if (!revocation) {
        // Auto-accept
        await db
          .update(invitations)
          .set({ status: "accepted", updatedAt: new Date() })
          .where(eq(invitations.id, invitation.id));

        await db.insert(conversationParticipants).values({
          conversationId: conversation.id,
          actorType: "human",
          humanId: human.id,
          role: "participant",
        });

        humanId = human.id;
        status = "assigned";
      }
    }
  }

  // 5. Send the query message
  const [queryMessage] = await db
    .insert(messages)
    .values({
      conversationId: conversation.id,
      senderType: "agent",
      senderAgentId: agentId,
      type: "human_query",
      content: input.question,
      structuredData: {
        queryType: input.query_type,
        question: input.question,
        context: input.context,
        confidence: input.confidence,
        timeoutMinutes: input.timeout_minutes,
      },
      metadata: input.metadata || {},
    })
    .returning();

  // 6. Insert human_query record
  const expiresAt = new Date(Date.now() + input.timeout_minutes * 60 * 1000);

  const [query] = await db
    .insert(humanQueries)
    .values({
      agentId,
      humanEmail: input.target_human_email,
      humanId,
      conversationId: conversation.id,
      queryMessageId: queryMessage.id,
      queryType: input.query_type,
      status,
      question: input.question,
      context: input.context,
      confidence: input.confidence,
      timeoutMinutes: input.timeout_minutes,
      expiresAt,
      metadata: input.metadata || {},
    })
    .returning();

  // Update the query message structuredData with queryId
  await db
    .update(messages)
    .set({
      structuredData: {
        ...queryMessage.structuredData as Record<string, unknown>,
        queryId: query.id,
      },
    })
    .where(eq(messages.id, queryMessage.id));

  return {
    query_id: query.id,
    status: query.status,
    conversation_id: conversation.id,
    message: `Query created. Human ${status === "assigned" ? "has been auto-assigned (trusted)" : "has been invited"}.`,
  };
}

export async function respondQuery(queryId: string, humanId: string, input: RespondQueryInput) {
  const db = getDb();

  const [query] = await db
    .select()
    .from(humanQueries)
    .where(eq(humanQueries.id, queryId))
    .limit(1);

  if (!query) throw new NotFoundError("Query", queryId);

  if (query.status === "answered") {
    throw new ForbiddenError("Query has already been answered");
  }
  if (query.status === "expired") {
    throw new ForbiddenError("Query has expired");
  }

  // Verify human is a participant in the conversation
  const [participant] = await db
    .select()
    .from(conversationParticipants)
    .where(
      and(
        eq(conversationParticipants.conversationId, query.conversationId),
        eq(conversationParticipants.humanId, humanId),
      ),
    )
    .limit(1);

  if (!participant) {
    throw new ForbiddenError("You are not a participant in this query's conversation");
  }

  // Send response message
  const [responseMessage] = await db
    .insert(messages)
    .values({
      conversationId: query.conversationId,
      senderType: "human",
      senderHumanId: humanId,
      type: "human_query_response",
      content: input.answer,
      structuredData: {
        queryId: query.id,
        answer: input.answer,
        comment: input.comment,
        confidence: input.confidence,
      },
    })
    .returning();

  const responseTimeMs = Date.now() - query.createdAt.getTime();

  // Update query
  const [updated] = await db
    .update(humanQueries)
    .set({
      status: "answered",
      humanId,
      responseMessageId: responseMessage.id,
      answer: input.answer,
      answerComment: input.comment,
      answerConfidence: input.confidence,
      responseTimeMs,
      updatedAt: new Date(),
    })
    .where(eq(humanQueries.id, queryId))
    .returning();

  // Dispatch webhook to agent
  dispatchWebhooks(query.agentId, "query.answered", {
    query_id: query.id,
    status: "answered",
    answer: input.answer,
    comment: input.comment,
    human_confidence: input.confidence,
    response_time_ms: responseTimeMs,
  });

  return updated;
}

export async function getQuery(queryId: string, agentId: string) {
  const db = getDb();

  const [query] = await db
    .select()
    .from(humanQueries)
    .where(and(eq(humanQueries.id, queryId), eq(humanQueries.agentId, agentId)))
    .limit(1);

  if (!query) throw new NotFoundError("Query", queryId);

  // Lazy expire check
  if (
    (query.status === "pending" || query.status === "assigned") &&
    new Date() > query.expiresAt
  ) {
    await db
      .update(humanQueries)
      .set({ status: "expired", updatedAt: new Date() })
      .where(eq(humanQueries.id, queryId));

    return {
      query_id: query.id,
      status: "expired" as const,
      query_type: query.queryType,
      question: query.question,
      context: query.context,
      confidence: query.confidence,
      answer: null,
      comment: null,
      human_confidence: null,
      response_time_ms: null,
      created_at: query.createdAt.toISOString(),
      expires_at: query.expiresAt.toISOString(),
    };
  }

  return {
    query_id: query.id,
    status: query.status,
    query_type: query.queryType,
    question: query.question,
    context: query.context,
    confidence: query.confidence,
    answer: query.answer,
    comment: query.answerComment,
    human_confidence: query.answerConfidence,
    response_time_ms: query.responseTimeMs,
    created_at: query.createdAt.toISOString(),
    expires_at: query.expiresAt.toISOString(),
  };
}

export async function listAgentQueries(
  agentId: string,
  filters: { status?: string; limit: number },
) {
  const db = getDb();
  const conditions = [eq(humanQueries.agentId, agentId)];

  if (filters.status) {
    conditions.push(eq(humanQueries.status, filters.status as any));
  }

  const rows = await db
    .select()
    .from(humanQueries)
    .where(and(...conditions))
    .orderBy(desc(humanQueries.createdAt))
    .limit(filters.limit);

  return rows.map((q) => ({
    query_id: q.id,
    status: q.status,
    query_type: q.queryType,
    question: q.question,
    human_email: q.humanEmail,
    answer: q.answer,
    created_at: q.createdAt.toISOString(),
    expires_at: q.expiresAt.toISOString(),
  }));
}

export async function listHumanQueries(humanId: string) {
  const db = getDb();

  // Find queries where this human is a participant via conversation
  const participantRows = await db
    .select({ conversationId: conversationParticipants.conversationId })
    .from(conversationParticipants)
    .where(eq(conversationParticipants.humanId, humanId));

  const conversationIds = participantRows.map((r) => r.conversationId);
  if (conversationIds.length === 0) return [];

  const { inArray } = await import("drizzle-orm");

  const rows = await db
    .select()
    .from(humanQueries)
    .where(
      and(
        inArray(humanQueries.conversationId, conversationIds),
        inArray(humanQueries.status, ["pending", "assigned"]),
      ),
    )
    .orderBy(desc(humanQueries.createdAt));

  // Lazy expire
  const now = new Date();
  const result = [];
  for (const q of rows) {
    if (now > q.expiresAt) {
      await db
        .update(humanQueries)
        .set({ status: "expired", updatedAt: now })
        .where(eq(humanQueries.id, q.id));
      continue;
    }
    result.push(q);
  }

  return result;
}

export async function getQueryForHuman(queryId: string, humanId: string) {
  const db = getDb();

  const [query] = await db
    .select()
    .from(humanQueries)
    .where(eq(humanQueries.id, queryId))
    .limit(1);

  if (!query) throw new NotFoundError("Query", queryId);

  // Verify human is participant
  const [participant] = await db
    .select()
    .from(conversationParticipants)
    .where(
      and(
        eq(conversationParticipants.conversationId, query.conversationId),
        eq(conversationParticipants.humanId, humanId),
      ),
    )
    .limit(1);

  if (!participant) throw new NotFoundError("Query", queryId);

  return query;
}
