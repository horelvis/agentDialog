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

export function buildMagicLinkEmail(token: string, agentName?: string): EmailOptions & { to: string } {
  const e = env();
  const verifyUrl = `${e.APP_URL}/auth/verify?token=${token}`;

  return {
    to: "",
    subject: `${e.APP_NAME} - Sign in to your account`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>${e.APP_NAME}</h2>
        ${agentName ? `<p>Agent <strong>${agentName}</strong> has invited you to a conversation.</p>` : ""}
        <p>Click the link below to sign in:</p>
        <a href="${verifyUrl}" style="display: inline-block; padding: 12px 24px; background: #673ab7; color: white; text-decoration: none; border-radius: 6px;">
          Sign In
        </a>
        <p style="margin-top: 16px; color: #666; font-size: 14px;">
          This link expires in ${e.MAGIC_LINK_EXPIRY_MINUTES} minutes.
        </p>
        <p style="color: #999; font-size: 12px;">
          If you didn't request this, you can safely ignore this email.
        </p>
      </div>
    `,
    text: `Sign in to ${e.APP_NAME}: ${verifyUrl}\n\nThis link expires in ${e.MAGIC_LINK_EXPIRY_MINUTES} minutes.`,
  };
}
