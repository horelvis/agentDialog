import { sendEmail } from "../lib/email";
import { env } from "../env";
import { messagesFor } from "../i18n";
import { escapeHtml } from "./query-email.service";

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
      ${agentName ? `<p>${m.codeIntro(escapeHtml(agentName))}</p>` : ""}
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
  const escapedAgentName = escapeHtml(agentName);
  const escapedTitle = conversationTitle ? escapeHtml(conversationTitle) : undefined;

  return sendEmail({
    to: email,
    // Subject line is a header, not HTML — leave unescaped
    subject: `${e.APP_NAME} - ${m.invitationSubject(agentName)}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>${e.APP_NAME}</h2>
        <p>${m.invitationIntro(escapedAgentName, escapedTitle)}</p>
        <a href="${acceptUrl}" style="display: inline-block; padding: 12px 24px; background: #2563eb; color: white; text-decoration: none; border-radius: 6px;">
          ${m.invitationAccept}
        </a>
        <p style="margin-top: 16px; color: #666; font-size: 14px;">
          ${m.invitationIgnore}
        </p>
      </div>
    `,
    text: `${m.invitationIntro(agentName, conversationTitle)}
${m.invitationAccept}: ${acceptUrl}

${m.invitationIgnore}`,
  });
}
