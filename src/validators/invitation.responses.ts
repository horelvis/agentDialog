import { z } from "zod";
import { ok } from "./response.helpers";

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
  status: z.enum(["pending", "accepted", "declined", "expired", "revoked"]),
  message: z.string().nullable(),
  language: z.string(),
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
 * DELETE /invitations/:id: revokeInvitation returns the row it fetched
 * *before* updating the status column, not a re-read of the row it just
 * wrote — so `status` in this response is still "pending", the value the
 * ownership/state check required it to have, even though the database now
 * says "revoked".
 */
export const invitationRevokeResponse = ok(invitationRow);
