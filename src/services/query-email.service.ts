import { sendEmail } from "../lib/email";
import { env } from "../env";
import { messagesFor, localeTag } from "../i18n";
import type { Subject } from "../admission/decidability";
import type { Change } from "../validators/query.validators";
import type { Messages } from "../i18n";

interface SendQueryEmailInput {
  queryId: string;
  agentDisplayName: string;
  question: string;
  context?: string | null;
  queryType: string;
  subject: Subject;
  changes?: Change[];
  targetEmail: string;
  expiresAt: Date;
  invitationToken: string;
  conversationId: string;
  grantToken?: string;
  language: string;
}

const CONTEXT_MAX_LENGTH = 2000;

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatExpiry(date: Date, language: string): string {
  return date.toLocaleString(localeTag(language), {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

const MATERIAL_CHANGES_MAX = 5;

/**
 * Names the subject and, if any changed materially since a prior decision,
 * lists them. It deliberately stops there: the answer space itself — the
 * options, the consequences, the fields to fill — only renders in the app,
 * where the human can actually act on it. An email that tried to reproduce
 * it would drift from what respondQuery accepts the moment either one changes.
 */
function subjectSummary(subject: Subject, m: Messages, changes?: Change[]): { html: string; text: string } {
  const material = (changes ?? []).filter((c) => c.materiality === "material");

  let changesHtml = "";
  let changesText = "";
  if (material.length > 0) {
    const shown = material.slice(0, MATERIAL_CHANGES_MAX);
    const remaining = material.length - shown.length;
    const itemsHtml = shown
      .map((c) => `<li>${escapeHtml(c.path)}: ${escapeHtml(c.before)} &rarr; ${escapeHtml(c.after)}</li>`)
      .join("");
    changesHtml = `
        <div style="margin-top: 8px; font-size: 12px; color: #868e96; font-weight: 600;">${m.whatChanged}</div>
        <ul style="margin: 4px 0 0; padding-left: 18px; font-size: 14px; color: #495057;">${itemsHtml}</ul>
        ${remaining > 0 ? `<div style="margin-top: 4px; font-size: 12px; color: #868e96;">${m.moreChanges(remaining)}</div>` : ""}
    `;
    changesText = m.whatChanged + "\n" + shown.map((c) => `  - ${c.path}: ${c.before} -> ${c.after}\n`).join("")
      + (remaining > 0 ? `  ${m.moreChanges(remaining)}\n` : "");
  }

  const html = `
      <div style="margin: 16px 0; padding: 12px 16px; background: #f8f9fa; border-left: 3px solid #6366f1; border-radius: 4px;">
        <div style="font-size: 12px; color: #868e96; font-weight: 600;">${m.about}</div>
        <div style="margin-top: 4px; font-size: 15px; font-weight: 500;">${escapeHtml(subject.label)}</div>
        ${changesHtml}
      </div>
  `;
  const text = `${m.about}: ${subject.label}\n${changesText}`;

  return { html, text };
}

export async function sendQueryEmail(input: SendQueryEmailInput): Promise<boolean> {
  const e = env();
  const m = messagesFor(input.language);
  // Not a per-query address: inbound email is not ingested, so a reply reaches
  // a person rather than the system. REPLY_TO_ADDRESS is a real mailbox with an
  // auto-responder pointing the sender back to the app. Unset means no Reply-To
  // at all, which is better than one nobody reads.
  const replyTo = e.REPLY_TO_ADDRESS;
  // With a grant, the link resolves the question in one click. Without one —
  // high and critical risk — it still carries context: it lands on the
  // conversation the question lives in, rather than a generic list.
  const appUrl = input.grantToken
    ? `${e.APP_URL}/q/${input.grantToken}`
    : `${e.APP_URL}/app/c/${input.conversationId}?email=${encodeURIComponent(input.targetEmail)}`;
  const typeLabel = m.queryType[input.queryType as keyof typeof m.queryType] || input.queryType;

  let contextHtml = "";
  let contextText = "";
  if (input.context) {
    const truncated = input.context.length > CONTEXT_MAX_LENGTH
      ? input.context.slice(0, CONTEXT_MAX_LENGTH) + m.contextTruncated
      : input.context;
    contextHtml = `
      <div style="margin: 16px 0; padding: 12px 16px; background: #f8f9fa; border-left: 3px solid #dee2e6; border-radius: 4px;">
        <div style="font-size: 12px; color: #868e96; margin-bottom: 8px; font-weight: 600;">${m.context}</div>
        <div style="color: #495057; font-size: 14px; white-space: pre-wrap;">${escapeHtml(truncated)}</div>
      </div>
    `;
    contextText = `\n${m.context}:\n${truncated}\n`;
  }

  const subjectPreview = input.question.length > 60
    ? input.question.slice(0, 57) + "..."
    : input.question;

  const about = subjectSummary(input.subject, m, input.changes);

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a1a;">
      <div style="padding: 24px; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px;">
        <div style="display: flex; align-items: center; margin-bottom: 20px;">
          <div style="width: 40px; height: 40px; background: #6366f1; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; margin-right: 12px;">
            <span style="color: white; font-size: 20px;">&#129302;</span>
          </div>
          <div>
            <div style="font-weight: 600; font-size: 16px;">${escapeHtml(input.agentDisplayName)}</div>
            <div style="color: #6b7280; font-size: 13px;">${m.hasAQuestionForYou}</div>
          </div>
        </div>

        <div style="margin-bottom: 8px;">
          <span style="display: inline-block; padding: 2px 8px; background: #ede9fe; color: #6d28d9; border-radius: 4px; font-size: 12px; font-weight: 500;">${escapeHtml(typeLabel)}</span>
        </div>

        ${about.html}

        <div style="margin: 16px 0; padding: 16px; background: #fafafa; border-radius: 6px; border: 1px solid #f0f0f0;">
          <div style="font-size: 15px; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(input.question)}</div>
        </div>

        ${contextHtml}

        <div style="text-align: center; margin: 24px 0 12px;">
          <a href="${appUrl}" style="display: inline-block; padding: 12px 24px; background: #6366f1; color: white; text-decoration: none; border-radius: 6px; font-size: 15px; font-weight: 600;">
            ${m.answerThisQuestion}
          </a>
        </div>

        <div style="text-align: center; margin-bottom: 20px;">
          <div style="font-size: 13px; color: #6b7280;">${m.noPasswordNote}</div>
          <div style="font-size: 12px; color: #9ca3af; margin-top: 6px;">${m.replyWillNotReach(escapeHtml(input.agentDisplayName))}</div>
        </div>

        <div style="border-top: 1px solid #f0f0f0; padding-top: 16px; color: #9ca3af; font-size: 12px; text-align: center;">
          ${m.expires(escapeHtml(formatExpiry(input.expiresAt, input.language)))}
        </div>
      </div>
    </div>
  `;

  const text = `${input.agentDisplayName} ${m.hasAQuestionForYou}

${m.typeLabel}: ${typeLabel}

${about.text}
${m.questionLabel}:
${input.question}
${contextText}
---
${m.answerThisQuestion}: ${appUrl}

${m.noPasswordNote}
${m.replyWillNotReach(input.agentDisplayName)}

${m.expires(formatExpiry(input.expiresAt, input.language))}
`;

  return sendEmail({
    to: input.targetEmail,
    subject: `[${e.APP_NAME}] ${subjectPreview}`,
    html,
    text,
    replyTo,
  });
}
