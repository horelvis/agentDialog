import { eq, and, desc, or, isNull } from "drizzle-orm";
import { getDb } from "../db";
import { conversations } from "../db/schema/conversations";
import { conversationParticipants } from "../db/schema/participants";
import { agents } from "../db/schema/agents";
import { humans } from "../db/schema/humans";
import { NotFoundError, ForbiddenError } from "../lib/errors";
import type { CreateConversationInput, UpdateConversationInput } from "../validators/conversation.validators";

export async function createConversation(agentId: string, input: CreateConversationInput) {
  const db = getDb();

  const [conversation] = await db
    .insert(conversations)
    .values({
      createdByAgentId: agentId,
      title: input.title,
      description: input.description,
      context: input.context || {},
      intentType: input.intentType,
      settings: input.settings || {},
    })
    .returning();

  // Add the creating agent as owner participant
  await db.insert(conversationParticipants).values({
    conversationId: conversation.id,
    actorType: "agent",
    agentId,
    role: "owner",
  });

  return conversation;
}

export async function getConversation(conversationId: string) {
  const db = getDb();
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);
  if (!conversation) throw new NotFoundError("Conversation", conversationId);
  return conversation;
}

export async function getConversationWithParticipants(conversationId: string) {
  const db = getDb();
  const conversation = await getConversation(conversationId);

  const participants = await db
    .select()
    .from(conversationParticipants)
    .where(
      and(
        eq(conversationParticipants.conversationId, conversationId),
        isNull(conversationParticipants.leftAt),
      ),
    );

  // Resolve names
  const participantInfos = await Promise.all(
    participants.map(async (p) => {
      let displayName = "Unknown";
      if (p.actorType === "agent" && p.agentId) {
        const [agent] = await db.select({ displayName: agents.displayName }).from(agents).where(eq(agents.id, p.agentId)).limit(1);
        if (agent) displayName = agent.displayName;
      } else if (p.actorType === "human" && p.humanId) {
        const [human] = await db.select({ displayName: humans.displayName, email: humans.email }).from(humans).where(eq(humans.id, p.humanId)).limit(1);
        if (human) displayName = human.displayName || human.email;
      }
      return {
        actorType: p.actorType,
        agentId: p.agentId,
        humanId: p.humanId,
        displayName,
        role: p.role,
        joinedAt: p.joinedAt.toISOString(),
      };
    }),
  );

  return { ...conversation, participants: participantInfos };
}

export async function listAgentConversations(agentId: string, limit: number, cursor?: string) {
  const db = getDb();
  const participantRows = await db
    .select({ conversationId: conversationParticipants.conversationId })
    .from(conversationParticipants)
    .where(
      and(
        eq(conversationParticipants.agentId, agentId),
        isNull(conversationParticipants.leftAt),
      ),
    );

  const conversationIds = participantRows.map((r) => r.conversationId);
  if (conversationIds.length === 0) return { data: [], hasMore: false };

  const { inArray } = await import("drizzle-orm");
  let query = db
    .select()
    .from(conversations)
    .where(inArray(conversations.id, conversationIds))
    .orderBy(desc(conversations.updatedAt))
    .limit(limit + 1);

  const results = await query;
  const hasMore = results.length > limit;
  if (hasMore) results.pop();

  return { data: results, hasMore };
}

export async function listHumanConversations(humanId: string, limit: number, cursor?: string) {
  const db = getDb();
  const participantRows = await db
    .select({ conversationId: conversationParticipants.conversationId })
    .from(conversationParticipants)
    .where(
      and(
        eq(conversationParticipants.humanId, humanId),
        isNull(conversationParticipants.leftAt),
      ),
    );

  const conversationIds = participantRows.map((r) => r.conversationId);
  if (conversationIds.length === 0) return { data: [], hasMore: false };

  const { inArray } = await import("drizzle-orm");
  const results = await db
    .select()
    .from(conversations)
    .where(inArray(conversations.id, conversationIds))
    .orderBy(desc(conversations.updatedAt))
    .limit(limit + 1);

  const hasMore = results.length > limit;
  if (hasMore) results.pop();

  return { data: results, hasMore };
}

export async function updateConversation(conversationId: string, agentId: string, input: UpdateConversationInput) {
  const db = getDb();

  // Verify the agent owns this conversation
  const [participant] = await db
    .select()
    .from(conversationParticipants)
    .where(
      and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.agentId, agentId),
        eq(conversationParticipants.role, "owner"),
      ),
    )
    .limit(1);

  if (!participant) {
    throw new ForbiddenError("Only the owner agent can update this conversation");
  }

  const [updated] = await db
    .update(conversations)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(conversations.id, conversationId))
    .returning();

  if (!updated) throw new NotFoundError("Conversation", conversationId);
  return updated;
}

export async function isParticipant(
  conversationId: string,
  actorType: "agent" | "human",
  actorId: string,
): Promise<boolean> {
  const db = getDb();
  const condition =
    actorType === "agent"
      ? and(
          eq(conversationParticipants.conversationId, conversationId),
          eq(conversationParticipants.agentId, actorId),
          isNull(conversationParticipants.leftAt),
        )
      : and(
          eq(conversationParticipants.conversationId, conversationId),
          eq(conversationParticipants.humanId, actorId),
          isNull(conversationParticipants.leftAt),
        );

  const [row] = await db.select({ id: conversationParticipants.id }).from(conversationParticipants).where(condition).limit(1);
  return !!row;
}
