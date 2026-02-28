import { relations } from "drizzle-orm";
import { agents } from "./schema/agents";
import { humans } from "./schema/humans";
import { conversations } from "./schema/conversations";
import { conversationParticipants } from "./schema/participants";
import { messages } from "./schema/messages";
import { fileAttachments } from "./schema/file-attachments";
import { invitations } from "./schema/invitations";
import { webhooks } from "./schema/webhooks";

export const agentsRelations = relations(agents, ({ many }) => ({
  conversations: many(conversations),
  participants: many(conversationParticipants),
  messages: many(messages),
  invitations: many(invitations),
  webhooks: many(webhooks),
}));

export const humansRelations = relations(humans, ({ many }) => ({
  participants: many(conversationParticipants),
  messages: many(messages),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  createdByAgent: one(agents, {
    fields: [conversations.createdByAgentId],
    references: [agents.id],
  }),
  participants: many(conversationParticipants),
  messages: many(messages),
  invitations: many(invitations),
}));

export const participantsRelations = relations(conversationParticipants, ({ one }) => ({
  conversation: one(conversations, {
    fields: [conversationParticipants.conversationId],
    references: [conversations.id],
  }),
  agent: one(agents, {
    fields: [conversationParticipants.agentId],
    references: [agents.id],
  }),
  human: one(humans, {
    fields: [conversationParticipants.humanId],
    references: [humans.id],
  }),
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  senderAgent: one(agents, {
    fields: [messages.senderAgentId],
    references: [agents.id],
  }),
  senderHuman: one(humans, {
    fields: [messages.senderHumanId],
    references: [humans.id],
  }),
  attachments: many(fileAttachments),
}));

export const fileAttachmentsRelations = relations(fileAttachments, ({ one }) => ({
  message: one(messages, {
    fields: [fileAttachments.messageId],
    references: [messages.id],
  }),
}));

export const invitationsRelations = relations(invitations, ({ one }) => ({
  conversation: one(conversations, {
    fields: [invitations.conversationId],
    references: [conversations.id],
  }),
  invitedByAgent: one(agents, {
    fields: [invitations.invitedByAgentId],
    references: [agents.id],
  }),
}));

export const webhooksRelations = relations(webhooks, ({ one }) => ({
  agent: one(agents, {
    fields: [webhooks.agentId],
    references: [agents.id],
  }),
}));
