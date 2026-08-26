import { eq, and, or, lt, desc, inArray } from "drizzle-orm";
import { getDb } from "../db";
import { humanQueries } from "../db/schema/human-queries";
import { conversations } from "../db/schema/conversations";
import { conversationParticipants } from "../db/schema/participants";
import { messages } from "../db/schema/messages";
import { humans } from "../db/schema/humans";
import { agents } from "../db/schema/agents";
import { invitations } from "../db/schema/invitations";
import { agentTrustRevocations } from "../db/schema/trust-revocations";
import { NotFoundError, ForbiddenError, ConflictError, UndecidableQueryError, ValidationError } from "../lib/errors";
import { generateInvitationToken } from "../lib/crypto";
import { canonicaliseEmail, sameEmail } from "../lib/email-identity";
import { dispatchWebhooks } from "./webhook.service";
import { getRedis } from "../lib/redis";
import { getAgentById } from "./agent.service";
import { sendQueryEmail } from "./query-email.service";
import { checkPayload, type Subject, type Risk } from "../admission/decidability";
import { mintQueryGrant } from "./query-grant.service";
import { shouldMintGrant } from "../lib/query-grant-token";
import { findPriorDecision, elevateRisk } from "../admission/history";
import { validateAnswerAgainstSpace, type AnswerSpace, type Answer } from "../lib/answer-space";
import type { CreateQueryInput, RespondQueryInput, PatchQueryInput, Change } from "../validators/query.validators";

export async function createQuery(agentId: string, input: CreateQueryInput) {
  const db = getDb();

  // Canonicalised once and reused for every row that persists this address.
  // `findPriorDecision` searches by a lowercased, trimmed email — if the
  // stored address kept its original casing, a second question about the
  // same subject from an agent that capitalised it differently would find no
  // prior decision, silently bypassing the very rule this exists to enforce.
  // `invitedHumanEmail` must be canonicalised the same way: `processEmailReply`
  // joins it against `humanQueries.humanEmail`, and normalising only one side
  // would break that join for any mixed-case address instead of just moving
  // the bug.
  const targetEmail = canonicaliseEmail(input.target_human_email);

  // Admission runs before the transaction opens: a query that a human could not
  // decide never becomes a row, a conversation, an invitation or an email.
  //
  // History first: it decides both the effective risk and whether a delta is
  // owed, and the payload rules are judged at the ELEVATED risk, not the
  // declared one.
  const prior = await findPriorDecision(agentId, targetEmail, input.subject.id);
  const risk = elevateRisk(input.risk, {
    hasPriorDecision: prior !== null,
    answerSpace: input.answer_space,
  });

  // No `risk !== "low"` here: a prior decision elevates to at least `medium`
  // on its own, so that conjunction was always true whenever `prior` was set.
  // The spec used to describe a `low`-risk branch where the delta was merely
  // shown rather than demanded; the code could never reach it, and the spec
  // has been corrected to say what this does.
  if (prior && (!input.changes || input.changes.length === 0)) {
    throw new UndecidableQueryError(
      "prior_decision_without_delta",
      `This person decided about '${input.subject.id}' on ${prior.decidedAt.toISOString().slice(0, 10)}.`,
      "Send `changes` with what has changed since then.",
      prior.id,
    );
  }

  const verdict = checkPayload({
    risk,
    subject: input.subject,
    self_contained: input.self_contained,
    answer_space: input.answer_space,
  });
  if (!verdict.admit) {
    throw new UndecidableQueryError(verdict.reason, verdict.detail, verdict.remedy);
  }

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
        invitedHumanEmail: targetEmail,
        token,
        message: input.question,
        language: input.language ?? "en",
        expiresAt: invitationExpiresAt,
      })
      .returning();

    // 4. Try auto-accept if the human trusts this agent
    let humanId: string | null = null;
    let status: "pending" | "assigned" = "pending";

    const [human] = await tx
      .select()
      .from(humans)
      .where(eq(humans.email, targetEmail))
      .limit(1);

    if (human) {
      // Check for prior accepted invitation (trust)
      const [priorAccepted] = await tx
        .select()
        .from(invitations)
        .where(
          and(
            eq(invitations.invitedByAgentId, agentId),
            eq(invitations.invitedHumanEmail, targetEmail),
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
          console.log(`[QUERY] Auto-accepted: ${targetEmail} trusts agent ${agentId}`);
        } else {
          console.log(`[QUERY] Trust revoked: ${targetEmail} revoked agent ${agentId}`);
        }
      } else {
        console.log(`[QUERY] No prior trust: ${targetEmail} has no accepted invitations from agent ${agentId}`);
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
        humanEmail: targetEmail,
        humanId,
        conversationId: conversation.id,
        queryMessageId: queryMessage.id,
        queryType: input.query_type,
        status,
        question: input.question,
        context: input.context,
        risk,
        subject: input.subject,
        selfContained: input.self_contained,
        changes: input.changes,
        answerSpace: input.answer_space,
        confidence: input.confidence,
        language: input.language ?? "en",
        timeoutMinutes: input.timeout_minutes,
        expiresAt,
        metadata: input.metadata || {},
      })
      .returning();

    // Update the query message structuredData with queryId
    const [withQueryId] = await tx
      .update(messages)
      .set({
        structuredData: {
          ...queryMessage.structuredData as Record<string, unknown>,
          queryId: query.id,
        },
      })
      .where(eq(messages.id, queryMessage.id))
      .returning();

    // The updated row, not the inserted one: publishing `queryMessage` would
    // broadcast the version from before queryId was added to it.
    // The link that answers this question in one click. Minted inside the
    // transaction so a rolled-back query never leaves a live grant behind.
    // High and critical risk mint nothing: those still cost a sign-in.
    const grantToken = shouldMintGrant(risk)
      ? await mintQueryGrant(query.id, targetEmail, expiresAt, tx)
      : undefined;

    return { conversation, query, token, status, humanId, expiresAt, queryMessage: withQueryId, grantToken };
  });

  const { conversation, query, token, status, expiresAt, queryMessage, grantToken } = result;

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
      subject: input.subject,
      changes: input.changes,
      targetEmail,
      expiresAt,
      invitationToken: token,
      conversationId: conversation.id,
      grantToken,
    });
    console.log(`[QUERY] Query email sent to ${targetEmail}`);
  } catch (emailErr) {
    console.error(`[QUERY] Email FAILED for ${targetEmail}:`, emailErr);
  }

  console.log(`[QUERY] Created ${query.id} for ${targetEmail} (status: ${status}, type: ${input.query_type}, agent: ${agentId})`);

  // The other half of the same omission: a human already looking at this
  // conversation should see the question arrive, not find it on reload.
  await publishMessage(conversation.id, queryMessage);

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

  if (query.status === "answered") throw new ForbiddenError("Query has already been answered");
  if (query.status === "expired") throw new ForbiddenError("Query has expired");
  if (query.status === "cancelled") throw new ForbiddenError("Query was cancelled by the agent");

  // Entitlement. For every status but `pending` there is already a
  // participant row — added when the invitation was accepted — and that row
  // is what stops a stranger from answering. A `pending` query has no
  // participant yet: nobody has accepted anything. The only thing that can
  // stand in for that row is the same check the email path already makes in
  // `processEmailReply` — the authenticated human's own address must be the
  // address the query was addressed to. Falling through to "no participant,
  // so refuse" here would leave the very first query from any agent
  // unanswerable, which is the bug this block exists to close; weakening it
  // to "any authenticated human may answer a pending query" would instead
  // open a hole where anyone could resolve someone else's invitation. So a
  // `pending` query is answerable by exactly the human it was sent to, and
  // by nobody else.
  const isPending = query.status === "pending";
  if (isPending) {
    const [human] = await db.select().from(humans).where(eq(humans.id, humanId)).limit(1);
    if (!sameEmail(human?.email, query.humanEmail)) {
      throw new ForbiddenError("You are not the person this query was addressed to");
    }
  } else {
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
  }

  // Answering a `pending` query is also how it gets accepted — there is no
  // separate accept step (docs/architecture.md), and `processEmailReply`
  // already does exactly this for the email path. Mirrored here: accept the
  // invitation and add the participant in the same transaction as the
  // response, so a crash between the two never leaves an answered query
  // with no participant row, or an accepted invitation with no answer.
  async function acceptPendingInvitation(tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) {
    const [invitation] = await tx
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.conversationId, query.conversationId),
          eq(invitations.invitedHumanEmail, query.humanEmail),
          eq(invitations.status, "pending"),
        ),
      )
      .limit(1);

    if (invitation) {
      await tx
        .update(invitations)
        .set({ status: "accepted", updatedAt: new Date() })
        .where(eq(invitations.id, invitation.id));
    }

    // No unique constraint exists on (conversation_id, human_id) — recorded
    // as a data-model gap for the final review, not fixed here (a schema
    // change on the last day of this plan, against a database that may
    // already hold duplicates, is a bad trade). Until it exists,
    // .onConflictDoNothing() has nothing to conflict against and is a
    // silent no-op, so a duplicate participant row is prevented here
    // explicitly instead — check-then-insert inside this same transaction.
    const [existingParticipant] = await tx
      .select({ id: conversationParticipants.id })
      .from(conversationParticipants)
      .where(
        and(
          eq(conversationParticipants.conversationId, query.conversationId),
          eq(conversationParticipants.humanId, humanId),
        ),
      )
      .limit(1);

    if (!existingParticipant) {
      await tx.insert(conversationParticipants).values({
        conversationId: query.conversationId,
        actorType: "human",
        humanId,
        role: "participant",
      });
    }
  }

  if (input.outcome === "insufficient_context") {
    // The turn goes back to the agent. The clock freezes because it is now the
    // agent's move: without this a query dies while the agent is fixing it, and
    // the human watches something expire that they themselves asked to clarify.
    //
    // The guard above and this WHERE must agree on which statuses are live:
    // `isPending` decided which one applied there, so it decides which one
    // applies here too, rather than the two drifting apart.
    const fromStatuses: (typeof humanQueries.$inferSelect)["status"][] = isPending ? ["pending"] : ["assigned"];
    const [updated] = await db.transaction(async (tx) => {
      if (isPending) await acceptPendingInvitation(tx);

      return tx
        .update(humanQueries)
        .set({
          status: "needs_context",
          insufficientReason: input.reason,
          clarificationRounds: query.clarificationRounds + 1,
          pausedAt: new Date(),
          humanId,
          updatedAt: new Date(),
        })
        .where(and(eq(humanQueries.id, queryId), inArray(humanQueries.status, fromStatuses)))
        .returning();
    });

    if (!updated) throw new ConflictError("Query is no longer awaiting an answer");

    dispatchWebhooks(query.agentId, "query.needs_context", {
      query_id: query.id,
      status: "needs_context",
      reason: input.reason,
      note: input.note,
    }).catch((err) => console.error(`[QUERY] Webhook dispatch failed for ${queryId}:`, err));

    return shapeHumanQuery(updated);
  }

  // From here, outcome === "answer".
  const space = query.answerSpace as unknown as AnswerSpace;
  const fit = validateAnswerAgainstSpace(space, input.answer);
  if (!fit.ok) {
    throw new ValidationError(`Answer does not fit this query: ${fit.problem}`);
  }

  const responseTimeMs = Date.now() - query.createdAt.getTime();

  // Same agreement as above: the statuses this update accepts from must
  // match exactly what the guard above already verified.
  const fromStatuses: (typeof humanQueries.$inferSelect)["status"][] = isPending ? ["pending"] : ["assigned", "needs_context"];

  let published: typeof messages.$inferSelect | undefined;

  const [updated] = await db.transaction(async (tx) => {
    if (isPending) await acceptPendingInvitation(tx);

    // Send response message
    const [responseMessage] = await tx
      .insert(messages)
      .values({
        conversationId: query.conversationId,
        senderType: "human",
        senderHumanId: humanId,
        type: "human_query_response",
        content: summariseAnswer(space, input.answer),
        structuredData: {
          queryId: query.id,
          answer: input.answer,
          comment: input.comment,
          confidence: input.confidence,
        },
      })
      .returning();

    published = responseMessage;

    // Update query with optimistic lock — only update if still awaiting an answer
    return tx
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
      .where(and(eq(humanQueries.id, queryId), inArray(humanQueries.status, fromStatuses)))
      .returning();
  });

  if (!updated) {
    throw new ConflictError("Query was already answered or its status changed");
  }

  // After the commit, never inside it: a subscriber that reacts by reading the
  // row must find it there.
  if (published) await publishMessage(query.conversationId, published);

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

  return shapeHumanQuery(updated);
}

const MAX_CLARIFICATION_ROUNDS = 2;

const STATUS_HINTS: Record<string, string> = {
  pending: "The human has been invited but hasn't accepted the invitation yet. They need to open the link in their email and answer in the app — answering automatically accepts the invitation. Keep polling — wait 10-30 seconds before checking again.",
  assigned: "The human has accepted the invitation and can see your query, but hasn't submitted their answer yet. Keep polling — wait 10-30 seconds before checking again.",
  answered: "The human has responded. Their answer is in the 'answer' field below. No further polling needed.",
  needs_context: "The human could not decide with what you gave them. Read `insufficient_reason`, then clarify the query with what is missing. The clock is paused while you do.",
  cancelled: "You withdrew this query. Create a new one if you still need an answer.",
  expired: "The query has expired without a response. The human did not answer in time. You may create a new query if needed.",
};

/**
 * The one canonical shape every surface hands back for a query — REST routes
 * and MCP tools alike. Both call into this service and return whatever it
 * returns, so shaping happens here once rather than at each caller: a Drizzle
 * row is camelCase, carries `id` instead of `query_id`, and exposes columns
 * (`agentId`, `humanId`, `conversationId`, `queryMessageId`,
 * `responseMessageId`) no agent-facing response should leak.
 *
 * `status` is a separate parameter rather than always `query.status` because
 * `getQuery` computes it lazily (a row can be stale by the time it's read).
 */
function shapeQuery(query: typeof humanQueries.$inferSelect, status: string = query.status) {
  return {
    query_id: query.id,
    status,
    status_description: STATUS_HINTS[status] || `Unknown status: ${status}`,
    query_type: query.queryType,
    question: query.question,
    context: query.context,
    confidence: query.confidence,
    language: query.language,
    answer: status === "answered" ? query.answer : null,
    comment: status === "answered" ? query.answerComment : null,
    human_confidence: status === "answered" ? query.answerConfidence : null,
    response_time_ms: status === "answered" ? query.responseTimeMs : null,
    // The needs_context hint tells the agent to read this field, so it has to
    // actually be here — a status row on its own doesn't say what the human
    // was missing.
    insufficient_reason: status === "needs_context" ? query.insufficientReason : null,
    created_at: query.createdAt.toISOString(),
    expires_at: query.expiresAt.toISOString(),
  };
}

/**
 * What the human sees, as opposed to what the agent sees in `shapeQuery`
 * above: it carries `subject`, `changes`, `risk` and `answer_space` because
 * the human is the one who has to decide, and it never repeats fields (like
 * agent/conversation ids) the human's side has no use for.
 *
 * All the jsonb columns — `subject`, `changes`, `answerSpace` — are stored as
 * exactly the snake_case shape the agent sent, so they pass through unchanged
 * rather than needing a case conversion here.
 */
async function shapeHumanQuery(
  query: typeof humanQueries.$inferSelect,
  opts: { includePriorDecision?: boolean } = {},
) {
  const status = query.status;

  // "You decided about this on …" only makes sense before the human answers
  // again — once this row is itself the answered one, it would find itself.
  let priorDecisionAt: string | null = null;
  if (opts.includePriorDecision) {
    const subject = query.subject as unknown as Subject;
    const prior = await findPriorDecision(query.agentId, query.humanEmail, subject.id);
    if (prior && prior.id !== query.id) priorDecisionAt = prior.decidedAt.toISOString();
  }

  return {
    query_id: query.id,
    // The human is a participant in this conversation, so unlike shapeQuery
    // above this is not an internal id — it is the handle their own client
    // uses to reach the conversation's messages and files. It was originally
    // here so the renderer could fetch a subject attachment; attachments are
    // out of scope now (see the design spec) and the renderer no longer takes
    // it, but the conversation is still the human's, so it stays.
    conversation_id: query.conversationId,
    // Which message in that conversation IS this query. The chat is the only
    // place a human answers, so its renderer has to find the query among the
    // messages, and the link lived only in the database. Matching on
    // conversation_id alone happens to work while createQuery opens one
    // conversation per query — an invariant nobody promised, and one that
    // multi-human queries would break without a sound.
    query_message_id: query.queryMessageId,
    status,
    status_description: STATUS_HINTS[status] || `Unknown status: ${status}`,
    query_type: query.queryType,
    question: query.question,
    context: query.context,
    confidence: query.confidence,
    subject: query.subject as unknown as Subject,
    self_contained: query.selfContained,
    changes: query.changes as unknown as Change[] | null,
    risk: query.risk as Risk,
    answer_space: query.answerSpace as unknown as AnswerSpace,
    language: query.language,
    insufficient_reason: status === "needs_context" ? query.insufficientReason : null,
    answer: status === "answered" ? (query.answer as unknown as Answer | null) : null,
    comment: status === "answered" ? query.answerComment : null,
    human_confidence: status === "answered" ? query.answerConfidence : null,
    response_time_ms: status === "answered" ? query.responseTimeMs : null,
    prior_decision_at: priorDecisionAt,
    created_at: query.createdAt.toISOString(),
    expires_at: query.expiresAt.toISOString(),
  };
}

/**
 * The agent supplying what the human said was missing. Only valid from
 * needs_context, and it goes through admission exactly like a creation does.
 */
export async function updateQuery(queryId: string, agentId: string, input: PatchQueryInput) {
  const db = getDb();

  const [query] = await db
    .select()
    .from(humanQueries)
    .where(and(eq(humanQueries.id, queryId), eq(humanQueries.agentId, agentId)))
    .limit(1);

  if (!query) throw new NotFoundError("Query", queryId);
  if (query.status !== "needs_context") {
    throw new ConflictError(`Query is ${query.status}, so there is nothing to clarify`);
  }

  if (query.clarificationRounds >= MAX_CLARIFICATION_ROUNDS) {
    // Unfreeze on the way out. The clock only pauses while the agent can still
    // act; leaving it paused here would freeze the query for ever.
    //
    // Guarded on the status, exactly like the successful branch below: the
    // human may have answered, or the agent cancelled, between the SELECT
    // above and this write, and neither should be dragged back to unpaused.
    await db.update(humanQueries)
      .set({ pausedAt: null, updatedAt: new Date() })
      .where(and(eq(humanQueries.id, queryId), eq(humanQueries.status, "needs_context")));

    throw new UndecidableQueryError(
      "clarification_rounds_exhausted",
      `This query has already been clarified ${MAX_CLARIFICATION_ROUNDS} times.`,
      "Create a new query instead of clarifying this one again.",
    );
  }

  const subject = (input.subject ?? query.subject) as Subject;
  const answerSpace = (input.answer_space ?? query.answerSpace) as unknown as AnswerSpace;

  // Re-run elevation on the patched payload, and persist the result.
  //
  // A PATCH is exempt from prior-decision DETECTION - demanding a delta from a
  // query that is being clarified would be circular, since the human asked for
  // the clarification. That exemption was applied as "the PATCH skips history
  // altogether", which let the monetary half of elevation be laundered away: a
  // cheap `low` query, a request for context, then a PATCH swapping
  // `answer_space` for {kind:"scalar", unit:"EUR", max:50000}. The risk stayed
  // `low`, so no consequences, no hash and no held referent were required.
  //
  // Elevation from an amount needs no history at all, so it is recomputed here
  // from the payload as patched. `hasPriorDecision` carries the floor the row
  // already holds rather than a fresh lookup: `atLeast` never lowers, so a
  // query that was elevated to `medium` on creation stays there.
  const storedRisk = query.risk as Risk;
  const risk = elevateRisk(storedRisk, {
    hasPriorDecision: false,
    answerSpace,
  });

  const verdict = checkPayload({
    risk,
    subject,
    self_contained: query.selfContained,
    answer_space: answerSpace,
  });
  if (!verdict.admit) {
    throw new UndecidableQueryError(verdict.reason, verdict.detail, verdict.remedy);
  }

  // Give back the time the agent spent holding the turn.
  const pausedMs = query.pausedAt ? Date.now() - query.pausedAt.getTime() : 0;

  const [updated] = await db
    .update(humanQueries)
    .set({
      status: "assigned",
      subject,
      risk,
      answerSpace,
      changes: input.changes ?? query.changes,
      question: input.question ?? query.question,
      context: input.context ?? query.context,
      expiresAt: new Date(query.expiresAt.getTime() + pausedMs),
      pausedAt: null,
      insufficientReason: null,
      updatedAt: new Date(),
    })
    .where(and(eq(humanQueries.id, queryId), eq(humanQueries.status, "needs_context")))
    .returning();

  if (!updated) throw new ConflictError("Query changed while it was being clarified");

  console.log(`[QUERY] Clarified ${queryId} (round ${query.clarificationRounds})`);
  return shapeQuery(updated);
}

/**
 * The agent withdrawing a question whose context has moved on.
 *
 * A conditional update, so an answer that landed first always wins: losing a
 * person's decision to a race is exactly what cannot happen in a system whose
 * value is the record.
 */
export async function cancelQuery(queryId: string, agentId: string) {
  const db = getDb();

  const [updated] = await db
    .update(humanQueries)
    .set({ status: "cancelled", pausedAt: null, updatedAt: new Date() })
    .where(and(
      eq(humanQueries.id, queryId),
      eq(humanQueries.agentId, agentId),
      inArray(humanQueries.status, ["pending", "assigned", "needs_context"]),
    ))
    .returning();

  if (updated) {
    console.log(`[QUERY] Cancelled ${queryId} by agent ${agentId}`);
    return shapeQuery(updated);
  }

  // Nothing changed: either it is not ours, or it already reached a terminal state.
  const [current] = await db
    .select()
    .from(humanQueries)
    .where(and(eq(humanQueries.id, queryId), eq(humanQueries.agentId, agentId)))
    .limit(1);

  if (!current) throw new NotFoundError("Query", queryId);
  throw new ConflictError(`Query is already ${current.status} and cannot be cancelled`);
}

export async function getQuery(queryId: string, agentId: string) {
  const db = getDb();

  const [query] = await db
    .select()
    .from(humanQueries)
    .where(and(eq(humanQueries.id, queryId), eq(humanQueries.agentId, agentId)))
    .limit(1);

  if (!query) throw new NotFoundError("Query", queryId);

  // Lazy expire check. Guarded on the status we read, so an answer that
  // landed between the SELECT and this UPDATE is not overwritten with
  // `expired` — losing a person's decision to a race is the one thing this
  // system may not do.
  let effectiveStatus = query.status;
  if (isExpirable(query) && new Date() > query.expiresAt) {
    const [expired] = await db
      .update(humanQueries)
      .set({ status: "expired", updatedAt: new Date() })
      .where(and(eq(humanQueries.id, queryId), eq(humanQueries.status, query.status)))
      .returning({ id: humanQueries.id });

    if (expired) {
      effectiveStatus = "expired";
      console.log(`[QUERY] Expired: ${queryId} (was ${query.status})`);
    }
  }

  return shapeQuery(query, effectiveStatus);
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

/**
 * Announce a message on its conversation's channel, the way every other
 * message-writing path already does.
 *
 * The two messages this service writes — the question and the answer — were
 * the only ones nobody published. That was survivable while a query lived on
 * a page of its own; now the conversation is where a query is asked and
 * answered, and a chat that never hears about them shows a question whose
 * answer only appears on reload.
 *
 * Publishing is best effort and deliberately never rethrows: the answer is
 * already committed, and failing to gossip about it must not fail the call
 * that recorded it.
 */
async function publishMessage(conversationId: string, message: unknown) {
  try {
    await getRedis().publish(
      `conversation:${conversationId}`,
      JSON.stringify({ type: "message.new", data: message }),
    );
  } catch (err) {
    console.error(`[QUERY] Failed to publish message on ${conversationId}:`, err);
  }
}

/**
 * Whether an open query on this conversation was addressed to this human.
 *
 * A query is answered in its own conversation now, so the chat has to be
 * readable before anything has been accepted — and `pending` is exactly the
 * state where nobody has. `listHumanQueries` already grants visibility of such
 * a query by the address it was sent to rather than by a participant row, "by
 * the same entitlement respondQuery uses"; this is that entitlement reaching
 * the conversation that holds it. Without it the query is listed and then
 * leads to a 403, and a first-time human cannot answer at all.
 *
 * It grants reading, not membership: sending messages and downloading files
 * still require a participant row, which answering creates.
 */
export async function isOpenQueryTarget(conversationId: string, humanId: string): Promise<boolean> {
  const db = getDb();

  const [human] = await db.select().from(humans).where(eq(humans.id, humanId)).limit(1);
  if (!human) return false;

  const [row] = await db
    .select({ id: humanQueries.id })
    .from(humanQueries)
    .where(
      and(
        eq(humanQueries.conversationId, conversationId),
        eq(humanQueries.humanEmail, canonicaliseEmail(human.email)),
        inArray(humanQueries.status, ["pending", "assigned", "needs_context"]),
      ),
    )
    .limit(1);

  return !!row;
}

export async function listHumanQueries(humanId: string) {
  const db = getDb();

  // Find queries where this human is a participant via conversation
  const participantRows = await db
    .select({ conversationId: conversationParticipants.conversationId })
    .from(conversationParticipants)
    .where(eq(conversationParticipants.humanId, humanId));

  const conversationIds = participantRows.map((r) => r.conversationId);

  // A pending query has no participant row yet — nobody has accepted it.
  // Without this branch it is invisible here even though respondQuery
  // (correctly) lets this same human answer it, which is no visibility at
  // all: the real UI only ever calls this list. Visible by the same
  // entitlement respondQuery uses — the query's own target address, not a
  // participant row.
  const [human] = await db.select().from(humans).where(eq(humans.id, humanId)).limit(1);

  const visibility = [];
  if (conversationIds.length > 0) {
    visibility.push(inArray(humanQueries.conversationId, conversationIds));
  }
  if (human) {
    visibility.push(
      and(
        eq(humanQueries.status, "pending"),
        eq(humanQueries.humanEmail, canonicaliseEmail(human.email)),
      ),
    );
  }
  if (visibility.length === 0) return [];

  // `needs_context` is fetched but never shown: the turn is the agent's, so
  // the human has nothing to do with it. It is here only so this sweep can
  // expire an abandoned one — see EXPIRABLE_STATUSES. Without that, the only
  // sweep that runs on the human's side skipped it and it never died.
  const rows = await db
    .select()
    .from(humanQueries)
    .where(
      and(
        inArray(humanQueries.status, [...EXPIRABLE_STATUSES]),
        or(...visibility),
      ),
    )
    .orderBy(desc(humanQueries.createdAt));

  // Batch expire in a single UPDATE instead of N individual queries. Guarded
  // on the statuses we read, so a row that moved on in the meantime is left
  // alone rather than stomped.
  const now = new Date();
  const expiredIds = rows.filter((q) => isExpirable(q) && now > q.expiresAt).map((q) => q.id);

  if (expiredIds.length > 0) {
    await db
      .update(humanQueries)
      .set({ status: "expired", updatedAt: now })
      .where(and(
        inArray(humanQueries.id, expiredIds),
        inArray(humanQueries.status, [...EXPIRABLE_STATUSES]),
      ));
    console.log(`[QUERY] Batch expired ${expiredIds.length} queries`);
  }

  const visible = rows.filter(
    (q) => now <= q.expiresAt && (q.status === "pending" || q.status === "assigned"),
  );
  return Promise.all(visible.map((q) => shapeHumanQuery(q, { includePriorDecision: true })));
}

/**
 * The query as the holder of a grant may see it. There is no entitlement check
 * here because the grant IS the entitlement — the middleware already proved the
 * caller holds a token minted for this query. Deliberately without the prior
 * decision: the link shows the question, not a history.
 */
export async function getQueryForGrant(queryId: string) {
  const db = getDb();

  const [query] = await db
    .select()
    .from(humanQueries)
    .where(eq(humanQueries.id, queryId))
    .limit(1);

  if (!query) throw new NotFoundError("Query", queryId);

  // Who is asking. Somebody reaching this page followed a link out of an email
  // and has no other context: without a name, they are being asked to decide
  // for a stranger. The agent's public identity only — nothing about its keys,
  // its owner or its other conversations.
  const [agent] = await db
    .select({
      slug: agents.slug,
      displayName: agents.displayName,
      avatarUrl: agents.avatarUrl,
    })
    .from(agents)
    .where(eq(agents.id, query.agentId))
    .limit(1);

  return {
    ...(await shapeHumanQuery(query, { includePriorDecision: false })),
    agent: agent
      ? { slug: agent.slug, display_name: agent.displayName, avatar_url: agent.avatarUrl }
      : null,
  };
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

  if (!participant) {
    // No participant row yet — only visible if this is a pending query
    // addressed to exactly this human, the same entitlement respondQuery
    // uses. Anything else (wrong human, or a status a participant row
    // would otherwise gate) stays a 404 rather than leaking existence.
    if (query.status !== "pending") throw new NotFoundError("Query", queryId);

    const [human] = await db.select().from(humans).where(eq(humans.id, humanId)).limit(1);
    if (!sameEmail(human?.email, query.humanEmail)) {
      throw new NotFoundError("Query", queryId);
    }
  }

  return shapeHumanQuery(query, { includePriorDecision: true });
}

/**
 * Which statuses a sweep may expire.
 *
 * `needs_context` belongs here. The spec is explicit that the pause only
 * applies while the agent can still act — with the clarification rounds
 * exhausted, "the pause is not applied and the query expires normally" — and
 * without this a query whose PATCH ran out, or that the agent simply
 * abandoned, sat in `needs_context` for ever with an `expires_at` in the past
 * that nothing would ever act on.
 *
 * A *paused* `needs_context` query is deliberately excluded: the clock is
 * frozen while the turn is genuinely the agent's, which is the whole point of
 * `paused_at`.
 */
const EXPIRABLE_STATUSES = ["pending", "assigned", "needs_context"] as const;

function isExpirable(query: Pick<typeof humanQueries.$inferSelect, "status" | "pausedAt">): boolean {
  if (query.status === "pending" || query.status === "assigned") return true;
  return query.status === "needs_context" && query.pausedAt === null;
}

/** A one-line rendering of a typed answer, for the conversation transcript. */
function summariseAnswer(space: AnswerSpace, answer: Answer): string {
  switch (answer.kind) {
    case "boolean":
      return space.kind === "boolean"
        ? (answer.value ? space.labels.t : space.labels.f)
        : String(answer.value);
    case "choice": {
      if (space.kind !== "choice") return answer.option_ids.join(", ");
      const byId = new Map(space.options.map((o) => [o.id, o.label]));
      return answer.option_ids.map((id) => byId.get(id) ?? id).join(", ");
    }
    case "scalar":
      return space.kind === "scalar" ? `${answer.value} ${space.unit}` : String(answer.value);
    case "date":
      return answer.value;
    case "text":
      return answer.value;
    case "fields":
      return Object.entries(answer.values).map(([k, v]) => `${k}: ${v}`).join("; ");
  }
}
