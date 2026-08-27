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
import { documented } from "../../openapi/documented";
import { uuidParam } from "../../validators/common.validators";
import {
  invitationCreateResponse,
  invitationListResponse,
  invitationRevokeResponse,
} from "../../validators/invitation.responses";
import { apiError } from "../../validators/response.helpers";

const hono = new Hono<AppEnv>();
const app = documented(hono, { basePath: "/api/v1/agent/conversations", tag: "invitations" });

app.post(
  "/:id/invitations",
  {
    summary: "Invite a human to a conversation",
    params: uuidParam,
    body: createInvitationSchema,
    responses: { 201: invitationCreateResponse, 403: apiError, 409: apiError, 422: apiError },
    idempotent: true,
  },
  idempotency(),
  validateBody(createInvitationSchema),
  async (c) => {
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
        invitation.language,
        conversation.title || undefined,
      );
    }

    return c.json({ data: invitation }, 201);
  },
);

app.get(
  "/:id/invitations",
  {
    summary: "List invitations for a conversation",
    params: uuidParam,
    responses: { 200: invitationListResponse, 403: apiError },
  },
  async (c) => {
    const conversationId = c.req.param("id");
    const agentId = c.get("agentId");

    if (!(await isParticipant(conversationId, "agent", agentId))) {
      throw new ForbiddenError("Not a participant in this conversation");
    }

    const invitationList = await listConversationInvitations(conversationId);
    return c.json({ data: invitationList });
  },
);

app.delete(
  "/invitations/:id",
  {
    summary: "Revoke a pending invitation",
    description: "id here is the invitation id, not a conversation id.",
    params: uuidParam,
    responses: { 200: invitationRevokeResponse, 403: apiError, 404: apiError },
  },
  async (c) => {
    const invitationId = c.req.param("id");
    const agentId = c.get("agentId");
    const invitation = await revokeInvitation(invitationId, agentId);
    return c.json({ data: invitation });
  },
);

// The bare Hono, not the documented() facade — app.route(...) in src/app.ts
// needs a real Hono instance to mount.
export default hono;
