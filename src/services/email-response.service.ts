import { eq, and } from "drizzle-orm";
import { getDb } from "../db";
import { humanQueries } from "../db/schema/human-queries";
import { humans } from "../db/schema/humans";
import { invitations } from "../db/schema/invitations";
import { conversationParticipants } from "../db/schema/participants";
import { stripReplyQuotes } from "../lib/email-parser";
import { canonicaliseEmail, sameEmail } from "../lib/email-identity";
import { respondQuery } from "./query.service";
import { sendEmail } from "../lib/email";
import { env } from "../env";
import { getAgentById } from "./agent.service";

interface ProcessEmailReplyInput {
  queryId: string;
  senderEmail: string;
  replyText: string;
}

type ProcessEmailReplyResult =
  | { success: true; query_id: string }
  | { already_answered: true }
  | { expired: true }
  | { empty_reply: true }
  | { sender_mismatch: true }
  | { not_found: true }
  /** The query wants a typed answer no mail client can produce. */
  | { answer_space_not_text: true; kind: string };

export async function processEmailReply(
  input: ProcessEmailReplyInput,
): Promise<ProcessEmailReplyResult> {
  const db = getDb();

  // 1. Lookup query
  const [query] = await db
    .select()
    .from(humanQueries)
    .where(eq(humanQueries.id, input.queryId))
    .limit(1);

  if (!query) {
    console.warn(`[EMAIL-REPLY] Query not found: ${input.queryId}`);
    return { not_found: true };
  }

  if (query.status === "answered") {
    console.log(`[EMAIL-REPLY] Query ${input.queryId} already answered`);
    return { already_answered: true };
  }

  if (query.status === "expired" || new Date() > query.expiresAt) {
    console.log(`[EMAIL-REPLY] Query ${input.queryId} expired`);
    return { expired: true };
  }

  // 2. Verify the sender is the person the question was addressed to.
  //
  // This used to warn and carry on, which meant anyone the query email had been
  // forwarded to could answer in the target's name — creating them as a human,
  // accepting the invitation on their behalf and recording the answer — with
  // nothing on the agent's side to tell the two apart.
  //
  // The mismatch is not reported to the caller in any more detail than this:
  // the target's address must not leak to whoever sent the message.
  const normalizedSender = canonicaliseEmail(input.senderEmail);
  if (!sameEmail(normalizedSender, query.humanEmail)) {
    console.warn(
      `[EMAIL-REPLY] Rejected reply to query ${input.queryId}: sender is not the target`,
    );
    return { sender_mismatch: true };
  }

  // 3. An email reply is always free text, and `validateAnswerAgainstSpace`
  //    refuses `{kind:"text"}` for every space but `text`. Decided HERE,
  //    before anything is written: this used to accept the invitation, insert
  //    the participant row and set the query to `assigned`, and only then call
  //    `respondQuery` and have it throw — leaving the 422 to escape the
  //    handler with every side effect already applied.
  const answerSpaceKind = (query.answerSpace as { kind?: string } | null)?.kind ?? "text";
  if (answerSpaceKind !== "text") {
    console.log(
      `[EMAIL-REPLY] Query ${input.queryId} wants a ${answerSpaceKind} answer; email cannot carry one`,
    );
    await sendAnswerInAppEmail(input.senderEmail, query.question, query.agentId).catch(
      (err) => console.error(`[EMAIL-REPLY] "answer in the app" email failed:`, err),
    );
    return { answer_space_not_text: true, kind: answerSpaceKind };
  }

  // 4. Find or create human
  let [human] = await db
    .select()
    .from(humans)
    .where(eq(humans.email, normalizedSender))
    .limit(1);

  if (!human) {
    [human] = await db
      .insert(humans)
      .values({
        email: normalizedSender,
        displayName: normalizedSender.split("@")[0],
      })
      .returning();
    console.log(`[EMAIL-REPLY] Created human: ${human.id} (${normalizedSender})`);
  }

  // 5. Auto-accept invitation if pending
  if (query.status === "pending") {
    await db.transaction(async (tx) => {
      // Accept invitation
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

      // Add as participant
      await tx
        .insert(conversationParticipants)
        .values({
          conversationId: query.conversationId,
          actorType: "human",
          humanId: human.id,
          role: "participant",
        })
        .onConflictDoNothing();

      // Update query status to assigned
      await tx
        .update(humanQueries)
        .set({
          status: "assigned",
          humanId: human.id,
          updatedAt: new Date(),
        })
        .where(eq(humanQueries.id, query.id));
    });
    console.log(`[EMAIL-REPLY] Auto-accepted invitation for query ${input.queryId}`);
  }

  // 6. Clean reply text
  const answer = stripReplyQuotes(input.replyText);
  if (!answer || answer.trim().length === 0) {
    console.warn(`[EMAIL-REPLY] Empty reply for query ${input.queryId}`);
    return { empty_reply: true };
  }

  // 7. Respond to query. Guaranteed to fit: a non-`text` answer space was
  // turned away above, before anything was written.
  await respondQuery(query.id, human.id, {
    outcome: "answer",
    answer: { kind: "text", value: answer.trim() },
    comment: "Responded via email reply",
  });

  console.log(
    `[EMAIL-REPLY] Query ${query.id} answered via email by ${normalizedSender}`,
  );

  // 8. Send confirmation email (fire-and-forget)
  sendConfirmationEmail(input.senderEmail, query.question, query.agentId).catch(
    (err) => console.error(`[EMAIL-REPLY] Confirmation email failed:`, err),
  );

  return { success: true, query_id: query.id };
}

/**
 * The reply we owe someone who answered a typed question by email. It is not
 * an error on their part — the mail simply cannot carry a choice or a scalar —
 * so it points them at the place that can.
 */
async function sendAnswerInAppEmail(
  toEmail: string,
  questionPreview: string,
  agentId: string,
): Promise<void> {
  const e = env();
  let agentName = "the agent";
  try {
    const agent = await getAgentById(agentId);
    agentName = agent.displayName;
  } catch {
    // Use default
  }

  const preview = questionPreview.length > 60
    ? questionPreview.slice(0, 57) + "..."
    : questionPreview;

  await sendEmail({
    to: toEmail,
    subject: `Re: [${e.APP_NAME}] ${preview}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="padding: 20px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px;">
          <div style="font-size: 15px; font-weight: 600; color: #92400e;">This one needs answering in the app</div>
          <div style="font-size: 13px; color: #78350f; margin-top: 6px;">
            ${agentName} asked for a specific kind of answer — a choice, a number, a date — and an email reply can't carry one.
            Open ${e.APP_NAME} and the question will be waiting for you, with the options laid out.
          </div>
        </div>
        <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 16px;">Your reply was not recorded.</p>
      </div>
    `,
    text: `${agentName} asked for a specific kind of answer — a choice, a number, a date — and an email reply can't carry one. Open ${e.APP_NAME} to answer; the question is waiting for you there. Your reply was not recorded.`,
  });
}

async function sendConfirmationEmail(
  toEmail: string,
  questionPreview: string,
  agentId: string,
): Promise<void> {
  const e = env();
  let agentName = "the agent";
  try {
    const agent = await getAgentById(agentId);
    agentName = agent.displayName;
  } catch {
    // Use default
  }

  const preview = questionPreview.length > 60
    ? questionPreview.slice(0, 57) + "..."
    : questionPreview;

  await sendEmail({
    to: toEmail,
    subject: `Re: [${e.APP_NAME}] ${preview}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="padding: 20px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; text-align: center;">
          <div style="font-size: 24px; margin-bottom: 8px;">&#10003;</div>
          <div style="font-size: 15px; font-weight: 600; color: #166534;">Your response has been received</div>
          <div style="font-size: 13px; color: #4ade80; margin-top: 4px;">and delivered to ${agentName}.</div>
        </div>
        <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 16px;">Thank you!</p>
      </div>
    `,
    text: `Your response has been received and delivered to ${agentName}. Thank you!`,
  });
}
