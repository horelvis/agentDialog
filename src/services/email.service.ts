import { sendEmail, buildMagicLinkEmail } from "../lib/email";
import { env } from "../env";

export async function sendMagicLinkEmail(email: string, token: string, agentName?: string) {
  const template = buildMagicLinkEmail(token, agentName);
  template.to = email;
  return sendEmail(template);
}

export async function sendInvitationEmail(
  email: string,
  invitationToken: string,
  agentName: string,
  conversationTitle?: string,
) {
  const e = env();
  const acceptUrl = `${e.APP_URL}/app/invitations`;

  return sendEmail({
    to: email,
    subject: `${e.APP_NAME} - ${agentName} invited you to a conversation`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>${e.APP_NAME}</h2>
        <p>Agent <strong>${agentName}</strong> has invited you to join a conversation${conversationTitle ? `: <strong>${conversationTitle}</strong>` : ""}.</p>
        <a href="${acceptUrl}" style="display: inline-block; padding: 12px 24px; background: #2563eb; color: white; text-decoration: none; border-radius: 6px;">
          Accept Invitation
        </a>
        <p style="margin-top: 16px; color: #666; font-size: 14px;">
          If you don't want to join, simply ignore this email.
        </p>
      </div>
    `,
    text: `${agentName} invited you to a conversation on ${e.APP_NAME}. Accept: ${acceptUrl}`,
  });
}
