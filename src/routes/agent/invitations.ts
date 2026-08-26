import { Hono } from "hono";
import type { AppEnv } from "../../types/hono";
import {
  createInvitation,
  listConversationInvitations,
  revokeInvitation,
} from "../../services/invitation.service";
import { createInvitationSchema } from "../../validators/invitation.validators";
import { validateBody } from "../../middleware/validate";
import { idempotency } from "../../middleware/idempotency";
import { sendInvitationEmail } from "../../services/email.service";
import { getConversation } from "../../services/conversation.service";
import { isParticipant } from "../../services/conversation.service";
import { ForbiddenError } from "../../lib/errors";

const app = new Hono<AppEnv>();

app.post("/:id/invitations", idempotency(), validateBody(createInvitationSchema), async (c) => {
  const conversationId = c.req.param("id");
  const agentId = c.get("agentId");
  const agent = c.get("agent");
  const input = c.get("validatedBody");

  if (!(await isParticipant(conversationId, "agent", agentId))) {
    throw new ForbiddenError("Not a participant in this conversation");
  }

  const invitation = await createInvitation(conversationId, agentId, input);

  // Only send email if the invitation was NOT auto-accepted
  if (!invitation.autoAccepted) {
    const conversation = await getConversation(conversationId);
    await sendInvitationEmail(
      input.email,
      invitation.token,
      agent.displayName,
      conversation.title || undefined,
    );
  }

  return c.json({ data: invitation }, 201);
});

app.get("/:id/invitations", async (c) => {
  const conversationId = c.req.param("id");
  const agentId = c.get("agentId");

  if (!(await isParticipant(conversationId, "agent", agentId))) {
    throw new ForbiddenError("Not a participant in this conversation");
  }

  const invitationList = await listConversationInvitations(conversationId);
  return c.json({ data: invitationList });
});

app.delete("/invitations/:id", async (c) => {
  const invitationId = c.req.param("id");
  const agentId = c.get("agentId");
  const invitation = await revokeInvitation(invitationId, agentId);
  return c.json({ data: invitation });
});

export default app;
