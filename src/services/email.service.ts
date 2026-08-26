import { sendEmail } from "../lib/email";
import { env } from "../env";
import { messagesFor } from "../i18n";

export async function sendVerificationCodeEmail(
  email: string,
  code: string,
  language: string,
  agentName?: string,
) {
  const m = messagesFor(language);
  const e = env();

  return sendEmail({
    to: email,
    subject: `${e.APP_NAME} - ${m.codeSubject}`,
    html: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>${m.codeHeading}</h2>
      ${agentName ? `<p>${m.codeIntro(agentName)}</p>` : ""}
      <div style="font-size: 32px; font-weight: 700; letter-spacing: 4px;">${code}</div>
      <p style="color: #666; font-size: 14px;">${m.codeExpiresIn(e.VERIFICATION_CODE_EXPIRY_MINUTES)}</p>
      <p style="color: #666; font-size: 14px;">${m.codeIgnore}</p>
    </div>`,
    text: `${m.codeHeading}: ${code}\n${m.codeExpiresIn(e.VERIFICATION_CODE_EXPIRY_MINUTES)}`,
  });
}

export async function sendInvitationEmail(
  email: string,
  invitationToken: string,
  agentName: string,
  language: string,
  conversationTitle?: string,
) {
  const m = messagesFor(language);
  const e = env();
  const acceptUrl = `${e.APP_URL}/app/invitations`;

  return sendEmail({
    to: email,
    subject: `${e.APP_NAME} - ${m.invitationSubject(agentName)}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>${e.APP_NAME}</h2>
        <p>${m.invitationIntro(agentName, conversationTitle)}</p>
        <a href="${acceptUrl}" style="display: inline-block; padding: 12px 24px; background: #2563eb; color: white; text-decoration: none; border-radius: 6px;">
          ${m.invitationAccept}
        </a>
        <p style="margin-top: 16px; color: #666; font-size: 14px;">
          ${m.invitationIgnore}
        </p>
      </div>
    `,
    text: `${agentName} invited you to a conversation on ${e.APP_NAME}. Accept: ${acceptUrl}`,
  });
}
