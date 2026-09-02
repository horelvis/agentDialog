import { z } from "zod";
import { ok } from "./response.helpers";
import { invitationStatusEnum } from "../db/schema/enums";
import { SUPPORTED_LANGUAGES } from "../i18n";

/**
 * Read off createInvitation / listConversationInvitations / revokeInvitation
 * in src/services/invitation.service.ts. The row shape matches
 * src/db/schema/invitations.ts exactly, unshaped — including `token`, which
 * the create response returns in full even though it exists in readable form
 * for exactly that one moment (see docs/api/README.md's note on /q/:token and
 * mintQueryGrant for the same pattern on the query side).
 *
 * `message` is nullable because createInvitationSchema treats it as optional
 * input with no column default.
 */
const invitationRow = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  invitedByAgentId: z.string().uuid(),
  invitedHumanEmail: z.string(),
  token: z.string(),
  status: z.enum(invitationStatusEnum.enumValues),
  message: z.string().nullable(),
  language: z.enum(SUPPORTED_LANGUAGES),
  expiresAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

/**
 * POST /:id/invitations only: createInvitation adds `autoAccepted`, which is
 * not a column — it reflects whether tryAutoAccept found a prior accepted
 * invitation from this agent to this human with no trust revocation since.
 * When it did, `status` in the response is forced to "accepted" even though
 * the row inserted moments earlier still said "pending" until the auto-accept
 * branch updated it.
 */
export const invitationCreateResponse = ok(
  invitationRow.extend({ autoAccepted: z.boolean() }),
);

/**
 * GET /:id/invitations: listConversationInvitations returns the bare rows
 * from db.select(), with no `autoAccepted` key at all.
 */
export const invitationListResponse = ok(z.array(invitationRow));

/**
 * DELETE /invitations/:id: revokeInvitation's `.returning()` on the same
 * update that sets status to "revoked", so this reports the row as it now
 * stands, not the "pending" one the ownership/state check read beforehand.
 */
export const invitationRevokeResponse = ok(invitationRow);
