import { eq, and, lt, desc, inArray } from "drizzle-orm";
import { getDb } from "../db";
import { humanQueries } from "../db/schema/human-queries";
import { conversations } from "../db/schema/conversations";
import { conversationParticipants } from "../db/schema/participants";
import { messages } from "../db/schema/messages";
import { humans } from "../db/schema/humans";
import { invitations } from "../db/schema/invitations";
import { agentTrustRevocations } from "../db/schema/trust-revocations";
import { NotFoundError, ForbiddenError, ConflictError } from "../lib/errors";
import { generateInvitationToken } from "../lib/crypto";
import { dispatchWebhooks } from "./webhook.service";
import { getAgentById } from "./agent.service";
import { sendQueryEmail } from "./query-email.service";
import type { CreateQueryInput, RespondQueryInput } from "../validators/query.validators";

export async function createQuery(agentId: string, input: CreateQueryInput) {
  const db = getDb();

  const result = await db.transaction(async (tx) => {
    // 1. Create conversation for this query
    const [conversation] = await tx
      .insert(conversations)
      .values({
        createdByAgentId: agentId,
        title: `Query: ${input.question.slice(0, 80)}`,
        description: `Human query (${input.query_type})`,
        intentType: "solicitation",
      })
      .returning();

    // 2. Add agent as participant
    await tx.insert(conversationParticipants).values({
      conversationId: conversation.id,
      actorType: "agent",
      agentId,
      role: "owner",
    });

    // 3. Create invitation for the target human
    const token = generateInvitationToken();
    const invitationExpiresAt = new Date(Date.now() + input.timeout_minutes * 60 * 1000);

    const [invitation] = await tx
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

    const [human] = await tx
      .select()
      .from(humans)
      .where(eq(humans.email, input.target_human_email))
      .limit(1);

    if (human) {
      // Check for prior accepted invitation (trust)
      const [priorAccepted] = await tx
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
        const [revocation] = await tx
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
          await tx
            .update(invitations)
            .set({ status: "accepted", updatedAt: new Date() })
            .where(eq(invitations.id, invitation.id));

          await tx.insert(conversationParticipants).values({
            conversationId: conversation.id,
            actorType: "human",
            humanId: human.id,
            role: "participant",
          });

          humanId = human.id;
          status = "assigned";
          console.log(`[QUERY] Auto-accepted: ${input.target_human_email} trusts agent ${agentId}`);
        } else {
          console.log(`[QUERY] Trust revoked: ${input.target_human_email} revoked agent ${agentId}`);
        }
      } else {
        console.log(`[QUERY] No prior trust: ${input.target_human_email} has no accepted invitations from agent ${agentId}`);
      }
    }

    // 5. Send the query message
    const [queryMessage] = await tx
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

    const [query] = await tx
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
    await tx
      .update(messages)
      .set({
        structuredData: {
          ...queryMessage.structuredData as Record<string, unknown>,
          queryId: query.id,
        },
      })
      .where(eq(messages.id, queryMessage.id));

    return { conversation, query, token, status, humanId, expiresAt };
  });

  const { conversation, query, token, status, expiresAt } = result;

  // Send query email outside the transaction (side effect)
  // Send for both "pending" and "assigned": the email is the only thing that
  // tells the human a question is waiting for them.
  try {
    const agent = await getAgentById(agentId);
    await sendQueryEmail({
      queryId: query.id,
      agentDisplayName: agent.displayName,
      question: input.question,
      context: input.context,
      queryType: input.query_type,
      targetEmail: input.target_human_email,
      expiresAt,
      invitationToken: token,
    });
    console.log(`[QUERY] Query email sent to ${input.target_human_email}`);
  } catch (emailErr) {
    console.error(`[QUERY] Email FAILED for ${input.target_human_email}:`, emailErr);
  }

  console.log(`[QUERY] Created ${query.id} for ${input.target_human_email} (status: ${status}, type: ${input.query_type}, agent: ${agentId})`);

  return {
    query_id: query.id,
    status: query.status,
    conversation_id: conversation.id,
    message: status === "assigned"
      ? "Query created. Human is a trusted contact and has been auto-assigned — they can respond immediately."
      : "Query created. An invitation email has been sent to the human. Answering in the app automatically accepts the invitation and records their response.",
    next_step: `Use get_query with query_id "${query.id}" to poll for the response. Wait at least 10-30 seconds between polls.`,
    expires_at: expiresAt.toISOString(),
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

  // Update query with optimistic lock — only update if still in "assigned" status
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
    .where(and(eq(humanQueries.id, queryId), eq(humanQueries.status, "assigned")))
    .returning();

  if (!updated) {
    throw new ConflictError("Query was already answered or its status changed");
  }

  // Dispatch webhook to agent
  console.log(`[QUERY] Answered: ${queryId} by human ${humanId} (response_time: ${responseTimeMs}ms)`);
  dispatchWebhooks(query.agentId, "query.answered", {
    query_id: query.id,
    status: "answered",
    answer: input.answer,
    comment: input.comment,
    human_confidence: input.confidence,
    response_time_ms: responseTimeMs,
  }).catch((err) => {
    console.error(`[QUERY] Webhook dispatch failed for ${queryId}:`, err);
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
  let effectiveStatus = query.status;
  if (
    (query.status === "pending" || query.status === "assigned") &&
    new Date() > query.expiresAt
  ) {
    await db
      .update(humanQueries)
      .set({ status: "expired", updatedAt: new Date() })
      .where(eq(humanQueries.id, queryId));
    effectiveStatus = "expired";
    console.log(`[QUERY] Expired: ${queryId} (was ${query.status})`);
  }

  const statusHints: Record<string, string> = {
    pending: "The human has been invited but hasn't accepted the invitation yet. They need to open the link in their email and answer in the app — answering automatically accepts the invitation. Keep polling — wait 10-30 seconds before checking again.",
    assigned: "The human has accepted the invitation and can see your query, but hasn't submitted their answer yet. Keep polling — wait 10-30 seconds before checking again.",
    answered: "The human has responded. Their answer is in the 'answer' field below. No further polling needed.",
    expired: "The query has expired without a response. The human did not answer in time. You may create a new query if needed.",
  };

  return {
    query_id: query.id,
    status: effectiveStatus,
    status_description: statusHints[effectiveStatus] || `Unknown status: ${effectiveStatus}`,
    query_type: query.queryType,
    question: query.question,
    context: query.context,
    confidence: query.confidence,
    answer: effectiveStatus === "answered" ? query.answer : null,
    comment: effectiveStatus === "answered" ? query.answerComment : null,
    human_confidence: effectiveStatus === "answered" ? query.answerConfidence : null,
    response_time_ms: effectiveStatus === "answered" ? query.responseTimeMs : null,
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

  // Batch expire in a single UPDATE instead of N individual queries
  const now = new Date();
  const expiredIds = rows.filter((q) => now > q.expiresAt).map((q) => q.id);

  if (expiredIds.length > 0) {
    await db
      .update(humanQueries)
      .set({ status: "expired", updatedAt: now })
      .where(inArray(humanQueries.id, expiredIds));
    console.log(`[QUERY] Batch expired ${expiredIds.length} queries`);
  }

  return rows.filter((q) => now <= q.expiresAt);
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
