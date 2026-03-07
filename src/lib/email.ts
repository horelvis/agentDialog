import nodemailer from "nodemailer";
import { env } from "../env";

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (transporter) return transporter;
  const e = env();

  transporter = nodemailer.createTransport({
    host: e.SMTP_HOST,
    port: e.SMTP_PORT,
    secure: e.SMTP_SECURE,
    auth:
      e.SMTP_USER && e.SMTP_PASS
        ? { user: e.SMTP_USER, pass: e.SMTP_PASS }
        : undefined,
  });

  return transporter;
}

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  const e = env();

  try {
    const transport = getTransporter();

    const info = await transport.sendMail({
      from: e.SMTP_FROM,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });

    console.log(`[EMAIL] Sent to ${options.to} | messageId: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error("[EMAIL] Failed to send:", error);
    return false;
  }
}

export function buildVerificationCodeEmail(code: string, agentName?: string): EmailOptions & { to: string } {
  const e = env();

  return {
    to: "",
    subject: `${e.APP_NAME} - Your verification code`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>${e.APP_NAME}</h2>
        ${agentName ? `<p>Agent <strong>${agentName}</strong> has invited you to a conversation.</p>` : ""}
        <p>Your verification code is:</p>
        <div style="margin: 24px 0; text-align: center;">
          <span style="display: inline-block; padding: 16px 32px; background: #673ab7; color: white; font-size: 32px; font-weight: bold; letter-spacing: 8px; border-radius: 8px; font-family: monospace;">${code}</span>
        </div>
        <p style="color: #666; font-size: 14px;">
          Enter this code in the sign-in form to continue. It expires in ${e.VERIFICATION_CODE_EXPIRY_MINUTES} minutes.
        </p>
        <p style="color: #999; font-size: 12px;">
          If you didn't request this, you can safely ignore this email.
        </p>
      </div>
    `,
    text: `Your ${e.APP_NAME} verification code is: ${code}\n\nThis code expires in ${e.VERIFICATION_CODE_EXPIRY_MINUTES} minutes.`,
  };
}
