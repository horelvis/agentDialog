import { sendEmail } from "../lib/email";
import { buildReplyToAddress } from "../lib/reply-address";
import { env } from "../env";

interface SendQueryEmailInput {
  queryId: string;
  agentDisplayName: string;
  question: string;
  context?: string | null;
  queryType: string;
  targetEmail: string;
  expiresAt: Date;
  invitationToken: string;
}

const CONTEXT_MAX_LENGTH = 2000;

const QUERY_TYPE_LABELS: Record<string, string> = {
  validation: "Validation",
  interpretation: "Interpretation",
  expert_query: "Expert Query",
  labeling: "Labeling",
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatExpiry(date: Date): string {
  return date.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export async function sendQueryEmail(input: SendQueryEmailInput): Promise<boolean> {
  const e = env();
  const replyTo = buildReplyToAddress(input.queryId);
  const appUrl = `${e.APP_URL}/app/queries`;
  const typeLabel = QUERY_TYPE_LABELS[input.queryType] || input.queryType;

  let contextHtml = "";
  let contextText = "";
  if (input.context) {
    const truncated = input.context.length > CONTEXT_MAX_LENGTH
      ? input.context.slice(0, CONTEXT_MAX_LENGTH) + "... (see full context in app)"
      : input.context;
    contextHtml = `
      <div style="margin: 16px 0; padding: 12px 16px; background: #f8f9fa; border-left: 3px solid #dee2e6; border-radius: 4px;">
        <div style="font-size: 12px; color: #868e96; margin-bottom: 8px; font-weight: 600;">CONTEXT</div>
        <div style="color: #495057; font-size: 14px; white-space: pre-wrap;">${escapeHtml(truncated)}</div>
      </div>
    `;
    contextText = `\nContext:\n${truncated}\n`;
  }

  const subjectPreview = input.question.length > 60
    ? input.question.slice(0, 57) + "..."
    : input.question;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a1a;">
      <div style="padding: 24px; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px;">
        <div style="display: flex; align-items: center; margin-bottom: 20px;">
          <div style="width: 40px; height: 40px; background: #6366f1; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; margin-right: 12px;">
            <span style="color: white; font-size: 20px;">&#129302;</span>
          </div>
          <div>
            <div style="font-weight: 600; font-size: 16px;">${escapeHtml(input.agentDisplayName)}</div>
            <div style="color: #6b7280; font-size: 13px;">has a question for you</div>
          </div>
        </div>

        <div style="margin-bottom: 8px;">
          <span style="display: inline-block; padding: 2px 8px; background: #ede9fe; color: #6d28d9; border-radius: 4px; font-size: 12px; font-weight: 500;">${escapeHtml(typeLabel)}</span>
        </div>

        <div style="margin: 16px 0; padding: 16px; background: #fafafa; border-radius: 6px; border: 1px solid #f0f0f0;">
          <div style="font-size: 15px; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(input.question)}</div>
        </div>

        ${contextHtml}

        <div style="margin: 24px 0; padding: 16px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; text-align: center;">
          <div style="font-size: 15px; font-weight: 600; color: #166534;">Reply directly to this email to send your answer</div>
          <div style="font-size: 13px; color: #4ade80; margin-top: 4px;">Just hit reply and type your response</div>
        </div>

        <div style="text-align: center; margin: 16px 0;">
          <span style="color: #9ca3af; font-size: 13px;">or</span>
        </div>

        <div style="text-align: center; margin-bottom: 20px;">
          <a href="${appUrl}" style="display: inline-block; padding: 10px 20px; background: #6366f1; color: white; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 500;">
            Respond in the app
          </a>
        </div>

        <div style="border-top: 1px solid #f0f0f0; padding-top: 16px; color: #9ca3af; font-size: 12px; text-align: center;">
          Expires: ${escapeHtml(formatExpiry(input.expiresAt))}
        </div>
      </div>
    </div>
  `;

  const text = `${input.agentDisplayName} has a question for you

Type: ${typeLabel}

Question:
${input.question}
${contextText}
---
Reply directly to this email to send your answer.

Or respond in the app: ${appUrl}

Expires: ${formatExpiry(input.expiresAt)}
`;

  return sendEmail({
    to: input.targetEmail,
    subject: `[${e.APP_NAME}] ${subjectPreview} — Reply to respond`,
    html,
    text,
    replyTo,
  });
}
